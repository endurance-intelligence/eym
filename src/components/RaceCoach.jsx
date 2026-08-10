import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { missionEvents } from "../services/goalPlanning";
import {
  buildRaceCoachPlan,
  emptyRaceCoachStatus,
  evaluateRaceCoach,
  normalizeRaceCoachStatus,
} from "../services/raceCoach";
import { racePrepProfileFromEvent } from "../services/racePrepPlanner";

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function sourceOptions(state) {
  const todayKey = localDateKey();
  const saved = (Array.isArray(state.racePrepPlans) ? state.racePrepPlans : []).map((profile) => ({
    key: `saved:${profile.id}`,
    label: profile.name || "Gespeicherter Race-Prep-Plan",
    detail: "Race Prep",
    profile,
  }));
  const events = missionEvents(state.mission)
    .filter((event) => !event.date || event.date >= todayKey)
    .map((event) => ({
      key: `event:${event.id}`,
      label: event.name || "Wettkampf",
      detail: event.date || "Termin offen",
      profile: racePrepProfileFromEvent(event),
    }));
  return [...saved, ...events.filter((event) => !saved.some((item) => item.profile.originEventId && item.profile.originEventId === event.profile.originEventId))];
}

function percent(value) {
  return `${Math.round(Number(value || 0) * 100)} %`;
}

export default function RaceCoach() {
  const { state, setState } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const sources = useMemo(() => sourceOptions(state), [state]);
  const requestedSource = searchParams.get("race");
  const source = sources.find((item) => item.key === requestedSource) || sources[0] || null;
  const sourceKey = source?.key || "";
  const plan = useMemo(() => source ? buildRaceCoachPlan(source.profile) : null, [source]);
  const storedStatus = sourceKey ? state.raceCoachSessions?.[sourceKey] : null;
  const status = useMemo(
    () => normalizeRaceCoachStatus(storedStatus || emptyRaceCoachStatus(), plan?.profile),
    [plan?.profile, storedStatus],
  );
  const evaluation = useMemo(
    () => plan?.valid ? evaluateRaceCoach({ plan, status }) : null,
    [plan, status],
  );

  function selectSource(nextSourceKey) {
    const next = new URLSearchParams(searchParams);
    next.set("view", "coach");
    next.set("race", nextSourceKey);
    setSearchParams(next, { replace: true });
  }

  function updateStatus(field, value) {
    if (!sourceKey) return;
    setState((current) => ({
      ...current,
      raceCoachSessions: {
        ...(current.raceCoachSessions || {}),
        [sourceKey]: {
          ...(current.raceCoachSessions?.[sourceKey] || emptyRaceCoachStatus()),
          [field]: value,
          updatedAt: new Date().toISOString(),
        },
      },
    }));
  }

  function resetStatus() {
    if (!sourceKey) return;
    setState((current) => {
      const nextSessions = { ...(current.raceCoachSessions || {}) };
      delete nextSessions[sourceKey];
      return { ...current, raceCoachSessions: nextSessions };
    });
  }

  if (!source) {
    return (
      <div className="race-coach-empty">
        <p className="eyebrow">Race Coach</p>
        <h2>Erst Rennen vorbereiten</h2>
        <p>Lege unter Race Prep ein Rennen an oder hinterlege ein Wettkampfziel. Danach baut der Race Coach daraus Rennplan, Checkpoints und Live-Entscheidungen.</p>
      </div>
    );
  }

  if (!plan?.valid) {
    return (
      <div className="race-coach-empty">
        <p className="eyebrow">Race Coach</p>
        <h2>{source.label}</h2>
        <p>{plan?.error || "Der Rennplan ist noch nicht vollständig."}</p>
      </div>
    );
  }

  return (
    <div className="race-coach">
      <div className="race-coach-heading">
        <div>
          <p className="eyebrow">Race Coach</p>
          <h2>Rennplan ausführen statt spontan reagieren</h2>
          <p>Strategie vor dem Start festlegen, live gegen den Plan prüfen und nur kontrollierte Anpassungen zulassen.</p>
        </div>
        <label>
          Rennen
          <select value={sourceKey} onChange={(event) => selectSource(event.target.value)}>
            {sources.map((item) => <option value={item.key} key={item.key}>{item.label} · {item.detail}</option>)}
          </select>
        </label>
      </div>

      <div className="race-coach-summary">
        <article><span>Rennen</span><strong>{plan.summary.distance}</strong><small>{source.label}</small></article>
        <article><span>Zielrahmen</span><strong>{plan.summary.duration}</strong><small>{plan.profile.durationEstimated ? "aus Race Prep geschätzt" : "geplanter Rennrahmen"}</small></article>
        <article><span>{plan.profile.format === "loop" ? "Starttakt" : "Gesamt-Schnitt"}</span><strong>{plan.profile.format === "loop" ? plan.summary.loopInterval : plan.summary.pace}</strong><small>{plan.profile.format === "distance" && plan.profile.durationMinutes >= 240 ? "inkl. geplanter Stopps" : "Race-Plan"}</small></article>
        <article className={`race-coach-status ${evaluation?.tone || "hold"}`}><span>Live-Status</span><strong>{evaluation?.headline || "Plan halten"}</strong><small>{evaluation?.position}</small></article>
      </div>

      <section className="race-coach-blueprint">
        <div className="race-coach-section-heading"><div><span>Race Blueprint</span><h3>Vorher festgelegte Rennphasen</h3></div><small>Keine spontane Pace-Jagd</small></div>
        <div className="race-coach-phase-grid">
          {plan.phases.map((phase) => (
            <article className={evaluation?.phase === phase.key ? "active" : ""} key={phase.key}>
              <span>{phase.range}</span>
              <h4>{phase.title}</h4>
              <p>{phase.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <div className="race-coach-live-grid">
        <section className="race-coach-live">
          <div className="race-coach-section-heading"><div><span>Live Check</span><h3>Was ist gerade wirklich los?</h3></div><button type="button" className="secondary" onClick={resetStatus}>Status zurücksetzen</button></div>
          <div className="race-coach-live-form">
            <label>
              Rennzeit bisher (min)
              <input type="number" min="0" step="1" value={status.elapsedMinutes || ""} onChange={(event) => updateStatus("elapsedMinutes", event.target.value)} />
            </label>
            {plan.profile.format === "loop" ? <>
              <label>
                Aktuelle Runde
                <input type="number" min="1" max={plan.profile.rounds} step="1" value={status.currentRound} onChange={(event) => updateStatus("currentRound", event.target.value)} />
              </label>
              <label>
                Letzte Runde Laufzeit (min)
                <input type="number" min="0" step="0.1" value={status.lastLoopMinutes || ""} onChange={(event) => updateStatus("lastLoopMinutes", event.target.value)} />
              </label>
            </> : (
              <label>
                Distanz bisher (km)
                <input type="number" min="0" step="0.1" value={status.distanceKm || ""} onChange={(event) => updateStatus("distanceKm", event.target.value)} />
              </label>
            )}
            <label>
              RPE aktuell
              <select value={status.rpe} onChange={(event) => updateStatus("rpe", event.target.value)}>
                {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => <option value={value} key={value}>{value} / 10</option>)}
              </select>
            </label>
            <label>
              Beine
              <select value={status.legs} onChange={(event) => updateStatus("legs", event.target.value)}>
                <option value="fresh">Frisch / locker</option>
                <option value="okay">Okay</option>
                <option value="heavy">Schwer</option>
              </select>
            </label>
            <label>
              Magen
              <select value={status.stomach} onChange={(event) => updateStatus("stomach", event.target.value)}>
                <option value="okay">Gut</option>
                <option value="notable">Auffällig</option>
                <option value="problem">Problematisch</option>
              </select>
            </label>
            <label>
              Fueling
              <select value={status.fueling} onChange={(event) => updateStatus("fueling", event.target.value)}>
                <option value="on-plan">Im Plan</option>
                <option value="behind">Hinter Plan</option>
                <option value="problem">Nicht verträglich</option>
              </select>
            </label>
          </div>
        </section>

        <section className={`race-coach-decision ${evaluation?.tone || "hold"}`}>
          <span>Coach-Entscheidung · {evaluation?.phaseData?.range}</span>
          <h3>{evaluation?.headline}</h3>
          <strong>{evaluation?.position}</strong>
          <p>{evaluation?.phaseData?.title}: {evaluation?.phaseData?.detail}</p>
          <div className="race-coach-actions">
            {evaluation?.actions.map((action) => <div key={action}>→ {action}</div>)}
          </div>
          {evaluation?.nextCheckpoint && <small>Nächster Checkpoint: <b>{evaluation.nextCheckpoint.marker}</b> · Plan {evaluation.nextCheckpoint.target}</small>}
        </section>
      </div>

      <section className="race-coach-checkpoints">
        <div className="race-coach-section-heading"><div><span>Checkpoints</span><h3>Planposition statt Bauchgefühl</h3></div><small>Aktuell {percent(evaluation?.progress)}</small></div>
        <div className="race-coach-checkpoint-list">
          {plan.checkpoints.map((checkpoint) => {
            const done = checkpoint.fraction <= Number(evaluation?.progress || 0) + 0.001;
            const next = checkpoint.key === evaluation?.nextCheckpoint?.key;
            return <article className={`${done ? "done" : ""} ${next ? "next" : ""}`} key={checkpoint.key}><span>{checkpoint.marker}</span><strong>{checkpoint.target}</strong><small>{done ? "erreicht" : next ? "als Nächstes" : "geplant"}</small></article>;
          })}
        </div>
      </section>
    </div>
  );
}
