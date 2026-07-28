import { useCallback, useEffect, useMemo, useState } from "react";
import { briefingWeatherInsight, currentWeatherInsight } from "../services/briefingWeather";
import { clearSavedPosition, fetchCurrentWeather, geolocationPermissionState, getCurrentPosition, loadSavedPosition } from "../services/weather";
import { useApp } from "../context/AppContext";

function WeatherIcon({ code, isDay = true }) {
  if ([95, 96, 99].includes(code)) return "⛈️";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "❄️";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "🌧️";
  if ([45, 48].includes(code)) return "🌫️";
  if (code === 0) return isDay ? "☀️" : "🌙";
  return isDay ? "⛅" : "☁️";
}

export default function WeatherCard({ plannedEntries = [], onInsight }) {
  const { session } = useApp();
  const userId = session?.user?.id || "";
  const [weather, setWeather] = useState(null);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("Standort freigeben, um Outdoor-Wetter und Zeitfenster zu prüfen.");

  const loadWeather = useCallback(async ({ requestPermission = true } = {}) => {
    setStatus("loading");
    setMessage(requestPermission ? "Standort wird angefragt …" : "Wetter wird geladen …");
    try {
      const saved = loadSavedPosition(userId);
      const position = saved && !requestPermission ? saved : await getCurrentPosition(userId);
      const current = await fetchCurrentWeather(position.latitude, position.longitude);
      setWeather(current);
      setStatus("ready");
      setMessage("");
    } catch (error) {
      setWeather(null);
      setStatus("error");
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }, [userId]);

  useEffect(() => {
    let active = true;
    async function initialize() {
      const saved = loadSavedPosition(userId);
      if (saved) {
        try {
          const current = await fetchCurrentWeather(saved.latitude, saved.longitude);
          if (!active) return;
          setWeather(current);
          setStatus("ready");
          return;
        } catch {
          clearSavedPosition(userId);
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
        setMessage("Standort freigeben, um Outdoor-Wetter und bestes Zeitfenster zu prüfen.");
      }
    }
    initialize();
    return () => { active = false; };
  }, [loadWeather, userId]);

  const insight = useMemo(() => briefingWeatherInsight(weather, plannedEntries), [weather, plannedEntries]);
  const cardInsight = insight?.mode === "flexible" ? currentWeatherInsight(weather) : insight;
  const iconCode = cardInsight?.point?.weatherCode ?? weather?.weatherCode;

  useEffect(() => {
    onInsight?.(insight);
  }, [insight, onInsight]);

  return (
    <div className={`weather-briefing ${status}`}>
      {status === "ready" && cardInsight ? <>
        <span className="weather-briefing-icon" aria-hidden="true"><WeatherIcon code={iconCode} isDay={weather.isDay} /></span>
        <div className="weather-briefing-copy">
          <p>{cardInsight.eyebrow}</p>
          <strong>{cardInsight.headline}</strong>
          <span>{cardInsight.advice}</span>
        </div>
        <details className="weather-briefing-details">
          <summary>Details</summary>
          <div>
            <span><b>{weather.feelsLike}°</b> gefühlt</span>
            <span><b>{weather.windSpeed} km/h</b> Wind</span>
            <span><b>{weather.windGusts} km/h</b> Böen</span>
            <span><b>{weather.humidity} %</b> Feuchte</span>
            <button type="button" onClick={() => { clearSavedPosition(userId); loadWeather({ requestPermission: true }); }}>Standort aktualisieren</button>
          </div>
        </details>
      </> : <>
        <div className="weather-briefing-copy"><p>Outdoor-Wetter</p><strong>{status === "loading" ? "Wird geladen …" : "Standort fehlt"}</strong><span>{message}</span></div>
        {status !== "loading" && <button type="button" onClick={() => loadWeather({ requestPermission: true })}>Freigeben</button>}
      </>}
    </div>
  );
}
