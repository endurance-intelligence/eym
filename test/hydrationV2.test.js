import test from "node:test";
import assert from "node:assert/strict";
import { hydration } from "../src/services/insights.js";
import { fuelRecommendationForWorkout } from "../src/services/fuelPlanner.js";

test("Hydration V2 keeps PRE and POST separate from DURING sweat-rate math", () => {
  const result = hydration(
    { duration: 60, weather: { temperature: 18 } },
    {
      weightBefore: 80,
      weightAfter: 79.5,
      drinkBeforeMl: 500,
      drinkMl: 300,
      drinkAfterMl: 300,
      urineMl: 0,
      hydrationThirst: "normal",
      rpe: 5,
    },
  );

  assert.equal(result.measured, true);
  assert.equal(result.before, 500);
  assert.equal(result.during, 300);
  assert.equal(result.after, 300);
  assert.equal(result.rate, 800);
  assert.equal(result.duringRate, 300);
  assert.equal(result.deficit, 500);
  assert.equal(result.recoveryGap, 200);
  assert.equal(result.recommendedLow, 450);
  assert.equal(result.recommendedHigh, 650);
});

test("Hydration V2 estimates conservatively when no sweat-rate measurement exists", () => {
  const result = hydration(
    { duration: 60, weather: { temperature: 15 } },
    { drinkMl: 300, hydrationThirst: "normal", rpe: 5 },
  );

  assert.equal(result.measured, false);
  assert.equal(result.rate, 460);
  assert.equal(result.recommendedLow, 250);
  assert.equal(result.recommendedHigh, 300);
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

test("Fuel Planner uses the conservative end of a reliable personal hydration range as plan basis", () => {
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
        drinkMl: 600,
        urineMl: 0,
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
