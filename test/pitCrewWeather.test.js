import test from "node:test";
import assert from "node:assert/strict";
import {
  pitWeatherAlert,
  pitWeatherCrewActions,
  pitWeatherForecastForLoops,
  pitWeatherSignals,
  pitWeatherWindow,
} from "../src/services/pitCrewWeather.js";

test("automatic pit weather turns observations into only relevant crew signals", () => {
  assert.deepEqual(pitWeatherSignals({ temperature: 25, precipitation: 0, weatherCode: 1, windSpeed: 8, windGusts: 14 }), ["hot"]);
  assert.deepEqual(pitWeatherSignals({ temperature: 7, precipitation: 0.4, weatherCode: 61, windSpeed: 27, windGusts: 44 }), ["cold", "rain", "wind"]);
  assert.deepEqual(pitWeatherSignals({ temperature: 17, precipitation: 0, weatherCode: 2, windSpeed: 10, windGusts: 17 }), []);
});

test("pit weather maps the next loops and turns rain plus athlete state into crew preparation", () => {
  const hourly = [
    { epoch: new Date("2026-09-26T10:00:00").getTime(), temperature: 16, feelsLike: 15, humidity: 80, precipitationProbability: 65, precipitation: 0.4, weatherCode: 61, windSpeed: 12, windGusts: 22, isDay: true },
    { epoch: new Date("2026-09-26T11:00:00").getTime(), temperature: 17, feelsLike: 16, humidity: 75, precipitationProbability: 30, precipitation: 0, weatherCode: 2, windSpeed: 10, windGusts: 18, isDay: true },
    { epoch: new Date("2026-09-26T12:00:00").getTime(), temperature: 25, feelsLike: 25, humidity: 60, precipitationProbability: 10, precipitation: 0, weatherCode: 1, windSpeed: 8, windGusts: 14, isDay: true },
  ];
  const first = pitWeatherWindow(hourly, new Date("2026-09-26T10:00:00"), new Date("2026-09-26T10:59:00"));
  assert.ok(first.flags.includes("rain"));
  const loops = pitWeatherForecastForLoops({ observation: { hourly }, nextStart: new Date("2026-09-26T10:00:00"), intervalMinutes: 60, nextRound: 5, count: 3 });
  assert.equal(loops.length, 3);
  assert.equal(loops[0].round, 5);
  assert.match(pitWeatherAlert(loops[0]).label, /Regen/);
  const actions = pitWeatherCrewActions(loops[0], ["too-cold", "thirsty", "heavy-legs"]);
  assert.ok(actions.some((item) => item.includes("Regenjacke")));
  assert.ok(actions.some((item) => item.includes("trockene Socken")));
  assert.ok(actions.some((item) => item.includes("Getränk zuerst")));
});
