import { useApp } from "../context/AppContext";
import { Card, Metric, PageTitle } from "../components/UI";
import { coachInsight, recovery, hydration } from "../services/insights";
import { daysUntil, pace, hours } from "../utils/format";
import WeatherCard from "../components/WeatherCard";
import { activityTimestamp, isRunningActivity, preferredActivities } from "../services/activityUtils";

const dayLabel = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });

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

export default function Briefing() {
  const { state } = useApp();
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

  const nextEvent = (state.mission.milestones || [])
    .filter((item) => !item.archived && !item.isMainTarget && new Date(`${item.date}T23:59:59`) >= new Date())
    .sort((a, b) => new Date(a.date) - new Date(b.date))[0];

  return (
    <>
      <PageTitle eyebrow="Morning Briefing" title="Guten Morgen, Daniel."><span className="tagline">Eat your miles.</span></PageTitle>
      <div className="grid">
        <Card className="hero">
          <p className="eyebrow">Mission</p>
          <h2>{state.mission.name}</h2>
          <div className="hero-stats">
            <Metric label="Verbleibend" value={`${daysUntil(state.mission.date)} Tage`} />
            <Metric label="Diese Woche" value={`${weekDistance.toFixed(1)} km`} />
            <Metric label="Berechneter Rahmen" value={calculatedTarget ? `${calculatedTarget} km` : "Noch offen"} sub={state.planner?.lastPhase || "Wochenplan erstellen"} />
          </div>
          {calculatedTarget > 0 && <div className="progress"><i style={{ width: `${Math.min(100, weekDistance / calculatedTarget * 100)}%` }} /></div>}
          {nextEvent && <div className="milestone-strip"><div><span>Nächstes Rennen</span><strong>{nextEvent.name}</strong><small>{nextEvent.location || "Ort noch offen"}</small></div><div className="milestone-count"><b>{daysUntil(nextEvent.date)}</b><span>Tage</span></div></div>}
        </Card>
        <WeatherCard />
        <Card><p className="eyebrow">Recovery</p><h2 className={`status ${recoveryState.tone}`}>{recoveryState.label}</h2><p className="muted">Aus deinen Reviews des aktuellen Zeitraums abgeleitet.</p></Card>
        <Card className="wide"><p className="eyebrow">Letzter Lauf</p>{latestActivity ? <><h2>{latestActivity.name}</h2><p className="runline">{latestActivity.distance} km · {hours(latestActivity.duration)} · {pace(latestActivity.distance, latestActivity.duration)} · {latestActivity.elevation} hm</p><p>{hydrationState ? `Getrunken ${latestReview.drinkMl} ml. Geschätztes Defizit: ${hydrationState.deficit} ml.` : "Review offen – Trinkmenge und Körpergefühl ergänzen."}</p></> : <p>Importiere Garmin, um deine echten Läufe zu sehen.</p>}</Card>
        <Card className="wide insight"><p className="eyebrow">Today's Briefing</p><h2>{coachInsight(runningActivities, state.reviews)}</h2></Card>
        <Card className="wide briefing-week-card">
          <p className="eyebrow">Wochenplan</p>
          <h2>Die komplette Woche</h2>
          <div className="briefing-week-list">
            {rows.map((row) => (
              <div className={`briefing-week-row ${row.today ? "today" : ""}`} key={row.dateKey}>
                <div className="briefing-week-day"><strong>{dayLabel.format(row.date)}</strong>{row.today && <span>Heute</span>}</div>
                <div className="briefing-week-items">
                  {row.items.map((item) => <div className={`briefing-week-item ${item.tone}`} key={item.id}><b>{item.title}</b>{item.detail && <span>{item.detail}</span>}</div>)}
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card className="wide"><p className="eyebrow">Today's Lesson</p><blockquote>{hydrationState ? `Für ähnliche Bedingungen sind ungefähr ${hydrationState.recommendedLow}–${hydrationState.recommendedHigh} ml pro Stunde ein sinnvoller Startpunkt.` : "Je genauer du Trinkmenge und Gefühl protokollierst, desto persönlicher werden deine Empfehlungen."}</blockquote></Card>
      </div>
    </>
  );
}
