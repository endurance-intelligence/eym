import test from "node:test";
import assert from "node:assert/strict";
import {
  availabilityForDate,
  blockedAvailabilityDates,
  normalizeAvailabilityExceptions,
  planningConstraintsFromNote,
  planningNoteForWeek,
  removeAvailabilityException,
  runningRestrictedAvailabilityDates,
  upsertAvailabilityException,
  upsertPlanningCheckinRecord,
  weeklyContextException,
  availabilityExceptionsForWeek,
  replaceAvailabilityExceptionsForWeek,
  mergeAvailabilityExceptions,
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

test("shared weekday wording applies the same travel constraint to every named day", () => {
  const constraints = planningConstraintsFromNote(
    "Dienstag und Donnerstag Reisestress",
    "2026-08-17",
  );

  assert.deepEqual(constraints.map((entry) => [entry.date, entry.reason, entry.noRunning, entry.noDouble]), [
    ["2026-08-18", "Reise", true, true],
    ["2026-08-20", "Reise", true, true],
  ]);
});

test("weekday abbreviations keep a shared long-travel constraint generic", () => {
  const constraints = planningConstraintsFromNote(
    "Di. und Do. lange Autofahrt",
    "2026-08-17",
  );

  assert.deepEqual(constraints.map((entry) => entry.date), ["2026-08-18", "2026-08-20"]);
  assert.ok(constraints.every((entry) => entry.noRunning && entry.noDouble));
});

test("replanning keeps the saved note for the same week but does not leak it into a fresh week", () => {
  const records = [
    { weekStart: "2026-08-17", checkin: { notes: "Dienstag Training nicht möglich." } },
    { weekStart: "2026-08-10", checkin: { notes: "Alte Notiz" } },
  ];

  assert.equal(planningNoteForWeek(records, new Date("2026-08-17T12:00:00"), "replan"), "Dienstag Training nicht möglich.");
  assert.equal(planningNoteForWeek(records, "2026-08-24", "replan"), "");
  assert.equal(planningNoteForWeek(records, "2026-08-17", "create"), "Dienstag Training nicht möglich.");
});

test("planning preview check-in is upserted per week so a cancelled preview keeps its note", () => {
  const original = [
    { id: "old-week", weekStart: "2026-08-10", checkin: { notes: "Alte Woche" } },
    { id: "old-draft", weekStart: "2026-08-17", checkin: { notes: "Dienstag Reisestress" } },
  ];
  const next = upsertPlanningCheckinRecord(original, {
    id: "new-draft",
    weekStart: "2026-08-17",
    checkin: { notes: "Dienstag Training nicht möglich. Donnerstag maximal 20 Minuten locker." },
  });

  assert.equal(next.length, 2);
  assert.equal(next[0].id, "new-draft");
  assert.equal(planningNoteForWeek(next, "2026-08-17", "create"), "Dienstag Training nicht möglich. Donnerstag maximal 20 Minuten locker.");
  assert.equal(planningNoteForWeek(next, "2026-08-24", "create"), "");
});

test("natural Auto fahren wording is treated as long travel for every named weekday", () => {
  const constraints = planningConstraintsFromNote(
    "Dienstag und Donnerstag 7–8 Stunden Auto fahren, da ich beruflich in die Schweiz muss.",
    "2026-08-17",
  );

  assert.deepEqual(constraints.map((entry) => [entry.date, entry.reason, entry.recoveryOnly, entry.maxDurationMinutes || null, entry.noRunning]), [
    ["2026-08-18", "Reise", false, null, true],
    ["2026-08-20", "Reise", false, null, true],
  ]);
});

test("multiple clauses for the same weekday merge to the strictest planning constraint", () => {
  const constraints = planningConstraintsFromNote(
    "Dienstag lange Auto fahren. Dienstag Training zeitlich nicht möglich. Donnerstag lange Auto fahren. Donnerstag maximal 15–20 Minuten sehr lockere Aktivierung möglich.",
    "2026-08-17",
  );

  assert.equal(constraints.length, 2);
  const tuesday = constraints.find((entry) => entry.date === "2026-08-18");
  const thursday = constraints.find((entry) => entry.date === "2026-08-20");
  assert.equal(tuesday?.status, "blocked");
  assert.equal(tuesday?.noDouble, true);
  assert.equal(thursday?.recoveryOnly, true);
  assert.equal(thursday?.noRunning, true);
  assert.equal(thursday?.maxDurationMinutes, 20);
});


test("structured weekly travel context uses the existing availability model and overrides normal run availability", () => {
  const exception = weeklyContextException({
    date: "2026-08-18",
    contextKey: "travel",
    restriction: "recovery",
    maxDurationMinutes: 20,
    note: "7–8 h Autofahrt",
  });

  assert.equal(exception.source, "weekly-context");
  assert.equal(exception.reason, "Reise");
  assert.equal(exception.status, "available");
  assert.equal(exception.recoveryOnly, true);
  assert.equal(exception.noRunning, true);
  assert.equal(exception.noDouble, true);
  assert.equal(exception.maxDurationMinutes, 20);
  assert.deepEqual([...runningRestrictedAvailabilityDates([exception], "2026-08-17", "2026-08-23")], ["2026-08-18"]);
});

test("weekly context replacement clears stale inferred constraints for only the selected week", () => {
  const existing = [
    { id: "manual-18", date: "2026-08-18", status: "blocked", reason: "Familie", source: "manual" },
    { id: "note-20", date: "2026-08-20", status: "available", reason: "Reise", noRunning: true, source: "planning-note" },
    { id: "weekly-22", date: "2026-08-22", status: "available", reason: "Arbeit", maxDurationMinutes: 30, source: "weekly-context", contextKey: "work" },
    { id: "next-week", date: "2026-08-25", status: "available", reason: "Reise", noRunning: true, source: "weekly-context", contextKey: "travel" },
  ];
  const replacement = weeklyContextException({ date: "2026-08-20", contextKey: "travel", restriction: "recovery", maxDurationMinutes: 15 });
  const next = replaceAvailabilityExceptionsForWeek(existing, [replacement], "2026-08-17", ["weekly-context", "planning-note"]);

  assert.equal(availabilityExceptionsForWeek(next, "2026-08-17", ["planning-note"]).length, 0);
  assert.equal(availabilityExceptionsForWeek(next, "2026-08-17", ["weekly-context"]).length, 1);
  assert.equal(availabilityForDate(next, "2026-08-18")?.source, "manual");
  assert.equal(availabilityForDate(next, "2026-08-20")?.maxDurationMinutes, 15);
  assert.equal(availabilityForDate(next, "2026-08-25")?.contextKey, "travel");
});

test("explicit weekly context wins source ownership while keeping stricter free-text restrictions", () => {
  const structured = weeklyContextException({ date: "2026-08-18", contextKey: "travel", restriction: "recovery", maxDurationMinutes: 20 });
  const inferred = planningConstraintsFromNote("Dienstag Training zeitlich nicht möglich.", "2026-08-17")[0];
  const [merged] = mergeAvailabilityExceptions([structured], [inferred]);

  assert.equal(merged.source, "weekly-context");
  assert.equal(merged.contextKey, "travel");
  assert.equal(merged.status, "blocked");
  assert.equal(merged.noRunning, true);
});

test("a manual day block remains authoritative when weekly context is added on the same date", () => {
  const manual = { id: "manual", date: "2026-08-18", status: "blocked", reason: "Familie", source: "manual" };
  const weekly = weeklyContextException({ date: "2026-08-18", contextKey: "travel", restriction: "recovery", maxDurationMinutes: 20 });
  const [merged] = mergeAvailabilityExceptions([manual], [weekly]);

  assert.equal(merged.status, "blocked");
  assert.equal(merged.source, "manual");
  assert.equal(merged.noRunning, true);
});
