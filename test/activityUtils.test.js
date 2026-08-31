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


test("distinct Intervals sessions on the same day are never collapsed by similarity", () => {
  const warmup = {
    id: "intervals-2901",
    intervalsId: "2901",
    source: "intervals",
    type: "Run",
    name: "ORC - Warm up + Lauf ABC",
    startDateLocal: "2026-08-29T09:00:00",
    distance: 2.8,
    durationSeconds: 22 * 60,
  };
  const intervals = {
    id: "intervals-2902",
    intervalsId: "2902",
    source: "intervals",
    type: "Run",
    name: "ORC - Bergintervalle",
    startDateLocal: "2026-08-29T09:27:00",
    distance: 5.77,
    durationSeconds: 31 * 60,
  };
  const cooldown = {
    id: "intervals-2903",
    intervalsId: "2903",
    source: "intervals",
    type: "Run",
    name: "ORC - Cool down",
    startDateLocal: "2026-08-29T10:03:00",
    distance: 2.7,
    durationSeconds: 16 * 60,
  };

  assert.equal(activitiesLikelySame(warmup, cooldown), false);
  assert.deepEqual(
    preferredActivities([warmup, intervals, cooldown]).map((item) => item.intervalsId).sort(),
    ["2901", "2902", "2903"],
  );
});

test("same Intervals activity remains stable across a re-sync", () => {
  const stored = { id: "activity-local", intervalsId: "4711", source: "intervals", type: "Run", date: "2026-08-29", distance: 10 };
  const imported = { id: "intervals-4711", intervalsId: "4711", source: "intervals", type: "Run", date: "2026-08-29", distance: 10.02 };
  assert.equal(activitiesLikelySame(stored, imported), true);
});

test("cross-provider dedupe requires close start times when clock data exists", () => {
  const intervals = { source: "intervals", intervalsId: "a", type: "Run", startDateLocal: "2026-08-29T09:00:00", distance: 2.8, durationSeconds: 1320 };
  const garminSame = { source: "garmin", externalId: "g1", type: "Run", startDateLocal: "2026-08-29T09:01:00", distance: 2.79, durationSeconds: 1310 };
  const garminLater = { source: "garmin", externalId: "g2", type: "Run", startDateLocal: "2026-08-29T10:03:00", distance: 2.7, durationSeconds: 960 };
  assert.equal(activitiesLikelySame(intervals, garminSame), true);
  assert.equal(activitiesLikelySame(intervals, garminLater), false);
});
