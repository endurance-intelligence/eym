import { useMemo, useState } from "react";
import { useApp } from "../context/AppContext";
import { Card, PageTitle } from "../components/UI";
import { coachDashboard } from "../services/insights";
import { buildMissionOutlook } from "../services/missionOutlook";
import {
  activityDate,
  activityTimestamp,
  preferredActivities,
  reviewKind,
  reviewKindLabel,
} from "../services/activityUtils";
import ReviewModal from "../components/ReviewModal";
import { activitiesWithGroups } from "../services/activityGroups";
import { fmtDate } from "../utils/format";

const monthFormatter = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" });

function SignalCard({ eyebrow, signal }) {
  return (
    <Card className={`coach-signal-card ${signal.tone || "neutral"}`}>
      <p className="eyebrow">{eyebrow}</p>
      <h2>{signal.value}</h2>
      <p className="muted">{signal.text}</p>
    </Card>
  );
}

export default function Coach() {
  const { state } = useApp();
  const [selected, setSelected] = useState(null);
  const now = useMemo(() => new Date(), []);
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const canonicalActivities = useMemo(() => preferredActivities(state.activities), [state.activities]);
  const reviewActivities = useMemo(() => activitiesWithGroups(canonicalActivities, state.activityGroups), [canonicalActivities, state.activityGroups]);
  const monthReviewable = useMemo(() => reviewActivities
    .filter((activity) => reviewKind(activity) && activityDate(activity).startsWith(currentMonth))
    .sort((a, b) => activityTimestamp(b) - activityTimestamp(a)), [reviewActivities, currentMonth]);
  const openReviews = monthReviewable.filter((activity) => !state.reviews[activity.id]);
  const reviewed = monthReviewable.filter((activity) => state.reviews[activity.id]);
  const analysis = useMemo(() => coachDashboard(reviewActivities, state.reviews, now), [reviewActivities, state.reviews, now]);
  const outlook = useMemo(() => buildMissionOutlook(reviewActivities, state.reviews, state.mission, now), [reviewActivities, state.reviews, state.mission, now]);

  return (
    <>
      <PageTitle eyebrow="Coach Engine" title="Was deine Einheiten lehren" />
      <div className="grid coach-dashboard-grid">
        <Card className="wide insight coach-recommendation">
          <p className="eyebrow">Aktuelle Empfehlung</p>
          <h2>{analysis.recommendation}</h2>
        </Card>

        <Card className="wide coach-mission-outlook">
          <div className="coach-outlook-heading">
            <div>
              <p className="eyebrow">Missionsausblick</p>
              <h2>{outlook.nextTarget ? `${outlook.nextTarget.name} in ${outlook.nextDays} Tagen` : "Kein nächstes Ziel hinterlegt"}</h2>
              <p className="muted">{outlook.nextTarget ? `Zielkorridor: ${outlook.targetRange.label}. Der Coach bewertet nicht nur Kilometer, sondern Kontinuität, Longrun, Schlüsselreize und Erholung.` : "Lege unter Mission Control einen Wettkampf oder Meilenstein an."}</p>
            </div>
            <div className={`coach-readiness-badge ${outlook.readiness.tone}`}>
              <strong>{outlook.score}%</strong>
              <span>{outlook.readiness.label}</span>
            </div>
          </div>
          <div className="coach-outlook-metrics">
            <div><span>Ø 8 Wochen</span><strong>{outlook.averageKm} km/Woche</strong></div>
            <div><span>Längster Lauf</span><strong>{outlook.longestRun} km</strong></div>
            <div><span>Aktive Wochen</span><strong>{outlook.activeWeeks}/8</strong></div>
            <div><span>Schlüsseleinheiten</span><strong>{outlook.keySessions}</strong></div>
          </div>
          <div className="coach-loop-preview">
            <div><p className="eyebrow">Nächster spezifischer Loop-Block</p><h3>{outlook.loop.title}</h3><p>{outlook.loop.text}</p></div>
            <p className="coach-readiness-copy">{outlook.readiness.text} {outlook.expectedHard ? `${outlook.expectedHard} harte Schlüsseleinheit${outlook.expectedHard === 1 ? " wurde" : "en wurden"} als erwarteter Trainingsreiz erkannt und nicht automatisch als Überlastung gewertet.` : ""}</p>
          </div>
          {outlook.roadmap.length > 0 && <div className="coach-roadmap">{outlook.roadmap.map((step) => <article key={`${step.label}-${step.title}`}><span>{step.label}</span><h3>{step.title}</h3><p>{step.text}</p></article>)}</div>}
          {outlook.mainTarget && outlook.nextTarget && outlook.mainTarget.id !== outlook.nextTarget.id && <p className="coach-main-target-note"><strong>Danach:</strong> {outlook.mainTarget.name} in {outlook.mainDays} Tagen. Der Zwischenwettkampf wird als Belastungsreiz und nicht als Störung der Fulda-Vorbereitung behandelt.</p>}
        </Card>

        <Card className="coach-review-summary">
          <p className="eyebrow">Reviews im Monat</p>
          <h2>{reviewed.length}/{monthReviewable.length} bewertet</h2>
          <p className="muted">{openReviews.length ? `${openReviews.length} relevante ${openReviews.length === 1 ? "Einheit ist" : "Einheiten sind"} noch offen.` : `Alle relevanten Einheiten aus ${monthFormatter.format(now)} sind bewertet.`}</p>
        </Card>
        <SignalCard eyebrow="HF & Wetter" signal={analysis.hrWeather} />
        <SignalCard eyebrow="Schlüsseleinheiten" signal={analysis.keySessions} />
        <SignalCard eyebrow="Fuel & Hydration" signal={analysis.fuel} />

        {openReviews.length > 0 && (
          <Card className="wide">
            <div className="card-heading-row"><div><p className="eyebrow">Review-Warteschlange</p><h2>{monthFormatter.format(now)}</h2></div><span>{openReviews.length}</span></div>
            <div className="coach-review-list">
              {openReviews.map((activity) => (
                <button key={activity.id} onClick={() => setSelected(activity)}>
                  <div><strong>{activity.name}</strong><span>{fmtDate(activityDate(activity))} · {reviewKindLabel(activity)}{Number(activity.distance || 0) ? ` · ${Number(activity.distance).toFixed(1)} km` : ""}</span></div>
                  <em>Review öffnen →</em>
                </button>
              ))}
            </div>
          </Card>
        )}
      </div>
      {selected && <ReviewModal activity={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
