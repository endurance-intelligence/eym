import test from "node:test";
import assert from "node:assert/strict";
import { briefingWeatherInsight } from "../src/services/briefingWeather.js";

function point(hour, overrides = {}) {
  return {
    time: `2026-07-27T${String(hour).padStart(2, "0")}:00`,
    temperature: 16,
    humidity: 65,
    precipitation: 0,
    rainChance: 5,
    windSpeed: 8,
    windGusts: 15,
    weatherCode: 1,
    ...overrides,
  };
}

const weather = {
  location: "Kachtenhausen",
  temperature: 18,
  condition: "Bewölkt",
  precipitation: 0,
  hourly: [
    point(6, { rainChance: 80, precipitation: 2 }),
    point(7, { rainChance: 75, precipitation: 1.5 }),
    point(8),
    point(9),
    point(10, { windSpeed: 30, windGusts: 48 }),
    point(11, { windSpeed: 30, windGusts: 48 }),
  ],
};

test("briefing recommends a two-hour slot for a spontaneous run", () => {
  const insight = briefingWeatherInsight(
    weather,
    [{ title: "8 km locker", type: "Easy Run", time: "18:00" }],
    new Date("2026-07-27T06:15:00"),
  );
  assert.equal(insight.mode, "flexible");
  assert.equal(insight.subject, "Lauf");
  assert.equal(insight.slotObject, "deinen Lauf");
  assert.equal(insight.windowLabel, "08:00–10:00 Uhr");
});

test("briefing uses the correct wording and stronger wind penalty for a road ride", () => {
  const insight = briefingWeatherInsight(
    weather,
    [{ title: "Rennrad Grundlagenrunde", type: "Radfahren", spontaneous: true }],
    new Date("2026-07-27T06:15:00"),
  );
  assert.equal(insight.mode, "flexible");
  assert.equal(insight.subject, "Tour");
  assert.equal(insight.slotObject, "deine Tour");
  assert.equal(insight.windowLabel, "08:00–10:00 Uhr");
});

test("fixed appointments keep their supplied time instead of receiving a best-slot claim", () => {
  const insight = briefingWeatherInsight(
    weather,
    [{ title: "ORC Track", type: "ORC Track", fixed: true, time: "10:00" }],
    new Date("2026-07-27T06:15:00"),
  );
  assert.equal(insight.mode, "fixed");
  assert.match(insight.headline, /^10:00 Uhr/);
  assert.equal(insight.windowLabel, undefined);
});

test("an explicitly timed non-fixed session is weather-checked at its selected time", () => {
  const insight = briefingWeatherInsight(
    weather,
    [{ title: "Feierabendlauf", type: "Easy Run", spontaneous: false, time: "09:00" }],
    new Date("2026-07-27T06:15:00"),
  );
  assert.equal(insight.mode, "timed");
  assert.match(insight.eyebrow, /geplanten Zeit/);
});

test("briefing never recommends a weather window that has already passed", () => {
  const insight = briefingWeatherInsight(
    weather,
    [{ title: "8 km locker", type: "Easy Run", spontaneous: true }],
    new Date("2026-07-27T20:30:00"),
  );
  assert.equal(insight.mode, "general");
});
