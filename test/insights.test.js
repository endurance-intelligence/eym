import test from "node:test";
import assert from "node:assert/strict";
import { coachDashboard } from "../src/services/insights.js";

function run(id, date, name, avgHr, temperature, rpe = 5) {
  return {
    id,
    type: "Run",
    name,
    date,
    startDateLocal: `${date}T19:00:00`,
    distance: 8,
    duration: 50,
    avgHr,
    temperature,
    review: { rpe },
  };
}

test("heart-rate guidance names the actual easy run and never presents ORC Track as that run", () => {
  const activities = [
    run("track", "2026-07-28", "ORC Track", 170, 28, 9),
    run("hot-easy", "2026-07-26", "8 km locker", 155, 26),
    run("easy-two", "2026-07-23", "Easy Run", 141, 18),
    run("easy-three", "2026-07-20", "Recovery Run", 140, 17),
  ];
  const reviews = Object.fromEntries(activities.map((activity) => [
    activity.id,
    { rpe: activity.review.rpe, legs: 7, energy: 7 },
  ]));

  const result = coachDashboard(activities, reviews, new Date("2026-07-29T12:00:00"));

  assert.match(result.hrWeather.text, /„8 km locker“ vom 26\.07\./);
  assert.doesNotMatch(result.hrWeather.text, /ORC Track/);
  assert.match(result.recommendation, /bestehende Plan bleibt unverändert/);
  assert.doesNotMatch(result.recommendation, /zusätzliche Qualität/);
});
