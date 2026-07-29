export const ONBOARDING_VERSION = 2;
export const ONBOARDING_STEPS = [
  { key: "profile", label: "Über dich" },
  { key: "intervals", label: "Daten verbinden" },
  { key: "baseline", label: "Ausgangslage" },
  { key: "mission", label: "Dein Ziel" },
  { key: "week", label: "Deine Woche" },
  { key: "summary", label: "Startklar" },
];

const WEEKDAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

function hasValue(value) {
  return value !== "" && value !== null && value !== undefined;
}

function numeric(value, fallback = 0) {
  if (!hasValue(value)) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bounded(value, minimum, maximum, fallback = minimum) {
  return Math.max(minimum, Math.min(maximum, numeric(value, fallback)));
}

function populatedArray(value) {
  return Array.isArray(value) && value.length > 0;
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function hasEstablishedAthleteData(state = {}) {
  const profile = state.profile || {};
  const mission = state.mission || {};
  const mobility = state.mobilityCoach || {};
  const planner = state.planner || {};

  return Boolean(
    String(profile.displayName || "").trim()
    || profile.birthDate
    || hasValue(profile.heightCm)
    || hasValue(profile.weightKg)
    || numeric(profile.selfReportedRunsPerWeek) > 0
    || hasValue(profile.selfReportedWeeklyKm)
    || populatedArray(state.activities)
    || populatedArray(state.plan)
    || populatedArray(state.equipment)
    || populatedArray(state.fuel)
    || populatedArray(state.healthCheckins)
    || populatedArray(state.coachRecommendationHistory)
    || populatedArray(mobility.history)
    || populatedArray(planner.recurringCommitments)
    || Object.keys(state.reviews || {}).length > 0
    || String(mission.name || "").trim()
    || populatedArray(mission.milestones)
    || state.intervals?.connected
    || state.garmin?.lastImportAt
  );
}

export function normalizeOnboarding(state = {}) {
  const current = state.onboarding && typeof state.onboarding === "object"
    ? state.onboarding
    : {};

  if (current.status === "completed" || current.completedAt) {
    return {
      version: Math.max(ONBOARDING_VERSION, numeric(current.version)),
      status: "completed",
      completedAt: current.completedAt || null,
      migratedFromExistingData: Boolean(current.migratedFromExistingData),
    };
  }

  if (current.status === "pending" && current.migratedFromExistingData === false) {
    return {
      version: Math.max(ONBOARDING_VERSION, numeric(current.version)),
      status: "pending",
      completedAt: null,
      migratedFromExistingData: false,
    };
  }

  if (hasEstablishedAthleteData(state)) {
    return {
      version: ONBOARDING_VERSION,
      status: "completed",
      completedAt: null,
      migratedFromExistingData: true,
    };
  }

  return {
    version: ONBOARDING_VERSION,
    status: "pending",
    completedAt: null,
    migratedFromExistingData: false,
  };
}

export function completedLegacyOnboarding() {
  return {
    version: ONBOARDING_VERSION,
    status: "completed",
    completedAt: null,
    migratedFromExistingData: true,
  };
}

export function createOnboardingDraft(state = {}) {
  const profile = state.profile || {};
  return {
    displayName: String(profile.displayName || ""),
    birthDate: profile.birthDate || "",
    heightCm: profile.heightCm ?? "",
    weightKg: profile.weightKg ?? "",
    experienceLevel: "",
    currentRunsPerWeek: "",
    weeklyKm: "",
    longestRunKm: "",
    missionMode: "general",
    missionName: "",
    missionDate: "",
    missionDistanceKm: "",
    targetRunCount: 2,
    runDays: [],
    stabiCount: 1,
    stabiDays: [],
    recurringCommitments: [],
    coachProgressionEnabled: true,
    intervalsConnected: Boolean(state.intervals?.connected),
    intervalsImportedActivities: 0,
    baselineSource: "",
  };
}

export function onboardingStepError(stepKey, draft = {}) {
  if (stepKey === "profile" && !String(draft.displayName || "").trim()) {
    return "Bitte sag deinem Coach, wie er dich ansprechen darf.";
  }

  if (stepKey === "intervals" && !draft.intervalsConnected) {
    return "Bitte verbinde zuerst dein persönliches Intervals.icu-Konto.";
  }

  if (stepKey === "baseline") {
    if (!["beginner", "advanced", "experienced", "individual"].includes(draft.experienceLevel)) {
      return "Bitte wähle die Ausgangslage, die aktuell am besten passt.";
    }
    if (!hasValue(draft.currentRunsPerWeek) || !hasValue(draft.weeklyKm) || !hasValue(draft.longestRunKm)) {
      return "Bitte ergänze alle drei Trainingswerte. Eine 0 ist völlig in Ordnung.";
    }
    if (numeric(draft.currentRunsPerWeek, -1) < 0 || numeric(draft.currentRunsPerWeek) > 7) {
      return "Die aktuelle Lauffrequenz muss zwischen 0 und 7 liegen.";
    }
    if (numeric(draft.weeklyKm, -1) < 0 || numeric(draft.weeklyKm) > 300) {
      return "Der aktuelle Wochenumfang muss zwischen 0 und 300 km liegen.";
    }
    if (numeric(draft.longestRunKm, -1) < 0 || numeric(draft.longestRunKm) > 250) {
      return "Der längste Lauf muss zwischen 0 und 250 km liegen.";
    }
  }

  if (stepKey === "mission" && draft.missionMode === "event") {
    if (!String(draft.missionName || "").trim() || !draft.missionDate || numeric(draft.missionDistanceKm) <= 0) {
      return "Für ein konkretes Ziel werden Name, Datum und Distanz benötigt.";
    }
  }

  if (stepKey === "week") {
    const target = Math.round(bounded(draft.targetRunCount, 1, 7, 2));
    const runDays = Array.isArray(draft.runDays) ? draft.runDays.filter((day) => WEEKDAYS.includes(day)) : [];
    if (runDays.length < target) {
      return `Wähle mindestens ${target} mögliche Lauftag${target === 1 ? "" : "e"} aus.`;
    }
    const stabiCount = Math.round(bounded(draft.stabiCount, 0, 7, 0));
    const stabiDays = Array.isArray(draft.stabiDays) ? draft.stabiDays.filter((day) => WEEKDAYS.includes(day)) : [];
    if (stabiCount > 0 && stabiDays.length < stabiCount) {
      return `Wähle mindestens ${stabiCount} mögliche Stabi- oder Mobility-Tag${stabiCount === 1 ? "" : "e"} aus.`;
    }
  }

  return "";
}

function runningActivity(activity) {
  const value = `${activity?.category || ""} ${activity?.type || ""} ${activity?.sportType || ""}`.toLowerCase();
  return activity && (/running/.test(value) || /\brun\b/.test(value) || /trailrun|virtualrun/.test(value));
}

function activityTimestamp(activity) {
  const value = activity?.startDateLocal || activity?.date;
  const timestamp = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function onboardingBaselineFromActivities(activities = [], now = new Date()) {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const sixWeeksAgo = new Date(end);
  sixWeeksAgo.setDate(sixWeeksAgo.getDate() - 42);
  const eightWeeksAgo = new Date(end);
  eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);

  const runs = (Array.isArray(activities) ? activities : [])
    .filter(runningActivity)
    .map((activity) => ({ activity, timestamp: activityTimestamp(activity) }))
    .filter((entry) => entry.timestamp != null && entry.timestamp <= end.getTime());
  const sixWeekRuns = runs.filter((entry) => entry.timestamp >= sixWeeksAgo.getTime());
  const eightWeekRuns = runs.filter((entry) => entry.timestamp >= eightWeeksAgo.getTime());
  const weeklyKm = sixWeekRuns.reduce((sum, entry) => sum + Number(entry.activity.distance || 0), 0) / 6;
  const longestRunKm = eightWeekRuns.reduce(
    (longest, entry) => Math.max(longest, Number(entry.activity.distance || 0)),
    0,
  );

  return {
    hasData: eightWeekRuns.length > 0,
    activityCount: eightWeekRuns.length,
    currentRunsPerWeek: Math.round((sixWeekRuns.length / 6) * 2) / 2,
    weeklyKm: Number(weeklyKm.toFixed(1)),
    longestRunKm: Number(longestRunKm.toFixed(1)),
  };
}

function goalFromDraft(draft, preparationStartDate, idFactory) {
  if (draft.missionMode !== "event") return null;
  const event = {
    id: idFactory(),
    name: String(draft.missionName || "").trim(),
    date: draft.missionDate,
    time: "",
    location: "",
    place: null,
    targetKm: bounded(draft.missionDistanceKm, 1, 500, 1),
    preparationStartDate,
    isMainTarget: true,
    priority: "A",
    goalType: "finish",
    targetTime: "",
    elevationGain: 0,
    elevationLoss: 0,
    surface: "road",
    role: "",
    archived: false,
  };
  return event;
}

export function completeOnboardingState(
  state,
  draft,
  { now = new Date(), idFactory = () => crypto.randomUUID() } = {},
) {
  const completedAt = now.toISOString();
  const targetRunCount = Math.round(bounded(draft.targetRunCount, 1, 7, 2));
  const stabiCount = Math.round(bounded(draft.stabiCount, 0, 7, 0));
  const goal = goalFromDraft(draft, localDateKey(now), idFactory);
  const existingMilestones = Array.isArray(state.mission?.milestones) ? state.mission.milestones : [];
  const commitments = (Array.isArray(draft.recurringCommitments) ? draft.recurringCommitments : [])
    .map((commitment) => ({ ...commitment }));

  return {
    ...state,
    onboarding: {
      version: ONBOARDING_VERSION,
      status: "completed",
      completedAt,
      migratedFromExistingData: false,
    },
    profile: {
      ...state.profile,
      displayName: String(draft.displayName || "").trim(),
      birthDate: draft.birthDate || "",
      heightCm: hasValue(draft.heightCm) ? bounded(draft.heightCm, 100, 230, 170) : "",
      weightKg: hasValue(draft.weightKg) ? bounded(draft.weightKg, 30, 250, 70) : "",
      experienceLevel: draft.experienceLevel,
      selfReportedRunsPerWeek: bounded(draft.currentRunsPerWeek, 0, 7, 0),
      selfReportedWeeklyKm: bounded(draft.weeklyKm, 0, 300, 0),
      selfReportedLongestRunKm: bounded(draft.longestRunKm, 0, 250, 0),
      reviewTrackingStartDate: state.profile?.reviewTrackingStartDate || localDateKey(now),
      defaultBottleVolumeMl: numeric(state.profile?.defaultBottleVolumeMl, 650),
      coachProgressionEnabled: draft.coachProgressionEnabled !== false,
      progressionAcceptedAt: null,
    },
    mission: goal && !existingMilestones.length
      ? {
          ...state.mission,
          id: goal.id,
          name: goal.name,
          date: goal.date,
          time: goal.time,
          location: "",
          targetKm: goal.targetKm,
          preparationStartDate: goal.preparationStartDate,
          milestones: [goal],
        }
      : state.mission,
    planner: {
      ...state.planner,
      targetRunCount,
      runDays: [...new Set(draft.runDays)].filter((day) => WEEKDAYS.includes(day)),
      stabiCount,
      stabiDays: stabiCount > 0
        ? [...new Set(draft.stabiDays)].filter((day) => WEEKDAYS.includes(day))
        : [],
      rowingCount: 0,
      rowingDays: [],
      doubleTrainingDays: [],
      recurringCommitments: commitments,
      legacyMigrationComplete: true,
    },
    intervals: {
      ...state.intervals,
      configured: Boolean(draft.intervalsConnected || state.intervals?.configured),
      connected: Boolean(draft.intervalsConnected || state.intervals?.connected),
    },
  };
}
