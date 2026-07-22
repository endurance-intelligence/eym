import { Link } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { Card, PageTitle } from "../components/UI";
import { recovery, hydration } from "../services/insights";
import { daysUntil, pace, hours } from "../utils/format";
import WeatherCard from "../components/WeatherCard";
import { activityTimestamp, isRunningActivity, preferredActivities } from "../services/activityUtils";
import { currentWeekAssessment, goalRequirements } from "../services/scienceCoach";

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
    item.time ? `${item.time} Uhr` : "",
    Number(item.distance || 0) > 0 ? `${compactNumber(item.distance)} km` : "",
    Number(item.duration || 0) > 0 ? `${Math.round(Number(item.duration))} min` : "",
    item.optional ? "optional" : "",
  ].filter(Boolean).join(" · ");
}

function todayOverview(plan, activities) {
  const dateKey = isoDate(new Date());
  const actuals = activities.filter((activity) => activityDate(activity) === dateKey);
  const entries = plan.filter((item) => !item.archived && item.date === dateKey);
  const matchedIds = new Set(entries.map((item) => String(item.matchedActivityId || "")).filter(Boolean));
  const items = entries.map((item) => {
    const matched = actuals.find((activity) => String(activity.id) === String(item.matchedActivityId));
    const done = Boolean(item.completed || matched);
    const missed = Boolean(item.missedReason);
    return {
      id: `today-plan-${item.id}`,
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

function nextDayOverview(plan) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + 1);
  const dateKey = isoDate(date);
  const entries = plan
    .filter((item) => !item.archived && item.date === dateKey)
    .sort((a, b) => `${a.time || "99:99"}${a.title || ""}`.localeCompare(`${b.time || "99:99"}${b.title || ""}`));
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
    const matchedIds = new Set(entries.map((item) => String(item.matchedActivityId || "")).filter(Boolean));
    const visibleActuals = actuals.filter((activity) => !matchedIds.has(String(activity.id)));
    const items = [];

    entries.forEach((item) => {
      const matched = actuals.find((activity) => String(activity.id) === String(item.matchedActivityId));
      items.push({
        id: `plan-${item.id}`,
        title: matched?.name || item.actualTitle || item.title,
        detail: [
          item.distance ? `${Number(matched?.distance || item.actualDistance || item.distance).toFixed(1)} km` : "",
          item.optional ? "optional" : "",
          item.missedReason ? `ausgefallen: ${item.missedReason}` : "",
        ].filter(Boolean).join(" · "),
        tone: item.missedReason ? "missed" : item.completed || matched ? "done" : dateKey < todayKey ? "missed" : "planned",
      });
    });

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
  const activities = preferredActivities(state.activities, { hideStrava: Boolean(state.intervals?.connected) })
    .sort((a, b) => activityTimestamp(b) - activityTimestamp(a));
  const runningActivities = activities.filter(isRunningActivity);
  const latestActivity = runningActivities[0];
  const latestReview = latestActivity && state.reviews[latestActivity.id];
  const recoveryState = recovery(state.reviews, runningActivities);
  const hydrationState = latestActivity && hydration(latestActivity, latestReview);
  const weekStart = startOfCurrentWeek();
  const weekDistance = runningActivities
    .filter((activity) => activityTimestamp(activity) >= weekStart)
    .reduce((sum, activity) => sum + Number(activity.distance || 0), 0);
  const calculatedTarget = Number(state.planner?.lastTarget || 0);
  const rows = weekRows(state.plan, activities);
  const today = todayOverview(state.plan, activities);
  const upcoming = nextDayOverview(state.plan);
  const copy = briefingLanguage();
  const weekAssessment = currentWeekAssessment(state);
  const goalProfile = goalRequirements(state);
  const name = displayName(state, session);

  const nextEvent = (state.mission.milestones || [])
    .filter((item) => !item.archived && !item.isMainTarget && new Date(`${item.date}T23:59:59`) >= new Date())
    .sort((a, b) => new Date(a.date) - new Date(b.date))[0];

  const weekOpenItems = rows.reduce((sum, row) => sum + row.items.filter((item) => item.tone === "planned").length, 0);
  const todayKey = isoDate(new Date());
  const todayPlanEntries = state.plan.filter((item) => !item.archived && item.date === todayKey);
  const hydrationSummary = hydrationState
    ? hydrationState.reliable
      ? `Getrunken ${latestReview.drinkMl} ml · geschätztes Defizit ${hydrationState.deficit} ml.`
      : hydrationState.reason
    : "Review offen – Körpergefühl und Trinkmenge ergänzen.";

  return (
    <>
      <PageTitle eyebrow={copy.eyebrow} title={`${copy.greeting}${name ? `, ${name}` : ""}.`}><WeatherCard plannedEntries={todayPlanEntries} /></PageTitle>
      <div className="grid briefing-grid">
        <Card className="wide today-card">
          <div className="today-card-heading">
            <div><p className="eyebrow">Heute · {todayLabel.format(new Date())}</p><h2>{today.headline}</h2></div>
            <span className={`today-summary ${today.open ? "planned" : today.done ? "done" : "rest"}`}>{today.open ? `${today.open} offen` : today.done ? `${today.done} erledigt` : "Regeneration"}</span>
          </div>
          <div className="today-workout-list">
            {today.items.map((item) => <div className={`today-workout-row ${item.tone}`} key={item.id}><span className="today-status-pill">{item.status}</span><div className="today-workout-copy"><h3>{item.title}</h3>{item.detail && <strong>{item.detail}</strong>}{item.note && <p>{item.note}</p>}</div></div>)}
          </div>
          <div className="today-upcoming-preview">
            <div className="today-upcoming-heading"><div><p className="eyebrow">Als Nächstes</p><strong>Morgen · {todayLabel.format(upcoming.date)}</strong></div><span>Preview</span></div>
            <div className="today-upcoming-items">
              {upcoming.items.map((item) => <div className={`today-upcoming-item ${item.tone}`} key={item.id}><span>{item.status}</span><div><b>{item.title}</b>{item.detail && <small>{item.detail}</small>}</div></div>)}
            </div>
          </div>
        </Card>


        {weekAssessment.level !== "ok" && <Card className={`wide science-coach-alert ${weekAssessment.level}`}><div><p className="eyebrow">Coach · Wochenbelastung</p><h2>{weekAssessment.level === "adjust" ? "Anpassung könnte sinnvoll sein" : "Belastung im Blick behalten"}</h2><p>{weekAssessment.reasons.join(" · ")}.</p><small>Das ist ein Vorschlag, keine automatische Änderung. Dein Ziel „{goalProfile.target?.name || state.mission.name}“ und deine individuelle Belastungsgewöhnung bleiben die Grundlage.</small></div><Link className="button-link" to="/planner">Vorschläge im Wochenplan prüfen</Link></Card>}

        <div className="wide briefing-summary-grid">
          <Card className="briefing-compact-card briefing-mission-card">
            <p className="eyebrow">Mission</p>
            <h2>{state.mission.name}</h2>
            <div className="briefing-compact-metrics">
              <span><b>{daysUntil(state.mission.date)}</b> Tage</span>
              <span><b>{weekDistance.toFixed(1)}</b> / {calculatedTarget || "–"} km</span>
            </div>
            {calculatedTarget > 0 && <div className="progress"><i style={{ width: `${Math.min(100, weekDistance / calculatedTarget * 100)}%` }} /></div>}
            {nextEvent && <p className="briefing-compact-footer"><span>Nächstes Event</span><b>{nextEvent.name}</b><strong>{daysUntil(nextEvent.date)} Tage</strong></p>}
          </Card>

          <Card className="briefing-compact-card readiness-card">
            <p className="eyebrow">Trainingsbereitschaft</p>
            <h2 className={recoveryState.tone}>{recoveryState.label}</h2>
            {recoveryState.reviewed > 0 && <p className="briefing-compact-values">Beine {recoveryState.legs}/10 · Energie {recoveryState.energy}/10 · Belastung {recoveryState.rpe}/10</p>}
            <p className="briefing-compact-text">{recoveryState.text}</p>
          </Card>

          <Card className="briefing-compact-card briefing-latest-card">
            <p className="eyebrow">Zuletzt</p>
            {latestActivity ? <>
              <h2>{latestActivity.name}</h2>
              <p className="briefing-compact-values">{activityMetrics(latestActivity)}</p>
              <p className="briefing-compact-text">{hydrationSummary}</p>
            </> : <p className="briefing-compact-text">Importiere Aktivitäten, um deine echten Läufe zu sehen.</p>}
          </Card>
        </div>

        <details className="wide briefing-disclosure">
          <summary><div><p className="eyebrow">Wochenplan</p><strong>Komplette Woche anzeigen</strong><span>{weekOpenItems} offene Einheit{weekOpenItems === 1 ? "" : "en"} · {calculatedTarget ? `${calculatedTarget} km Rahmen` : "Rahmen noch offen"}</span></div><b>⌄</b></summary>
          <div className="briefing-week-list">
            {rows.map((row) => <div className={`briefing-week-row ${row.today ? "today" : ""}`} key={row.dateKey}><div className="briefing-week-day"><strong>{dayLabel.format(row.date)}</strong>{row.today && <span>Heute</span>}</div><div className="briefing-week-items">{row.items.map((item) => <div className={`briefing-week-item ${item.tone}`} key={item.id}><b>{item.title}</b>{item.detail && <span>{item.detail}</span>}</div>)}</div></div>)}
          </div>
        </details>
      </div>
    </>
  );
}
