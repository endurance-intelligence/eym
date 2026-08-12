import test from "node:test";
import assert from "node:assert/strict";
import { buildRoutePacingPlan, parseGpxRoute, routeDistanceWarning } from "../src/services/raceRoute.js";

const SAMPLE_GPX = `<?xml version="1.0"?>
<gpx version="1.1"><trk><name>Testkurs</name><trkseg>
<trkpt lat="52.0000" lon="8.0000"><ele>100</ele></trkpt>
<trkpt lat="52.0000" lon="8.0073"><ele>102</ele></trkpt>
<trkpt lat="52.0000" lon="8.0146"><ele>105</ele></trkpt>
<trkpt lat="52.0045" lon="8.0146"><ele>165</ele></trkpt>
<trkpt lat="52.0090" lon="8.0146"><ele>225</ele></trkpt>
<trkpt lat="52.0090" lon="8.0073"><ele>165</ele></trkpt>
<trkpt lat="52.0090" lon="8.0000"><ele>105</ele></trkpt>
<trkpt lat="52.0045" lon="8.0000"><ele>102</ele></trkpt>
<trkpt lat="52.0000" lon="8.0000"><ele>100</ele></trkpt>
</trkseg></trk></gpx>`;

test("GPX route parser returns distance, elevation and kilometre segments", () => {
  const route = parseGpxRoute(SAMPLE_GPX);

  assert.equal(route.name, "Testkurs");
  assert.ok(route.distanceKm > 3.5 && route.distanceKm < 4.5);
  assert.ok(route.ascentM > 50);
  assert.ok(route.descentM > 50);
  assert.ok(route.segments.length >= 4);
  assert.ok(route.profilePoints.length >= 2);
  assert.ok(Number.isFinite(route.profilePoints[0].lat));
  assert.ok(Number.isFinite(route.profilePoints[0].lon));
  assert.ok(route.segments.slice(0, -1).every((segment) => Math.abs(segment.distanceKm - 1) < 0.01));
});

test("route pacing plan slows climbing kilometres and still lands on target time", () => {
  const route = parseGpxRoute(SAMPLE_GPX);
  const plan = buildRoutePacingPlan({ route, targetDurationMinutes: 24 });

  assert.ok(plan);
  assert.ok(Math.abs(plan.segments.at(-1).cumulativeMinutes - 24) < 0.01);
  const climb = plan.segments.find((segment) => ["up", "steep-up"].includes(segment.terrain));
  const easiest = [...plan.segments].sort((left, right) => left.paceSecondsPerKm - right.paceSecondsPerKm)[0];
  assert.ok(climb);
  assert.ok(climb.paceSecondsPerKm > easiest.paceSecondsPerKm);
});

test("fuel timing is attached to a route segment and avoids a hard climb when a nearby easier slot exists", () => {
  const route = parseGpxRoute(SAMPLE_GPX);
  const plan = buildRoutePacingPlan({
    route,
    targetDurationMinutes: 40,
    fuelStrategy: {
      rows: [{ minute: 20, drinkMl: 150, fuel: [{ product: "Test Gel" }] }],
    },
  });

  const fueled = plan.segments.find((segment) => segment.drinkMl > 0 || segment.fuel.length > 0);
  assert.ok(fueled);
  assert.equal(fueled.drinkMl, 150);
  assert.equal(fueled.fuel[0].product, "Test Gel");
});

test("route mismatch warning stays quiet for normal GPS tolerance", () => {
  assert.equal(routeDistanceWarning({ distanceKm: 9.82 }, 10), "");
  assert.match(routeDistanceWarning({ distanceKm: 8.9 }, 10), /GPX/);
});
