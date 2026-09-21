import { migrateConfiguration } from "./configuration.js";
import { normalizeAppearance } from "./theme.js";
import { completedLegacyOnboarding } from "./onboarding.js";

const LEGACY_KEY = "endurance-intelligence.v1";
const ACCOUNT_KEY_PREFIX = `${LEGACY_KEY}.user`;
const RECOVERY_KEY_SUFFIX = ".recovery";

function storageKey(userId) {
  const accountId = String(userId || "").trim();
  return accountId ? `${ACCOUNT_KEY_PREFIX}.${accountId}` : LEGACY_KEY;
}

function recoveryStorageKey(userId) {
  return `${storageKey(userId)}${RECOVERY_KEY_SUFFIX}`;
}

function isQuotaError(error) {
  return error?.name === "QuotaExceededError"
    || error?.name === "NS_ERROR_DOM_QUOTA_REACHED"
    || error?.code === 22
    || /quota has been exceeded|quota_exceeded/i.test(String(error?.message || ""));
}

function stripEmbeddedImages(value) {
  if (Array.isArray(value)) return value.map(stripEmbeddedImages);
  if (!value || typeof value !== "object") {
    return /^data:image\//i.test(String(value || "")) ? "" : value;
  }
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, stripEmbeddedImages(child)]));
}

function recoveryState(state = {}) {
  return {
    savedAt: new Date().toISOString(),
    data: stripEmbeddedImages({
      onboarding: state.onboarding,
      appearance: state.appearance,
      profile: state.profile,
      reviews: state.reviews,
      activityGroups: state.activityGroups,
      plan: state.plan,
      equipment: state.equipment,
      fuel: state.fuel,
      racePrepPlans: state.racePrepPlans,
      raceCoachSessions: state.raceCoachSessions,
      fuelCatalogExclusions: state.fuelCatalogExclusions,
      healthCheckins: state.healthCheckins,
      coachRecommendationHistory: state.coachRecommendationHistory,
      mobilityCoach: state.mobilityCoach,
      mission: state.mission,
      planner: state.planner,
      garmin: state.garmin,
      intervals: state.intervals,
      calendar: state.calendar,
    }),
  };
}

function parseRecoveryState(userId) {
  try {
    const parsed = JSON.parse(localStorage.getItem(recoveryStorageKey(userId)) || "null");
    return parsed?.data && typeof parsed.data === "object" ? parsed.data : null;
  } catch {
    return null;
  }
}

function isDemoEntry(entry) {
  return entry?.source === "demo" || /^[defp]\d+$/.test(String(entry?.id || ""));
}

function sanitizeState(state, defaults) {
  const hasStoredOnboarding = Object.prototype.hasOwnProperty.call(state || {}, "onboarding");
  const sanitized = {
    ...defaults,
    ...state,
    onboarding: hasStoredOnboarding ? state.onboarding : completedLegacyOnboarding(),
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
    racePrepPlans: Array.isArray(state?.racePrepPlans) ? state.racePrepPlans : [],
    raceCoachSessions: state?.raceCoachSessions && typeof state.raceCoachSessions === "object" ? state.raceCoachSessions : {},
    fuelCatalogExclusions: Array.isArray(state?.fuelCatalogExclusions) ? state.fuelCatalogExclusions : [],
    reviews: state?.reviews && typeof state.reviews === "object" ? state.reviews : {},
    healthCheckins: Array.isArray(state?.healthCheckins) ? state.healthCheckins : [],
    coachRecommendationHistory: Array.isArray(state?.coachRecommendationHistory) ? state.coachRecommendationHistory : [],
    mobilityCoach: {
      ...defaults.mobilityCoach,
      ...(state?.mobilityCoach || {}),
      equipment: Array.isArray(state?.mobilityCoach?.equipment) ? state.mobilityCoach.equipment : defaults.mobilityCoach.equipment,
      physioExerciseIds: Array.isArray(state?.mobilityCoach?.physioExerciseIds) ? state.mobilityCoach.physioExerciseIds : defaults.mobilityCoach.physioExerciseIds,
      focusAreaIds: Array.isArray(state?.mobilityCoach?.focusAreaIds) ? state.mobilityCoach.focusAreaIds : defaults.mobilityCoach.focusAreaIds,
      knownExerciseIds: Array.isArray(state?.mobilityCoach?.knownExerciseIds) ? state.mobilityCoach.knownExerciseIds : defaults.mobilityCoach.knownExerciseIds,
      preferredExerciseIds: Array.isArray(state?.mobilityCoach?.preferredExerciseIds) ? state.mobilityCoach.preferredExerciseIds : defaults.mobilityCoach.preferredExerciseIds,
      excludedExerciseIds: Array.isArray(state?.mobilityCoach?.excludedExerciseIds) ? state.mobilityCoach.excludedExerciseIds : defaults.mobilityCoach.excludedExerciseIds,
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

export function hasStoredState(userId) {
  try {
    return Boolean(localStorage.getItem(storageKey(userId)) || localStorage.getItem(recoveryStorageKey(userId)));
  } catch {
    return false;
  }
}

export function loadState(defaults, userId = "") {
  try {
    const stored = localStorage.getItem(storageKey(userId));
    const recovered = parseRecoveryState(userId);
    if (stored) {
      const parsed = JSON.parse(stored);
      return sanitizeState(recovered ? { ...parsed, ...recovered } : parsed, defaults);
    }
    if (recovered) return sanitizeState(recovered, defaults);

  } catch {
    // Fall through to clean defaults.
  }

  return migrateConfiguration(defaults);
}

export function saveState(state, userId = "") {
  const key = storageKey(userId);
  const recoveryKey = recoveryStorageKey(userId);
  const recovery = JSON.stringify(recoveryState(state));

  // Write the small, high-value recovery snapshot first. Reviews and the current
  // plan then survive even when iOS Safari refuses the much larger full snapshot.
  try {
    localStorage.setItem(recoveryKey, recovery);
  } catch (error) {
    if (!isQuotaError(error)) throw error;
    try {
      localStorage.removeItem(recoveryKey);
      localStorage.setItem(recoveryKey, recovery);
    } catch {
      // The full/compact save below still gets a chance to recover the account.
    }
  }

  try {
    localStorage.setItem(key, JSON.stringify(state));
    return { mode: "full" };
  } catch (error) {
    if (!isQuotaError(error)) throw error;
  }

  // Embedded product/equipment photos can consume several MB in Safari. They
  // are already migrated to the private image bucket, so a local data URL is a
  // disposable cache. Replacing the full key frees enough room for core data.
  const compact = stripEmbeddedImages(state);
  try {
    localStorage.removeItem(key);
    localStorage.setItem(key, JSON.stringify(compact));
    return { mode: "compact", reason: "quota" };
  } catch (error) {
    if (!isQuotaError(error)) throw error;
  }

  // Last resort: keep the recovery snapshot rather than losing reviews and the
  // freshly generated plan. Imported activities can be restored from Cloud or
  // Intervals.icu once storage is available again.
  localStorage.removeItem(key);
  localStorage.setItem(recoveryKey, recovery);
  return { mode: "recovery", reason: "quota" };
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
  link.download = `endurance-intelligence-backup-${backup.createdAt.slice(0, 10)}.json`;
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
    throw new Error("Die Datei ist keine gültige App-Sicherung.");
  }
  return {
    state: sanitizeState(data, defaults),
    createdAt: wrapped ? parsed.createdAt || null : null,
  };
}

export async function readStateBackup(file, defaults) {
  if (!file) throw new Error("Bitte eine App-Sicherungsdatei auswählen.");
  return parseStateBackup(await file.text(), defaults);
}

export function resetState(userId = "") {
  localStorage.removeItem(storageKey(userId));
  localStorage.removeItem(recoveryStorageKey(userId));
  location.reload();
}
