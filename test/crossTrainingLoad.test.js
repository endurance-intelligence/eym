import test from "node:test";
import assert from "node:assert/strict";
import {
  crossTrainingCreditForActivity,
  isEBikeActivity,
  summarizeCrossTrainingCredits,
} from "../src/services/crossTrainingLoad.js";
import { applyCrossTrainingCreditToPlan } from "../src/services/plannerEngine.js";

test("football distance counts one-to-one as additional leg-load credit", () => {
  const credit = crossTrainingCreditForActivity({ type: "Soccer", name: "Gütersloh Fußball", distance: 4.99, duration: 64 });
  assert.equal(credit.kind, "football");
  assert.equal(credit.equivalentKm, 4.99);
});

test("road cycling uses a transparent three-to-one run-equivalent fallback", () => {
  const credit = crossTrainingCreditForActivity({ type: "RoadRide", name: "Rennrad Grundlagenrunde", distance: 60, duration: 120 });
  assert.equal(credit.kind, "roadCycling");
  assert.equal(credit.equivalentKm, 20);
});

test("e-bike and generic cycling are not credited as road-bike run equivalents", () => {
  assert.equal(isEBikeActivity({ type: "RoadRide", name: "E-Bike Runde" }), true);
  assert.equal(crossTrainingCreditForActivity({ type: "RoadRide", name: "E-Bike Runde", distance: 60 }), null);
  assert.equal(crossTrainingCreditForActivity({ type: "Ride", name: "Citybike", distance: 30 }), null);
});

test("cross-training credit is capped at 35 percent of the weekly running frame", () => {
  const summary = summarizeCrossTrainingCredits([
    { type: "Soccer", distance: 8 },
    { type: "RoadRide", name: "Rennrad", distance: 60 },
  ], { targetKm: 40 });

  assert.equal(summary.rawEquivalentKm, 28);
  assert.equal(summary.creditedEquivalentKm, 14);
  assert.equal(summary.capped, true);
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
