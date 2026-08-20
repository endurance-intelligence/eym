import test from "node:test";
import assert from "node:assert/strict";
import { weeklyReviewSummary } from "../src/services/weeklyReview.js";

test("weekly review explains execution, extra load, recovery and next consequence", () => {
  const plan = [
    { id: "track", date: "2026-08-04", title: "ORC Track", type: "Run", distance: 10, keySession: true },
    { id: "easy", date: "2026-08-06", title: "6 km locker", type: "Run", distance: 6, missedReason: "Keine Zeit" },
  ];
  const activities = [
    { id: "a-track", date: "2026-08-04", name: "ORC Track", type: "Run", distance: 10 },
    { id: "football", date: "2026-08-03", name: "Fußball", type: "Soccer", distance: 5 },
  ];
  const reviews = {
    "a-track": { legs: 7, energy: 7, overallFeeling: 7, rpe: 7, stomach: 8 },
  };

  const result = weeklyReviewSummary({
    weekStart: new Date("2026-08-03T12:00:00"),
    plan,
    activities,
    allActivities: activities,
    reviews,
  });

  assert.equal(result.metrics.plannedRunningKm, 16);
  assert.equal(result.metrics.actualRunningKm, 10);
  assert.equal(result.metrics.keyPlanned, 1);
  assert.equal(result.metrics.keyCompleted, 1);
  assert.equal(result.metrics.missedSessions, 1);
  assert.equal(result.metrics.extraActivities, 1);
  assert.match(result.positives.join(" "), /Schlüsselreiz/);
  assert.match(result.watchouts.join(" "), /zusätzliche Aktivität/);
  assert.match(result.consequence, /keine automatische Kürzung|keine automatische Kilometerverrechnung|nachgeholt/);
});

test("weekly review highlights GI signals without turning one hard session into a recovery alarm", () => {
  const plan = [
    { id: "long", date: "2026-08-09", title: "Longrun", type: "Run", distance: 24, keySession: true },
  ];
  const activities = [
    { id: "long-actual", date: "2026-08-09", name: "Longrun", type: "Run", distance: 24 },
  ];
  const reviews = {
    "long-actual": {
      legs: 6,
      energy: 6,
      overallFeeling: 6,
      rpe: 8,
      stomach: 5,
      stomachSymptoms: ["Völlegefühl"],
      nutritionItems: [{ intakeTolerance: "watch", intakeSymptoms: ["Aufstoßen"] }],
    },
  };

  const result = weeklyReviewSummary({
    weekStart: new Date("2026-08-03T12:00:00"),
    plan,
    activities,
    allActivities: activities,
    reviews,
  });

  assert.equal(result.metrics.recoveryFlags, 0);
  assert.equal(result.metrics.giFlags, 1);
  assert.match(result.watchouts.join(" "), /Magen-\/GI-Auffälligkeiten/);
  assert.match(result.consequence, /Fueling/);
});


test("weekly review counts planner-native running workout types in planned volume", () => {
  const plan = [
    { id: "easy", date: "2026-08-10", title: "10 km locker", type: "Easy Run", distance: 10, completed: true },
    { id: "track", date: "2026-08-11", title: "ORC Track – 8 × 200", type: "ORC Track", distance: 12.7, completed: true },
    { id: "race", date: "2026-08-14", title: "UrLand-Lauf", type: "Wettkampf", distance: 9.6, raceEvent: true, completed: true },
    { id: "football", date: "2026-08-10", title: "Fußball", type: "Fußball", distance: 6.5, completed: true },
  ];
  const activities = [
    { id: "a-easy", date: "2026-08-10", name: "10 km locker", type: "Run", distance: 10 },
    { id: "a-track", date: "2026-08-11", name: "ORC Track", type: "Run", distance: 12.7 },
    { id: "a-race", date: "2026-08-14", name: "UrLand-Lauf", type: "Run", distance: 9.6 },
    { id: "a-football", date: "2026-08-10", name: "Fußball", type: "Soccer", distance: 6.5 },
  ];

  const result = weeklyReviewSummary({
    weekStart: new Date("2026-08-10T12:00:00"),
    plan,
    activities,
    allActivities: activities,
    reviews: {},
  });

  assert.equal(result.metrics.plannedRunningKm, 32.3);
  assert.equal(result.metrics.plannedRunningSessions, 3);
  assert.equal(result.metrics.actualRunningKm, 32.3);
});


test("unplanned endurance load only changes the consequence when its review is strained", () => {
  const plan = [
    { id: "easy", date: "2026-08-15", title: "8 km locker", type: "Easy Run", distance: 8 },
  ];
  const ride = { id: "ride", date: "2026-08-14", name: "100 km Rennrad", type: "RoadRide", distance: 100, duration: 240 };
  const stable = weeklyReviewSummary({
    weekStart: new Date("2026-08-10T12:00:00"),
    plan,
    activities: [ride],
    allActivities: [ride],
    reviews: { ride: { legs: 7, energy: 8, overallFeeling: 8, rpe: 6 } },
  });
  assert.match(stable.consequence, /nicht automatisch reduziert/);

  const strained = weeklyReviewSummary({
    weekStart: new Date("2026-08-10T12:00:00"),
    plan,
    activities: [ride],
    allActivities: [ride],
    reviews: { ride: { legs: 4, energy: 5, overallFeeling: 5, rpe: 8 } },
  });
  assert.match(strained.consequence, /auffälligen Review-Signale/);
  assert.match(strained.consequence, /keine automatische Kilometerverrechnung/);
});
