import test from "node:test";
import assert from "node:assert/strict";
import { buildSportBreakdown, buildYearStats, formatActivityDistance } from "../src/services/yearActivityStats.js";

test("year activity stats aggregate distance per sport instead of only counting sessions", () => {
  const activities = [
    { id: "run-1", date: "2026-01-03", type: "Run", distance: 10.2, duration: 61, elevation: 120 },
    { id: "run-2", date: "2026-01-05", type: "Run", distance: 6.8, duration: 42, elevation: 30 },
    { id: "ride-1", date: "2026-01-06", type: "Ride", distance: 42.5, duration: 110, elevation: 410 },
    { id: "old-run", date: "2025-12-31", type: "Run", distance: 15, duration: 90, elevation: 0 },
  ];

  const result = buildYearStats(activities, 2026);
  const running = result.sports.find((sport) => sport.key === "running");
  const cycling = result.sports.find((sport) => sport.key === "cycling");

  assert.equal(result.count, 3);
  assert.equal(result.distance, 59.5);
  assert.equal(running.count, 2);
  assert.equal(running.distance, 17);
  assert.equal(cycling.count, 1);
  assert.equal(cycling.distance, 42.5);
});

test("sport breakdown keeps activities without distance visible with zero kilometres", () => {
  const result = buildSportBreakdown([
    { id: "strength-1", date: "2026-01-03", type: "WeightTraining", duration: 30 },
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0].count, 1);
  assert.equal(result[0].distance, 0);
  assert.equal(formatActivityDistance(result[0].distance), "0 km");
});
