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

test("race protocol calendar reminders are opt-in, timed and limited to the prepared checkpoints", () => {
  const race = {
    id: "race-1",
    date: "2026-08-21",
    title: "UrLand-Lauf",
    type: "Wettkampf",
    raceEvent: true,
    distance: 9.6,
    raceProtocol: {
      calendarReminders: true,
      calendarItems: [
        { key: "fueling", time: "14:30", title: "🥣 Pre-Race Fueling starten", detail: "Mahlzeit und Trink-Check" },
        { key: "prep", time: "17:20", title: "🏁 Race Prep starten", detail: "Warm-up und Strides" },
      ],
    },
  };
  const content = buildCalendar([race]);

  assert.match(content, /UID:race-1-fueling@endurance-intelligence/);
  assert.match(content, /DTSTART:20260821T143000/);
  assert.match(content, /UID:race-1-prep@endurance-intelligence/);
  assert.match(content, /DTSTART:20260821T172000/);
  assert.match(content, /SUMMARY:🥣 Pre-Race Fueling starten/);
  assert.match(content, /SUMMARY:🏁 Race Prep starten/);
  assert.equal((content.match(/UID:race-1-(?:fueling|prep)@endurance-intelligence/g) || []).length, 2);
});

test("race protocol does not create calendar noise when reminders are disabled", () => {
  const race = {
    id: "race-2",
    date: "2026-08-21",
    title: "5 km Race",
    type: "Wettkampf",
    raceEvent: true,
    distance: 5,
    raceProtocol: {
      calendarReminders: false,
      calendarItems: [{ key: "prep", time: "07:20", title: "Race Prep", detail: "Warm-up" }],
    },
  };
  const content = buildCalendar([race]);

  assert.match(content, /UID:race-2@endurance-intelligence/);
  assert.doesNotMatch(content, /UID:race-2-prep@endurance-intelligence/);
});

test("calendar subscription includes the same race protocol reminder expansion", () => {
  const source = fs.readFileSync(new URL("../supabase/functions/calendar/index.ts", import.meta.url), "utf8");
  assert.match(source, /raceProtocolCalendarEvents\(item, stamp\)/);
  assert.match(source, /protocol\?\.calendarReminders/);
  assert.match(source, /DURATION:PT15M/);
  assert.match(source, /DTSTART:\$\{start\}/);
});
