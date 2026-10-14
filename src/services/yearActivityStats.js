import { sportGroup } from "./activityUtils.js";

const DISTANCE_SPORT_KEYS = new Set([
  "running",
  "roadCycling",
  "soccer",
  "cycling",
  "swimming",
  "rowing",
  "walking",
]);

const ELEVATION_SPORT_KEYS = new Set([
  "running",
  "roadCycling",
  "soccer",
  "cycling",
  "walking",
]);

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function sportUsesDistance(key = "") {
  return DISTANCE_SPORT_KEYS.has(String(key));
}

export function sportUsesElevation(key = "") {
  return ELEVATION_SPORT_KEYS.has(String(key));
}

export function buildSportBreakdown(activities = []) {
  const grouped = new Map();

  activities.forEach((activity) => {
    const group = sportGroup(activity);
    const distanceMeaningful = sportUsesDistance(group.key);
    const elevationMeaningful = sportUsesElevation(group.key);
    const current = grouped.get(group.key) || {
      key: group.key,
      label: group.label,
      count: 0,
      distance: 0,
      duration: 0,
      elevation: 0,
      distanceMeaningful,
      elevationMeaningful,
    };

    grouped.set(group.key, {
      ...current,
      count: current.count + 1,
      distance: current.distance + (distanceMeaningful ? numeric(activity.distance) : 0),
      duration: current.duration + numeric(activity.duration),
      elevation: current.elevation + (elevationMeaningful ? numeric(activity.elevation) : 0),
    });
  });

  return [...grouped.values()].sort((a, b) => b.count - a.count || b.duration - a.duration);
}

export function buildYearStats(activities = [], year, options = {}) {
  const throughMonthDay = String(options.throughMonthDay || "").trim();
  const filtered = activities.filter((activity) => {
    const date = String(activity.date || activity.startDateLocal || "").slice(0, 10);
    if (Number(date.slice(0, 4)) !== Number(year)) return false;
    if (!throughMonthDay) return true;
    return date.slice(5, 10) <= throughMonthDay;
  });
  const sports = buildSportBreakdown(filtered);

  return {
    count: filtered.length,
    distance: sports.reduce((sum, sport) => sum + sport.distance, 0),
    duration: filtered.reduce((sum, activity) => sum + numeric(activity.duration), 0),
    elevation: sports.reduce((sum, sport) => sum + sport.elevation, 0),
    sports,
  };
}

export function formatActivityDistance(value) {
  return `${numeric(value).toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 1 })} km`;
}
