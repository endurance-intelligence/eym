import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTrackWorkoutTemplate,
  isProvisionalTrackWorkout,
  isTrackWorkout,
  normalizeTrackRounds,
  normalizeTrackWorkout,
  normalizeTrackWorkoutTemplates,
  trackWorkoutDistance,
  trackWorkoutForEditing,
  trackWorkoutSummary,
  updateTrackStepDraft,
  updateTrackWorkoutDraft,
  workoutFromTrackTemplate,
} from "../src/services/trackWorkout.js";
import { intervalDescription, isProvisionalTrackPlanItem } from "../supabase/functions/_shared/structuredWorkout.ts";

test("ORC Track receives a safe structured workout default", () => {
  assert.equal(isTrackWorkout({ type: "ORC Track" }), true);
  assert.deepEqual(normalizeTrackWorkout(), {
    kind: "intervals",
    rounds: 8,
    steps: [
      { kind: "work", unit: "distance", value: 400 },
      { kind: "recovery", unit: "distance", value: 200 },
    ],
    warmupMode: "lap",
    cooldownMode: "lap",
    planningStatus: "final",
  });
});

test("track summary supports an ordered mixed block", () => {
  const summary = trackWorkoutSummary({
    rounds: 3,
    steps: [
      { kind: "work", unit: "distance", value: 1200 },
      { kind: "recovery", unit: "distance", value: 400 },
      { kind: "work", unit: "distance", value: 800 },
      { kind: "recovery", unit: "distance", value: 400 },
    ],
  });
  assert.equal(summary, "Warm-up bis LAP · 3 Durchgänge: 1200 m Belastung → 400 m Pause → 800 m Belastung → 400 m Pause · Cool-down bis LAP");
});

test("track distance separates work, recovery and the estimated LAP-controlled edges", () => {
  const distance = trackWorkoutDistance({
    rounds: 3,
    steps: [
      { kind: "work", unit: "distance", value: 1200 },
      { kind: "recovery", unit: "distance", value: 400 },
      { kind: "work", unit: "distance", value: 800 },
      { kind: "recovery", unit: "distance", value: 400 },
    ],
  });
  assert.deepEqual(distance, {
    workDistanceKm: 6,
    recoveryDistanceKm: 2.4,
    mainDistanceKm: 8.4,
    timedSeconds: 0,
    hasTimedSteps: false,
    estimatedTotalMinKm: 12.4,
    estimatedTotalMaxKm: 14.4,
  });

  const timed = trackWorkoutDistance({
    rounds: 3,
    steps: [
      { kind: "work", unit: "distance", value: 800 },
      { kind: "recovery", unit: "time", value: 90 },
    ],
  });
  assert.equal(timed.mainDistanceKm, 2.4);
  assert.equal(timed.timedSeconds, 270);
  assert.equal(timed.hasTimedSteps, true);
});

test("old v3.5.2 track settings migrate into the new step model", () => {
  assert.deepEqual(normalizeTrackWorkout({
    repeats: 10,
    workUnit: "distance",
    workValue: 600,
    recoveryUnit: "time",
    recoveryValue: 90,
  }), {
    kind: "intervals",
    rounds: 10,
    steps: [
      { kind: "work", unit: "distance", value: 600 },
      { kind: "recovery", unit: "time", value: 90 },
    ],
    warmupMode: "lap",
    cooldownMode: "lap",
    planningStatus: "final",
  });
});

test("numeric track drafts stay empty while typing and normalize only when committed", () => {
  const initial = trackWorkoutForEditing();
  const emptyRounds = updateTrackWorkoutDraft(initial, "rounds", "");
  const typedRounds = updateTrackWorkoutDraft(emptyRounds, "rounds", "10");
  assert.equal(emptyRounds.rounds, "");
  assert.equal(typedRounds.rounds, "10");
  assert.equal(normalizeTrackRounds(typedRounds.rounds), 10);

  const emptyStep = updateTrackStepDraft(initial, 0, "value", "");
  const typedStep = updateTrackStepDraft(emptyStep, 0, "value", "1200");
  assert.equal(emptyStep.steps[0].value, "");
  assert.equal(typedStep.steps[0].value, "1200");
  assert.equal(normalizeTrackWorkout(typedStep).steps[0].value, 1200);
});

test("new track definitions start provisional while legacy saved workouts remain final", () => {
  assert.equal(trackWorkoutForEditing().planningStatus, "draft");
  assert.equal(trackWorkoutForEditing({ rounds: 4 }).planningStatus, "final");
  assert.equal(isProvisionalTrackWorkout({
    type: "ORC Track",
    structuredWorkout: trackWorkoutForEditing(),
  }), true);
  assert.equal(isProvisionalTrackWorkout({
    type: "ORC Track",
    structuredWorkout: normalizeTrackWorkout({ rounds: 4 }),
  }), false);
  assert.equal(isProvisionalTrackPlanItem({
    type: "ORC Track",
    structuredWorkout: { planningStatus: "draft" },
  }), true);
  assert.equal(isProvisionalTrackPlanItem({
    type: "ORC Track",
    structuredWorkout: { planningStatus: "final" },
  }), false);
});

test("Intervals description contains an ordered Garmin block and LAP-controlled edges", () => {
  const description = intervalDescription({
    type: "ORC Track",
    title: "ORC Track",
    structuredWorkout: {
      kind: "sprints",
      rounds: 2,
      steps: [
        { kind: "work", unit: "distance", value: 1200 },
        { kind: "recovery", unit: "distance", value: 400 },
        { kind: "work", unit: "distance", value: 800 },
        { kind: "recovery", unit: "time", value: 90 },
      ],
    },
  });
  assert.match(description, /Sprints 2x/);
  assert.match(description, /Belastung 1200mtr Z5 Pace intensity=interval/);
  assert.match(description, /Pause 400mtr Z1 Pace intensity=recovery/);
  assert.match(description, /Belastung 800mtr Z5 Pace intensity=interval/);
  assert.match(description, /Pause 90s Z1 Pace intensity=recovery/);
  assert.equal(description.match(/press lap/g)?.length, 2);
  assert.match(description, /intensity=warmup/);
  assert.match(description, /intensity=cooldown/);
});

test("named templates survive archive normalization and can be copied into a workout", () => {
  const template = buildTrackWorkoutTemplate({
    id: "mix-1200-800",
    name: "  1200/800   Mix  ",
    workout: {
      kind: "intervals",
      rounds: 3,
      steps: [
        { kind: "work", unit: "distance", value: 1200 },
        { kind: "recovery", unit: "distance", value: 400 },
        { kind: "work", unit: "distance", value: 800 },
        { kind: "recovery", unit: "distance", value: 400 },
      ],
    },
    createdAt: "2026-07-27T08:00:00.000Z",
    updatedAt: "2026-07-27T09:00:00.000Z",
  });
  const archive = normalizeTrackWorkoutTemplates([template, template, { id: "", name: "Ungültig" }]);
  assert.equal(archive.length, 1);
  assert.equal(archive[0].name, "1200/800 Mix");
  const workout = workoutFromTrackTemplate(archive[0]);
  assert.equal(workout.templateId, "mix-1200-800");
  assert.equal(workout.templateName, "1200/800 Mix");
  assert.equal(workout.steps[2].value, 800);
});
