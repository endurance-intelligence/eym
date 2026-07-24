import test from "node:test";
import assert from "node:assert/strict";
import { defaultState } from "../src/data/defaults.js";

test("fresh state contains no athlete-specific mission or appointments", () => {
  assert.equal(defaultState.mission.name, "");
  assert.equal(defaultState.mission.date, "");
  assert.deepEqual(defaultState.mission.milestones, []);
  assert.deepEqual(defaultState.planner.recurringCommitments, []);
  assert.equal(defaultState.planner.fixedAppointments.football, false);
  assert.equal(defaultState.planner.fixedAppointments.orcRun, false);
  assert.equal(defaultState.profile.experienceLevel, "beginner");
});
