import test from "node:test";
import assert from "node:assert/strict";
import {
  isTrackWorkout,
  normalizeTrackWorkout,
  trackWorkoutSummary,
} from "../src/services/trackWorkout.js";
import { intervalDescription } from "../supabase/functions/_shared/structuredWorkout.ts";

test("ORC Track receives a safe structured workout default", () => {
  assert.equal(isTrackWorkout({ type: "ORC Track" }), true);
  assert.deepEqual(normalizeTrackWorkout(), {
    kind: "intervals",
    workUnit: "distance",
    workValue: 400,
    repeats: 8,
    recoveryUnit: "distance",
    recoveryValue: 200,
    warmupMinutes: 15,
    cooldownMinutes: 10,
  });
});

test("track summary supports distance work and timed recovery", () => {
  const summary = trackWorkoutSummary({
    workUnit: "distance",
    workValue: 400,
    repeats: 10,
    recoveryUnit: "time",
    recoveryValue: 60,
    warmupMinutes: 12,
    cooldownMinutes: 8,
  });
  assert.equal(summary, "12 min Warm-up · 10 × 400 m mit 60 s Pause · 8 min Cool-down");
});

test("Intervals description contains Garmin-executable repeat steps", () => {
  const description = intervalDescription({
    type: "ORC Track",
    title: "ORC Track",
    structuredWorkout: {
      kind: "sprints",
      workUnit: "time",
      workValue: 30,
      repeats: 12,
      recoveryUnit: "distance",
      recoveryValue: 200,
      warmupMinutes: 15,
      cooldownMinutes: 10,
    },
  });
  assert.match(description, /12x/);
  assert.match(description, /- 30s Z5 Pace intensity=interval/);
  assert.match(description, /- 200mtr Z1 Pace intensity=recovery/);
  assert.match(description, /intensity=warmup/);
  assert.match(description, /intensity=cooldown/);
});
