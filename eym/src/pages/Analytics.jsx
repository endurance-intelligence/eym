import { useMemo } from "react";
import { useApp } from "../context/AppContext";
import { Card, Metric, PageTitle } from "../components/UI";
import { preferredActivities, sportGroup } from "../services/activityUtils";

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
  const longest = filtered.reduce((current, activity) => (
    Number(activity.distance || 0) > Number(current?.distance || 0) ? activity : current
  ), null);

  return {
    count: filtered.length,
    distance: filtered.reduce((sum, activity) => sum + Number(activity.distance || 0), 0),
    duration: filtered.reduce((sum, activity) => sum + Number(activity.duration || 0), 0),
    elevation: filtered.reduce((sum, activity) => sum + Number(activity.elevation || 0), 0),
    longest,
    sports: sportBreakdown(filtered),
  };
}

export default function Analytics() {
  const { state } = useApp();
  const activities = useMemo(() => preferredActivities(state.activities), [state.activities]);
  const stats2025 = useMemo(() => yearStats(activities, 2025), [activities]);
  const stats2026 = useMemo(() => yearStats(activities, 2026), [activities]);

  if (activities.length === 0) {
    return <><PageTitle eyebrow="Analytics" title="Zahlen mit Bedeutung" /><Card><h2>Noch keine Daten</h2><p className="muted">Importiere Garmin oder synchronisiere Intervals.icu, um deine Statistik ab 2025 aufzubauen.</p></Card></>;
  }

  return (
    <>
      <PageTitle eyebrow="Analytics" title="2025 vs. 2026" />
      <div className="grid">
        {[{ year: 2025, stats: stats2025 }, { year: 2026, stats: stats2026 }].map(({ year, stats }) => (
          <Card className="wide" key={year}>
            <p className="eyebrow">{year}</p>
            <div className="hero-stats">
              <Metric label="Einheiten" value={stats.count} />
              <Metric label="Gesamtdistanz" value={`${stats.distance.toFixed(1)} km`} />
              <Metric label="Zeit" value={`${Math.round(stats.duration / 60)} h`} />
              <Metric label="Höhenmeter" value={`${Math.round(stats.elevation)} hm`} />
              <Metric
                label="Längste Einheit"
                value={`${Number(stats.longest?.distance || 0).toFixed(1)} km`}
                sub={stats.longest?.name || "–"}
              />
            </div>

            <div className="sport-breakdown" aria-label={`Sportarten ${year}`}>
              {stats.sports.map((sport) => (
                <div className="sport-breakdown-item" key={sport.key}>
                  <span>{sport.label}</span>
                  <strong>{sport.count}</strong>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
