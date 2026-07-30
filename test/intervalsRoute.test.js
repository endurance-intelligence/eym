import assert from "node:assert/strict";
import test from "node:test";
import {
  downsampleRoute,
  intervalsLatLngPoints,
  intervalsRoutePayload,
} from "../supabase/functions/_shared/intervalsRoute.ts";

test("Intervals latitude and longitude streams become valid route points", () => {
  const points = intervalsLatLngPoints([
    { type: "time", data: [0, 1, 2] },
    {
      type: "latlng",
      data: [52.015, 52.016, null, 95],
      data2: [8.531, 8.533, 8.535, 8.537],
    },
  ]);

  assert.deepEqual(points, [
    { lat: 52.015, lon: 8.531 },
    { lat: 52.016, lon: 8.533 },
  ]);
});

test("route downsampling preserves the start and finish", () => {
  const points = Array.from({ length: 2_000 }, (_entry, index) => ({
    lat: 52 + index / 100_000,
    lon: 8 + index / 100_000,
  }));
  const reduced = downsampleRoute(points, 100);
  assert.equal(reduced.length, 100);
  assert.deepEqual(reduced[0], points[0]);
  assert.deepEqual(reduced.at(-1), points.at(-1));
  assert.equal(intervalsRoutePayload([{ type: "latlng", data: points.map((point) => [point.lat, point.lon]) }], 100).pointCount, 2_000);
});

test("an activity without a latitude and longitude stream produces no map points", () => {
  assert.deepEqual(
    intervalsRoutePayload([{ type: "heartrate", data: [112, 118, 121] }]),
    { points: [], pointCount: 0 },
  );
});
