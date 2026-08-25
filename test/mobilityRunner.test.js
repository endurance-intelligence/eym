import test from "node:test";
import assert from "node:assert/strict";
import {
  activeRunnerSideLabel,
  advanceMobilityRunner,
  runnerPhaseSeconds,
  sideWorkSeconds,
} from "../src/services/mobilityRunner.js";

const sidePlank = {
  id: "side-plank",
  seconds: 60,
  preparationSeconds: 3,
  transitionBeforeSeconds: 0,
  sideSwitch: true,
  sideSwitchSeconds: 5,
};

test("side-switch exercise splits active time and inserts a real pause", () => {
  assert.equal(sideWorkSeconds(sidePlank, 0), 30);
  assert.equal(sideWorkSeconds(sidePlank, 1), 30);
  assert.equal(runnerPhaseSeconds([sidePlank], 0, "side-switch", 0), 5);

  const firstWork = advanceMobilityRunner({
    items: [sidePlank],
    index: 0,
    phase: "prepare",
    sideIndex: 0,
    remaining: 0,
    running: true,
    complete: false,
    completedExerciseIds: [],
  });
  assert.equal(firstWork.phase, "work");
  assert.equal(firstWork.sideIndex, 0);
  assert.equal(firstWork.remaining, 30);

  const switchPause = advanceMobilityRunner({ ...firstWork, remaining: 0 });
  assert.equal(switchPause.phase, "side-switch");
  assert.equal(switchPause.remaining, 5);
  assert.deepEqual(switchPause.completedExerciseIds, []);

  const secondWork = advanceMobilityRunner({ ...switchPause, remaining: 0 });
  assert.equal(secondWork.phase, "work");
  assert.equal(secondWork.sideIndex, 1);
  assert.equal(secondWork.remaining, 30);
  assert.equal(activeRunnerSideLabel(sidePlank, "work", 1, "none"), "Rechte Seite");

  const finished = advanceMobilityRunner({ ...secondWork, remaining: 0 });
  assert.equal(finished.complete, true);
  assert.deepEqual(finished.completedExerciseIds, ["side-plank"]);
});

test("alternating or bilateral exercise does not create a side-change phase", () => {
  const deadBug = {
    id: "dead-bug",
    seconds: 45,
    preparationSeconds: 0,
    transitionBeforeSeconds: 0,
    sideSwitch: false,
  };
  const finished = advanceMobilityRunner({
    items: [deadBug],
    index: 0,
    phase: "work",
    sideIndex: 0,
    remaining: 0,
    running: true,
    complete: false,
    completedExerciseIds: [],
  });

  assert.equal(finished.complete, true);
  assert.deepEqual(finished.completedExerciseIds, ["dead-bug"]);
});


test("rep-based strength exercise waits for manual completion instead of auto-counting down", () => {
  const pushUp = {
    id: "push-up",
    seconds: 20,
    preparationSeconds: 3,
    transitionBeforeSeconds: 0,
    sideSwitch: false,
    prescription: { mode: "reps", label: "5 Wdh." },
  };
  const work = advanceMobilityRunner({
    items: [pushUp],
    index: 0,
    phase: "prepare",
    sideIndex: 0,
    remaining: 0,
    running: true,
    complete: false,
    completedExerciseIds: [],
  });
  assert.equal(work.phase, "work");
  assert.equal(work.remaining, null);
  assert.equal(runnerPhaseSeconds([pushUp], 0, "work", 0), null);

  const finished = advanceMobilityRunner(work);
  assert.equal(finished.complete, true);
  assert.deepEqual(finished.completedExerciseIds, ["push-up"]);
});
