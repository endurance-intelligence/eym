import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { useApp } from "../context/AppContext";
import { Card, PageTitle } from "../components/UI";
import { daysUntil, pace, hours } from "../utils/format";
import WeatherCard from "../components/WeatherCard";
import { activityTimestamp, isRunningActivity, preferredActivities, reviewKind } from "../services/activityUtils";
import { activitiesWithGroups } from "../services/activityGroups";
import { buildCoachState } from "../services/coachState";
import { workoutSortTime, workoutTimingLabel } from "../services/plannerTime";
import { briefingWorkoutDestination } from "../services/briefingNavigation";
import { workoutPaceLabel } from "../services/workoutPace";
import { isLoopWorkout, loopWorkoutCompactLabel, loopWorkoutPaceLabel } from "../services/loopWorkout";
import { summarizeCrossTrainingCredits } from "../services/crossTrainingLoad";
import { currentWeekPrescription, keySessionDateLabel, missionFocusTarget, nextKeySession, weekHubSummary } from "../services/briefingHub";

const dayLabel = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
const todayLabel = new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "2-digit", month: "long" });

function startOfCurrentWeek() {
  const date = new Date();
  const day = date.getDay() || 7;
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - day + 1);
  return date;
}

function isoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function activityDate(activity) {
  return String(activity.startDateLocal || activity.date || "").slice(0, 10);
}

function activityMatchesId(activity, activityId) {
  if (!activityId) return false;
  return String(activity.id) === String(activityId)
    || (activity.memberActivityIds || []).some((id) => String(id) === String(activityId));
}

function compactNumber(value, digits = 1) {
  const numeric = Number(value || 0);
  return numeric.toFixed(digits).replace(/\.0$/, "");
}

function activityMetrics(activity) {
  if (!activity) return "";
  const distance = Number(activity.distance || 0);
  const durationMinutes = Number(activity.duration || 0);
  return [
    distance > 0 ? `${compactNumber(distance)} km` : "",
    durationMinutes > 0 ? hours(durationMinutes) : "",
    isRunningActivity(activity) && distance > 0 && durationMinutes > 0 ? pace(distance, durationMinutes) : "",
    Number(activity.elevation || 0) > 0 ? `${Math.round(Number(activity.elevation))} hm` : "",
  ].filter(Boolean).join(" · ");
}

function plannedMetrics(item) {
  return [
    workoutTimingLabel(item),
    Number(item.distance || 0) > 0 ? `${compactNumber(item.distance)} km` : "",
    Number(item.duration || 0) > 0 ? `${Math.round(Number(item.duration))} min` : "",
    isLoopWorkout(item) ? loopWorkoutPaceLabel(item) : workoutPaceLabel(item),
    isLoopWorkout(item) ? loopWorkoutCompactLabel(item) : "",
    item.optional ? "optional" : "",
  ].filter(Boolean).join(" · ");
}

function todayOverview(plan, activities) {
  const dateKey = isoDate(new Date());
  const actuals = activities.filter((activity) => activityDate(activity) === dateKey);
  const entries = plan.filter((item) => !item.archived && item.date === dateKey);
  const matchedIds = new Set();
  const items = entries.map((item) => {
    const matched = actuals.find((activity) => activityMatchesId(activity, item.matchedActivityId));
    if (matched) matchedIds.add(String(matched.id));
    const done = Boolean(item.completed || matched);
    const missed = Boolean(item.missedReason);
    return {
      id: `today-plan-${item.id}`,
      planItemId: item.id,
      activityId: matched && reviewKind(matched) ? matched.id : null,
      title: matched?.name || item.actualTitle || item.title,
      detail: matched ? activityMetrics(matched) : plannedMetrics(item),
      note: missed ? `Ausgefallen: ${item.missedReason}` : item.notes || "",
      tone: missed ? "missed" : done ? "done" : item.optional ? "optional" : "planned",
      status: missed ? "Ausgefallen" : done ? "Erledigt" : item.optional ? "Optional" : "Geplant",
    };
  });

  actuals
    .filter((activity) => !matchedIds.has(String(activity.id)))
    .forEach((activity) => {
      items.push({
        id: `today-actual-${activity.id}`,
        activityId: reviewKind(activity) ? activity.id : null,
        title: activity.name || activity.type || "Training",
        detail: activityMetrics(activity),
        note: "Zusätzlich absolvierte Einheit",
        tone: "done",
        status: "Erledigt",
      });
    });

  if (!items.length) {
    items.push({
      id: `today-rest-${dateKey}`,
      title: "Regenerationstag",
      detail: "Keine Einheit geplant",
      note: "Erholung gehört zum Trainingsplan.",
      tone: "rest",
      status: "Frei",
    });
  }

  const done = items.filter((item) => item.tone === "done").length;
  const open = items.filter((item) => ["planned", "optional"].includes(item.tone)).length;
  const headline = done && open
    ? `${done} erledigt, ${open} noch offen`
    : open
      ? open === 1 ? "Das steht heute an" : `${open} Einheiten stehen heute an`
      : done
        ? "Heute bereits erledigt"
        : "Heute ist Regeneration";

  return { items, headline, done, open };
}

function TodayWorkoutRow({ item }) {
  const destination = briefingWorkoutDestination(item);
  const opensReview = destination?.pathname === "/training";
  const content = (
    <>
      <span className="today-status-pill">{item.status}</span>
      <div className="today-workout-copy">
        <h3>{item.title}</h3>
        {item.detail && <strong>{item.detail}</strong>}
        {item.note && <p>{item.note}</p>}
      </div>
      {destination && <span className={`today-workout-arrow ${opensReview ? "review" : ""}`} aria-hidden="true">{opensReview ? "Review →" : "→"}</span>}
    </>
  );

  if (!destination) {
    return <div className={`today-workout-row ${item.tone}`}>{content}</div>;
  }

  return (
    <Link
      className={`today-workout-row today-workout-link ${opensReview ? "opens-review" : ""} ${item.tone}`}
      to={destination.pathname}
      state={destination.state}
      aria-label={opensReview ? `${item.title}: Review öffnen` : `${item.title} direkt öffnen`}
    >
      {content}
    </Link>
  );
}

function nextDayOverview(plan) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + 1);
  const dateKey = isoDate(date);
  const entries = plan
    .filter((item) => !item.archived && item.date === dateKey)
    .sort((a, b) => `${workoutSortTime(a)}${a.title || ""}`.localeCompare(`${workoutSortTime(b)}${b.title || ""}`));
  const items = entries.map((item) => ({
    id: `upcoming-${item.id}`,
    title: item.title,
    detail: plannedMetrics(item),
    tone: item.missedReason ? "missed" : item.optional ? "optional" : item.type === "Ruhetag" ? "rest" : "planned",
    status: item.missedReason ? "Ausgefallen" : item.optional ? "Optional" : item.type === "Ruhetag" ? "Frei" : "Geplant",
  }));

  if (!items.length) {
    items.push({
      id: `upcoming-rest-${dateKey}`,
      title: "Regenerationstag",
      detail: "Keine Einheit geplant",
      tone: "rest",
      status: "Frei",
    });
  }

  return { date, dateKey, items };
}

function weekRows(plan, activities) {
  const weekStart = startOfCurrentWeek();
  const todayKey = isoDate(new Date());
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + index);
    const dateKey = isoDate(date);
    const actuals = activities.filter((activity) => activityDate(activity) === dateKey);
    const entries = plan.filter((item) => !item.archived && item.date === dateKey);
    const matchedIds = new Set();
    const items = [];

    entries.forEach((item) => {
      const matched = actuals.find((activity) => activityMatchesId(activity, item.matchedActivityId));
      if (matched) matchedIds.add(String(matched.id));
      items.push({
        id: `plan-${item.id}`,
        title: matched?.name || item.actualTitle || item.title,
        detail: [
          item.distance ? `${Number(matched?.distance || item.actualDistance || item.distance).toFixed(1)} km` : "",
          !matched && !item.completed ? (isLoopWorkout(item) ? loopWorkoutPaceLabel(item) : workoutPaceLabel(item)) : "",
          item.optional ? "optional" : "",
          item.missedReason ? `ausgefallen: ${item.missedReason}` : "",
        ].filter(Boolean).join(" · "),
        tone: item.missedReason ? "missed" : item.completed || matched ? "done" : dateKey < todayKey ? "missed" : "planned",
      });
    });

    const visibleActuals = actuals.filter((activity) => !matchedIds.has(String(activity.id)));

    visibleActuals.forEach((activity) => {
      items.push({
        id: `actual-${activity.id}`,
        title: activity.name || activity.type || "Training",
        detail: [Number(activity.distance || 0) ? `${Number(activity.distance).toFixed(1)} km` : "", activity.type || activity.sportType || ""].filter(Boolean).join(" · "),
        tone: "done",
      });
    });

    if (!items.length) {
      items.push({ id: `rest-${dateKey}`, title: "Erholungstag", detail: "Keine Einheit geplant", tone: "rest" });
    }

    return { date, dateKey, today: dateKey === todayKey, items };
  });
}

function briefingLanguage(now = new Date()) {
  const hour = now.getHours();
  if (hour >= 5 && hour < 11) return { eyebrow: "Morgenbriefing", greeting: "Guten Morgen" };
  if (hour >= 11 && hour < 17) return { eyebrow: "Tagesbriefing", greeting: "Guten Tag" };
  if (hour >= 17 && hour < 22) return { eyebrow: "Abendbriefing", greeting: "Guten Abend" };
  return { eyebrow: "Tagesüberblick", greeting: "Hallo" };
}

function displayName(state, session) {
  const profileName = state.profile?.displayName || state.profile?.firstName;
  const metadataName = session?.user?.user_metadata?.first_name
    || session?.user?.user_metadata?.given_name
    || session?.user?.user_metadata?.full_name
    || session?.user?.user_metadata?.name;
  return String(profileName || metadataName || "").trim().split(/\s+/)[0];
}

export default function Briefing() {
  const { state, session } = useApp();
  const [weatherInsight, setWeatherInsight] = useState(null);
  const activities = activitiesWithGroups(
    preferredActivities(state.activities, { hideStrava: Boolean(state.intervals?.connected) }),
    state.activityGroups,
  )
    .sort((a, b) => activityTimestamp(b) - activityTimestamp(a));
  const runningActivities = activities.filter(isRunningActivity);
  const coach = useMemo(() => buildCoachState(state), [state]);
  const weekStart = startOfCurrentWeek();
  const now = new Date();
  const weekDistance = runningActivities
    .filter((activity) => activityTimestamp(activity) >= weekStart)
    .reduce((sum, activity) => sum + Number(activity.distance || 0), 0);
  const calculatedTarget = Number(state.planner?.lastTarget || 0);
  const weekActivities = activities.filter((activity) => activityTimestamp(activity) >= weekStart);
  const crossTrainingSummary = summarizeCrossTrainingCredits(weekActivities, {
    targetKm: calculatedTarget,
    allActivities: activities,
    phaseLabel: state.planner?.lastPhase || "",
    recoveryWeek: Boolean(state.planner?.lastRecoveryWeek),
    reviews: state.reviews,
  });
  const rows = weekRows(state.plan, activities);
  const today = todayOverview(state.plan, activities);
  const upcoming = nextDayOverview(state.plan);
  const copy = briefingLanguage(now);
  const name = displayName(state, session);
  const weekPrescription = currentWeekPrescription(state.planner, now);
  const { mainTarget: missionTarget, focusTarget } = missionFocusTarget(state.mission, weekPrescription);

  const nextEvent = (state.mission.milestones || [])
    .filter((item) => !item.archived && !item.isMainTarget && new Date(`${item.date}T23:59:59`) >= now)
    .sort((a, b) => `${a.date}T${a.time || "23:59"}`.localeCompare(`${b.date}T${b.time || "23:59"}`))[0];

  const weekOpenItems = rows.reduce((sum, row) => sum + row.items.filter((item) => item.tone === "planned").length, 0);
  const weekSummary = weekHubSummary({
    planner: state.planner,
    now,
    openItems: weekOpenItems,
    completedKm: weekDistance,
  });
  const upcomingKeySession = nextKeySession({
    plan: state.plan,
    now,
    weekPrescription,
  });
  const focusName = focusTarget?.name || weekPrescription?.goal?.name || "";
  const focusDate = focusTarget?.date || "";
  const focusDays = focusDate ? daysUntil(focusDate) : Number.isFinite(Number(weekPrescription?.goal?.daysLeft)) ? Number(weekPrescription.goal.daysLeft) : null;
  const crossTrainingTypes = [
    Number(crossTrainingSummary.footballEquivalentKm || 0) > 0 ? "Fußball" : "",
    Number(crossTrainingSummary.roadCyclingEquivalentKm || 0) > 0 ? "Rennrad" : "",
  ].filter(Boolean);
  const crossTrainingNote = crossTrainingTypes.length
    ? `${crossTrainingTypes.join(" und ")} als Zusatzbelastung berücksichtigt`
    : "";
  const todayKey = isoDate(now);
  const todayPlanEntries = state.plan.filter((item) => !item.archived && item.date === todayKey);
  const coachNeedsAction = ["adjust", "watch"].includes(coach.level);
  const coachStatusTitle = coach.level === "ok"
    ? "Alles im grünen Bereich"
    : coach.level === "open"
      ? "Plan steht – Review noch offen"
      : coach.recommendation.title;
  const coachStatusText = coach.level === "ok"
    ? "Belastung und Erholung passen aktuell zusammen. Plan wie vorgesehen fortsetzen."
    : coach.level === "open"
      ? "Der Plan bleibt bestehen. Nach dem nächsten relevanten Lauf kurz bewerten."
      : "Dein Coach hat Alternativen vorbereitet. Es wird nichts automatisch geändert.";

  return (
    <>
      <PageTitle eyebrow={copy.eyebrow} title={`${copy.greeting}${name ? `, ${name}` : ""}.`}><WeatherCard plannedEntries={todayPlanEntries} onInsight={setWeatherInsight} /></PageTitle>
      {weatherInsight?.mode === "flexible" && (
        <section className="briefing-best-slot" aria-label={`Bestes Wetterfenster für ${weatherInsight.title}`}>
          <span className="briefing-best-slot-icon" aria-hidden="true">◷</span>
          <div>
            <p>Wetterfenster · {weatherInsight.title}</p>
            <strong>Bester Slot für {weatherInsight.slotObject} ist {weatherInsight.windowLabel}.</strong>
            <small>{weatherInsight.temperatureLabel} · {weatherInsight.condition} · {weatherInsight.advice}</small>
          </div>
          <span className="briefing-best-slot-state">Spontan</span>
        </section>
      )}
      <div className="grid briefing-grid">
        <Card className="wide today-card premium-briefing-card">
          <div className="today-columns-grid">
            <section className="today-hero-column today-hero-column-current" aria-label="Heutige Einheiten">
              <div className="today-card-heading">
                <div>
                  <p className="eyebrow">Heute · {todayLabel.format(new Date())}</p>
                  <h2>{today.headline}</h2>
                </div>
              </div>
              <div className="today-workout-list">
                {today.items.map((item) => <TodayWorkoutRow item={item} key={item.id} />)}
              </div>
            </section>
            <section className="today-hero-column today-side-panel" aria-label="Als Nächstes">
              <div className="today-upcoming-heading today-upcoming-heading-hero">
                <div>
                  <p className="eyebrow">Als Nächstes</p>
                  <h2>Morgen · {todayLabel.format(upcoming.date)}</h2>
                </div>
                <span>Preview</span>
              </div>
              <div className="today-upcoming-preview">
                <div className="today-upcoming-items">
                  {upcoming.items.map((item) => <div className={`today-upcoming-item ${item.tone}`} key={item.id}><span>{item.status}</span><div><b>{item.title}</b>{item.detail && <small>{item.detail}</small>}</div></div>)}
                </div>
              </div>
            </section>
          </div>
        </Card>


        <Card className={`wide science-coach-alert briefing-coach-status ${coach.level}`}>
          <div className="briefing-coach-status-copy">
            <p className="eyebrow">Coach-Check</p>
            <h2>{coachStatusTitle}</h2>
            <p>{coachStatusText}</p>
          </div>
          <Link className="button-link" to="/planner">{coachNeedsAction ? "Alternativen prüfen" : "Plan ansehen"}</Link>
        </Card>

        <div className="wide briefing-summary-grid briefing-hub-grid">
          <Link className="briefing-card-link" to="/mission" aria-label="Mission öffnen">
            <Card className="briefing-compact-card briefing-mission-card briefing-hub-card">
              <span className="briefing-card-arrow" aria-hidden="true">→</span>
              <p className="eyebrow">Hauptmission</p>
              <h2>{missionTarget?.name || "Hauptziel festlegen"}</h2>
              <p className="briefing-mission-countdown"><b>{missionTarget?.date ? daysUntil(missionTarget.date) : "–"}</b> Tage bis zum Hauptziel</p>
              {focusName && focusName !== missionTarget?.name && (
                <div className="briefing-current-focus">
                  <span>Aktueller Trainingsfokus</span>
                  <strong>{focusName}{focusDays != null ? ` · ${focusDays} Tage` : ""}</strong>
                  {weekPrescription?.focus && <small>{weekPrescription.focus}</small>}
                </div>
              )}
              <p className="briefing-week-fact"><b>{weekDistance.toFixed(1)} km</b> diese Woche absolviert</p>
              {crossTrainingNote && <p className="briefing-cross-training-credit">{crossTrainingNote}</p>}
              {nextEvent && <p className="briefing-compact-footer"><span>Nächstes Event</span><b>{nextEvent.name}</b><strong>{daysUntil(nextEvent.date)} Tage{nextEvent.time ? ` · ${nextEvent.time} Uhr` : ""}</strong></p>}
            </Card>
          </Link>

          <Link className="briefing-card-link" to="/planner" aria-label="Wochentyp und Wochensteuerung öffnen">
            <Card className={`briefing-compact-card briefing-week-type-card briefing-hub-card ${weekSummary.tone}`}>
              <span className="briefing-card-arrow" aria-hidden="true">→</span>
              <p className="eyebrow">Diese Woche</p>
              <h2>{weekSummary.typeLabel}</h2>
              <p className="briefing-corridor"><b>{weekSummary.corridorLabel}</b><span>automatisch gesteuert</span></p>
              <p className="briefing-compact-text">{weekSummary.focus}</p>
              <p className="briefing-card-footnote">{weekSummary.meta}</p>
            </Card>
          </Link>

          <Link className="briefing-card-link briefing-key-session-link" to="/planner" aria-label="Nächsten Schlüsselreiz im Wochenplan öffnen">
            <Card className="briefing-compact-card briefing-key-session-card briefing-hub-card">
              <span className="briefing-card-arrow" aria-hidden="true">→</span>
              <p className="eyebrow">Nächster Schlüsselreiz</p>
              {upcomingKeySession ? <>
                <h2>{upcomingKeySession.item.title}</h2>
                <p className="briefing-key-date">{keySessionDateLabel(upcomingKeySession.item.date, now)}{upcomingKeySession.item.time ? ` · ${upcomingKeySession.item.time} Uhr` : ""}</p>
                <div className="briefing-role-markers" aria-label="Trainingsrollen">
                  {upcomingKeySession.assessment.markers.map((marker) => <span className={marker.tone} key={marker.key}><i aria-hidden="true">{marker.icon}</i>{marker.label}</span>)}
                </div>
                <p className="briefing-compact-text">{upcomingKeySession.assessment.explanation}</p>
              </> : <>
                <h2>Nach dem Wochenreview festlegen</h2>
                <p className="briefing-key-date">Aktuell kein weiterer Schlüsselreiz offen</p>
                <p className="briefing-compact-text">{weekPrescription?.weekType?.key === "recovery"
                  ? "Die Entlastung ist bewusst. Der nächste zielrelevante Reiz wird nach stabilen Reviews konkret eingeplant."
                  : "Der Coach legt den nächsten zielrelevanten Reiz anhand der abgeschlossenen Woche und deiner Reviews fest."}</p>
              </>}
            </Card>
          </Link>
        </div>

        <details className="wide briefing-disclosure briefing-week-disclosure">
          <summary><div><p className="eyebrow">Wochenplan</p><strong>Komplette Woche anzeigen</strong><span>{weekSummary.meta} · {weekSummary.typeLabel} · {weekSummary.corridorLabel}</span></div><b>⌄</b></summary>
          <div className="briefing-week-list">
            {rows.map((row) => <div className={`briefing-week-row ${row.today ? "today" : ""}`} key={row.dateKey}><div className="briefing-week-day"><strong>{dayLabel.format(row.date)}</strong>{row.today && <span>Heute</span>}</div><div className="briefing-week-items">{row.items.map((item) => <div className={`briefing-week-item ${item.tone}`} key={item.id}><b>{item.title}</b>{item.detail && <span>{item.detail}</span>}</div>)}</div></div>)}
            <Link className="briefing-week-link" to="/planner">Wochenplan bearbeiten →</Link>
          </div>
        </details>
      </div>
    </>
  );
}
