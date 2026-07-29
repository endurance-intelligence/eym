import { useEffect, useMemo, useState } from "react";
import { version } from "../../package.json";
import { useApp } from "../context/AppContext";
import {
  CONFLICT_MODE_OPTIONS,
  LOAD_OPTIONS,
  SPORT_OPTIONS,
  normalizeCommitment,
  sportLabel,
} from "../services/configuration";
import { EXPERIENCE_OPTIONS, experienceLabel } from "../services/athleteProfile";
import {
  ONBOARDING_STEPS,
  completeOnboardingState,
  createOnboardingDraft,
  onboardingBaselineFromActivities,
  onboardingStepError,
} from "../services/onboarding";
import {
  connectIntervalsApiKey,
  mapIntervalsActivities,
  mergeIntervalsActivities,
  syncIntervalsActivities,
} from "../services/intervals";
import "./Onboarding.css";

const WEEKDAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

function numberOrBlank(value) {
  return value === "" ? "" : Number(value);
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function freshCommitment() {
  return {
    id: crypto.randomUUID(),
    name: "",
    sport: "running",
    workoutType: "",
    weekday: "Montag",
    time: "18:00",
    durationMinutes: 60,
    distanceKm: 0,
    load: "medium",
    enabled: true,
    conflictMode: "replace",
  };
}

function FieldNote({ children }) {
  return <small className="onboarding-field-note">{children}</small>;
}

export default function Onboarding() {
  const { state, setState, logout } = useApp();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState(() => createOnboardingDraft(state));
  const [message, setMessage] = useState("");
  const [commitmentDraft, setCommitmentDraft] = useState(null);
  const [commitmentMessage, setCommitmentMessage] = useState("");
  const [intervalsApiKey, setIntervalsApiKey] = useState("");
  const [intervalsBusy, setIntervalsBusy] = useState(false);
  const [intervalsMessage, setIntervalsMessage] = useState("");
  const [showIntervalsApiKey, setShowIntervalsApiKey] = useState(false);

  const currentStep = ONBOARDING_STEPS[step];
  const todayKey = localDateKey();
  const progress = ((step + 1) / ONBOARDING_STEPS.length) * 100;
  const level = EXPERIENCE_OPTIONS.find((option) => option.value === draft.experienceLevel);
  const missionSummary = draft.missionMode === "event"
    ? `${draft.missionName || "Event"} · ${draft.missionDistanceKm || "–"} km`
    : "Ohne festes Event starten";
  const sortedCommitments = useMemo(
    () => [...draft.recurringCommitments].sort((left, right) => {
      const day = WEEKDAYS.indexOf(left.weekday) - WEEKDAYS.indexOf(right.weekday);
      return day || String(left.time || "").localeCompare(String(right.time || ""));
    }),
    [draft.recurringCommitments],
  );

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  function update(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
    setMessage("");
  }

  function toggleDay(field, day) {
    setDraft((current) => {
      const values = Array.isArray(current[field]) ? current[field] : [];
      return {
        ...current,
        [field]: values.includes(day) ? values.filter((value) => value !== day) : [...values, day],
      };
    });
    setMessage("");
  }

  function next() {
    const error = onboardingStepError(currentStep.key, draft);
    if (error) {
      setMessage(error);
      return;
    }
    setMessage("");
    if (step < ONBOARDING_STEPS.length - 1) {
      setStep((value) => value + 1);
      return;
    }
    setState((current) => completeOnboardingState(current, draft));
  }

  function back() {
    setMessage("");
    setStep((value) => Math.max(0, value - 1));
  }

  function openCommitment() {
    setCommitmentMessage("");
    setCommitmentDraft(freshCommitment());
  }

  function saveCommitment() {
    if (!String(commitmentDraft?.name || "").trim()) {
      setCommitmentMessage("Bitte gib dem Fixtermin einen Namen.");
      return;
    }
    const normalized = normalizeCommitment(commitmentDraft);
    update("recurringCommitments", [
      ...draft.recurringCommitments.filter((item) => item.id !== normalized.id),
      normalized,
    ]);
    setCommitmentDraft(null);
    setCommitmentMessage("");
  }

  function removeCommitment(id) {
    update("recurringCommitments", draft.recurringCommitments.filter((item) => item.id !== id));
  }

  function editCommitment(item) {
    setCommitmentMessage("");
    setCommitmentDraft({ ...item });
  }

  function selectMissionMode(mode) {
    update("missionMode", mode);
  }

  function baselineRunsChanged(value) {
    const runs = numberOrBlank(value);
    setDraft((current) => ({
      ...current,
      currentRunsPerWeek: runs,
      targetRunCount: runs === "" ? current.targetRunCount : Math.round(Math.max(1, Math.min(7, runs || 2))),
      baselineSource: "manual",
    }));
    setMessage("");
  }

  async function connectIntervals() {
    const apiKey = intervalsApiKey.trim();
    if (!apiKey) {
      setIntervalsMessage("Bitte kopiere deinen persönlichen API-Key aus Intervals.icu hier hinein.");
      return;
    }
    setIntervalsBusy(true);
    setIntervalsMessage("");
    try {
      const connection = await connectIntervalsApiKey(apiKey);
      setIntervalsApiKey("");
      setState((current) => ({
        ...current,
        intervals: {
          ...current.intervals,
          configured: true,
          connected: true,
          connectionMode: connection.connectionMode || "personal",
        },
      }));
      setDraft((current) => ({ ...current, intervalsConnected: true }));

      try {
        const result = await syncIntervalsActivities(state.intervals?.importFrom || "2025-01-01");
        const imported = mapIntervalsActivities(Array.isArray(result.activities) ? result.activities : []);
        const merged = mergeIntervalsActivities(state.activities, imported);
        const baseline = onboardingBaselineFromActivities(merged.activities);
        const syncedAt = result.syncedAt || new Date().toISOString();
        setState((current) => ({
          ...current,
          activities: mergeIntervalsActivities(current.activities, imported).activities,
          intervals: {
            ...current.intervals,
            configured: true,
            connected: true,
            connectionMode: connection.connectionMode || "personal",
            lastSyncAt: syncedAt,
          },
        }));
        setDraft((current) => ({
          ...current,
          intervalsConnected: true,
          intervalsImportedActivities: imported.length,
          baselineSource: baseline.hasData ? "intervals" : current.baselineSource,
          ...(baseline.hasData ? {
            currentRunsPerWeek: baseline.currentRunsPerWeek,
            weeklyKm: baseline.weeklyKm,
            longestRunKm: baseline.longestRunKm,
            targetRunCount: Math.round(Math.max(1, Math.min(7, baseline.currentRunsPerWeek || 2))),
          } : {}),
        }));
        setIntervalsMessage(
          baseline.hasData
            ? `Verbunden. ${imported.length} Aktivitäten wurden geladen und deine aktuelle Laufbasis vorausgefüllt.`
            : `Verbunden. ${imported.length} Aktivitäten wurden geladen; aktuelle Laufwerte ergänzt du im nächsten Schritt selbst.`,
        );
      } catch (error) {
        setIntervalsMessage(`Verbindung gespeichert. Der erste Import konnte noch nicht abgeschlossen werden: ${error instanceof Error ? error.message : String(error)}`);
      }
    } catch (error) {
      setDraft((current) => ({ ...current, intervalsConnected: false }));
      setIntervalsMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIntervalsBusy(false);
    }
  }

  return (
    <main className="onboarding-shell">
      <section className="onboarding-frame">
        <aside className="onboarding-sidebar">
          <div className="onboarding-brand">
            <span className="onboarding-mark" aria-hidden="true">EI</span>
            <div><b>Endurance Intelligence</b><small>Eat your miles. · v{version}</small></div>
          </div>
          <div className="onboarding-sidebar-copy">
            <p className="eyebrow">Dein Start</p>
            <h2>Persönlich planen beginnt mit den richtigen Fragen.</h2>
            <p>Dein Coach baut einen belastbaren Ausgangspunkt auf. Nichts wird ungefragt in deinen Kalender geschrieben.</p>
          </div>
          <ol className="onboarding-progress" aria-label="Onboarding-Fortschritt">
            {ONBOARDING_STEPS.map((item, index) => (
              <li className={index === step ? "active" : index < step ? "done" : ""} key={item.key}>
                <button type="button" disabled={index > step} onClick={() => { setStep(index); setMessage(""); }}>
                  <span>{index < step ? "✓" : index + 1}</span>
                  <div><small>Schritt {index + 1}</small><strong>{item.label}</strong></div>
                </button>
              </li>
            ))}
          </ol>
          <button className="onboarding-logout" type="button" onClick={logout}>Anderes Konto verwenden</button>
        </aside>

        <section className="onboarding-content">
          <header className="onboarding-mobile-head">
            <div className="onboarding-brand">
              <span className="onboarding-mark" aria-hidden="true">EI</span>
              <div><b>Endurance Intelligence</b><small>Schritt {step + 1} von {ONBOARDING_STEPS.length}</small></div>
            </div>
            <div className="onboarding-mobile-progress"><i style={{ width: `${progress}%` }} /></div>
          </header>

          <div className="onboarding-step">
            {currentStep.key === "profile" && (
              <>
                <div className="onboarding-heading">
                  <p className="eyebrow">Willkommen bei Endurance Intelligence</p>
                  <h1>Ein Plan, der bei dir anfängt.</h1>
                  <p>In wenigen Schritten lernt dein Coach deine Ausgangslage kennen. Nur dein Anzeigename ist hier Pflicht – die Körperdaten kannst du auch später ergänzen.</p>
                </div>
                <div className="onboarding-highlight">
                  <span aria-hidden="true">✦</span>
                  <div><strong>Kein fertiger Standardplan</strong><p>Deine Angaben bilden den Startpunkt. Aktivitäten und Reviews machen das Modell danach Schritt für Schritt genauer.</p></div>
                </div>
                <div className="onboarding-form-grid">
                  <label className="wide-field">Wie darf dein Coach dich ansprechen?
                    <input autoFocus value={draft.displayName} maxLength="60" placeholder="z. B. Daniel" onChange={(event) => update("displayName", event.target.value)} />
                  </label>
                  <label>Geburtsdatum <span>optional</span>
                    <input type="date" value={draft.birthDate} max={todayKey} onChange={(event) => update("birthDate", event.target.value)} />
                  </label>
                  <label>Größe in cm <span>optional</span>
                    <input type="number" min="100" max="230" value={draft.heightCm} placeholder="z. B. 180" onChange={(event) => update("heightCm", numberOrBlank(event.target.value))} />
                  </label>
                  <label>Gewicht in kg <span>optional</span>
                    <input type="number" min="30" max="250" step="0.1" value={draft.weightKg} placeholder="z. B. 78,5" onChange={(event) => update("weightKg", numberOrBlank(event.target.value))} />
                  </label>
                  <div className="onboarding-privacy-note"><b>Privat und änderbar</b><span>Diese Werte bleiben in deinem Profil und können jederzeit unter Settings → Profil geändert werden.</span></div>
                </div>
              </>
            )}

            {currentStep.key === "intervals" && (
              <>
                <div className="onboarding-heading">
                  <p className="eyebrow">Deine Trainingsdaten</p>
                  <h1>Intervals.icu verbinden.</h1>
                  <p>Damit dein Coach nicht mit leeren Annahmen startet, übernimmt Endurance Intelligence deine vorhandenen Aktivitäten aus Intervals.icu und kann bestätigte Wochenpläne dorthin zurückschreiben.</p>
                </div>

                <div className="onboarding-data-flow">
                  <article><span>↓</span><div><strong>Import in deinen Coach</strong><p>Aktivitäten, Distanz, Dauer, Herzfrequenz, Belastung und verfügbare Wetterdaten.</p></div></article>
                  <article><span>↑</span><div><strong>Export aus deinem Coach</strong><p>Bestätigte Wochenpläne und strukturierte Workouts in den Intervals.icu-Kalender – von dort optional weiter zu Garmin.</p></div></article>
                </div>

                <section className="onboarding-intervals-card">
                  <div className="onboarding-intervals-heading">
                    <div><p className="eyebrow">Einmalige Einrichtung</p><h2>Persönlichen API-Key holen</h2></div>
                    {draft.intervalsConnected && <span className="onboarding-connected-badge">✓ Verbunden</span>}
                  </div>
                  <ol className="onboarding-intervals-guide">
                    <li><span>1</span><div><strong>Intervals.icu öffnen</strong><p>Einloggen oder zuerst ein kostenloses Konto anlegen.</p><div className="onboarding-link-row"><a href="https://intervals.icu/settings" target="_blank" rel="noreferrer">Settings öffnen ↗</a><a href="https://intervals.icu/signup" target="_blank" rel="noreferrer">Konto erstellen ↗</a></div></div></li>
                    <li><span>2</span><div><strong>Zu „Developer Settings“ scrollen</strong><p>Der Bereich befindet sich weit unten auf der Settings-Seite. Beim Eintrag API Key auf „view“ klicken und den Schlüssel kopieren.</p></div></li>
                    <li><span>3</span><div><strong>API-Key hier einfügen</strong><p>Eine Athlete-ID musst du nicht suchen – Intervals.icu ordnet den Schlüssel automatisch deinem eigenen Konto zu.</p></div></li>
                  </ol>

                  {!draft.intervalsConnected ? (
                    <div className="onboarding-api-key-panel">
                      <label>Persönlicher Intervals.icu API-Key
                        <span className="onboarding-secret-input">
                          <input
                            autoComplete="off"
                            spellCheck="false"
                            type={showIntervalsApiKey ? "text" : "password"}
                            value={intervalsApiKey}
                            placeholder="API-Key einfügen"
                            onChange={(event) => { setIntervalsApiKey(event.target.value); setIntervalsMessage(""); }}
                          />
                          <button type="button" onClick={() => setShowIntervalsApiKey((value) => !value)}>{showIntervalsApiKey ? "Verbergen" : "Anzeigen"}</button>
                        </span>
                      </label>
                      <button type="button" className="primary onboarding-connect-button" onClick={connectIntervals} disabled={intervalsBusy}>{intervalsBusy ? "Prüfe und importiere …" : "Verbindung prüfen & Daten laden"}</button>
                    </div>
                  ) : (
                    <details className="onboarding-reconnect">
                      <summary>Anderen API-Key verwenden</summary>
                      <div className="onboarding-api-key-panel">
                        <label>Neuer Intervals.icu API-Key
                          <span className="onboarding-secret-input">
                            <input
                              autoComplete="off"
                              spellCheck="false"
                              type={showIntervalsApiKey ? "text" : "password"}
                              value={intervalsApiKey}
                              placeholder="Neuen API-Key einfügen"
                              onChange={(event) => { setIntervalsApiKey(event.target.value); setIntervalsMessage(""); }}
                            />
                            <button type="button" onClick={() => setShowIntervalsApiKey((value) => !value)}>{showIntervalsApiKey ? "Verbergen" : "Anzeigen"}</button>
                          </span>
                        </label>
                        <button type="button" className="primary onboarding-connect-button" onClick={connectIntervals} disabled={intervalsBusy}>{intervalsBusy ? "Prüfe …" : "API-Key ersetzen"}</button>
                      </div>
                    </details>
                  )}

                  {intervalsMessage && <p className={`onboarding-connection-message ${draft.intervalsConnected ? "success" : "error"}`} aria-live="polite">{intervalsMessage}</p>}
                  <div className="onboarding-secret-note"><span>🔒</span><p><strong>Wie ein Passwort behandeln</strong><small>Der API-Key erlaubt den Zugriff auf dein Intervals.icu-Konto. Nach dem Test wird er nicht im Profil oder Browser, sondern verschlüsselt in einer getrennten, nur serverseitig lesbaren Ablage gespeichert. Bei einer Neugenerierung verbindest du ihn hier erneut.</small></p></div>
                </section>

                <section className="onboarding-garmin-note">
                  <div><span>G</span><p><strong>Workouts zusätzlich an Garmin senden?</strong><small>Öffne in Intervals.icu Settings → Connections → Garmin und aktiviere „Upload planned workouts“. Ohne diese Option landen die Pläne korrekt in Intervals.icu, aber nicht automatisch auf deiner Uhr.</small></p></div>
                  <a href="https://intervals.icu/settings/connections" target="_blank" rel="noreferrer">Garmin-Verbindung öffnen ↗</a>
                </section>
              </>
            )}

            {currentStep.key === "baseline" && (
              <>
                <div className="onboarding-heading">
                  <p className="eyebrow">Deine Ausgangslage</p>
                  <h1>Wo stehst du heute?</h1>
                  <p>Nicht die Bestform von früher, sondern dein üblicher Rahmen der letzten sechs Wochen zählt. Eine ehrliche 0 ist wertvoller als eine optimistische Schätzung.</p>
                </div>
                <div className="onboarding-choice-grid level-grid" role="radiogroup" aria-label="Trainingslevel">
                  {EXPERIENCE_OPTIONS.map((option) => (
                    <button type="button" role="radio" aria-checked={draft.experienceLevel === option.value} className={draft.experienceLevel === option.value ? "selected" : ""} onClick={() => update("experienceLevel", option.value)} key={option.value}>
                      <span>{option.label}</span><strong>{option.title}</strong><small>{option.description}</small>
                    </button>
                  ))}
                </div>
                <div className="onboarding-metric-inputs">
                  <label><span>Läufe pro Woche</span><input type="number" min="0" max="7" step="0.5" value={draft.currentRunsPerWeek} placeholder="0–7" onChange={(event) => baselineRunsChanged(event.target.value)} /><FieldNote>dein aktueller Durchschnitt</FieldNote></label>
                  <label><span>Kilometer pro Woche</span><input type="number" min="0" max="300" step="0.1" value={draft.weeklyKm} placeholder="z. B. 25" onChange={(event) => { update("weeklyKm", numberOrBlank(event.target.value)); update("baselineSource", "manual"); }} /><FieldNote>ungefährer 6-Wochen-Schnitt</FieldNote></label>
                  <label><span>Längster Lauf</span><input type="number" min="0" max="250" step="0.1" value={draft.longestRunKm} placeholder="z. B. 12" onChange={(event) => { update("longestRunKm", numberOrBlank(event.target.value)); update("baselineSource", "manual"); }} /><FieldNote>innerhalb der letzten 8 Wochen</FieldNote></label>
                </div>
                <div className="onboarding-info-strip"><b>{draft.baselineSource === "intervals" ? "Aus Intervals.icu vorausgefüllt" : "Warum fragt dein Coach das?"}</b><span>{draft.baselineSource === "intervals" ? "Die Werte wurden aus den letzten sechs beziehungsweise acht Wochen berechnet. Prüfe sie kurz und korrigiere sie, falls deine aktuelle Situation davon abweicht." : "Diese Werte verhindern, dass ein neuer Wochenplan mit einem zu hohen pauschalen Kilometerumfang startet."}</span></div>
              </>
            )}

            {currentStep.key === "mission" && (
              <>
                <div className="onboarding-heading">
                  <p className="eyebrow">Dein Ziel</p>
                  <h1>Wofür trainierst du?</h1>
                  <p>Ein konkretes Event schärft die Planung. Du kannst aber genauso ohne Wettkampfziel starten und deine Mission später ergänzen.</p>
                </div>
                <div className="onboarding-choice-grid mission-mode-grid" role="radiogroup" aria-label="Zielart">
                  <button type="button" role="radio" aria-checked={draft.missionMode === "event"} className={draft.missionMode === "event" ? "selected" : ""} onClick={() => selectMissionMode("event")}>
                    <span>◎</span><strong>Konkretes Event</strong><small>Datum und Distanz steuern Phasen, Umfang und Spezifität.</small>
                  </button>
                  <button type="button" role="radio" aria-checked={draft.missionMode === "general"} className={draft.missionMode === "general" ? "selected" : ""} onClick={() => selectMissionMode("general")}>
                    <span>↗</span><strong>Erst einmal entwickeln</strong><small>Ohne Event starten und später ein Hauptziel festlegen.</small>
                  </button>
                </div>
                {draft.missionMode === "event" ? (
                  <div className="onboarding-form-grid mission-fields">
                    <label className="wide-field">Name des Events
                      <input value={draft.missionName} maxLength="80" placeholder="z. B. Berlin Marathon" onChange={(event) => update("missionName", event.target.value)} />
                    </label>
                    <label>Datum
                      <input type="date" min={todayKey} value={draft.missionDate} onChange={(event) => update("missionDate", event.target.value)} />
                    </label>
                    <label>Zieldistanz in km
                      <input type="number" min="1" max="500" step="0.1" value={draft.missionDistanceKm} placeholder="z. B. 42,2" onChange={(event) => update("missionDistanceKm", numberOrBlank(event.target.value))} />
                    </label>
                    <div className="onboarding-privacy-note wide-field"><b>Details später verfeinern</b><span>Ort, Höhenmeter, Untergrund und Zielzeit kannst du danach im Bereich Mission ergänzen.</span></div>
                  </div>
                ) : (
                  <div className="onboarding-empty-choice">
                    <span aria-hidden="true">○</span>
                    <div><strong>Offen starten ist ein gültiges Ziel.</strong><p>Dein Coach nutzt zunächst deine reale Belastungsbasis und deinen Wochenrahmen. Ein Event kann jederzeit ergänzt werden.</p></div>
                  </div>
                )}
              </>
            )}

            {currentStep.key === "week" && (
              <>
                <div className="onboarding-heading">
                  <p className="eyebrow">Deine Woche</p>
                  <h1>Was passt wirklich in deinen Alltag?</h1>
                  <p>Du legst Obergrenze und mögliche Tage fest. Dein Coach darf darunter bleiben, aber nicht einfach zusätzliche Lauftage erfinden.</p>
                </div>

                <section className="onboarding-week-section">
                  <div className="onboarding-section-title"><div><span>01</span><h2>Laufrahmen</h2></div><small>Wie viele Läufe sollen höchstens geplant werden?</small></div>
                  <div className="onboarding-count-picker" role="radiogroup" aria-label="Geplante Läufe pro Woche">
                    {[1, 2, 3, 4, 5, 6, 7].map((count) => <button type="button" role="radio" aria-checked={draft.targetRunCount === count} className={draft.targetRunCount === count ? "selected" : ""} onClick={() => update("targetRunCount", count)} key={count}>{count}</button>)}
                  </div>
                  <div className="onboarding-day-picker"><strong>An welchen Tagen kannst du grundsätzlich laufen?</strong><div>{WEEKDAYS.map((day) => <button type="button" className={draft.runDays.includes(day) ? "selected" : ""} onClick={() => toggleDay("runDays", day)} key={`run-${day}`}><b>{day.slice(0, 2)}</b><small>{day}</small></button>)}</div></div>
                </section>

                <section className="onboarding-week-section">
                  <div className="onboarding-section-title"><div><span>02</span><h2>Stabi & Mobility</h2></div><small>Unterstützend, nicht als zusätzlicher harter Trainingstag.</small></div>
                  <div className="onboarding-inline-choice">
                    {[0, 1, 2, 3].map((count) => <button type="button" className={draft.stabiCount === count ? "selected" : ""} onClick={() => update("stabiCount", count)} key={count}>{count === 0 ? "Noch nicht" : `${count} × pro Woche`}</button>)}
                  </div>
                  {draft.stabiCount > 0 && <div className="onboarding-day-picker compact"><strong>Welche Tage kommen dafür infrage?</strong><div>{WEEKDAYS.map((day) => <button type="button" className={draft.stabiDays.includes(day) ? "selected" : ""} onClick={() => toggleDay("stabiDays", day)} key={`stabi-${day}`}><b>{day.slice(0, 2)}</b><small>{day}</small></button>)}</div></div>}
                </section>

                <section className="onboarding-week-section">
                  <div className="onboarding-section-title"><div><span>03</span><h2>Feste Termine</h2></div><small>Optional: Lauftreff, Fußball, Radgruppe oder andere wiederkehrende Einheiten.</small></div>
                  {sortedCommitments.length > 0 && <div className="onboarding-commitment-list">
                    {sortedCommitments.map((item) => <article key={item.id}><div><span>{item.weekday.slice(0, 2)}</span><p><strong>{item.name}</strong><small>{item.weekday} · {item.time || "flexibel"} · {sportLabel(item.sport)}</small></p></div><div className="onboarding-commitment-actions"><button type="button" onClick={() => editCommitment(item)}>Bearbeiten</button><button type="button" onClick={() => removeCommitment(item.id)} aria-label={`${item.name} entfernen`}>×</button></div></article>)}
                  </div>}
                  {!commitmentDraft && <button type="button" className="onboarding-add-commitment" onClick={openCommitment}>+ Festen Termin hinzufügen</button>}
                  {commitmentDraft && <div className="onboarding-commitment-editor">
                    <div className="onboarding-form-grid">
                      <label className="wide-field">Name
                        <input autoFocus value={commitmentDraft.name} placeholder="z. B. Lauftreff" onChange={(event) => setCommitmentDraft({ ...commitmentDraft, name: event.target.value })} />
                      </label>
                      <label>Sportart
                        <select value={commitmentDraft.sport} onChange={(event) => setCommitmentDraft({ ...commitmentDraft, sport: event.target.value })}>{SPORT_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select>
                      </label>
                      <label>Wochentag
                        <select value={commitmentDraft.weekday} onChange={(event) => setCommitmentDraft({ ...commitmentDraft, weekday: event.target.value })}>{WEEKDAYS.map((day) => <option key={day}>{day}</option>)}</select>
                      </label>
                      <label>Uhrzeit
                        <input type="time" value={commitmentDraft.time} onChange={(event) => setCommitmentDraft({ ...commitmentDraft, time: event.target.value })} />
                      </label>
                      <label>Dauer in Minuten
                        <input type="number" min="0" max="600" value={commitmentDraft.durationMinutes} onChange={(event) => setCommitmentDraft({ ...commitmentDraft, durationMinutes: Number(event.target.value) })} />
                      </label>
                      <label>Übliche Distanz in km <span>optional</span>
                        <input type="number" min="0" max="300" step="0.1" value={commitmentDraft.distanceKm} onChange={(event) => setCommitmentDraft({ ...commitmentDraft, distanceKm: Number(event.target.value) })} />
                      </label>
                      <label>Belastung
                        <select value={commitmentDraft.load} onChange={(event) => setCommitmentDraft({ ...commitmentDraft, load: event.target.value })}>{LOAD_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select>
                      </label>
                    </div>
                    <div className="onboarding-conflict-options">
                      <strong>Wenn an diesem Tag schon Training geplant ist:</strong>
                      <div>{CONFLICT_MODE_OPTIONS.map((option) => <button type="button" className={commitmentDraft.conflictMode === option.value ? "selected" : ""} onClick={() => setCommitmentDraft({ ...commitmentDraft, conflictMode: option.value })} key={option.value}><b>{option.label}</b><small>{option.description}</small></button>)}</div>
                    </div>
                    {commitmentMessage && <p className="onboarding-inline-error" role="alert">{commitmentMessage}</p>}
                    <div className="onboarding-editor-actions"><button type="button" onClick={() => setCommitmentDraft(null)}>Abbrechen</button><button type="button" className="primary" onClick={saveCommitment}>Termin übernehmen</button></div>
                  </div>}
                </section>
              </>
            )}

            {currentStep.key === "summary" && (
              <>
                <div className="onboarding-heading">
                  <p className="eyebrow">Startklar</p>
                  <h1>Das ist dein Ausgangspunkt.</h1>
                  <p>Prüfe kurz, was übernommen wird. Danach landest du im Briefing – ohne automatisch erzeugte Woche.</p>
                </div>
                <div className="onboarding-summary-grid">
                  <article><span>Du</span><strong>{draft.displayName}</strong><p>{draft.birthDate ? `Geburtsdatum ${new Date(`${draft.birthDate}T12:00:00`).toLocaleDateString("de-DE")}` : "Körperdaten nur soweit angegeben"}</p></article>
                  <article><span>Ausgangslage</span><strong>{level?.label || experienceLabel(draft.experienceLevel)}</strong><p>{draft.currentRunsPerWeek} Läufe · ca. {draft.weeklyKm} km pro Woche · Longrun {draft.longestRunKm} km</p></article>
                  <article><span>Ziel</span><strong>{missionSummary}</strong><p>{draft.missionMode === "event" && draft.missionDate ? new Date(`${draft.missionDate}T12:00:00`).toLocaleDateString("de-DE") : "Kann später jederzeit ergänzt werden"}</p></article>
                  <article><span>Wochenrahmen</span><strong>Bis zu {draft.targetRunCount} Läufe</strong><p>{draft.runDays.map((day) => day.slice(0, 2)).join(" · ")}{draft.stabiCount ? ` · ${draft.stabiCount} × Stabi` : ""}</p></article>
                  <article className="wide-summary"><span>Datenquelle</span><strong>Intervals.icu verbunden</strong><p>{draft.intervalsImportedActivities ? `${draft.intervalsImportedActivities} Aktivitäten beim Erstimport geladen` : "Verbindung geprüft; der Import läuft nach dem Start erneut an"}</p></article>
                  <article className="wide-summary"><span>Feste Termine</span><strong>{draft.recurringCommitments.length ? `${draft.recurringCommitments.length} berücksichtigt` : "Keine hinterlegt"}</strong><p>{draft.recurringCommitments.length ? sortedCommitments.map((item) => `${item.weekday.slice(0, 2)} ${item.name}`).join(" · ") : "Du kannst sie später unter Settings → Training & Planung ergänzen."}</p></article>
                </div>
                <label className="onboarding-progress-toggle">
                  <input type="checkbox" checked={draft.coachProgressionEnabled} onChange={(event) => update("coachProgressionEnabled", event.target.checked)} />
                  <span><b>Behutsame Entwicklungsvorschläge erlauben</b><small>Dein Coach darf später anhand deiner echten Daten einen passenden nächsten Rahmen vorschlagen. Er übernimmt ihn niemals automatisch und ändert keine aktive Woche.</small></span>
                </label>
                <div className="onboarding-final-note">
                  <div><span>1</span><p><b>Keine automatische Planung</b><small>Du startest jede Wochenberechnung selbst.</small></p></div>
                  <div><span>2</span><p><b>Aktive Wochen bleiben stabil</b><small>Änderungen erfolgen nur nach deiner Auswahl.</small></p></div>
                  <div><span>3</span><p><b>Alles bleibt anpassbar</b><small>Profil, Ziel und Termine findest du später in Settings und Mission.</small></p></div>
                </div>
              </>
            )}
          </div>

          <footer className="onboarding-footer">
            <div>
              {step > 0 && <button type="button" className="onboarding-back" onClick={back}>← Zurück</button>}
              <span>Schritt {step + 1} von {ONBOARDING_STEPS.length}</span>
            </div>
            {message && <p role="alert">{message}</p>}
            <button type="button" className="primary onboarding-next" onClick={next} disabled={intervalsBusy}>{step === ONBOARDING_STEPS.length - 1 ? "Jetzt starten" : "Weiter"} <span>→</span></button>
          </footer>
        </section>
      </section>
    </main>
  );
}
