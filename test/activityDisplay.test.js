import test from "node:test";
import assert from "node:assert/strict";
import { activityListMetrics } from "../src/services/activityDisplay.js";

test("football keeps distance and duration but hides pace and elevation", () => {
  const metrics = activityListMetrics({ type: "Soccer", distance: 4.99, duration: 64, elevation: 80, avgHr: 114 });
  assert.equal(metrics.primary, "4,99 km");
  assert.equal(metrics.detail, "1:04 h");
  assert.equal(metrics.secondaryPrimary, "Ø 114 bpm");
  assert.equal(metrics.secondaryDetail, null);
});

test("strength and mobility use duration as the main metric", () => {
  const metrics = activityListMetrics({ type: "Workout", name: "Stabi & Mobilität", distance: 0, duration: 40, elevation: 0, avgHr: 68 });
  assert.equal(metrics.primary, "0:40 h");
  assert.equal(metrics.detail, null);
  assert.equal(metrics.secondaryPrimary, "Ø 68 bpm");
});

test("rowing displays metres without kilometre pace or elevation", () => {
  const metrics = activityListMetrics({ type: "Rowing", name: "Indoor-Rudern 5000m", distance: 0, duration: 30, elevation: 0, avgHr: 118 });
  assert.equal(metrics.primary, "5.000 m");
  assert.equal(metrics.detail, "0:30 h");
  assert.equal(metrics.secondaryPrimary, "Ø 118 bpm");
  assert.equal(metrics.secondaryDetail, null);
});

test("running still shows pace, elevation and pulse", () => {
  const metrics = activityListMetrics({ type: "Run", distance: 12.55, duration: 75, elevation: 113, avgHr: 142 });
  assert.equal(metrics.primary, "12,55 km");
  assert.match(metrics.detail, /^1:15 h · /);
  assert.equal(metrics.secondaryPrimary, "113 hm");
  assert.equal(metrics.secondaryDetail, "Ø 142 bpm");
});
