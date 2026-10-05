import { useMemo, useState } from "react";
import Analytics from "./Analytics";
import { Card, PageTitle } from "../components/UI";
import SectionNav from "../components/SectionNav";
import { useApp } from "../context/AppContext";
import { buildTrainingAnalytics } from "../services/trainingAnalytics";
import { buildCoachState } from "../services/coachState";
import "./AnalyticsSummary.css";

function toneClass(tone) {
  if (tone === "bad" || tone === "warn" || tone === "watch") return "watch";
  if (tone === "good" || tone === "ok") return "good";
  return "neutral";
}

export default function AnalyticsSummary() {
  const { state } = useApp();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const now = useMemo(() => new Date(), []);
  const analytics = useMemo(() => buildTrainingAnalytics(state, now, 8), [state, now]);
  const coach = useMemo(() => buildCoachState(state, now), [state, now]);
  const trend = analytics.trend || {};
  const recovery = coach.recovery || {};
  const specificity = analytics.specificity || {};
  const consequence = coach.recommendation?.text || "Keine belastbare Änderung nötig – bestehende Woche kontrolliert fortsetzen.";

  return (
    <>
      <PageTitle eyebrow="Training" title="Analyse" />
      <SectionNav />

      <Card className="wide analytics-brief">
        <div className="analytics-brief-head">
          <div><p className="eyebrow">Coach Intelligence</p><h2>Was ist gerade wirklich wichtig?</h2><p>Drei Signale, eine Konsequenz. Die Rohdaten bleiben verfügbar, stehen aber nicht mehr im Weg.</p></div>
        </div>
        <div className="analytics-signal-grid">
          <article className={toneClass(trend.tone)}>
            <small>Umfang</small>
            <strong>{trend.label || "Verlauf prüfen"}</strong>
            <span>{trend.text || "Der 8-Wochen-Verlauf wird gegen deine aktuelle Belastung gestellt."}</span>
          </article>
          <article className={toneClass(recovery.tone)}>
            <small>Erholung</small>
            <strong>{recovery.label || "Keine klare Warnung"}</strong>
            <span>{recovery.reviewed ? `Beine ${recovery.legs}/10 · Energie ${recovery.energy}/10 · RPE ${recovery.rpe}/10.` : "Aktuell fehlt eine frische subjektive Rückmeldung."}</span>
          </article>
          <article className={toneClass(specificity.tone)}>
            <small>Zielspezifität</small>
            <strong>{specificity.label || "Zielbezug prüfen"}</strong>
            <span>{specificity.text || "EI gleicht Trainingsbasis und die Anforderungen des Hauptziels ab."}</span>
          </article>
        </div>
        <div className="analytics-consequence">
          <small>Konsequenz</small>
          <strong>{coach.recommendation?.title || "Plan kontrolliert weiterführen"}</strong>
          <p>{consequence}</p>
        </div>
      </Card>

      <button type="button" className="analytics-detail-toggle" onClick={() => setDetailsOpen((value) => !value)} aria-expanded={detailsOpen}>
        {detailsOpen ? "Daten & Trends schließen" : "Daten & Trends anzeigen"}
      </button>

      {detailsOpen && <div className="analytics-detail-shell"><Analytics /></div>}
    </>
  );
}
