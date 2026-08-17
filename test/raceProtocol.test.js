import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRaceProtocol,
  normalizeRaceProtocolSettings,
  RACE_PROTOCOL_MODES,
} from "../src/services/raceProtocol.js";

function protocol(event, settings = {}, extras = {}) {
  return buildRaceProtocol({
    event,
    settings: normalizeRaceProtocolSettings(settings),
    athleteProfile: extras.athleteProfile || { weightKg: 77 },
    racePrepPlan: extras.racePrepPlan || null,
  });
}

test("Auto leaves a short C race alone instead of forcing race-day support", () => {
  const result = protocol({ id: "five-k", name: "5 km Trainingsrace", date: "2026-08-30", time: "10:00", targetKm: 5, priority: "C" });

  assert.equal(result.enabled, false);
  assert.equal(result.variant, "none");
  assert.match(result.recommendation.label, /nicht nötig/i);
  assert.deepEqual(result.timeline, []);
});

test("a short C race can still receive the full protocol when the athlete explicitly asks for it", () => {
  const result = protocol(
    { id: "five-k", name: "5 km Trainingsrace", date: "2026-08-30", time: "10:00", targetKm: 5, priority: "C" },
    { mode: RACE_PROTOCOL_MODES.ON },
  );

  assert.equal(result.enabled, true);
  assert.equal(result.variant, "full");
  assert.ok(result.timeline.some((step) => step.key === "meal"));
  assert.ok(result.timeline.some((step) => step.key === "warmup"));
});

test("Auto gives a later 9.6 km C race a full protocol with optional activation", () => {
  const result = protocol({ id: "urlaender", name: "UrLand-Lauf", date: "2026-08-21", time: "18:00", targetKm: 9.6, priority: "C" });

  assert.equal(result.variant, "full");
  assert.equal(result.activationDecision.recommended, true);
  assert.ok(result.timeline.some((step) => step.key === "meal" && step.time === "14:30"));
  assert.ok(result.timeline.some((step) => step.key === "hydration" && step.time === "16:30"));
  assert.ok(result.timeline.some((step) => step.key === "activation" && step.optional));
  assert.ok(result.timeline.some((step) => step.key === "warmup"));
  assert.ok(result.timeline.some((step) => step.key === "strides"));
});

test("an early race never creates a separate pre-dawn race-day activation", () => {
  const result = protocol({ id: "early", name: "Früher 10er", date: "2026-08-21", time: "08:00", targetKm: 10, priority: "B" });

  assert.equal(result.variant, "full");
  assert.equal(result.activationDecision.recommended, false);
  assert.match(result.activationDecision.reason, /Früher Start/i);
  assert.equal(result.timeline.some((step) => step.key === "activation"), false);
  assert.ok(result.timeline.some((step) => step.key === "warmup"));
});

test("the athlete can explicitly switch race protocol off", () => {
  const result = protocol(
    { id: "race", name: "10 km Race", date: "2026-08-21", time: "18:00", targetKm: 10, priority: "A" },
    { mode: RACE_PROTOCOL_MODES.OFF },
  );

  assert.equal(result.enabled, false);
  assert.equal(result.variant, "none");
  assert.deepEqual(result.timeline, []);
  assert.deepEqual(result.calendarItems, []);
});

test("calendar reminders are opt-in and capped at two useful race-day checkpoints", () => {
  const event = { id: "urlaender", name: "UrLand-Lauf", date: "2026-08-21", time: "18:00", targetKm: 9.6, priority: "C" };
  const off = protocol(event);
  const on = protocol(event, { components: { calendarReminders: true } });

  assert.equal(off.calendarReminders, false);
  assert.deepEqual(off.calendarItems, []);
  assert.equal(on.calendarReminders, true);
  assert.equal(on.calendarItems.length, 2);
  assert.deepEqual(on.calendarItems.map((item) => item.key), ["fueling", "prep"]);
  assert.equal(on.calendarItems[0].time, "14:30");
  assert.equal(on.calendarItems[1].time, "17:20");
});

test("pre-race drink reminder is personalized instead of a fixed millilitre constant", () => {
  const event = { id: "race", name: "10 km Race", date: "2026-08-21", time: "18:00", targetKm: 10, priority: "B" };
  const light = protocol(event, {}, { athleteProfile: { weightKg: 55 } });
  const heavier = protocol(event, {}, { athleteProfile: { weightKg: 95 } });

  assert.equal(light.hydrationReminderMl, 150);
  assert.equal(heavier.hydrationReminderMl, 250);
  assert.notEqual(light.hydrationReminderMl, heavier.hydrationReminderMl);
  assert.match(heavier.timeline.find((step) => step.key === "hydration")?.detail || "", /Reminder, keine Trinkpflicht/i);
});


test("same-day travel suppresses optional activation but keeps the pre-race warm-up", () => {
  const result = buildRaceProtocol({
    event: { id: "travel-race", name: "Abendrace", date: "2026-08-21", time: "18:00", targetKm: 10, priority: "B" },
    settings: normalizeRaceProtocolSettings({ mode: "auto" }),
    athleteProfile: { weightKg: 77 },
    dayContext: { status: "available", reason: "Reise", noRunning: true, noDouble: true },
  });

  assert.equal(result.activationDecision.recommended, false);
  assert.match(result.activationDecision.reason, /Reise/i);
  assert.equal(result.timeline.some((step) => step.key === "activation"), false);
  assert.equal(result.timeline.some((step) => step.key === "warmup"), true);
});
