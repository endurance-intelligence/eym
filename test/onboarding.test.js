import test from "node:test";
import assert from "node:assert/strict";
import {
  completeOnboardingState,
  normalizeOnboarding,
  onboardingStepError,
} from "../src/services/onboarding.js";

function emptyState() {
  return {
    onboarding: null,
    profile: {},
    activities: [],
    plan: [],
    reviews: {},
    equipment: [],
    fuel: [],
    healthCheckins: [],
    coachRecommendationHistory: [],
    mobilityCoach: { history: [] },
    intervals: {},
    garmin: {},
    mission: { id: "", name: "", date: "", targetKm: 0, milestones: [] },
    planner: { recurringCommitments: [] },
  };
}

function validDraft() {
  return {
    displayName: "Alex",
    birthDate: "",
    heightCm: "",
    weightKg: "",
    experienceLevel: "advanced",
    currentRunsPerWeek: 3,
    weeklyKm: 28,
    longestRunKm: 14,
    missionMode: "event",
    missionName: "Mein Halbmarathon",
    missionDate: "2026-10-18",
    missionDistanceKm: 21.1,
    targetRunCount: 3,
    runDays: ["Dienstag", "Donnerstag", "Sonntag"],
    stabiCount: 1,
    stabiDays: ["Mittwoch"],
    recurringCommitments: [{
      id: "club-run",
      name: "Lauftreff",
      sport: "running",
      weekday: "Donnerstag",
      time: "18:30",
      durationMinutes: 60,
      distanceKm: 9,
      load: "medium",
      enabled: true,
      conflictMode: "replace",
    }],
    coachProgressionEnabled: true,
  };
}

test("fresh state remains pending while established athlete data bypasses onboarding", () => {
  assert.equal(normalizeOnboarding(emptyState()).status, "pending");

  const established = emptyState();
  established.activities = [{ id: "run-1", distance: 8 }];
  const migrated = normalizeOnboarding(established);
  assert.equal(migrated.status, "completed");
  assert.equal(migrated.migratedFromExistingData, true);
});

test("onboarding validates a realistic weekly frame", () => {
  const draft = validDraft();
  assert.equal(onboardingStepError("profile", draft), "");
  assert.equal(onboardingStepError("baseline", draft), "");
  assert.equal(onboardingStepError("mission", draft), "");
  assert.equal(onboardingStepError("week", draft), "");

  assert.match(onboardingStepError("week", { ...draft, runDays: ["Dienstag"] }), /mindestens 3/);
  assert.match(onboardingStepError("baseline", { ...draft, weeklyKm: "" }), /drei Trainingswerte/);
});

test("completion writes the new profile and planning baseline without creating a week", () => {
  const state = emptyState();
  state.plan = [{ id: "protected-plan", title: "Bestehender Eintrag" }];
  state.reviews = { "run-1": { energy: 8 } };

  const completed = completeOnboardingState(state, validDraft(), {
    now: new Date("2026-07-28T08:30:00.000Z"),
    idFactory: () => "goal-1",
  });

  assert.equal(completed.onboarding.status, "completed");
  assert.equal(completed.profile.displayName, "Alex");
  assert.equal(completed.profile.selfReportedWeeklyKm, 28);
  assert.equal(completed.profile.selfReportedLongestRunKm, 14);
  assert.equal(completed.profile.reviewTrackingStartDate, "2026-07-28");
  assert.equal(completed.profile.defaultBottleVolumeMl, 650);
  assert.equal(completed.planner.targetRunCount, 3);
  assert.deepEqual(completed.planner.runDays, ["Dienstag", "Donnerstag", "Sonntag"]);
  assert.equal(completed.planner.recurringCommitments[0].name, "Lauftreff");
  assert.equal(completed.mission.id, "goal-1");
  assert.equal(completed.mission.milestones[0].targetKm, 21.1);
  assert.deepEqual(completed.plan, state.plan);
  assert.deepEqual(completed.reviews, state.reviews);
});
