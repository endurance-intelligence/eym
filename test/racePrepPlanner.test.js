import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRacePrepPlan,
  RACE_PREP_PRESETS,
  racePrepFuelEvidence,
  racePrepProfileFromEvent,
  racePrepProfileWithEvidenceDefaults,
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

test("half marathon Race Prep shows evidence but never preselects products", () => {
  const profile = racePrepProfileWithEvidenceDefaults(
    { name: "Halbmarathon Test", format: "distance", distanceKm: 21.1, durationMinutes: 120 },
    evidenceState,
  );
  const plan = buildRacePrepPlan({ profile, state: evidenceState });
  assert.equal(plan.valid, true);
  assert.equal(plan.strategy.kind, "distance");
  assert.deepEqual(plan.effectiveFuelItemIds, []);
  assert.equal(plan.recommendation.consume.length, 0);
  assert.ok(plan.evidenceCatalog.some((entry) => entry.id === "gel-160" && entry.tone === "good"));
  assert.ok(plan.warnings.some((warning) => /keine geeignete Fuel-Quelle ausgewählt/.test(warning)));
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

test("a consciously selected out-of-stock product stays allowed but raises a stock warning", () => {
  const plan = buildRacePrepPlan({
    profile: { name: "HM", format: "distance", distanceKm: 21.1, durationMinutes: 120, fuelItemIds: ["gel-160"] },
    state: evidenceState,
  });
  assert.ok(plan.recommendation.consume.some((item) => item.fuelItemId === "gel-160"));
  assert.ok(plan.warnings.some((warning) => /aktuell nicht im Bestand/.test(warning)));
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
  assert.equal(plan.recommendation.consume.length, 0);
  assert.ok(plan.warnings.some((warning) => /keine geeignete Fuel-Quelle ausgewählt/.test(warning)));
  assert.ok(plan.warnings.some((warning) => /Renndauer ist aktuell geschätzt/.test(warning)));
});

test("Race Prep keeps a training-proven electrolyte drink separate from gels", () => {
  const electrolyte = {
    id: "electrolyte-500",
    brand: "Isostar",
    name: "Hydrate",
    category: "Elektrolyte",
    carbs: 0,
    sodium: 450,
    caffeine: 0,
    preparedVolumeMl: 500,
    stockUnit: "Portionen",
  };
  const state = {
    fuel: [gel, electrolyte],
    activities: [{ id: "drink-test", type: "Run", distance: 24, duration: 150, date: "2026-08-08" }],
    reviews: {
      "drink-test": {
        stomach: 9,
        stomachSymptoms: [],
        nutritionItems: [
          { fuelItemId: "gel-160", intakeTolerance: "good" },
          { fuelItemId: "electrolyte-500", intakeTolerance: "good" },
        ],
      },
    },
  };

  const profile = racePrepProfileWithEvidenceDefaults(
    { name: "50k", format: "distance", distanceKm: 50, durationMinutes: 360, fuelItemIds: ["gel-160", "electrolyte-500"] },
    state,
  );
  const plan = buildRacePrepPlan({ profile, state });

  assert.deepEqual(new Set(plan.effectiveFuelItemIds), new Set(["gel-160", "electrolyte-500"]));
  assert.equal(plan.recommendation.hydrationProduct?.product, "Isostar Hydrate");
  assert.ok(plan.strategy.rows.some((row) => row.drinkMl > 0 && row.drinkProduct === "Isostar Hydrate"));
  assert.ok(plan.recommendation.consume.some((item) => item.fuelItemId === "gel-160" && item.unit !== "ml"));
  assert.ok(plan.recommendation.consume.some((item) => item.fuelItemId === "electrolyte-500" && item.unit === "ml"));
});

test("a short race keeps a proven drink visible without preselecting it", () => {
  const electrolyte = {
    id: "short-drink",
    name: "Trusted Electrolyte",
    category: "Elektrolyte",
    carbs: 0,
    sodium: 400,
    preparedVolumeMl: 500,
  };
  const state = {
    fuel: [electrolyte],
    activities: [{ id: "short-drink-test", duration: 90 }],
    reviews: {
      "short-drink-test": {
        stomach: 9,
        stomachSymptoms: [],
        nutritionItems: [{ fuelItemId: "short-drink", intakeTolerance: "good" }],
      },
    },
  };
  const profile = racePrepProfileWithEvidenceDefaults(
    { name: "10k", format: "distance", distanceKm: 10, durationMinutes: 45 },
    state,
  );
  const plan = buildRacePrepPlan({ profile, state });

  assert.equal(plan.summary.schedulePoints, 0);
  assert.deepEqual(plan.effectiveFuelItemIds, []);
  assert.equal(plan.recommendation.hydrationProduct, null);
  assert.ok(plan.evidenceCatalog.some((entry) => entry.id === "short-drink" && entry.tone === "good"));
});

test("carbohydrate drink is counted against the same race budget and suppresses unnecessary gels", () => {
  const drink = {
    id: "isostar-500",
    brand: "Isostar",
    name: "Hydrate & Perform",
    category: "Drink Mix",
    carbs: 35,
    sodium: 300,
    caffeine: 0,
    preparedVolumeMl: 500,
    quantity: 0,
    stockUnit: "Portionen",
  };
  const gel100 = {
    id: "maurten-100",
    brand: "Maurten",
    name: "Gel 100",
    category: "Gel",
    carbs: 25,
    sodium: 34,
    caffeine: 0,
    quantity: 0,
    stockUnit: "Stück",
  };
  const state = {
    fuel: [drink, gel100],
    activities: [{ id: "sweat-650", type: "Run", duration: 120, durationSeconds: 7200 }],
    reviews: {
      "sweat-650": {
        weightBefore: 80,
        weightAfter: 78.2,
        drinkMl: 600,
        urineMl: 0,
        hydrationThirst: "normal",
      },
    },
  };

  const plan = buildRacePrepPlan({
    profile: {
      name: "Halbmarathon 2:19",
      format: "distance",
      distanceKm: 21.1,
      durationMinutes: 139,
      fuelItemIds: ["isostar-500", "maurten-100"],
    },
    state,
  });

  assert.equal(plan.recommendation.target.carbsTotal, 105);
  assert.equal(plan.recommendation.target.fluidTotal, 1500);
  assert.equal(plan.summary.carbsDrinkTotal, 105);
  assert.equal(plan.summary.carbsFuelTotal, 0);
  assert.equal(plan.summary.carbsPlannedTotal, 105);
  assert.equal(plan.recommendation.consume.filter((entry) => entry.unit !== "ml").length, 0);
  assert.equal(plan.strategy.rows.reduce((sum, row) => sum + row.fuel.length, 0), 0);
  assert.equal(Math.round(plan.strategy.rows.reduce((sum, row) => sum + Number(row.drinkCarbs || 0), 0)), 105);
});

test("carb-free drink leaves the carbohydrate budget to fuel instead of creating a gel every drink slot", () => {
  const drink = {
    id: "water-electrolyte",
    brand: "Test",
    name: "Zero Drink",
    category: "Elektrolyte",
    carbs: 0,
    sodium: 300,
    caffeine: 0,
    preparedVolumeMl: 500,
    quantity: 0,
    stockUnit: "Portionen",
  };
  const gel100 = {
    id: "maurten-100-zero-drink",
    brand: "Maurten",
    name: "Gel 100",
    category: "Gel",
    carbs: 25,
    sodium: 34,
    caffeine: 0,
    quantity: 0,
    stockUnit: "Stück",
  };
  const state = { fuel: [drink, gel100], activities: [], reviews: {} };
  const plan = buildRacePrepPlan({
    profile: {
      name: "Halbmarathon 2:19",
      format: "distance",
      distanceKm: 21.1,
      durationMinutes: 139,
      fuelItemIds: ["water-electrolyte", "maurten-100-zero-drink"],
    },
    state,
  });

  const gelEntry = plan.recommendation.consume.find((entry) => entry.fuelItemId === "maurten-100-zero-drink");
  assert.equal(plan.summary.carbsDrinkTotal, 0);
  assert.equal(gelEntry.quantity, 4);
  assert.equal(plan.summary.carbsFuelTotal, 100);
  assert.equal(plan.strategy.rows.reduce((sum, row) => sum + row.fuel.length, 0), 4);
  assert.ok(plan.strategy.rows.flatMap((row) => row.fuel).every((entry) => /25 g KH/.test(entry.detail)));
});

test("mission track metadata is preserved for Race Strategy even when Race Prep still uses loop logistics", () => {
  const profile = racePrepProfileFromEvent({
    id: "asg-track",
    name: "ASG Bahn-Meeting 2026",
    targetKm: 5,
    courseType: "loop",
    loopKm: 0.4,
    loopMode: "free",
    targetTime: "00:20:00",
  });
  assert.equal(profile.eventDistanceKm, 5);
  assert.equal(profile.courseType, "loop");
  assert.equal(profile.loopMode, "free");
});
