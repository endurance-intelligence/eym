import { reverseGeocode } from "./placeSearch";

const WEATHER_URL = "https://api.open-meteo.com/v1/forecast";
const POSITION_KEY = "endurance-intelligence.weather-position";

const WEATHER_LABELS = {
  0: "Klar", 1: "Überwiegend klar", 2: "Teilweise bewölkt", 3: "Bewölkt",
  45: "Nebel", 48: "Reifnebel", 51: "Leichter Nieselregen", 53: "Nieselregen",
  55: "Starker Nieselregen", 56: "Leichter gefrierender Nieselregen", 57: "Gefrierender Nieselregen",
  61: "Leichter Regen", 63: "Regen", 65: "Starker Regen", 66: "Leichter gefrierender Regen",
  67: "Gefrierender Regen", 71: "Leichter Schneefall", 73: "Schneefall", 75: "Starker Schneefall",
  77: "Schneegriesel", 80: "Leichte Regenschauer", 81: "Regenschauer", 82: "Starke Regenschauer",
  85: "Leichte Schneeschauer", 86: "Starke Schneeschauer", 95: "Gewitter", 96: "Gewitter mit Hagel",
  99: "Starkes Gewitter mit Hagel",
};

export function weatherLabel(code) {
  return WEATHER_LABELS[code] || "Unbekannte Wetterlage";
}

export function loadSavedPosition() {
  try {
    const position = JSON.parse(localStorage.getItem(POSITION_KEY) || "null");
    if (Number.isFinite(Number(position?.latitude)) && Number.isFinite(Number(position?.longitude))) return position;
  } catch {
    // A broken cached position should not block a new permission request.
  }
  return null;
}

export function clearSavedPosition() {
  localStorage.removeItem(POSITION_KEY);
}

function savePosition(position) {
  localStorage.setItem(POSITION_KEY, JSON.stringify({ ...position, savedAt: new Date().toISOString() }));
}

export async function geolocationPermissionState() {
  if (!navigator.permissions?.query) return "unknown";
  try {
    const result = await navigator.permissions.query({ name: "geolocation" });
    return result.state;
  } catch {
    return "unknown";
  }
}

export function getCurrentPosition() {
  if (!navigator.geolocation) {
    return Promise.reject(new Error("Standortermittlung wird von diesem Browser nicht unterstützt."));
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const position = { latitude: coords.latitude, longitude: coords.longitude };
        savePosition(position);
        resolve(position);
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          reject(new Error("Standort ist blockiert. Auf dem iPad: Einstellungen → Datenschutz & Sicherheit → Ortungsdienste → Safari-Websites und den Zugriff erlauben."));
          return;
        }
        if (error.code === error.TIMEOUT) {
          reject(new Error("Die Standortabfrage hat zu lange gedauert. Bitte erneut versuchen."));
          return;
        }
        reject(new Error("Standort konnte nicht ermittelt werden."));
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 15 * 60 * 1000 },
    );
  });
}

export async function fetchCurrentWeather(latitude, longitude) {
  const params = new URLSearchParams({
    latitude: String(latitude), longitude: String(longitude),
    current: ["temperature_2m", "apparent_temperature", "relative_humidity_2m", "precipitation", "weather_code", "wind_speed_10m", "wind_gusts_10m", "is_day"].join(","),
    timezone: "auto", forecast_days: "1",
  });

  const response = await fetch(`${WEATHER_URL}?${params}`);
  if (!response.ok) throw new Error("Wetterdaten konnten nicht geladen werden.");
  const data = await response.json();
  if (!data.current) throw new Error("Keine aktuellen Wetterdaten verfügbar.");

  const location = await reverseGeocode(latitude, longitude).catch(() => "");

  return {
    location,
    temperature: Math.round(data.current.temperature_2m),
    feelsLike: Math.round(data.current.apparent_temperature),
    humidity: Math.round(data.current.relative_humidity_2m),
    precipitation: Number(data.current.precipitation || 0),
    windSpeed: Math.round(data.current.wind_speed_10m),
    windGusts: Math.round(data.current.wind_gusts_10m),
    weatherCode: data.current.weather_code,
    condition: weatherLabel(data.current.weather_code),
    isDay: Boolean(data.current.is_day),
    updatedAt: data.current.time,
  };
}
