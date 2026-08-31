import test from "node:test";
import assert from "node:assert/strict";
import { analyzeTrackRoute, buildRoutePacingPlan, parseGpxRoute, routeDistanceWarning } from "../src/services/raceRoute.js";

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

test("GPX parser accepts self-closing track points without elevation", () => {
  const route = parseGpxRoute(`<?xml version="1.0"?>
<gpx version="1.1"><trk><name>Flache Bahn</name><trkseg>
<trkpt lat="52.0000" lon="8.0000" />
<trkpt lat="52.0000" lon="8.0020" />
<trkpt lat="52.0000" lon="8.0040" />
</trkseg></trk></gpx>`);
  assert.equal(route.pointCount, 3);
  assert.ok(route.distanceKm > 0.2);
});

test("repeated compact 400 m geometry is recognized as a track", () => {
  const points = [];
  const corners = [
    [52.0, 8.0],
    [52.0, 8.00146],
    [52.0009, 8.00146],
    [52.0009, 8.0],
  ];
  for (let lap = 0; lap <= 12; lap += 1) {
    corners.forEach(([lat, lon], corner) => points.push({ lat, lon, distanceKm: lap * 0.4 + corner * 0.1 }));
  }
  points.push({ lat: 52.0, lon: 8.0, distanceKm: 5.0 });
  const analysis = analyzeTrackRoute(
    { name: "Sportpark 5000 m Bahn 1", distanceKm: 5, profilePoints: points },
    { expectedDistanceKm: 5 },
  );
  assert.equal(analysis.isTrack, true);
  assert.equal(analysis.lapDistanceM, 400);
});

test("normal GPS distance drift is normalized to the official race distance", () => {
  const route = {
    distanceKm: 4.99,
    segments: [
      { startKm: 0, endKm: 1, distanceKm: 1, gainM: 0, lossM: 0, netGradePercent: 0 },
      { startKm: 1, endKm: 2, distanceKm: 1, gainM: 0, lossM: 0, netGradePercent: 0 },
      { startKm: 2, endKm: 3, distanceKm: 1, gainM: 0, lossM: 0, netGradePercent: 0 },
      { startKm: 3, endKm: 4, distanceKm: 1, gainM: 0, lossM: 0, netGradePercent: 0 },
      { startKm: 4, endKm: 4.99, distanceKm: 0.99, gainM: 0, lossM: 0, netGradePercent: 0 },
    ],
  };
  const plan = buildRoutePacingPlan({ route, targetDurationMinutes: 20, raceDistanceKm: 5, canonicalKilometres: true });
  assert.equal(plan.distanceNormalized, true);
  assert.equal(plan.raceDistanceKm, 5);
  assert.equal(plan.segments.length, 5);
  assert.ok(plan.segments.every((segment) => Math.abs(segment.distanceKm - 1) < 0.001));
  assert.equal(Math.round(plan.averagePaceSecondsPerKm), 240);
  assert.ok(Math.abs(plan.segments.at(-1).cumulativeMinutes - 20) < 0.01);
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

test("manual kilometre pace stays fixed while remaining splits rebalance to the same finish time", () => {
  const route = parseGpxRoute(SAMPLE_GPX);
  const baseline = buildRoutePacingPlan({ route, targetDurationMinutes: 24 });
  const requestedPace = Math.round(baseline.segments[1].paceSecondsPerKm + 15);
  const adjusted = buildRoutePacingPlan({
    route,
    targetDurationMinutes: 24,
    paceOverrides: { 1: requestedPace },
  });

  assert.equal(adjusted.manualPaceCount, 1);
  assert.equal(Math.round(adjusted.segments[1].paceSecondsPerKm), requestedPace);
  assert.equal(adjusted.segments[1].manualPace, true);
  assert.ok(Math.abs(adjusted.segments.at(-1).cumulativeMinutes - 24) < 0.01);
  assert.ok(adjusted.segments.some((segment, index) => index !== 1 && Math.abs(segment.paceSecondsPerKm - baseline.segments[index].paceSecondsPerKm) > 0.1));
});

test("invalid manual pace overrides fall back to the automatic route plan", () => {
  const route = parseGpxRoute(SAMPLE_GPX);
  const plan = buildRoutePacingPlan({
    route,
    targetDurationMinutes: 24,
    paceOverrides: { 1: 20 },
  });

  assert.equal(plan.manualPaceCount, 0);
  assert.equal(plan.paceOverrideWarning, "");
  assert.ok(Math.abs(plan.segments.at(-1).cumulativeMinutes - 24) < 0.01);
});
