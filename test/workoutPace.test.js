import test from "node:test";
import assert from "node:assert/strict";
import {
  applyPlanPaceGuidance,
  coachPaceGuidance,
  normalizeWorkoutPaceGuidance,
  paceRangeDurationMinutes,
  supportsWorkoutPaceGuidance,
  workoutPaceLabel,
} from "../src/services/workoutPace.js";

const easyRun = {
  id: "easy-12",
  type: "Easy Run",
  title: "12 km locker",
  distance: 12,
  duration: 77,
};

test("coach pace range matches distance and planned duration", () => {
  const guidance = coachPaceGuidance(easyRun);
  assert.equal(guidance.mode, "range");
  assert.equal(guidance.faster, "6:10");
  assert.equal(guidance.slower, "6:40");
  assert.equal(paceRangeDurationMinutes(easyRun.distance, guidance), 77);
  assert.equal(workoutPaceLabel(easyRun), "Pace 6:10–6:40/km");
});

test("manual range is normalized and drives the planned duration", () => {
  const guidance = normalizeWorkoutPaceGuidance({
    ...easyRun,
    paceGuidance: {
      mode: "range",
      faster: "6:30",
      slower: "6:00",
      source: "manual",
    },
  });
  assert.equal(guidance.faster, "6:00");
  assert.equal(guidance.slower, "6:30");
  assert.equal(guidance.source, "manual");
  assert.equal(paceRangeDurationMinutes(12, guidance), 75);
});

test("explicit no-target mode is preserved", () => {
  const guidance = normalizeWorkoutPaceGuidance({
    ...easyRun,
    paceGuidance: { mode: "none", source: "manual" },
  });
  assert.equal(guidance.mode, "none");
  assert.equal(workoutPaceLabel({ ...easyRun, paceGuidance: guidance }), "");
  assert.equal(workoutPaceLabel({ ...easyRun, paceGuidance: guidance }, { includeNone: true }), "Ohne Pace-Ziel");
});

test("fixed ORC group runs default to no pace alarms", () => {
  const guidance = coachPaceGuidance({
    type: "ORC Run",
    title: "ORC Run",
    fixed: true,
    distance: 10,
    duration: 65,
  });
  assert.equal(guidance.mode, "none");
});

test("structured and backyard workouts keep their own guidance", () => {
  assert.equal(supportsWorkoutPaceGuidance({ ...easyRun, structuredWorkout: { rounds: 6 } }), false);
  assert.equal(supportsWorkoutPaceGuidance({ ...easyRun, type: "Backyard Training", title: "Backyard Runden" }), false);
});

test("newly generated plans persist the coach range without changing plan duration", () => {
  const [planned] = applyPlanPaceGuidance([easyRun]);
  assert.equal(planned.paceGuidance.mode, "range");
  assert.equal(planned.paceGuidance.faster, "6:10");
  assert.equal(planned.paceGuidance.slower, "6:40");
  assert.equal(planned.duration, 77);
});
