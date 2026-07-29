import test from "node:test";
import assert from "node:assert/strict";
import { activityCoachAssessment } from "../src/services/activityCoach.js";

test("activity coach leads with one clear summary and keeps the next consequence explicit", () => {
  const activity = {
    id: "long",
    type: "Run",
    name: "Long Run",
    date: "2026-07-26",
    distance: 22,
    duration: 140,
    temperature: 28,
  };
  const state = {
    activities: [
      activity,
      { id: "easy", type: "Run", name: "Easy Run", date: "2026-07-20", distance: 7, duration: 42 },
    ],
    reviews: {},
    plan: [{ id: "planned", date: "2026-07-26", title: "22 km Long Run", type: "Long Run", distance: 22, duration: 140 }],
    profile: {},
    mission: {},
  };

  const result = activityCoachAssessment(state, activity, {
    legs: 8,
    energy: 8,
    overallFeeling: 8,
    rpe: 7,
  }, { temperature: 28 });

  assert.match(result.summary, /Belastung/);
  assert.match(result.summary, /geplanten Rahmen/);
  assert.match(result.summary, /28 °C/);
  assert.match(result.summary, /nächsten .* h/);
  assert.match(result.comparison, /gut vertragen/);
});

test("activity coach calls out selected stomach symptoms instead of claiming good tolerance", () => {
  const activity = {
    id: "track",
    type: "Run",
    name: "ORC Track",
    date: "2026-07-28",
    distance: 13.3,
    duration: 75,
    avgHr: 150,
  };
  const state = {
    activities: [activity],
    reviews: {},
    plan: [{ id: "planned-track", date: "2026-07-28", title: "ORC Track", type: "Schwellenlauf", distance: 14, duration: 90 }],
    profile: {},
    mission: {},
  };

  const result = activityCoachAssessment(state, activity, {
    legs: 8,
    energy: 8,
    overallFeeling: 8,
    rpe: 9,
    stomachSymptoms: ["Aufstoßen", "Blähungen"],
  });

  assert.match(result.comparison, /Aufstoßen, Blähungen/);
  assert.match(result.comparison, /Gel-Timing/);
  assert.doesNotMatch(result.comparison, /gut vertragen/);
});

test("training-like C event does not create an automatic event recovery pause", () => {
  const activity = {
    id: "c-event",
    type: "Run",
    name: "7. UrLand-Lauf Oerlinghausen",
    date: "2026-08-21",
    distance: 9.6,
    duration: 52,
    avgHr: 164,
  };
  const state = {
    activities: [activity],
    reviews: {},
    plan: [{
      id: "planned-event",
      date: "2026-08-21",
      title: "7. UrLand-Lauf Oerlinghausen",
      type: "Wettkampf",
      distance: 9.6,
      duration: 52,
      raceEvent: true,
      goalPriority: "C",
    }],
    profile: {},
    mission: {},
  };

  const result = activityCoachAssessment(state, activity, {
    isEvent: true,
    eventPlanningImpact: "training",
    legs: 8,
    energy: 8,
    overallFeeling: 8,
    rpe: 9,
  });

  assert.equal(result.recovery.value, "Normal weiter");
  assert.match(result.summary, /zusätzliche Eventpause ist nicht nötig/i);
  assert.match(result.comparison, /Eventstatus allein bremst die Folgewoche daher nicht/);
});

test("depleted event review overrides a generic recovery estimate without imposing a fixed five-day pause", () => {
  const activity = {
    id: "hard-event",
    type: "Run",
    name: "Backyard Ultra",
    date: "2026-09-26",
    distance: 100,
    duration: 780,
  };
  const state = {
    activities: [activity],
    reviews: {},
    plan: [{
      id: "planned-event",
      date: "2026-09-26",
      title: "Backyard Ultra",
      type: "Wettkampf",
      distance: 100,
      duration: 780,
      raceEvent: true,
      goalPriority: "B",
    }],
    profile: {},
    mission: {},
  };

  const result = activityCoachAssessment(state, activity, {
    isEvent: true,
    eventPlanningImpact: "depleted",
    legs: 7,
    energy: 7,
    overallFeeling: 6,
    rpe: 9,
  });

  assert.equal(result.recovery.value, "48 h+ prüfen");
  assert.match(result.recovery.text, /nicht nach einer pauschalen Eventpause/i);
  assert.doesNotMatch(result.summary, /5 Tage/i);
});
