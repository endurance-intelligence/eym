import test from "node:test";
import assert from "node:assert/strict";
import {
  crossTrainingCreditForActivity,
  crossTrainingTargetShare,
  estimateEasyRunPaceSeconds,
  isEBikeActivity,
  summarizeCrossTrainingCredits,
} from "../src/services/crossTrainingLoad.js";
import { applyCrossTrainingRecoverySignalToPlan } from "../src/services/plannerEngine.js";

test("football stays separate from running kilometres", () => {
  const credit = crossTrainingCreditForActivity({ type: "Soccer", name: "Gütersloh Fußball", distance: 4.99, duration: 64 });
  assert.equal(credit.kind, "football");
  assert.equal(credit.sourceDistanceKm, 4.99);
  assert.match(credit.explanation, /getrennt von echten Laufkilometern/);
});

test("road cycling uses duration and intensity instead of a fixed distance ratio", () => {
  const first = crossTrainingCreditForActivity({
    type: "RoadRide",
    name: "Rennrad Grundlagenrunde",
    distance: 60,
    duration: 120,
    intensity: 0.65,
  }, { easyPaceSeconds: 360 });
  const second = crossTrainingCreditForActivity({
    type: "RoadRide",
    name: "Rennrad mit Gegenwind",
    distance: 42,
    duration: 120,
    intensity: 0.65,
  }, { easyPaceSeconds: 360 });

  assert.equal(first.intensityKey, "zone2");
  assert.equal(first.aerobicMinutes, 60);
  assert.equal(second.aerobicMinutes, first.aerobicMinutes);
  assert.match(first.explanation, /nicht in Laufkilometer umgerechnet/);
});

test("heart-rate zones and RPE can classify cycling intensity when power data is missing", () => {
  const zones = crossTrainingCreditForActivity({
    type: "RoadRide",
    duration: 100,
    heartRateZones: { zones: [
      { zone: 2, percentage: 62 },
      { zone: 3, percentage: 20 },
      { zone: 4, percentage: 8 },
    ] },
  }, { easyPaceSeconds: 400 });
  const rpe = crossTrainingCreditForActivity({ type: "RoadRide", duration: 90, perceivedExertion: 8 }, { easyPaceSeconds: 400 });

  assert.equal(zones.intensityKey, "zone2");
  assert.equal(zones.intensitySource, "Herzfrequenzzonen");
  assert.equal(rpe.intensityKey, "threshold");
  assert.equal(rpe.intensitySource, "RPE");
});

test("e-bike and generic cycling are not automatically classified as road-bike load", () => {
  assert.equal(isEBikeActivity({ type: "RoadRide", name: "E-Bike Runde" }), true);
  assert.equal(crossTrainingCreditForActivity({ type: "RoadRide", name: "E-Bike Runde", distance: 60, duration: 120 }), null);
  assert.equal(crossTrainingCreditForActivity({ type: "Ride", name: "Citybike", distance: 30, duration: 90 }), null);
});

test("legacy cross-training share stays available for analytics but is not the planner decision", () => {
  assert.equal(crossTrainingTargetShare({}), 0.3);
  assert.equal(crossTrainingTargetShare({ recoveryWeek: true }), 0.4);
  assert.equal(crossTrainingTargetShare({ phaseLabel: "Spezifische Phase" }), 0.2);
});

test("easy pace is estimated from recent non-quality runs", () => {
  const pace = estimateEasyRunPaceSeconds([
    { type: "Run", name: "8 km locker", date: new Date().toISOString().slice(0, 10), distance: 8, durationSeconds: 8 * 390 },
    { type: "Run", name: "ORC Track", date: new Date().toISOString().slice(0, 10), distance: 8, durationSeconds: 8 * 280 },
    { type: "Run", name: "Longrun locker", date: new Date().toISOString().slice(0, 10), distance: 20, durationSeconds: 20 * 410 },
  ]);

  assert.equal(pace, 400);
});

function mondayFootballHistory() {
  return [
    { id: "f1", type: "Soccer", name: "Fußball", date: "2026-07-27", distance: 6.0, duration: 88, trainingLoad: 72 },
    { id: "f2", type: "Soccer", name: "Fußball", date: "2026-08-03", distance: 6.4, duration: 92, trainingLoad: 75 },
    { id: "f3", type: "Soccer", name: "Fußball", date: "2026-08-10", distance: 5.9, duration: 90, trainingLoad: 74 },
  ];
}

test("planned Monday football inside the personal baseline does not request a replan", () => {
  const current = { id: "f4", type: "Soccer", name: "Fußball", date: "2026-08-17", distance: 6.1, duration: 90, trainingLoad: 76 };
  const summary = summarizeCrossTrainingCredits([current], {
    allActivities: [...mondayFootballHistory(), current],
    plannedActivityIds: new Set(["f4"]),
    reviews: {},
  });

  assert.equal(summary.impactLevel, "none");
  assert.equal(summary.latestActionableActivityAt, 0);
  assert.equal(summary.details[0].planned, true);
  assert.equal(summary.details[0].baselineReliable, true);
  assert.match(summary.details[0].impactExplanation, /Keine Laufkilometer werden automatisch gekürzt/);
});

function cyclingHistory() {
  return [
    { id: "r1", type: "RoadRide", name: "Rennrad", date: "2026-07-10", distance: 38, duration: 82, trainingLoad: 55, intensity: 0.6 },
    { id: "r2", type: "RoadRide", name: "Rennrad", date: "2026-07-24", distance: 45, duration: 95, trainingLoad: 62, intensity: 0.62 },
    { id: "r3", type: "RoadRide", name: "Rennrad", date: "2026-08-07", distance: 42, duration: 90, trainingLoad: 60, intensity: 0.61 },
  ];
}

test("an unusually long unplanned ride waits for the review instead of subtracting run kilometres", () => {
  const current = { id: "r4", type: "RoadRide", name: "100 km Rennrad", date: "2026-08-14", distance: 100, duration: 240, trainingLoad: 180, intensity: 0.65 };
  const summary = summarizeCrossTrainingCredits([current], {
    allActivities: [...cyclingHistory(), current],
    reviews: {},
  });

  assert.equal(summary.impactLevel, "review");
  assert.equal(summary.reviewRequiredCount, 1);
  assert.equal(summary.details[0].unusual, true);
  assert.match(summary.details[0].impactExplanation, /wartet der Coach auf dein Review/);
});

test("a stable review keeps an unusually long ride visible without automatic run reduction", () => {
  const current = { id: "r4", type: "RoadRide", name: "100 km Rennrad", date: "2026-08-14", distance: 100, duration: 240, trainingLoad: 180, intensity: 0.65 };
  const summary = summarizeCrossTrainingCredits([current], {
    allActivities: [...cyclingHistory(), current],
    reviews: { r4: { rpe: 6, legs: 7, energy: 8, overallFeeling: 8 } },
  });

  assert.equal(summary.impactLevel, "watch");
  assert.equal(summary.adjustmentRequiredCount, 0);
  assert.match(summary.details[0].impactExplanation, /Laufumfang bleibt zunächst bestehen/);
});

test("only a strained review can trigger a conservative flexible-run adjustment", () => {
  const current = { id: "r4", type: "RoadRide", name: "100 km Rennrad", date: "2026-08-14", distance: 100, duration: 240, trainingLoad: 180, intensity: 0.65 };
  const summary = summarizeCrossTrainingCredits([current], {
    allActivities: [...cyclingHistory(), current],
    reviews: { r4: { rpe: 8, legs: 4, energy: 5, overallFeeling: 5 } },
  });
  const result = applyCrossTrainingRecoverySignalToPlan([
    { id: "easy", date: "2026-08-15", title: "8 km locker", type: "Easy Run", distance: 8 },
    { id: "track", date: "2026-08-16", title: "ORC Track", type: "ORC Track", distance: 8, fixed: true, keySession: true },
    { id: "long", date: "2026-08-17", title: "20 km Longrun", type: "Long Run", distance: 20, keySession: true },
  ], summary.details);

  assert.equal(summary.impactLevel, "adjust");
  assert.equal(result.adjustedEntryIds.length, 1);
  assert.equal(result.plan.find((item) => item.id === "easy").distance, 5.2);
  assert.equal(result.plan.find((item) => item.id === "track").distance, 8);
  assert.equal(result.plan.find((item) => item.id === "long").distance, 20);
  assert.match(result.plan.find((item) => item.id === "easy").notes, /nicht in Laufkilometer umgerechnet/);
});
