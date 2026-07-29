import test from "node:test";
import assert from "node:assert/strict";
import {
  canManuallyCompleteWorkout,
  isSpontaneousWorkout,
  normalizeWorkoutTiming,
  workoutTimingLabel,
} from "../src/services/plannerTime.js";
import { intervalsStartDateLocal } from "../supabase/functions/_shared/plannerTiming.ts";

test("legacy non-fixed sessions are interpreted as spontaneous without rewriting their source", () => {
  const legacy = { title: "10 km locker", time: "18:00", fixed: false };
  assert.equal(isSpontaneousWorkout(legacy), true);
  assert.equal(workoutTimingLabel(legacy), "Spontan");
  assert.deepEqual(normalizeWorkoutTiming(legacy), {
    ...legacy,
    spontaneous: true,
    time: "",
  });
});

test("fixed appointments retain their clock time", () => {
  const fixed = normalizeWorkoutTiming({ title: "ORC Track", fixed: true, time: "19:00" });
  assert.equal(fixed.spontaneous, false);
  assert.equal(fixed.time, "19:00");
  assert.equal(workoutTimingLabel(fixed), "19:00 Uhr");
});

test("a flexible session can explicitly receive a time", () => {
  const timed = normalizeWorkoutTiming({ title: "Rennrad", spontaneous: false, time: "10:30" });
  assert.equal(timed.spontaneous, false);
  assert.equal(timed.time, "10:30");
  assert.equal(workoutTimingLabel(timed), "10:30 Uhr");
});

test("Intervals uses calendar midnight for spontaneous workouts and real times for appointments", () => {
  assert.equal(intervalsStartDateLocal({ date: "2026-07-28", title: "Intervalle", spontaneous: true }), "2026-07-28T00:00:00");
  assert.equal(intervalsStartDateLocal({ date: "2026-07-28", title: "ORC Track", fixed: true, time: "19:00" }), "2026-07-28T19:00:00");
  assert.equal(intervalsStartDateLocal({ date: "2026-07-28", title: "Legacy Easy Run", time: "18:00" }), "2026-07-28T00:00:00");
});

test("future sessions cannot be checked off before they can be finished", () => {
  const morning = new Date(2026, 6, 29, 9, 0);
  const duringWorkout = new Date(2026, 6, 29, 19, 30);
  const afterWorkout = new Date(2026, 6, 29, 20, 2);
  const fixed = {
    date: "2026-07-29",
    fixed: true,
    time: "19:00",
    duration: 62,
  };

  assert.equal(canManuallyCompleteWorkout(fixed, morning), false);
  assert.equal(canManuallyCompleteWorkout(fixed, duringWorkout), false);
  assert.equal(canManuallyCompleteWorkout(fixed, afterWorkout), true);
  assert.equal(canManuallyCompleteWorkout({ ...fixed, date: "2026-07-30" }, afterWorkout), false);
});

test("past and spontaneous same-day sessions remain manually completable", () => {
  const now = new Date(2026, 6, 29, 9, 0);

  assert.equal(canManuallyCompleteWorkout({ date: "2026-07-28", spontaneous: true }, now), true);
  assert.equal(canManuallyCompleteWorkout({ date: "2026-07-29", spontaneous: true }, now), true);
  assert.equal(canManuallyCompleteWorkout({ date: "2026-07-29", spontaneous: true, completed: true }, now), false);
  assert.equal(canManuallyCompleteWorkout({ date: "2026-07-29", spontaneous: true, plannedCancellation: true }, now), false);
});
