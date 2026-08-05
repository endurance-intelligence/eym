import test from "node:test";
import assert from "node:assert/strict";
import { buildAnalyticsIntelligence } from "../src/services/analyticsIntelligence.js";
import { buildTrainingAnalytics } from "../src/services/trainingAnalytics.js";

function run(id, date, distance, name = "Easy Run", extras = {}) {
  return {
    id,
    date,
    startDateLocal: `${date}T08:00:00`,
    type: "Run",
    name,
    distance,
    duration: distance * 6,
    avgHr: 140,
    ...extras,
  };
}

const mission = {
  milestones: [
    { id: "backyard", name: "Backyard Ultra", date: "2026-09-26", targetMinKm: 60, targetMaxKm: 80, priority: "B" },
    { id: "heartbeat", name: "Heartbeat Ultra Fulda", date: "2026-11-22", targetKm: 112, priority: "A", isMainTarget: true },
  ],
};

test("analytics intelligence exposes phase-aware readiness without a completion score", () => {
  const now = new Date("2026-08-05T12:00:00");
  const activities = [
    run("r1", "2026-06-15", 36),
    run("r2", "2026-06-22", 38),
    run("r3", "2026-06-29", 40),
    run("r4", "2026-07-06", 42),
    run("r5", "2026-07-13", 24, "Long Run", { duration: 150 }),
    run("r6", "2026-07-20", 44),
    run("r7", "2026-07-27", 26, "Backyard Long Run", { duration: 180 }),
  ];
  const state = { activities, activityGroups: [], reviews: {}, plan: [], mission, intervals: {} };
  const analytics = buildTrainingAnalytics(state, now, 8);
  const result = buildAnalyticsIntelligence(state, analytics, now);

  assert.equal(result.outlook.readiness.label, "Auf Kurs");
  assert.equal(Object.hasOwn(result.outlook, "score"), false);
  assert.match(result.outlook.dataScope, /Nur absolvierte Einheiten/);
  assert.equal(result.outlook.factors.length, 5);
  assert.equal(result.insights.length, 3);
});

test("aerobic efficiency compares only suitable easy runs with heart rate", () => {
  const now = new Date("2026-08-05T12:00:00");
  const activities = [
    run("e1", "2026-06-15", 10, "Easy Run", { duration: 65, avgHr: 142 }),
    run("e2", "2026-06-22", 10, "Easy Run", { duration: 64, avgHr: 141 }),
    run("e3", "2026-07-13", 10, "Easy Run", { duration: 60, avgHr: 140 }),
    run("e4", "2026-07-27", 10, "Easy Run", { duration: 59, avgHr: 139 }),
  ];
  const state = { activities, activityGroups: [], reviews: {}, plan: [], mission, intervals: {} };
  const analytics = buildTrainingAnalytics(state, now, 8);
  const result = buildAnalyticsIntelligence(state, analytics, now);

  assert.equal(result.efficiency.sampleSize, 4);
  assert.ok(result.efficiency.changePercent > 0);
  assert.match(result.efficiency.status, /Effizienz steigt|Aerob stabil/);
});

test("cross training stays separate and reports football plus aerobic road cycling credit", () => {
  const now = new Date("2026-08-05T12:00:00");
  const state = {
    activities: [
      run("r1", "2026-07-28", 10),
      {
        id: "football",
        date: "2026-08-03",
        startDateLocal: "2026-08-03T19:00:00",
        type: "Soccer",
        name: "Fußball",
        distance: 5,
        duration: 90,
      },
      {
        id: "bike",
        date: "2026-08-01",
        startDateLocal: "2026-08-01T10:00:00",
        type: "RoadRide",
        name: "Rennrad Zone 2",
        distance: 60,
        duration: 120,
        avgHr: 130,
      },
    ],
    activityGroups: [],
    reviews: {},
    plan: [],
    mission,
    intervals: {},
  };
  const analytics = buildTrainingAnalytics(state, now, 8);
  const result = buildAnalyticsIntelligence(state, analytics, now);

  assert.equal(result.crossTraining.footballKm, 5);
  assert.equal(result.crossTraining.roadCyclingAerobicMinutes, 60);
  assert.ok(result.crossTraining.rows.some((row) => row.key === "soccer"));
  assert.ok(result.crossTraining.rows.some((row) => row.key === "roadCycling"));
});

test("training analytics separates completed-week consistency from the unfinished current week", () => {
  const now = new Date("2026-08-05T12:00:00");
  const state = {
    activities: [
      run("w1", "2026-07-07", 8),
      run("w2", "2026-07-14", 8),
      run("w3", "2026-07-21", 8),
      run("w4", "2026-07-28", 8),
    ],
    activityGroups: [], reviews: {}, plan: [], mission, intervals: {},
  };
  const analytics = buildTrainingAnalytics(state, now, 4);

  assert.equal(analytics.metrics.completedWeekCount, 3);
  assert.equal(analytics.metrics.activeCompletedWeeks, 3);
  assert.equal(analytics.metrics.completedConsistency, 1);
});
