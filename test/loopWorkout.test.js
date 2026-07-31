import test from "node:test";
import assert from "node:assert/strict";
import {
  LOOP_CONTROL_MODES,
  LOOP_MODES,
  LOOP_PACE_MODES,
  formatLoopDuration,
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

test("time-limited loop match plan separates event budget, box stop and running pace", () => {
  const plan = loopMatchPlan({
    loopKm: 6.2,
    targetKm: 112,
    eventTimeLimit: "14:00:00",
    plannedStopMinutes: 3,
  });

  assert.ok(plan);
  assert.equal(plan.timeLimitMinutes, 840);
  assert.equal(plan.targetLoops, 18);
  assert.equal(plan.plannedDistanceKm, 111.6);
  assert.equal(plan.distanceDeltaKm, -0.4);
  assert.equal(plan.finalSegmentKm, 0);
  assert.ok(Math.abs(plan.averageLoopBudgetMinutes - 46.6667) < 0.1);
  assert.equal(plan.requiredPace, "7:03");
  assert.equal(formatLoopDuration(plan.averageLoopBudgetMinutes), "46:40 min");
  assert.equal(formatLoopDuration(plan.runBudgetMinutes), "43:40 min");
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
