import test from "node:test";
import assert from "node:assert/strict";
import {
  fuelRecommendationForWorkout,
  plannedWorkoutForActivity,
  suggestedFuelMode,
} from "../src/services/fuelPlanner.js";

const gel160 = {
  id: "gel-160",
  brand: "Maurten",
  name: "Gel 160",
  category: "Gel",
  carbs: 40,
  sodium: 34,
  caffeine: 0,
  quantity: 8,
  stockUnit: "Stück",
};

const hydrate = {
  id: "hydrate-500",
  brand: "Isostar",
  name: "Hydrate",
  category: "Elektrolyte",
  carbs: 0,
  sodium: 500,
  caffeine: 0,
  preparedVolumeMl: 500,
  servingQuantity: 1,
  servingUnit: "g",
  quantity: 6,
  stockUnit: "Portionen",
};

test("fuel training turns a 77 minute run into a clear consume and pack plan", () => {
  const result = fuelRecommendationForWorkout({
    workout: {
      id: "run-12",
      date: "2026-07-29",
      title: "12 km locker",
      type: "Easy Run",
      distance: 12,
      duration: 77,
    },
    fuel: [gel160, hydrate],
    mode: "training",
  });

  assert.equal(result.applicable, true);
  assert.equal(result.mode, "training");
  assert.equal(result.target.carbsTotal, 40);
  assert.equal(result.target.fluidTotal, 500);
  assert.equal(result.consume.some((item) => item.fuelItemId === "gel-160" && item.quantity === 1), true);
  assert.equal(result.consume.some((item) => item.fuelItemId === "hydrate-500" && item.quantity === 500 && item.unit === "ml"), true);
  assert.equal(result.packSummary, "1 Gel + 500 ml");
  assert.equal(result.reviewItems.length, 2);
  assert.equal(result.reviewItems.every((item) => item.plannedFuel), true);
});

test("the same 77 minute run stays gel-optional in normal mode", () => {
  const result = fuelRecommendationForWorkout({
    workout: {
      id: "normal-run-12",
      date: "2026-07-29",
      title: "12 km locker",
      type: "Easy Run",
      distance: 12,
      duration: 77,
    },
    fuel: [gel160, hydrate],
    mode: "normal",
  });

  assert.equal(result.target.carbsTotal, 0);
  assert.equal(result.consume.some((item) => item.fuelItemId === "gel-160"), false);
  assert.equal(result.consume.some((item) => item.fuelItemId === "hydrate-500"), true);
  assert.equal(result.optional, true);
});

test("carbohydrates from a prepared drink reduce the number of gels", () => {
  const perform = {
    ...hydrate,
    id: "perform",
    name: "Perform",
    category: "Drink Mix",
    carbs: 40,
    sodium: 450,
  };
  const result = fuelRecommendationForWorkout({
    workout: {
      id: "drink-run",
      date: "2026-07-29",
      title: "12 km Long Run",
      type: "Long Run",
      distance: 12,
      duration: 77,
    },
    fuel: [perform, gel160],
    mode: "training",
  });

  assert.equal(result.consume.some((item) => item.fuelItemId === "perform"), true);
  assert.equal(result.consume.some((item) => item.fuelItemId === "gel-160"), false);
  assert.equal(result.actualPlan.carbsTotal, 40);
});

test("long and race plans add one explicit reserve without consuming it in the review", () => {
  const result = fuelRecommendationForWorkout({
    workout: {
      id: "long-run",
      date: "2026-08-02",
      title: "25 km Long Run",
      type: "Long Run",
      distance: 25,
      duration: 180,
    },
    fuel: [gel160, hydrate],
    mode: "training",
  });

  const gelPack = result.pack.find((item) => item.fuelItemId === "gel-160");
  const gelReview = result.reviewItems.find((item) => item.fuelItemId === "gel-160");
  assert.equal(gelPack.reserveQuantity, 1);
  assert.equal(Number(gelReview.quantity), gelPack.consumeQuantity);
  assert.equal(gelPack.quantity, gelPack.consumeQuantity + 1);
});

test("caffeinated products are never selected automatically", () => {
  const result = fuelRecommendationForWorkout({
    workout: {
      id: "caf-run",
      date: "2026-08-02",
      title: "18 km Long Run",
      type: "Long Run",
      distance: 18,
      duration: 120,
    },
    fuel: [{ ...gel160, id: "caf", name: "Gel CAF", caffeine: 100 }, hydrate],
    mode: "training",
  });

  assert.equal(result.consume.some((item) => item.fuelItemId === "caf"), false);
  assert.equal(result.warnings.some((warning) => /Koffein wird bewusst nicht automatisch/i.test(warning)), true);
  assert.equal(result.caffeinePolicy, "Koffein wird nicht automatisch eingeplant.");
});

test("successful reviews personalize the carbohydrate rate and product priority", () => {
  const activity = {
    id: "reviewed-run",
    type: "Run",
    date: "2026-07-20",
    duration: 120,
    distance: 18,
  };
  const reviews = {
    "reviewed-run": {
      stomach: 9,
      energy: 8,
      carbohydratesPerHour: 50,
      nutritionItems: [{ fuelItemId: "gel-160" }],
    },
  };
  const result = fuelRecommendationForWorkout({
    workout: {
      id: "next-long-run",
      date: "2026-08-02",
      title: "20 km Long Run",
      type: "Long Run",
      distance: 20,
      duration: 140,
    },
    fuel: [gel160, hydrate],
    activities: [activity],
    reviews,
    mode: "training",
  });

  assert.equal(result.target.carbsPerHour, 55);
  assert.equal(result.confidence.key, "personal");
  assert.match(result.rationale, /1 gut verträgliche Fuel-Review/);
});

test("a review with stomach symptoms is not learned as a successful fuel combination", () => {
  const activity = {
    id: "gi-review",
    type: "Run",
    name: "ORC Track",
    date: "2026-07-28",
    duration: 75,
    distance: 13.3,
  };
  const reviews = {
    "gi-review": {
      stomach: 8,
      energy: 8,
      carbohydratesPerHour: 50,
      stomachSymptoms: ["Aufstoßen", "Blähungen"],
      nutritionItems: [
        { fuelItemId: "gel-160" },
        { fuelItemId: "hydrate-500" },
      ],
    },
  };
  const result = fuelRecommendationForWorkout({
    workout: {
      id: "next-long-run",
      date: "2026-08-02",
      title: "20 km Long Run",
      type: "Long Run",
      distance: 20,
      duration: 140,
    },
    fuel: [gel160, hydrate],
    activities: [activity],
    reviews,
    mode: "training",
  });

  assert.equal(result.confidence.key, "base");
  assert.doesNotMatch(result.rationale, /gut verträgliche Fuel-Review/);
});

test("long runs default to fuel training and completed activities find their planned run", () => {
  const planned = {
    id: "planned-long",
    date: "2026-08-02",
    title: "20 km Long Run",
    type: "Long Run",
    distance: 20,
    duration: 130,
  };
  const state = {
    plan: [
      { id: "short", date: "2026-08-02", title: "5 km locker", type: "Easy Run", distance: 5, duration: 32 },
      planned,
    ],
  };
  const activity = {
    id: "actual-long",
    date: "2026-08-02",
    type: "Run",
    distance: 19.7,
    duration: 128,
  };

  assert.equal(suggestedFuelMode(planned), "training");
  assert.equal(plannedWorkoutForActivity(state, activity)?.id, "planned-long");
});

test("a gel with millilitre serving data is never mistaken for a sports drink", () => {
  const liquidMeasuredGel = {
    ...gel160,
    id: "beta-gel",
    name: "Beta Fuel Gel",
    category: "Gel",
    servingUnit: "ml",
    servingQuantity: 60,
    carbs: 40,
  };
  const result = fuelRecommendationForWorkout({
    workout: {
      id: "mixed-fuel-run",
      date: "2026-08-16",
      title: "17 km Longrun",
      type: "Long Run",
      distance: 17,
      duration: 108,
    },
    fuel: [liquidMeasuredGel, hydrate],
    mode: "training",
  });

  const drink = result.consume.find((item) => item.unit === "ml");
  const gel = result.consume.find((item) => item.fuelItemId === "beta-gel");
  assert.equal(drink?.fuelItemId, "hydrate-500");
  assert.equal(gel?.unit, "Stück");
  assert.ok(result.actualPlan.carbsTotal < 200);
});


test("a 45 minute race deliberately schedules no during gel", () => {
  const result = fuelRecommendationForWorkout({
    workout: {
      id: "short-race",
      date: "2026-08-21",
      title: "Urland-Lauf",
      type: "Race",
      raceEvent: true,
      distance: 9.62,
      duration: 45,
    },
    fuel: [gel160, hydrate],
    mode: "race",
  });

  assert.equal(result.target.carbsPerHour, 0);
  assert.equal(result.target.carbsTotal, 0);
  assert.equal(result.consume.some((item) => item.fuelItemId === "gel-160"), false);
  assert.match(result.rationale, /45 Minuten.*kein Gel.*DURING-Standard/i);
});
