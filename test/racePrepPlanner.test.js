import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRacePrepPlan,
  RACE_PREP_PRESETS,
  racePrepFuelEvidence,
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
  quantity: 0,
  stockUnit: "Stück",
};

const bar = {
  id: "bar-1",
  brand: "Test",
  name: "Rice Bar",
  category: "Riegel",
  carbs: 30,
  sodium: 120,
  caffeine: 0,
  quantity: 0,
  stockUnit: "Stück",
};

const evidenceState = {
  fuel: [gel, bar],
  activities: [
    { id: "run-1", type: "Run", distance: 30, duration: 210, date: "2026-08-01" },
    { id: "run-2", type: "Run", distance: 20, duration: 140, date: "2026-08-05" },
  ],
  reviews: {
    "run-1": {
      stomach: 9,
      energy: 8,
      stomachSymptoms: [],
      nutritionItems: [
        { fuelItemId: "gel-160", intakeTolerance: "good", intakeTimingMode: "minute", intakeTimingValue: "90" },
        { fuelItemId: "bar-1", intakeTolerance: "good", intakeTimingMode: "km", intakeTimingValue: "18" },
      ],
    },
    "run-2": {
      stomach: 9,
      energy: 8,
      stomachSymptoms: [],
      nutritionItems: [
        { fuelItemId: "gel-160", intakeTolerance: "good", intakeTimingMode: "minute", intakeTimingValue: "70" },
      ],
    },
  },
};

const emptyState = { fuel: [gel], activities: [], reviews: {} };

test("Race Prep presets cover short races, ultras, timed races, Backyard and 1000 km", () => {
  const keys = new Set(RACE_PREP_PRESETS.map((item) => item.key));
  ["5k", "10k", "half", "marathon", "50k", "100k", "24h", "backyard", "1000k"].forEach((key) => {
    assert.equal(keys.has(key), true);
  });
});

test("5 km Race Prep does not invent DURING fuel for a short race", () => {
  const plan = buildRacePrepPlan({ profile: racePrepProfileFromPreset("5k"), state: emptyState });
  assert.equal(plan.valid, true);
  assert.equal(plan.profile.distanceKm, 5);
  assert.equal(plan.recommendation.target.carbsTotal, 0);
  assert.equal(plan.recommendation.consume.length, 0);
  assert.equal(plan.phases.map((phase) => phase.key).join(","), "pre,during,post");
});

test("10 km Race Prep keeps DURING fuel optional for a roughly one-hour race", () => {
  const plan = buildRacePrepPlan({ profile: racePrepProfileFromPreset("10k"), state: emptyState });
  assert.equal(plan.valid, true);
  assert.equal(plan.recommendation.target.carbsTotal, 0);
  assert.equal(plan.recommendation.target.fluidTotal, 0);
});

test("training evidence ranks positively reviewed products even when stock is zero", () => {
  const evidence = racePrepFuelEvidence(evidenceState);
  assert.equal(evidence[0].id, "gel-160");
  assert.equal(evidence[0].tone, "good");
  assert.equal(evidence[0].recommended, true);
  assert.match(evidence[0].detail, /2× gut vertragen/);
});

test("half marathon Race Prep rotates training-proven products and ignores inventory", () => {
  const plan = buildRacePrepPlan({
    profile: { name: "Halbmarathon Test", format: "distance", distanceKm: 21.1, durationMinutes: 120 },
    state: evidenceState,
  });
  assert.equal(plan.valid, true);
  assert.equal(plan.strategy.kind, "distance");
  assert.deepEqual(new Set(plan.effectiveFuelItemIds), new Set(["gel-160", "bar-1"]));
  assert.ok(plan.recommendation.consume.some((item) => item.fuelItemId === "gel-160"));
  assert.ok(plan.recommendation.consume.some((item) => item.fuelItemId === "bar-1"));
  assert.equal(plan.shoppingNeeded.length, 0);
});

test("user can intentionally choose no product without a 275-gel fallback", () => {
  const plan = buildRacePrepPlan({
    profile: { name: "Ultra ohne Auswahl", format: "distance", distanceKm: 100, durationMinutes: 720, fuelItemIds: [] },
    state: evidenceState,
  });
  assert.equal(plan.valid, true);
  assert.equal(plan.recommendation.consume.length, 0);
  assert.ok(plan.warnings.some((warning) => /keine geeignete Fuel-Quelle ausgewählt/.test(warning)));
});

test("manual food can be added without pretending it is training-proven", () => {
  const plan = buildRacePrepPlan({
    profile: {
      name: "50k",
      format: "distance",
      distanceKm: 50,
      durationMinutes: 360,
      fuelItemIds: ["gel-160"],
      manualFuelItems: [{ id: "toast", name: "Toast + Honig", carbs: 35, sodium: 100, caffeine: 0 }],
    },
    state: evidenceState,
  });
  assert.ok(plan.recommendation.consume.some((item) => item.product === "Toast + Honig"));
  assert.ok(plan.recommendation.consume.find((item) => item.product === "Toast + Honig").evidenceLabel.includes("Manuell ergänzt"));
});

test("Backyard Race Prep uses the planning horizon as round horizon", () => {
  const plan = buildRacePrepPlan({
    profile: { name: "Backyard Test", format: "loop", loopKm: 6.7, loopIntervalMinutes: 60, rounds: 4 },
    state: evidenceState,
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

test("1000 km Race Prep remains calculable without turning inventory into a planning constraint", () => {
  const plan = buildRacePrepPlan({ profile: racePrepProfileFromPreset("1000k"), state: evidenceState });
  assert.equal(plan.valid, true);
  assert.equal(plan.profile.distanceKm, 1000);
  assert.equal(plan.profile.durationEstimated, true);
  assert.ok(plan.summary.schedulePoints > 100);
  assert.ok(plan.recommendation.consume.length >= 2);
  assert.ok(plan.warnings.some((warning) => /Renndauer ist aktuell geschätzt/.test(warning)));
});
