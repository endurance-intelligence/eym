import test from "node:test";
import assert from "node:assert/strict";
import {
  findPlannedWorkoutForActivity,
  workoutRoleAssessment,
  workoutRoleDistribution,
} from "../src/services/workoutRoles.js";

test("planned key workout keeps key and quality roles", () => {
  const assessment = workoutRoleAssessment({
    id: "track",
    title: "5 x 1000 m",
    type: "Intervals",
    keySession: true,
    goalSessionRole: "race_pace_intervals",
  }, {
    goal: { target: { name: "10-km-Lauf" } },
    weekPrescription: { weekType: { label: "Zielspezifische Woche" } },
  });

  assert.equal(assessment.isKeySession, true);
  assert.deepEqual(assessment.markers.map((marker) => marker.key), ["key", "quality"]);
  assert.match(assessment.explanation, /Wettkampfs/);
});

test("backyard long workout is key and long specific", () => {
  const assessment = workoutRoleAssessment({
    id: "backyard",
    title: "4 x 6,7 km Backyard",
    type: "Long Run",
    distance: 26.8,
    keySession: true,
    goalSessionRole: "course_specific_long_run",
  });

  assert.deepEqual(assessment.markers.map((marker) => marker.key), ["key", "long"]);
  assert.equal(assessment.classificationKey, "long");
});

test("football is additional intense load, not a running key session", () => {
  const assessment = workoutRoleAssessment({ id: "football", name: "Gütersloh Fußball", type: "Football", duration: 90 });
  assert.equal(assessment.isKeySession, false);
  assert.equal(assessment.classificationKey, "additional");
  assert.deepEqual(assessment.markers.map((marker) => marker.key), ["additional", "intense"]);
});

test("matched activity inherits the planned key-session role", () => {
  const plan = [{
    id: "planned-track",
    date: "2026-08-04",
    title: "ORC Track",
    type: "Track",
    keySession: true,
    matchedActivityId: "actual-track",
    goalSessionRole: "threshold",
  }];
  const activity = { id: "actual-track", date: "2026-08-04", name: "ORC Track", type: "Run", source: "Intervals.icu" };
  assert.equal(findPlannedWorkoutForActivity(plan, activity)?.id, "planned-track");
  const assessment = workoutRoleAssessment(activity, { plan });
  assert.equal(assessment.source, "plan");
  assert.deepEqual(assessment.markers.map((marker) => marker.key), ["key", "quality"]);
});

test("distribution separates intensity roles and key sessions", () => {
  const distribution = workoutRoleDistribution([
    { id: "easy", name: "6 km locker", type: "Run", distance: 6 },
    { id: "quality", name: "Schwelle", type: "Run", distance: 10, keySession: true },
    { id: "long", name: "Longrun", type: "Run", distance: 24 },
  ]);
  assert.equal(distribution.easy.length, 1);
  assert.equal(distribution.quality.length, 1);
  assert.equal(distribution.long.length, 1);
  assert.equal(distribution.key.length, 1);
});
