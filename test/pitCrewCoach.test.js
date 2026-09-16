import test from "node:test";
import assert from "node:assert/strict";
import {
  assessPitSelection,
  buildPitCrewCustomProduct,
  PIT_CREW_DEFAULT_STOCK_IDS,
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

test("sweet fatigue moves the pit away from sweet fuel and keeps a separate loop drink", () => {
  const recommendation = recommendPitCrew({ round: 10, minutesToStart: 11, flags: ["sweet-fatigue"] });
  const ids = recommendation.selection.map((item) => item.productId);
  assert.ok(ids.includes("broth"));
  assert.ok(ids.includes("cucumber"));
  assert.ok(ids.includes("dryll"));
  assert.equal(ids.includes("sis-beta"), false);
  assert.equal(recommendation.selection.find((item) => item.productId === "broth")?.timing, "now");
  assert.equal(recommendation.selection.find((item) => item.productId === "dryll")?.timing, "carry");
});

test("hunger prioritizes real food now and one clear loop drink", () => {
  const recommendation = recommendPitCrew({ round: 7, minutesToStart: 12, flags: ["hungry"] });
  assert.deepEqual(recommendation.selection.map((item) => item.productId), ["fusilli", "isostar"]);
  assert.equal(recommendation.selection[0].timing, "now");
  assert.equal(recommendation.selection[1].timing, "carry");
  assert.equal(recommendation.summary.fluidMl, 500);
});

test("thirst adds hydration without randomly changing the solid fuel", () => {
  const normal = recommendPitCrew({ round: 5, minutesToStart: 10, flags: [] });
  const normalDrinks = normal.selection.filter((item) => ["water", "isostar", "isostar-long", "dryll", "cola", "redbull"].includes(item.productId));
  assert.equal(normalDrinks.length, 1);
  assert.ok(["isostar", "isostar-long"].includes(normalDrinks[0].productId));
  assert.equal(normalDrinks[0].timing, "carry");

  const thirsty = recommendPitCrew({ round: 5, minutesToStart: 10, flags: ["thirsty"] });
  assert.equal(thirsty.selection.find((item) => item.productId === "water")?.timing, "now");
  assert.equal(thirsty.selection.find((item) => item.productId === "isostar")?.timing, "carry");
  const normalSolid = normal.selection.filter((item) => !["water", "isostar", "isostar-long", "dryll", "cola", "redbull", "broth"].includes(item.productId)).map((item) => item.productId);
  const thirstySolid = thirsty.selection.filter((item) => !["water", "isostar", "isostar-long", "dryll", "cola", "redbull", "broth"].includes(item.productId)).map((item) => item.productId);
  assert.deepEqual(thirstySolid, normalSolid);
});

test("hot weather does not turn cucumber into the default food every loop", () => {
  const history = [
    { round: 5, selection: [{ productId: "cucumber", portionId: "50" }], carryStatus: "confirmed" },
    { round: 6, selection: [{ productId: "banana", portionId: "whole" }], carryStatus: "confirmed" },
  ];
  const recommendation = recommendPitCrew({ round: 7, minutesToStart: 10, history, weather: ["hot"] });
  assert.equal(recommendation.selection.some((item) => item.productId === "cucumber"), false);
  assert.ok(recommendation.selection.some((item) => ["banana", "milk-roll", "fusilli", "sis-beta"].includes(item.productId)));
});

test("stable food rotation avoids repeating the same solid option on consecutive pits", () => {
  const first = recommendPitCrew({ round: 5, minutesToStart: 10, history: [], weather: ["hot"] });
  const firstSolid = first.selection.find((item) => ["banana", "milk-roll", "fusilli", "sis-beta"].includes(item.productId));
  const history = [{ round: 5, selection: first.selection.filter((item) => (item.timing || "now") === "now"), carrySelection: first.selection.filter((item) => item.timing === "carry"), carryStatus: "pending", provisionalSummary: first.summary }];
  const next = recommendPitCrew({ round: 6, minutesToStart: 10, history, weather: ["hot"] });
  const nextSolid = next.selection.find((item) => ["banana", "milk-roll", "fusilli", "sis-beta"].includes(item.productId));
  assert.ok(firstSolid);
  assert.ok(nextSolid);
  assert.notEqual(nextSolid.productId, firstSolid.productId);
});

test("no salty removes savory pit food without disabling electrolyte drink", () => {
  const recommendation = recommendPitCrew({ round: 8, minutesToStart: 10, flags: ["no-salty"] });
  assert.deepEqual(recommendation.selection.map((item) => item.productId), ["banana", "isostar"]);
  assert.equal(recommendation.selection.find((item) => item.productId === "isostar")?.timing, "carry");
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
  assert.match(assessment.detail, /nicht.*aggressiv|moderat|nächsten Pits/i);
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
  assert.equal(pitMetricStatus({ carbs: 95, fluidMl: 500 }, { hours: 3, carbsPerHour: 94 }).carbs, "high");
  assert.equal(pitMetricStatus({ carbs: 35, fluidMl: 400 }, { hours: 3, carbsPerHour: 52 }).carbs, "low");
  assert.equal(pitMetricStatus({ carbs: 55, fluidMl: 200 }, { hours: 3, carbsPerHour: 55 }, { weather: ["hot"] }).fluid, "low");
});

test("Backyard pit target uses a 60-90 g/h corridor with a 70 g/h working center", () => {
  const recommendation = recommendPitCrew({ round: 2, minutesToStart: 10 });
  assert.ok(recommendation.summary.carbs >= 60);
  assert.ok(recommendation.summary.carbs <= 90);
  assert.equal(pitMetricStatus({ carbs: 70, fluidMl: 500 }, { hours: 3, carbsPerHour: 70 }).carbs, "good");
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


test("vorrat keeps discussed products active by default and extra backyard basics optional", () => {
  assert.ok(PIT_CREW_DEFAULT_STOCK_IDS.includes("isostar"));
  assert.ok(PIT_CREW_DEFAULT_STOCK_IDS.includes("maurten100"));
  assert.ok(PIT_CREW_DEFAULT_STOCK_IDS.includes("fusilli"));
  assert.equal(PIT_CREW_DEFAULT_STOCK_IDS.includes("pizza"), false);
  assert.ok(PIT_CREW_PRODUCTS.some((product) => product.id === "pizza"));
});

test("recommendation is constrained to products that are actually in the race stock", () => {
  const recommendation = recommendPitCrew({
    round: 2,
    minutesToStart: 10,
    products: PIT_CREW_PRODUCTS,
    availableProductIds: ["water", "banana"],
  });
  assert.ok(recommendation.selection.length > 0);
  assert.ok(recommendation.selection.every((entry) => ["water", "banana"].includes(entry.productId)));
  assert.match(recommendation.why, /Vorrat|angepasst/i);
});

test("spontaneous custom food can contribute carbs, sodium and caffeine with an explicit estimate", () => {
  const pizza = buildPitCrewCustomProduct({
    label: "Pizza vom Lieferdienst",
    category: "food",
    portionLabel: "1 Stück",
    carbs: 32,
    sodiumMg: 420,
    caffeineMg: 0,
    taste: "savory",
    digestion: "heavy",
  }, "custom-pizza");
  const products = [...PIT_CREW_PRODUCTS, pizza];
  const summary = summarizePitSelection([{ productId: "custom-pizza", portionId: "1" }], products);
  assert.equal(summary.carbs, 32);
  assert.equal(summary.sodiumMg, 420);
  assert.equal(summary.items[0].digestion, "heavy");
  assert.equal(summary.items[0].nutritionSource, "manual");
});


test("rolling pit average counts pending carry as provisionally taken until a deviation is reported", () => {
  const history = [{
    selection: [],
    carrySelection: [{ productId: "isostar", portionId: "500" }],
    carryStatus: "pending",
    summary: { carbs: 0, fluidMl: 0, caffeineMg: 0 },
    provisionalSummary: { carbs: 35, fluidMl: 500, caffeineMg: 0 },
  }];
  const rolling = rollingPitAverage(history, null, 3);
  assert.equal(rolling.carbsPerHour, 35);
  assert.equal(rolling.fluidPerHour, 500);
});


test("pit catalog distinguishes the athlete's two Isostar drinks and both 226ERS High Energy gels", () => {
  const orange = PIT_CREW_PRODUCTS.find((product) => product.id === "isostar");
  const lemon = PIT_CREW_PRODUCTS.find((product) => product.id === "isostar-long");
  const neutral = PIT_CREW_PRODUCTS.find((product) => product.id === "226ers-high");
  const strawberry = PIT_CREW_PRODUCTS.find((product) => product.id === "226ers-high-strawberry");
  assert.equal(orange?.label, "Isostar Hydrate & Perform Orange");
  assert.equal(orange?.portions.find((portion) => portion.id === "500")?.carbs, 35);
  assert.equal(lemon?.label, "Isostar Long Energy Plus Zitrone");
  assert.equal(lemon?.portions.find((portion) => portion.id === "500")?.carbs, 31);
  assert.equal(neutral?.portions[0]?.carbs, 50);
  assert.equal(strawberry?.portions[0]?.carbs, 50);
  assert.equal(strawberry?.portions[0]?.sodiumMg, 250);
});

test("stable Backyard rotation deliberately schedules gels instead of relying on food and Isostar forever", () => {
  const round4 = recommendPitCrew({ round: 4, minutesToStart: 10, history: [] });
  const round7 = recommendPitCrew({ round: 7, minutesToStart: 10, history: [] });
  assert.equal(round4.selection.some((item) => item.productId === "226ers-high"), true);
  assert.equal(round7.selection.some((item) => item.productId === "226ers-high-strawberry"), true);
  assert.ok(round4.summary.carbs >= 60);
  assert.ok(round7.summary.carbs >= 60);
});

test("Iso fatigue pauses both Isostar drinks and replaces their carbs instead of simply deleting energy", () => {
  const recommendation = recommendPitCrew({ round: 6, minutesToStart: 10, history: [], flags: ["iso-fatigue"] });
  const ids = recommendation.selection.map((item) => item.productId);
  assert.equal(ids.includes("isostar"), false);
  assert.equal(ids.includes("isostar-long"), false);
  assert.equal(ids.includes("water"), true);
  assert.equal(ids.some((id) => ["226ers-high", "226ers-high-strawberry", "maurten100", "sis-beta"].includes(id)), true);
  assert.ok(recommendation.summary.carbs >= 60);
  assert.match(recommendation.why, /Iso satt/i);
});
