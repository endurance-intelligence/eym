import test from "node:test";
import assert from "node:assert/strict";
import { backyardCrewPlan, raceFuelStrategy } from "../src/services/raceFuelStrategy.js";
import { fuelRecommendationForWorkout, suggestedFuelMode } from "../src/services/fuelPlanner.js";

test("Backyard race strategy creates one crew-ready row per planned round", () => {
  const strategy = raceFuelStrategy({
    workout: {
      id: "loop-race",
      title: "Backyard Ultra",
      type: "Backyard",
      distance: 26.8,
      loopTraining: { loops: 4, loopKm: 6.7 },
    },
    recommendation: {
      applicable: true,
      mode: "race",
      durationMinutes: 240,
      distanceKm: 26.8,
      target: { fluidTotal: 1200, hydrationSamples: 2 },
      consume: [
        { fuelItemId: "gel", product: "Maurten Gel 100", quantity: 2, unit: "Stück" },
      ],
    },
    reviews: {
      run1: {
        nutritionItems: [{
          fuelItemId: "gel",
          intakeTolerance: "good",
          intakeTimingMode: "round",
          intakeTimingValue: "2",
        }],
      },
    },
  });

  assert.equal(strategy.kind, "loop");
  assert.equal(strategy.rows.length, 4);
  assert.equal(strategy.rows.reduce((sum, row) => sum + row.drinkMl, 0), 1200);
  assert.deepEqual(strategy.rows.filter((row) => row.fuel.length).map((row) => row.marker), ["Runde 2", "Runde 4"]);
  assert.match(strategy.rows[1].fuel[0].evidence, /gut vertragen/);
  assert.equal(strategy.evidence.hydrationSamples, 2);
});

test("marathon race strategy combines kilometre and time markers", () => {
  const strategy = raceFuelStrategy({
    workout: { id: "marathon", title: "Marathon", type: "Race", distance: 42.2 },
    recommendation: {
      applicable: true,
      mode: "race",
      durationMinutes: 240,
      distanceKm: 42.2,
      target: { fluidTotal: 1600, hydrationSamples: 0 },
      consume: [
        { fuelItemId: "gel", product: "Gel", quantity: 4, unit: "Stück" },
      ],
    },
    reviews: {},
  });

  assert.equal(strategy.kind, "distance");
  assert.ok(strategy.rows.length > 4);
  assert.ok(strategy.rows.every((row) => /^km /.test(row.marker)));
  assert.ok(strategy.rows.every((row) => /Min/.test(row.secondary)));
  assert.equal(strategy.rows.reduce((sum, row) => sum + row.drinkMl, 0), 1600);
});

test("explicit GI tolerance steers Fuel Partner away from a repeatedly bad product", () => {
  const workout = { id: "race", title: "Marathon Race", type: "Race", distance: 42.2, duration: 240 };
  const fuel = [
    { id: "bad", brand: "A", name: "Bad Gel", category: "Gel", carbs: 25, quantity: 20, stockUnit: "Stück", caffeine: 0 },
    { id: "good", brand: "B", name: "Good Gel", category: "Gel", carbs: 25, quantity: 20, stockUnit: "Stück", caffeine: 0 },
  ];
  const activities = [
    { id: "a1", type: "Run", date: "2026-08-01", duration: 120, distance: 20 },
    { id: "a2", type: "Run", date: "2026-08-02", duration: 120, distance: 20 },
  ];
  const reviews = {
    a1: { stomach: 8, energy: 8, nutritionCarbsTotal: 80, nutritionItems: [{ fuelItemId: "bad", intakeTolerance: "bad" }] },
    a2: { stomach: 8, energy: 8, nutritionCarbsTotal: 80, nutritionItems: [{ fuelItemId: "good", intakeTolerance: "good" }] },
  };

  const result = fuelRecommendationForWorkout({ workout, fuel, activities, reviews, mode: "race" });
  assert.equal(result.consume.find((entry) => entry.unit !== "ml")?.fuelItemId, "good");
});


test("Backyard crew plan exposes one preparation row per race round plus a quick return checklist", () => {
  const crew = backyardCrewPlan({
    kind: "loop",
    rows: [
      { key: "round-1", marker: "Runde 1", secondary: "6,7 km gesamt", drinkMl: 300, fuel: [] },
      { key: "round-2", marker: "Runde 2", secondary: "13,4 km gesamt", drinkMl: 350, fuel: [{ product: "Gel 100", detail: "1 Stück" }] },
    ],
  });

  assert.equal(crew.totalRounds, 2);
  assert.equal(crew.rows[1].drinkMl, 350);
  assert.equal(crew.rows[1].fuel[0].product, "Gel 100");
  assert.ok(crew.checklist.some((item) => /Magen/.test(item)));
  assert.ok(crew.checklist.some((item) => /süß/.test(item)));
});

test("crew mode stays hidden for non-loop race strategies", () => {
  assert.equal(backyardCrewPlan({ kind: "distance", rows: [] }), null);
});


test("planned race events open Fuel Partner in race mode automatically", () => {
  assert.equal(suggestedFuelMode({ title: "Backyard", type: "Backyard", raceEvent: true, distance: 100 }), "race");
});
