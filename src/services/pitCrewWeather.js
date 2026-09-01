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
  const weatherCode = Number(observation.weatherCode || 0);
  const windSpeed = Number(observation.windSpeed || 0);
  const windGusts = Number(observation.windGusts || 0);
  const flags = [];
  if (Number.isFinite(temperature) && temperature >= 24) flags.push("hot");
  if (Number.isFinite(temperature) && temperature <= 9) flags.push("cold");
  if (precipitation >= 0.1 || (weatherCode >= 51 && weatherCode <= 82) || weatherCode >= 95) flags.push("rain");
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

export async function fetchPitCrewWeather(race = {}) {
  const coordinates = raceCoordinates(race) || await geocodeRaceLocation(race) || await browserPosition();
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
    timezone: "auto",
    forecast_days: "1",
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
    weatherCode: Number(data.current.weather_code || 0),
    windSpeed: Math.round(Number(data.current.wind_speed_10m || 0)),
    windGusts: Math.round(Number(data.current.wind_gusts_10m || 0)),
    isDay: Boolean(data.current.is_day),
    updatedAt: data.current.time || new Date().toISOString(),
    locationSource: coordinates.source,
  };
  return { ...weather, flags: pitWeatherSignals(weather) };
}
