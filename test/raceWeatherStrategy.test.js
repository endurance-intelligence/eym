import test from "node:test";
import assert from "node:assert/strict";
import {
  bearingDegrees,
  buildRaceWeatherStrategy,
  buildTrackWindPlan,
  compareRaceWeatherSnapshots,
  raceForecastConfidence,
  raceWeekEvent,
  resolveRaceWeatherDuration,
  windImpactForBearing,
} from "../src/services/raceWeatherStrategy.js";

function hourlyRow(time, overrides = {}) {
  return {
    time,
    epoch: Date.parse(`${time}:00Z`),
    temperature: 14,
    feelsLike: 13,
    precipitationProbability: 10,
    precipitation: 0,
    weatherCode: 2,
    cloudCover: 50,
    windSpeed: 18,
    windDirection: 225,
    windGusts: 28,
    isDay: true,
    ...overrides,
  };
}

const routeProfile = {
  distanceKm: 12,
  profilePoints: [
    { lat: 52.0, lon: 8.0, distanceKm: 0 },
    { lat: 52.0, lon: 8.06, distanceKm: 4 },
    { lat: 52.03, lon: 8.06, distanceKm: 8 },
    { lat: 52.03, lon: 8.12, distanceKm: 12 },
  ],
};

test("wind component recognizes headwind, tailwind and crosswind from meteorological wind direction", () => {
  assert.equal(Math.round(windImpactForBearing(180, 225, 26).headwindKmh), 18);
  assert.ok(windImpactForBearing(45, 225, 20).headwindKmh < -19);
  assert.ok(windImpactForBearing(135, 225, 20).crosswindKmh >= 19);
  assert.equal(Math.round(bearingDegrees({ lat: 52, lon: 8 }, { lat: 52, lon: 8.01 })), 90);
});

test("race weather splits a longer race into thirds tied to passage times and changing weather", () => {
  const forecasts = [{
    fraction: 0.5,
    timezone: "Europe/Berlin",
    rows: [
      hourlyRow("2026-09-06T08:00", { temperature: 11, precipitationProbability: 85, precipitation: 1.2, weatherCode: 61, windSpeed: 24, windGusts: 38 }),
      hourlyRow("2026-09-06T09:00", { temperature: 15, precipitationProbability: 35, windSpeed: 18 }),
      hourlyRow("2026-09-06T10:00", { temperature: 19, precipitationProbability: 5, weatherCode: 1, windSpeed: 12 }),
      hourlyRow("2026-09-06T11:00", { temperature: 16, precipitationProbability: 15, windSpeed: 20 }),
    ],
  }];
  const strategy = buildRaceWeatherStrategy({
    race: { date: "2026-09-06", time: "08:00" },
    routeProfile,
    raceDistanceKm: 12,
    targetDurationMinutes: 180,
    forecasts,
    confidence: { key: "strong" },
  });
  assert.equal(strategy.sections.length, 3);
  assert.equal(strategy.sections[0].title, "Erstes Drittel");
  assert.equal(strategy.sections[2].title, "Letztes Drittel");
  assert.ok(strategy.maxRainProbability >= 80);
  assert.ok(strategy.sections[0].advice.some((item) => item.includes("Regen")));
});

test("track wind plan maps the last lap to Gegengerade and Zielgerade instead of only reporting generic wind", () => {
  const track = {
    distanceKm: 0.4,
    profilePoints: [
      { lat: 52.0, lon: 8.0, distanceKm: 0 },
      { lat: 51.9997, lon: 8.001, distanceKm: 0.1 },
      { lat: 52.0, lon: 8.002, distanceKm: 0.2 },
      { lat: 52.0003, lon: 8.001, distanceKm: 0.3 },
      { lat: 52.0, lon: 8.0, distanceKm: 0.4 },
    ],
  };
  const forecasts = [{ fraction: 0.5, rows: [hourlyRow("2026-09-04T18:00", { windDirection: 225, windSpeed: 26 })] }];
  const plan = buildTrackWindPlan({
    forecasts,
    routeProfile: track,
    raceDistanceKm: 5,
    startEpoch: Date.parse("2026-09-04T18:00:00Z"),
    targetDurationMinutes: 21,
    lapDistanceM: 400,
  });
  assert.equal(plan.length, 4);
  assert.equal(plan[1].label, "Gegengerade");
  assert.equal(plan[3].label, "Zielgerade");
  assert.ok(plan.every((section) => Number.isFinite(section.headwindKmh)));
});

test("forecast confidence gets stricter toward race day and snapshot comparison surfaces material changes", () => {
  assert.equal(raceForecastConfidence("2026-09-04", new Date("2026-09-03T12:00:00Z")).key, "final");
  const changes = compareRaceWeatherSnapshots(
    { maxRainProbability: 30, maxWindSpeed: 12, maxTemperature: 16, sections: [{ rain: 20 }] },
    { maxRainProbability: 70, maxWindSpeed: 22, maxTemperature: 20, sections: [{ rain: 65 }] },
  );
  assert.ok(changes.some((item) => item.includes("Regenwahrscheinlichkeit")));
  assert.ok(changes.some((item) => item.includes("Wind")));
  assert.ok(changes.some((item) => item.includes("Temperatur")));
});


test("race weather duration uses exact event timing first and marks distance-only windows as estimates", () => {
  assert.deepEqual(resolveRaceWeatherDuration({ race: { targetTime: "00:22:30", targetKm: 5 } }), {
    minutes: 22.5,
    estimated: false,
    source: "target-time",
    label: "Rennfenster aus Zielzeit",
  });
  assert.equal(resolveRaceWeatherDuration({ race: { eventTimeLimit: "15:00:00", targetKm: 112 } }).minutes, 900);
  const backyard = resolveRaceWeatherDuration({ race: { loopMode: "fixed_interval", loopKm: 6.7, loopIntervalMinutes: 60, targetKm: 100 } });
  assert.equal(backyard.minutes, 900);
  assert.equal(backyard.estimated, false);
  const estimated = resolveRaceWeatherDuration({ race: { targetKm: 42.195 } });
  assert.equal(estimated.estimated, true);
  assert.ok(estimated.minutes > 240);
});


test("race week hint selects the next active event inside the current Monday-to-Sunday window", () => {
  const mission = {
    milestones: [
      { id: "past", name: "Tuesday race", date: "2026-09-01", time: "18:00" },
      { id: "friday", name: "Friday race", date: "2026-09-11", time: "19:00" },
      { id: "sunday", name: "Sunday race", date: "2026-09-13", time: "09:00" },
      { id: "next", name: "Next week", date: "2026-09-14", time: "09:00" },
    ],
  };
  const selected = raceWeekEvent(mission, new Date("2026-09-07T09:00:00"));
  assert.equal(selected?.id, "friday");
  assert.equal(raceWeekEvent({ milestones: [{ id: "next", date: "2026-09-14" }] }, new Date("2026-09-07T09:00:00")), null);
});
