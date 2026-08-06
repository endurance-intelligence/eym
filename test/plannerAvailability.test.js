import test from "node:test";
import assert from "node:assert/strict";
import {
  availabilityForDate,
  blockedAvailabilityDates,
  normalizeAvailabilityExceptions,
  removeAvailabilityException,
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
