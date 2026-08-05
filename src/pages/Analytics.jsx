import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { Card, Metric, PageTitle } from "../components/UI";
import TrainingSectionNav from "../components/SectionNav";
import { activityDate, preferredActivities } from "../services/activityUtils";
import { buildAnalyticsIntelligence } from "../services/analyticsIntelligence";
import { buildTrainingAnalytics } from "../services/trainingAnalytics";
import { buildYearStats, formatActivityDistance } from "../services/yearActivityStats";

const weekLabel = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" });
const dateLabel = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

function percentage(value) {
  return value == null ? "–" : `${Math.round(value * 100)} %`;
}

function compactHours(minutes) {
  const value = Math.max(0, Number(minutes) || 0);
  const hours = Math.floor(value / 60);
  const rest = Math.round(value % 60);
  return hours ? `${hours}:${String(rest).padStart(2, "0")} h` : `${rest} min`;
}

function SportBreakdown({ year, sports, selectedKey, onSelect }) {
  const selected = sports.find((sport) => sport.key === selectedKey) || null;

  return (
    <div className="sport-breakdown-shell">
      <div className="sport-breakdown" aria-label={`Sportarten ${year}`}>
        {sports.map((sport) => {
          const selectedSport = selected?.key === sport.key;
          return (
            <button
              type="button"
              className={`sport-breakdown-item ${selectedSport ? "selected" : ""}`}
              key={sport.key}
              aria-expanded={selectedSport}
              aria-controls={`sport-breakdown-detail-${year}`}
              onClick={() => onSelect(selectedSport ? null : sport.key)}
            >
              <span>{sport.label}</span>
              <strong>{sport.count}</strong>
            </button>
          );
        })}
      </div>
      {selected && (
        <div className="sport-breakdown-detail" id={`sport-breakdown-detail-${year}`} role="status">
          <div>
            <small>{selected.label} · {year}</small>
            <strong>{formatActivityDistance(selected.distance)}</strong>
          </div>
          <span>{selected.count} {selected.count === 1 ? "Einheit" : "Einheiten"}</span>
        </div>
      )}
    </div>
  );
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

function InsightItem({ insight }) {
  return (
    <article className={`analytics-intelligence-item ${insight.tone}`}>
      <div><span className="analytics-insight-dot" /><small>{insight.kicker}</small></div>
      <h3>{insight.title}</h3>
      <p>{insight.text}</p>
    </article>
  );
}

function ReadinessFactor({ factor }) {
  return (
    <article className={`analytics-readiness-factor ${factor.tone}`}>
      <div><span>{factor.label}</span><b>{factor.value}</b></div>
      <p>{factor.text}</p>
    </article>
  );
}

function LearningPattern({ pattern }) {
  return (
    <article className={`analytics-learning-pattern ${pattern.tone}`}>
      <div><span>{pattern.title}</span><strong>{pattern.value}</strong></div>
      <p>{pattern.text}</p>
      <small>{pattern.sample}</small>
    </article>
  );
}

export default function Analytics() {
  const { state } = useApp();
  const [weekCount, setWeekCount] = useState(8);
  const [selectedYearSports, setSelectedYearSports] = useState({});
  const now = useMemo(() => new Date(), []);
  const activities = useMemo(() => preferredActivities(state.activities), [state.activities]);
  const analytics = useMemo(() => buildTrainingAnalytics(state, now, weekCount), [state, now, weekCount]);
  const intelligence = useMemo(() => buildAnalyticsIntelligence(state, analytics, now), [state, analytics, now]);
  const currentYear = now.getFullYear();
  const yearRows = useMemo(() => [currentYear - 1, currentYear].map((year) => ({
    year,
    stats: buildYearStats(activities, year),
  })), [activities, currentYear]);
  const maxWeekKm = Math.max(1, ...analytics.weeks.flatMap((week) => [week.km, week.plannedKm]));
  const maxLongRun = Math.max(1, ...intelligence.longRun.weeks.map((week) => week.distance));
  const maxCrossMinutes = Math.max(1, ...intelligence.crossTraining.rows.map((row) => row.minutes));
  const totalIntensity = Object.values(analytics.intensity).reduce((sum, value) => sum + value, 0);
  const reviewStartLabel = weekLabel.format(new Date(`${analytics.reviewCoverage.trackingStart}T12:00:00`));

  if (activities.length === 0) {
    return (
      <>
        <PageTitle eyebrow="Training" title="Analyse" />
        <TrainingSectionNav />
        <Card>
          <h2>Noch keine Daten</h2>
          <p className="muted">Importiere Garmin oder synchronisiere Intervals.icu. Danach zeigt die Analyse Entwicklungen, Zusammenhänge und konkrete Coach-Erkenntnisse.</p>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageTitle eyebrow="Training" title="Analyse">
        <div className="analytics-range-picker" aria-label="Analysezeitraum">
          {[8, 12].map((value) => <button type="button" className={weekCount === value ? "selected" : ""} onClick={() => setWeekCount(value)} key={value}>{value} Wochen</button>)}
        </div>
      </PageTitle>
      <TrainingSectionNav />

      <div className="grid analytics-grid">
        <Card className="wide analytics-intelligence-hero">
          <div className="analytics-intelligence-heading">
            <div>
              <p className="eyebrow">Coach Intelligence</p>
              <h2>Was deine Daten gerade sagen</h2>
              <p>Entwicklung, Warnsignale und der nächste sinnvolle Schritt – ohne Rohdatenfriedhof.</p>
            </div>
            <span className={intelligence.outlook.readiness.tone}>{intelligence.outlook.readiness.label}</span>
          </div>
          <div className="analytics-intelligence-grid">
            {intelligence.insights.map((insight) => <InsightItem insight={insight} key={insight.id} />)}
          </div>
        </Card>

        <Card className="wide analytics-metric-card">
          <div className="hero-stats analytics-hero-stats">
            <Metric label="Ø Laufumfang" value={`${analytics.metrics.averageKm.toFixed(1)} km`} sub={`pro Woche · ${weekCount} Wochen`} />
            <Metric label="Aktive Wochen" value={`${analytics.metrics.activeCompletedWeeks}/${analytics.metrics.completedWeekCount}`} sub="nur abgeschlossene Wochen" />
            <Metric label="Längster Lauf" value={`${analytics.metrics.longestRun.toFixed(1)} km`} sub="im gewählten Zeitraum" />
            <Metric label="Zeit auf den Beinen" value={compactHours(analytics.metrics.timeOnFeetMinutes)} sub={`${analytics.metrics.runs} absolvierte Läufe`} />
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

        <Card className="wide analytics-readiness-card">
          <div className="analytics-readiness-heading">
            <div>
              <p className="eyebrow">Zielbereitschaft</p>
              <h2>{intelligence.outlook.phaseLabel}</h2>
              <p>{intelligence.outlook.readiness.text}</p>
            </div>
            <span className={intelligence.outlook.readiness.tone}>{intelligence.outlook.readiness.label}</span>
          </div>
          <div className="analytics-readiness-grid">
            {intelligence.outlook.factors.map((factor) => <ReadinessFactor factor={factor} key={factor.id} />)}
          </div>
          <small className="analytics-data-scope">{intelligence.outlook.dataScope}</small>
        </Card>

        <Card className="analytics-longrun-card">
          <div className="card-heading-row analytics-compact-heading">
            <div><p className="eyebrow">Longrun & Robustheit</p><h2>{intelligence.longRun.status}</h2></div>
            <span className={intelligence.longRun.tone}>{intelligence.longRun.longest.toFixed(1)} km</span>
          </div>
          <p className="muted">{intelligence.longRun.text}</p>
          <div className="analytics-longrun-bars" style={{ "--analytics-columns": weekCount }} role="img" aria-label="Längster Lauf je Woche">
            {intelligence.longRun.weeks.map((week) => (
              <div className={week.current ? "current" : ""} key={week.key}>
                <span>{week.distance > 0 ? week.distance.toFixed(0) : ""}</span>
                <i style={{ height: `${week.distance / maxLongRun * 100}%` }} />
                <small>{weekLabel.format(week.start)}</small>
              </div>
            ))}
          </div>
          <div className="analytics-small-metrics">
            <span><b>{intelligence.longRun.count}</b> lange Läufe</span>
            <span><b>{compactHours(intelligence.longRun.totalMinutes)}</b> Longrun-Zeit</span>
            <span><b>{analytics.metrics.backToBackBlocks}</b> Back-to-Back</span>
          </div>
        </Card>

        <Card className="analytics-efficiency-card">
          <div className="card-heading-row analytics-compact-heading">
            <div><p className="eyebrow">Aerobe Effizienz</p><h2>{intelligence.efficiency.status}</h2></div>
            {intelligence.efficiency.changePercent != null && <span className={intelligence.efficiency.tone}>{intelligence.efficiency.changePercent >= 0 ? "+" : ""}{intelligence.efficiency.changePercent} %</span>}
          </div>
          <p className="muted">{intelligence.efficiency.text}</p>
          <div className="analytics-efficiency-facts">
            <span><small>Aktuelle Vergleichspace</small><strong>{intelligence.efficiency.pace}</strong></span>
            <span><small>Ø Herzfrequenz</small><strong>{intelligence.efficiency.heartRate ? `${intelligence.efficiency.heartRate} bpm` : "–"}</strong></span>
            <span><small>Vergleichsläufe</small><strong>{intelligence.efficiency.sampleSize}</strong></span>
          </div>
          <small className="analytics-method-note">Verglichen werden nur lockere oder ruhige Läufe mit plausibler Pace und Herzfrequenz.</small>
        </Card>

        <Card className="analytics-cross-card">
          <p className="eyebrow">Cross-Training</p>
          <h2>{intelligence.crossTraining.totalMinutes ? compactHours(intelligence.crossTraining.totalMinutes) : "Noch offen"}</h2>
          <p className="muted">{intelligence.crossTraining.text}</p>
          <div className="analytics-cross-list">
            {intelligence.crossTraining.rows.map((row) => (
              <div key={row.key}>
                <div><span>{row.label}</span><strong>{compactHours(row.minutes)}</strong></div>
                <i><b style={{ width: `${row.minutes / maxCrossMinutes * 100}%` }} /></i>
              </div>
            ))}
          </div>
          <div className="analytics-small-metrics">
            {intelligence.crossTraining.footballKm > 0 && <span><b>{intelligence.crossTraining.footballKm.toFixed(1)} km</b> Fußballlast</span>}
            {intelligence.crossTraining.roadCyclingAerobicMinutes > 0 && <span><b>{intelligence.crossTraining.roadCyclingAerobicMinutes} min</b> aerober Radersatz</span>}
            {intelligence.crossTraining.coachLoad > 0 && <span><b>{intelligence.crossTraining.coachLoad}</b> Coach-Load</span>}
          </div>
        </Card>

        <Card className="analytics-quality-card">
          <p className="eyebrow">Schlüsselreize & Track</p>
          <h2>{intelligence.quality.count} Qualitätseinheiten</h2>
          {intelligence.quality.latest ? (
            <div className="analytics-quality-latest">
              <small>Zuletzt · {dateLabel.format(new Date(`${intelligence.quality.latest.date}T12:00:00`))}</small>
              <strong>{intelligence.quality.latest.name}</strong>
              <span>{intelligence.quality.latest.distance.toFixed(1)} km · {compactHours(intelligence.quality.latest.durationMinutes)} · {intelligence.quality.latest.averagePace}</span>
            </div>
          ) : <p className="muted">Noch keine Qualitätseinheit im gewählten Zeitraum.</p>}
          <p className="muted analytics-method-note">{intelligence.quality.text}</p>
          {intelligence.quality.averageLoad != null && <div className="analytics-quality-load"><span>Ø externer Belastungswert</span><strong>{intelligence.quality.averageLoad}</strong></div>}
        </Card>

        <Card className="wide analytics-learning-card">
          <div className="card-heading-row">
            <div><p className="eyebrow">Persönliche Zusammenhänge</p><h2>Was der Coach aus deinen Reviews lernt</h2></div>
            <span className="neutral">keine pauschalen Regeln</span>
          </div>
          <div className="analytics-learning-grid">
            {intelligence.learning.map((pattern) => <LearningPattern pattern={pattern} key={pattern.id} />)}
          </div>
        </Card>

        <Card className="analytics-intensity-card">
          <p className="eyebrow">Trainingsmix</p>
          <h2>Reize im gewählten Zeitraum</h2>
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
          <h2>{analytics.reviewCoverage.reviewed.length}/{analytics.reviewCoverage.eligible.length} vollständig</h2>
          <div className="analytics-small-metrics">
            <span className="good"><b>{analytics.metrics.stableReviews}</b> stabil</span>
            <span className={analytics.metrics.warningReviews ? "warn" : ""}><b>{analytics.metrics.warningReviews}</b> Warnsignal</span>
            <span><b>{percentage(analytics.metrics.planAdherence)}</b> Planerfüllung</span>
          </div>
          <p className="muted">Gezählt werden nur relevante Läufe seit {reviewStartLabel}. Ältere importierte Aktivitäten verändern die Quote nicht.</p>
          {analytics.reviewCoverage.missing.length > 0 ? (
            <div className="analytics-missing-reviews">
              <strong>{analytics.reviewCoverage.missing.length} {analytics.reviewCoverage.missing.length === 1 ? "Review fehlt" : "Reviews fehlen"}</strong>
              {analytics.reviewCoverage.missing.map((activity) => (
                <Link to="/training" state={{ activityId: activity.id }} key={activity.id}>
                  <span>{weekLabel.format(new Date(`${activityDate(activity)}T12:00:00`))} · {activity.name || activity.type || "Training"}</span>
                  <b>Nachtragen →</b>
                </Link>
              ))}
            </div>
          ) : (
            <div className="analytics-review-complete">✓ Alle relevanten Reviews seit {reviewStartLabel} sind vorhanden.</div>
          )}
        </Card>

        <Card className="analytics-fuel-card">
          <p className="eyebrow">Fuel-Praxis</p>
          <h2>{analytics.metrics.fuelTracked}/{analytics.metrics.fuelRuns} lange Einheiten erfasst</h2>
          <div className="analytics-small-metrics">
            <span><b>{analytics.metrics.fuelInRange}</b> im Zielbereich</span>
            <span><b>{Math.max(0, analytics.metrics.fuelRuns - analytics.metrics.fuelTracked)}</b> ohne Fuel-Daten</span>
          </div>
          <p className="muted">Nur Läufe ab 90 Minuten zählen hier. Bewertet werden dokumentierte Aufnahme und Verträglichkeit, nicht das Produktmarketing.</p>
        </Card>

        <Card className="wide analytics-confidence-card">
          <div>
            <p className="eyebrow">Datengrundlage</p>
            <h2>{analytics.confidence.label}</h2>
            <p className="muted">{analytics.confidence.text}</p>
          </div>
          <div className="analytics-confidence-facts">
            <span><small>Reviews</small><strong>{analytics.reviewCoverage.reviewed.length}/{analytics.reviewCoverage.eligible.length}</strong></span>
            <span><small>Herzfrequenz</small><strong>{percentage(analytics.confidence.coverage.heartRate)}</strong></span>
            <span><small>Belastungswert</small><strong>{percentage(analytics.confidence.coverage.load)}</strong></span>
          </div>
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
                <SportBreakdown
                  year={year}
                  sports={stats.sports}
                  selectedKey={selectedYearSports[year] || null}
                  onSelect={(key) => setSelectedYearSports((current) => ({ ...current, [year]: key }))}
                />
              </Card>
            ))}
          </div>
        </details>
      </div>
    </>
  );
}
