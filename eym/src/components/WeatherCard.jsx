import { useEffect, useState } from "react";
import { Card } from "./UI";
import { clearSavedPosition, fetchCurrentWeather, geolocationPermissionState, getCurrentPosition, loadSavedPosition } from "../services/weather";

function WeatherIcon({ code, isDay }) {
  if ([95, 96, 99].includes(code)) return "⛈️";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "❄️";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "🌧️";
  if ([45, 48].includes(code)) return "🌫️";
  if (code === 0) return isDay ? "☀️" : "🌙";
  return isDay ? "⛅" : "☁️";
}

export default function WeatherCard() {
  const [weather, setWeather] = useState(null);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("Standort freigeben, damit das aktuelle Wetter angezeigt werden kann.");

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
        setMessage("Standort ist im Browser blockiert. Auf dem iPad kannst du ihn in den Safari-/Ortungsdienste-Einstellungen wieder erlauben.");
      } else {
        setStatus("idle");
        setMessage("Tippe auf „Standort freigeben“. Erst dieser Klick löst auf iPad und iPhone die Standortabfrage zuverlässig aus.");
      }
    }
    initialize();
    return () => { active = false; };
  }, []);

  return (
    <Card className="weather-card">
      <div className="weather-heading">
        <div><p className="eyebrow">Wetter am Standort</p>{status === "ready" ? <><h2>{weather.condition}</h2>{weather.location && <p className="weather-location">📍 {weather.location}</p>}</> : <h2>Aktuelles Wetter</h2>}</div>
        {status === "ready" && <span className="weather-icon" aria-hidden="true"><WeatherIcon code={weather.weatherCode} isDay={weather.isDay} /></span>}
      </div>
      {status === "loading" && <p className="muted">{message}</p>}
      {(status === "idle" || status === "error") && <div className="weather-permission"><p className="muted">{message}</p><button type="button" onClick={() => loadWeather({ requestPermission: true })}>Standort freigeben</button></div>}
      {status === "ready" && <>
        <div className="weather-temperature">{weather.temperature}°</div>
        <p className="muted weather-feels">Gefühlt {weather.feelsLike}°</p>
        <div className="weather-details"><span><b>{weather.windSpeed} km/h</b> Wind</span><span><b>{weather.windGusts} km/h</b> Böen</span><span><b>{weather.precipitation.toFixed(1)} mm</b> Niederschlag</span><span><b>{weather.humidity} %</b> Feuchte</span></div>
        <button className="weather-location-reset" type="button" onClick={() => { clearSavedPosition(); loadWeather({ requestPermission: true }); }}>Standort aktualisieren</button>
      </>}
    </Card>
  );
}
