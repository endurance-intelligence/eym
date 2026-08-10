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
  assert.match(result.consequence, /Easy-Anteilen|nachgeholt/);
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
