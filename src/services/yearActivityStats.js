import { sportGroup } from "./activityUtils.js";

export function buildSportBreakdown(activities = []) {
  const grouped = new Map();

  activities.forEach((activity) => {
    const group = sportGroup(activity);
    const current = grouped.get(group.key) || {
      key: group.key,
      label: group.label,
      count: 0,
      distance: 0,
      duration: 0,
      elevation: 0,
    };

    grouped.set(group.key, {
      ...current,
      count: current.count + 1,
      distance: current.distance + Number(activity.distance || 0),
      duration: current.duration + Number(activity.duration || 0),
      elevation: current.elevation + Number(activity.elevation || 0),
    });
  });

  return [...grouped.values()].sort((a, b) => b.count - a.count);
}

export function buildYearStats(activities = [], year) {
  const filtered = activities.filter((activity) => Number(activity.date?.slice(0, 4)) === Number(year));

  return {
    count: filtered.length,
    distance: filtered.reduce((sum, activity) => sum + Number(activity.distance || 0), 0),
    duration: filtered.reduce((sum, activity) => sum + Number(activity.duration || 0), 0),
    elevation: filtered.reduce((sum, activity) => sum + Number(activity.elevation || 0), 0),
    sports: buildSportBreakdown(filtered),
  };
}

export function formatActivityDistance(value) {
  return `${Number(value || 0).toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 1 })} km`;
}
