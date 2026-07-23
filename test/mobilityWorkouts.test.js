import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMobilityWorkout,
  exerciseVideoSearchUrl,
  mobilityExerciseUsage,
  nextMobilityWorkoutRotation,
} from "../src/services/mobilityWorkouts.js";

const workoutOptions = {
  durationMinutes: 25,
  condition: "normal",
  equipment: ["mat", "band"],
  focusAreaIds: ["core", "ankle", "adductors"],
  knownExerciseIds: [],
};

test("controlled shuffle selects a different valid workout and start exercise", () => {
  const currentOffset = 0;
  const nextOffset = nextMobilityWorkoutRotation(workoutOptions, currentOffset, () => 0);
  const currentWorkout = buildMobilityWorkout({ ...workoutOptions, rotationOffset: currentOffset });
  const nextWorkout = buildMobilityWorkout({ ...workoutOptions, rotationOffset: nextOffset });

  assert.notEqual(nextOffset, currentOffset);
  assert.notDeepEqual(nextWorkout.items.map((item) => item.id), currentWorkout.items.map((item) => item.id));
  assert.notEqual(nextWorkout.items[0]?.id, currentWorkout.items[0]?.id);
  assert.deepEqual(nextWorkout.focusAreaIds, workoutOptions.focusAreaIds);
  assert.deepEqual(nextWorkout.equipment, workoutOptions.equipment);
});

test("shuffle keeps every available personal physio priority in the workout", () => {
  const options = {
    ...workoutOptions,
    physioExerciseIds: ["cat-cow", "ankle-circles"],
  };
  const nextOffset = nextMobilityWorkoutRotation(options, 0, () => 0.75);
  const workout = buildMobilityWorkout({ ...options, rotationOffset: nextOffset });
  const exerciseIds = new Set(workout.items.map((item) => item.id));

  assert.equal(exerciseIds.has("cat-cow"), true);
  assert.equal(exerciseIds.has("ankle-circles"), true);
  assert.equal(workout.items.filter((item) => item.selectionReason === "Physio-Priorität").length, 2);
});

test("shuffle falls back safely when the random source is invalid", () => {
  const nextOffset = nextMobilityWorkoutRotation(workoutOptions, 0, () => Number.NaN);
  assert.equal(Number.isInteger(nextOffset), true);
  assert.notEqual(nextOffset, 0);
});

test("selected workout duration represents active movement without setup time", () => {
  const workout = buildMobilityWorkout({
    ...workoutOptions,
    durationMinutes: 25,
    preparationSeconds: 10,
    unknownPreparationSeconds: 20,
    transitionSeconds: 10,
    materialTransitionSeconds: 20,
  });

  assert.ok(workout.activeSeconds >= 24.5 * 60);
  assert.ok(workout.activeSeconds <= 25.5 * 60);
  assert.ok(workout.pauseSeconds > 0);
  assert.equal(workout.totalSeconds, workout.activeSeconds + workout.pauseSeconds);
  assert.ok(workout.durationMinutes > workout.activeMinutes);
});

test("exercise video search uses the exercise description and a safe Google URL", () => {
  const url = new URL(exerciseVideoSearchUrl({
    name: "Seitstütz & Rotation",
    subtitle: "Arm kontrolliert nach oben führen",
  }));

  assert.equal(url.origin, "https://www.google.com");
  assert.equal(url.pathname, "/search");
  assert.equal(
    url.searchParams.get("q"),
    "Seitstütz & Rotation Arm kontrolliert nach oben führen Übung richtige Ausführung Video",
  );
});

test("exercise usage counts completed sessions once and keeps the latest completion", () => {
  const usage = mobilityExerciseUsage([
    { completedAt: "2026-07-23T18:00:00.000Z", exerciseIds: ["dead-bug", "dead-bug", "bird-dog"] },
    { completedAt: "2026-07-20T18:00:00.000Z", exerciseIds: ["dead-bug"] },
    { completedAt: "2026-07-18T18:00:00.000Z", exerciseIds: ["side-plank"] },
  ]);

  assert.equal(usage["dead-bug"].count, 2);
  assert.equal(usage["dead-bug"].recentCount, 2);
  assert.equal(usage["dead-bug"].streak, 2);
  assert.equal(usage["dead-bug"].lastCompletedAt, "2026-07-23T18:00:00.000Z");
  assert.equal(usage["bird-dog"].count, 1);
});

test("frequently repeated focus exercise is deprioritized when an alternative exists", () => {
  const exerciseHistory = Array.from({ length: 4 }, (_, index) => ({
    completedAt: `2026-07-${23 - index}T18:00:00.000Z`,
    exerciseIds: ["dead-bug"],
  }));
  const workout = buildMobilityWorkout({
    durationMinutes: 10,
    condition: "normal",
    equipment: ["mat", "band"],
    focusAreaIds: ["core"],
    exerciseHistory,
  });
  const focusExercise = workout.items.find((item) => item.selectionReason.startsWith("Schwerpunkt"));

  assert.ok(focusExercise);
  assert.notEqual(focusExercise.id, "dead-bug");
  assert.equal(workout.exerciseUsage["dead-bug"].streak, 4);
});
