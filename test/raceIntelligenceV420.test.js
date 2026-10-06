import test from "node:test";
import assert from "node:assert/strict";
import { aidStationSegments, buildRacePhases, raceDurationHours, raceFuelTargets, raceRoundCount } from "../src/services/raceIntelligence.js";
import { buildPreparationRoadmap } from "../src/services/goalRoadmap.js";
import { racePrepProfileFromEvent } from "../src/services/racePrepPlanner.js";

test("Heartbeat keeps 112 km official distance and derives 18 race rounds", () => {
  const event = { name: "Heartbeat Ultra Fulda", targetKm: 112, loopKm: 6.3, loopMode: "time_limit", eventTimeLimit: "15:00:00" };
  assert.equal(raceRoundCount(event), 18);
  assert.equal(raceDurationHours(event), 15);
  const profile = racePrepProfileFromEvent(event);
  assert.equal(profile.distanceKm, 112);
  assert.equal(profile.rounds, 18);
});

test("Heartbeat phase blocks are 1-3, 4-9, 10-14 and 15-18", () => {
  const phases = buildRacePhases({ event: { name: "Heartbeat Ultra", targetKm: 112, loopKm: 6.3, loopMode: "time_limit", eventTimeLimit: "15:00:00" }, state: {} });
  assert.deepEqual(phases.map((phase) => phase.title), ["Runde 1–3", "Runde 4–9", "Runde 10–14", "Runde 15–18"]);
});

test("aid station carry uses segment time plus carb and fluid corridors", () => {
  const event = { name: "Ultra", targetKm: 100, targetTime: "10:00:00" };
  const state = { reviews: {} };
  const segments = aidStationSegments(event, { aidStations: [{ id: "vp-1", km: 20, name: "VP1", resources: [] }] }, state, 18);
  assert.equal(segments[0].minutes, 120);
  assert.match(segments[0].carryHint, /g KH/);
  assert.match(segments[0].carryHint, /ml Trinkkorridor/);
});

test("goal roadmap creates training stations when the main race is the only event", () => {
  const roadmap = buildPreparationRoadmap({ goal: { id: "hbu", name: "Heartbeat Ultra", date: "2026-11-21", courseType: "loop" }, intermediateEvents: [{ id: "hbu", date: "2026-11-21", isMainTarget: true }], now: new Date("2026-10-05T12:00:00") });
  assert.equal(roadmap.length, 4);
  assert.match(roadmap[0].title, /Loop-Block/);
  assert.match(roadmap.at(-1).title, /Frische/);
});


test("long ultra with several successful fuel reviews exposes the established 70-90 g/h corridor", () => {
  const reviews = {
    a: { carbohydratesPerHour: 60, stomach: 8, durationMinutes: 180, stomachSymptoms: [] },
    b: { carbohydratesPerHour: 65, stomach: 9, durationMinutes: 240, stomachSymptoms: [] },
    c: { carbohydratesPerHour: 60, stomach: 8, durationMinutes: 300, stomachSymptoms: [] },
  };
  const target = raceFuelTargets({ event: { name: "Heartbeat Ultra", targetKm: 112, eventTimeLimit: "15:00:00" }, state: { reviews } });
  assert.equal(target.carbs.low, 70);
  assert.equal(target.carbs.high, 90);
});
