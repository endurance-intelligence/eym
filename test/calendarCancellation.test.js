import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildCalendar, isCalendarItemVisible } from "../src/services/calendar.js";

const normal = { id: "easy", date: "2026-08-12", title: "6 km locker", type: "Easy Run", distance: 6 };

test("cancelled and missed workouts are excluded from generated ICS calendars", () => {
  const cancelled = { ...normal, id: "cancelled", missedReason: "Termin fiel aus", plannedCancellation: true, cancelledAt: "2026-08-10T12:00:00.000Z" };
  const missed = { ...normal, id: "missed", missedReason: "Keine Zeit" };
  const placeholder = { ...normal, id: "placeholder", missedMeta: { plannedCancellation: true } };
  const content = buildCalendar([normal, cancelled, missed, placeholder]);

  assert.equal(isCalendarItemVisible(normal), true);
  assert.equal(isCalendarItemVisible(cancelled), false);
  assert.equal(isCalendarItemVisible(missed), false);
  assert.equal(isCalendarItemVisible(placeholder), false);
  assert.match(content, /UID:easy@endurance-intelligence/);
  assert.doesNotMatch(content, /UID:cancelled@endurance-intelligence/);
  assert.doesNotMatch(content, /UID:missed@endurance-intelligence/);
  assert.doesNotMatch(content, /UID:placeholder@endurance-intelligence/);
});

test("calendar subscription applies the same cancellation filter and disables response caching", () => {
  const source = fs.readFileSync(new URL("../supabase/functions/calendar/index.ts", import.meta.url), "utf8");
  assert.match(source, /isCalendarItemVisible\(item\)/);
  assert.match(source, /!item\.missedReason/);
  assert.match(source, /!item\.plannedCancellation/);
  assert.match(source, /!item\.cancelledAt/);
  assert.match(source, /Cache-Control.*no-store, max-age=0/);
});
