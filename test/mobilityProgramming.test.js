import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAdaptiveMobilityProfile,
  mergeMobilityFocusAreas,
} from "../src/services/mobilityProgramming.js";
import { buildMobilityWorkout } from "../src/services/mobilityWorkouts.js";

test("adaptive mobility prepares the athlete for a later track session", () => {
  const now = new Date("2026-08-04T15:30:00+02:00");
  const profile = buildAdaptiveMobilityProfile({
    now,
    plan: [{ id: "track", date: "2026-08-04", time: "19:00", title: "ORC Track", type: "Intervalle" }],
  });

  assert.equal(profile.context.kind, "track");
  assert.equal(profile.context.timing, "before");
  assert.match(profile.title, /Track-Vorbereitung/);
  assert.deepEqual(profile.focusAreaIds, ["ankle", "hips", "core"]);
  assert.equal(profile.excludedExerciseIds.includes("goblet-squat"), true);
  assert.equal(profile.preferredExerciseIds.includes("knee-to-wall"), true);
});

test("pain review activates the conservative safety profile", () => {
  const now = new Date("2026-08-04T15:30:00+02:00");
  const profile = buildAdaptiveMobilityProfile({
    now,
    activities: [{ id: "run-1", date: "2026-08-03", type: "Run", name: "Lockerer Lauf" }],
    reviews: {
      "run-1": { legs: 3, energy: 5, rpe: 7, legSymptoms: ["Schmerzen"] },
    },
  });

  assert.equal(profile.safetyMode, true);
  assert.equal(profile.condition, "tired");
  assert.equal(profile.excludedExerciseIds.includes("weighted-rdl"), true);
  assert.equal(profile.preferredExerciseIds.includes("cat-cow"), true);
});

test("adaptive workout selects coach priorities and omits excluded exercises", () => {
  const adaptiveProfile = {
    id: "track-today",
    focusAreaIds: ["ankle", "hips", "core"],
    preferredExerciseIds: ["knee-to-wall", "dead-bug", "glute-bridge"],
    excludedExerciseIds: ["slow-mountain-climber", "goblet-squat", "weighted-rdl"],
  };
  const workout = buildMobilityWorkout({
    durationMinutes: 15,
    condition: "normal",
    equipment: ["mat", "band", "step", "dumbbells"],
    adaptiveProfile,
    focusAreaIds: adaptiveProfile.focusAreaIds,
  });
  const ids = workout.items.map((item) => item.id);

  assert.equal(ids.some((id) => adaptiveProfile.preferredExerciseIds.includes(id)), true);
  assert.equal(ids.some((id) => adaptiveProfile.excludedExerciseIds.includes(id)), false);
  assert.equal(workout.items.some((item) => item.selectionReason === "Coach-Fokus heute"), true);
  assert.equal(workout.items.every((item) => typeof item.coachReason === "string" && item.coachReason.length > 0), true);
});

test("personal focus remains as a secondary layer behind the coach focus", () => {
  assert.deepEqual(
    mergeMobilityFocusAreas(["ankle", "hips"], ["core", "back"], 3),
    ["ankle", "hips", "core"],
  );
});
