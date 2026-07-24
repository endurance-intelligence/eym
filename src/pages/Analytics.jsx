import { useMemo, useState } from "react";
import { useApp } from "../context/AppContext";
import { Card, Metric, PageTitle } from "../components/UI";
import { preferredActivities, sportGroup } from "../services/activityUtils";
import { buildTrainingAnalytics } from "../services/trainingAnalytics";
import { buildCoachState } from "../services/coachState";

const weekLabel = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" });

function sportBreakdown(activities) {
  const grouped = new Map();
  activities.forEach((activity) => {
    const group = sportGroup(activity);
    grouped.set(group.key, { key: group.key, label: group.label, count: (grouped.get(group.key)?.count || 0) + 1 });
  });
  return [...grouped.values()].sort((a, b) => b.count - a.count);
}

function yearStats(activities, year) {
  const filtered = activities.filter((activity) => Number(activity.date?.slice(0, 4)) === year);
  return {
    count: filtered.length,
    distance: filtered.reduce((sum, activity) => sum + Number(activity.distance || 0), 0),
    duration: filtered.reduce((sum, activity) => sum + Number(activity.duration || 0), 0),
    elevation: filtered.reduce((sum, activity) => sum + Number(activity.elevation || 0), 0),
    sports: sportBreakdown(filtered),
  };
}

function percentage(value) {
  return value == null ? "–" : `${Math.round(value * 100)} %`;
}

function IntensityRow({ label, value, total, tone }) {
  const width = total ? Math.max(4, value / total * 100) : 0;
  return (
    <div className="analytics-distribution-row">
      <div><span>{label}</span><strong>{value}</strong></div>
      <div className="analytics-distribution-track"><i className={tone} style={{ width: `${width}%` }} /></div>
    </div>
  );
}

export default function Analytics() {
  const { state } = useApp();
  const [weekCount, setWeekCount] = useState(8);
  const now = useMemo(() => new Date(), []);
  const activities = useMemo(() => preferredActivities(state.activities), [state.activities]);
  const analytics = useMemo(() => buildTrainingAnalytics(state, now, weekCount), [state, now, weekCount]);
  const coach = useMemo(() => buildCoachState(state, now), [state, now]);
  const currentYear = now.getFullYear();
  const yearRows = useMemo(() => [currentYear - 1, currentYear].map((year) => ({
    year,
    stats: yearStats(activities, year),
  })), [activities, currentYear]);
  const maxWeekKm = Math.max(1, ...analytics.weeks.flatMap((week) => [week.km, week.plannedKm]));
  const totalIntensity = Object.values(analytics.intensity).reduce((sum, value) => sum + value, 0);

  if (activities.length === 0) {
    return (
      <>
        <PageTitle eyebrow="Analytics" title="Zahlen mit Bedeutung" />
        <Card>
          <h2>Noch keine Daten</h2>
          <p className="muted">Importiere Garmin oder synchronisiere Intervals.icu. Danach zeigt EYM nicht nur Summen, sondern Umfang, Konstanz, Zielnähe und Datenqualität.</p>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageTitle eyebrow="Analytics" title="Trainingstrends">
        <div className="analytics-range-picker" aria-label="Analysezeitraum">
          {[8, 12].map((value) => <button type="button" className={weekCount === value ? "selected" : ""} onClick={() => setWeekCount(value)} key={value}>{value} Wochen</button>)}
        </div>
      </PageTitle>

      <div className="grid analytics-grid">
        <Card className={`wide analytics-coach-summary ${coach.level}`}>
          <div>
            <p className="eyebrow">Gemeinsame Coach-Bewertung</p>
            <h2>{coach.title}</h2>
            <p>{coach.recommendation.text}</p>
          </div>
          <span className={coach.tone}>{coach.label}</span>
        </Card>

        <Card className="wide analytics-metric-card">
          <div className="hero-stats analytics-hero-stats">
            <Metric label="Ø Laufumfang" value={`${analytics.metrics.averageKm.toFixed(1)} km`} sub={`pro Woche · ${weekCount} Wochen`} />
            <Metric label="Konstanz" value={percentage(analytics.metrics.consistency)} sub={`${analytics.metrics.activeWeeks}/${weekCount} aktive Wochen`} />
            <Metric label="Längster Lauf" value={`${analytics.metrics.longestRun.toFixed(1)} km`} sub="im gewählten Zeitraum" />
            <Metric label="Planerfüllung" value={percentage(analytics.metrics.planAdherence)} sub={analytics.metrics.plannedRuns ? `${analytics.metrics.completedPlan}/${analytics.metrics.plannedRuns} geplante Läufe` : "noch keine vergleichbaren Planeinträge"} />
          </div>
        </Card>

        <Card className="wide analytics-volume-card">
          <div className="card-heading-row">
            <div><p className="eyebrow">Wochenumfang</p><h2>Geplant und absolviert</h2></div>
            <div className={`analytics-trend ${analytics.trend.direction}`}><strong>{analytics.trend.label}</strong><span>3-Wochen-Trend</span></div>
          </div>
          <div className="analytics-week-chart" style={{ "--analytics-columns": weekCount }} role="img" aria-label={`Laufkilometer der letzten ${weekCount} Wochen`}>
            {analytics.weeks.map((week) => (
              <div className={`analytics-week-column ${week.current ? "current" : ""}`} key={week.key}>
                <div className="analytics-week-values"><span>{week.km.toFixed(1)}</span>{week.plannedKm > 0 && <small>{week.plannedKm.toFixed(0)}</small>}</div>
                <div className="analytics-week-bars">
                  <i className="actual" style={{ height: `${week.km / maxWeekKm * 100}%` }} title={`${week.km.toFixed(1)} km absolviert`} />
                  <i className="planned" style={{ height: `${week.plannedKm / maxWeekKm * 100}%` }} title={`${week.plannedKm.toFixed(1)} km geplant`} />
                </div>
                <b>{weekLabel.format(week.start)}</b>
              </div>
            ))}
          </div>
          <div className="analytics-chart-legend"><span><i className="actual" /> absolviert</span><span><i className="planned" /> geplant</span><p>{analytics.trend.text}</p></div>
        </Card>

        <Card className="analytics-specificity-card">
          <div className="analytics-score-heading">
            <div><p className="eyebrow">Zielnähe</p><h2>{analytics.specificity.label}</h2></div>
            <strong>{analytics.specificity.score}<small>/100</small></strong>
          </div>
          <div className="progress"><i style={{ width: `${analytics.specificity.score}%` }} /></div>
          <p className="muted">{analytics.specificity.text}</p>
          <div className="analytics-small-metrics">
            <span><b>{analytics.metrics.longRuns}</b> lange Läufe</span>
            <span><b>{analytics.metrics.backToBackBlocks}</b> Back-to-Back</span>
            <span><b>{Math.round(analytics.metrics.weeklyElevation)}</b> hm/Woche</span>
          </div>
        </Card>

        <Card className="analytics-intensity-card">
          <p className="eyebrow">Trainingsmix</p>
          <h2>Keine einzelne Kennzahl entscheidet</h2>
          <div className="analytics-distribution">
            <IntensityRow label="Locker erkannt" value={analytics.intensity.easy} total={totalIntensity} tone="easy" />
            <IntensityRow label="Ruhig / nicht eindeutig" value={analytics.intensity.steady} total={totalIntensity} tone="steady" />
            <IntensityRow label="Qualität" value={analytics.intensity.quality} total={totalIntensity} tone="quality" />
            <IntensityRow label="Lang / spezifisch" value={analytics.intensity.long} total={totalIntensity} tone="long" />
          </div>
          <p className="muted analytics-classification-note">Die Einordnung nutzt Aktivitätsname, Typ, Distanz und Dauer. Sie ersetzt keine exakte physiologische Zonenanalyse.</p>
        </Card>

        <Card className="analytics-review-card">
          <p className="eyebrow">Reviews & Lernen</p>
          <h2>{analytics.metrics.reviewedRuns}/{analytics.metrics.runs} Läufe bewertet</h2>
          <div className="analytics-small-metrics">
            <span className="good"><b>{analytics.metrics.stableReviews}</b> stabil</span>
            <span className={analytics.metrics.warningReviews ? "warn" : ""}><b>{analytics.metrics.warningReviews}</b> Warnsignal</span>
          </div>
          <p className="muted">Reviews verbinden objektive Belastung mit Beinen, Energie und Körpergefühl. Genau daraus entsteht die persönliche Coach-Einordnung.</p>
        </Card>

        <Card className="analytics-fuel-card">
          <p className="eyebrow">Fuel-Praxis</p>
          <h2>{analytics.metrics.fuelTracked}/{analytics.metrics.fuelRuns} lange Einheiten erfasst</h2>
          <div className="analytics-small-metrics">
            <span><b>{analytics.metrics.fuelInRange}</b> im Zielbereich</span>
            <span><b>{Math.max(0, analytics.metrics.fuelRuns - analytics.metrics.fuelTracked)}</b> ohne Fuel-Daten</span>
          </div>
          <p className="muted">Nur Läufe ab 90 Minuten zählen hier. EYM bewertet nicht das Produktmarketing, sondern deine dokumentierte Aufnahme und Verträglichkeit.</p>
        </Card>

        <Card className="wide analytics-confidence-card">
          <div>
            <p className="eyebrow">Datenqualität</p>
            <h2>{analytics.confidence.label} · {analytics.confidence.score}/100</h2>
            <p className="muted">{analytics.confidence.text}</p>
          </div>
          <div className="analytics-confidence-scale"><i style={{ width: `${analytics.confidence.score}%` }} /></div>
        </Card>

        <details className="wide analytics-year-disclosure">
          <summary><div><p className="eyebrow">Langzeitvergleich</p><strong>{currentYear - 1} und {currentYear} anzeigen</strong><span>Gesamtdistanz, Zeit, Höhenmeter und Sportarten</span></div><b>⌄</b></summary>
          <div className="analytics-year-grid">
            {yearRows.map(({ year, stats }) => (
              <Card key={year}>
                <p className="eyebrow">{year}</p>
                <div className="analytics-year-metrics">
                  <Metric label="Einheiten" value={stats.count} />
                  <Metric label="Distanz" value={`${stats.distance.toFixed(1)} km`} />
                  <Metric label="Zeit" value={`${Math.round(stats.duration / 60)} h`} />
                  <Metric label="Höhenmeter" value={`${Math.round(stats.elevation)} hm`} />
                </div>
                <div className="sport-breakdown" aria-label={`Sportarten ${year}`}>
                  {stats.sports.map((sport) => <div className="sport-breakdown-item" key={sport.key}><span>{sport.label}</span><strong>{sport.count}</strong></div>)}
                </div>
              </Card>
            ))}
          </div>
        </details>
      </div>
    </>
  );
}
