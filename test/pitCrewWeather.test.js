import test from "node:test";
import assert from "node:assert/strict";
import { pitWeatherSignals } from "../src/services/pitCrewWeather.js";

test("automatic pit weather turns observations into only relevant crew signals", () => {
  assert.deepEqual(pitWeatherSignals({ temperature: 25, precipitation: 0, weatherCode: 1, windSpeed: 8, windGusts: 14 }), ["hot"]);
  assert.deepEqual(pitWeatherSignals({ temperature: 7, precipitation: 0.4, weatherCode: 61, windSpeed: 27, windGusts: 44 }), ["cold", "rain", "wind"]);
  assert.deepEqual(pitWeatherSignals({ temperature: 17, precipitation: 0, weatherCode: 2, windSpeed: 10, windGusts: 17 }), []);
});
