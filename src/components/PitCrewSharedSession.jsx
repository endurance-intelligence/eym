import { useEffect, useRef, useState } from "react";
import PitCrewLive from "./PitCrewLive";
import {
  loadPitCrewShare,
  readPitCrewLocalSnapshot,
  updatePitCrewShare,
  writePitCrewLocalSnapshot,
} from "../services/pitCrewShare.js";

const POLL_MS = 2500;
const LOCAL_WATCH_MS = 700;

function normalizedSnapshot(value = {}) {
  return {
    anchorAt: String(value?.anchorAt || ""),
    history: Array.isArray(value?.history) ? value.history : [],
    flags: Array.isArray(value?.flags) ? value.flags : [],
    weather: Array.isArray(value?.weather) ? value.weather : [],
    arrivalRound: Math.max(0, Number(value?.arrivalRound || 0)),
    arrivalAt: String(value?.arrivalAt || ""),
  };
}

export default function PitCrewSharedSession({ token, race: raceFallback = null, onClose = null }) {
  const [share, setShare] = useState(null);
  const [error, setError] = useState("");
  const [mountRevision, setMountRevision] = useState(0);
  const revisionRef = useRef(0);
  const lastLocalRef = useRef("");
  const pushingRef = useRef(false);
  const race = share?.race || raceFallback;

  useEffect(() => {
    let active = true;
    loadPitCrewShare(token)
      .then((loaded) => {
        if (!active) return;
        const next = { ...loaded, state: normalizedSnapshot(loaded.state) };
        writePitCrewLocalSnapshot(next.race || raceFallback || {}, next.state);
        lastLocalRef.current = JSON.stringify(next.state);
        revisionRef.current = next.revision;
        setShare(next);
        setMountRevision((value) => value + 1);
      })
      .catch((cause) => active && setError(cause?.message || "Der Crew-Link konnte nicht geladen werden."));
    return () => { active = false; };
  }, [raceFallback, token]);

  useEffect(() => {
    if (!share?.race) return undefined;
    let active = true;
    const timer = window.setInterval(async () => {
      try {
        const remote = await loadPitCrewShare(token);
        if (!active || Number(remote.revision || 0) <= revisionRef.current) return;
        const nextState = normalizedSnapshot(remote.state);
        const serialized = JSON.stringify(nextState);
        revisionRef.current = Number(remote.revision || 0);
        if (serialized === lastLocalRef.current) return;
        writePitCrewLocalSnapshot(remote.race || share.race, nextState);
        lastLocalRef.current = serialized;
        setShare((current) => ({ ...(current || {}), ...remote, state: nextState }));
        setMountRevision((value) => value + 1);
      } catch (cause) {
        if (active) setError(cause?.message || "Crew-Sync ist kurzzeitig nicht erreichbar.");
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
      const snapshot = normalizedSnapshot(readPitCrewLocalSnapshot(share.race));
      const serialized = JSON.stringify(snapshot);
      if (!serialized || serialized === lastLocalRef.current) return;
      lastLocalRef.current = serialized;
      pushingRef.current = true;
      try {
        const saved = await updatePitCrewShare(token, snapshot);
        if (!active) return;
        revisionRef.current = Math.max(revisionRef.current, Number(saved.revision || 0));
        setShare((current) => ({ ...(current || {}), state: normalizedSnapshot(saved.state), revision: saved.revision }));
        setError("");
      } catch (cause) {
        if (active) setError(cause?.message || "Crew-Änderung konnte nicht synchronisiert werden.");
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
    return <main className="auth-shell"><section className="auth-card"><p className="eyebrow">Pit Crew Live</p><h1>Crew-Link nicht verfügbar</h1><p className="muted">{error}</p></section></main>;
  }
  if (!race) {
    return <main className="auth-shell"><section className="auth-card"><p className="eyebrow">Pit Crew Live</p><h1>Crew-Session wird geladen …</h1><p className="muted">Kein EI-Login erforderlich.</p></section></main>;
  }

  return <>
    {error && <div className="pit-shared-sync-warning">{error}</div>}
    <PitCrewLive key={`${race.key || race.name}:${mountRevision}`} race={race} onClose={onClose || (() => window.location.assign(import.meta.env.BASE_URL))} />
  </>;
}
