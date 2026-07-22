import { useEffect, useMemo, useState } from "react";
import { clearSavedPosition, fetchCurrentWeather, geolocationPermissionState, getCurrentPosition, loadSavedPosition, weatherLabel } from "../services/weather";

function WeatherIcon({ code, isDay = true }) {
  if ([95, 96, 99].includes(code)) return "⛈️";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "❄️";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "🌧️";
  if ([45, 48].includes(code)) return "🌫️";
  if (code === 0) return isDay ? "☀️" : "🌙";
  return isDay ? "⛅" : "☁️";
}

function dateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function outdoorEntry(item) {
  if (!item || item.archived || item.completed || item.missedReason || item.optional) return false;
  const text = `${item.title || ""} ${item.type || ""} ${item.sport || ""}`.toLowerCase();
  if (/ruhetag|rest|mobility|stabi|kraft|strength|indoor|ruder/.test(text)) return false;
  return /lauf|run|track|fußball|football|rad|bike|cycling|walk|wander|trail/.test(text);
}

function pointScore(point) {
  let score = 0;
  if (point.temperature < 5) score += (5 - point.temperature) * 2;
  if (point.temperature > 20) score += (point.temperature - 20) * 3;
  score += point.rainChance * 0.45;
  score += point.precipitation * 24;
  score += Math.max(0, point.windSpeed - 18) * 1.8;
  score += Math.max(0, point.windGusts - 30) * 1.2;
  score += Math.max(0, point.humidity - 82) * 0.4;
  if ([95, 96, 99].includes(point.weatherCode)) score += 150;
  if ([65, 67, 82, 86].includes(point.weatherCode)) score += 70;
  return score;
}

function weatherAdvice(point) {
  if (!point) return "Für die geplante Uhrzeit fehlen noch stündliche Wetterdaten.";
  if ([95, 96, 99].includes(point.weatherCode)) return "Gewitterrisiko – Laufzeit oder Indoor-Alternative prüfen.";
  if (point.rainChance >= 65 || point.precipitation >= 1.5) return "Deutliches Regenrisiko – Regenoption oder Zeitfenster prüfen.";
  if (point.rainChance >= 35 || point.precipitation >= 0.2) return "Regen möglich – leichte Regenausrüstung einplanen.";
  if (point.temperature >= 25 || (point.temperature >= 21 && point.humidity >= 75)) return "Warm beziehungsweise schwül – Intensität freigeben und Trinken einplanen.";
  if (point.windSpeed >= 26 || point.windGusts >= 42) return "Windig – Pace nicht überbewerten und exponierte Strecken meiden.";
  if (point.temperature <= 3) return "Kühl – ruhig anlaufen und passende Schicht einplanen.";
  return "Gute Bedingungen für die geplante Einheit.";
}

function closestPoint(hourly, target) {
  const targetTime = target.getTime();
  return hourly.reduce((best, point) => {
    const difference = Math.abs(new Date(point.time).getTime() - targetTime);
    return !best || difference < best.difference ? { point, difference } : best;
  }, null)?.point || null;
}

function bestWindow(hourly, now = new Date()) {
  const today = dateKey(now);
  const currentHour = now.getHours();
  let candidates = hourly.filter((point) => {
    const pointDate = new Date(point.time);
    return point.time.slice(0, 10) === today && pointDate.getHours() >= Math.max(6, currentHour) && pointDate.getHours() <= 20;
  });
  if (candidates.length < 2) {
    candidates = hourly.filter((point) => point.time.slice(0, 10) === today && new Date(point.time).getHours() >= 6 && new Date(point.time).getHours() <= 20);
  }
  let best = null;
  for (let index = 0; index < candidates.length - 1; index += 1) {
    const first = candidates[index];
    const second = candidates[index + 1];
    const start = new Date(first.time);
    const end = new Date(second.time);
    if (end.getTime() - start.getTime() > 75 * 60 * 1000) continue;
    const score = (pointScore(first) + pointScore(second)) / 2;
    if (!best || score < best.score) best = { first, second, score };
  }
  return best;
}

function briefingInsight(weather, plannedEntries) {
  const outdoor = plannedEntries.filter(outdoorEntry);
  const timed = outdoor.find((entry) => /^\d{2}:\d{2}$/.test(entry.time || ""));
  if (timed) {
    const [hour, minute] = timed.time.split(":").map(Number);
    const target = new Date();
    target.setHours(hour, minute, 0, 0);
    const point = closestPoint(weather.hourly || [], target);
    return {
      eyebrow: `Laufwetter · ${timed.title}`,
      headline: point ? `${timed.time} Uhr · ${point.temperature}° · ${weatherLabel(point.weatherCode)}` : `${timed.time} Uhr · Prognose lädt`,
      advice: weatherAdvice(point),
      point,
    };
  }

  if (outdoor.length) {
    const window = bestWindow(weather.hourly || []);
    if (window) {
      const startHour = String(new Date(window.first.time).getHours()).padStart(2, "0");
      const endHour = String(new Date(window.second.time).getHours() + 1).padStart(2, "0");
      return {
        eyebrow: `Bestes Zeitfenster · ${outdoor[0].title}`,
        headline: `${startHour}:00–${endHour}:00 Uhr · ${window.first.temperature}–${window.second.temperature}°`,
        advice: weatherAdvice(window.first),
        point: window.first,
      };
    }
  }

  return {
    eyebrow: weather.location ? `Wetter · ${weather.location}` : "Wetter am Standort",
    headline: `${weather.temperature}° · ${weather.condition}`,
    advice: weather.precipitation > 0 ? "Aktuell fällt Niederschlag." : "Aktuell keine auffälligen Bedingungen.",
    point: null,
  };
}

export default function WeatherCard({ plannedEntries = [] }) {
  const [weather, setWeather] = useState(null);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("Standort freigeben, um Laufwetter und Zeitfenster zu prüfen.");

  async function loadWeather({ requestPermission = true } = {}) {
    setStatus("loading");
    setMessage(requestPermission ? "Standort wird angefragt …" : "Wetter wird geladen …");
    try {
      const saved = loadSavedPosition();
      const position = saved && !requestPermission ? saved : await getCurrentPosition();
      const current = await fetchCurrentWeather(position.latitude, position.longitude);
      setWeather(current);
      setStatus("ready");
      setMessage("");
    } catch (error) {
      setWeather(null);
      setStatus("error");
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  useEffect(() => {
    let active = true;
    async function initialize() {
      const saved = loadSavedPosition();
      if (saved) {
        try {
          const current = await fetchCurrentWeather(saved.latitude, saved.longitude);
          if (!active) return;
          setWeather(current);
          setStatus("ready");
          return;
        } catch {
          clearSavedPosition();
        }
      }
      const permission = await geolocationPermissionState();
      if (!active) return;
      if (permission === "granted") loadWeather({ requestPermission: true });
      else if (permission === "denied") {
        setStatus("error");
        setMessage("Standort ist im Browser blockiert. Erlaube ihn in den Safari-/Ortungsdienste-Einstellungen.");
      } else {
        setStatus("idle");
        setMessage("Standort freigeben, um Laufwetter und bestes Zeitfenster zu prüfen.");
      }
    }
    initialize();
    return () => { active = false; };
  }, []);

  const insight = useMemo(() => weather ? briefingInsight(weather, plannedEntries) : null, [weather, plannedEntries]);
  const iconCode = insight?.point?.weatherCode ?? weather?.weatherCode;

  return (
    <div className={`weather-briefing ${status}`}>
      {status === "ready" && insight ? <>
        <span className="weather-briefing-icon" aria-hidden="true"><WeatherIcon code={iconCode} isDay={weather.isDay} /></span>
        <div className="weather-briefing-copy">
          <p>{insight.eyebrow}</p>
          <strong>{insight.headline}</strong>
          <span>{insight.advice}</span>
        </div>
        <details className="weather-briefing-details">
          <summary>Details</summary>
          <div>
            <span><b>{weather.feelsLike}°</b> gefühlt</span>
            <span><b>{weather.windSpeed} km/h</b> Wind</span>
            <span><b>{weather.windGusts} km/h</b> Böen</span>
            <span><b>{weather.humidity} %</b> Feuchte</span>
            <button type="button" onClick={() => { clearSavedPosition(); loadWeather({ requestPermission: true }); }}>Standort aktualisieren</button>
          </div>
        </details>
      </> : <>
        <div className="weather-briefing-copy"><p>Laufwetter</p><strong>{status === "loading" ? "Wird geladen …" : "Standort fehlt"}</strong><span>{message}</span></div>
        {status !== "loading" && <button type="button" onClick={() => loadWeather({ requestPermission: true })}>Freigeben</button>}
      </>}
    </div>
  );
}
