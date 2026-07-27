import test from "node:test";
import assert from "node:assert/strict";
import { defaultState } from "../src/data/defaults.js";

test("fresh state contains no athlete-specific mission or appointments", () => {
  assert.equal(defaultState.mission.name, "");
  assert.equal(defaultState.mission.date, "");
  assert.deepEqual(defaultState.mission.milestones, []);
  assert.deepEqual(defaultState.planner.recurringCommitments, []);
  assert.deepEqual(defaultState.planner.trackWorkoutTemplates, []);
  assert.equal(defaultState.planner.rowingDistanceKm, 5);
  assert.equal(defaultState.planner.rowingDuration, 35);
  assert.deepEqual([defaultState.planner.rowingSpmMin, defaultState.planner.rowingSpmMax], [24, 26]);
  assert.equal(defaultState.planner.fixedAppointments.football, false);
  assert.equal(defaultState.planner.fixedAppointments.orcRun, false);
  assert.equal(defaultState.profile.experienceLevel, "beginner");
});
