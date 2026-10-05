import test from "node:test";
import assert from "node:assert/strict";
import {
  officialRaceDistance,
  raceFormat,
  raceFuelTargets,
  buildRacePhases,
  normalizeRaceSupplyPlan,
  aidStationSegments,
} from "../src/services/raceIntelligence.js";

test("official distance stays authoritative for a loop race", () => {
  const event = { name: "Heartbeat Ultra Fulda", targetKm: 112, loopKm: 6.3, rounds: 18, loopMode: "time_limit" };
  assert.equal(officialRaceDistance(event), 112);
  assert.equal(raceFormat(event), "loop");
});

test("long ultra uses 70-90 when athlete has proven >=70 g/h tolerance", () => {
  const state = { reviews: { a: { carbohydratesPerHour: 78, carbohydrateStatus: "good", stomach: 9 } } };
  const result = raceFuelTargets({ event: { targetKm: 112, durationHours: 15 }, state });
  assert.equal(result.carbs.low, 70);
  assert.equal(result.carbs.high, 90);
});

test("hydration is orientation and never converted into a mandatory loop bottle", () => {
  const result = raceFuelTargets({ event: { targetKm: 112, durationHours: 15, loopKm: 6.3 }, state: {} });
  assert.match(result.hydration.reason, /Kein Trinkzwang pro Runde/);
});

test("race phases vary the early carb target instead of cloning every loop", () => {
  const state = { reviews: { a: { carbohydratesPerHour: 75, carbohydrateStatus: "good", stomach: 8 } } };
  const phases = buildRacePhases({ event: { targetKm: 112, durationHours: 15, rounds: 18, loopKm: 6.3 }, state });
  assert.equal(phases.length, 4);
  assert.notEqual(phases[0].carbLabel, phases[1].carbLabel);
});

test("organizer gels stay disabled by default while hybrid mode is default", () => {
  const plan = normalizeRaceSupplyPlan({});
  assert.equal(plan.mode, "hybrid");
  assert.equal(plan.organizerGelApproved, false);
});

test("aid stations create carry segments from start to finish", () => {
  const event = { targetKm: 111 };
  const plan = normalizeRaceSupplyPlan({
    aidStations: [
      { id: "a", km: 8, name: "VP 1", resources: ["water"] },
      { id: "b", km: 24, name: "VP 2", resources: ["water", "cola"] },
      { id: "c", km: 38, name: "VP 3", resources: ["water"] },
    ],
  });
  const segments = aidStationSegments(event, plan);
  assert.deepEqual(segments.map((entry) => entry.km), [8, 16, 14, 73]);
});
