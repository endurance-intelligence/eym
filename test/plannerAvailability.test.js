import test from "node:test";
import assert from "node:assert/strict";
import {
  availabilityForDate,
  blockedAvailabilityDates,
  normalizeAvailabilityExceptions,
  planningConstraintsFromNote,
  removeAvailabilityException,
  runningRestrictedAvailabilityDates,
  upsertAvailabilityException,
} from "../src/services/plannerAvailability.js";

test("availability exceptions keep the newest entry per date", () => {
  const normalized = normalizeAvailabilityExceptions([
    { id: "old", date: "2026-08-08", status: "blocked", reason: "Arbeit", updatedAt: "2026-08-01T08:00:00.000Z" },
    { id: "new", date: "2026-08-08", status: "blocked", reason: "Familie", note: "Ausflug", updatedAt: "2026-08-02T08:00:00.000Z" },
    { id: "invalid", date: "morgen", status: "blocked" },
  ]);

  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].id, "new");
  assert.equal(normalized[0].reason, "Familie");
  assert.equal(normalized[0].note, "Ausflug");
});

test("availability entries can be added, queried and removed", () => {
  const added = upsertAvailabilityException([], {
    id: "family-day",
    date: "2026-08-08",
    reason: "Familie",
    note: "Ganzer Tag unterwegs",
  });

  assert.equal(availabilityForDate(added, "2026-08-08")?.reason, "Familie");
  assert.deepEqual([...blockedAvailabilityDates(added, "2026-08-03", "2026-08-09")], ["2026-08-08"]);
  assert.deepEqual(removeAvailabilityException(added, "2026-08-08"), []);
});


test("planning note blocks Tuesday even when the normal weekly availability would allow running", () => {
  const constraints = planningConstraintsFromNote(
    "Dienstag 7–8 Stunden Autofahrt, Training zeitlich nicht möglich.",
    new Date("2026-08-17T12:00:00"),
  );

  assert.equal(constraints.length, 1);
  assert.equal(constraints[0].date, "2026-08-18");
  assert.equal(constraints[0].status, "blocked");
  assert.equal(constraints[0].reason, "Reise");
  assert.equal(constraints[0].noDouble, true);
  assert.deepEqual([...blockedAvailabilityDates(constraints, "2026-08-17", "2026-08-23")], ["2026-08-18"]);
});

test("planning note turns a maximum twenty minute travel window into a recovery-only running constraint", () => {
  const constraints = planningConstraintsFromNote(
    "Donnerstag 7–8 Stunden Autofahrt, maximal 15–20 Minuten sehr lockere Aktivierung möglich.",
    "2026-08-17",
  );

  assert.equal(constraints.length, 1);
  assert.equal(constraints[0].date, "2026-08-20");
  assert.equal(constraints[0].status, "available");
  assert.equal(constraints[0].maxDurationMinutes, 20);
  assert.equal(constraints[0].recoveryOnly, true);
  assert.equal(constraints[0].noRunning, true);
  assert.equal(constraints[0].noDouble, true);
  assert.deepEqual([...runningRestrictedAvailabilityDates(constraints, "2026-08-17", "2026-08-23")], ["2026-08-20"]);
});

test("generic travel, flight and all-day wording maps into the existing availability model", () => {
  const constraints = planningConstraintsFromNote(
    "Montag ganztägiger Termin, keine Zeit. Mittwoch Flugreise 6 Stunden, nur regenerativ möglich. Samstag maximal 25 Minuten möglich.",
    "2026-08-17",
  );

  assert.deepEqual(constraints.map((entry) => [entry.date, entry.status, entry.maxDurationMinutes || null, entry.recoveryOnly]), [
    ["2026-08-17", "blocked", null, false],
    ["2026-08-19", "available", 20, true],
    ["2026-08-22", "available", 25, true],
  ]);
});
