import { useEffect, useMemo, useState } from "react";
import {
  buildRaceWeatherStrategy,
  buildTrackWindPlan,
  compareRaceWeatherSnapshots,
  compassLabel,
  fetchRaceWeatherForecast,
  raceForecastConfidence,
  raceWeatherSnapshot,
  resolveRaceWeatherDuration,
} from "../services/raceWeatherStrategy.js";
import "./RaceWeatherStrategy.css";

function storageKey(race = {}) {
  return `ei:race-weather:${race?.date || "open"}:${String(race?.name || "race").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function readSnapshot(key) {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(window.localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}

function writeSnapshot(key, value) {
  if (typeof window === "undefined" || !value) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Race weather must never block the coach when local storage is unavailable.
  }
}

function number(value) {
  return Math.round(Number(value || 0));
}

function decimalLabel(value, digits = 1) {
  return Number(value || 0).toLocaleString("de-DE", { maximumFractionDigits: digits });
}

function sectionImpact(section) {
  const rain = section.precipitationProbability >= 55 || section.precipitation >= 0.2;
  const hardWind = section.windSpeed >= 25 || section.windGusts >= 40 || section.maxHeadwindKmh >= 15;
  const relevantWind = section.windSpeed >= 18 || section.windGusts >= 30 || section.maxHeadwindKmh >= 8 || section.crosswindKmh >= 14;
  const temperatureStress = section.temperature >= 25 || section.temperature <= 5;
  if ((rain && hardWind) || temperatureStress) {
    return { tone: "hard", label: "🔴 hoch", text: "Wetter aktiv in Pace, Bekleidung und Versorgung einplanen." };
  }
  if (rain || relevantWind || section.temperature >= 22 || section.temperature <= 9) {
    return { tone: "warn", label: "🟠 relevant", text: "Bedingungen mitdenken, aber die Rennstrategie nicht unnötig übersteuern." };
  }
  return { tone: "good", label: "🟢 gering", text: "Gute Bedingungen. Kein wetterbedingter Pace-Umbau nötig." };
}

function routeWindSummary(section) {
  if (section.maxHeadwindKmh >= 8) return `Gegenwindpassagen relevant · Spitze ca. ${number(section.maxHeadwindKmh)} km/h. Effort halten, Pace nicht erzwingen.`;
  if (section.headwindKmh <= -8) return `Überwiegend Rückenwindwirkung · ca. ${number(Math.abs(section.headwindKmh))} km/h. Mitnehmen, ohne unbewusst zu überziehen.`;
  if (section.crosswindKmh >= 10) return `Überwiegend Seitenwind · bis ca. ${number(section.crosswindKmh)} km/h quer. Stabil laufen und Linie halten.`;
  return "Geringe Windwirkung auf der Strecke · kein taktischer Eingriff nötig.";
}

function windAdvice(trackSection) {
  if (trackSection.headwindKmh >= 8) return "Windschatten priorisieren";
  if (trackSection.headwindKmh <= -8) return "Rückenwind sauber mitnehmen";
  if (trackSection.crosswindKmh >= 10) return "Seitenwind stabil laufen";
  return "neutraler Abschnitt";
}

export default function RaceWeatherStrategy({
  race = {},
  routeProfile = null,
  raceDistanceKm = 0,
  targetDurationMinutes = 0,
  trackPlan = null,
}) {
  const raceName = String(race?.name || "Rennen");
  const raceDate = String(race?.date || "");
  const raceTime = String(race?.time || "");
  const raceLocation = String(race?.location || "");
  const placeLatitude = race?.place?.latitude ?? race?.latitude ?? null;
  const placeLongitude = race?.place?.longitude ?? race?.longitude ?? null;
  const eventTargetKm = Number(race?.targetKm || raceDistanceKm || 0);
  const eventTargetTime = String(race?.targetTime || "");
  const eventGoalType = String(race?.goalType || "");
  const eventLoopMode = String(race?.loopMode || "");
  const eventLoopKm = Number(race?.loopKm || 0);
  const eventLoopIntervalMinutes = Number(race?.loopIntervalMinutes || 0);
  const eventTimeLimit = String(race?.eventTimeLimit || "");
  const raceInput = useMemo(() => ({
    name: raceName,
    date: raceDate,
    time: raceTime,
    location: raceLocation,
    place: placeLatitude != null && placeLongitude != null ? { latitude: placeLatitude, longitude: placeLongitude } : null,
    targetKm: eventTargetKm,
    targetTime: eventTargetTime,
    goalType: eventGoalType,
    loopMode: eventLoopMode,
    loopKm: eventLoopKm,
    loopIntervalMinutes: eventLoopIntervalMinutes,
    eventTimeLimit,
  }), [
    eventGoalType,
    eventLoopIntervalMinutes,
    eventLoopKm,
    eventLoopMode,
    eventTargetKm,
    eventTargetTime,
    eventTimeLimit,
    placeLatitude,
    placeLongitude,
    raceDate,
    raceLocation,
    raceName,
    raceTime,
  ]);
  const confidence = useMemo(() => raceForecastConfidence(raceDate), [raceDate]);
  const durationInfo = useMemo(
    () => resolveRaceWeatherDuration({ race: raceInput, targetDurationMinutes }),
    [raceInput, targetDurationMinutes],
  );
  const [forecastResult, setForecastResult] = useState({ requestKey: "", status: "idle", data: null, error: "" });
  const key = useMemo(() => storageKey(raceInput), [raceInput]);
  const forecastEligible = Boolean(raceDate && raceTime && !["too-early", "missing"].includes(confidence.key));
  const requestKey = useMemo(() => JSON.stringify({
    race: raceInput,
    raceDistanceKm: Number(raceDistanceKm || 0),
    durationMinutes: durationInfo.minutes,
    routeProfile,
  }), [durationInfo.minutes, raceDistanceKm, raceInput, routeProfile]);
  const forecastState = !forecastEligible
    ? { status: confidence.key, data: null, error: "" }
    : forecastResult.requestKey === requestKey
      ? forecastResult
      : { status: "loading", data: null, error: "" };

  useEffect(() => {
    if (!forecastEligible) return undefined;
    let active = true;
    fetchRaceWeatherForecast({ race: raceInput, routeProfile, raceDistanceKm, targetDurationMinutes: durationInfo.minutes })
      .then((data) => {
        if (!active) return;
        setForecastResult({ requestKey, status: data.status, data, error: "" });
      })
      .catch((error) => {
        if (!active) return;
        setForecastResult({ requestKey, status: "error", data: null, error: error?.message || "Race-Wetter konnte nicht geladen werden." });
      });
    return () => { active = false; };
  }, [durationInfo.minutes, forecastEligible, raceDistanceKm, raceInput, requestKey, routeProfile]);

  const strategy = useMemo(() => {
    if (forecastState.status !== "ready" || !forecastState.data?.forecasts?.length) return null;
    return buildRaceWeatherStrategy({
      race: raceInput,
      routeProfile: routeProfile || {},
      raceDistanceKm,
      targetDurationMinutes: durationInfo.minutes,
      forecasts: forecastState.data.forecasts,
      confidence: forecastState.data.confidence,
    });
  }, [durationInfo.minutes, forecastState.data, forecastState.status, raceDistanceKm, raceInput, routeProfile]);

  const trackWind = useMemo(() => {
    if (!strategy || !trackPlan || !forecastState.data?.forecasts?.length) return [];
    const startEpoch = Date.parse(`${raceDate}T${String(raceTime || "00:00").slice(0, 5)}:00Z`);
    if (!Number.isFinite(startEpoch)) return [];
    return buildTrackWindPlan({
      forecasts: forecastState.data.forecasts,
      routeProfile: routeProfile || {},
      raceDistanceKm,
      startEpoch,
      targetDurationMinutes: durationInfo.minutes,
      lapDistanceM: trackPlan?.lapDistanceM || 400,
    });
  }, [durationInfo.minutes, forecastState.data, raceDate, raceDistanceKm, raceTime, routeProfile, strategy, trackPlan]);

  const snapshot = useMemo(() => raceWeatherSnapshot(strategy), [strategy]);
  const previousSnapshot = useMemo(() => snapshot ? readSnapshot(key) : null, [key, snapshot]);
  const changes = useMemo(() => compareRaceWeatherSnapshots(previousSnapshot, snapshot), [previousSnapshot, snapshot]);

  useEffect(() => {
    if (snapshot) writeSnapshot(key, snapshot);
  }, [key, snapshot]);

  if (!raceDate || !raceTime) return null;

  if (confidence.key === "too-early") {
    return (
      <section className="race-weather-strategy is-early">
        <div className="race-weather-heading">
          <div><span>RACE WEATHER INTELLIGENCE</span><h3>Wetterstrategie wird automatisch scharf</h3></div>
          <small>{confidence.label}{durationInfo.estimated ? " · geschätzt" : ""}</small>
        </div>
        <p className="race-weather-lead">{confidence.detail} Ort, Startzeit und Strecke sind bereits bekannt – sobald die belastbare Stundenprognose verfügbar ist, wird das Rennen zeitlich und räumlich durchgerechnet.</p>
      </section>
    );
  }

  if (forecastState.status === "loading" || forecastState.status === "idle") {
    return (
      <section className="race-weather-strategy is-loading">
        <div className="race-weather-heading"><div><span>RACE WEATHER INTELLIGENCE</span><h3>Rennwetter wird für dein Rennfenster berechnet …</h3></div><small>{confidence.label}{durationInfo.estimated ? " · geschätzt" : ""}</small></div>
      </section>
    );
  }

  if (forecastState.status === "error") {
    return (
      <section className="race-weather-strategy is-error">
        <div className="race-weather-heading"><div><span>RACE WEATHER INTELLIGENCE</span><h3>Rennwetter derzeit nicht verfügbar</h3></div><small>{confidence.label}{durationInfo.estimated ? " · geschätzt" : ""}</small></div>
        <p className="race-weather-lead">{forecastState.error}</p>
      </section>
    );
  }

  if (!strategy) return null;

  const temperatureLabel = strategy.minTemperature === strategy.maxTemperature
    ? `${strategy.minTemperature} °C`
    : `${strategy.minTemperature}–${strategy.maxTemperature} °C`;

  return (
    <section className="race-weather-strategy">
      <div className="race-weather-heading">
        <div>
          <span>RACE WEATHER INTELLIGENCE</span>
          <h3>{strategy.headline}</h3>
        </div>
        <small>{confidence.label}{durationInfo.estimated ? " · geschätzt" : ""}</small>
      </div>

      <div className="race-weather-summary">
        <article><span>Temperatur</span><strong>{temperatureLabel}</strong><small>entlang des Rennverlaufs</small></article>
        <article><span>Regenrisiko</span><strong>{number(strategy.maxRainProbability)} %</strong><small>höchstes Zeitfenster</small></article>
        <article><span>Wind</span><strong>{number(strategy.maxWindSpeed)} km/h</strong><small>Böen bis {number(strategy.maxWindGusts)} km/h</small></article>
        <article><span>Forecast</span><strong>{confidence.label}</strong><small>{confidence.detail}</small></article>
      </div>

      {durationInfo.estimated && (
        <p className="race-weather-duration-note"><strong>{durationInfo.label}:</strong> Ohne hinterlegte Zielzeit bzw. Zeitlimit leitet EI das erwartete Wetterfenster aus der Eventdistanz ab. Mit einer konkreten Race Strategy wird die zeitliche Zuordnung präziser.</p>
      )}

      {changes.length > 0 && (
        <div className="race-weather-change">
          <b>Seit dem letzten Abruf geändert</b>
          <span>{changes.join(" · ")}</span>
        </div>
      )}

      <div className={`race-weather-sections${strategy.sections.length === 1 ? " is-single" : ""}`}>
        {strategy.sections.map((section, index) => {
          const impact = sectionImpact(section);
          const hasRouteGeometry = Array.isArray(routeProfile?.profilePoints) && routeProfile.profilePoints.length > 1;
          return (
            <article key={`${section.title}:${index}`} className={`race-weather-section-card tone-${impact.tone}`}>
              <div className="race-weather-section-head">
                <b>{section.icon}</b>
                <div><strong>{section.title}</strong><span>{section.timeLabel}</span></div>
                <em className={`race-weather-impact tone-${impact.tone}`}>{impact.label}</em>
              </div>
              <div className="race-weather-section-metrics">
                <span><small>Temperatur</small><b>{section.temperature} °C</b></span>
                <span><small>Gefühlt</small><b>{section.feelsLike} °C</b></span>
                <span><small>Regen</small><b>{section.precipitationProbability} % · {decimalLabel(section.precipitation)} mm</b></span>
                <span><small>Wind</small><b>{section.windSpeed} km/h {compassLabel(section.windDirection)}</b></span>
                <span><small>Böen</small><b>{section.windGusts} km/h</b></span>
                <span><small>Luftfeuchte</small><b>{section.humidity} %</b></span>
              </div>
              {hasRouteGeometry && (
                <div className="race-weather-route-wind">
                  <small>WIND AUF DER STRECKE</small>
                  <strong>{routeWindSummary(section)}</strong>
                </div>
              )}
              <div className={`race-weather-coach tone-${impact.tone}`}>
                <small>RACE COACH</small>
                <strong>{impact.text}</strong>
              </div>
              {section.advice.length > 0 && <ul>{section.advice.map((item) => <li key={item}>{item}</li>)}</ul>}
            </article>
          );
        })}
      </div>

      {strategy.windHotspot?.headwindKmh >= 8 && !trackPlan && (
        <div className="race-weather-hotspot">
          <b>💨 Härteste Gegenwindpassage</b>
          <span>um km {strategy.windHotspot.km.toFixed(strategy.windHotspot.km < 20 ? 1 : 0)} · ca. {number(strategy.windHotspot.headwindKmh)} km/h Gegenwind-Komponente. Dort Gruppe/Windschatten priorisieren und Pace nicht erzwingen.</span>
        </div>
      )}

      {trackWind.length > 0 && (
        <div className="race-weather-track">
          <div className="race-weather-track-head">
            <div><span>TRACK WIND PLAN</span><strong>Welche Bahnpassage bekommt den Wind?</strong></div>
            <small>Wind aus {compassLabel(trackWind[0]?.windDirection)} · {trackWind[0]?.windSpeed} km/h</small>
          </div>
          <div className="race-weather-track-grid">
            {trackWind.map((section) => (
              <article key={section.key} className={`tone-${section.tone}`}>
                <span>{section.label}</span>
                <strong>{section.label.includes("Gerade") && section.headwindKmh >= 8 ? "💥 " : section.label.includes("Gerade") && section.headwindKmh <= -8 ? "🚀 " : ""}{section.label}</strong>
                <b>{windAdvice(section)}</b>
                <p>{section.headwindKmh >= 0 ? `${number(section.headwindKmh)} km/h Gegenwind-Komponente` : `${number(Math.abs(section.headwindKmh))} km/h Rückenwind-Komponente`} · quer {number(section.crosswindKmh)} km/h</p>
              </article>
            ))}
          </div>
          <p className="race-weather-track-note">Auf der Bahn zählt nicht nur die Windstärke, sondern die Laufrichtung. EI berechnet Gegen-, Rücken- und Seitenwind aus GPX-Geometrie + Windrichtung und übersetzt das direkt in Renn-Taktik.</p>
        </div>
      )}
    </section>
  );
}
