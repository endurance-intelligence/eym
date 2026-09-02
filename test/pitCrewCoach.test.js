import test from "node:test";
import assert from "node:assert/strict";
import {
  assessPitSelection,
  PIT_CREW_PRODUCTS,
  pitCrewRaceEligible,
  pitCrewArrivalState,
  pitCountdownLabel,
  pitMetricStatus,
  pitTimeMode,
  recommendPitCrew,
  rollingPitAverage,
  summarizePitSelection,
} from "../src/services/pitCrewCoach.js";

test("pit time mode derives the crew mode from remaining time after arrival", () => {
  assert.equal(pitTimeMode(9), "normal");
  assert.equal(pitTimeMode(6), "compact");
  assert.equal(pitTimeMode(4), "quick");
  assert.equal(pitTimeMode(2.5), "go");
});


test("arrival state keeps the athlete outside until the crew explicitly marks the return", () => {
  assert.deepEqual(pitCrewArrivalState({ started: true, currentRound: 7, arrivalRound: 6, loopMustClose: true }), {
    arrived: false,
    awaitingArrival: true,
    loopReadyToClose: false,
  });
  assert.deepEqual(pitCrewArrivalState({ started: true, currentRound: 7, arrivalRound: 7, loopMustClose: true }), {
    arrived: true,
    awaitingArrival: false,
    loopReadyToClose: true,
  });
  assert.equal(pitCountdownLabel(8.7), "08:42");
});


test("go mode suggests only portable Isostar plus gel", () => {
  const recommendation = recommendPitCrew({ round: 9, minutesToStart: 2.4, history: [] });
  assert.equal(recommendation.mode, "go");
  assert.deepEqual(recommendation.selection.map((item) => item.productId), ["isostar", "sis-beta"]);
  assert.equal(recommendation.summary.carbs, 61);
});

test("sweet fatigue steers the pit savory without losing the carb budget", () => {
  const recommendation = recommendPitCrew({ round: 10, minutesToStart: 11, flags: ["sweet-fatigue"] });
  const ids = recommendation.selection.map((item) => item.productId);
  assert.ok(ids.includes("fusilli"));
  assert.ok(ids.includes("salt-sticks"));
  assert.ok(ids.includes("cucumber"));
  assert.ok(ids.includes("dryll"));
  assert.equal(ids.includes("sis-beta"), false);
  assert.ok(recommendation.summary.carbs >= 49);
});

test("hunger prioritizes real food instead of automatic gel", () => {
  const recommendation = recommendPitCrew({ round: 7, minutesToStart: 12, flags: ["hungry"] });
  assert.deepEqual(recommendation.selection.map((item) => item.productId), ["isostar", "fusilli"]);
  assert.equal(recommendation.summary.carbs, 55);
});

test("caffeine is dynamic only when tired and recent caffeine is low", () => {
  const stable = recommendPitCrew({ round: 12, minutesToStart: 10, history: [], flags: [] });
  assert.equal(stable.selection.some((item) => ["cola", "redbull"].includes(item.productId)), false);

  const tired = recommendPitCrew({ round: 2, minutesToStart: 10, history: [], flags: ["tired"] });
  assert.equal(tired.selection.some((item) => item.productId === "cola"), true);

  const caffeinatedHistory = [
    { selection: [{ productId: "redbull", portionId: "150" }] },
    { selection: [{ productId: "cola", portionId: "200" }] },
  ];
  const tiredAgain = recommendPitCrew({ round: 4, minutesToStart: 10, history: caffeinatedHistory, flags: ["tired"] });
  assert.equal(tiredAgain.selection.some((item) => ["cola", "redbull"].includes(item.productId)), false);
});

test("athlete self-selection is summed instead of rejected for deviating from suggestion", () => {
  const selection = [
    { productId: "salt-sticks", portionId: "20g" },
    { productId: "milk-roll", portionId: "1" },
    { productId: "banana", portionId: "half" },
    { productId: "water", portionId: "100" },
    { productId: "isostar", portionId: "300" },
  ];
  const summary = summarizePitSelection(selection);
  assert.equal(summary.carbs, 76);
  assert.equal(summary.fluidMl, 400);
  const assessment = assessPitSelection(selection, [
    { selection: [{ productId: "isostar", portionId: "300" }, { productId: "maurten100", portionId: "1" }] },
    { selection: [{ productId: "isostar", portionId: "400" }, { productId: "banana", portionId: "whole" }] },
  ]);
  assert.ok(assessment.rolling.carbsPerHour > 50);
});

test("rolling average smooths a light hour instead of forcing immediate catch-up", () => {
  const history = [
    { selection: [{ productId: "isostar", portionId: "300" }, { productId: "sis-beta", portionId: "1" }] },
    { selection: [{ productId: "isostar", portionId: "400" }, { productId: "banana", portionId: "whole" }] },
  ];
  const current = [{ productId: "isostar", portionId: "400" }];
  const rolling = rollingPitAverage(history, current, 3);
  const assessment = assessPitSelection(current, history);
  assert.equal(rolling.carbsPerHour, 47);
  assert.notEqual(assessment.detail.includes("stopfen"), true);
});

test("pit crew live mode is limited to fixed-interval loop races", () => {
  assert.equal(pitCrewRaceEligible({ format: "loop", loopMode: "fixed_interval", name: "OWL Backyard" }), true);
  assert.equal(pitCrewRaceEligible({ format: "distance", loopMode: "free", name: "5000 m" }), false);
});


test("pit quantities multiply nutrients without floating-point display garbage", () => {
  const summary = summarizePitSelection([
    { productId: "milk-roll", portionId: "1", quantity: 2 },
    { productId: "haribo", portionId: "20g", quantity: 1 },
  ]);
  assert.equal(summary.carbs, 71.4);
  assert.equal(Number.isFinite(summary.carbs), true);
});

test("mini status colors low intake orange and excessive intake red while rolling context can keep a light hour green", () => {
  assert.equal(pitMetricStatus({ carbs: 30, fluidMl: 200 }, { hours: 3, carbsPerHour: 42 }).carbs, "low");
  assert.equal(pitMetricStatus({ carbs: 85, fluidMl: 500 }, { hours: 3, carbsPerHour: 74 }).carbs, "high");
  assert.equal(pitMetricStatus({ carbs: 35, fluidMl: 400 }, { hours: 3, carbsPerHour: 52 }).carbs, "good");
  assert.equal(pitMetricStatus({ carbs: 55, fluidMl: 200 }, { hours: 3, carbsPerHour: 55 }, { weather: ["hot"] }).fluid, "low");
});

test("partial loop drink scales actual carbs and fluid without treating it as a failure", () => {
  const summary = summarizePitSelection([{ productId: "isostar", portionId: "200", quantity: 1, intakeFactor: 0.5 }]);
  assert.equal(summary.carbs, 7);
  assert.equal(summary.fluidMl, 100);
});


test("crew-facing snack portions use practical pit units instead of a scale", () => {
  const roulette = PIT_CREW_PRODUCTS.find((product) => product.id === "haribo");
  const salt = PIT_CREW_PRODUCTS.find((product) => product.id === "salt-sticks");
  const fusilli = PIT_CREW_PRODUCTS.find((product) => product.id === "fusilli");
  assert.deepEqual(roulette.portions.map((portion) => portion.label), ["½ Rolle", "1 Rolle"]);
  assert.deepEqual(salt.portions.filter((portion) => !portion.hidden).map((portion) => portion.label), ["½ Handvoll", "1 Handvoll"]);
  assert.deepEqual(fusilli.portions.map((portion) => portion.label), ["75 g gekocht", "100 g gekocht"]);
});
