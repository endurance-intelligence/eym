import test from "node:test";
import assert from "node:assert/strict";
import { activitiesLikelySame, plannerSportType, preferredActivities } from "../src/services/activityUtils.js";

test("same imported activity is recognized across providers", () => {
  const intervals = { id: "i", source: "intervals", type: "Run", date: "2026-07-20", distance: 10, durationSeconds: 3600 };
  const garmin = { id: "g", source: "garmin", type: "Run", date: "2026-07-20", distance: 10.1, durationSeconds: 3620 };
  assert.equal(activitiesLikelySame(intervals, garmin), true);
  assert.deepEqual(preferredActivities([garmin, intervals]).map((item) => item.id), ["i"]);
});

test("planner trusts the primary Intervals activity type when sport metadata conflicts", () => {
  const runWithCyclingMetadata = { type: "Run", sportType: "Cycling", name: "Mittwoch Lauf" };
  const rideWithRunMetadata = { type: "Ride", sportType: "Running", name: "Rennrad" };
  assert.equal(plannerSportType(runWithCyclingMetadata), "running");
  assert.equal(plannerSportType(rideWithRunMetadata), "cycling");
  assert.equal(plannerSportType({ ...rideWithRunMetadata, sportTypeOverride: "running" }), "running");
});
