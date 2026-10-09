import test from "node:test";
import assert from "node:assert/strict";
import { isImplicitMissedWorkout } from "../src/services/plannedWorkoutStatus.js";

test("a required unmatched workout becomes implicitly missed on the following day", () => {
  assert.equal(isImplicitMissedWorkout(
    { id: "stabi", date: "2026-10-06", title: "Stabi & Mobility", type: "Workout" },
    { todayKey: "2026-10-07", matched: false },
  ), true);
});

test("optional, completed and later-synced workouts never stay implicitly missed", () => {
  const base = { id: "run", date: "2026-10-06", title: "8 km locker", type: "Run" };
  assert.equal(isImplicitMissedWorkout({ ...base, optional: true }, { todayKey: "2026-10-07" }), false);
  assert.equal(isImplicitMissedWorkout({ ...base, completed: true }, { todayKey: "2026-10-07" }), false);
  assert.equal(isImplicitMissedWorkout(base, { todayKey: "2026-10-07", matched: true }), false);
  assert.equal(isImplicitMissedWorkout({ ...base, matchedActivityId: "intervals-123" }, { todayKey: "2026-10-07" }), false);
});
