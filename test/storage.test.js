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
