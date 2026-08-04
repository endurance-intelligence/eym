import test from "node:test";
import assert from "node:assert/strict";
import {
  mappedRowingDistanceMeters,
  parseRowingDistanceMeters,
  rawIntervalsDistanceMeters,
} from "../src/services/rowingDistance.js";

test("rowing distance is recovered from common workout titles", () => {
  assert.equal(parseRowingDistanceMeters("Indoor-Rudern 5000m"), 5000);
  assert.equal(parseRowingDistanceMeters("Rudern 5 km locker"), 5000);
  assert.equal(parseRowingDistanceMeters("10 x 500 m RowErg"), 5000);
});

test("Intervals rowing distance uses raw fields before the title fallback", () => {
  assert.equal(rawIntervalsDistanceMeters({ type: "Rowing", distance: 5000, name: "Rudern" }), 5000);
  assert.equal(rawIntervalsDistanceMeters({ type: "Rowing", distance: 0, total_distance_meters: 5000 }), 5000);
  assert.equal(rawIntervalsDistanceMeters({ type: "Rowing", distance: 0, name: "Indoor-Rudern 5000m" }), 5000);
});

test("mapped rowing activities retain exact metres", () => {
  assert.equal(mappedRowingDistanceMeters({ type: "Rowing", distanceMeters: 5000, distance: 5 }), 5000);
  assert.equal(mappedRowingDistanceMeters({ type: "Rowing", distance: 5 }), 5000);
  assert.equal(mappedRowingDistanceMeters({ type: "Rowing", distance: 0, name: "Indoor-Rudern 5000m" }), 5000);
});
