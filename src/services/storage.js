import { migrateConfiguration } from "./configuration.js";
import { normalizeAppearance } from "./theme.js";

const KEY = "endurance-intelligence.v1";

function isDemoEntry(entry) {
  return entry?.source === "demo" || /^[defp]\d+$/.test(String(entry?.id || ""));
}

function sanitizeState(state, defaults) {
  const sanitized = {
    ...defaults,
    ...state,
    activities: Array.isArray(state?.activities)
      ? state.activities.filter((activity) => !isDemoEntry(activity))
      : [],
    activityGroups: Array.isArray(state?.activityGroups) ? state.activityGroups : [],
    plan: Array.isArray(state?.plan)
      ? state.plan.filter((item) => !isDemoEntry(item))
      : [],
    equipment: Array.isArray(state?.equipment)
      ? state.equipment.filter((item) => !isDemoEntry(item))
      : [],
    fuel: Array.isArray(state?.fuel)
      ? state.fuel.filter((item) => !isDemoEntry(item))
      : [],
    fuelCatalogExclusions: Array.isArray(state?.fuelCatalogExclusions) ? state.fuelCatalogExclusions : [],
    reviews: state?.reviews && typeof state.reviews === "object" ? state.reviews : {},
    healthCheckins: Array.isArray(state?.healthCheckins) ? state.healthCheckins : [],
    mobilityCoach: {
      ...defaults.mobilityCoach,
      ...(state?.mobilityCoach || {}),
      equipment: Array.isArray(state?.mobilityCoach?.equipment) ? state.mobilityCoach.equipment : defaults.mobilityCoach.equipment,
      physioExerciseIds: Array.isArray(state?.mobilityCoach?.physioExerciseIds) ? state.mobilityCoach.physioExerciseIds : defaults.mobilityCoach.physioExerciseIds,
      focusAreaIds: Array.isArray(state?.mobilityCoach?.focusAreaIds) ? state.mobilityCoach.focusAreaIds : defaults.mobilityCoach.focusAreaIds,
      knownExerciseIds: Array.isArray(state?.mobilityCoach?.knownExerciseIds) ? state.mobilityCoach.knownExerciseIds : defaults.mobilityCoach.knownExerciseIds,
      history: Array.isArray(state?.mobilityCoach?.history) ? state.mobilityCoach.history : defaults.mobilityCoach.history,
    },
    appearance: normalizeAppearance({ ...defaults.appearance, ...(state?.appearance || {}) }),
    profile: { ...defaults.profile, ...(state?.profile || {}) },
    planner: { ...defaults.planner, ...(state?.planner || {}) },
    garmin: { ...defaults.garmin, ...(state?.garmin || {}) },
    intervals: { ...defaults.intervals, ...(state?.intervals || {}) },
    mission: { ...defaults.mission, ...(state?.mission || {}) },
    calendar: { ...defaults.calendar, ...(state?.calendar || {}) },
  };
  delete sanitized.strava;
  return migrateConfiguration(sanitized);
}

export function loadState(defaults) {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored) return sanitizeState(JSON.parse(stored), defaults);

  } catch {
    // Fall through to clean defaults.
  }

  return migrateConfiguration(defaults);
}

export function saveState(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function createStateBackup(state) {
  return {
    format: "endurance-intelligence-backup",
    version: 1,
    createdAt: new Date().toISOString(),
    data: state,
  };
}

export function downloadStateBackup(state) {
  const backup = createStateBackup(state);
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `eym-backup-${backup.createdAt.slice(0, 10)}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function parseStateBackup(text, defaults) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Die Sicherungsdatei enthält kein gültiges JSON.");
  }
  const wrapped = parsed?.format === "endurance-intelligence-backup";
  const data = wrapped ? parsed.data : parsed;
  if (!data || typeof data !== "object" || !["activities", "plan", "profile", "mission"].some((key) => key in data)) {
    throw new Error("Die Datei ist keine gültige EYM-Sicherung.");
  }
  return {
    state: sanitizeState(data, defaults),
    createdAt: wrapped ? parsed.createdAt || null : null,
  };
}

export async function readStateBackup(file, defaults) {
  if (!file) throw new Error("Bitte eine EYM-Sicherungsdatei auswählen.");
  return parseStateBackup(await file.text(), defaults);
}

export function resetState() {
  localStorage.removeItem(KEY);
  location.reload();
}
