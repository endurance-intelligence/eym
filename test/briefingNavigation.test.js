import test from "node:test";
import assert from "node:assert/strict";
import {
  briefingWorkoutDestination,
  completedActivityDestination,
} from "../src/services/briefingNavigation.js";

test("opens a completed weekly activity directly in its review", () => {
  assert.deepEqual(
    completedActivityDestination("garmin-4711"),
    {
      pathname: "/training",
      state: { activityId: "garmin-4711" },
    },
  );
  assert.equal(completedActivityDestination(""), null);
});

test("opens a linked completed activity in Training without forcing review state", () => {
  assert.deepEqual(
    briefingWorkoutDestination({ planItemId: "plan-1", activityId: 4711 }),
    {
      pathname: "/training",
    },
  );
});

test("opens a planned workout in the planner without forcing editor state", () => {
  assert.deepEqual(
    briefingWorkoutDestination({ planItemId: "orc-track-1" }),
    {
      pathname: "/planner",
    },
  );
});

test("keeps a rest-day row non-interactive", () => {
  assert.equal(briefingWorkoutDestination({}), null);
});
