import test from "node:test";
import assert from "node:assert/strict";
import {
  LOOP_CONTROL_MODES,
  LOOP_MODES,
  LOOP_PACE_MODES,
  loopMatchPlan,
  loopWorkoutPaceLabel,
  normalizeLoopWorkoutItem,
} from "../src/services/loopWorkout.js";

test("Backyard loop blocks keep exact decimal distance and use the round interval as total block time", () => {
  const workout = normalizeLoopWorkoutItem({
    title: "2 × 6,7 km · Backyard Ultra",
    type: "Loop-Training",
    distance: 13,
    duration: 60,
    loopTraining: {
      loops: 2,
      loopKm: 6.7,
      mode: LOOP_MODES.FIXED_INTERVAL,
      intervalMinutes: 60,
    },
  });

  assert.equal(workout.distance, 13.4);
  assert.equal(workout.duration, 120);
  assert.equal(workout.title, "2 × 6,7 km · Backyard Ultra");
  assert.equal(workout.loopTraining.controlMode, LOOP_CONTROL_MODES.MANUAL_LAP);
  assert.equal(workout.loopTraining.paceMode, LOOP_PACE_MODES.NONE);
});

test("time-limited loop match plan keeps official distance, rounds and standard loop independent", () => {
  const plan = loopMatchPlan({
    loopKm: 6.2,
    targetKm: 112,
    rounds: 19,
    eventTimeLimit: "15:00:00",
    plannedStopMinutes: 3,
  });

  assert.ok(plan);
  assert.equal(plan.timeLimitMinutes, 900);
  assert.equal(plan.targetLoops, 19);
  assert.equal(plan.roundsExplicit, true);
  assert.equal(plan.fullLoops, 18);
  assert.equal(plan.plannedDistanceKm, 112);
  assert.equal(plan.distanceDeltaKm, 0);
  assert.ok(Math.abs(plan.finalSegmentKm - 0.4) < 0.01);
  assert.ok(Math.abs(plan.averageLoopBudgetMinutes - 47.3684) < 0.1);
});

test("legacy loop events can still estimate rounds when official count is missing", () => {
  const plan = loopMatchPlan({ loopKm: 6.2, targetKm: 112, eventTimeLimit: "14:00:00", plannedStopMinutes: 3 });
  assert.equal(plan.targetLoops, 18);
  assert.equal(plan.roundsExplicit, false);
  assert.equal(plan.plannedDistanceKm, 111.6);
});

test("loop pace stays optional and can be changed to a custom Garmin range", () => {
  const withoutTarget = normalizeLoopWorkoutItem({
    title: "3 × 6,7 km",
    type: "Backyard Training",
    loopTraining: { loops: 3, loopKm: 6.7, mode: LOOP_MODES.FIXED_INTERVAL, paceMode: LOOP_PACE_MODES.NONE },
  });
  assert.equal(loopWorkoutPaceLabel(withoutTarget), "");

  const custom = normalizeLoopWorkoutItem({
    ...withoutTarget,
    loopTraining: {
      ...withoutTarget.loopTraining,
      paceMode: LOOP_PACE_MODES.CUSTOM,
      faster: "7:10",
      slower: "7:50",
    },
  });
  assert.equal(loopWorkoutPaceLabel(custom), "Eigene Pace 7:10–7:50/km");
});
