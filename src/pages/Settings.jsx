import { useRef, useState } from "react";
import { useApp } from "../context/AppContext";
import { Card, PageTitle } from "../components/UI";
import { downloadCalendar } from "../services/calendar";
import { resetState } from "../services/storage";
import { mergeGarminActivities, readGarminExport } from "../services/garminImport";
import { calendarSubscriptionUrl } from "../services/supabase";
import { fetchIntervalsStatus, intervalsOnlineReady } from "../services/intervals";
import { normalizeAppearance, resolveTheme, THEME_PRESET_LIST } from "../services/theme";
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

function numberOrBlank(value) {
  return value === "" || value === null || value === undefined ? "" : Number(value);
}

export default function Settings() {
  const { state, setState, session, cloudStatus, cloudUpdatedAt, calendarToken, intervalsSyncStatus, syncIntervalsNow, uploadLocalState, reloadCloudState, logout } = useApp();
  const [calendarMessage, setCalendarMessage] = useState("");
  const [garminBusy, setGarminBusy] = useState(false);
  const [garminPreview, setGarminPreview] = useState(null);
  const [garminMessage, setGarminMessage] = useState("");
  const [intervalsMessage, setIntervalsMessage] = useState("");
  const [intervalsBusy, setIntervalsBusy] = useState(false);
  const [commitmentDraft, setCommitmentDraft] = useState(null);
  const [commitmentMessage, setCommitmentMessage] = useState("");
  const [section, setSection] = useState("overview");
  const garminInput = useRef(null);

  const commitments = sortCommitments(
    Array.isArray(state.planner?.recurringCommitments) ? state.planner.recurringCommitments : [],
  );
  const hasMigratedCommitments = commitments.some((item) => item.migratedFrom);
  const replacementSports = state.planner?.replacementSports || DEFAULT_REPLACEMENT_SPORTS;
  const appearance = normalizeAppearance(state.appearance);
  const activeTheme = resolveTheme(appearance);
  const customTheme = resolveTheme({ ...appearance, themeId: "custom" });

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
        },
      }));
      setIntervalsMessage(status.connected ? "Intervals.icu ist verbunden." : status.message || "Intervals.icu ist noch nicht eingerichtet.");
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

  const calendarUrl = calendarToken ? calendarSubscriptionUrl(calendarToken) : "";
  const cloudStatusLabel = { local: "Nur lokal", loading: "Cloud wird geladen …", saving: "Wird gespeichert …", synced: "Synchronisiert", error: "Synchronisierung fehlgeschlagen" }[cloudStatus] || cloudStatus;

  const sectionTabs = [
    ["overview", "Übersicht"],
    ["profile", "Profil"],
    ["planning", "Training & Planung"],
    ["appearance", "Darstellung"],
    ["connections", "Verbindungen"],
    ["data", "Daten & Kalender"],
  ];

  return <>
    <PageTitle eyebrow="Settings" title="Deine Konfiguration" />
    <div className="section-tabs settings-tabs" role="tablist" aria-label="Einstellungsbereiche">
      {sectionTabs.map(([key, label]) => <button type="button" className={section === key ? "selected" : ""} onClick={() => setSection(key)} key={key}>{label}</button>)}
    </div>

    {section === "overview" && <div className="grid settings-overview-grid">
      <Card className="settings-overview-card">
        <p className="eyebrow">Profil</p><h2>{state.profile?.displayName || "Noch ohne Anzeigename"}</h2>
        <p className="muted">{state.profile?.birthDate ? `Geburtsdatum ${new Date(`${state.profile.birthDate}T12:00:00`).toLocaleDateString("de-DE")}` : "Geburtsdatum optional"}{state.profile?.heightCm ? ` · ${state.profile.heightCm} cm` : ""}{state.profile?.weightKg ? ` · ${state.profile.weightKg} kg` : ""}</p>
        <button type="button" onClick={() => setSection("profile")}>Profil öffnen</button>
      </Card>
      <Card className="settings-overview-card">
        <p className="eyebrow">Training & Planung</p><h2>{commitments.length} Fixtermine</h2>
        <p className="muted">{commitments.length ? commitments.map((item) => `${item.weekday.slice(0, 2)} · ${item.name}`).join(" · ") : "Noch keine wiederkehrenden Einheiten"}</p>
        <button type="button" onClick={() => setSection("planning")}>Planungsregeln öffnen</button>
      </Card>
      <Card className="settings-overview-card settings-overview-theme">
        <p className="eyebrow">Darstellung</p><h2>{activeTheme.label}</h2>
        <div className="theme-overview-swatches"><span style={{ background: activeTheme.primary }} /><span style={{ background: activeTheme.secondary }} /></div>
        <p className="muted">Persönliches Ambient-Theme · Glow {appearance.glowEnabled ? `${appearance.glowIntensity} %` : "aus"}</p>
        <button type="button" onClick={() => setSection("appearance")}>Theme anpassen</button>
      </Card>
      <Card className="settings-overview-card">
        <p className="eyebrow">Verbindungen</p><h2>{state.intervals?.connected ? "Intervals.icu verbunden" : "Intervals.icu noch offen"}</h2>
        <p className="muted">Cloud: {cloudStatusLabel}{state.intervals?.lastSyncAt ? ` · letzter Aktivitäts-Sync ${new Date(state.intervals.lastSyncAt).toLocaleDateString("de-DE")}` : ""}</p>
        <button type="button" onClick={() => setSection("connections")}>Verbindungen öffnen</button>
      </Card>
      <Card className="settings-overview-card">
        <p className="eyebrow">Daten & Kalender</p><h2>{calendarToken ? "Kalenderabo aktiv" : "Kalenderabo vorbereiten"}</h2>
        <p className="muted">{state.garmin?.lastImportAt ? `Garmin-Import: ${new Date(state.garmin.lastImportAt).toLocaleDateString("de-DE")}` : "Garmin-Historie kann als Backup importiert werden."}</p>
        <button type="button" onClick={() => setSection("data")}>Datenbereich öffnen</button>
      </Card>
    </div>}

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
          <label>Trainingserfahrung<select value={state.profile?.experienceLevel || "beginner"} onChange={(event) => updateProfile("experienceLevel", event.target.value)}><option value="beginner">Anfänger · neu oder Wiedereinstieg</option><option value="advanced">Fortgeschritten · meist 2–3 Läufe/Woche</option><option value="experienced">Erfahren · stabil 4+ Läufe/Woche</option><option value="individual">Individuell</option></select></label>
          <label>Übliche Läufe pro Woche<input type="number" min="0" max="14" value={state.profile?.selfReportedRunsPerWeek ?? ""} onChange={(event) => updateProfile("selfReportedRunsPerWeek", numberOrBlank(event.target.value))} /></label>
        </div>
      </Card>
    </div>}

    {section === "planning" && <div className="grid">
      <Card className="wide settings-commitments-card">
        <div className="settings-section-heading">
          <div><p className="eyebrow">Feste Termine</p><h2>Wiederkehrende Einheiten</h2></div>
          <button type="button" onClick={() => { setCommitmentMessage(""); setCommitmentDraft(emptyCommitment()); }}>+ Termin hinzufügen</button>
        </div>
        <p className="muted">EYM berücksichtigt diese Termine bei jeder neuen oder neu berechneten Wochenplanung.{hasMigratedCommitments ? " Bestehende Fixtermine wurden automatisch übernommen." : " Neue Termine kannst du frei anlegen."}</p>
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

      <Card className="wide settings-replacements-card"><p className="eyebrow">Woche anpassen</p><h2>Erlaubte Ersatzarten</h2><p className="muted">Diese Sportarten werden angeboten, wenn du eine einzelne Einheit ersetzen möchtest. Eigene Fixtermine erscheinen zusätzlich automatisch.</p><div className="settings-sport-picker">{SPORT_OPTIONS.filter((option) => option.value !== "other").map((option) => <button type="button" className={replacementSports.includes(option.value) ? "selected" : ""} onClick={() => toggleReplacementSport(option.value)} key={option.value}>{option.label}</button>)}</div></Card>
    </div>}

    {section === "appearance" && <div className="grid appearance-settings-grid">
      <Card className="wide appearance-live-card">
        <div className="appearance-live-copy">
          <p className="eyebrow">Live-Vorschau</p>
          <h2>{activeTheme.label}</h2>
          <p className="muted">Die Auswahl wirkt sofort auf Navigation, Karten, Buttons, Diagramme und Highlights. Sie wird mit deinem EYM-Konto synchronisiert.</p>
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
      <Card className="wide"><p className="eyebrow">Endurance Intelligence Cloud</p><h2>Geräteübergreifend synchronisiert</h2><p className="muted">Angemeldet als <b>{session?.user?.email}</b>. Änderungen werden automatisch in Supabase gespeichert.</p><span className={`cloud-status ${cloudStatus}`}>{cloudStatusLabel}</span>{cloudUpdatedAt && <p className="muted">Letzte Cloud-Aktualisierung: {new Date(cloudUpdatedAt).toLocaleString("de-DE")}</p>}<div className="button-row"><button onClick={uploadLocalState}>Lokale Daten in Cloud übernehmen</button><button className="secondary" onClick={reloadCloudState}>Cloud neu laden</button><button className="secondary" onClick={logout}>Abmelden</button></div></Card>
      <Card className="wide intervals-setup-card"><p className="eyebrow">Intervals.icu · Datenzentrale</p><h2>{state.intervals?.connected ? "Verbunden und bereit" : state.intervals?.configured ? "Verbindung prüfen" : "Trainingsplattformen bündeln"}</h2><p className="muted">Garmin, Strava, Polar oder weitere Plattformen werden in Intervals.icu verbunden. EYM lädt die zusammengeführten Aktivitäten von dort.</p><div className="intervals-setup-grid"><div className="intervals-setup-step"><span>1</span><div><strong>Intervals.icu öffnen</strong><small>Anmelden oder kostenlos ein Konto erstellen.</small></div></div><div className="intervals-setup-step"><span>2</span><div><strong>Datenquelle verbinden</strong><small>Unter Settings → Connections Garmin, Strava, Polar oder deine Plattform auswählen.</small></div></div><div className="intervals-setup-step"><span>3</span><div><strong>Sync prüfen</strong><small>Kontrollieren, ob deine letzten Aktivitäten sichtbar sind.</small></div></div><div className="intervals-setup-step"><span>4</span><div><strong>EYM verbinden</strong><small>Verbindung testen und Aktivitäten synchronisieren.</small></div></div></div>{state.intervals?.lastSyncAt && <p className="muted">Letzter Sync: {new Date(state.intervals.lastSyncAt).toLocaleString("de-DE")}</p>}<div className="button-row"><a className="button-link" href="https://intervals.icu/settings/connections" target="_blank" rel="noreferrer">Intervals.icu Connections öffnen</a><button onClick={checkIntervals} disabled={intervalsBusy || !intervalsOnlineReady()}>{intervalsBusy ? "Prüfe …" : "Verbindung prüfen"}</button>{state.intervals?.connected && <button className="secondary" onClick={syncIntervals} disabled={intervalsSyncStatus === "syncing"}>{intervalsSyncStatus === "syncing" ? "Synchronisiert …" : "Jetzt synchronisieren"}</button>}</div><div className="setup-note"><strong>Garmin-Workouts:</strong> Bei der Garmin-Verbindung „Upload planned workouts“ aktivieren.</div><div className="setup-note"><strong>Mehrere EYM-Nutzer:</strong> Die persönliche Anmeldung wird als Intervals.icu-OAuth-Verbindung umgesetzt. Die aktuelle Verbindung bleibt bis dahin privater Testbetrieb.</div>{intervalsMessage && <p className="connection-message">{intervalsMessage}</p>}</Card>
    </div>}

    {section === "data" && <div className="grid">
      <Card className="wide"><p className="eyebrow">Garmin · Historie & Backup</p><h2>Garmin-Export importieren</h2><p className="muted">Liest den vollständigen Garmin-Datenexport direkt im Browser. Vorhandene Aktivitäten werden als Duplikate erkannt und zusammengeführt.</p><input ref={garminInput} type="file" accept=".zip,.json,application/zip,application/json" hidden onChange={(event) => previewGarmin(event.target.files?.[0])} /><div className="button-row"><button onClick={() => garminInput.current?.click()} disabled={garminBusy}>{garminBusy ? "Export wird geprüft …" : "Garmin ZIP auswählen"}</button>{garminPreview && <button className="secondary" onClick={importGarmin}>Import starten</button>}</div>{garminPreview && <div className="import-preview"><div><span>Aktivitäten</span><strong>{garminPreview.total}</strong></div><div><span>Läufe</span><strong>{garminPreview.runs}</strong></div><div><span>Laufkilometer</span><strong>{garminPreview.distance.toFixed(1)} km</strong></div><div><span>Zeitraum</span><strong>{garminPreview.firstDate} – {garminPreview.lastDate}</strong></div><p className="muted import-types">{Object.entries(garminPreview.byType).sort((a, b) => b[1] - a[1]).map(([type, count]) => `${type}: ${count}`).join(" · ")}</p></div>}{state.garmin?.lastImportAt && <p className="muted">Letzter Import: {new Date(state.garmin.lastImportAt).toLocaleString("de-DE")} · {state.garmin.imported} neu · {state.garmin.duplicates} Duplikate</p>}{garminMessage && <p className="connection-message">{garminMessage}</p>}</Card>
      <Card><p className="eyebrow">Apple Kalender</p><h2>Kalender-Abo</h2><p className="muted">Die Cloud-Adresse liefert deinen aktuellen Wochenplan automatisch als Kalenderabo.</p><div className="button-row"><button onClick={() => navigator.clipboard?.writeText(calendarUrl).then(() => setCalendarMessage("Kalenderadresse kopiert."))} disabled={!calendarToken}>Abo-Adresse kopieren</button><button className="secondary" onClick={() => downloadCalendar(state.plan)}>ICS als Datei</button></div>{calendarUrl && <><label className="calendar-url-label">Abo-Adresse<input readOnly value={calendarUrl} onFocus={(event) => event.target.select()} /></label><p className="muted">Auf dem iPhone: Kalender → Kalender hinzufügen → Kalenderabonnement hinzufügen → Adresse einsetzen.</p></>}{calendarMessage && <p className="connection-message">{calendarMessage}</p>}</Card>
      <Card><p className="eyebrow">Lokale Daten</p><h2>Reset</h2><p className="muted">Entfernt Reviews, importierte Aktivitäten und lokale Einstellungen aus diesem Browser.</p><button onClick={resetState}>Daten zurücksetzen</button></Card>
    </div>}
  </>;
}
