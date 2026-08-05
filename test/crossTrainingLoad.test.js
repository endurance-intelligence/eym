import test from "node:test";
import assert from "node:assert/strict";
import {
  crossTrainingCreditForActivity,
  crossTrainingTargetShare,
  estimateEasyRunPaceSeconds,
  isEBikeActivity,
  summarizeCrossTrainingCredits,
} from "../src/services/crossTrainingLoad.js";
import { applyCrossTrainingCreditToPlan } from "../src/services/plannerEngine.js";

test("football distance counts one-to-one as additional leg-load credit", () => {
  const credit = crossTrainingCreditForActivity({ type: "Soccer", name: "Gütersloh Fußball", distance: 4.99, duration: 64 });
  assert.equal(credit.kind, "football");
  assert.equal(credit.equivalentKm, 4.99);
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
  assert.equal(first.equivalentKm, 10);
  assert.equal(second.equivalentKm, first.equivalentKm);
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

test("e-bike and generic cycling are not automatically credited as road-bike replacement", () => {
  assert.equal(isEBikeActivity({ type: "RoadRide", name: "E-Bike Runde" }), true);
  assert.equal(crossTrainingCreditForActivity({ type: "RoadRide", name: "E-Bike Runde", distance: 60, duration: 120 }), null);
  assert.equal(crossTrainingCreditForActivity({ type: "Ride", name: "Citybike", distance: 30, duration: 90 }), null);
});

test("cross-training share adapts to normal, recovery and specific phases", () => {
  assert.equal(crossTrainingTargetShare({}), 0.3);
  assert.equal(crossTrainingTargetShare({ recoveryWeek: true }), 0.4);
  assert.equal(crossTrainingTargetShare({ phaseLabel: "Spezifische Phase" }), 0.2);
});

test("cross-training credit is capped by the adaptive share of the weekly running frame", () => {
  const summary = summarizeCrossTrainingCredits([
    { type: "Soccer", distance: 8, duration: 60 },
    { type: "RoadRide", name: "Rennrad", distance: 60, duration: 120, intensity: 0.65 },
  ], { targetKm: 40, easyPaceSeconds: 360 });

  assert.equal(summary.rawEquivalentKm, 18);
  assert.equal(summary.creditedEquivalentKm, 12);
  assert.equal(summary.maxShare, 0.3);
  assert.equal(summary.capped, true);
});

test("easy pace is estimated from recent non-quality runs", () => {
  const pace = estimateEasyRunPaceSeconds([
    { type: "Run", name: "8 km locker", date: new Date().toISOString().slice(0, 10), distance: 8, durationSeconds: 8 * 390 },
    { type: "Run", name: "ORC Track", date: new Date().toISOString().slice(0, 10), distance: 8, durationSeconds: 8 * 280 },
    { type: "Run", name: "Longrun locker", date: new Date().toISOString().slice(0, 10), distance: 20, durationSeconds: 20 * 410 },
  ]);

  assert.equal(pace, 400);
});

test("cross-training only reduces flexible easy running and protects key sessions", () => {
  const result = applyCrossTrainingCreditToPlan([
    { id: "easy", title: "8 km locker", type: "Easy Run", distance: 8, optional: true },
    { id: "track", title: "ORC Track", type: "ORC Track", distance: 8, fixed: true, keySession: true },
    { id: "long", title: "20 km Longrun", type: "Long Run", distance: 20, keySession: true },
  ], 5);

  assert.equal(result.appliedCreditKm, 5);
  assert.equal(result.plan.find((item) => item.id === "easy").distance, 3);
  assert.equal(result.plan.find((item) => item.id === "track").distance, 8);
  assert.equal(result.plan.find((item) => item.id === "long").distance, 20);
});
