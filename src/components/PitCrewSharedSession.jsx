import { useEffect, useRef, useState } from "react";
import { version } from "../../package.json";
import PitCrewLive from "./PitCrewLive";
import {
  loadPitCrewShare,
  readPitCrewLocalSnapshot,
  updatePitCrewShare,
  writePitCrewLocalSnapshot,
} from "../services/pitCrewShare.js";
import { normalizePitCrewSnapshot } from "../services/pitCrewShareCore.js";

const POLL_MS = 5000;
const LOCAL_WATCH_MS = 1000;
const INITIAL_RETRY_DELAYS = [0, 450, 1400, 3000, 6000];

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function sharedSessionDiagnostic(token, error = "") {
  return [
    `EI v${version}`,
    `online=${globalThis.navigator?.onLine !== false}`,
    `visibility=${globalThis.document?.visibilityState || "unknown"}`,
    `token=${String(token || "").length ? `erkannt (${String(token).length} Zeichen)` : "fehlt"}`,
    `path=${globalThis.location?.pathname || ""}`,
    `search=${globalThis.location?.search ? "vorhanden" : "leer"}`,
    `error=${String(error || "kein Fehler")}`,
    `browser=${String(globalThis.navigator?.userAgent || "unbekannt").slice(0, 180)}`,
  ].join("\n");
}

async function loadPitCrewShareResilient(token) {
  let lastError = null;
  for (const delay of INITIAL_RETRY_DELAYS) {
    if (delay) await wait(delay);
    try {
      return await loadPitCrewShare(token);
    } catch (error) {
      lastError = error;
      if (globalThis.navigator?.onLine === false) break;
    }
  }
  throw lastError || new Error("Der Crew-Link konnte nicht geladen werden.");
}

export default function PitCrewSharedSession({ token, race: raceFallback = null, onClose = null }) {
  const [share, setShare] = useState(null);
  const [error, setError] = useState("");
  const [mountRevision, setMountRevision] = useState(0);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [syncStatus, setSyncStatus] = useState(() => globalThis.navigator?.onLine === false ? "offline" : "syncing");
  const revisionRef = useRef(0);
  const lastLocalRef = useRef("");
  const pushingRef = useRef(false);
  const race = share?.race || raceFallback;

  useEffect(() => {
    let active = true;
    loadPitCrewShareResilient(token)
      .then((loaded) => {
        if (!active) return;
        setError("");
        const next = { ...loaded, state: normalizePitCrewSnapshot(loaded.state) };
        writePitCrewLocalSnapshot(next.race || raceFallback || {}, next.state);
        lastLocalRef.current = JSON.stringify(next.state);
        revisionRef.current = next.revision;
        setShare(next);
        setSyncStatus("synced");
        setMountRevision((value) => value + 1);
      })
      .catch((cause) => {
        if (!active) return;
        setSyncStatus(globalThis.navigator?.onLine === false ? "offline" : "error");
        setError(cause?.message || "Der Crew-Link konnte nicht geladen werden.");
      });
    return () => { active = false; };
  }, [loadAttempt, raceFallback, token]);

  useEffect(() => {
    if (share) return undefined;
    const retry = () => {
      setSyncStatus(globalThis.navigator?.onLine === false ? "offline" : "syncing");
      setLoadAttempt((value) => value + 1);
    };
    const resume = () => {
      if (document.visibilityState === "visible") retry();
      else setSyncStatus("offline");
    };
    window.addEventListener("online", retry);
    window.addEventListener("pageshow", retry);
    window.addEventListener("focus", retry);
    document.addEventListener("visibilitychange", resume);
    return () => {
      window.removeEventListener("online", retry);
      window.removeEventListener("pageshow", retry);
      window.removeEventListener("focus", retry);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [share]);

  useEffect(() => {
    if (!share?.race) return undefined;
    let active = true;
    const timer = window.setInterval(async () => {
      if (document.visibilityState !== "visible" || globalThis.navigator?.onLine === false) {
        setSyncStatus("offline");
        return;
      }
      try {
        const remote = await loadPitCrewShare(token);
        if (!active) return;
        setError("");
        setSyncStatus("synced");
        if (Number(remote.revision || 0) <= revisionRef.current) return;
        const nextState = normalizePitCrewSnapshot(remote.state);
        const serialized = JSON.stringify(nextState);
        revisionRef.current = Number(remote.revision || 0);
        if (serialized === lastLocalRef.current) return;
        writePitCrewLocalSnapshot(remote.race || share.race, nextState);
        lastLocalRef.current = serialized;
        setShare((current) => ({ ...(current || {}), ...remote, state: nextState }));
        setMountRevision((value) => value + 1);
      } catch (cause) {
        if (active) {
          setSyncStatus(globalThis.navigator?.onLine === false ? "offline" : "error");
          setError(cause?.message || "Crew-Sync ist kurzzeitig nicht erreichbar.");
        }
      }
    }, POLL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [share?.race, token]);

  useEffect(() => {
    if (!share?.race) return undefined;
    let active = true;
    const timer = window.setInterval(async () => {
      if (pushingRef.current) return;
      if (document.visibilityState !== "visible" || globalThis.navigator?.onLine === false) {
        setSyncStatus("offline");
        return;
      }
      const snapshot = normalizePitCrewSnapshot(readPitCrewLocalSnapshot(share.race));
      const serialized = JSON.stringify(snapshot);
      if (!serialized || serialized === lastLocalRef.current) return;
      pushingRef.current = true;
      setSyncStatus("syncing");
      try {
        const saved = await updatePitCrewShare(token, snapshot);
        if (!active) return;
        const savedState = normalizePitCrewSnapshot(saved.state);
        lastLocalRef.current = JSON.stringify(savedState);
        revisionRef.current = Math.max(revisionRef.current, Number(saved.revision || 0));
        setShare((current) => ({ ...(current || {}), state: savedState, revision: saved.revision }));
        setError("");
        setSyncStatus("synced");
      } catch (cause) {
        if (active) {
          setSyncStatus(globalThis.navigator?.onLine === false ? "offline" : "error");
          setError(cause?.message || "Crew-Änderung konnte nicht synchronisiert werden.");
        }
      } finally {
        pushingRef.current = false;
      }
    }, LOCAL_WATCH_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [share?.race, token]);

  if (error && !share) {
    const diagnostic = sharedSessionDiagnostic(token, error);
    const copyDiagnostic = async () => {
      try {
        await globalThis.navigator?.clipboard?.writeText?.(diagnostic);
      } catch {
        // Screenshot of the diagnostic block is still enough for support.
      }
    };
    return <main className="auth-shell"><section className="auth-card pit-shared-error-card"><p className="eyebrow">Pit Crew Live</p><h1>Crew-Link nicht verfügbar</h1><p className="muted">{error}</p><div className="button-row"><button type="button" onClick={() => setLoadAttempt((value) => value + 1)}>Erneut versuchen</button><button type="button" className="secondary" onClick={copyDiagnostic}>Diagnose kopieren</button></div><details className="pit-shared-diagnostic"><summary>Technische Diagnose</summary><pre>{diagnostic}</pre></details></section></main>;
  }
  if (!race) {
    return <main className="auth-shell"><section className="auth-card"><p className="eyebrow">Pit Crew Live</p><h1>Crew-Session wird geladen …</h1><p className="muted">Kein EI-Login erforderlich.</p></section></main>;
  }

  return <>
    {error && <div className="pit-shared-sync-warning">{error}</div>}
    <PitCrewLive key={`${race.key || race.name}:${mountRevision}`} race={race} onClose={onClose} sharedMode syncStatus={syncStatus} />
  </>;
}
