import { migrateConfiguration } from "./configuration";
import { normalizeAppearance } from "./theme";

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

export function resetState() {
  localStorage.removeItem(KEY);
  location.reload();
}
