import test from "node:test";
import assert from "node:assert/strict";
import { hydration } from "../src/services/insights.js";
import { fuelRecommendationForWorkout } from "../src/services/fuelPlanner.js";

test("Hydration uses Fueling Review fluid as DURING source and weight only for optional sweat calibration", () => {
  const result = hydration(
    { duration: 60, weather: { temperature: 18 } },
    {
      weightBefore: 80,
      weightAfter: 79.5,
      nutritionFluidTotal: 300,
      hydrationExtraMl: 0,
      hydrationThirst: "normal",
      rpe: 5,
    },
  );

  assert.equal(result.measured, true);
  assert.equal(result.reliable, true);
  assert.equal(result.before, 0);
  assert.equal(result.during, 300);
  assert.equal(result.after, 0);
  assert.equal(result.rate, 800);
  assert.equal(result.duringRate, 300);
  assert.equal(result.recommendedLow, 450);
  assert.equal(result.recommendedHigh, 650);
});

test("toilet stop invalidates sweat calibration without losing observed drinking", () => {
  const result = hydration(
    { duration: 90, weather: { temperature: 18 } },
    {
      weightBefore: 80,
      weightAfter: 79.2,
      nutritionFluidTotal: 450,
      hydrationToiletDuring: true,
      hydrationThirst: "normal",
      rpe: 5,
    },
  );

  assert.equal(result.measured, false);
  assert.equal(result.reliable, false);
  assert.equal(result.during, 450);
  assert.equal(result.recommendedLow, null);
  assert.match(result.reason, /Toilettenpause/);
});

test("Hydration stores an experience but no personal corridor without sweat-rate measurement", () => {
  const result = hydration(
    { duration: 60, weather: { temperature: 15 } },
    { nutritionFluidTotal: 300, hydrationThirst: "normal", rpe: 5 },
  );

  assert.equal(result.measured, false);
  assert.equal(result.rate, 460);
  assert.equal(result.during, 300);
  assert.equal(result.recommendedLow, null);
  assert.equal(result.recommendedHigh, null);
});

test("Fuel Planner reduces the generic three-hour long-run hydration target", () => {
  const result = fuelRecommendationForWorkout({
    workout: {
      id: "longrun-hydration-v2",
      date: "2026-08-15",
      title: "Longrun",
      type: "Longrun",
      duration: 180,
      distance: 25,
      temperature: 18,
    },
    fuel: [],
    activities: [],
    reviews: {},
  });

  assert.equal(result.target.fluidLowPerHour, 300);
  assert.equal(result.target.fluidHighPerHour, 500);
  assert.equal(result.target.fluidPerHour, 400);
  assert.equal(result.target.fluidTotal, 1200);
});

test("Fuel Planner uses a reliable 45-180 minute sweat calibration as personal plan basis", () => {
  const result = fuelRecommendationForWorkout({
    workout: {
      id: "race-personal-hydration",
      date: "2026-08-21",
      title: "Halbmarathon Race",
      type: "Race",
      raceEvent: true,
      duration: 139,
      distance: 21.1,
    },
    fuel: [],
    activities: [{ id: "sweat-test", type: "Run", duration: 120, durationSeconds: 7200 }],
    reviews: {
      "sweat-test": {
        weightBefore: 80,
        weightAfter: 78.8,
        nutritionFluidTotal: 600,
        hydrationThirst: "normal",
      },
    },
    mode: "race",
  });

  assert.equal(result.target.personalHydration, true);
  assert.equal(result.target.hydrationSamples, 1);
  assert.equal(result.target.fluidLowPerHour, 500);
  assert.equal(result.target.fluidHighPerHour, 700);
  assert.equal(result.target.fluidPerHour, 500);
  assert.equal(result.target.fluidTotal, 1200);
  assert.match(result.rationale, /nicht als Trinkpflicht/);
});
