import { useState } from "react";
import { resetPassword, signIn, signUp } from "../services/supabase";

const allowSignup = String(import.meta.env.VITE_ALLOW_SIGNUP || "false").toLowerCase() === "true";

export default function Auth() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      if (mode === "reset") {
        await resetPassword(email.trim());
        setMessage("Eine E-Mail zum Zurücksetzen des Passworts wurde verschickt.");
      } else if (mode === "register" && allowSignup) {
        const result = await signUp(email.trim(), password);
        setMessage(result.session ? "Konto erstellt. Du bist angemeldet." : "Konto erstellt. Bitte bestätige jetzt die E-Mail und melde dich danach an.");
      } else {
        await signIn(email.trim(), password);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  const resetMode = mode === "reset";
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">Privater Zugang</p>
        <h1>Endurance Intelligence</h1>
        <p className="auth-tagline">Eat your miles.</p>
        <p className="muted">Deine Aktivitäten, dein Wochenplan und deine Einstellungen – synchron auf allen Geräten.</p>
        <form onSubmit={submit} className="auth-form">
          <label>E-Mail<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          {!resetMode && <label>Passwort<input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength="6" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>}
          <button className="primary" disabled={busy}>{busy ? "Bitte warten …" : resetMode ? "Reset-Link senden" : mode === "login" ? "Anmelden" : "Konto erstellen"}</button>
        </form>
        {message && <p className="connection-message">{message}</p>}
        <div className="auth-secondary-actions">
          {mode === "login" && <button className="auth-switch" onClick={() => { setMode("reset"); setMessage(""); }}>Passwort vergessen?</button>}
          {resetMode && <button className="auth-switch" onClick={() => { setMode("login"); setMessage(""); }}>Zurück zur Anmeldung</button>}
          {allowSignup && mode !== "reset" && <button className="auth-switch" onClick={() => { setMode((current) => current === "login" ? "register" : "login"); setMessage(""); }}>{mode === "login" ? "Noch kein Konto? Registrieren" : "Schon registriert? Anmelden"}</button>}
        </div>
      </section>
    </main>
  );
}
