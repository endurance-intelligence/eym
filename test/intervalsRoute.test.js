import assert from "node:assert/strict";
import test from "node:test";
import {
  downsampleRoute,
  intervalsLatLngPoints,
  intervalsRoutePayload,
  intervalsRouteSamples,
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

test("route samples align measured distance, altitude, speed and time with GPS points", () => {
  const samples = intervalsRouteSamples([
    { type: "latlng", data: [52.015, 52.016, 52.017], data2: [8.531, 8.533, 8.535] },
    { type: "distance", data: [0, 501.25, 1_002.5] },
    { type: "altitude", data: [112.4, 118.75, 115.2] },
    { type: "velocity_smooth", data: [3.25, 4.1, 0] },
    { type: "time", data: [0, 128.4, 265.8] },
  ]);

  assert.deepEqual(samples, [
    { lat: 52.015, lon: 8.531, distanceKm: 0, altitude: 112.4, speedMps: 3.25, elapsedSeconds: 0 },
    { lat: 52.016, lon: 8.533, distanceKm: 0.5012, altitude: 118.8, speedMps: 4.1, elapsedSeconds: 128 },
    { lat: 52.017, lon: 8.535, distanceKm: 1.0025, altitude: 115.2, speedMps: 0, elapsedSeconds: 266 },
  ]);
});

test("missing profile measurements are omitted instead of estimated", () => {
  assert.deepEqual(
    intervalsRoutePayload([
      { type: "latlng", data: [[52.015, 8.531], [52.016, 8.533]] },
      { type: "altitude", data: [null, ""] },
      { type: "velocity_smooth", data: [null, "invalid"] },
    ]),
    {
      points: [
        { lat: 52.015, lon: 8.531 },
        { lat: 52.016, lon: 8.533 },
      ],
      pointCount: 2,
      streams: {
        distance: false,
        altitude: false,
        speed: false,
        time: false,
      },
    },
  );
});

test("an activity without a latitude and longitude stream produces no map points", () => {
  assert.deepEqual(
    intervalsRoutePayload([{ type: "heartrate", data: [112, 118, 121] }]),
    {
      points: [],
      pointCount: 0,
      streams: {
        distance: false,
        altitude: false,
        speed: false,
        time: false,
      },
    },
  );
});
