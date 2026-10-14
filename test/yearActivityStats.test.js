import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSportBreakdown,
  buildYearStats,
  formatActivityDistance,
  sportUsesDistance,
} from "../src/services/yearActivityStats.js";

test("year activity stats aggregate distance only for sports where distance is meaningful", () => {
  const activities = [
    { id: "run-1", date: "2026-01-03", type: "Run", distance: 10.2, duration: 61, elevation: 120 },
    { id: "run-2", date: "2026-01-05", type: "Run", distance: 6.8, duration: 42, elevation: 30 },
    { id: "ride-1", date: "2026-01-06", type: "Ride", distance: 42.5, duration: 110, elevation: 410 },
    { id: "strength-1", date: "2026-01-07", type: "WeightTraining", distance: 194.1, duration: 30, elevation: 900 },
    { id: "old-run", date: "2025-12-31", type: "Run", distance: 15, duration: 90, elevation: 0 },
  ];

  const result = buildYearStats(activities, 2026);
  const running = result.sports.find((sport) => sport.key === "running");
  const cycling = result.sports.find((sport) => sport.key === "cycling");
  const strength = result.sports.find((sport) => sport.key === "strength");

  assert.equal(result.count, 4);
  assert.equal(result.distance, 59.5);
  assert.equal(result.elevation, 560);
  assert.equal(running.count, 2);
  assert.equal(running.distance, 17);
  assert.equal(cycling.count, 1);
  assert.equal(cycling.distance, 42.5);
  assert.equal(strength.count, 1);
  assert.equal(strength.distance, 0);
  assert.equal(strength.elevation, 0);
  assert.equal(strength.duration, 30);
  assert.equal(strength.distanceMeaningful, false);
  assert.equal(sportUsesDistance("strength"), false);
});

test("sport breakdown keeps strength and mobility visible without inventing kilometres", () => {
  const result = buildSportBreakdown([
    { id: "strength-1", date: "2026-01-03", type: "WeightTraining", distance: 12.3, duration: 30 },
    { id: "mobility-1", date: "2026-01-05", type: "Yoga", distance: 8.7, duration: 25 },
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0].count, 2);
  assert.equal(result[0].distance, 0);
  assert.equal(result[0].duration, 55);
  assert.equal(formatActivityDistance(result[0].distance), "0 km");
});

test("year-to-date comparison can stop both years at the same calendar day", () => {
  const activities = [
    { id: "current-in", date: "2026-10-14", type: "Run", distance: 10, duration: 60 },
    { id: "current-out", date: "2026-10-15", type: "Run", distance: 30, duration: 180 },
    { id: "previous-in", date: "2025-10-14", type: "Run", distance: 8, duration: 50 },
    { id: "previous-out", date: "2025-12-01", type: "Run", distance: 40, duration: 240 },
  ];

  assert.equal(buildYearStats(activities, 2026, { throughMonthDay: "10-14" }).distance, 10);
  assert.equal(buildYearStats(activities, 2025, { throughMonthDay: "10-14" }).distance, 8);
});
