import test from "node:test";
import assert from "node:assert/strict";
import { buildTrainingAnalytics, runningIntensity } from "../src/services/trainingAnalytics.js";

function run(id, date, distance, name = "Easy Run", extras = {}) {
  return {
    id,
    date,
    startDateLocal: `${date}T08:00:00`,
    type: "Run",
    name,
    distance,
    duration: distance * 6,
    ...extras,
  };
}

test("training analytics builds weekly volume, adherence and goal specificity from athlete data", () => {
  const now = new Date("2026-07-24T12:00:00");
  const state = {
    activities: [
      run("r1", "2026-06-15", 10),
      run("r2", "2026-06-22", 12),
      run("r3", "2026-06-29", 18, "Long Run"),
      run("r4", "2026-07-06", 8),
      run("r5", "2026-07-07", 7),
      run("r6", "2026-07-13", 22, "Long Run"),
      run("r7", "2026-07-20", 9, "Intervalle"),
    ],
    activityGroups: [],
    reviews: {
      r6: { legs: 7, energy: 7, overallFeeling: 8, carbohydratesPerHour: 55, carbohydrateStatus: "good" },
    },
    plan: [
      { id: "p1", date: "2026-07-20", title: "9 km Intervalle", type: "Intervalle", distance: 9, completed: true },
      { id: "p2", date: "2026-07-22", title: "8 km locker", type: "Easy Run", distance: 8, completed: false },
    ],
    mission: {
      id: "goal",
      name: "100 km Ultra",
      date: "2026-11-21",
      targetKm: 100,
      milestones: [{ id: "goal", name: "100 km Ultra", date: "2026-11-21", targetKm: 100, isMainTarget: true }],
    },
    intervals: {},
  };

  const result = buildTrainingAnalytics(state, now, 8);
  assert.equal(result.weeks.length, 8);
  assert.equal(result.metrics.runs, 7);
  assert.equal(result.metrics.longRuns, 2);
  assert.equal(result.metrics.backToBackBlocks, 1);
  assert.equal(result.metrics.planAdherence, 0.5);
  assert.equal(result.metrics.fuelInRange, 1);
  assert.equal(result.goal.discipline, "ultra");
  assert.ok(result.specificity.score > 0);
});

test("running intensity keeps quality and long sessions separate from easy runs", () => {
  assert.equal(runningIntensity(run("easy", "2026-07-01", 8, "8 km locker")), "easy");
  assert.equal(runningIntensity(run("quality", "2026-07-02", 8, "ORC Track – Intervalle")), "quality");
  assert.equal(runningIntensity(run("long", "2026-07-03", 24, "Sonntagslauf")), "long");
});
