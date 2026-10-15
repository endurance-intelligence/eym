import test from "node:test";
import assert from "node:assert/strict";
import { aidStationSegments, buildRaceFuelRotation, buildRacePhases, raceDrinkOptions, raceDrinkPlanForVolume, raceDurationHours, raceEventsFromState, raceFuelTargets, raceGelOptions, raceRoundCount, raceVpAlternatives, resourceOptions, searchRaceDrinkOptions } from "../src/services/raceIntelligence.js";
import { buildPreparationRoadmap } from "../src/services/goalRoadmap.js";
import { racePrepProfileFromEvent } from "../src/services/racePrepPlanner.js";

test("Heartbeat keeps official 112 km, 19 rounds and 6.2 km standard loop independently", () => {
  const event = { name: "Heartbeat Ultra Fulda", targetKm: 112, rounds: 19, loopKm: 6.2, loopMode: "time_limit", eventTimeLimit: "15:00:00" };
  assert.equal(raceRoundCount(event), 19);
  assert.equal(raceDurationHours(event), 15);
  const profile = racePrepProfileFromEvent(event);
  assert.equal(profile.distanceKm, 112);
  assert.equal(profile.rounds, 19);
  assert.equal(profile.loopKm, 6.2);
  assert.equal(profile.roundsExplicit, true);
});

test("Heartbeat phase blocks respect all 19 official rounds", () => {
  const phases = buildRacePhases({ event: { name: "Heartbeat Ultra", targetKm: 112, rounds: 19, loopKm: 6.2, loopMode: "time_limit", eventTimeLimit: "15:00:00" }, state: {} });
  assert.deepEqual(phases.map((phase) => phase.title), ["Runde 1–3", "Runde 4–9", "Runde 10–14", "Runde 15–19"]);
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

test("race hydration prefers reliable sweat calibration over raw drinking history", () => {
  const state = {
    activities: [
      { id: "sweat", type: "Run", duration: 120, durationSeconds: 7200 },
      { id: "drink-only", type: "Run", duration: 60, durationSeconds: 3600 },
    ],
    reviews: {
      sweat: { weightBefore: 80, weightAfter: 78.8, nutritionFluidTotal: 600, hydrationThirst: "normal" },
      "drink-only": { nutritionFluidTotal: 900, hydrationThirst: "normal" },
    },
  };
  const target = raceFuelTargets({ event: { name: "Heartbeat Ultra", targetKm: 112, eventTimeLimit: "15:00:00" }, state, temperatureC: 18 });
  assert.equal(target.hydration.evidence.source, "sweat-calibration");
  assert.equal(target.hydration.evidence.count, 1);
  assert.match(target.hydration.reason, /Schweißraten-Messung/);
});

test("regular loop ultras use own gels and hydration instead of inventing organizer food", () => {
  const event = { name: "Heartbeat Ultra", targetKm: 112, rounds: 19, loopKm: 6.2, loopMode: "time_limit", eventTimeLimit: "15:00:00" };
  const rows = buildRaceFuelRotation({ event, state: { reviews: {} }, supply: {}, temperatureC: 12 });
  assert.equal(rows.length, 19);
  assert.ok(rows.some((row) => row.gelIds.length > 0));
  assert.ok(rows.every((row) => !row.items.some((item) => item.category === "food")));
  assert.ok(rows.every((row) => row.items.some((item) => item.category === "drink")));
  assert.ok(rows.every((row) => row.fluidMl < 1000));
});

test("race gel priority changes the gel chosen for planned gel slots", () => {
  const event = { name: "Loop Ultra", targetKm: 40, loopKm: 5, eventTimeLimit: "06:00:00" };
  const supply = { gelPriority: ["maurten100", "226ers-high", "sis-beta", "226ers-high-strawberry"] };
  const rows = buildRaceFuelRotation({ event, state: { reviews: {} }, supply, temperatureC: 12 });
  const firstGel = rows.flatMap((row) => row.gelIds)[0];
  assert.equal(firstGel, "maurten100");
});


test("Race selectors hide completed and archived events", () => {
  const state = {
    mission: {
      milestones: [
        { id: "past", name: "Past Race", date: "2026-08-21" },
        { id: "future", name: "Heartbeat Ultra", date: "2026-11-21" },
        { id: "archived", name: "Archived Race", date: "2026-12-01", archived: true },
      ],
    },
  };
  const races = raceEventsFromState(state, new Date("2026-10-14T12:00:00"));
  assert.deepEqual(races.map((race) => race.id), ["future"]);
});

test("excluded gels never enter the loop-ultra race plan", () => {
  const event = { name: "Heartbeat Ultra", targetKm: 112, rounds: 19, loopKm: 6.2, loopMode: "time_limit", eventTimeLimit: "15:00:00", aidStationMode: "every_loop" };
  const supply = {
    gelPriority: ["226ers-high", "226ers-high-strawberry", "sis-beta", "maurten100"],
    gelExcludedIds: ["maurten100"],
  };
  const rows = buildRaceFuelRotation({ event, state: { reviews: {} }, supply, temperatureC: 12 });
  assert.equal(rows.length, 19);
  assert.ok(rows.every((row) => !row.gelIds.includes("maurten100")));
  assert.ok(rows.every((row) => row.items.some((item) => item.category === "drink" && item.timing === "vp")));
});

test("every-loop aid station only schedules gels when the drink leaves a carbohydrate gap", () => {
  const event = { name: "Heartbeat Ultra", targetKm: 112, rounds: 19, loopKm: 6.2, loopMode: "time_limit", eventTimeLimit: "15:00:00", aidStationMode: "every_loop" };
  const supply = {
    gelPriority: ["226ers-high", "226ers-high-strawberry", "sis-beta", "maurten100"],
    gelExcludedIds: ["maurten100"],
  };
  const rows = buildRaceFuelRotation({ event, state: { reviews: {} }, supply, temperatureC: 12 });
  assert.ok(rows.some((row) => row.gelIds.length === 0));
  assert.ok(rows.some((row) => row.gelIds.length === 1));
  assert.equal(rows.flatMap((row) => row.gelIds)[0], "226ers-high");
  assert.ok(rows.every((row) => row.drinkCarbs > 0));
});


test("Race gel selection mirrors every non-archived Gel from Fuel Lab", () => {
  const state = {
    fuel: [
      { id: "gel-a", brand: "Alpha", name: "Fast 45", category: "Gel", carbs: 45, servingQuantity: 70, servingUnit: "g" },
      { id: "gel-b", brand: "Beta", name: "Neutral 50", category: "Gel", carbs: 50 },
      { id: "drink-a", brand: "Drink", name: "Mix", category: "Drink Mix", carbs: 30 },
      { id: "gel-old", brand: "Old", name: "Archived", category: "Gel", carbs: 40, archived: true },
    ],
  };
  const options = raceGelOptions(state);
  assert.deepEqual(options.map((item) => item.id), ["gel-a", "gel-b"]);
  assert.equal(options[0].label, "Alpha Fast 45");
  assert.equal(options[0].carbs, 45);
});

test("Fuel Lab gel priority and exclusion directly control every loop round", () => {
  const event = { name: "Loop Ultra", targetKm: 40, rounds: 8, loopKm: 5, eventTimeLimit: "06:00:00", aidStationMode: "every_loop" };
  const state = {
    reviews: {},
    fuel: [
      { id: "gel-a", brand: "Alpha", name: "Fast 45", category: "Gel", carbs: 45 },
      { id: "gel-b", brand: "Beta", name: "Neutral 50", category: "Gel", carbs: 50 },
      { id: "gel-c", brand: "Gamma", name: "Backup", category: "Gel", carbs: 30 },
    ],
  };
  const supply = { gelPriority: ["gel-b", "gel-a", "gel-c"], gelExcludedIds: ["gel-c"] };
  const rows = buildRaceFuelRotation({ event, state, supply, temperatureC: 12 });
  assert.equal(rows.length, 8);
  assert.ok(rows.every((row) => !row.gelIds.includes("gel-c")));
  assert.equal(rows[0].gelIds[0], "gel-b");
  assert.ok(rows.flatMap((row) => row.gelIds).every((id) => ["gel-a", "gel-b"].includes(id)));
  assert.ok(rows.some((row) => row.gelIds.length === 0));
});

test("race drink shelf mirrors Fuel Lab drink mix and electrolyte products", () => {
  const state = {
    fuel: [
      { id: "iso", brand: "Isostar", name: "Hydrate", category: "Drink Mix", carbs: 30, sodium: 300, preparedVolumeMl: 500 },
      { id: "salt", brand: "Dryll", name: "Electrolyte", category: "Elektrolyte", carbs: 0, sodium: 450, preparedVolumeMl: 650 },
      { id: "gel", brand: "Gel", name: "Fast", category: "Gel", carbs: 50 },
      { id: "old", brand: "Old", name: "Drink", category: "Drink Mix", carbs: 20, preparedVolumeMl: 500, archived: true },
    ],
  };
  const options = raceDrinkOptions(state);
  assert.deepEqual(options.map((item) => item.id), ["iso", "salt"]);
  assert.equal(options[0].preparedVolumeMl, 500);
  assert.equal(options[0].carbs, 30);
});

test("unknown organizer sports drink uses a labelled six-percent carbohydrate planning value", () => {
  const event = { name: "Loop Ultra", rounds: 10, loopKm: 5, targetKm: 50, aidStationMode: "every_loop" };
  const drink = raceDrinkPlanForVolume({ event, state: {}, supply: { drinkSource: "organizer_unknown" }, fluidMl: 650 });
  assert.equal(drink.estimated, true);
  assert.equal(drink.carbsPer100Ml, 6);
  assert.equal(drink.carbs, 39);
  assert.match(drink.note, /6 g KH \/ 100 ml/);
});

test("known own or organizer drink scales Fuel Lab carbohydrate to the planned fluid volume", () => {
  const state = { fuel: [{ id: "iso", brand: "Isostar", name: "Hydrate", category: "Drink Mix", carbs: 30, sodium: 300, preparedVolumeMl: 500 }] };
  const event = { name: "Loop Ultra", rounds: 10, loopKm: 5, targetKm: 50, aidStationMode: "every_loop" };
  const own = raceDrinkPlanForVolume({ event, state, supply: { drinkSource: "own", ownDrinkProductId: "iso" }, fluidMl: 650 });
  const organizer = raceDrinkPlanForVolume({ event, state, supply: { drinkSource: "organizer_known", organizerDrinkProductId: "iso" }, fluidMl: 650 });
  assert.equal(own.carbs, 39);
  assert.equal(organizer.carbs, 39);
  assert.equal(own.sodiumMg, 390);
});

test("drink carbohydrate reduces gel frequency instead of stacking a gel on every loop", () => {
  const event = { name: "Heartbeat Ultra", targetKm: 112, rounds: 19, loopKm: 6.2, loopMode: "time_limit", eventTimeLimit: "15:00:00", aidStationMode: "every_loop" };
  const state = {
    reviews: {},
    fuel: [
      { id: "gel-a", brand: "226ERS", name: "High Energy", category: "Gel", carbs: 50 },
      { id: "iso", brand: "Isostar", name: "Hydrate", category: "Drink Mix", carbs: 30, preparedVolumeMl: 500 },
    ],
  };
  const rows = buildRaceFuelRotation({ event, state, supply: { drinkSource: "organizer_known", organizerDrinkProductId: "iso", gelPriority: ["gel-a"] }, temperatureC: 12 });
  assert.equal(rows.length, 19);
  assert.ok(rows.every((row) => row.drinkCarbs > 0));
  assert.ok(rows.some((row) => row.gelIds.length === 0));
  assert.ok(rows.some((row) => row.gelIds.length === 1));
  assert.ok(rows.every((row) => row.items.some((item) => item.category === "drink" && /g KH/.test(item.portionLabel))));
});


test("race drink search matches brand and product tokens independent of case", () => {
  const state = {
    fuel: [
      { id: "maurten-320", brand: "Maurten", name: "Drink Mix 320", category: "Drink Mix", carbs: 80, preparedVolumeMl: 500 },
      { id: "iso", brand: "Isostar", name: "Hydrate", category: "Drink Mix", carbs: 30, preparedVolumeMl: 500 },
    ],
  };
  assert.deepEqual(searchRaceDrinkOptions(state, "maurten drink mix").map((item) => item.id), ["maurten-320"]);
  assert.deepEqual(searchRaceDrinkOptions(state, "HYDRATE").map((item) => item.id), ["iso"]);
});

test("known organizer drink can use a race-specific product found outside Fuel Lab", () => {
  const event = { name: "Loop Ultra", rounds: 10, loopKm: 5, targetKm: 50, aidStationMode: "every_loop" };
  const drink = raceDrinkPlanForVolume({
    event,
    state: {},
    supply: {
      drinkSource: "organizer_known",
      organizerDrinkProduct: { label: "Maurten Drink Mix 320", carbs: 80, sodiumMg: 400, preparedVolumeMl: 500, source: "Produktsuche" },
    },
    fluidMl: 650,
  });
  assert.equal(drink.label, "Maurten Drink Mix 320");
  assert.equal(drink.carbs, 104);
  assert.equal(drink.sodiumMg, 520);
  assert.match(drink.note, /Produktsuche/);
});

test("confirmed VP foods create optional gel replacements without double-counting them", () => {
  const alternatives = raceVpAlternatives(["banana", "pretzelSticks", "pickle"], 50, 1);
  assert.ok(alternatives.replacements.some((item) => /Banan/.test(item.label)));
  assert.ok(alternatives.replacements.some((item) => /Salzstangen/.test(item.label)));
  assert.equal(alternatives.support[0]?.label, "Essiggurke");
});

test("VP resource shelf includes common ultra foods", () => {
  const labels = resourceOptions().map((item) => item.label);
  ["Salzstangen", "Brötchen", "Nudeln", "Essiggurke", "Kartoffeln"].forEach((label) => assert.ok(labels.includes(label)));
});

test("round plan exposes confirmed VP alternatives only on gel rounds", () => {
  const event = { name: "Heartbeat Ultra", targetKm: 112, rounds: 19, loopKm: 6.2, loopMode: "time_limit", eventTimeLimit: "15:00:00", aidStationMode: "every_loop" };
  const state = {
    reviews: {},
    fuel: [{ id: "gel-a", brand: "226ERS", name: "High Energy", category: "Gel", carbs: 50 }],
  };
  const rows = buildRaceFuelRotation({
    event,
    state,
    supply: { gelPriority: ["gel-a"], organizerResources: ["banana", "pretzelSticks"] },
    temperatureC: 12,
  });
  assert.ok(rows.some((row) => row.gelCarbs > 0 && row.vpAlternatives.replacements.length > 0));
  assert.ok(rows.filter((row) => row.gelCarbs === 0).every((row) => row.vpAlternatives.replacements.length === 0));
});
