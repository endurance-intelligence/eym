import test from "node:test";
import assert from "node:assert/strict";
import {
  completeOnboardingState,
  normalizeOnboarding,
  onboardingBaselineFromActivities,
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
    intervalsConnected: true,
  };
}

test("fresh state remains pending while established athlete data bypasses onboarding", () => {
  assert.equal(normalizeOnboarding(emptyState()).status, "pending");

  const established = emptyState();
  established.activities = [{ id: "run-1", distance: 8 }];
  const migrated = normalizeOnboarding(established);
  assert.equal(migrated.status, "completed");
  assert.equal(migrated.migratedFromExistingData, true);

  const onboardingImport = {
    ...established,
    onboarding: { version: 2, status: "pending", completedAt: null, migratedFromExistingData: false },
  };
  assert.equal(normalizeOnboarding(onboardingImport).status, "pending");
});

test("onboarding validates a realistic weekly frame", () => {
  const draft = validDraft();
  assert.equal(onboardingStepError("profile", draft), "");
  assert.equal(onboardingStepError("intervals", draft), "");
  assert.equal(onboardingStepError("baseline", draft), "");
  assert.equal(onboardingStepError("mission", draft), "");
  assert.equal(onboardingStepError("week", draft), "");

  assert.match(onboardingStepError("week", { ...draft, runDays: ["Dienstag"] }), /mindestens 3/);
  assert.match(onboardingStepError("baseline", { ...draft, weeklyKm: "" }), /drei Trainingswerte/);
  assert.match(onboardingStepError("intervals", { ...draft, intervalsConnected: false }), /Intervals\.icu/);
  assert.match(onboardingStepError("mission", {
    ...draft,
    missionGoalType: "time",
    missionTargetTime: "02:99:00",
  }), /Zielzeit/);
  assert.equal(onboardingStepError("mission", {
    ...draft,
    missionGoalType: "time",
    missionTargetTime: "02:00:00",
    missionGoalDiscipline: "half_marathon",
  }), "");
});

test("recent Intervals activities provide the six and eight week onboarding baseline", () => {
  const baseline = onboardingBaselineFromActivities([
    { category: "running", date: "2026-07-27", distance: 10 },
    { type: "Run", date: "2026-07-20", distance: 18 },
    { type: "Ride", date: "2026-07-19", distance: 80 },
    { type: "Run", date: "2026-05-01", distance: 30 },
  ], new Date("2026-07-29T12:00:00"));

  assert.equal(baseline.hasData, true);
  assert.equal(baseline.activityCount, 2);
  assert.equal(baseline.currentRunsPerWeek, 0.5);
  assert.equal(baseline.weeklyKm, 4.7);
  assert.equal(baseline.longestRunKm, 18);
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
  assert.equal(completed.onboarding.version, 3);
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
  assert.equal(completed.intervals.connected, true);
  assert.deepEqual(completed.plan, state.plan);
  assert.deepEqual(completed.reviews, state.reviews);
});

test("onboarding persists the target profile and time that drive the first plan", () => {
  const completed = completeOnboardingState(emptyState(), {
    ...validDraft(),
    missionGoalType: "time",
    missionTargetTime: "02:00:00",
    missionGoalDiscipline: "half_marathon",
  }, {
    now: new Date("2026-07-28T08:30:00.000Z"),
    idFactory: () => "hm-goal",
  });

  assert.equal(completed.mission.goalType, "time");
  assert.equal(completed.mission.targetTime, "02:00:00");
  assert.equal(completed.mission.goalDiscipline, "half_marathon");
  assert.equal(completed.mission.milestones[0].targetTime, "02:00:00");
  assert.equal(completed.mission.milestones[0].preparationStartDate, "2026-07-28");
});
