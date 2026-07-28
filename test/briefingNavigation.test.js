import test from "node:test";
import assert from "node:assert/strict";
import { briefingWorkoutDestination } from "../src/services/briefingNavigation.js";

test("opens a linked completed activity directly in Training", () => {
  assert.deepEqual(
    briefingWorkoutDestination({ planItemId: "plan-1", activityId: 4711 }),
    {
      pathname: "/training",
      state: { activityId: "4711" },
    },
  );
});

test("opens a planned workout directly in the planner editor", () => {
  assert.deepEqual(
    briefingWorkoutDestination({ planItemId: "orc-track-1" }),
    {
      pathname: "/planner",
      state: { workoutId: "orc-track-1" },
    },
  );
});

test("keeps a rest-day row non-interactive", () => {
  assert.equal(briefingWorkoutDestination({}), null);
});
