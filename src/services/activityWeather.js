import { weatherLabel } from "./weather.js";
import { reverseGeocode } from "./placeSearch.js";

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";

function activityDate(activity) {
  return String(activity?.startDateLocal || activity?.date || "").slice(0, 10);
}

function activityHour(activity) {
  const raw = activity?.startDateLocal;
  if (!raw || !String(raw).includes("T")) return 12;
  const match = String(raw).match(/T(\d{2}):/);
  return match ? Number(match[1]) : 12;
}

export function activityCoordinatesFor(activity) {
  const coordinates = activity?.coordinates;
  if (coordinates && Number.isFinite(Number(coordinates.lat)) && Number.isFinite(Number(coordinates.lon))) {
    return { latitude: Number(coordinates.lat), longitude: Number(coordinates.lon) };
  }
  const pair = activity?.startLatLng || activity?.start_latlng;
  if (Array.isArray(pair) && pair.length >= 2) {
    const [latitude, longitude] = pair.map(Number);
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) return { latitude, longitude };
  }
  return null;
}

function activityLocation(activity) {
  const raw = activity?.location || activity?.locationName || activity?.city || activity?.place || activity?.weather?.location;
  return typeof raw === "string" ? raw.trim() : "";
}

async function requestWeather(url, params) {
  const response = await fetch(`${url}?${params.toString()}`);
  if (!response.ok) throw new Error("Historische Wetterdaten konnten nicht geladen werden.");
  return response.json();
}

function nearestIndex(times, date, hour) {
  if (!Array.isArray(times) || times.length === 0) return -1;
  const target = new Date(`${date}T${String(hour).padStart(2, "0")}:00:00`).getTime();
  let best = 0;
  let bestDifference = Number.POSITIVE_INFINITY;
  times.forEach((value, index) => {
    const difference = Math.abs(new Date(value).getTime() - target);
    if (difference < bestDifference) {
      best = index;
      bestDifference = difference;
    }
  });
  return best;
}

function parseWeather(data, date, hour) {
  const hourly = data?.hourly;
  const index = nearestIndex(hourly?.time, date, hour);
  if (index < 0) throw new Error("Für den Zeitpunkt wurden keine Wetterwerte gefunden.");
  const code = Number(hourly.weather_code?.[index]);
  return {
    temperature: Number(hourly.temperature_2m?.[index]),
    feelsLike: Number(hourly.apparent_temperature?.[index]),
    humidity: Number(hourly.relative_humidity_2m?.[index]),
    precipitation: Number(hourly.precipitation?.[index] || 0),
    windSpeed: Number(hourly.wind_speed_10m?.[index] || 0),
    windGusts: Number(hourly.wind_gusts_10m?.[index] || 0),
    weatherCode: Number.isFinite(code) ? code : null,
    condition: Number.isFinite(code) ? weatherLabel(code) : "Wetterlage unbekannt",
    observedAt: hourly.time?.[index] || `${date}T${String(hour).padStart(2, "0")}:00`,
    source: "Open-Meteo",
  };
}

export function activityWeatherAvailable(activity) {
  return Boolean(activity?.weather?.temperature != null || activity?.temperature != null);
}

export async function fetchActivityWeather(activity) {
  const date = activityDate(activity);
  const coordinates = activityCoordinatesFor(activity);
  if (!date) throw new Error("Das Aktivitätsdatum fehlt.");
  if (!coordinates) throw new Error("Für diese Aktivität sind keine Startkoordinaten vorhanden.");

  const params = new URLSearchParams({
    latitude: String(coordinates.latitude),
    longitude: String(coordinates.longitude),
    start_date: date,
    end_date: date,
    hourly: [
      "temperature_2m",
      "apparent_temperature",
      "relative_humidity_2m",
      "precipitation",
      "weather_code",
      "wind_speed_10m",
      "wind_gusts_10m",
    ].join(","),
    timezone: "auto",
  });

  const ageDays = Math.floor((Date.now() - new Date(`${date}T12:00:00`).getTime()) / 86_400_000);
  let data;
  if (ageDays >= 5) {
    data = await requestWeather(ARCHIVE_URL, params);
  } else {
    try {
      data = await requestWeather(FORECAST_URL, params);
    } catch {
      data = await requestWeather(ARCHIVE_URL, params);
    }
  }
  const parsed = parseWeather(data, date, activityHour(activity));
  let location = activityLocation(activity);
  if (!location) {
    try {
      location = await reverseGeocode(coordinates.latitude, coordinates.longitude);
    } catch {
      location = "";
    }
  }
  return {
    ...parsed,
    location,
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
  };
}
