import assert from "node:assert/strict";
import test from "node:test";
import {
  activityAverageEffort,
  activityProfileModel,
  formatProfileAxis,
  formatProfileEffort,
  formatProfileElapsed,
  formatProfilePace,
} from "../src/services/activityProfile.js";

const points = [
  { lat: 52.01, lon: 8.51, distanceKm: 0, altitude: 101, speedMps: 3, elapsedSeconds: 0 },
  { lat: 52.02, lon: 8.52, distanceKm: 1, altitude: 118, speedMps: 4, elapsedSeconds: 260 },
  { lat: 52.03, lon: 8.53, distanceKm: 2, altitude: 109, speedMps: 0, elapsedSeconds: 520 },
];

function withoutFields(point, fields) {
  return Object.fromEntries(Object.entries(point).filter(([key]) => !fields.includes(key)));
}

test("running profiles use measured distance and convert speed into pace", () => {
  const model = activityProfileModel(points, { type: "Run" });
  assert.equal(model.kind, "pace");
  assert.equal(model.axisMode, "distance");
  assert.equal(model.points[0].effort, 1000 / 3);
  assert.equal(model.points[1].effort, 250);
  assert.equal(model.points[2].effort, null);
  assert.deepEqual(model.altitudeRange, { minimum: 101, maximum: 118 });
  assert.equal(model.hasAltitude, true);
  assert.equal(model.hasEffort, true);
});

test("road cycling profiles show speed instead of running pace", () => {
  const model = activityProfileModel(points, { type: "RoadRide" });
  assert.equal(model.kind, "speed");
  assert.equal(model.points[0].effort, 10.8);
  assert.equal(model.points[1].effort, 14.4);
});

test("profiles fall back to measured time before using neutral progress", () => {
  const timed = activityProfileModel(points.map((point) => withoutFields(point, ["distanceKm"])), { type: "Run" });
  assert.equal(timed.axisMode, "time");

  const progress = activityProfileModel(
    points.map((point) => withoutFields(point, ["distanceKm", "elapsedSeconds"])),
    { type: "Run" },
  );
  assert.equal(progress.axisMode, "progress");
  assert.deepEqual(progress.points.map((point) => point.axisValue), [0, 1, 2]);
});

test("profile labels format pace, speed, duration and axes", () => {
  assert.equal(formatProfilePace(341), "5:41 /km");
  assert.equal(formatProfileEffort(27.25, "speed"), "27,3 km/h");
  assert.equal(formatProfileElapsed(3_725), "1:02:05");
  assert.equal(formatProfileAxis(5.5, "distance", 10), "5,5 km");
  assert.equal(formatProfileAxis(3_600, "time", 7_200), "1:00 h");
});

test("activity averages use recorded summary values without inventing missing data", () => {
  assert.equal(activityAverageEffort({ distance: 10, durationSeconds: 3_000 }, "pace"), 300);
  assert.equal(activityAverageEffort({ averageSpeed: 8 }, "speed"), 28.8);
  assert.equal(activityAverageEffort({}, "pace"), null);
});
