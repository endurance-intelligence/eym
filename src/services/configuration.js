export const CONFIGURATION_VERSION = 2;

export const WEEKDAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

export const SPORT_OPTIONS = [
  { value: "running", label: "Laufen" },
  { value: "football", label: "Fußball" },
  { value: "cycling", label: "Radfahren" },
  { value: "rowing", label: "Rudern" },
  { value: "mobility", label: "Mobility / Stabi" },
  { value: "swimming", label: "Schwimmen" },
  { value: "strength", label: "Krafttraining" },
  { value: "other", label: "Weitere Sportart" },
];

export const LOAD_OPTIONS = [
  { value: "low", label: "Niedrig" },
  { value: "medium", label: "Mittel" },
  { value: "high", label: "Hoch" },
];

export const DEFAULT_REPLACEMENT_SPORTS = ["running", "cycling", "rowing", "mobility", "swimming", "football"];

const sportLabels = Object.fromEntries(SPORT_OPTIONS.map((entry) => [entry.value, entry.label]));

function commitmentId(prefix) {
  return `commitment-${prefix}`;
}

function legacyCommitments(planner = {}) {
  const fixed = planner.fixedAppointments || {};
  const commitments = [];
  const hasLegacySettings = Object.prototype.hasOwnProperty.call(fixed, "football")
    || Object.prototype.hasOwnProperty.call(fixed, "orcRun")
    || Object.prototype.hasOwnProperty.call(fixed, "saturdayMode");

  if (!hasLegacySettings) return commitments;

  if (fixed.football !== false) {
    commitments.push({
      id: commitmentId("football"),
      name: "Fußball",
      sport: "football",
      weekday: "Montag",
      time: planner.footballTime || "19:00",
      durationMinutes: 90,
      distanceKm: 0,
      load: "high",
      enabled: true,
      allowCombination: true,
      replaceRunOnSameDay: false,
      migratedFrom: "fixedAppointments.football",
    });
  }

  if (fixed.orcRun !== false) {
    commitments.push({
      id: commitmentId("orc-run"),
      name: "ORC Run",
      sport: "running",
      workoutType: "ORC Run",
      weekday: "Mittwoch",
      time: planner.orcTime || "19:00",
      durationMinutes: 62,
      distanceKm: 10,
      load: "medium",
      enabled: true,
      allowCombination: true,
      replaceRunOnSameDay: true,
      migratedFrom: "fixedAppointments.orcRun",
    });
  }

  if (fixed.saturdayMode === "orc") {
    commitments.push({
      id: commitmentId("orc-track"),
      name: "ORC Track",
      sport: "running",
      workoutType: "ORC Track",
      weekday: "Samstag",
      time: planner.orcTrackTime || "09:00",
      durationMinutes: 60,
      distanceKm: 0,
      load: "high",
      enabled: true,
      allowCombination: true,
      replaceRunOnSameDay: true,
      migratedFrom: "fixedAppointments.saturdayMode",
    });
  }

  return commitments;
}

export function normalizeCommitment(commitment = {}) {
  return {
    id: commitment.id || crypto.randomUUID(),
    name: String(commitment.name || sportLabels[commitment.sport] || "Fixtermin").trim(),
    sport: commitment.sport || "other",
    workoutType: commitment.workoutType || "",
    weekday: WEEKDAYS.includes(commitment.weekday) ? commitment.weekday : "Montag",
    time: commitment.time || "18:00",
    durationMinutes: Math.max(0, Number(commitment.durationMinutes || 0)),
    distanceKm: Math.max(0, Number(commitment.distanceKm || 0)),
    load: ["low", "medium", "high"].includes(commitment.load) ? commitment.load : "medium",
    enabled: commitment.enabled !== false,
    allowCombination: commitment.allowCombination !== false,
    replaceRunOnSameDay: commitment.replaceRunOnSameDay !== false && commitment.sport === "running",
    migratedFrom: commitment.migratedFrom || "",
  };
}

export function migrateConfiguration(inputState = {}) {
  const planner = { ...(inputState.planner || {}) };
  const storedCommitments = Array.isArray(planner.recurringCommitments) ? planner.recurringCommitments : [];
  const existingCommitments = planner.legacyMigrationComplete
    ? storedCommitments
    : storedCommitments.length
      ? storedCommitments
      : legacyCommitments(planner);

  const replacementSports = Array.isArray(planner.replacementSports) && planner.replacementSports.length
    ? planner.replacementSports
    : DEFAULT_REPLACEMENT_SPORTS;

  return {
    ...inputState,
    profile: {
      displayName: "",
      birthDate: "",
      heightCm: "",
      weightKg: "",
      units: "metric",
      ...(inputState.profile || {}),
    },
    planner: {
      ...planner,
      configurationVersion: CONFIGURATION_VERSION,
      legacyMigrationComplete: true,
      recurringCommitments: existingCommitments.map(normalizeCommitment),
      replacementSports: [...new Set(replacementSports)],
    },
  };
}

export function sportLabel(value) {
  return sportLabels[value] || "Weitere Sportart";
}

export function emptyCommitment() {
  return normalizeCommitment({
    id: crypto.randomUUID(),
    name: "",
    sport: "running",
    weekday: "Montag",
    time: "18:00",
    durationMinutes: 60,
    distanceKm: 0,
    load: "medium",
    enabled: true,
    allowCombination: true,
    replaceRunOnSameDay: true,
  });
}
