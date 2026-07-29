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
