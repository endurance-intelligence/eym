export const GARMIN_IMPORT_FROM = "2025-01-01";

const TYPE_MAP = {
  running: "Run",
  trail_running: "TrailRun",
  treadmill_running: "VirtualRun",
  cycling: "Ride",
  mountain_biking: "MountainBikeRide",
  indoor_cycling: "VirtualRide",
  walking: "Walk",
  hiking: "Hike",
  swimming: "Swim",
  lap_swimming: "Swim",
  open_water_swimming: "Swim",
  strength_training: "WeightTraining",
  cardio: "Workout",
  rowing: "Rowing",
  indoor_rowing: "Rowing",
  soccer: "Soccer",
  other: "Workout",
};

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((Number(value || 0) + Number.EPSILON) * factor) / factor;
}

function asIsoLocal(timestamp) {
  const value = Number(timestamp || 0);
  if (!value) return null;
  return new Date(value).toISOString().replace("Z", "");
}


function normalizeTemperature(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  if (Math.abs(number) > 1000) return round(number / 100, 1);
  if (Math.abs(number) > 100) return round(number / 10, 1);
  return round(number, 1);
}

function normalizeType(activity) {
  const raw = String(activity.activityType || activity.sportType || "other").toLowerCase();
  const name = String(activity.name || "").toLowerCase();

  if (name.includes("fußball") || name.includes("fussball") || name.includes("soccer")) {
    return "Soccer";
  }
  if (name.includes("laufband") || raw.includes("treadmill")) return "VirtualRun";
  if (name.includes("trail") || raw.includes("trail")) return "TrailRun";
  if (name.includes("rudern") || raw.includes("rowing")) return "Rowing";

  return TYPE_MAP[raw] || (String(activity.sportType || "").toUpperCase() === "RUNNING" ? "Run" : "Workout");
}

function isRunType(type) {
  return ["Run", "TrailRun", "VirtualRun"].includes(type);
}

export function mapGarminActivity(activity) {
  const startDateLocal = asIsoLocal(activity.startTimeLocal || activity.beginTimestamp);
  const durationSeconds = Math.round(Number(activity.movingDuration || activity.duration || 0) / 1000);
  const elapsedSeconds = Math.round(Number(activity.elapsedDuration || activity.duration || 0) / 1000);
  const type = normalizeType(activity);

  return {
    id: `garmin-${activity.activityId}`,
    externalId: String(activity.activityId),
    name: activity.name || "Garmin Aktivität",
    sourceName: activity.name || "Garmin Aktivität",
    customName: null,
    nameOverride: false,
    description: activity.description || "",
    date: startDateLocal?.slice(0, 10) || new Date(activity.beginTimestamp || Date.now()).toISOString().slice(0, 10),
    startDateLocal,
    distance: round(Number(activity.distance || 0) / 100000, 2),
    duration: Math.round(durationSeconds / 60),
    durationSeconds,
    elapsedSeconds,
    elevation: Math.round(Number(activity.elevationGain || 0) / 100),
    avgHr: activity.avgHr ? Math.round(Number(activity.avgHr)) : null,
    maxHr: activity.maxHr ? Math.round(Number(activity.maxHr)) : null,
    averageSpeed: round(Number(activity.avgSpeed || 0) * 10, 3),
    maxSpeed: round(Number(activity.maxSpeed || 0) * 10, 3),
    calories: activity.calories ? Math.round(Number(activity.calories) / 4.184) : null,
    steps: activity.steps ? Math.round(Number(activity.steps)) : null,
    averageCadence: activity.avgDoubleCadence ? round(activity.avgDoubleCadence, 1) : activity.avgRunCadence ? round(Number(activity.avgRunCadence) * 2, 1) : null,
    maxCadence: activity.maxDoubleCadence ? round(activity.maxDoubleCadence, 1) : activity.maxRunCadence ? round(Number(activity.maxRunCadence) * 2, 1) : null,
    averagePower: activity.avgPower ? Math.round(Number(activity.avgPower)) : null,
    maxPower: activity.maxPower ? Math.round(Number(activity.maxPower)) : null,
    trainingEffect: activity.aerobicTrainingEffect ? round(activity.aerobicTrainingEffect, 1) : null,
    anaerobicTrainingEffect: activity.anaerobicTrainingEffect ? round(activity.anaerobicTrainingEffect, 1) : null,
    trainingLoad: activity.activityTrainingLoad ? round(activity.activityTrainingLoad, 1) : null,
    vo2Max: activity.vO2MaxValue ? round(activity.vO2MaxValue, 1) : null,
    location: activity.locationName || "",
    temperature: normalizeTemperature(activity.avgTemperature ?? activity.averageTemperature ?? activity.avgTemp),
    weather: null,
    coordinates: activity.startLatitude && activity.startLongitude
      ? { lat: Number(activity.startLatitude), lon: Number(activity.startLongitude) }
      : null,
    type,
    eventTypeId: Number(activity.eventTypeId || 0) || null,
    officialEvent: Number(activity.eventTypeId || 0) === 1,
    category: isRunType(type) ? "running" : "cross-training",
    source: "garmin",
    sources: ["garmin"],
    importedAt: new Date().toISOString(),
  };
}

function getSummaryArray(parsed) {
  if (Array.isArray(parsed)) {
    if (parsed.length === 1 && Array.isArray(parsed[0]?.summarizedActivitiesExport)) {
      return parsed[0].summarizedActivitiesExport;
    }
    if (parsed.every((entry) => entry && typeof entry === "object" && "activityId" in entry)) {
      return parsed;
    }
  }
  if (Array.isArray(parsed?.summarizedActivitiesExport)) return parsed.summarizedActivitiesExport;
  throw new Error("Die Garmin-Aktivitätsübersicht hat ein unbekanntes Format.");
}

export async function readGarminExport(file, importFrom = GARMIN_IMPORT_FROM) {
  if (!file) throw new Error("Bitte eine Garmin-ZIP-Datei auswählen.");
  const lowerName = file.name.toLowerCase();
  let text;
  let sourceFileName = file.name;

  if (lowerName.endsWith(".zip")) {
    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const summaryEntry = Object.values(zip.files).find(
      (entry) => !entry.dir && /summarizedactivities\.json$/i.test(entry.name),
    );
    if (!summaryEntry) {
      throw new Error("In der ZIP-Datei wurde keine summarizedActivities.json gefunden.");
    }
    sourceFileName = summaryEntry.name;
    text = await summaryEntry.async("string");
  } else if (lowerName.endsWith(".json")) {
    text = await file.text();
  } else {
    throw new Error("Unterstützt werden Garmin-Exporte als ZIP oder summarizedActivities.json.");
  }

  const parsed = JSON.parse(text);
  const minDate = new Date(`${importFrom}T00:00:00`).getTime();
  const activities = getSummaryArray(parsed)
    .filter((activity) => Number(activity.startTimeLocal || activity.beginTimestamp || 0) >= minDate)
    .map(mapGarminActivity)
    .sort((a, b) => new Date(b.startDateLocal || b.date) - new Date(a.startDateLocal || a.date));

  const byType = activities.reduce((result, activity) => {
    result[activity.type] = (result[activity.type] || 0) + 1;
    return result;
  }, {});

  return {
    fileName: file.name,
    sourceFileName,
    importFrom,
    activities,
    total: activities.length,
    runs: activities.filter((activity) => activity.category === "running").length,
    distance: round(activities.filter((activity) => activity.category === "running").reduce((sum, activity) => sum + activity.distance, 0), 1),
    byType,
    firstDate: activities.at(-1)?.date || null,
    lastDate: activities.at(0)?.date || null,
  };
}

function sameActivity(a, b) {
  if (a.id === b.id) return true;
  if (a.source === "garmin" && b.source === "garmin") return false;
  const aTime = new Date(a.startDateLocal || `${a.date}T00:00:00`).getTime();
  const bTime = new Date(b.startDateLocal || `${b.date}T00:00:00`).getTime();
  const timeClose = Number.isFinite(aTime) && Number.isFinite(bTime) && Math.abs(aTime - bTime) <= 15 * 60 * 1000;
  const distanceClose = Math.abs(Number(a.distance || 0) - Number(b.distance || 0)) <= 0.2;
  const durationClose = Math.abs(Number(a.durationSeconds || Number(a.duration || 0) * 60) - Number(b.durationSeconds || Number(b.duration || 0) * 60)) <= 180;
  return timeClose && distanceClose && durationClose;
}

export function mergeGarminActivities(existing, imported) {
  const result = [...existing];
  let added = 0;
  let duplicates = 0;

  imported.forEach((garminActivity) => {
    const index = result.findIndex((activity) => sameActivity(activity, garminActivity));
    if (index === -1) {
      result.push(garminActivity);
      added += 1;
      return;
    }

    const current = result[index];
    const customName = current.customName || (current.nameOverride ? current.name : null);
    const latestSourceName = garminActivity.sourceName || garminActivity.name;
    result[index] = {
      ...garminActivity,
      ...current,
      name: customName || latestSourceName,
      sourceName: latestSourceName,
      customName: customName || null,
      nameOverride: Boolean(customName),
      avgHr: current.avgHr ?? garminActivity.avgHr,
      maxHr: current.maxHr ?? garminActivity.maxHr,
      elevation: current.elevation || garminActivity.elevation,
      calories: current.calories ?? garminActivity.calories,
      steps: current.steps ?? garminActivity.steps,
      averageCadence: current.averageCadence ?? garminActivity.averageCadence,
      averagePower: current.averagePower ?? garminActivity.averagePower,
      trainingEffect: current.trainingEffect ?? garminActivity.trainingEffect,
      trainingLoad: current.trainingLoad ?? garminActivity.trainingLoad,
      vo2Max: current.vo2Max ?? garminActivity.vo2Max,
      location: current.location || garminActivity.location,
      temperature: current.temperature ?? garminActivity.temperature,
      weather: current.weather || garminActivity.weather || null,
      coordinates: current.coordinates || garminActivity.coordinates,
      sources: Array.from(new Set([...(current.sources || [current.source].filter(Boolean)), "garmin"])),
    };
    duplicates += 1;
  });

  result.sort((a, b) => new Date(b.startDateLocal || b.date) - new Date(a.startDateLocal || a.date));
  return { activities: result, added, duplicates };
}
