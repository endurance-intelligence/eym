import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { missionEvents } from "../services/goalPlanning";
import {
  buildRaceCoachPlan,
  formatRaceDurationInput,
  parseRaceDurationInput,
} from "../services/raceCoach";
import { buildRacePrepPlan, racePrepProfileFromEvent } from "../services/racePrepPlanner";
import { parseGpxRoute, routeDistanceWarning } from "../services/raceRoute";
import { publishIntervalsRaceWorkout } from "../services/intervals";
import {
  buildGarminRaceWorkout,
  encodeGarminRaceWorkoutFit,
  garminRaceWorkoutFilename,
} from "../services/garminRaceWorkout";
import {
  buildIntervalsRaceWorkoutPublication,
  raceWorkoutPublicationFingerprint,
} from "../services/raceWorkoutSync";
import RaceStrategyMap from "./RaceStrategyMap";
import "./FuelPartner.css";

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function sourceOptions(state) {
  const todayKey = localDateKey();
  const missionRaceEvents = missionEvents(state.mission).filter((event) => !event.date || event.date >= todayKey);
  const missionEventById = new Map(missionRaceEvents.map((event) => [String(event.id || ""), event]));
  const saved = (Array.isArray(state.racePrepPlans) ? state.racePrepPlans : []).map((profile) => {
    const origin = missionEventById.get(String(profile.originEventId || ""));
    return {
      key: `saved:${profile.id}`,
      label: profile.name || "Gespeicherter Race-Prep-Plan",
      detail: origin?.date || "Race Prep",
      date: origin?.date || profile.date || "",
      profile,
    };
  });
  const events = missionRaceEvents.map((event) => ({
    key: `event:${event.id}`,
    label: event.name || "Wettkampf",
    detail: event.date || "Termin offen",
    date: event.date || "",
    profile: racePrepProfileFromEvent(event),
  }));
  return [...saved, ...events.filter((event) => !saved.some((item) => item.profile.originEventId && item.profile.originEventId === event.profile.originEventId))];
}

function numberLabel(value, digits = 0) {
  return Number(value || 0).toLocaleString("de-DE", { maximumFractionDigits: digits });
}

function paceLabel(secondsPerKm) {
  if (!(Number(secondsPerKm) > 0)) return "–";
  const total = Math.round(Number(secondsPerKm));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}/km`;
}

function clockLabel(minutes) {
  const totalSeconds = Math.max(0, Math.round(Number(minutes || 0) * 60));
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}:${String(mins).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `${mins}:${String(seconds).padStart(2, "0")}`;
}

function segmentMarker(segment, index, total) {
  const fullKilometre = Math.abs(Number(segment.distanceKm || 0) - 1) < 0.02;
  if (fullKilometre) return `KM ${index + 1}`;
  if (index === total - 1) return `KM ${index + 1} · ${numberLabel(segment.distanceKm, 2)} km`;
  return `${numberLabel(segment.startKm, 1)}–${numberLabel(segment.endKm, 1)} km`;
}

function elevationPolyline(route) {
  const points = (Array.isArray(route?.profilePoints) ? route.profilePoints : []).filter((point) => Number.isFinite(point.elevationM));
  if (points.length < 2) return "";
  const distance = Math.max(0.1, Number(route.distanceKm || points.at(-1).distanceKm || 0.1));
  const min = Math.min(...points.map((point) => point.elevationM));
  const max = Math.max(...points.map((point) => point.elevationM));
  const span = Math.max(10, max - min);
  return points.map((point) => {
    const x = (Number(point.distanceKm || 0) / distance) * 1000;
    const y = 118 - ((Number(point.elevationM) - min) / span) * 100;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}
function routeDistanceTicks(route) {
  const distance = Math.max(0, Number(route?.distanceKm || 0));
  if (!(distance > 0)) return [];
  const step = distance <= 15 ? 1 : distance <= 30 ? 2 : distance <= 60 ? 5 : distance <= 120 ? 10 : distance <= 300 ? 25 : 50;
  const ticks = [0];
  for (let km = step; km < distance - 0.05; km += step) ticks.push(km);
  if (Math.abs((ticks.at(-1) || 0) - distance) > 0.05) ticks.push(distance);
  return ticks.map((km) => ({
    km,
    left: Math.min(100, Math.max(0, (km / distance) * 100)),
    label: Number.isInteger(km) ? String(km) : km.toLocaleString("de-DE", { maximumFractionDigits: 1 }),
  }));
}

function compactRouteSegments(segments, showAll) {
  if (showAll || segments.length <= 24) return segments;
  return [
    ...segments.slice(0, 14),
    { gap: true, hidden: segments.length - 20 },
    ...segments.slice(-6),
  ];
}

function compactGarminSteps(steps) {
  if (steps.length <= 12) return steps;
  return [
    ...steps.slice(0, 7),
    { gap: true, hidden: steps.length - 10 },
    ...steps.slice(-3),
  ];
}

export default function RaceCoach() {
  const { state, setState } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const [targetDrafts, setTargetDrafts] = useState({});
  const [routeUrls, setRouteUrls] = useState({});
  const [setupError, setSetupError] = useState("");
  const [showAllRoute, setShowAllRoute] = useState(false);
  const [routeView, setRouteView] = useState("map");
  const [selectedSegmentIndex, setSelectedSegmentIndex] = useState(null);
  const [hoveredSegmentIndex, setHoveredSegmentIndex] = useState(null);
  const [garminExportMessage, setGarminExportMessage] = useState("");
  const [garminPublishBusy, setGarminPublishBusy] = useState(false);
  const sources = useMemo(() => sourceOptions(state), [state]);
  const requestedSource = searchParams.get("race");
  const source = sources.find((item) => item.key === requestedSource) || sources[0] || null;
  const sourceKey = source?.key || "";
  const storedEntry = sourceKey ? state.raceCoachSessions?.[sourceKey] : null;
  const setup = storedEntry?.setup || {};
  const targetDraft = targetDrafts[sourceKey] ?? formatRaceDurationInput(Number(setup.targetDurationMinutes || source?.profile?.durationMinutes || 0));
  const routeUrl = routeUrls[sourceKey] ?? setup.routeUrl ?? source?.profile?.routeGpxUrl ?? "";
  const effectiveProfile = useMemo(() => {
    if (!source) return null;
    const customDuration = Number(setup.targetDurationMinutes || 0);
    return {
      ...source.profile,
      durationMinutes: customDuration > 0 ? customDuration : source.profile.durationMinutes,
      durationEstimated: customDuration > 0 ? false : source.profile.durationEstimated,
    };
  }, [setup.targetDurationMinutes, source]);
  const fuelPlan = useMemo(
    () => effectiveProfile ? buildRacePrepPlan({ profile: effectiveProfile, state }) : null,
    [effectiveProfile, state],
  );
  const plan = useMemo(
    () => effectiveProfile ? buildRaceCoachPlan(effectiveProfile, {
      routeProfile: setup.routeProfile,
      fuelStrategy: fuelPlan?.strategy,
      paceOverrides: setup.paceOverrides,
    }) : null,
    [effectiveProfile, fuelPlan?.strategy, setup.paceOverrides, setup.routeProfile],
  );
  const routeWarning = useMemo(
    () => routeDistanceWarning(setup.routeProfile, plan?.profile?.distanceKm),
    [plan?.profile?.distanceKm, setup.routeProfile],
  );
  const routeRows = compactRouteSegments(plan?.routePlan?.segments || [], showAllRoute);
  const garminTolerance = Math.max(1, Number(setup.garminPaceToleranceSeconds || 10));
  const garminWorkout = plan?.routePlan ? buildGarminRaceWorkout({
    routePlan: plan.routePlan,
    raceName: source?.label || setup.routeProfile?.name || "Race Strategy",
    paceToleranceSeconds: garminTolerance,
  }) : null;
  const garminSteps = compactGarminSteps(garminWorkout?.steps || []);
  const garminPublishDate = setup.garminPublishDate || source?.date || localDateKey();
  const garminPublicationFingerprint = raceWorkoutPublicationFingerprint(garminWorkout, garminPublishDate);
  const garminPublicationCurrent = Boolean(
    setup.garminPublishedFingerprint
      && setup.garminPublishedFingerprint === garminPublicationFingerprint
      && setup.garminPublishedDate === garminPublishDate,
  );
  const profilePolyline = elevationPolyline(setup.routeProfile);
  const routeTicks = routeDistanceTicks(setup.routeProfile);
  const activeSegmentIndex = hoveredSegmentIndex ?? selectedSegmentIndex;

  useEffect(() => {
    const url = source?.profile?.routeGpxUrl;
    if (!sourceKey || !url || setup.routeProfile) return undefined;
    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
      })
      .then((text) => {
        const routeProfile = parseGpxRoute(text, { name: source?.label || "Rennstrecke", source: "event" });
        setState((current) => ({
          ...current,
          raceCoachSessions: {
            ...(current.raceCoachSessions || {}),
            [sourceKey]: {
              ...(current.raceCoachSessions?.[sourceKey] || {}),
              setup: {
                ...(current.raceCoachSessions?.[sourceKey]?.setup || {}),
                routeProfile,
                routeUrl: url,
              },
              updatedAt: new Date().toISOString(),
            },
          },
        }));
      })
      .catch((error) => {
        if (error?.name !== "AbortError") setSetupError("Die beim Event hinterlegte GPX konnte nicht automatisch geladen werden. Datei bitte manuell importieren.");
      });
    return () => controller.abort();
  }, [setState, setup.routeProfile, source?.label, source?.profile?.routeGpxUrl, sourceKey]);

  function selectSource(nextSourceKey) {
    setSetupError("");
    setGarminExportMessage("");
    setShowAllRoute(false);
    setSelectedSegmentIndex(null);
    setHoveredSegmentIndex(null);
    setRouteView("map");
    const next = new URLSearchParams(searchParams);
    next.set("view", "coach");
    next.set("race", nextSourceKey);
    setSearchParams(next, { replace: true });
  }

  function updateSetup(patch) {
    if (!sourceKey) return;
    setState((current) => ({
      ...current,
      raceCoachSessions: {
        ...(current.raceCoachSessions || {}),
        [sourceKey]: {
          ...(current.raceCoachSessions?.[sourceKey] || {}),
          setup: {
            ...(current.raceCoachSessions?.[sourceKey]?.setup || {}),
            ...patch,
          },
          updatedAt: new Date().toISOString(),
        },
      },
    }));
  }

  function saveTargetTime() {
    const minutes = parseRaceDurationInput(targetDraft);
    if (!(minutes > 0)) {
      setSetupError("Zielzeit bitte als H:MM, H:MM:SS oder Stundenwert eingeben.");
      return;
    }
    setSetupError("");
    updateSetup({ targetDurationMinutes: Math.round(minutes * 10) / 10, paceOverrides: {} });
  }

  function resetTargetTime() {
    setSetupError("");
    setTargetDrafts((current) => ({ ...current, [sourceKey]: formatRaceDurationInput(source?.profile?.durationMinutes || 0) }));
    updateSetup({ targetDurationMinutes: 0, paceOverrides: {} });
  }

  async function applyGpxText(text, meta = {}) {
    try {
      const routeProfile = parseGpxRoute(text, { name: meta.name || source?.label || "Rennstrecke", source: meta.source || "gpx" });
      setSetupError("");
      setShowAllRoute(false);
      setSelectedSegmentIndex(null);
      setHoveredSegmentIndex(null);
      setRouteView("map");
      updateSetup({ routeProfile, routeUrl: meta.url || "", paceOverrides: {} });
      if (meta.url) setRouteUrls((current) => ({ ...current, [sourceKey]: meta.url }));
    } catch (error) {
      setSetupError(error?.message || "GPX konnte nicht gelesen werden.");
    }
  }

  async function importGpxFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      await applyGpxText(await file.text(), { name: file.name.replace(/\.gpx$/i, ""), source: "upload" });
    } catch {
      setSetupError("Die GPX-Datei konnte nicht gelesen werden.");
    }
  }

  async function importGpxUrl() {
    const url = routeUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      setSetupError("Bitte einen direkten http(s)-Link auf eine GPX-Datei eintragen.");
      return;
    }
    setSetupError("");
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await applyGpxText(await response.text(), { name: source?.label || "Rennstrecke", source: "url", url });
    } catch {
      setSetupError("Der GPX-Link lässt sich im Browser nicht direkt laden. Lade die GPX-Datei herunter und importiere sie hier – das funktioniert auch mit Komoot-Exporten.");
    }
  }

  function removeRoute() {
    setSetupError("");
    setRouteUrls((current) => ({ ...current, [sourceKey]: "" }));
    setSelectedSegmentIndex(null);
    setHoveredSegmentIndex(null);
    updateSetup({ routeProfile: null, routeUrl: "", paceOverrides: {} });
  }

  function adjustSegmentPace(segmentIndex, deltaSeconds) {
    const segment = plan?.routePlan?.segments?.[segmentIndex];
    if (!segment) return;
    const nextPace = Math.max(120, Math.min(3600, Math.round(Number(segment.paceSecondsPerKm || 0) + deltaSeconds)));
    updateSetup({
      paceOverrides: {
        ...(setup.paceOverrides || {}),
        [segmentIndex]: nextPace,
      },
    });
  }

  function resetSegmentPace(segmentIndex) {
    const nextOverrides = { ...(setup.paceOverrides || {}) };
    delete nextOverrides[segmentIndex];
    updateSetup({ paceOverrides: nextOverrides });
  }

  function resetAllSegmentPaces() {
    updateSetup({ paceOverrides: {} });
  }

  function downloadGarminWorkout() {
    if (!garminWorkout) return;
    try {
      const bytes = encodeGarminRaceWorkoutFit(garminWorkout);
      const blob = new Blob([bytes], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = garminRaceWorkoutFilename(garminWorkout);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setGarminExportMessage(`FIT erstellt · ${garminWorkout.steps.length} Schritte · ${garminWorkout.paceToleranceSeconds} s Pace-Korridor`);
    } catch (error) {
      setGarminExportMessage(error?.message || "Garmin-FIT konnte nicht erstellt werden.");
    }
  }

  async function publishGarminWorkout() {
    if (!garminWorkout) return;
    if (!state.intervals?.connected) {
      setGarminExportMessage("Intervals.icu ist noch nicht verbunden. Bitte zuerst unter Einstellungen die Verbindung aktivieren.");
      return;
    }
    setGarminPublishBusy(true);
    setGarminExportMessage("Schlachtplan wird an Intervals.icu übergeben …");
    try {
      const publication = buildIntervalsRaceWorkoutPublication({
        workout: garminWorkout,
        raceKey: sourceKey,
        raceName: garminWorkout.name,
        publishDate: garminPublishDate,
      });
      const result = await publishIntervalsRaceWorkout(publication);
      const publishedAt = result.publishedAt || new Date().toISOString();
      updateSetup({
        garminPublishDate,
        garminPublishedAt: publishedAt,
        garminPublishedDate: result.publishDate || garminPublishDate,
        garminPublishedFingerprint: raceWorkoutPublicationFingerprint(garminWorkout, garminPublishDate),
        garminPublishedEventId: result.eventId || null,
      });
      setGarminExportMessage(`An Intervals.icu gesendet ✓ · ${Number(result.stepCount || garminWorkout.steps.length)} Pace-Abschnitte · ${garminPublishDate}`);
    } catch (error) {
      setGarminExportMessage(error?.message || "Der Race-Schlachtplan konnte nicht an Intervals.icu gesendet werden.");
    } finally {
      setGarminPublishBusy(false);
    }
  }

  if (!source) {
    return (
      <div className="race-coach-empty">
        <p className="eyebrow">Race Strategy</p>
        <h2>Erst Rennen vorbereiten</h2>
        <p>Lege unter Race Prep ein Rennen an oder hinterlege ein Wettkampfziel. Danach baut die Race Strategy daraus deinen Schlachtplan.</p>
      </div>
    );
  }

  if (!plan?.valid) {
    return (
      <div className="race-coach-empty">
        <p className="eyebrow">Race Strategy</p>
        <h2>{source.label}</h2>
        <p>{plan?.error || "Der Rennplan ist noch nicht vollständig."}</p>
      </div>
    );
  }

  return (
    <div className="race-coach">
      <div className="race-coach-heading">
        <div>
          <p className="eyebrow">Race Strategy</p>
          <h2>Schlachtplan festlegen. Am Renntag nur noch abarbeiten.</h2>
          <p>Zielzeit und Strecke vor dem Start festlegen. Höhenprofil und Rennziel werden in konkrete Kilometer-Paces übersetzt.</p>
        </div>
        <label>
          Rennen
          <select value={sourceKey} onChange={(event) => selectSource(event.target.value)}>
            {sources.map((item) => <option value={item.key} key={item.key}>{item.label} · {item.detail}</option>)}
          </select>
        </label>
      </div>

      <section className="race-coach-setup">
        <div className="race-coach-section-heading">
          <div><span>Race Setup</span><h3>Zielzeit + echte Strecke statt Durchschnittspace</h3></div>
          <small>{setup.routeProfile ? "GPX analysiert" : "Strecke optional, aber empfohlen"}</small>
        </div>
        <div className="race-coach-setup-grid">
          <div className="race-coach-target-time">
            <label>
              Deine Zielzeit
              <div className="race-coach-target-row">
                <input value={targetDraft} onChange={(event) => setTargetDrafts((current) => ({ ...current, [sourceKey]: event.target.value }))} onBlur={saveTargetTime} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} placeholder="z. B. 0:55:00 · 14:00 · 30:00" />
                <button type="button" onClick={saveTargetTime}>Übernehmen</button>
              </div>
              <small>H:MM oder H:MM:SS – funktioniert auch für Ultra-Zeiten über 24 Stunden.</small>
            </label>
            {setup.targetDurationMinutes > 0 && <button type="button" className="race-coach-text-button" onClick={resetTargetTime}>Race-Prep-Zeit wieder verwenden</button>}
          </div>

          <div className="race-coach-route-import">
            <b>Strecke / GPX</b>
            <div className="race-coach-route-actions">
              <label className="race-coach-file-button">GPX-Datei importieren<input type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml" onChange={importGpxFile} /></label>
              <span>oder</span>
              <div className="race-coach-url-row"><input value={routeUrl} onChange={(event) => setRouteUrls((current) => ({ ...current, [sourceKey]: event.target.value }))} placeholder="Direkter GPX-Link" /><button type="button" className="secondary" onClick={importGpxUrl}>Laden</button></div>
            </div>
            <small>Komoot: Route als GPX exportieren und hier hochladen. Direkte Links funktionieren nur, wenn der Anbieter Browser-Zugriff erlaubt.</small>
          </div>
        </div>
        {setupError && <div className="race-coach-setup-error">{setupError}</div>}
        {setup.routeProfile && (
          <div className="race-coach-route-card">
            <div className="race-coach-route-head">
              <div><span>RENNSTRECKE</span><strong>{setup.routeProfile.name || source.label}</strong><small>{numberLabel(setup.routeProfile.pointCount)} GPX-Punkte</small></div>
              <div className="race-coach-route-metrics">
                <span><b>{numberLabel(setup.routeProfile.distanceKm, 2)} km</b> Strecke</span>
                <span><b>+{numberLabel(setup.routeProfile.ascentM)} m</b> bergauf</span>
                <span><b>−{numberLabel(setup.routeProfile.descentM)} m</b> bergab</span>
              </div>
              <button type="button" className="secondary" onClick={removeRoute}>Strecke entfernen</button>
            </div>

            <div className="race-coach-route-viewbar">
              <div className="race-coach-route-tabs" role="tablist" aria-label="Streckenansicht">
                <button type="button" className={routeView === "map" ? "active" : ""} onClick={() => setRouteView("map")}>Karte</button>
                <button type="button" className={routeView === "elevation" ? "active" : ""} onClick={() => setRouteView("elevation")}>Höhenprofil</button>
              </div>
              <small>{activeSegmentIndex == null ? "Kilometer auf Karte oder unten auswählen" : `KM ${activeSegmentIndex + 1} hervorgehoben`}</small>
            </div>

            {routeView === "map" && (
              <RaceStrategyMap
                route={setup.routeProfile}
                segments={plan.routePlan?.segments || []}
                activeSegmentIndex={activeSegmentIndex}
                onSegmentSelect={setSelectedSegmentIndex}
              />
            )}

            {routeView === "elevation" && profilePolyline && (
              <div className="race-coach-elevation-wrap">
                <svg className="race-coach-elevation" viewBox="0 0 1000 130" preserveAspectRatio="none" role="img" aria-label="Höhenprofil der Rennstrecke"><polyline points={profilePolyline} /></svg>
                <div className="race-coach-elevation-axis" aria-hidden="true">
                  {routeTicks.map((tick) => <span key={tick.km} style={{ left: `${tick.left}%` }}><i />{tick.label}<small>km</small></span>)}
                </div>
              </div>
            )}
            {routeWarning && <div className="race-coach-route-warning">⚠ {routeWarning}</div>}
          </div>
        )}
      </section>

      <div className="race-coach-summary">
        <article><span>Rennen</span><strong>{setup.routeProfile ? `${numberLabel(setup.routeProfile.distanceKm, 2)} km` : plan.summary.distance}</strong><small>{source.label}</small></article>
        <article><span>Zielzeit</span><strong>{plan.summary.duration}</strong><small>{setup.targetDurationMinutes > 0 ? "von dir festgelegt" : plan.profile.durationEstimated ? "aus Race Prep geschätzt" : "aus Race Prep"}</small></article>
        <article><span>{plan.profile.format === "loop" ? "Starttakt" : setup.routeProfile ? "Ø Ziel-Schnitt" : "Gesamt-Schnitt"}</span><strong>{plan.profile.format === "loop" ? plan.summary.loopInterval : plan.routePlan ? paceLabel(plan.routePlan.averagePaceSecondsPerKm) : plan.summary.pace}</strong><small>{plan.routePlan ? "Splits werden ans Profil angepasst" : "Race-Plan"}</small></article>
        <article className="race-coach-strategy-status"><span>Strategie</span><strong>{plan.routePlan ? `${plan.routePlan.segments.length} Splits` : "Basisplan"}</strong><small>{plan.routePlan ? "Kilometerweise vorbereitet" : "GPX ergänzt die exakten Splits"}</small></article>
      </div>

      {plan.routePlan && (
        <section className="race-coach-route-plan">
          <div className="race-coach-section-heading race-coach-route-plan-heading">
            <div><span>Route Intelligence</span><h3>Dein Kilometer-Schlachtplan</h3></div>
            <div className="race-coach-route-plan-meta">
              <small>Gesamt {clockLabel(plan.routePlan.targetDurationMinutes)} · Ø {paceLabel(plan.routePlan.averagePaceSecondsPerKm)} · Zielzeit bleibt fix</small>
              {plan.routePlan.manualPaceCount > 0 && <button type="button" className="race-coach-text-button" onClick={resetAllSegmentPaces}>Alle Pace-Anpassungen zurücksetzen</button>}
            </div>
          </div>
          {plan.routePlan.paceOverrideWarning && <div className="race-coach-route-warning">⚠ {plan.routePlan.paceOverrideWarning}</div>}
          <div className="race-coach-route-segments">
            {routeRows.map((segment, rowIndex) => {
              if (segment.gap) return <div className="race-coach-route-gap" key={`gap-${rowIndex}`}>… {segment.hidden} weitere Kilometer …</div>;
              const segmentIndex = plan.routePlan.segments.indexOf(segment);
              const active = activeSegmentIndex === segmentIndex;
              return (
                <article
                  className={`terrain-${segment.terrain} ${active ? "active" : ""}`}
                  key={`${segment.startKm}-${segment.endKm}`}
                  onMouseEnter={() => setHoveredSegmentIndex(segmentIndex)}
                  onMouseLeave={() => setHoveredSegmentIndex(null)}
                  onClick={() => setSelectedSegmentIndex((current) => current === segmentIndex ? null : segmentIndex)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedSegmentIndex((current) => current === segmentIndex ? null : segmentIndex);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selectedSegmentIndex === segmentIndex}
                >
                  <div className="race-coach-segment-marker">
                    <span>{numberLabel(segment.startKm, 1)}–{numberLabel(segment.endKm, 1)} km</span>
                    <b>{segmentMarker(segment, segmentIndex, plan.routePlan.segments.length)}</b>
                  </div>
                  <div className={`race-coach-segment-target ${segment.manualPace ? "manual" : ""}`}>
                    <div className="race-coach-segment-pace-value">
                      <strong>{paceLabel(segment.paceSecondsPerKm)}</strong>
                      <span>{segment.manualPace ? "manuell" : "Zielpace"}</span>
                    </div>
                    <div
                      className="race-coach-segment-pace-controls"
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      <button type="button" onClick={() => adjustSegmentPace(segmentIndex, -5)} title="5 Sekunden pro Kilometer schneller" aria-label={`${segmentMarker(segment, segmentIndex, plan.routePlan.segments.length)} fünf Sekunden pro Kilometer schneller`}>−5 s</button>
                      <button type="button" onClick={() => adjustSegmentPace(segmentIndex, 5)} title="5 Sekunden pro Kilometer langsamer" aria-label={`${segmentMarker(segment, segmentIndex, plan.routePlan.segments.length)} fünf Sekunden pro Kilometer langsamer`}>+5 s</button>
                      {segment.manualPace && <button type="button" className="auto" onClick={() => resetSegmentPace(segmentIndex)} title="Diesen Kilometer wieder automatisch berechnen">Auto</button>}
                    </div>
                  </div>
                  <div className="race-coach-segment-splits">
                    <span><small>Abschnitt</small><b>{clockLabel(segment.segmentMinutes)}</b></span>
                    <span><small>Gesamt</small><b>{clockLabel(segment.cumulativeMinutes)}</b></span>
                  </div>
                  <div className="race-coach-segment-terrain">
                    <b>{segment.terrainLabel}</b>
                    <span>+{numberLabel(segment.gainM)} m · −{numberLabel(segment.lossM)} m</span>
                  </div>
                  <p>{segment.cue}</p>
                  {(segment.drinkMl > 0 || segment.fuel.length > 0) && <div className="race-coach-segment-fuel">
                    {segment.drinkMl > 0 && <span>💧 {segment.drinkMl} ml{segment.drinkProduct ? ` · ${segment.drinkProduct}` : ""}</span>}
                    {segment.fuel.map((fuel, fuelIndex) => <span key={`${fuel.product}-${fuelIndex}`}>⚡ {fuel.product}</span>)}
                  </div>}
                </article>
              );
            })}
          </div>
          {(plan.routePlan.segments?.length || 0) > 24 && <button type="button" className="race-coach-route-toggle" onClick={() => setShowAllRoute((current) => !current)}>{showAllRoute ? "Kompakt anzeigen" : `Alle ${plan.routePlan.segments.length} Kilometerabschnitte anzeigen`}</button>}
          <p className="race-coach-route-note">Die Zielzeit bleibt exakt erhalten. Mit −5 s / +5 s kannst du einzelne Kilometer bewusst schneller oder langsamer festnageln; die übrigen nicht fixierten Splits werden automatisch neu ausbalanciert. „Auto“ gibt einen Kilometer wieder an die Streckenlogik zurück. Ein Klick auf einen Kilometer hebt denselben Abschnitt auf der Karte hervor.</p>
        </section>
      )}

      {garminWorkout && (
        <section className="race-coach-garmin-export">
          <div className="race-coach-section-heading">
            <div><span>Garmin Sync</span><h3>Schlachtplan ohne Kabel auf die Uhr bringen</h3></div>
            <small>EI → Intervals.icu → Garmin</small>
          </div>

          <div className="race-coach-garmin-card">
            <div className="race-coach-garmin-copy">
              <span className="race-coach-garmin-badge">GARMIN VIA INTERVALS.ICU</span>
              <h4>Jeder Kilometer bleibt ein eigener Distanzschritt mit genau deinem Pace-Korridor.</h4>
              <p>Endurance Intelligence veröffentlicht den finalen Schlachtplan als strukturiertes Run-Workout in deinem verbundenen Intervals.icu-Konto. Ist dort der Garmin-Sync aktiv, wird das Workout von Intervals.icu an Garmin Connect weitergereicht und landet beim nächsten Sync auf deiner Uhr.</p>
            </div>

            <div className="race-coach-garmin-metrics">
              <span><small>Schritte</small><b>{garminWorkout.steps.length}</b></span>
              <span><small>Distanz</small><b>{numberLabel(garminWorkout.totalDistanceM / 1000, 2)} km</b></span>
              <span><small>Zielzeit</small><b>{clockLabel(garminWorkout.targetDurationMinutes)}</b></span>
              <label>
                <small>Pace-Korridor</small>
                <select
                  value={garminTolerance}
                  onChange={(event) => {
                    setGarminExportMessage("");
                    updateSetup({ garminPaceToleranceSeconds: Number(event.target.value) });
                  }}
                >
                  <option value={5}>± 5 s/km · eng</option>
                  <option value={10}>± 10 s/km · empfohlen</option>
                  <option value={15}>± 15 s/km · entspannt</option>
                  <option value={20}>± 20 s/km · wenig Alarme</option>
                </select>
              </label>
              <label>
                <small>Garmin-Sync-Tag</small>
                <input
                  type="date"
                  value={garminPublishDate}
                  onChange={(event) => {
                    setGarminExportMessage("");
                    updateSetup({ garminPublishDate: event.target.value });
                  }}
                />
              </label>
            </div>

            <div className="race-coach-garmin-preview" aria-label="Garmin Workout Vorschau">
              {garminSteps.map((step, index) => step.gap
                ? <span className="race-coach-garmin-gap" key={`garmin-gap-${index}`}>+{step.hidden}</span>
                : <span className="race-coach-garmin-step" key={step.index}>
                    <b>{step.index + 1}</b>
                    <small>{paceLabel(step.paceFastSecondsPerKm).replace("/km", "")}–{paceLabel(step.paceSlowSecondsPerKm)}</small>
                  </span>)}
            </div>

            <div className="race-coach-garmin-sync-hint">
              <span>{source?.date && garminPublishDate === source.date ? `Renntag ${source.date} ist vorausgewählt.` : `Workout wird für ${garminPublishDate} in Intervals.icu eingeplant.`}</span>
              <button type="button" className="race-coach-text-button" onClick={() => { setGarminExportMessage(""); updateSetup({ garminPublishDate: localDateKey() }); }}>Heute für Soforttest</button>
            </div>

            <div className="race-coach-garmin-actions">
              <button
                type="button"
                className="race-coach-garmin-primary"
                onClick={publishGarminWorkout}
                disabled={!garminWorkout.compatible || garminPublishBusy || !state.intervals?.connected}
              >
                {garminPublishBusy ? "Sende an Garmin …" : setup.garminPublishedAt && !garminPublicationCurrent ? "Garmin aktualisieren" : garminPublicationCurrent ? "Erneut an Garmin senden" : "An Garmin senden"}
              </button>
              <button type="button" className="secondary" onClick={downloadGarminWorkout} disabled={!garminWorkout.compatible}>FIT herunterladen</button>
              <div>
                <b>{!state.intervals?.connected ? "Intervals.icu nicht verbunden" : !garminWorkout.compatible ? "Noch nicht exportierbar" : garminPublicationCurrent ? "Schlachtplan ist aktuell übertragen" : setup.garminPublishedAt ? "Änderungen noch nicht übertragen" : "Bereit zum Senden"}</b>
                <small>{!state.intervals?.connected ? "Verbindung zuerst unter Einstellungen aktivieren." : garminWorkout.compatible ? `${garminWorkout.steps.length} strukturierte Pace-Schritte · ${garminPublishDate}` : garminWorkout.compatibilityMessage}</small>
              </div>
            </div>
            {garminExportMessage && <div className="race-coach-garmin-status">{garminExportMessage}</div>}
            <p className="race-coach-garmin-note"><b>Ohne USB:</b> Intervals.icu ist hier die Transferbrücke. Der Garmin-Sync muss einmal in Intervals.icu aktiviert sein. Für einen direkten Test kannst du den Sync-Tag auf heute setzen; für das echte Rennen lässt du den Renntag stehen. Der FIT-Download bleibt nur als Backup erhalten.</p>
          </div>
        </section>
      )}

      <section className="race-coach-blueprint">
        <div className="race-coach-section-heading"><div><span>Race Blueprint</span><h3>Die vier Rennphasen hinter den Kilometerzahlen</h3></div><small>Plan statt spontane Pace-Jagd</small></div>
        <div className="race-coach-phase-grid">
          {plan.phases.map((phase) => (
            <article key={phase.key}>
              <span>{phase.range}</span>
              <h4>{phase.title}</h4>
              <p>{phase.detail}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
