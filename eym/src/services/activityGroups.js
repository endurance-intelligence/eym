import { activityTimestamp, reviewKind } from "./activityUtils";

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function aggregateZones(activities) {
  const zones = new Map();
  activities.forEach((activity) => {
    (activity.heartRateZones?.zones || []).forEach((zone) => {
      const key = Number(zone.zone || 0);
      if (!key) return;
      const current = zones.get(key) || { zone: key, min: zone.min, max: zone.max, seconds: 0 };
      current.seconds += number(zone.seconds);
      if (current.min == null && zone.min != null) current.min = zone.min;
      if (current.max == null && zone.max != null) current.max = zone.max;
      zones.set(key, current);
    });
  });
  const total = [...zones.values()].reduce((sum, zone) => sum + zone.seconds, 0);
  if (!total) return null;
  return {
    zones: [...zones.values()]
      .sort((a, b) => a.zone - b.zone)
      .map((zone) => ({ ...zone, percentage: Math.round((zone.seconds / total) * 100) })),
  };
}

export function combinedActivity(group, activities = []) {
  const members = (group.memberActivityIds || [])
    .map((id) => activities.find((activity) => activity.id === id))
    .filter(Boolean)
    .sort((a, b) => activityTimestamp(a) - activityTimestamp(b));
  if (members.length < 2) return null;

  const durationSeconds = members.reduce((sum, item) => sum + number(item.durationSeconds || number(item.duration) * 60), 0);
  const weightedHr = members.reduce((sum, item) => {
    const seconds = number(item.durationSeconds || number(item.duration) * 60);
    return sum + number(item.avgHr) * seconds;
  }, 0);
  const first = members[0];
  const weatherMember = members.find((item) => item.weather?.temperature != null || item.temperature != null) || first;

  return {
    ...first,
    id: group.id,
    name: group.name || "Zusammengefasste Einheit",
    sourceName: group.name || "Zusammengefasste Einheit",
    customName: group.name || null,
    source: "combined",
    isActivityGroup: true,
    memberActivityIds: members.map((item) => item.id),
    memberCount: members.length,
    date: first.date || first.startDateLocal?.slice(0, 10),
    startDateLocal: first.startDateLocal || first.date,
    distance: members.reduce((sum, item) => sum + number(item.distance), 0),
    elevation: Math.round(members.reduce((sum, item) => sum + number(item.elevation), 0)),
    durationSeconds,
    duration: durationSeconds / 60,
    avgHr: durationSeconds > 0 && weightedHr > 0 ? Math.round(weightedHr / durationSeconds) : null,
    maxHr: Math.max(0, ...members.map((item) => number(item.maxHr))) || null,
    calories: members.reduce((sum, item) => sum + number(item.calories), 0),
    weather: weatherMember.weather || null,
    temperature: weatherMember.weather?.temperature ?? weatherMember.temperature ?? null,
    coordinates: weatherMember.coordinates || first.coordinates || null,
    startLatLng: weatherMember.startLatLng || first.startLatLng || null,
    heartRateZones: aggregateZones(members),
    groupMembers: members.map((item) => ({
      id: item.id,
      name: item.name,
      distance: number(item.distance),
      elevation: number(item.elevation),
      duration: number(item.duration),
    })),
  };
}

export function activitiesWithGroups(activities = [], groups = []) {
  const memberIds = new Set();
  const combined = [];
  (Array.isArray(groups) ? groups : []).forEach((group) => {
    const activity = combinedActivity(group, activities);
    if (!activity) return;
    activity.memberActivityIds.forEach((id) => memberIds.add(id));
    combined.push(activity);
  });
  return [...activities.filter((activity) => !memberIds.has(activity.id)), ...combined]
    .sort((a, b) => activityTimestamp(b) - activityTimestamp(a));
}

export function suggestedGroupName(activities = []) {
  const names = activities.map((item) => String(item.name || "")).filter(Boolean);
  if (names.some((name) => /orc\s*track/i.test(name))) return "ORC Track – Gesamteinheit";
  if (names.some((name) => /orc/i.test(name))) return "ORC – Gesamteinheit";
  const first = names[0];
  if (first && names.every((name) => name === first)) return first;
  return "Laufblock – Gesamteinheit";
}

export function canGroupActivities(activities = []) {
  if (activities.length < 2) return false;
  const date = String(activities[0]?.startDateLocal || activities[0]?.date || "").slice(0, 10);
  const kind = reviewKind(activities[0]);
  return Boolean(kind && activities.every((activity) => (
    String(activity?.startDateLocal || activity?.date || "").slice(0, 10) === date
    && reviewKind(activity) === kind
  )));
}
