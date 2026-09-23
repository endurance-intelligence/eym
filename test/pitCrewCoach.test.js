import test from "node:test";
import assert from "node:assert/strict";
import {
  assessPitSelection,
  buildPitCrewCustomProduct,
  buildPitCrewPackingList,
  buildPitCrewStartStock,
  PIT_CREW_DEFAULT_GEL_PRIORITY,
  PIT_CREW_DEFAULT_STOCK_IDS,
  PIT_CREW_PRODUCTS,
  pitCrewPairingAssessment,
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
  assert.deepEqual(recommendation.selection.map((item) => item.productId), ["isostar", "226ers-high"]);
  assert.equal(recommendation.summary.carbs, 71);
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

test("caffeine is never injected automatically and tired status asks the crew to choose the source", () => {
  const stable = recommendPitCrew({ round: 12, minutesToStart: 10, history: [], flags: [] });
  assert.equal(stable.selection.some((item) => ["cola", "redbull", "226ers-high-cherry-caf"].includes(item.productId)), false);

  const tired = recommendPitCrew({ round: 2, minutesToStart: 10, history: [], flags: ["tired"] });
  assert.equal(tired.selection.some((item) => ["cola", "redbull", "226ers-high-cherry-caf"].includes(item.productId)), false);
  assert.match(tired.why, /Gel oder Getränk/);

  const caffeinatedHistory = [
    { selection: [{ productId: "redbull", portionId: "150" }] },
    { selection: [{ productId: "cola", portionId: "200" }] },
  ];
  const tiredAgain = recommendPitCrew({ round: 4, minutesToStart: 10, history: caffeinatedHistory, flags: ["tired"] });
  assert.equal(tiredAgain.selection.some((item) => ["cola", "redbull", "226ers-high-cherry-caf"].includes(item.productId)), false);
  assert.match(tiredAgain.why, /bereits .* mg Koffein erfasst/);
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
  assert.equal(summary.carbs, 69.4);
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
  assert.equal(summary.carbs, 62.1);
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


test("rolling pit average excludes pending carry until return confirmation", () => {
  const history = [{
    selection: [],
    carrySelection: [{ productId: "isostar", portionId: "500" }],
    carryStatus: "pending",
    summary: { carbs: 0, fluidMl: 0, caffeineMg: 0 },
    provisionalSummary: { carbs: 35, fluidMl: 500, caffeineMg: 0 },
  }];
  const rolling = rollingPitAverage(history, null, 3);
  assert.equal(rolling.carbsPerHour, 0);
  assert.equal(rolling.fluidPerHour, 0);
});


test("pit catalog distinguishes both Isostar drinks, regular 226ERS gels and the manual caffeine joker", () => {
  const orange = PIT_CREW_PRODUCTS.find((product) => product.id === "isostar");
  const lemon = PIT_CREW_PRODUCTS.find((product) => product.id === "isostar-long");
  const neutral = PIT_CREW_PRODUCTS.find((product) => product.id === "226ers-high");
  const strawberry = PIT_CREW_PRODUCTS.find((product) => product.id === "226ers-high-strawberry");
  const cherryCaf = PIT_CREW_PRODUCTS.find((product) => product.id === "226ers-high-cherry-caf");
  assert.equal(orange?.label, "Isostar Hydrate & Perform Orange");
  assert.equal(orange?.portions.find((portion) => portion.id === "500")?.carbs, 35);
  assert.equal(lemon?.label, "Isostar Long Energy Plus Zitrone");
  assert.equal(lemon?.nutritionSource, "label");
  assert.equal(lemon?.estimated, undefined);
  assert.deepEqual(lemon?.mixing, { powderG: 38, drinkMl: 500 });
  assert.deepEqual(lemon?.manufacturerUse, { duringMl: 150, everyMinutes: 15 });
  const lemon500 = lemon?.portions.find((portion) => portion.id === "500");
  assert.equal(lemon500?.carbs, 30.8);
  assert.equal(lemon500?.sugarG, 18.6);
  assert.equal(lemon500?.saltG, 1.44);
  assert.equal(lemon500?.sodiumMg, 578);
  assert.equal(lemon500?.potassiumMg, 334);
  assert.equal(lemon500?.magnesiumMg, 87);
  assert.equal(cherryCaf?.label, "226ERS High Energy Cherry + 2× Caffeine");
  assert.equal(cherryCaf?.manualOnly, true);
  assert.equal(cherryCaf?.portions[0]?.carbs, 50);
  assert.equal(cherryCaf?.portions[0]?.caffeineMg, 160);
  assert.equal(summarizePitSelection([{ productId: "226ers-high-cherry-caf", portionId: "1" }]).caffeineMg, 160);
  assert.equal(lemon500?.calciumMg, 190);
  assert.equal(lemon500?.bcaaG, 0.99);
  assert.equal(neutral?.portions[0]?.carbs, 50);
  assert.equal(strawberry?.portions[0]?.carbs, 50);
  assert.equal(strawberry?.portions[0]?.sodiumMg, 250);
});

test("Long Energy label nutrients scale with actual intake instead of staying at a database estimate", () => {
  const full = summarizePitSelection([{ productId: "isostar-long", portionId: "500" }]);
  const half = summarizePitSelection([{ productId: "isostar-long", portionId: "500", intakeFactor: 0.5 }]);
  assert.equal(full.carbs, 30.8);
  assert.equal(full.sodiumMg, 578);
  assert.equal(full.potassiumMg, 334);
  assert.equal(full.magnesiumMg, 87);
  assert.equal(full.calciumMg, 190);
  assert.equal(full.saltG, 1.44);
  assert.equal(full.estimated, false);
  assert.equal(half.carbs, 15.4);
  assert.equal(half.sodiumMg, 289);
  assert.equal(half.saltG, 0.72);
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
  assert.equal(ids.includes("waldmeister"), true);
  assert.ok(recommendation.summary.carbs >= 60);
  assert.match(recommendation.why, /Iso satt/i);
});


test("liquid-only mode removes solid food and keeps carbs inside the Backyard corridor", () => {
  const recommendation = recommendPitCrew({ round: 9, minutesToStart: 10, flags: ["liquid-only"] });
  const ids = recommendation.selection.map((item) => item.productId);
  assert.equal(ids.some((id) => ["banana", "milk-roll", "fusilli", "haribo", "salt-sticks", "cucumber"].includes(id)), false);
  assert.equal(ids.some((id) => ["226ers-high", "226ers-high-strawberry", "sis-beta", "maurten100"].includes(id)), true);
  assert.ok(recommendation.summary.carbs >= 60);
  assert.ok(recommendation.summary.carbs <= 90);
  assert.match(recommendation.why, /Nur flüssig/i);
});

test("liquid-only plus Iso fatigue uses Waldmeister and preferred gels without Maurten by default", () => {
  const recommendation = recommendPitCrew({ round: 10, minutesToStart: 10, flags: ["liquid-only", "iso-fatigue"] });
  const ids = recommendation.selection.map((item) => item.productId);
  assert.equal(ids.includes("isostar"), false);
  assert.equal(ids.includes("isostar-long"), false);
  assert.equal(ids.includes("waldmeister"), true);
  assert.equal(ids.includes("maurten100"), false);
  assert.equal(ids.includes("226ers-high"), true);
  assert.ok(recommendation.summary.carbs >= 60);
  assert.ok(recommendation.summary.carbs <= 90);
});

test("gel priority can be reordered while Maurten stays reserve by default", () => {
  assert.deepEqual(PIT_CREW_DEFAULT_GEL_PRIORITY, ["226ers-high", "226ers-high-strawberry", "sis-beta", "maurten100"]);
  const recommendation = recommendPitCrew({
    round: 6,
    minutesToStart: 10,
    flags: ["liquid-only", "iso-fatigue"],
    gelPriority: ["sis-beta", "226ers-high-strawberry", "226ers-high", "maurten100"],
  });
  assert.equal(recommendation.selection.some((item) => item.productId === "sis-beta"), true);
});



test("first Backyard loop uses breakfast as the base and only schedules a drink", () => {
  const first = recommendPitCrew({ round: 1, minutesToStart: 10, history: [] });
  assert.equal(first.selection.length, 1);
  assert.equal(first.selection[0]?.productId, "isostar");
  assert.equal(first.selection[0]?.portionId, "500");
  assert.equal(first.selection[0]?.timing, "carry");
  assert.match(first.why, /Frühstück ist die Energiebasis/);
});

test("stable Backyard rotation separates awkward sweet combinations after the start loop", () => {
  const history = [{ round: 0, selection: [{ productId: "isostar", portionId: "500", timing: "carry" }], summary: { carbs: 35, fluidMl: 500 } }];
  const next = recommendPitCrew({ round: 2, minutesToStart: 10, history });
  assert.equal(pitCrewPairingAssessment(next.selection).good, true);
  const pitIds = next.selection.filter((entry) => (entry.timing || "now") === "now").map((entry) => entry.productId);
  assert.equal(pitIds.includes("banana") && pitIds.includes("haribo"), false);
});

test("Haribo repetition is penalized so the coach does not prescribe Roulette every loop", () => {
  const history = [
    { selection: [{ productId: "haribo", portionId: "10g", timing: "carry" }], summary: { carbs: 9.6 } },
    { selection: [{ productId: "haribo", portionId: "10g", timing: "carry" }], summary: { carbs: 9.6 } },
  ];
  const next = recommendPitCrew({ round: 3, minutesToStart: 10, history });
  assert.equal(next.selection.some((entry) => entry.productId === "haribo"), false);
});

test("hot-weather refresh never pairs KNAX with banana or another sweet solid in the same pit", () => {
  const result = recommendPitCrew({ round: 3, minutesToStart: 10, history: [], weather: ["hot"] });
  assert.equal(pitCrewPairingAssessment(result.selection).good, true);
  const pitIds = result.selection.filter((entry) => (entry.timing || "now") === "now").map((entry) => entry.productId);
  if (pitIds.includes("cucumber")) {
    assert.equal(pitIds.some((id) => ["banana", "milk-roll", "haribo"].includes(id)), false);
  }
});

test("36 hour open Backyard start stock scales supplies and preserves a reserve", () => {
  const plan = buildPitCrewStartStock({ eventLimitMode: "open", planningHorizonHours: 36 });
  assert.equal(plan.hours, 36);
  assert.equal(plan.reservePercent, 15);
  assert.equal(plan.targetCarbs, Math.round(70 * 36 * 1.15));
  assert.ok(plan.items.find((item) => item.id === "water")?.quantity >= 20);
  assert.ok(plan.items.find((item) => item.id === "226ers-high")?.priority === 1);
  assert.ok(plan.items.find((item) => item.id === "maurten100")?.priority === 4);
});

test("24 hour start stock uses practical shopping packages for drinks and Haribo", () => {
  const plan = buildPitCrewStartStock({ eventLimitMode: "open", planningHorizonHours: 24 });
  const isostar = plan.items.find((item) => item.id === "isostar");
  const longEnergy = plan.items.find((item) => item.id === "isostar-long");
  const waldmeister = plan.items.find((item) => item.id === "waldmeister");
  const dryll = plan.items.find((item) => item.id === "dryll");
  const redbull = plan.items.find((item) => item.id === "redbull");
  const haribo = plan.items.find((item) => item.id === "haribo");
  const milkRoll = plan.items.find((item) => item.id === "milk-roll");

  assert.equal(isostar?.quantity, 1);
  assert.equal(isostar?.unit, "400-g-Dose");
  assert.match(isostar?.note || "", /400 g Dose = 1 ausreichend/);
  assert.match(isostar?.note || "", /7 × 500 ml = 280 g Pulver/);

  assert.equal(longEnergy?.quantity, 1);
  assert.equal(longEnergy?.unit, "570-g-Dose");
  assert.match(longEnergy?.note || "", /570 g Dose = 1 ausreichend/);
  assert.match(longEnergy?.note || "", /6 × 500 ml = 228 g Pulver/);

  assert.equal(waldmeister?.quantity, 1);
  assert.equal(waldmeister?.unit, "0,5-l-Flasche");
  assert.match(waldmeister?.note || "", /0,5 l Flasche = 1 ausreichend/);
  assert.match(waldmeister?.note || "", /5 × 500 ml Race-Mix/);

  assert.equal(dryll?.quantity, 6);
  assert.equal(dryll?.unit, "Dosen à 330 ml");
  assert.equal(redbull?.quantity, 3);
  assert.equal(redbull?.unit, "Dosen à 250 ml");

  assert.equal(haribo?.quantity, 2);
  assert.equal(haribo?.unit, "Packungen à 6 Rollen");
  assert.match(haribo?.note || "", /12 Rollen gesamt/);

  assert.equal(milkRoll?.quantity, 6);
  assert.equal(milkRoll?.unit, "Stück");
  assert.match(milkRoll?.note || "", /480-g-Packung = 12 Stück à 40 g/);
  assert.match(milkRoll?.note || "", /1 Packung reicht/);
});


test("start stock keeps two high-caffeine Cherry gels as a manual joker outside normal gel rotation", () => {
  const plan = buildPitCrewStartStock({ eventLimitMode: "open", planningHorizonHours: 24 });
  const cherry = plan.items.find((item) => item.id === "226ers-high-cherry-caf");
  assert.equal(cherry?.quantity, 2);
  assert.equal(cherry?.unit, "Gels");
  assert.match(cherry?.note || "", /160 mg Koffein/);
});

test("24 hour stock tracks Cola as 330 ml cans instead of litres", () => {
  const plan = buildPitCrewStartStock({ eventLimitMode: "open", planningHorizonHours: 24 });
  const cola = plan.items.find((item) => item.id === "cola");
  const product = PIT_CREW_PRODUCTS.find((item) => item.id === "cola");
  assert.equal(cola?.quantity, 7);
  assert.equal(cola?.unit, "Dosen à 330 ml");
  assert.match(cola?.note || "", /2,31 l Gesamtmenge/);
  assert.equal(product?.packageMl, 330);
  assert.match(product?.stockNote || "", /330-ml-Dose/);
});

test("Pit Crew packing list scales wearable quantities with the planning horizon", () => {
  const day = buildPitCrewPackingList({ eventLimitMode: "open", planningHorizonHours: 24 });
  const long = buildPitCrewPackingList({ eventLimitMode: "open", planningHorizonHours: 36 });
  const find = (groups, id) => groups.flatMap((group) => group.items).find((item) => item.id === id);
  assert.equal(find(day, "run-shirts")?.quantity, 4);
  assert.equal(find(day, "run-socks")?.quantity, 8);
  assert.equal(find(long, "run-shirts")?.quantity, 6);
  assert.equal(find(long, "run-socks")?.quantity, 12);
  assert.equal(find(day, "pavilion")?.quantity, 1);
  assert.equal(find(day, "garmin-cable")?.quantity, 1);
});



test("Ibis milk rolls are tracked as individual 40 g pieces with retail-pack context", () => {
  const product = PIT_CREW_PRODUCTS.find((candidate) => candidate.id === "milk-roll");
  const piece = product?.portions.find((portion) => portion.id === "1");
  assert.equal(product?.packageG, 480);
  assert.equal(product?.piecesPerPackage, 12);
  assert.equal(product?.pieceG, 40);
  assert.equal(product?.nutritionSource, "label");
  assert.equal(piece?.carbs, 21.4);
  assert.match(product?.stockNote || "", /12 Stück à 40 g/);
});

test("Haribo Roulette uses the current 150 g retail pack with six 25 g rolls", () => {
  const roulette = PIT_CREW_PRODUCTS.find((product) => product.id === "haribo");
  const half = roulette?.portions.find((portion) => portion.label === "½ Rolle");
  const full = roulette?.portions.find((portion) => portion.label === "1 Rolle");
  assert.equal(roulette?.packageG, 150);
  assert.equal(roulette?.rollsPerPackage, 6);
  assert.equal(roulette?.rollG, 25);
  assert.equal(half?.carbs, 9.6);
  assert.equal(full?.carbs, 19.3);
});

test("Long Energy and Waldmeister expose their real retail package metadata", () => {
  const longEnergy = PIT_CREW_PRODUCTS.find((product) => product.id === "isostar-long");
  const waldmeister = PIT_CREW_PRODUCTS.find((product) => product.id === "waldmeister");
  assert.equal(longEnergy?.packages?.[0]?.powderG, 570);
  assert.equal(longEnergy?.packages?.[0]?.portions, 15);
  assert.equal(waldmeister?.packageMl, 500);
  assert.equal(waldmeister?.syrupCarbsPer100Ml, 72.9);
  assert.equal(waldmeister?.manufacturerMixRatio, "1:5");
});

test("Hydrate & Perform label metadata keeps 400 g as ten 500 ml portions", () => {
  const product = PIT_CREW_PRODUCTS.find((candidate) => candidate.id === "isostar");
  assert.deepEqual(product?.mixing, { powderG: 40, drinkMl: 500 });
  assert.equal(product?.packages?.[0]?.powderG, 400);
  assert.equal(product?.packages?.[0]?.portions, 10);
});

test("Waldmeister is an estimated 45 g carb drink per 500 ml and supports Iso fatigue", () => {
  const product = PIT_CREW_PRODUCTS.find((candidate) => candidate.id === "waldmeister");
  const portion = product?.portions.find((candidate) => candidate.id === "500");
  assert.equal(product?.estimated, true);
  assert.equal(product?.nutritionSource, "estimated-mix");
  assert.equal(portion?.carbs, 45);
  assert.equal(portion?.fluidMl, 500);

  const recommendation = recommendPitCrew({ round: 8, minutesToStart: 10, flags: ["iso-fatigue"] });
  const ids = recommendation.selection.map((item) => item.productId);
  assert.equal(ids.includes("isostar"), false);
  assert.equal(ids.includes("isostar-long"), false);
  assert.equal(ids.includes("waldmeister"), true);
  assert.ok(recommendation.summary.carbs >= 60);
});


test("KNAX cucumber uses the actual jar and label nutrition instead of a fresh cucumber", () => {
  const product = PIT_CREW_PRODUCTS.find((candidate) => candidate.id === "cucumber");
  const portion50 = product?.portions?.find((portion) => portion.id === "50");
  const plan24 = buildPitCrewStartStock({ planningHorizonHours: 24 });
  const stock24 = plan24.items.find((item) => item.id === "cucumber");
  const plan36 = buildPitCrewStartStock({ planningHorizonHours: 36 });
  const stock36 = plan36.items.find((item) => item.id === "cucumber");

  assert.equal(product?.label, "Hengstenberg KNAX Gewürzgurken");
  assert.equal(product?.estimated, undefined);
  assert.ok(product?.traits?.includes("salty"));
  assert.equal(portion50?.carbs, 2);
  assert.match(product?.stockNote || "", /360 g Abtropfgewicht/);
  assert.equal(stock24?.quantity, 1);
  assert.equal(stock24?.unit, "Glas à 360 g Abtropfgewicht");
  assert.match(stock24?.note || "", /7 × 50-g-Portionen/);
  assert.equal(stock36?.quantity, 2);
});
