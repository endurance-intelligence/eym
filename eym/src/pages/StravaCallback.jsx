import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { exchangeCode } from "../services/strava";

export default function StravaCallback() {
  const navigate = useNavigate();
  const { setState, syncStravaNow } = useApp();
  const [message, setMessage] = useState("Strava wird sicher verbunden …");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const error = params.get("error");

    async function finish() {
      try {
        if (error) throw new Error("Strava-Verbindung wurde abgebrochen.");
        if (!code || !state) throw new Error("Strava hat keinen gültigen Verbindungscode geliefert.");
        const result = await exchangeCode(code, state);
        setState((current) => ({
          ...current,
          strava: { ...current.strava, connected: true, athlete: result.athlete || null },
        }));
        setMessage("Verbindung steht. Aktivitäten werden synchronisiert …");
        await syncStravaNow();
        navigate("/settings", { replace: true });
      } catch (connectionError) {
        setMessage(connectionError instanceof Error ? connectionError.message : String(connectionError));
      }
    }

    finish();
  }, [navigate, setState, syncStravaNow]);

  return <main className="auth-shell"><section className="auth-card"><p className="eyebrow">Strava</p><h1>Verbindung</h1><p className="muted">{message}</p>{message.includes("fehl") || message.includes("abgebrochen") || message.includes("gültigen") ? <button className="primary" onClick={() => navigate("/settings", { replace: true })}>Zurück zu Settings</button> : null}</section></main>;
}
