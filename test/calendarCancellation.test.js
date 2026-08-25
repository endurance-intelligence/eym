import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { Buffer } from "node:buffer";
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

test("calendar subscription applies the same cancellation filter and exposes Apple-friendly feed semantics", () => {
  const source = fs.readFileSync(new URL("../supabase/functions/calendar/index.ts", import.meta.url), "utf8");
  assert.match(source, /isCalendarItemVisible\(item\)/);
  assert.match(source, /!item\.missedReason/);
  assert.match(source, /!item\.plannedCancellation/);
  assert.match(source, /!item\.cancelledAt/);
  assert.match(source, /Cache-Control.*public, max-age=0, must-revalidate/);
  assert.match(source, /request.method !== "GET" && request.method !== "HEAD"/);
  assert.match(source, /if-none-match/);
  assert.match(source, /status: 304/);
  assert.match(source, /X-EI-Calendar-Version/);
  assert.match(source, /eventDate\(item\)/);
  assert.match(source, /dateForWeekday\(item\.day\)/);
  assert.match(source, /X-WR-REFRESH-INTERVAL;VALUE=DURATION:PT15M/);
  assert.match(source, /LAST-MODIFIED/);
  assert.match(source, /searchParams\.get\("status"\) === "1"/);
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
  assert.match(source, /raceProtocolCalendarEvents\(\{ \.\.\.item, date: rawDate \}, stamp, sequence\)/);
  assert.match(source, /protocol\?\.calendarReminders/);
  assert.match(source, /DURATION:PT15M/);
  assert.match(source, /DTSTART:\$\{start\}/);
});

test("downloaded ICS advertises refresh metadata for calendar clients", () => {
  const content = buildCalendar([normal]);
  assert.match(content, /X-PUBLISHED-TTL:PT15M/);
  assert.match(content, /REFRESH-INTERVAL;VALUE=DURATION:PT15M/);
  assert.match(content, /LAST-MODIFIED:/);
});


test("calendar subscription config stays public for Apple and the client uses a .ics feed URL", () => {
  const config = fs.readFileSync(new URL("../supabase/config.toml", import.meta.url), "utf8");
  const service = fs.readFileSync(new URL("../src/services/supabase.js", import.meta.url), "utf8");
  assert.match(config, /\[functions\.calendar\][\s\S]*verify_jwt\s*=\s*false/);
  assert.match(service, /calendar\/feed\.ics\?token=/);
});

test("generated ICS uses deterministic fallback UIDs and RFC line folding", () => {
  const anonymous = {
    date: "2026-08-25",
    title: "Sehr langer Trainingsname für Apple Kalender mit Umlauten und Emoji 🏃‍♂️ sowie zusätzlichen Hinweisen",
    type: "Easy Run",
    notes: "A".repeat(180),
  };
  const first = buildCalendar([anonymous]);
  const second = buildCalendar([anonymous]);
  const uid1 = first.match(/UID:(plan-[0-9a-f]+)@endurance-intelligence/)?.[1];
  const uid2 = second.match(/UID:(plan-[0-9a-f]+)@endurance-intelligence/)?.[1];
  assert.ok(uid1);
  assert.equal(uid1, uid2);
  for (const line of first.split("\r\n").filter(Boolean)) {
    assert.ok(Buffer.byteLength(line, "utf8") <= 75, `ICS line exceeds 75 bytes: ${line}`);
  }
});
