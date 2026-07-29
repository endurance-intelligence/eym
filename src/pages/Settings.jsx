import { useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { Card, PageTitle } from "../components/UI";
import Equipment from "./Equipment";
import { downloadCalendar } from "../services/calendar";
import { downloadStateBackup, readStateBackup, resetState } from "../services/storage";
import { defaultState } from "../data/defaults";
import { mergeGarminActivities, readGarminExport } from "../services/garminImport";
import { calendarSubscriptionUrl } from "../services/supabase";
import {
  connectIntervalsApiKey,
  disconnectIntervals,
  fetchIntervalsStatus,
  intervalsOnlineReady,
} from "../services/intervals";
import { normalizeAppearance, resolveTheme, THEME_PRESET_LIST } from "../services/theme";
import { athleteProfileAssessment, EXPERIENCE_OPTIONS, experienceLabel } from "../services/athleteProfile";
import {
  CONFLICT_MODE_OPTIONS,
  DEFAULT_REPLACEMENT_SPORTS,
  LOAD_OPTIONS,
  SPORT_OPTIONS,
  WEEKDAYS,
  emptyCommitment,
  normalizeCommitment,
  sortCommitments,
  sportLabel,
} from "../services/configuration";
import {
  resolveSettingsSection,
  SETTINGS_SECTIONS,
  settingsSectionSearchParams,
} from "../services/navigation";

function numberOrBlank(value) {
  return value === "" || value === null || value === undefined ? "" : Number(value);
}

export default function Settings() {
  const { state, setState, session, cloudStatus, cloudUpdatedAt, cloudError, imageStorageStatus, imageStorageMessage, retryImageMigration, calendarToken, intervalsSyncStatus, syncIntervalsNow, uploadLocalState, reloadCloudState, logout } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const section = resolveSettingsSection(searchParams.get("section"));
  const [calendarMessage, setCalendarMessage] = useState("");
  const [garminBusy, setGarminBusy] = useState(false);
  const [garminPreview, setGarminPreview] = useState(null);
  const [garminMessage, setGarminMessage] = useState("");
  const [intervalsMessage, setIntervalsMessage] = useState("");
  const [intervalsBusy, setIntervalsBusy] = useState(false);
  const [intervalsApiKey, setIntervalsApiKey] = useState("");
  const [showIntervalsApiKey, setShowIntervalsApiKey] = useState(false);
  const [editIntervalsApiKey, setEditIntervalsApiKey] = useState(false);
  const [commitmentDraft, setCommitmentDraft] = useState(null);
  const [commitmentMessage, setCommitmentMessage] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [backupMessage, setBackupMessage] = useState("");
  const garminInput = useRef(null);
  const backupInput = useRef(null);

  const commitments = sortCommitments(
    Array.isArray(state.planner?.recurringCommitments) ? state.planner.recurringCommitments : [],
  );
  const hasMigratedCommitments = commitments.some((item) => item.migratedFrom);
  const replacementSports = state.planner?.replacementSports || DEFAULT_REPLACEMENT_SPORTS;
  const appearance = normalizeAppearance(state.appearance);
  const activeTheme = resolveTheme(appearance);
  const customTheme = resolveTheme({ ...appearance, themeId: "custom" });
  const athleteAssessment = athleteProfileAssessment(state);

  function selectSection(key) {
    setSearchParams(settingsSectionSearchParams(searchParams, key), { replace: true });
  }

  function updateAppearance(patch) {
    setState((current) => ({
      ...current,
      appearance: normalizeAppearance({ ...current.appearance, ...patch }),
    }));
  }

  function updateProfile(field, value) {
    setState((current) => ({
      ...current,
      profile: { ...current.profile, [field]: value },
    }));
  }

  function acceptProfileAssessment({ includeRunFramework = false } = {}) {
    setState((current) => ({
      ...current,
      profile: {
        ...current.profile,
        experienceLevel: athleteAssessment.levelSuggestion || current.profile?.experienceLevel || athleteAssessment.observedLevel,
        selfReportedRunsPerWeek: includeRunFramework && athleteAssessment.suggestedRunsPerWeek
          ? athleteAssessment.suggestedRunsPerWeek
          : current.profile?.selfReportedRunsPerWeek,
        progressionAcceptedAt: new Date().toISOString(),
      },
      planner: includeRunFramework && athleteAssessment.suggestedRunsPerWeek
        ? { ...current.planner, targetRunCount: athleteAssessment.suggestedRunsPerWeek }
        : current.planner,
    }));
    setProfileMessage(includeRunFramework && athleteAssessment.suggestedRunsPerWeek
      ? `Neuer Rahmen übernommen: bis zu ${athleteAssessment.suggestedRunsPerWeek} Läufe pro Woche dürfen bei künftigen Planungen vorgeschlagen werden.`
      : "Datenbasierte Einstufung übernommen. Bestehende Wochenpläne bleiben unverändert.");
  }

  function updatePlanner(patch) {
    setState((current) => ({
      ...current,
      planner: { ...current.planner, ...patch },
    }));
  }

  function saveCommitment(event) {
    event.preventDefault();
    const normalized = normalizeCommitment(commitmentDraft);
    if (!normalized.name) return;
    updatePlanner({
      recurringCommitments: commitments.some((item) => item.id === normalized.id)
        ? commitments.map((item) => item.id === normalized.id ? normalized : item)
        : [...commitments, normalized],
    });
    setCommitmentMessage("Fixtermin gespeichert. Der bestehende Wochenplan bleibt unverändert. Die Änderung greift bei der nächsten Planung oder wenn du die betroffenen Tage unter „Woche anpassen“ neu planst.");
    setCommitmentDraft(null);
  }

  function toggleCommitment(id) {
    updatePlanner({
      recurringCommitments: commitments.map((item) => item.id === id ? { ...item, enabled: item.enabled === false } : item),
    });
  }

  function deleteCommitment(id) {
    updatePlanner({ recurringCommitments: commitments.filter((item) => item.id !== id) });
    if (commitmentDraft?.id === id) setCommitmentDraft(null);
  }

  function toggleReplacementSport(sport) {
    const next = replacementSports.includes(sport)
      ? replacementSports.filter((value) => value !== sport)
      : [...replacementSports, sport];
    updatePlanner({ replacementSports: next });
  }

  async function checkIntervals() {
    setIntervalsBusy(true);
    setIntervalsMessage("");
    try {
      const status = await fetchIntervalsStatus();
      setState((current) => ({
        ...current,
        intervals: {
          ...current.intervals,
          configured: Boolean(status.configured),
          connected: Boolean(status.connected),
          connectionMode: status.connectionMode || null,
          connectedAt: status.connectedAt || current.intervals?.connectedAt || null,
          storageReady: status.storageReady ?? current.intervals?.storageReady ?? null,
          credentialIssue: status.credentialIssue || null,
        },
      }));
      setIntervalsMessage(status.message || (status.connected ? "Intervals.icu ist verbunden." : "Intervals.icu ist noch nicht eingerichtet."));
    } catch (error) {
      setIntervalsMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIntervalsBusy(false);
    }
  }

  async function syncIntervals() {
    setIntervalsMessage("");
    try {
      const result = await syncIntervalsNow();
      setIntervalsMessage(`${result.added || 0} neue Aktivitäten geladen, ${result.duplicates || 0} vorhandene Einheiten ergänzt.`);
    } catch (error) {
      setIntervalsMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function saveIntervalsConnection() {
    const apiKey = intervalsApiKey.trim();
    if (!apiKey) {
      setIntervalsMessage("Bitte füge deinen persönlichen API-Key ein.");
      return;
    }
    setIntervalsBusy(true);
    setIntervalsMessage("");
    try {
      const connection = await connectIntervalsApiKey(apiKey);
      setIntervalsApiKey("");
      setEditIntervalsApiKey(false);
      setState((current) => ({
        ...current,
        intervals: {
          ...current.intervals,
          configured: true,
          connected: true,
          connectionMode: connection.connectionMode || "personal",
          connectedAt: connection.connectedAt || new Date().toISOString(),
          storageReady: true,
          credentialIssue: null,
        },
      }));
      const result = await syncIntervalsNow();
      setIntervalsMessage(`Verbunden. ${result.added || 0} neue Aktivitäten geladen, ${result.duplicates || 0} vorhandene Einheiten ergänzt.`);
    } catch (error) {
      setIntervalsMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIntervalsBusy(false);
    }
  }

  async function removeIntervalsConnection() {
    if (!window.confirm("Intervals.icu-Verbindung wirklich trennen? Bereits importierte Aktivitäten bleiben erhalten.")) return;
    setIntervalsBusy(true);
    setIntervalsMessage("");
    try {
      await disconnectIntervals();
      setIntervalsApiKey("");
      setEditIntervalsApiKey(false);
      setState((current) => ({
        ...current,
        intervals: {
          ...current.intervals,
          configured: false,
          connected: false,
          connectionMode: null,
          connectedAt: null,
          storageReady: true,
          credentialIssue: null,
        },
      }));
      setIntervalsMessage("Intervals.icu wurde getrennt. Bereits importierte Aktivitäten bleiben in deinem Konto.");
    } catch (error) {
      setIntervalsMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIntervalsBusy(false);
    }
  }

  async function previewGarmin(file) {
    if (!file) return;
    setGarminBusy(true);
    setGarminPreview(null);
    setGarminMessage("Garmin-Export wird gelesen … Das kann bei der großen ZIP kurz dauern.");
    try {
      const preview = await readGarminExport(file, state.garmin?.importFrom || "2025-01-01");
      setGarminPreview(preview);
      setGarminMessage(`${preview.total} Aktivitäten vom ${preview.firstDate} bis ${preview.lastDate} gefunden.`);
    } catch (error) {
      setGarminMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setGarminBusy(false);
      if (garminInput.current) garminInput.current.value = "";
    }
  }

  function importGarmin() {
    if (!garminPreview) return;
    const merged = mergeGarminActivities(state.activities, garminPreview.activities);
    setState((current) => ({
      ...current,
      activities: merged.activities,
      garmin: {
        ...current.garmin,
        lastImportAt: new Date().toISOString(),
        fileName: garminPreview.fileName,
        imported: merged.added,
        duplicates: merged.duplicates,
      },
    }));
    setGarminMessage(`${merged.added} Aktivitäten importiert, ${merged.duplicates} Duplikate mit vorhandenen Daten zusammengeführt.`);
    setGarminPreview(null);
  }

  async function restoreBackup(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBackupMessage("");
    try {
      const backup = await readStateBackup(file, defaultState);
      const created = backup.createdAt ? new Date(backup.createdAt).toLocaleString("de-DE") : "unbekannt";
      const summary = `${backup.state.activities.length} Aktivitäten, ${backup.state.plan.length} Planeinträge und ${backup.state.reviews ? Object.keys(backup.state.reviews).length : 0} Reviews`;
      if (!window.confirm(`App-Sicherung vom ${created} wiederherstellen?\n\n${summary}\n\nDer aktuelle lokale Stand wird ersetzt und anschließend synchronisiert.`)) return;
      setState(backup.state);
      setBackupMessage("Sicherung wiederhergestellt. Der Stand wird jetzt mit der Cloud synchronisiert.");
    } catch (error) {
      setBackupMessage(error instanceof Error ? error.message : String(error));
    }
  }

  const calendarUrl = calendarToken ? calendarSubscriptionUrl(calendarToken) : "";
  const cloudStatusLabel = { local: "Nur lokal", loading: "Cloud wird geladen …", saving: "Wird gespeichert …", synced: "Synchronisiert", conflict: "Neuerer Stand auf einem anderen Gerät", error: "Synchronisierung fehlgeschlagen" }[cloudStatus] || cloudStatus;

  return <>
    <PageTitle eyebrow="Settings" title="Deine Konfiguration" />
    <div className="section-tabs settings-tabs" role="tablist" aria-label="Einstellungsbereiche">
      {SETTINGS_SECTIONS.map(([key, label]) => <button type="button" role="tab" aria-selected={section === key} className={section === key ? "selected" : ""} onClick={() => selectSection(key)} key={key}>{label}</button>)}
    </div>

    {section === "overview" && <div className="grid settings-overview-grid">
      <Card className="settings-overview-card">
        <p className="eyebrow">Profil</p><h2>{state.profile?.displayName || "Noch ohne Anzeigename"}</h2>
        <p className="muted">{state.profile?.birthDate ? `Geburtsdatum ${new Date(`${state.profile.birthDate}T12:00:00`).toLocaleDateString("de-DE")}` : "Geburtsdatum optional"}{state.profile?.heightCm ? ` · ${state.profile.heightCm} cm` : ""}{state.profile?.weightKg ? ` · ${state.profile.weightKg} kg` : ""}</p>
        <button type="button" onClick={() => selectSection("profile")}>Profil öffnen</button>
      </Card>
      <Card className="settings-overview-card">
        <p className="eyebrow">Training & Planung</p><h2>{commitments.length} Fixtermine</h2>
        <p className="muted">{commitments.length ? commitments.map((item) => `${item.weekday.slice(0, 2)} · ${item.name}`).join(" · ") : "Noch keine wiederkehrenden Einheiten"}</p>
        <button type="button" onClick={() => selectSection("planning")}>Planungsregeln öffnen</button>
      </Card>
      <Card className="settings-overview-card">
        <p className="eyebrow">Ausrüstung</p><h2>{(state.equipment || []).filter((item) => !item.archived).length} aktiv</h2>
        <p className="muted">Schuhe, Laufband, Rudergerät und weitere Ausrüstung an einem Ort verwalten.</p>
        <button type="button" onClick={() => selectSection("equipment")}>Ausrüstung öffnen</button>
      </Card>
      <Card className="settings-overview-card settings-overview-theme">
        <p className="eyebrow">Darstellung</p><h2>{activeTheme.label}</h2>
        <div className="theme-overview-swatches"><span style={{ background: activeTheme.primary }} /><span style={{ background: activeTheme.secondary }} /></div>
        <p className="muted">Persönliches Ambient-Theme · Glow {appearance.glowEnabled ? `${appearance.glowIntensity} %` : "aus"}</p>
        <button type="button" onClick={() => selectSection("appearance")}>Theme anpassen</button>
      </Card>
      <Card className="settings-overview-card">
        <p className="eyebrow">Verbindungen</p><h2>{state.intervals?.connected ? "Intervals.icu verbunden" : "Intervals.icu noch offen"}</h2>
        <p className="muted">Cloud: {cloudStatusLabel}{state.intervals?.lastSyncAt ? ` · letzter Aktivitäts-Sync ${new Date(state.intervals.lastSyncAt).toLocaleDateString("de-DE")}` : ""}</p>
        <button type="button" onClick={() => selectSection("connections")}>Verbindungen öffnen</button>
      </Card>
      <Card className="settings-overview-card">
        <p className="eyebrow">Daten & Kalender</p><h2>{calendarToken ? "Kalenderabo aktiv" : "Kalenderabo vorbereiten"}</h2>
        <p className="muted">{state.garmin?.lastImportAt ? `Garmin-Import: ${new Date(state.garmin.lastImportAt).toLocaleDateString("de-DE")}` : "Garmin-Historie kann als Backup importiert werden."}</p>
        <button type="button" onClick={() => selectSection("data")}>Datenbereich öffnen</button>
      </Card>
    </div>}

    {section === "equipment" && <Equipment embedded />}

    {section === "profile" && <div className="grid">
      <Card className="wide settings-profile-card">
        <div className="settings-section-heading">
          <div><p className="eyebrow">Athletenprofil</p><h2>Persönliche Grundlage</h2></div>
          {hasMigratedCommitments && <span className="settings-migration-badge">Bestehende Daten übernommen</span>}
        </div>
        <p className="muted">Deine bisherigen Pläne, Missionen und Aktivitäten bleiben erhalten. Die Angaben sind optional und verbessern später die individuelle Belastungssteuerung.</p>
        <div className="form-grid settings-profile-grid">
          <label>Anzeigename<input value={state.profile?.displayName || ""} placeholder="z. B. Daniel" onChange={(event) => updateProfile("displayName", event.target.value)} /></label>
          <label>Geburtsdatum<input type="date" value={state.profile?.birthDate || ""} onChange={(event) => updateProfile("birthDate", event.target.value)} /></label>
          <label>Größe in cm<input type="number" min="100" max="230" value={state.profile?.heightCm ?? ""} placeholder="optional" onChange={(event) => updateProfile("heightCm", numberOrBlank(event.target.value))} /></label>
          <label>Gewicht in kg<input type="number" min="30" max="250" step="0.1" value={state.profile?.weightKg ?? ""} placeholder="optional" onChange={(event) => updateProfile("weightKg", numberOrBlank(event.target.value))} /></label>
        </div>

        <section className="athlete-experience-section">
          <div><p className="eyebrow">Selbsteinschätzung</p><h3>Wo startest du?</h3><p className="muted">Diese Auswahl ist der Startwert. Dein Coach bewertet deine tatsächliche Gewöhnung getrennt und verändert niemals ungefragt einen Plan.</p></div>
          <div className="athlete-experience-grid" role="radiogroup" aria-label="Trainingserfahrung">
            {EXPERIENCE_OPTIONS.map((option) => <button type="button" role="radio" aria-checked={(state.profile?.experienceLevel || "beginner") === option.value} className={(state.profile?.experienceLevel || "beginner") === option.value ? "selected" : ""} onClick={() => { updateProfile("experienceLevel", option.value); setProfileMessage(""); }} key={option.value}><span>{option.label}</span><strong>{option.title}</strong><small>{option.description}</small></button>)}
          </div>
          <div className="athlete-self-report-grid">
            <label><span>Läufe pro Woche</span><input type="number" min="0" max="7" step="0.5" value={state.profile?.selfReportedRunsPerWeek ?? ""} onChange={(event) => updateProfile("selfReportedRunsPerWeek", numberOrBlank(event.target.value))} /><small>Aktueller Durchschnitt</small></label>
            <label><span>Kilometer pro Woche</span><input type="number" min="0" max="300" step="0.1" value={state.profile?.selfReportedWeeklyKm ?? ""} onChange={(event) => updateProfile("selfReportedWeeklyKm", numberOrBlank(event.target.value))} /><small>Ungefährer 6-Wochen-Schnitt</small></label>
            <label><span>Längster aktueller Lauf</span><input type="number" min="0" max="250" step="0.1" value={state.profile?.selfReportedLongestRunKm ?? ""} onChange={(event) => updateProfile("selfReportedLongestRunKm", numberOrBlank(event.target.value))} /><small>Innerhalb der letzten 8 Wochen</small></label>
          </div>
          <label className="athlete-progress-toggle"><input type="checkbox" checked={state.profile?.coachProgressionEnabled !== false} onChange={(event) => updateProfile("coachProgressionEnabled", event.target.checked)} /><span><b>Entwicklungsvorschläge erlauben</b><small>Dein Coach darf einen höheren Rahmen vorschlagen, übernimmt ihn aber niemals automatisch.</small></span></label>
        </section>

        <section className={`athlete-detected-card confidence-${athleteAssessment.confidence}`}>
          <div className="athlete-detected-heading"><div><p className="eyebrow">Vom Coach erkannt</p><h3>{athleteAssessment.observedLabel} · Belastungsverträglichkeit {athleteAssessment.tolerance.label}</h3><p>{athleteAssessment.specializationLabel}-orientiert · Höhenmeter-Erfahrung {athleteAssessment.elevation.label}</p></div><span>{athleteAssessment.confidence === "high" ? "Hohe Datensicherheit" : athleteAssessment.confidence === "medium" ? "Mittlere Datensicherheit" : "Noch wenig Daten"}</span></div>
          <div className="athlete-detected-metrics"><div><small>Lauffrequenz</small><strong>{athleteAssessment.metrics.runsPerWeek.toFixed(1)} / Woche</strong></div><div><small>Wochenumfang</small><strong>{athleteAssessment.metrics.weeklyKm.toFixed(0)} km</strong></div><div><small>Längster Lauf</small><strong>{athleteAssessment.metrics.longestRun.toFixed(1)} km</strong></div><div><small>Laufserie</small><strong>{athleteAssessment.metrics.maxStreak} Tage</strong></div><div><small>Höhenmeter</small><strong>{athleteAssessment.metrics.weeklyElevation.toFixed(0)} hm/Woche</strong></div></div>
          <p className="athlete-progression-focus"><b>Nächster sinnvoller Fortschritt:</b> {athleteAssessment.progressionFocus}</p>
          <details><summary>Grundlage der Einstufung</summary><ul>{athleteAssessment.evidence.map((item) => <li key={item}>{item}</li>)}</ul></details>
          {(athleteAssessment.levelSuggestion || athleteAssessment.suggestedRunsPerWeek) && state.profile?.coachProgressionEnabled !== false && <div className="athlete-progression-suggestion"><div><strong>Dein Profil hat sich entwickelt</strong><span>{athleteAssessment.levelSuggestion ? `${experienceLabel(state.profile?.experienceLevel)} → ${experienceLabel(athleteAssessment.levelSuggestion)}. ` : ""}{athleteAssessment.suggestedRunsPerWeek ? `Künftige Planungen könnten bis zu ${athleteAssessment.suggestedRunsPerWeek} Läufe pro Woche anbieten.` : ""}</span><small>Nur neue Wochen sind betroffen. Aktive Pläne bleiben stabil.</small></div><div>{athleteAssessment.levelSuggestion && <button type="button" onClick={() => acceptProfileAssessment()}>Einstufung übernehmen</button>}{athleteAssessment.suggestedRunsPerWeek && <button type="button" className="secondary" onClick={() => acceptProfileAssessment({ includeRunFramework: true })}>Neuen Rahmen übernehmen</button>}</div></div>}
          {profileMessage && <div className="settings-save-message">✓ {profileMessage}</div>}
        </section>
      </Card>
    </div>}

    {section === "planning" && <div className="grid">
      <Card className="wide settings-commitments-card">
        <div className="settings-section-heading">
          <div><p className="eyebrow">Feste Termine</p><h2>Wiederkehrende Einheiten</h2></div>
          <button type="button" onClick={() => { setCommitmentMessage(""); setCommitmentDraft(emptyCommitment()); }}>+ Termin hinzufügen</button>
        </div>
        <p className="muted">Dein Coach berücksichtigt diese Termine bei jeder neuen oder neu berechneten Wochenplanung.{hasMigratedCommitments ? " Bestehende Fixtermine wurden automatisch übernommen." : " Neue Termine kannst du frei anlegen."}</p>
        <div className="settings-plan-scope-note"><strong>Aktuelle Woche:</strong><span>Das Speichern hier ändert den bestehenden Plan nicht. Kurzfristige Änderungen erledigst du im Wochenplan über „Woche anpassen“.</span></div>
        {commitmentMessage && <div className="settings-save-message">✓ {commitmentMessage}</div>}
        {commitments.length ? <div className="settings-commitment-list">
          {commitments.map((item) => <article className={item.enabled === false ? "disabled" : ""} key={item.id}>
            <button type="button" className={`commitment-toggle ${item.enabled === false ? "off" : "on"}`} onClick={() => toggleCommitment(item.id)} aria-label={`${item.name} ${item.enabled === false ? "aktivieren" : "deaktivieren"}`}><span /></button>
            <div className="commitment-copy"><strong>{item.name}</strong><span>{item.weekday} · {item.time || "flexibel"} · {sportLabel(item.sport)}</span><small>{item.durationMinutes ? `${item.durationMinutes} min` : "Dauer offen"}{item.distanceKm ? ` · ${item.distanceKm} km` : ""} · Belastung {LOAD_OPTIONS.find((entry) => entry.value === item.load)?.label || "Mittel"}</small><span className={`commitment-behavior ${item.conflictMode || "combine"}`}>{CONFLICT_MODE_OPTIONS.find((entry) => entry.value === (item.conflictMode || "combine"))?.label || "Als zusätzliche Einheit einplanen"}</span></div>
            <div className="commitment-actions"><button type="button" className="secondary" onClick={() => { setCommitmentMessage(""); setCommitmentDraft({ ...item }); }}>Bearbeiten</button><button type="button" className="secondary" onClick={() => deleteCommitment(item.id)}>Löschen</button></div>
          </article>)}
        </div> : <div className="settings-empty-state">Noch keine festen Termine. Neue Wochen werden nur aus Verfügbarkeit, Mission und Belastung geplant.</div>}

        {commitmentDraft && <form className="settings-commitment-form" onSubmit={saveCommitment}>
          <div className="settings-section-heading"><div><p className="eyebrow">Termin bearbeiten</p><h3>{commitments.some((item) => item.id === commitmentDraft.id) ? commitmentDraft.name || "Fixtermin" : "Neuer Fixtermin"}</h3></div><button type="button" className="secondary" onClick={() => setCommitmentDraft(null)}>Schließen</button></div>
          <label className="settings-active-toggle"><input type="checkbox" checked={commitmentDraft.enabled !== false} onChange={(event) => setCommitmentDraft({ ...commitmentDraft, enabled: event.target.checked })} /><span><b>Termin regelmäßig berücksichtigen</b><small>Kann später nur für eine einzelne Woche ausgesetzt werden.</small></span></label>
          <div className="form-grid settings-commitment-form-grid">
            <label>Name<input required value={commitmentDraft.name} placeholder="z. B. Lauftreff" onChange={(event) => setCommitmentDraft({ ...commitmentDraft, name: event.target.value })} /></label>
            <label>Sportart<select value={commitmentDraft.sport} onChange={(event) => setCommitmentDraft({ ...commitmentDraft, sport: event.target.value })}>{SPORT_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
            <label>Wochentag<select value={commitmentDraft.weekday} onChange={(event) => setCommitmentDraft({ ...commitmentDraft, weekday: event.target.value })}>{WEEKDAYS.map((day) => <option key={day}>{day}</option>)}</select></label>
            <label>Uhrzeit<input type="time" value={commitmentDraft.time} onChange={(event) => setCommitmentDraft({ ...commitmentDraft, time: event.target.value })} /></label>
            <label>Dauer in Minuten<input type="number" min="0" value={commitmentDraft.durationMinutes} onChange={(event) => setCommitmentDraft({ ...commitmentDraft, durationMinutes: Number(event.target.value) })} /></label>
            <label>Übliche Distanz in km<input type="number" min="0" step="0.1" value={commitmentDraft.distanceKm} onChange={(event) => setCommitmentDraft({ ...commitmentDraft, distanceKm: Number(event.target.value) })} /></label>
            <label>Belastung<select value={commitmentDraft.load} onChange={(event) => setCommitmentDraft({ ...commitmentDraft, load: event.target.value })}>{LOAD_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
          </div>
          <section className="settings-conflict-section"><div><p className="eyebrow">Planungsverhalten</p><h4>Was soll passieren, wenn an diesem Tag schon Training geplant ist?</h4></div><div className="settings-conflict-options">{CONFLICT_MODE_OPTIONS.map((option) => <label className={commitmentDraft.conflictMode === option.value ? "selected" : ""} key={option.value}><input type="radio" name="commitment-conflict-mode" value={option.value} checked={commitmentDraft.conflictMode === option.value} onChange={() => setCommitmentDraft({ ...commitmentDraft, conflictMode: option.value })} /><span><b>{option.label}</b><small>{option.description}</small></span></label>)}</div></section>
          <div className="settings-form-footer"><span>Speichert die Grundregel. Der laufende Wochenplan bleibt unangetastet.</span><button className="primary" type="submit">Fixtermin speichern</button></div>
        </form>}
      </Card>

      <Card className="wide planner-principles-card"><p className="eyebrow">Planer-Kern</p><h2>Wissenschaftlich planen, menschlich entscheiden</h2><div className="planner-principle-grid"><span><b>Ziel zuerst</b><small>Hauptevent und Zwischenziele bestimmen die Trainingsmethodik.</small></span><span><b>Individuell bewerten</b><small>Belastung wird relativ zu deiner Gewöhnung, nicht zum Durchschnitt bewertet.</small></span><span><b>Aktive Woche schützen</b><small>Keine automatische Neuberechnung oder ungefragte Änderung.</small></span><span><b>Vorschläge statt Befehle</b><small>Coach-Hinweise sind begründet und immer optional.</small></span></div></Card>

      <Card className="wide settings-replacements-card"><p className="eyebrow">Woche anpassen</p><h2>Erlaubte Ersatzarten</h2><p className="muted">Diese Sportarten werden angeboten, wenn du eine einzelne Einheit ersetzen möchtest. Eigene Fixtermine erscheinen zusätzlich automatisch.</p><div className="settings-sport-picker">{SPORT_OPTIONS.filter((option) => option.value !== "other").map((option) => <button type="button" className={replacementSports.includes(option.value) ? "selected" : ""} onClick={() => toggleReplacementSport(option.value)} key={option.value}>{option.label}</button>)}</div></Card>
    </div>}

    {section === "appearance" && <div className="grid appearance-settings-grid">
      <Card className="wide appearance-live-card">
        <div className="appearance-live-copy">
          <p className="eyebrow">Live-Vorschau</p>
          <h2>{activeTheme.label}</h2>
          <p className="muted">Die Auswahl wirkt sofort auf Navigation, Karten, Buttons, Diagramme und Highlights. Sie wird mit deinem Konto synchronisiert.</p>
        </div>
        <div className="ambient-preview" style={{ "--preview-primary": activeTheme.primary, "--preview-secondary": activeTheme.secondary, "--preview-bg": activeTheme.background, "--preview-card": activeTheme.card }}>
          <div className="ambient-preview-lights"><i /><i /></div>
          <div className="ambient-preview-sidebar"><b>EI</b><span /><span className="active" /><span /></div>
          <div className="ambient-preview-content"><small>TAGESBRIEFING</small><strong>Dein Training.</strong><div><span>HEUTE</span><b>Alles im Blick</b></div></div>
        </div>
      </Card>

      <Card className="wide">
        <p className="eyebrow">Ambient Presets</p><h2>Stimmung auswählen</h2>
        <p className="muted">Der dunkle Aufbau bleibt erhalten. Akzente, Flächen und der subtile Lichtschein wechseln passend zum Theme.</p>
        <div className="theme-preset-grid">
          {THEME_PRESET_LIST.map((preset) => <button type="button" className={`theme-preset-card ${appearance.themeId === preset.id ? "selected" : ""}`} onClick={() => updateAppearance({ themeId: preset.id })} key={preset.id}>
            <span className="theme-preset-visual" style={{ background: `linear-gradient(135deg, ${preset.background}, ${preset.card})` }}><i style={{ background: preset.primary }} /><i style={{ background: preset.secondary }} /></span>
            <span className="theme-preset-copy"><b>{preset.label}</b><small>{preset.description}</small></span>
            {appearance.themeId === preset.id && <em>Aktiv</em>}
          </button>)}
          <button type="button" className={`theme-preset-card ${appearance.themeId === "custom" ? "selected" : ""}`} onClick={() => updateAppearance({ themeId: "custom" })}>
            <span className="theme-preset-visual" style={{ background: `linear-gradient(135deg, ${customTheme.background}, ${customTheme.card})` }}><i style={{ background: appearance.customPrimary }} /><i style={{ background: appearance.customSecondary }} /></span>
            <span className="theme-preset-copy"><b>Custom</b><small>Deine eigene Ambientebeleuchtung.</small></span>
            {appearance.themeId === "custom" && <em>Aktiv</em>}
          </button>
        </div>
      </Card>

      <Card className="appearance-custom-card">
        <p className="eyebrow">Custom Theme</p><h2>Eigene Farben</h2>
        <p className="muted">Primärfarbe steuert Navigation und Hauptakzente. Die zweite Farbe erzeugt den Ambient-Kontrast.</p>
        <div className="appearance-color-fields">
          <label><span>Primärfarbe</span><input type="color" value={appearance.customPrimary} onChange={(event) => updateAppearance({ themeId: "custom", customPrimary: event.target.value })} /><code>{appearance.customPrimary}</code></label>
          <label><span>Sekundärfarbe</span><input type="color" value={appearance.customSecondary} onChange={(event) => updateAppearance({ themeId: "custom", customSecondary: event.target.value })} /><code>{appearance.customSecondary}</code></label>
        </div>
        <button type="button" className="primary" onClick={() => updateAppearance({ themeId: "custom" })}>Custom Theme verwenden</button>
      </Card>

      <Card className="appearance-glow-card">
        <p className="eyebrow">Lichtintensität</p><h2>Glow einstellen</h2>
        <label className="appearance-glow-toggle"><input type="checkbox" checked={appearance.glowEnabled} onChange={(event) => updateAppearance({ glowEnabled: event.target.checked })} /><span><b>Ambient Glow aktiv</b><small>Subtiler Lichtschein an aktiven Elementen und wichtigen Karten.</small></span></label>
        <label className="appearance-glow-range"><span><b>Intensität</b><strong>{appearance.glowIntensity} %</strong></span><input type="range" min="0" max="100" step="1" value={appearance.glowIntensity} disabled={!appearance.glowEnabled} onChange={(event) => updateAppearance({ glowIntensity: Number(event.target.value) })} /></label>
        <p className="muted">Die Lesbarkeit und Statusfarben bleiben erhalten. Der Regler verändert nur den dekorativen Lichtschein.</p>
      </Card>
    </div>}

    {section === "connections" && <div className="grid">
      <Card className="wide"><p className="eyebrow">Endurance Intelligence Cloud</p><h2>Geräteübergreifend synchronisiert</h2><p className="muted">Angemeldet als <b>{session?.user?.email}</b>. Änderungen werden automatisch in Supabase gespeichert.</p><span className={`cloud-status ${cloudStatus}`}>{cloudStatusLabel}</span>{cloudUpdatedAt && <p className="muted">Letzte Cloud-Aktualisierung: {new Date(cloudUpdatedAt).toLocaleString("de-DE")}</p>}{cloudError && <p className="connection-message cloud-error-message">{cloudError}</p>}<div className="button-row"><button onClick={uploadLocalState}>{cloudStatus === "conflict" ? "Lokalen Stand behalten" : cloudStatus === "error" ? "Speichern erneut versuchen" : "Lokale Daten in Cloud übernehmen"}</button><button className="secondary" onClick={reloadCloudState}>{cloudStatus === "conflict" ? "Neueren Cloud-Stand laden" : "Cloud neu laden"}</button><button className="secondary" onClick={logout}>Abmelden</button></div></Card>
      <Card className="wide intervals-setup-card">
        <p className="eyebrow">Intervals.icu · Datenzentrale</p>
        <h2>{state.intervals?.connected ? (state.intervals?.connectionMode === "legacy" ? "Verbunden – persönliche Ablage noch offen" : "Persönlich verbunden und bereit") : state.intervals?.configured ? "Verbindung prüfen" : "Trainingsplattformen bündeln"}</h2>
        <p className="muted">Garmin, Strava, Polar oder weitere Plattformen werden in Intervals.icu verbunden. Endurance Intelligence lädt die zusammengeführten Aktivitäten und schreibt bestätigte Wochenpläne in deinen Intervals-Kalender zurück.</p>
        <div className="intervals-setup-grid">
          <div className="intervals-setup-step"><span>1</span><div><strong>Datenquellen verbinden</strong><small>In Intervals.icu unter Settings → Connections Garmin, Strava, Polar oder deine Plattform auswählen.</small></div></div>
          <div className="intervals-setup-step"><span>2</span><div><strong>API-Key kopieren</strong><small>Unter Settings weit nach unten zu Developer Settings scrollen und beim API Key „view“ wählen.</small></div></div>
          <div className="intervals-setup-step"><span>3</span><div><strong>Hier sicher verbinden</strong><small>Der Schlüssel wird geprüft und getrennt vom Profil verschlüsselt gespeichert.</small></div></div>
          <div className="intervals-setup-step"><span>4</span><div><strong>Import & Export</strong><small>Aktivitäten synchronisieren und bestätigte Pläne an Intervals.icu senden.</small></div></div>
        </div>

        {state.intervals?.connected && !editIntervalsApiKey ? (
          <div className="intervals-connected-panel">
            <div><span>✓</span><p><strong>Verbindung aktiv</strong><small>{state.intervals?.connectionMode === "legacy" ? "Bestehende Betreiber-Verbindung. Du kannst sie jetzt durch deinen persönlichen API-Key ersetzen." : "Dein API-Key liegt verschlüsselt in der nur serverseitig lesbaren Verbindungsablage."}</small></p></div>
            <button type="button" className="secondary" onClick={() => { setEditIntervalsApiKey(true); setIntervalsMessage(""); }}>{state.intervals?.connectionMode === "legacy" ? "Persönlichen API-Key hinterlegen" : "API-Key ersetzen"}</button>
          </div>
        ) : (
          <div className="intervals-key-editor">
            <label>Persönlicher Intervals.icu API-Key
              <span>
                <input
                  autoComplete="off"
                  spellCheck="false"
                  type={showIntervalsApiKey ? "text" : "password"}
                  value={intervalsApiKey}
                  placeholder="API-Key aus Developer Settings"
                  onChange={(event) => { setIntervalsApiKey(event.target.value); setIntervalsMessage(""); }}
                />
                <button type="button" className="secondary" onClick={() => setShowIntervalsApiKey((value) => !value)}>{showIntervalsApiKey ? "Verbergen" : "Anzeigen"}</button>
              </span>
            </label>
            <div className="button-row">
              <a className="button-link" href="https://intervals.icu/settings" target="_blank" rel="noreferrer">Developer Settings öffnen</a>
              <button type="button" onClick={saveIntervalsConnection} disabled={intervalsBusy || !intervalsOnlineReady()}>{intervalsBusy ? "Prüfe …" : "API-Key prüfen & speichern"}</button>
              {state.intervals?.connected && <button type="button" className="secondary" onClick={() => { setEditIntervalsApiKey(false); setIntervalsApiKey(""); }}>Abbrechen</button>}
            </div>
          </div>
        )}

        {state.intervals?.lastSyncAt && <p className="muted">Letzter Sync: {new Date(state.intervals.lastSyncAt).toLocaleString("de-DE")}</p>}
        <div className="button-row">
          <a className="button-link" href="https://intervals.icu/settings/connections" target="_blank" rel="noreferrer">Intervals.icu Connections öffnen</a>
          <button onClick={checkIntervals} disabled={intervalsBusy || !intervalsOnlineReady()}>{intervalsBusy ? "Prüfe …" : "Verbindung prüfen"}</button>
          {state.intervals?.connected && <button className="secondary" onClick={syncIntervals} disabled={intervalsSyncStatus === "syncing"}>{intervalsSyncStatus === "syncing" ? "Synchronisiert …" : "Jetzt synchronisieren"}</button>}
          {state.intervals?.connected && state.intervals?.connectionMode !== "legacy" && <button className="secondary intervals-disconnect-button" onClick={removeIntervalsConnection} disabled={intervalsBusy}>Verbindung trennen</button>}
        </div>
        <div className="setup-note"><strong>Garmin-Workouts:</strong> Bei der Garmin-Verbindung „Upload planned workouts“ aktivieren. Andernfalls erscheinen Pläne nur im Intervals.icu-Kalender.</div>
        <div className="setup-note"><strong>Sicherheit:</strong> Der persönliche API-Key wird nie im Profil, Backup oder Browser-Speicher abgelegt. Wenn du ihn in Intervals.icu neu erzeugst, musst du ihn hier einmal ersetzen.</div>
        {intervalsMessage && <p className="connection-message">{intervalsMessage}</p>}
      </Card>
    </div>}

    {section === "data" && <div className="grid">
      <Card className="wide"><p className="eyebrow">Datensicherung</p><h2>Sicherung exportieren oder wiederherstellen</h2><p className="muted">Erstellt eine lesbare JSON-Sicherung deiner Pläne, Aktivitäten, Reviews und Einstellungen. Bilder bleiben über ihre privaten Speicherpfade zugeordnet.</p><input ref={backupInput} type="file" accept=".json,application/json" hidden onChange={restoreBackup} /><div className="button-row"><button onClick={() => { downloadStateBackup(state); setBackupMessage("Sicherung heruntergeladen."); }}>Sicherung herunterladen</button><button className="secondary" onClick={() => backupInput.current?.click()}>Sicherung wiederherstellen</button></div>{backupMessage && <p className="connection-message">{backupMessage}</p>}</Card>
      <Card className="wide"><p className="eyebrow">Supabase · Privater Bildspeicher</p><h2>{imageStorageStatus === "migrating" ? "Bilder werden optimiert" : imageStorageStatus === "error" ? "Bildspeicher prüfen" : "Bilder platzsparend gespeichert"}</h2><span className={`cloud-status ${imageStorageStatus === "error" ? "error" : imageStorageStatus === "ready" ? "synced" : "saving"}`}>{imageStorageStatus === "migrating" ? "Migration läuft" : imageStorageStatus === "error" ? "Migration ausstehend" : "Bereit"}</span><p className="muted">{imageStorageMessage || "Produkt- und Equipmentbilder werden getrennt vom großen App-Datensatz gespeichert. Ersetzen überschreibt die vorhandene Datei; Löschen entfernt sie."}</p>{imageStorageStatus === "error" && <button type="button" onClick={retryImageMigration}>Erneut prüfen</button>}</Card>
      <Card className="wide"><p className="eyebrow">Garmin · Historie & Backup</p><h2>Garmin-Export importieren</h2><p className="muted">Liest den vollständigen Garmin-Datenexport direkt im Browser. Vorhandene Aktivitäten werden als Duplikate erkannt und zusammengeführt.</p><input ref={garminInput} type="file" accept=".zip,.json,application/zip,application/json" hidden onChange={(event) => previewGarmin(event.target.files?.[0])} /><div className="button-row"><button onClick={() => garminInput.current?.click()} disabled={garminBusy}>{garminBusy ? "Export wird geprüft …" : "Garmin ZIP auswählen"}</button>{garminPreview && <button className="secondary" onClick={importGarmin}>Import starten</button>}</div>{garminPreview && <div className="import-preview"><div><span>Aktivitäten</span><strong>{garminPreview.total}</strong></div><div><span>Läufe</span><strong>{garminPreview.runs}</strong></div><div><span>Laufkilometer</span><strong>{garminPreview.distance.toFixed(1)} km</strong></div><div><span>Zeitraum</span><strong>{garminPreview.firstDate} – {garminPreview.lastDate}</strong></div><p className="muted import-types">{Object.entries(garminPreview.byType).sort((a, b) => b[1] - a[1]).map(([type, count]) => `${type}: ${count}`).join(" · ")}</p></div>}{state.garmin?.lastImportAt && <p className="muted">Letzter Import: {new Date(state.garmin.lastImportAt).toLocaleString("de-DE")} · {state.garmin.imported} neu · {state.garmin.duplicates} Duplikate</p>}{garminMessage && <p className="connection-message">{garminMessage}</p>}</Card>
      <Card><p className="eyebrow">Apple Kalender</p><h2>Kalender-Abo</h2><p className="muted">Die Cloud-Adresse liefert deinen aktuellen Wochenplan automatisch als Kalenderabo.</p><div className="button-row"><button onClick={() => navigator.clipboard?.writeText(calendarUrl).then(() => setCalendarMessage("Kalenderadresse kopiert."))} disabled={!calendarToken}>Abo-Adresse kopieren</button><button className="secondary" onClick={() => downloadCalendar(state.plan)}>ICS als Datei</button></div>{calendarUrl && <><label className="calendar-url-label">Abo-Adresse<input readOnly value={calendarUrl} onFocus={(event) => event.target.select()} /></label><p className="muted">Auf dem iPhone: Kalender → Kalender hinzufügen → Kalenderabonnement hinzufügen → Adresse einsetzen.</p></>}{calendarMessage && <p className="connection-message">{calendarMessage}</p>}</Card>
      <Card><p className="eyebrow">Lokale Daten</p><h2>Reset</h2><p className="muted">Entfernt Reviews, importierte Aktivitäten und lokale Einstellungen dieses Kontos aus diesem Browser.</p><button onClick={() => resetState(session?.user?.id)}>Daten zurücksetzen</button></Card>
    </div>}
  </>;
}
