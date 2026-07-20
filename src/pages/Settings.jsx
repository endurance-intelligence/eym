import { useRef, useState } from "react";
import { useApp } from "../context/AppContext";
import { Card, PageTitle } from "../components/UI";
import { downloadCalendar } from "../services/calendar";
import { resetState } from "../services/storage";
import { mergeGarminActivities, readGarminExport } from "../services/garminImport";
import { calendarSubscriptionUrl } from "../services/supabase";
import { fetchIntervalsStatus, intervalsOnlineReady } from "../services/intervals";
import {
  DEFAULT_REPLACEMENT_SPORTS,
  LOAD_OPTIONS,
  SPORT_OPTIONS,
  WEEKDAYS,
  emptyCommitment,
  normalizeCommitment,
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
  const garminInput = useRef(null);

  const commitments = Array.isArray(state.planner?.recurringCommitments) ? state.planner.recurringCommitments : [];
  const hasMigratedCommitments = commitments.some((item) => item.migratedFrom);
  const replacementSports = state.planner?.replacementSports || DEFAULT_REPLACEMENT_SPORTS;

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

  return <>
    <PageTitle eyebrow="Settings" title="Profil, Planung & Daten" />
    <div className="grid">
      <Card className="wide settings-profile-card">
        <div className="settings-section-heading">
          <div><p className="eyebrow">Athletenprofil</p><h2>Persönliche Grundlage</h2></div>
          {hasMigratedCommitments && <span className="settings-migration-badge">Bestehende Daten übernommen</span>}
        </div>
        <p className="muted">Deine bisherigen Pläne, Missionen und Aktivitäten bleiben erhalten. Neue Angaben sind optional und verbessern später die individuelle Belastungssteuerung.</p>
        <div className="form-grid settings-profile-grid">
          <label>Anzeigename<input value={state.profile?.displayName || ""} placeholder="z. B. Daniel" onChange={(event) => updateProfile("displayName", event.target.value)} /></label>
          <label>Geburtsdatum<input type="date" value={state.profile?.birthDate || ""} onChange={(event) => updateProfile("birthDate", event.target.value)} /></label>
          <label>Größe in cm<input type="number" min="100" max="230" value={state.profile?.heightCm ?? ""} placeholder="optional" onChange={(event) => updateProfile("heightCm", numberOrBlank(event.target.value))} /></label>
          <label>Gewicht in kg<input type="number" min="30" max="250" step="0.1" value={state.profile?.weightKg ?? ""} placeholder="optional" onChange={(event) => updateProfile("weightKg", numberOrBlank(event.target.value))} /></label>
        </div>
      </Card>

      <Card className="wide settings-commitments-card">
        <div className="settings-section-heading">
          <div><p className="eyebrow">Feste Termine</p><h2>Wiederkehrende Einheiten</h2></div>
          <button type="button" onClick={() => setCommitmentDraft(emptyCommitment())}>+ Termin hinzufügen</button>
        </div>
        <p className="muted">EYM berücksichtigt diese Termine bei jeder neuen Wochenplanung.{hasMigratedCommitments ? " Bestehende Fixtermine wurden aus deiner bisherigen Konfiguration automatisch übernommen." : " Neue Termine kannst du frei nach Sportart, Tag, Uhrzeit und Belastung anlegen."}</p>
        {commitments.length ? (
          <div className="settings-commitment-list">
            {commitments.map((item) => (
              <article className={item.enabled === false ? "disabled" : ""} key={item.id}>
                <button type="button" className={`commitment-toggle ${item.enabled === false ? "off" : "on"}`} onClick={() => toggleCommitment(item.id)} aria-label={`${item.name} ${item.enabled === false ? "aktivieren" : "deaktivieren"}`}><span /></button>
                <div className="commitment-copy">
                  <strong>{item.name}</strong>
                  <span>{item.weekday} · {item.time || "flexibel"} · {sportLabel(item.sport)}</span>
                  <small>{item.durationMinutes ? `${item.durationMinutes} min` : "Dauer offen"}{item.distanceKm ? ` · ${item.distanceKm} km` : ""} · Belastung {LOAD_OPTIONS.find((entry) => entry.value === item.load)?.label || "Mittel"}</small>
                </div>
                <div className="commitment-actions">
                  <button type="button" className="secondary" onClick={() => setCommitmentDraft({ ...item })}>Bearbeiten</button>
                  <button type="button" className="secondary" onClick={() => deleteCommitment(item.id)}>Löschen</button>
                </div>
              </article>
            ))}
          </div>
        ) : <div className="settings-empty-state">Noch keine festen Termine. Neue Wochen werden nur aus Verfügbarkeit, Mission und Belastung geplant.</div>}

        {commitmentDraft && (
          <form className="settings-commitment-form" onSubmit={saveCommitment}>
            <div className="settings-section-heading"><div><p className="eyebrow">Termin bearbeiten</p><h3>{commitments.some((item) => item.id === commitmentDraft.id) ? commitmentDraft.name || "Fixtermin" : "Neuer Fixtermin"}</h3></div><button type="button" className="secondary" onClick={() => setCommitmentDraft(null)}>Schließen</button></div>
            <div className="form-grid">
              <label>Name<input required value={commitmentDraft.name} placeholder="z. B. Lauftreff" onChange={(event) => setCommitmentDraft({ ...commitmentDraft, name: event.target.value })} /></label>
              <label>Sportart<select value={commitmentDraft.sport} onChange={(event) => setCommitmentDraft({ ...commitmentDraft, sport: event.target.value, replaceRunOnSameDay: event.target.value === "running" })}>{SPORT_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
              <label>Wochentag<select value={commitmentDraft.weekday} onChange={(event) => setCommitmentDraft({ ...commitmentDraft, weekday: event.target.value })}>{WEEKDAYS.map((day) => <option key={day}>{day}</option>)}</select></label>
              <label>Uhrzeit<input type="time" value={commitmentDraft.time} onChange={(event) => setCommitmentDraft({ ...commitmentDraft, time: event.target.value })} /></label>
              <label>Dauer in Minuten<input type="number" min="0" value={commitmentDraft.durationMinutes} onChange={(event) => setCommitmentDraft({ ...commitmentDraft, durationMinutes: Number(event.target.value) })} /></label>
              <label>Übliche Distanz in km<input type="number" min="0" step="0.1" value={commitmentDraft.distanceKm} onChange={(event) => setCommitmentDraft({ ...commitmentDraft, distanceKm: Number(event.target.value) })} /></label>
              <label>Belastung<select value={commitmentDraft.load} onChange={(event) => setCommitmentDraft({ ...commitmentDraft, load: event.target.value })}>{LOAD_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
            </div>
            <div className="settings-check-grid">
              <label><input type="checkbox" checked={commitmentDraft.enabled !== false} onChange={(event) => setCommitmentDraft({ ...commitmentDraft, enabled: event.target.checked })} /> Regelmäßig aktiv</label>
              <label><input type="checkbox" checked={commitmentDraft.allowCombination !== false} onChange={(event) => setCommitmentDraft({ ...commitmentDraft, allowCombination: event.target.checked })} /> Weitere Einheit am selben Tag erlaubt</label>
              {commitmentDraft.sport === "running" && <label><input type="checkbox" checked={commitmentDraft.replaceRunOnSameDay !== false} onChange={(event) => setCommitmentDraft({ ...commitmentDraft, replaceRunOnSameDay: event.target.checked })} /> Geplanten Lauf an diesem Tag ersetzen</label>}
            </div>
            <button className="primary" type="submit">Fixtermin speichern</button>
          </form>
        )}
      </Card>

      <Card className="wide settings-replacements-card">
        <p className="eyebrow">Woche anpassen</p><h2>Erlaubte Ersatzarten</h2>
        <p className="muted">Diese Sportarten werden angeboten, wenn du eine einzelne geplante Einheit ersetzen möchtest. Eigene Fixtermine erscheinen zusätzlich automatisch als Auswahl.</p>
        <div className="settings-sport-picker">
          {SPORT_OPTIONS.filter((option) => option.value !== "other").map((option) => <button type="button" className={replacementSports.includes(option.value) ? "selected" : ""} onClick={() => toggleReplacementSport(option.value)} key={option.value}>{option.label}</button>)}
        </div>
      </Card>

      <Card className="wide">
        <p className="eyebrow">Endurance Intelligence Cloud</p><h2>Geräteübergreifend synchronisiert</h2>
        <p className="muted">Angemeldet als <b>{session?.user?.email}</b>. Änderungen werden automatisch in Supabase gespeichert und auf anderen Geräten geladen.</p>
        <span className={`cloud-status ${cloudStatus}`}>{cloudStatusLabel}</span>
        {cloudUpdatedAt && <p className="muted">Letzte Cloud-Aktualisierung: {new Date(cloudUpdatedAt).toLocaleString("de-DE")}</p>}
        <div className="button-row">
          <button onClick={uploadLocalState}>Lokale Daten in Cloud übernehmen</button>
          <button className="secondary" onClick={reloadCloudState}>Cloud neu laden</button>
          <button className="secondary" onClick={logout}>Abmelden</button>
        </div>
      </Card>

      <Card className="wide intervals-setup-card">
        <p className="eyebrow">Intervals.icu · Datenzentrale</p>
        <h2>{state.intervals?.connected ? "Verbunden und bereit" : state.intervals?.configured ? "Verbindung prüfen" : "Trainingsplattformen bündeln"}</h2>
        <p className="muted">EYM bindet Strava, Garmin oder Polar nicht mehr einzeln an. Du verbindest deine Plattformen einmal in Intervals.icu; EYM lädt die zusammengeführten Aktivitäten anschließend von dort.</p>
        <div className="intervals-setup-grid">
          <div className="intervals-setup-step"><span>1</span><div><strong>Intervals.icu öffnen</strong><small>Anmelden oder kostenlos ein Konto erstellen.</small></div></div>
          <div className="intervals-setup-step"><span>2</span><div><strong>Datenquelle verbinden</strong><small>Unter Settings → Connections Garmin, Strava, Polar oder deine Plattform auswählen.</small></div></div>
          <div className="intervals-setup-step"><span>3</span><div><strong>Synchronisierung abwarten</strong><small>Prüfen, ob deine letzten Aktivitäten in Intervals.icu sichtbar sind.</small></div></div>
          <div className="intervals-setup-step"><span>4</span><div><strong>In EYM prüfen</strong><small>Verbindung testen und danach die Aktivitäten synchronisieren.</small></div></div>
        </div>
        {state.intervals?.lastSyncAt && <p className="muted">Letzter Sync: {new Date(state.intervals.lastSyncAt).toLocaleString("de-DE")}</p>}
        <div className="button-row">
          <a className="button-link" href="https://intervals.icu/settings/connections" target="_blank" rel="noreferrer">Intervals.icu Connections öffnen</a>
          <button onClick={checkIntervals} disabled={intervalsBusy || !intervalsOnlineReady()}>{intervalsBusy ? "Prüfe …" : "Verbindung prüfen"}</button>
          {state.intervals?.connected && <button className="secondary" onClick={syncIntervals} disabled={intervalsSyncStatus === "syncing"}>{intervalsSyncStatus === "syncing" ? "Synchronisiert …" : "Jetzt synchronisieren"}</button>}
        </div>
        <div className="setup-note"><strong>Garmin-Workouts:</strong> In Intervals.icu bei der Garmin-Verbindung „Upload planned workouts“ aktivieren. Dann können bestätigte Wochenpläne über Intervals.icu auf die Garmin-Uhr gelangen.</div>
        <div className="setup-note"><strong>Für mehrere EYM-Nutzer:</strong> Die persönliche Anmeldung wird als Intervals.icu-OAuth-Verbindung umgesetzt. Die aktuelle serverseitige Verbindung bleibt bis dahin ausschließlich für den privaten Testbetrieb.</div>
        {intervalsMessage && <p className="connection-message">{intervalsMessage}</p>}
      </Card>

      <Card className="wide">
        <p className="eyebrow">Garmin · Historie & Backup</p><h2>Garmin-Export importieren</h2>
        <p className="muted">Liest den vollständigen Garmin-Datenexport direkt im Browser. Importiert werden alle Aktivitäten ab 01.01.2025; bereits vorhandene Aktivitäten werden als Duplikate erkannt und sinnvoll zusammengeführt.</p>
        <input ref={garminInput} type="file" accept=".zip,.json,application/zip,application/json" hidden onChange={(event) => previewGarmin(event.target.files?.[0])} />
        <div className="button-row">
          <button onClick={() => garminInput.current?.click()} disabled={garminBusy}>{garminBusy ? "Export wird geprüft …" : "Garmin ZIP auswählen"}</button>
          {garminPreview && <button className="secondary" onClick={importGarmin}>Import starten</button>}
        </div>
        {garminPreview && <div className="import-preview"><div><span>Aktivitäten</span><strong>{garminPreview.total}</strong></div><div><span>Läufe</span><strong>{garminPreview.runs}</strong></div><div><span>Laufkilometer</span><strong>{garminPreview.distance.toFixed(1)} km</strong></div><div><span>Zeitraum</span><strong>{garminPreview.firstDate} – {garminPreview.lastDate}</strong></div><p className="muted import-types">{Object.entries(garminPreview.byType).sort((a, b) => b[1] - a[1]).map(([type, count]) => `${type}: ${count}`).join(" · ")}</p></div>}
        {state.garmin?.lastImportAt && <p className="muted">Letzter Import: {new Date(state.garmin.lastImportAt).toLocaleString("de-DE")} · {state.garmin.imported} neu · {state.garmin.duplicates} Duplikate</p>}
        {garminMessage && <p className="connection-message">{garminMessage}</p>}
      </Card>

      <Card>
        <p className="eyebrow">Apple Kalender</p><h2>Kalender-Abo</h2>
        <p className="muted">Die Cloud-Adresse liefert deinen aktuellen Wochenplan automatisch als Kalenderabo. Nach Änderungen muss keine Datei mehr manuell hochgeladen werden.</p>
        <div className="button-row"><button onClick={() => navigator.clipboard?.writeText(calendarUrl).then(() => setCalendarMessage("Kalenderadresse kopiert."))} disabled={!calendarToken}>Abo-Adresse kopieren</button><button className="secondary" onClick={() => downloadCalendar(state.plan)}>ICS als Datei</button></div>
        {calendarUrl && <><label className="calendar-url-label">Abo-Adresse<input readOnly value={calendarUrl} onFocus={(event) => event.target.select()} /></label><p className="muted">Sobald die Supabase-Funktion <b>calendar</b> veröffentlicht wurde, aktualisiert sich dieses Abo automatisch aus deinen Cloud-Daten.</p><p className="muted">Auf dem iPhone: Kalender → Kalender hinzufügen → Kalenderabonnement hinzufügen → Adresse einsetzen.</p></>}
        {calendarMessage && <p className="connection-message">{calendarMessage}</p>}
      </Card>

      <Card>
        <p className="eyebrow">Lokale Daten</p><h2>Reset</h2><p className="muted">Entfernt Reviews, importierte Aktivitäten und lokale Einstellungen aus diesem Browser.</p><button onClick={resetState}>Daten zurücksetzen</button>
      </Card>
    </div>
  </>;
}
