import { useRef, useState } from "react";
import { useApp } from "../context/AppContext";
import { Card, PageTitle } from "../components/UI";
import { connectStrava, disconnectStravaConnection, stravaOnlineReady, stravaStatus } from "../services/strava";
import { downloadCalendar } from "../services/calendar";
import { resetState } from "../services/storage";
import { mergeGarminActivities, readGarminExport } from "../services/garminImport";
import { calendarSubscriptionUrl } from "../services/supabase";
import { fetchIntervalsStatus, intervalsOnlineReady } from "../services/intervals";

export default function Settings() {
  const { state, setState, session, cloudStatus, cloudUpdatedAt, calendarToken, stravaSyncStatus, intervalsSyncStatus, syncIntervalsNow, syncStravaNow, uploadLocalState, reloadCloudState, logout } = useApp();
  const [message, setMessage] = useState("");
  const [calendarMessage, setCalendarMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [garminBusy, setGarminBusy] = useState(false);
  const [garminPreview, setGarminPreview] = useState(null);
  const [garminMessage, setGarminMessage] = useState("");
  const [intervalsMessage, setIntervalsMessage] = useState("");
  const [intervalsBusy, setIntervalsBusy] = useState(false);
  const garminInput = useRef(null);



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

  async function connect() {
    setBusy(true);
    setMessage("");
    try { await connectStrava(state.strava.connected); }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)); setBusy(false); }
  }

  async function disconnectStrava() {
    setBusy(true);
    setMessage("");
    try {
      await disconnectStravaConnection();
      setState((current) => ({ ...current, strava: { ...current.strava, connected: false, athlete: null, lastSyncAt: null } }));
      setMessage("Strava-Verbindung entfernt. Bereits importierte Aktivitäten bleiben erhalten.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally { setBusy(false); }
  }

  async function syncStrava() {
    setMessage("");
    try {
      const result = await syncStravaNow();
      setMessage(`${result.added || 0} neue Aktivitäten geladen, ${result.duplicates || 0} vorhandene Einheiten ergänzt.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
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

  const athleteName = [state.strava.athlete?.firstname, state.strava.athlete?.lastname].filter(Boolean).join(" ");
  const stravaInfo = stravaStatus();
  const calendarUrl = calendarToken ? calendarSubscriptionUrl(calendarToken) : "";
  const cloudStatusLabel = { local: "Nur lokal", loading: "Cloud wird geladen …", saving: "Wird gespeichert …", synced: "Synchronisiert", error: "Synchronisierung fehlgeschlagen" }[cloudStatus] || cloudStatus;

  return <>
    <PageTitle eyebrow="Settings" title="Verbindungen & Daten" />
    <div className="grid">
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

      <Card>
        <p className="eyebrow">Intervals.icu · primär</p>
        <h2>{state.intervals?.connected ? "Verbunden" : state.intervals?.configured ? "Verbindung prüfen" : "Noch nicht eingerichtet"}</h2>
        <p className="muted">Neue Garmin-Aktivitäten können automatisch über Intervals.icu geladen werden. Strava bleibt als optionale Ersatzquelle erhalten.</p>
        {state.intervals?.lastSyncAt && <p className="muted">Letzter Sync: {new Date(state.intervals.lastSyncAt).toLocaleString("de-DE")}</p>}
        <div className="button-row">
          <button onClick={checkIntervals} disabled={intervalsBusy || !intervalsOnlineReady()}>{intervalsBusy ? "Prüfe …" : "Verbindung prüfen"}</button>
          {state.intervals?.connected && <button className="secondary" onClick={syncIntervals} disabled={intervalsSyncStatus === "syncing"}>{intervalsSyncStatus === "syncing" ? "Synchronisiert …" : "Jetzt synchronisieren"}</button>}
        </div>
        <p className="muted">Einrichtung: Intervals.icu → Settings → Developer Settings → API Key erzeugen. Der Key wird ausschließlich als Supabase-Secret gespeichert.</p>
        <p className="muted"><b>Garmin-Workouts:</b> In Intervals.icu unter Settings → Garmin „Upload planned workouts“ aktivieren. Danach kannst du bestätigte Wochen direkt aus dem Wochenplan senden.</p>
        {intervalsMessage && <p className="connection-message">{intervalsMessage}</p>}
      </Card>

      <Card>
        <p className="eyebrow">Strava · optional</p><h2>{stravaInfo.ready ? (state.strava.connected ? "Verbunden" : "Nicht verbunden") : stravaInfo.label}</h2>
        <p className="muted">{stravaInfo.ready
          ? (state.strava.connected ? `${athleteName ? `Verbunden mit ${athleteName}. ` : ""}Neue Aktivitäten werden beim Öffnen der App automatisch synchronisiert.` : "OAuth und Synchronisierung laufen über eine sichere Supabase-Funktion – ohne localhost und ohne separaten Server.")
          : `${stravaInfo.reason} Bereits importierte Strava-Aktivitäten bleiben erhalten.`}</p>
        {state.strava.lastSyncAt && <p className="muted">Letzter Sync: {new Date(state.strava.lastSyncAt).toLocaleString("de-DE")}</p>}
        <div className="button-row">
          <button className="strava" onClick={connect} disabled={busy || !stravaOnlineReady()}>{busy ? "Strava wird geöffnet …" : state.strava.connected ? "Neu verbinden" : "Connect with Strava"}</button>
          {state.strava.connected && <button className="secondary" onClick={syncStrava} disabled={stravaSyncStatus === "syncing"}>{stravaSyncStatus === "syncing" ? "Synchronisiert …" : "Jetzt synchronisieren"}</button>}
          {state.strava.connected && <button className="secondary" onClick={disconnectStrava} disabled={busy}>Verbindung entfernen</button>}
        </div>
        {message && <p className="connection-message">{message}</p>}
      </Card>


      <Card className="wide">
        <p className="eyebrow">Garmin · Historie & Backup</p><h2>Garmin-Export importieren</h2>
        <p className="muted">Liest den vollständigen Garmin-Datenexport direkt im Browser. Importiert werden alle Aktivitäten ab 01.01.2025; vorhandene Strava-Aktivitäten werden als Duplikate erkannt und ergänzt.</p>
        <input
          ref={garminInput}
          type="file"
          accept=".zip,.json,application/zip,application/json"
          hidden
          onChange={(event) => previewGarmin(event.target.files?.[0])}
        />
        <div className="button-row">
          <button onClick={() => garminInput.current?.click()} disabled={garminBusy}>
            {garminBusy ? "Export wird geprüft …" : "Garmin ZIP auswählen"}
          </button>
          {garminPreview && <button className="secondary" onClick={importGarmin}>Import starten</button>}
        </div>
        {garminPreview && (
          <div className="import-preview">
            <div><span>Aktivitäten</span><strong>{garminPreview.total}</strong></div>
            <div><span>Läufe</span><strong>{garminPreview.runs}</strong></div>
            <div><span>Laufkilometer</span><strong>{garminPreview.distance.toFixed(1)} km</strong></div>
            <div><span>Zeitraum</span><strong>{garminPreview.firstDate} – {garminPreview.lastDate}</strong></div>
            <p className="muted import-types">{Object.entries(garminPreview.byType).sort((a, b) => b[1] - a[1]).map(([type, count]) => `${type}: ${count}`).join(" · ")}</p>
          </div>
        )}
        {state.garmin?.lastImportAt && <p className="muted">Letzter Import: {new Date(state.garmin.lastImportAt).toLocaleString("de-DE")} · {state.garmin.imported} neu · {state.garmin.duplicates} Duplikate</p>}
        {garminMessage && <p className="connection-message">{garminMessage}</p>}
      </Card>

      <Card>
        <p className="eyebrow">Apple Kalender</p><h2>Kalender-Abo</h2>
        <p className="muted">Die Cloud-Adresse liefert deinen aktuellen Wochenplan automatisch als Kalenderabo. Nach Änderungen muss keine Datei mehr manuell hochgeladen werden.</p>
        <div className="button-row">
          <button onClick={() => navigator.clipboard?.writeText(calendarUrl).then(() => setCalendarMessage("Kalenderadresse kopiert."))} disabled={!calendarToken}>Abo-Adresse kopieren</button>
          <button className="secondary" onClick={() => downloadCalendar(state.plan)}>ICS als Datei</button>
        </div>
        {calendarUrl && <><label className="calendar-url-label">Abo-Adresse<input readOnly value={calendarUrl} onFocus={(event) => event.target.select()} /></label><p className="muted">Sobald die Supabase-Funktion <b>calendar</b> veröffentlicht wurde, aktualisiert sich dieses Abo automatisch aus deinen Cloud-Daten.</p><p className="muted">Auf dem iPhone: Kalender → Kalender hinzufügen → Kalenderabonnement hinzufügen → Adresse einsetzen.</p></>}
        {calendarMessage && <p className="connection-message">{calendarMessage}</p>}
      </Card>

      <Card>
        <p className="eyebrow">Lokale Daten</p><h2>Reset</h2><p className="muted">Entfernt Reviews, importierte Aktivitäten und lokale Einstellungen aus diesem Browser.</p><button onClick={resetState}>Daten zurücksetzen</button>
      </Card>
    </div>
  </>;
}
