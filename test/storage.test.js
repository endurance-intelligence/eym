import test from "node:test";
import assert from "node:assert/strict";
import {
  createStateBackup,
  hasStoredState,
  loadState,
  parseStateBackup,
  saveState,
} from "../src/services/storage.js";

const defaults = {
  activities: [], activityGroups: [], plan: [], equipment: [], fuel: [], fuelCatalogExclusions: [], reviews: {}, healthCheckins: [],
  racePrepPlans: [], raceCoachSessions: {},
  coachRecommendationHistory: [],
  mobilityCoach: { equipment: [], physioExerciseIds: [], focusAreaIds: [], knownExerciseIds: [], history: [] },
  appearance: {}, profile: {}, planner: { fixedAppointments: { football: false, orcRun: false, saturdayMode: "off" } },
  garmin: {}, intervals: {}, mission: { milestones: [] }, calendar: {},
};

test("backup roundtrip keeps relevant athlete data", () => {
  const original = {
    ...defaults,
    activities: [{ id: "activity-1", source: "intervals" }],
    profile: { displayName: "Athlet" },
    mission: { id: "personal-goal", name: "Mein Ultra", date: "2026-11-21", milestones: [] },
    planner: {
      ...defaults.planner,
      trackWorkoutTemplates: [{
        id: "track-template-1",
        name: "1200/800 Mix",
        kind: "intervals",
        rounds: 3,
        steps: [{ kind: "work", unit: "distance", value: 1200 }],
      }],
    },
    coachRecommendationHistory: [{ id: "feedback-1", recommendationId: "coach-1", status: "helpful" }],
  };
  const backup = createStateBackup(original);
  const restored = parseStateBackup(JSON.stringify(backup), defaults);
  assert.equal(restored.state.activities[0].id, "activity-1");
  assert.equal(restored.state.profile.displayName, "Athlet");
  assert.equal(restored.state.mission.name, "Mein Ultra");
  assert.equal(restored.state.planner.trackWorkoutTemplates[0].name, "1200/800 Mix");
  assert.equal(restored.state.coachRecommendationHistory[0].id, "feedback-1");
  assert.ok(restored.createdAt);
});

test("race prep and race coach sessions survive browser storage roundtrip", () => {
  const previousStorage = globalThis.localStorage;
  const memory = new Map();
  globalThis.localStorage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: (key) => memory.delete(key),
  };

  try {
    saveState({
      ...defaults,
      racePrepPlans: [{ id: "race-prep-1", name: "Backyard" }],
      raceCoachSessions: { backyard: { setup: { targetDurationMinutes: 900 } } },
    }, "race-user");
    const restored = loadState(defaults, "race-user");
    assert.equal(restored.racePrepPlans[0].id, "race-prep-1");
    assert.equal(restored.raceCoachSessions.backyard.setup.targetDurationMinutes, 900);
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});

test("mobile quota falls back to a compact snapshot without losing reviews or the active plan", () => {
  const previousStorage = globalThis.localStorage;
  const memory = new Map();
  globalThis.localStorage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => {
      const text = String(value);
      if (!key.endsWith(".recovery") && text.length > 2500) {
        const error = new Error("The quota has been exceeded.");
        error.name = "QuotaExceededError";
        throw error;
      }
      memory.set(key, text);
    },
    removeItem: (key) => memory.delete(key),
  };

  try {
    const result = saveState({
      ...defaults,
      plan: [{ id: "plan-1", title: "Backyard Taper" }],
      reviews: { "activity-1": { feeling: 8, notes: "frisch" } },
      fuel: [{ id: "fuel-1", name: "Test", imageUrl: `data:image/jpeg;base64,${"A".repeat(6000)}` }],
    }, "mobile-user");
    assert.equal(result.mode, "compact");
    const restored = loadState(defaults, "mobile-user");
    assert.equal(restored.plan[0].title, "Backyard Taper");
    assert.equal(restored.reviews["activity-1"].notes, "frisch");
    assert.equal(restored.fuel[0].imageUrl, "");
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});

test("recovery snapshot remains usable when Safari refuses the full account key entirely", () => {
  const previousStorage = globalThis.localStorage;
  const memory = new Map();
  globalThis.localStorage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => {
      if (!key.endsWith(".recovery")) {
        const error = new Error("The quota has been exceeded.");
        error.name = "QuotaExceededError";
        throw error;
      }
      memory.set(key, String(value));
    },
    removeItem: (key) => memory.delete(key),
  };

  try {
    const result = saveState({
      ...defaults,
      plan: [{ id: "plan-emergency", title: "Nicht verlieren" }],
      reviews: { "activity-emergency": { feeling: 7 } },
      racePrepPlans: [{ id: "race-emergency" }],
    }, "quota-user");
    assert.equal(result.mode, "recovery");
    assert.equal(hasStoredState("quota-user"), true);
    const restored = loadState(defaults, "quota-user");
    assert.equal(restored.plan[0].id, "plan-emergency");
    assert.equal(restored.reviews["activity-emergency"].feeling, 7);
    assert.equal(restored.racePrepPlans[0].id, "race-emergency");
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});

test("unrelated JSON is rejected as a backup", () => {
  assert.throws(() => parseStateBackup('{"hello":"world"}', defaults), /keine gültige App-Sicherung/);
});

test("a pre-onboarding backup is treated as an existing account", () => {
  const legacy = {
    ...defaults,
    profile: {},
    activities: [],
    plan: [],
  };
  const restored = parseStateBackup(JSON.stringify(legacy), defaults);
  assert.equal(restored.state.onboarding.status, "completed");
  assert.equal(restored.state.onboarding.migratedFromExistingData, true);
});

test("browser state is isolated per authenticated account", () => {
  const previousStorage = globalThis.localStorage;
  const memory = new Map();
  globalThis.localStorage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: (key) => memory.delete(key),
  };

  try {
    saveState({ ...defaults, profile: { displayName: "Account A" } }, "user-a");
    saveState({ ...defaults, profile: { displayName: "Account B" } }, "user-b");

    assert.equal(hasStoredState("user-a"), true);
    assert.equal(hasStoredState("user-b"), true);
    assert.equal(hasStoredState("new-user"), false);
    assert.equal(loadState(defaults, "user-a").profile.displayName, "Account A");
    assert.equal(loadState(defaults, "user-b").profile.displayName, "Account B");
    assert.equal(loadState(defaults, "new-user").profile.displayName, "");
    assert.equal(loadState(defaults, "new-user").onboarding.status, "pending");
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});
