import { activitiesLikelySame } from "./activityUtils";
import { supabase, supabaseConfigured } from "./supabase";

function safeRedirectUri() {
  return `${window.location.origin}${import.meta.env.BASE_URL}?connection=strava`;
}

async function invokeStrava(action, payload = {}) {
  const { data, error } = await supabase.functions.invoke("strava", {
    body: { action, ...payload },
  });
  if (error) {
    let detail = error.message || "Strava-Anfrage fehlgeschlagen.";
    try {
      const response = error.context;
      if (response?.json) {
        const body = await response.json();
        detail = body?.message || detail;
      }
    } catch {
      // Keep the original functions error.
    }
    throw new Error(detail);
  }
  if (data?.message && !data?.connected && !data?.activities && action !== "status") throw new Error(data.message);
  return data || {};
}

export function stravaOnlineReady() {
  return supabaseConfigured;
}

export function stravaStatus() {
  if (!supabaseConfigured) return { ready: false, label: "Nicht konfiguriert", reason: "Supabase-Verbindung fehlt." };
  return { ready: true, label: "Verfügbar", reason: "OAuth und Synchronisierung laufen über Supabase." };
}

export async function connectStrava(force = false) {
  const data = await invokeStrava("start", { redirectUri: safeRedirectUri(), force });
  if (!data.url) throw new Error("Strava-Anmeldeadresse fehlt.");
  window.location.assign(data.url);
}

export async function exchangeCode(code, state) {
  return invokeStrava("exchange", { code, state, redirectUri: safeRedirectUri() });
}

export async function fetchStravaConnectionStatus() {
  return invokeStrava("status");
}

export async function syncStravaActivities(after = "2025-01-01") {
  return invokeStrava("sync", { after });
}

export async function disconnectStravaConnection() {
  return invokeStrava("disconnect");
}

export function isRunningActivity(activity) {
  const type = activity?.sport_type || activity?.type;
  return ["Run", "TrailRun", "VirtualRun"].includes(type);
}

export function mapStravaActivity(activity) {
  const durationSeconds = Number(activity.moving_time || 0);
  const distanceKm = Number((Number(activity.distance || 0) / 1000).toFixed(2));
  const type = activity.sport_type || activity.type || "Workout";
  return {
    id: `strava-${activity.id}`,
    externalId: String(activity.id),
    name: activity.name || "Strava Aktivität",
    sourceName: activity.name || "Strava Aktivität",
    customName: null,
    nameOverride: false,
    date: activity.start_date_local?.slice(0, 10) || new Date().toISOString().slice(0, 10),
    startDateLocal: activity.start_date_local || null,
    distance: distanceKm,
    duration: Math.round(durationSeconds / 60),
    durationSeconds,
    elapsedSeconds: Number(activity.elapsed_time || durationSeconds),
    elevation: Math.round(Number(activity.total_elevation_gain || 0)),
    avgHr: activity.average_heartrate ? Math.round(Number(activity.average_heartrate)) : null,
    maxHr: activity.max_heartrate ? Math.round(Number(activity.max_heartrate)) : null,
    heartRateZones: activity.heart_rate_zones || null,
    hasHeartRate: Boolean(activity.has_heartrate),
    averageSpeed: Number(activity.average_speed || 0),
    calories: activity.calories ? Math.round(Number(activity.calories)) : null,
    type,
    category: isRunningActivity(activity) ? "running" : "cross-training",
    workoutType: activity.workout_type ?? null,
    temperature: activity.average_temp ?? null,
    coordinates: Array.isArray(activity.start_latlng) && activity.start_latlng.length >= 2
      ? { lat: Number(activity.start_latlng[0]), lon: Number(activity.start_latlng[1]) }
      : null,
    location: activity.location_city || activity.location_state || "",
    source: "strava",
    sources: ["strava"],
  };
}

export function mapStravaActivities(activities) {
  return activities
    .map(mapStravaActivity)
    .sort((a, b) => new Date(b.startDateLocal || b.date) - new Date(a.startDateLocal || a.date));
}


export function mergeStravaActivities(existing, imported) {
  const result = [...existing];
  let added = 0;
  let duplicates = 0;
  imported.forEach((stravaActivity) => {
    const index = result.findIndex((activity) => activitiesLikelySame(activity, stravaActivity));
    if (index === -1) {
      result.push(stravaActivity);
      added += 1;
      return;
    }
    const current = result[index];
    const currentIsPrimary = ["intervals", "garmin", "manual"].includes(String(current.source || "").toLowerCase());
    const customName = current.customName || (current.nameOverride ? current.name : null);
    const latestSourceName = currentIsPrimary
      ? current.sourceName || current.name
      : stravaActivity.sourceName || stravaActivity.name;
    result[index] = {
      ...stravaActivity,
      ...current,
      id: current.id || stravaActivity.id,
      source: currentIsPrimary ? current.source : "strava",
      name: customName || latestSourceName,
      sourceName: latestSourceName,
      customName: customName || null,
      nameOverride: Boolean(customName),
      avgHr: current.avgHr ?? stravaActivity.avgHr,
      maxHr: current.maxHr ?? stravaActivity.maxHr,
      heartRateZones: current.heartRateZones || stravaActivity.heartRateZones || null,
      hasHeartRate: current.hasHeartRate ?? stravaActivity.hasHeartRate,
      elevation: current.elevation || stravaActivity.elevation,
      calories: current.calories ?? stravaActivity.calories,
      temperature: current.temperature ?? stravaActivity.temperature,
      weather: current.weather || stravaActivity.weather || null,
      coordinates: current.coordinates || stravaActivity.coordinates || null,
      location: current.location || stravaActivity.location || "",
      externalId: current.externalId || stravaActivity.externalId,
      stravaId: stravaActivity.externalId || current.stravaId || null,
      sources: Array.from(new Set([...(current.sources || [current.source].filter(Boolean)), "strava"])),
    };
    duplicates += 1;
  });
  result.sort((a, b) => new Date(b.startDateLocal || b.date) - new Date(a.startDateLocal || a.date));
  return { activities: result, added, duplicates };
}

export function mapRunningActivities(activities) {
  return mapStravaActivities(activities).filter((activity) => activity.category === "running");
}
