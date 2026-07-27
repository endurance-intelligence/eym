import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTrackWorkoutTemplate,
  isTrackWorkout,
  normalizeTrackWorkout,
  normalizeTrackWorkoutTemplates,
  trackWorkoutSummary,
  workoutFromTrackTemplate,
} from "../src/services/trackWorkout.js";
import { intervalDescription } from "../supabase/functions/_shared/structuredWorkout.ts";

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
  });
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
