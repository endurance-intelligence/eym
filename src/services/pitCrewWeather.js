import { resolveRaceWeatherDuration } from "./raceWeatherStrategy.js";

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";

function numeric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function raceCoordinates(race = {}) {
  const latitude = numeric(race?.place?.latitude ?? race?.latitude);
  const longitude = numeric(race?.place?.longitude ?? race?.longitude);
  return latitude != null && longitude != null ? { latitude, longitude, source: "event" } : null;
}

async function geocodeRaceLocation(race = {}) {
  const query = String(race?.location || "").trim();
  if (!query) return null;
  const params = new URLSearchParams({ name: query, count: "1", language: "de", format: "json" });
  const response = await fetch(`${GEOCODE_URL}?${params}`);
  if (!response.ok) return null;
  const data = await response.json();
  const first = Array.isArray(data?.results) ? data.results[0] : null;
  const latitude = numeric(first?.latitude);
  const longitude = numeric(first?.longitude);
  return latitude != null && longitude != null ? { latitude, longitude, source: "event-location" } : null;
}

function browserPosition() {
  return new Promise((resolve, reject) => {
    if (!globalThis.navigator?.geolocation) {
      reject(new Error("Standort ist auf diesem Gerät nicht verfügbar."));
      return;
    }
    globalThis.navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        source: "device",
      }),
      () => reject(new Error("Wetterstandort konnte nicht automatisch ermittelt werden.")),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 30 * 60 * 1000 },
    );
  });
}

export function pitWeatherSignals(observation = {}) {
  const temperature = Number(observation.temperature);
  const precipitation = Number(observation.precipitation || 0);
  const precipitationProbability = Number(observation.precipitationProbability || 0);
  const weatherCode = Number(observation.weatherCode || 0);
  const windSpeed = Number(observation.windSpeed || 0);
  const windGusts = Number(observation.windGusts || 0);
  const flags = [];
  if (Number.isFinite(temperature) && temperature >= 24) flags.push("hot");
  if (Number.isFinite(temperature) && temperature <= 9) flags.push("cold");
  if (precipitation >= 0.1 || precipitationProbability >= 45 || (weatherCode >= 51 && weatherCode <= 82) || weatherCode >= 95) flags.push("rain");
  if (windSpeed >= 25 || windGusts >= 40) flags.push("wind");
  return flags;
}

export function pitWeatherIcon(weatherCode = 0, isDay = true) {
  const code = Number(weatherCode || 0);
  if ([95, 96, 99].includes(code)) return "⛈️";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "❄️";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "🌧️";
  if ([45, 48].includes(code)) return "🌫️";
  if ([1, 2, 3].includes(code)) return isDay ? "⛅" : "☁️";
  return isDay ? "☀️" : "🌙";
}

function hourlyRows(hourly = {}) {
  return (Array.isArray(hourly.time) ? hourly.time : []).map((time, index) => ({
    time,
    epoch: new Date(time).getTime(),
    temperature: Math.round(Number(hourly.temperature_2m?.[index] || 0)),
    feelsLike: Math.round(Number(hourly.apparent_temperature?.[index] || 0)),
    humidity: Math.round(Number(hourly.relative_humidity_2m?.[index] || 0)),
    precipitationProbability: Math.round(Number(hourly.precipitation_probability?.[index] || 0)),
    precipitation: Number(hourly.precipitation?.[index] || 0),
    weatherCode: Number(hourly.weather_code?.[index] || 0),
    windSpeed: Math.round(Number(hourly.wind_speed_10m?.[index] || 0)),
    windGusts: Math.round(Number(hourly.wind_gusts_10m?.[index] || 0)),
    isDay: Boolean(hourly.is_day?.[index]),
  })).filter((row) => Number.isFinite(row.epoch));
}

function average(values = []) {
  return values.length ? values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length : 0;
}

export function pitWeatherWindow(rows = [], startAt, endAt) {
  const start = startAt instanceof Date ? startAt.getTime() : new Date(startAt).getTime();
  const end = endAt instanceof Date ? endAt.getTime() : new Date(endAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const candidates = (Array.isArray(rows) ? rows : []).filter((row) => row.epoch >= start - 30 * 60000 && row.epoch <= end + 30 * 60000);
  if (!candidates.length) return null;
  const midpoint = candidates[Math.floor(candidates.length / 2)];
  const result = {
    startAt: new Date(start),
    endAt: new Date(end),
    temperature: Math.round(average(candidates.map((row) => row.temperature))),
    feelsLike: Math.round(average(candidates.map((row) => row.feelsLike))),
    humidity: Math.round(average(candidates.map((row) => row.humidity))),
    precipitationProbability: Math.max(...candidates.map((row) => row.precipitationProbability)),
    precipitation: Math.max(...candidates.map((row) => row.precipitation)),
    weatherCode: midpoint.weatherCode,
    isDay: midpoint.isDay,
    windSpeed: Math.max(...candidates.map((row) => row.windSpeed)),
    windGusts: Math.max(...candidates.map((row) => row.windGusts)),
  };
  return { ...result, flags: pitWeatherSignals(result) };
}

export function pitWeatherForecastForLoops({ observation = {}, nextStart = null, intervalMinutes = 60, nextRound = 1, count = 3 } = {}) {
  if (!nextStart || !Array.isArray(observation?.hourly) || !observation.hourly.length) return [];
  const start = nextStart instanceof Date ? nextStart : new Date(nextStart);
  if (Number.isNaN(start.getTime())) return [];
  const intervalMs = Math.max(10, Number(intervalMinutes || 60)) * 60000;
  return Array.from({ length: Math.max(1, count) }, (_, index) => {
    const loopStart = new Date(start.getTime() + index * intervalMs);
    const loopEnd = new Date(loopStart.getTime() + intervalMs);
    const forecast = pitWeatherWindow(observation.hourly, loopStart, loopEnd);
    return forecast ? { ...forecast, round: Math.max(1, Number(nextRound || 1)) + index } : null;
  }).filter(Boolean);
}

export function pitWeatherAlert(forecast = null) {
  if (!forecast) return null;
  const flags = forecast.flags || pitWeatherSignals(forecast);
  if (flags.includes("rain")) return { tone: "rain", icon: "🌧️", label: `Loop ${forecast.round}: Regen/Nässe erwartet` };
  if (flags.includes("hot")) return { tone: "hot", icon: "☀️", label: `Loop ${forecast.round}: Wärme erwartet` };
  if (flags.includes("cold")) return { tone: "cold", icon: "🥶", label: `Loop ${forecast.round}: kühl` };
  if (flags.includes("wind")) return { tone: "wind", icon: "💨", label: `Loop ${forecast.round}: Wind beachten` };
  return { tone: "good", icon: pitWeatherIcon(forecast.weatherCode, forecast.isDay), label: `Loop ${forecast.round}: Bedingungen ruhig` };
}

export function pitWeatherCrewActions(forecast = null, athleteFlags = []) {
  const actions = [];
  const weatherFlags = forecast?.flags || pitWeatherSignals(forecast || {});
  const athlete = new Set(Array.isArray(athleteFlags) ? athleteFlags : []);
  if (weatherFlags.includes("rain")) actions.push("🧥 Regenjacke bereitlegen", "🧦 trockene Socken", "🧻 Handtuch");
  if (weatherFlags.includes("hot") || athlete.has("too-warm")) actions.push("🧊 Kühlung", "💧 kaltes Getränk", "🧂 Elektrolyte im Blick");
  if (weatherFlags.includes("cold") || athlete.has("too-cold")) actions.push("🧥 trockene Wärmeschicht", "☕ warmes Getränk optional");
  if (weatherFlags.includes("wind")) actions.push("🌬️ Windschutz");
  if (athlete.has("thirsty")) actions.unshift("💧 Getränk zuerst");
  if (athlete.has("hungry")) actions.push("🍽️ Essen griffbereit");
  if (athlete.has("wants-salty")) actions.push("🥨 salzige Option");
  if (athlete.has("sweet-fatigue")) actions.push("🥨 nicht-süße Alternative");
  if (athlete.has("stomach")) actions.push("🤢 magenruhige, bewährte Option");
  if (athlete.has("heavy-legs")) actions.push("🦵 Beine kurz hoch / locker halten");
  if (athlete.has("tired")) actions.push("😴 Müdigkeit beobachten");
  return [...new Set(actions)].slice(0, 6);
}

export async function fetchPitCrewWeather(race = {}) {
  const coordinates = raceCoordinates(race) || await geocodeRaceLocation(race) || await browserPosition();
  const duration = resolveRaceWeatherDuration({ race });
  const horizonMinutes = Math.max(120, Number(duration.minutes || 0));
  const forecastDays = Math.min(16, Math.max(2, Math.ceil(horizonMinutes / 1440) + 2));
  const params = new URLSearchParams({
    latitude: String(coordinates.latitude),
    longitude: String(coordinates.longitude),
    current: [
      "temperature_2m",
      "apparent_temperature",
      "relative_humidity_2m",
      "precipitation",
      "weather_code",
      "wind_speed_10m",
      "wind_gusts_10m",
      "is_day",
    ].join(","),
    hourly: [
      "temperature_2m",
      "apparent_temperature",
      "relative_humidity_2m",
      "precipitation_probability",
      "precipitation",
      "weather_code",
      "wind_speed_10m",
      "wind_gusts_10m",
      "is_day",
    ].join(","),
    timezone: "auto",
    forecast_days: String(forecastDays),
  });
  const response = await fetch(`${FORECAST_URL}?${params}`);
  if (!response.ok) throw new Error("Wetter konnte gerade nicht geladen werden.");
  const data = await response.json();
  if (!data?.current) throw new Error("Wetterdaten sind unvollständig.");
  const weather = {
    temperature: Math.round(Number(data.current.temperature_2m || 0)),
    feelsLike: Math.round(Number(data.current.apparent_temperature || 0)),
    humidity: Math.round(Number(data.current.relative_humidity_2m || 0)),
    precipitation: Number(data.current.precipitation || 0),
    precipitationProbability: 0,
    weatherCode: Number(data.current.weather_code || 0),
    windSpeed: Math.round(Number(data.current.wind_speed_10m || 0)),
    windGusts: Math.round(Number(data.current.wind_gusts_10m || 0)),
    isDay: Boolean(data.current.is_day),
    updatedAt: data.current.time || new Date().toISOString(),
    locationSource: coordinates.source,
    hourly: hourlyRows(data.hourly || {}),
    horizonMinutes,
    horizonSource: duration.source,
    horizonLabel: duration.label,
  };
  return { ...weather, flags: pitWeatherSignals(weather) };
}
