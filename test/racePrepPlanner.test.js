import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRacePrepPlan,
  RACE_PREP_PRESETS,
  racePrepProfileFromEvent,
  racePrepProfileFromPreset,
} from "../src/services/racePrepPlanner.js";

const gel = {
  id: "gel-160",
  brand: "Maurten",
  name: "Gel 160",
  category: "Gel",
  carbs: 40,
  sodium: 34,
  caffeine: 0,
  quantity: 2,
  stockUnit: "Stück",
};

const state = {
  fuel: [gel],
  activities: [],
  reviews: {},
};

test("Race Prep presets cover short races, ultras, timed races, Backyard and 1000 km", () => {
  const keys = new Set(RACE_PREP_PRESETS.map((item) => item.key));
  ["5k", "10k", "half", "marathon", "50k", "100k", "24h", "backyard", "1000k"].forEach((key) => {
    assert.equal(keys.has(key), true);
  });
});

test("5 km Race Prep does not invent DURING fuel for a short race", () => {
  const plan = buildRacePrepPlan({ profile: racePrepProfileFromPreset("5k"), state });

  assert.equal(plan.valid, true);
  assert.equal(plan.profile.distanceKm, 5);
  assert.equal(plan.recommendation.target.carbsTotal, 0);
  assert.equal(plan.shopping.length, 0);
  assert.equal(plan.phases.map((phase) => phase.key).join(","), "pre,during,post");
});

test("10 km Race Prep keeps DURING fuel optional for a roughly one-hour race", () => {
  const plan = buildRacePrepPlan({ profile: racePrepProfileFromPreset("10k"), state });

  assert.equal(plan.valid, true);
  assert.equal(plan.recommendation.target.carbsTotal, 0);
  assert.equal(plan.recommendation.target.fluidTotal, 0);
});

test("half marathon Race Prep builds an exact product schedule and shopping shortage", () => {
  const plan = buildRacePrepPlan({
    profile: {
      name: "Halbmarathon Test",
      format: "distance",
      distanceKm: 21.1,
      durationMinutes: 120,
    },
    state,
  });

  assert.equal(plan.valid, true);
  assert.equal(plan.strategy.kind, "distance");
  assert.ok(plan.strategy.rows.some((row) => row.fuel.length > 0));
  assert.ok(plan.shopping.some((item) => item.fuelItemId === "gel-160"));
  assert.ok(plan.shoppingNeeded.some((item) => item.fuelItemId === "gel-160"));
});

test("Backyard Race Prep uses the planning horizon as round and shopping horizon", () => {
  const plan = buildRacePrepPlan({
    profile: {
      name: "Backyard Test",
      format: "loop",
      loopKm: 6.7,
      loopIntervalMinutes: 60,
      rounds: 4,
    },
    state: { ...state, fuel: [{ ...gel, quantity: 20 }] },
  });

  assert.equal(plan.valid, true);
  assert.equal(plan.profile.distanceKm, 26.8);
  assert.equal(plan.profile.durationMinutes, 240);
  assert.equal(plan.strategy.kind, "loop");
  assert.equal(plan.strategy.rows.length, 4);
});

test("mission loop events can seed Race Prep without a special Backyard-only model", () => {
  const profile = racePrepProfileFromEvent({
    id: "heartbeat",
    name: "Heartbeat Ultra",
    targetKm: 112,
    loopKm: 6.2,
    loopMode: "time_limit",
    eventTimeLimit: "14:00:00",
  });

  assert.equal(profile.format, "loop");
  assert.equal(profile.durationMinutes, 840);
  assert.equal(profile.rounds, 18);
  assert.equal(profile.distanceKm, 111.6);
});

test("1000 km Race Prep remains calculable and exposes the estimated duration before final purchase", () => {
  const plan = buildRacePrepPlan({ profile: racePrepProfileFromPreset("1000k"), state });

  assert.equal(plan.valid, true);
  assert.equal(plan.profile.distanceKm, 1000);
  assert.equal(plan.profile.durationEstimated, true);
  assert.ok(plan.summary.schedulePoints > 100);
  assert.ok(plan.warnings.some((warning) => /Renndauer ist aktuell geschätzt/.test(warning)));
});
