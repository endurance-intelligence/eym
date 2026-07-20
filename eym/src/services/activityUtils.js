export const SPORT_GROUPS = [
  { key: "running", label: "Laufen", types: ["Run", "TrailRun", "VirtualRun"] },
  { key: "roadCycling", label: "Rennrad", types: ["RoadRide", "RoadBikeRide"] },
  { key: "soccer", label: "Fußball", types: ["Soccer"] },
  { key: "cycling", label: "Radfahren", types: ["Ride", "MountainBikeRide", "VirtualRide", "GravelRide"] },
  { key: "swimming", label: "Schwimmen", types: ["Swim"] },
  { key: "rowing", label: "Rudern", types: ["Rowing"] },
  { key: "walking", label: "Wandern & Gehen", types: ["Walk", "Hike"] },
  { key: "strength", label: "Kraft & Mobility", types: ["WeightTraining", "Workout", "Yoga", "Pilates"] },
];

export function activityDate(activity) {
  return String(activity?.startDateLocal || activity?.date || "").slice(0, 10);
}

export function activityTimestamp(activity) {
  const raw = activity?.startDateLocal || activity?.date;
  const value = raw ? new Date(String(raw).includes("T") ? raw : `${raw}T12:00:00`) : new Date(0);
  return Number.isNaN(value.getTime()) ? new Date(0) : value;
}

function typeText(activity) {
  return `${activity?.type || ""} ${activity?.sportType || ""} ${activity?.subType || ""} ${activity?.name || ""}`.toLowerCase();
}

export function isRunningActivity(activity) {
  const type = String(activity?.type || activity?.sportType || "").toLowerCase();
  if (["run", "running", "trailrun", "trail_running", "virtualrun", "treadmill_running"].includes(type)) return true;
  if (activity?.category === "running") return true;
  if (["soccer", "ride", "cycling", "swim", "rowing", "walk", "hike", "weighttraining", "workout"].includes(type)) return false;
  const name = String(activity?.name || "").toLowerCase();
  return /(^|\s|[-–])(lauf|laufen|trailrun|treadmill|laufband|running)(\s|$|[-–:])/i.test(name) || name.includes("orc run") || name.includes("orc track");
}

export function isRoadCyclingActivity(activity) {
  const text = typeText(activity);
  if (/roadride|road bike|roadbike|road cycling|rennrad|race bike|rennradfahren/.test(text)) return true;
  return Boolean(activity?.roadCycling || activity?.bikeType === "road");
}

export function isRowingActivity(activity) {
  return /rowing|indoor rowing|rowerg|rudern|rudergerät/.test(typeText(activity));
}

export function isStrengthMobilityActivity(activity) {
  const text = typeText(activity);
  return isRowingActivity(activity) || /weighttraining|strength|workout|stabi|stabilität|mobility|mobilität|yoga|pilates|core/.test(text);
}

export function reviewKind(activity) {
  if (isRunningActivity(activity) || isRoadCyclingActivity(activity)) return "endurance";
  if (isStrengthMobilityActivity(activity)) return "strength";
  return null;
}

export function reviewKindLabel(activity) {
  const kind = reviewKind(activity);
  if (kind === "strength") return isRowingActivity(activity) ? "Ruder-Review" : "Kraft-&-Mobility-Review";
  if (kind === "endurance") return isRoadCyclingActivity(activity) ? "Rennrad-Review" : "Lauf-Review";
  return "Kein Review nötig";
}

export function sportFamily(activity) {
  if (isRunningActivity(activity)) return "running";
  if (isRoadCyclingActivity(activity)) return "roadCycling";
  const text = typeText(activity);
  if (/soccer|football|fußball/.test(text)) return "soccer";
  if (/ride|bike|cycling|rad|gravel|mountainbike/.test(text)) return "cycling";
  if (/swim|schwimm/.test(text)) return "swimming";
  if (isRowingActivity(activity)) return "rowing";
  if (/walk|hike|walking|hiking|wandern|gehen/.test(text)) return "walking";
  if (isStrengthMobilityActivity(activity)) return "strength";
  return String(activity?.type || "other").toLowerCase() || "other";
}

export function sportGroup(activity) {
  const family = sportFamily(activity);
  if (family === "running") return SPORT_GROUPS[0];
  if (family === "roadCycling") return SPORT_GROUPS[1];
  if (family === "soccer") return SPORT_GROUPS[2];
  if (family === "cycling") return SPORT_GROUPS[3];
  if (family === "swimming") return SPORT_GROUPS[4];
  if (family === "rowing") return SPORT_GROUPS[5];
  if (family === "walking") return SPORT_GROUPS[6];
  if (family === "strength") return SPORT_GROUPS[7];
  return { key: "other", label: "Sonstige", types: [] };
}

export function sourceLabel(activity) {
  const source = String(activity?.source || "manual").toLowerCase();
  if (source === "garmin") return "Garmin";
  if (source === "strava") return "Strava";
  if (source === "intervals") return "Intervals.icu";
  if (source === "combined") return "Zusammengefasst";
  if (source === "manual") return "Manuell";
  return source.charAt(0).toUpperCase() + source.slice(1);
}

function sourcePriority(activity) {
  const source = String(activity?.source || "").toLowerCase();
  if (source === "manual") return 5;
  if (source === "intervals") return 4;
  if (source === "garmin") return 3;
  if (source === "strava") return 1;
  return 2;
}

export function activitiesLikelySame(left, right) {
  if (!left || !right || left === right) return false;
  if (left.intervalsId && right.intervalsId && String(left.intervalsId) === String(right.intervalsId)) return true;
  if (left.externalId && right.externalId && String(left.externalId) === String(right.externalId)) return true;
  if (left.garminId && right.garminId && String(left.garminId) === String(right.garminId)) return true;
  if (sportFamily(left) !== sportFamily(right)) return false;
  if (activityDate(left) !== activityDate(right)) return false;

  const leftDistance = Number(left.distance || 0);
  const rightDistance = Number(right.distance || 0);
  const distanceClose = (!leftDistance && !rightDistance)
    || Math.abs(leftDistance - rightDistance) <= Math.max(0.35, Math.max(leftDistance, rightDistance) * 0.06);

  const leftSeconds = Number(left.durationSeconds || Number(left.duration || 0) * 60);
  const rightSeconds = Number(right.durationSeconds || Number(right.duration || 0) * 60);
  const durationClose = (!leftSeconds && !rightSeconds)
    || Math.abs(leftSeconds - rightSeconds) <= Math.max(600, Math.max(leftSeconds, rightSeconds) * 0.3);

  const leftTime = activityTimestamp(left).getTime();
  const rightTime = activityTimestamp(right).getTime();
  const timeClose = leftTime > 0 && rightTime > 0 ? Math.abs(leftTime - rightTime) <= 4 * 60 * 60 * 1000 : true;
  return distanceClose && durationClose && timeClose;
}

export function preferredActivities(activities = [], { hideStrava = false } = {}) {
  const ordered = [...activities].sort((left, right) => {
    const priority = sourcePriority(right) - sourcePriority(left);
    if (priority) return priority;
    return activityTimestamp(right) - activityTimestamp(left);
  });
  const selected = [];
  ordered.forEach((activity) => {
    if (hideStrava && String(activity?.source || "").toLowerCase() === "strava") return;
    if (selected.some((current) => activitiesLikelySame(current, activity))) return;
    selected.push(activity);
  });
  return selected.sort((left, right) => activityTimestamp(right) - activityTimestamp(left));
}

export function durationClock(activityOrSeconds) {
  const seconds = typeof activityOrSeconds === "number"
    ? activityOrSeconds
    : Number(activityOrSeconds?.durationSeconds || Number(activityOrSeconds?.duration || 0) * 60);
  const rounded = Math.max(0, Math.round(seconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const rest = rounded % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}` : `${minutes}:${String(rest).padStart(2, "0")}`;
}

export function monthKey(activity) {
  return activityDate(activity).slice(0, 7);
}

export function startOfIsoWeek(input) {
  const date = new Date(input);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function isoDateLocal(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isoWeekNumber(input) {
  const date = new Date(Date.UTC(input.getFullYear(), input.getMonth(), input.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}
