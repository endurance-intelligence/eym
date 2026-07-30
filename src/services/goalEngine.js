import {
  activityTimestamp,
  isRunningActivity,
  preferredActivities,
} from "./activityUtils.js";
import { activitiesWithGroups } from "./activityGroups.js";
import {
  eventCourseProfile,
  eventPriority,
  missionEvents,
  selectStrategicTarget,
} from "./goalPlanning.js";

const DAY_MS = 86400000;

export const GOAL_DISCIPLINE_OPTIONS = [
  { value: "auto", label: "Automatisch aus Distanz und Event erkennen" },
  { value: "5k", label: "5 km" },
  { value: "10k", label: "10 km" },
  { value: "half_marathon", label: "Halbmarathon" },
  { value: "marathon", label: "Marathon" },
  { value: "ultra", label: "Ultra / langer Traillauf" },
  { value: "backyard", label: "Backyard Ultra" },
];

const DISCIPLINE_RULES = {
  general: {
    label: "Allgemeine Ausdauer",
    canonicalKm: 0,
    minWeeks: { finish: 0, time: 0 },
    requiredRuns: { finish: 2, time: 3 },
    taperDays: 7,
    specificDays: 35,
    buildDays: 84,
    longShares: { base: 0.3, build: 0.32, specific: 0.34, peak: 0.3, taper: 0.24 },
    longRun: { minimum: 5, maximum: 18 },
    abilities: ["aerobe Basis", "regelmäßige Laufverträglichkeit", "Erholung"],
  },
  "5k": {
    label: "5 km",
    canonicalKm: 5,
    minWeeks: { finish: 9, time: 10 },
    requiredRuns: { finish: 3, time: 3 },
    taperDays: 7,
    specificDays: 35,
    buildDays: 70,
    longShares: { base: 0.28, build: 0.3, specific: 0.28, peak: 0.26, taper: 0.22 },
    longRun: { minimum: 4, maximum: 12 },
    abilities: ["Laufverträglichkeit", "Laufökonomie", "Schwelle", "5-km-spezifisches Tempo"],
  },
  "10k": {
    label: "10 km",
    canonicalKm: 10,
    minWeeks: { finish: 10, time: 12 },
    requiredRuns: { finish: 3, time: 4 },
    taperDays: 10,
    specificDays: 42,
    buildDays: 84,
    longShares: { base: 0.3, build: 0.33, specific: 0.34, peak: 0.3, taper: 0.23 },
    longRun: { minimum: 6, maximum: 16 },
    abilities: ["aerobe Basis", "Schwelle", "Tempoausdauer", "10-km-spezifisches Tempo"],
  },
  half_marathon: {
    label: "Halbmarathon",
    canonicalKm: 21.0975,
    minWeeks: { finish: 12, time: 14 },
    requiredRuns: { finish: 3, time: 4 },
    taperDays: 14,
    specificDays: 56,
    buildDays: 112,
    longShares: { base: 0.33, build: 0.36, specific: 0.39, peak: 0.35, taper: 0.24 },
    longRun: { minimum: 8, maximum: 20 },
    abilities: ["aerobe Ausdauer", "Schwelle", "Halbmarathon-Tempo", "progressive Longruns"],
  },
  marathon: {
    label: "Marathon",
    canonicalKm: 42.195,
    minWeeks: { finish: 18, time: 20 },
    requiredRuns: { finish: 4, time: 5 },
    taperDays: 21,
    specificDays: 70,
    buildDays: 140,
    longShares: { base: 0.34, build: 0.38, specific: 0.42, peak: 0.38, taper: 0.25 },
    longRun: { minimum: 10, maximum: 32 },
    abilities: ["muskuläre Ausdauer", "Marathon-Tempo", "lange Läufe", "Fueling unter Belastung"],
  },
  ultra: {
    label: "Ultra",
    canonicalKm: 50,
    minWeeks: { finish: 20, time: 24 },
    requiredRuns: { finish: 4, time: 5 },
    taperDays: 21,
    specificDays: 84,
    buildDays: 154,
    longShares: { base: 0.36, build: 0.4, specific: 0.44, peak: 0.4, taper: 0.25 },
    longRun: { minimum: 12, maximum: 42 },
    abilities: ["Zeit auf den Beinen", "muskuläre Robustheit", "Fueling", "Strecken- und Höhenprofil"],
  },
  backyard: {
    label: "Backyard Ultra",
    canonicalKm: 100,
    minWeeks: { finish: 18, time: 22 },
    requiredRuns: { finish: 4, time: 5 },
    taperDays: 18,
    specificDays: 84,
    buildDays: 154,
    longShares: { base: 0.36, build: 0.4, specific: 0.45, peak: 0.4, taper: 0.25 },
    longRun: { minimum: 12, maximum: 42 },
    abilities: ["wiederholte Runden", "Pausenroutine", "Zeit auf den Beinen", "Fueling", "Laufen mit Vorermüdung"],
  },
};

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bounded(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, numeric(value)));
}

function localDate(value) {
  const source = value instanceof Date ? new Date(value) : new Date(`${String(value || "").slice(0, 10)}T12:00:00`);
  return Number.isNaN(source.getTime()) ? null : source;
}

function goalMode(value) {
  return ["time", "pb"].includes(value) ? "time" : "finish";
}

function activityDurationSeconds(activity = {}) {
  return numeric(activity?.durationSeconds) || numeric(activity?.duration) * 60;
}

function dateKey(value) {
  const date = localDate(value);
  if (!date) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function weekKey(value) {
  const date = localDate(value);
  if (!date) return "";
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return dateKey(date);
}

function compactNumber(value, digits = 1) {
  const rounded = Number(numeric(value).toFixed(digits));
  return String(rounded).replace(".", ",");
}

function distanceLabel(value) {
  return `${compactNumber(value, numeric(value) < 10 ? 1 : 1)} km`;
}

function weeksLabel(value) {
  const rounded = Math.max(0, Number(numeric(value).toFixed(1)));
  return `${compactNumber(rounded, 1)} ${rounded === 1 ? "Woche" : "Wochen"}`;
}

function shortGermanDate(value) {
  const date = localDate(value);
  if (!date) return "";
  return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.${date.getFullYear()}`;
}

function normalizedGoalActivities(activities = [], activityGroups = []) {
  const canonical = preferredActivities(Array.isArray(activities) ? activities : []);
  return activitiesWithGroups(canonical, Array.isArray(activityGroups) ? activityGroups : []);
}

function runningReviewSignals(runs = [], reviews = {}) {
  const values = runs.map((activity) => reviews?.[activity.id]).filter(Boolean);
  const strained = values.filter((review) => {
    const symptoms = Array.isArray(review.legSymptoms)
      ? review.legSymptoms.join(" ")
      : String(review.legSymptoms || "");
    return (numeric(review.legs) > 0 && numeric(review.legs) <= 4)
      || (numeric(review.energy) > 0 && numeric(review.energy) <= 4)
      || /schmerz/i.test(symptoms);
  });
  const stable = values.filter((review) => (
    numeric(review.legs) >= 6
    && numeric(review.energy) >= 6
    && !strained.includes(review)
  ));
  return {
    count: values.length,
    stableShare: values.length ? stable.length / values.length : null,
    strainedShare: values.length ? strained.length / values.length : null,
  };
}

export function parseGoalDurationSeconds(value) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(value));
  const input = String(value || "").trim();
  if (!input) return 0;
  const parts = input.split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part) || part < 0)) return 0;
  if (parts.length === 2) {
    const [hours, minutes] = parts;
    if (minutes > 59) return 0;
    return Math.round(hours * 3600 + minutes * 60);
  }
  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts;
    if (minutes > 59 || seconds > 59) return 0;
    return Math.round(hours * 3600 + minutes * 60 + seconds);
  }
  return 0;
}

export function formatGoalDurationInput(value) {
  const seconds = parseGoalDurationSeconds(value);
  if (!seconds) return "";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export function formatGoalDuration(value) {
  const seconds = typeof value === "number" ? Math.max(0, Math.round(value)) : parseGoalDurationSeconds(value);
  if (!seconds) return "";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")} h`;
  return `${minutes}:${String(remainder).padStart(2, "0")} min`;
}

export function formatPaceSeconds(value) {
  const seconds = Math.max(0, Math.round(numeric(value)));
  if (!seconds) return "";
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function inferGoalDiscipline(target = {}) {
  const explicit = String(target.goalDiscipline || "").toLowerCase();
  if (explicit && explicit !== "auto" && DISCIPLINE_RULES[explicit]) return explicit;
  const name = String(target.name || "").toLowerCase();
  const distance = numeric(target.targetKm);
  const course = eventCourseProfile(target);
  if (/backyard|last\s*(person|man)\s*standing/.test(name)) return "backyard";
  if (course.courseType === "loop" && course.loopKm >= 6.5 && course.loopKm <= 6.8 && distance >= 50) return "backyard";
  if (/ultra/.test(name) || distance > 45) return "ultra";
  if (/marathon/.test(name) && !/halb|half/.test(name)) return "marathon";
  if (/halbmarathon|half\s*marathon/.test(name)) return "half_marathon";
  if (distance > 0 && distance <= 5.5) return "5k";
  if (distance <= 10.5 && distance > 5.5) return "10k";
  if (distance <= 23 && distance > 10.5) return "half_marathon";
  if (distance <= 45 && distance > 23) return "marathon";
  return "general";
}

function targetFromMission(mission = {}, referenceDate = new Date()) {
  const selected = selectStrategicTarget(mission, referenceDate);
  if (selected) return selected;
  if (mission?.name || mission?.targetKm) {
    return {
      ...mission,
      priority: mission.isMainTarget ? "A" : mission.priority || "A",
      isMainTarget: true,
    };
  }
  return null;
}

function recentRunningBaseline(
  activities = [],
  profile = {},
  referenceDate = new Date(),
  activityGroups = [],
  reviews = {},
) {
  const reference = localDate(referenceDate) || new Date();
  reference.setHours(23, 59, 59, 999);
  const sixWeeksAgo = new Date(reference.getTime() - 42 * DAY_MS);
  const twelveWeeksAgo = new Date(reference.getTime() - 84 * DAY_MS);
  const sixteenWeeksAgo = new Date(reference.getTime() - 112 * DAY_MS);
  const allRuns = normalizedGoalActivities(activities, activityGroups)
    .filter(isRunningActivity)
    .filter((activity) => {
      const timestamp = activityTimestamp(activity).getTime();
      return Number.isFinite(timestamp) && timestamp > 0 && timestamp <= reference.getTime();
    });
  const runs = allRuns.filter((activity) => activityTimestamp(activity) >= sixteenWeeksAgo.getTime());
  const sixWeekRuns = runs.filter((activity) => activityTimestamp(activity) >= sixWeeksAgo.getTime());
  const twelveWeekRuns = runs.filter((activity) => activityTimestamp(activity) >= twelveWeeksAgo.getTime());
  const weeklyKm = sixWeekRuns.length
    ? sixWeekRuns.reduce((sum, activity) => sum + numeric(activity.distance), 0) / 6
    : numeric(profile.selfReportedWeeklyKm);
  const runDays = sixWeekRuns.length
    ? new Set(sixWeekRuns.map((activity) => String(activity.startDateLocal || activity.date || "").slice(0, 10))).size / 6
    : numeric(profile.selfReportedRunsPerWeek);
  const longest = runs.length
    ? Math.max(0, ...runs.map((activity) => numeric(activity.distance)))
    : numeric(profile.selfReportedLongestRunKm);
  const paces = sixWeekRuns.map((activity) => {
    const distance = numeric(activity.distance);
    const durationSeconds = activityDurationSeconds(activity);
    return distance >= 2 && durationSeconds > 0 ? durationSeconds / distance : 0;
  }).filter((pace) => pace >= 150 && pace <= 1200).sort((left, right) => left - right);
  const medianPaceSeconds = paces.length ? paces[Math.floor(paces.length / 2)] : 0;
  const activeWeeks12 = new Set(twelveWeekRuns.map((activity) => weekKey(activityTimestamp(activity))).filter(Boolean)).size;
  const activeWeekKeys = new Set(runs.map((activity) => weekKey(activityTimestamp(activity))).filter(Boolean));
  const referenceWeek = localDate(weekKey(reference));
  let consecutiveWeeks = 0;
  if (referenceWeek) {
    for (let index = 0; index < 16; index += 1) {
      const cursor = new Date(referenceWeek);
      cursor.setDate(cursor.getDate() - index * 7);
      if (!activeWeekKeys.has(dateKey(cursor))) break;
      consecutiveWeeks += 1;
    }
  }
  const monthTotals = new Map();
  allRuns.forEach((activity) => {
    const key = dateKey(activityTimestamp(activity)).slice(0, 7);
    if (!key) return;
    monthTotals.set(key, (monthTotals.get(key) || 0) + numeric(activity.distance));
  });
  const currentMonthKey = dateKey(reference).slice(0, 7);
  const currentMonthKm = monthTotals.get(currentMonthKey) || 0;
  const previousMonthlyBestKm = Math.max(
    0,
    ...[...monthTotals.entries()]
      .filter(([key]) => key !== currentMonthKey)
      .map(([, distance]) => distance),
  );
  const recentFourWeeksAgo = new Date(reference.getTime() - 28 * DAY_MS);
  const previousFourWeeksAgo = new Date(reference.getTime() - 56 * DAY_MS);
  const recentFourWeekKm = allRuns
    .filter((activity) => activityTimestamp(activity) >= recentFourWeeksAgo)
    .reduce((sum, activity) => sum + numeric(activity.distance), 0);
  const previousFourWeekKm = allRuns
    .filter((activity) => {
      const timestamp = activityTimestamp(activity);
      return timestamp >= previousFourWeeksAgo && timestamp < recentFourWeeksAgo;
    })
    .reduce((sum, activity) => sum + numeric(activity.distance), 0);
  return {
    runs,
    allRuns,
    weeklyKm: Number(weeklyKm.toFixed(1)),
    runDays: Number(runDays.toFixed(1)),
    longest: Number(longest.toFixed(1)),
    medianPaceSeconds: Math.round(medianPaceSeconds),
    activeWeeks12,
    consecutiveWeeks,
    currentMonthKm: Number(currentMonthKm.toFixed(1)),
    previousMonthlyBestKm: Number(previousMonthlyBestKm.toFixed(1)),
    monthlyBest: previousMonthlyBestKm > 0 && currentMonthKm > previousMonthlyBestKm,
    recentFourWeekKm: Number(recentFourWeekKm.toFixed(1)),
    previousFourWeekKm: Number(previousFourWeekKm.toFixed(1)),
    review: runningReviewSignals(sixWeekRuns, reviews),
    historyStartDate: allRuns.length
      ? dateKey(activityTimestamp(allRuns[allRuns.length - 1]))
      : "",
    source: sixWeekRuns.length ? "activities" : "profile",
  };
}

function observedPerformance(baseline, targetKm) {
  if (!targetKm || targetKm > 50) return null;
  const minimumDistance = Math.min(10, Math.max(2, targetKm * 0.24));
  const candidates = baseline.runs.map((activity) => {
    const distance = numeric(activity.distance);
    const durationSeconds = activityDurationSeconds(activity);
    const pace = distance > 0 ? durationSeconds / distance : 0;
    if (distance < minimumDistance || durationSeconds <= 0 || pace < 150 || pace > 1200) return null;
    const projectedSeconds = durationSeconds * Math.pow(targetKm / distance, 1.06);
    const text = `${activity.name || ""} ${activity.type || ""}`.toLowerCase();
    const verifiedEffort = Boolean(
      activity.race
      || activity.officialEvent
      || /race|wettkampf|benchmark|time trial|bestzeit|personal best|\bpb\b/.test(text)
      || numeric(activity.perceivedExertion) >= 7,
    );
    return {
      activityId: activity.id,
      activityName: activity.name || activity.type || "Lauf",
      date: String(activity.startDateLocal || activity.date || "").slice(0, 10),
      distance,
      durationSeconds,
      projectedSeconds: Math.round(projectedSeconds),
      coverage: Math.min(1, distance / targetKm),
      verifiedEffort,
    };
  }).filter(Boolean).sort((left, right) => left.projectedSeconds - right.projectedSeconds);
  const best = candidates[0];
  if (!best) return null;
  return {
    ...best,
    confidence: best.verifiedEffort && best.coverage >= 0.75
      ? "high"
      : best.coverage >= 0.4
        ? "medium"
        : "low",
  };
}

function phaseForGoal(rule, daysLeft, priority) {
  if (!Number.isFinite(daysLeft) || daysLeft > 3000) {
    return {
      key: "base",
      label: "Grundlage",
      factor: 1,
      longShare: rule.longShares.base,
      taperDays: rule.taperDays,
    };
  }
  const priorityTaperFactor = priority === "C" ? 0.45 : priority === "B" ? 0.72 : 1;
  const taperDays = Math.max(priority === "C" ? 5 : 7, Math.round(rule.taperDays * priorityTaperFactor));
  if (daysLeft <= taperDays) {
    return {
      key: "taper",
      label: `Taper für Priorität ${priority}`,
      factor: priority === "A" ? 0.6 : priority === "B" ? 0.68 : 0.78,
      longShare: rule.longShares.taper,
      taperDays,
    };
  }
  if (daysLeft <= taperDays + 14) {
    return {
      key: "peak",
      label: "Peak & Absicherung",
      factor: 0.95,
      longShare: rule.longShares.peak,
      taperDays,
    };
  }
  if (daysLeft <= rule.specificDays) {
    return {
      key: "specific",
      label: "Zielspezifisch",
      factor: 1.03,
      longShare: rule.longShares.specific,
      taperDays,
    };
  }
  if (daysLeft <= rule.buildDays) {
    return {
      key: "build",
      label: "Aufbau",
      factor: 1.02,
      longShare: rule.longShares.build,
      taperDays,
    };
  }
  return {
    key: "base",
    label: "Grundlage",
    factor: 1,
    longShare: rule.longShares.base,
    taperDays,
  };
}

function readinessFloorForGoal(discipline, mode) {
  return {
    "5k": { weeklyKm: mode === "time" ? 12 : 0, longest: mode === "time" ? 4 : 0 },
    "10k": { weeklyKm: mode === "time" ? 18 : 8, longest: mode === "time" ? 8 : 5 },
    half_marathon: { weeklyKm: mode === "time" ? 28 : 16, longest: mode === "time" ? 12 : 8 },
    marathon: { weeklyKm: mode === "time" ? 42 : 28, longest: mode === "time" ? 20 : 14 },
    ultra: { weeklyKm: mode === "time" ? 55 : 35, longest: mode === "time" ? 28 : 18 },
    backyard: { weeklyKm: mode === "time" ? 55 : 38, longest: mode === "time" ? 28 : 18 },
  }[discipline] || { weeklyKm: 0, longest: 0 };
}

function historicalRunningExperience(baseline, profile = {}) {
  const runs = Array.isArray(baseline?.allRuns) ? baseline.allRuns : [];
  const profileLongest = numeric(profile.selfReportedLongestRunKm);
  const longestActivity = [...runs].sort(
    (left, right) => numeric(right.distance) - numeric(left.distance),
  )[0] || null;
  const activityLongest = numeric(longestActivity?.distance);
  const longestDistanceKm = Math.max(activityLongest, profileLongest);
  const longestDurationActivity = [...runs].sort(
    (left, right) => activityDurationSeconds(right) - activityDurationSeconds(left),
  )[0] || null;
  const longestDurationSeconds = activityDurationSeconds(longestDurationActivity);
  const ultraRuns = runs.filter((activity) => numeric(activity.distance) >= 45);
  const marathonRuns = runs.filter((activity) => {
    const distance = numeric(activity.distance);
    return distance >= 40 && distance < 45;
  });
  const halfMarathonRuns = runs.filter((activity) => {
    const distance = numeric(activity.distance);
    return distance >= 20 && distance < 40;
  });
  const ultraDistanceCount = Math.max(ultraRuns.length, profileLongest >= 45 ? 1 : 0);
  const marathonDistanceCount = Math.max(marathonRuns.length, profileLongest >= 40 && profileLongest < 45 ? 1 : 0);
  const loopSessions = runs.filter((activity) => (
    /backyard|last\s*(person|man)\s*standing|loop|runden(block|training)?|heartbeat/i
      .test(`${activity.name || ""} ${activity.description || ""}`)
  ));
  const longDurationSessions = runs.filter((activity) => activityDurationSeconds(activity) >= 3 * 3600);
  const dayTotals = new Map();
  runs.forEach((activity) => {
    const key = dateKey(activityTimestamp(activity));
    if (!key) return;
    const current = dayTotals.get(key) || { date: key, distance: 0, durationSeconds: 0 };
    current.distance += numeric(activity.distance);
    current.durationSeconds += activityDurationSeconds(activity);
    dayTotals.set(key, current);
  });
  const days = [...dayTotals.values()].sort((left, right) => left.date.localeCompare(right.date));
  const backToBackBlocks = [];
  for (let index = 1; index < days.length; index += 1) {
    const previous = localDate(days[index - 1].date);
    const current = localDate(days[index].date);
    if (!previous || !current || Math.round((current - previous) / DAY_MS) !== 1) continue;
    const combinedDistance = days[index - 1].distance + days[index].distance;
    if (
      days[index - 1].distance >= 8
      && days[index].distance >= 8
      && combinedDistance >= 25
    ) {
      backToBackBlocks.push({
        startDate: days[index - 1].date,
        endDate: days[index].date,
        distance: Number(combinedDistance.toFixed(1)),
      });
    }
  }
  const bestBackToBack = [...backToBackBlocks].sort(
    (left, right) => right.distance - left.distance,
  )[0] || null;

  let level = "developing";
  let label = "Ausdauererfahrung im Aufbau";
  if (ultraDistanceCount >= 2) {
    level = "multiple_ultra";
    label = "Mehrfache Ultra-Erfahrung";
  } else if (ultraDistanceCount === 1) {
    level = "ultra";
    label = "Ultra-Erfahrung vorhanden";
  } else if (marathonDistanceCount >= 1) {
    level = "marathon";
    label = "Marathon-Erfahrung vorhanden";
  } else if (halfMarathonRuns.length >= 1 || longestDistanceKm >= 20) {
    level = "long_distance";
    label = "Langdistanz-Erfahrung vorhanden";
  } else if (longestDistanceKm >= 10) {
    level = "regular";
    label = "Solide Lauferfahrung";
  }

  let summary = longestDistanceKm > 0
    ? `Längste verfügbare Distanz ${distanceLabel(longestDistanceKm)}.`
    : "Noch keine belastbare Langzeithistorie verfügbar.";
  if (ultraDistanceCount >= 2) {
    summary = `${ultraDistanceCount} Ultradistanzen erkannt; längste verfügbare Distanz ${distanceLabel(longestDistanceKm)}.`;
  } else if (ultraDistanceCount === 1) {
    summary = `Eine Ultradistanz erkannt; längste verfügbare Distanz ${distanceLabel(longestDistanceKm)}.`;
  } else if (marathonDistanceCount >= 1) {
    summary = `${marathonDistanceCount} Marathondistanz${marathonDistanceCount === 1 ? "" : "en"} erkannt; Bestwert ${distanceLabel(longestDistanceKm)}.`;
  }
  const experienceDetails = [];
  if (loopSessions.length) experienceDetails.push(`${loopSessions.length} Loop-/Backyard-Einheit${loopSessions.length === 1 ? "" : "en"}`);
  if (backToBackBlocks.length) experienceDetails.push(`${backToBackBlocks.length} Back-to-Back-Block${backToBackBlocks.length === 1 ? "" : "s"}`);
  if (experienceDetails.length) summary += ` Dazu ${experienceDetails.join(" und ")}.`;

  return {
    level,
    label,
    summary,
    source: runs.length ? "activities" : profileLongest > 0 ? "profile" : "none",
    historyStartDate: baseline?.historyStartDate || "",
    runCount: runs.length,
    totalKm: Number(runs.reduce((sum, activity) => sum + numeric(activity.distance), 0).toFixed(1)),
    longestDistanceKm: Number(longestDistanceKm.toFixed(1)),
    longestDistanceDate: longestActivity ? dateKey(activityTimestamp(longestActivity)) : "",
    longestDistanceName: longestActivity?.name || "",
    longestDurationSeconds,
    longestDurationDate: longestDurationActivity ? dateKey(activityTimestamp(longestDurationActivity)) : "",
    ultraDistanceCount,
    marathonDistanceCount,
    halfMarathonDistanceCount: halfMarathonRuns.length,
    longDurationSessionCount: longDurationSessions.length,
    loopSessionCount: loopSessions.length,
    backToBackCount: backToBackBlocks.length,
    bestBackToBackKm: bestBackToBack?.distance || 0,
  };
}

function experienceTransferForGoal(experience, discipline, targetKm) {
  const referenceDistance = {
    "5k": 5,
    "10k": 10,
    half_marathon: 21.0975,
    marathon: 42.195,
    ultra: Math.max(50, Math.min(80, numeric(targetKm) || 50)),
    backyard: Math.max(50, Math.min(80, numeric(targetKm) || 50)),
  }[discipline] || 10;
  const distanceCoverage = bounded(
    referenceDistance > 0 ? experience.longestDistanceKm / referenceDistance : 0,
    0,
    1,
  );
  let specificity = distanceCoverage;
  if (discipline === "backyard") {
    specificity = Math.max(
      distanceCoverage,
      Math.min(1, experience.ultraDistanceCount * 0.35)
        + Math.min(0.2, experience.loopSessionCount * 0.08)
        + Math.min(0.15, experience.backToBackCount * 0.05),
    );
  } else if (discipline === "ultra") {
    specificity = Math.max(
      distanceCoverage,
      Math.min(1, experience.ultraDistanceCount * 0.45)
        + Math.min(0.15, experience.backToBackCount * 0.04),
    );
  } else if (discipline === "marathon") {
    specificity = Math.max(distanceCoverage, Math.min(1, experience.marathonDistanceCount * 0.55));
  } else if (discipline === "half_marathon") {
    specificity = Math.max(distanceCoverage, Math.min(1, experience.halfMarathonDistanceCount * 0.45));
  }
  const score = bounded(specificity, 0, 1);
  const label = score >= 0.82
    ? "Hoher Erfahrungstransfer"
    : score >= 0.58
      ? "Gute übertragbare Erfahrung"
      : score >= 0.32
        ? "Teilweise übertragbare Erfahrung"
        : "Zielspezifische Erfahrung im Aufbau";
  return {
    score: Number(score.toFixed(2)),
    label,
    distanceCoverage: Number(distanceCoverage.toFixed(2)),
  };
}

function currentFormForGoal(baseline, discipline, mode) {
  const floor = readinessFloorForGoal(discipline, mode);
  const volumeRatio = floor.weeklyKm > 0
    ? baseline.weeklyKm / floor.weeklyKm
    : baseline.weeklyKm > 0
      ? 1
      : 0;
  const longRatio = floor.longest > 0
    ? baseline.longest / floor.longest
    : baseline.longest > 0
      ? 1
      : 0;
  const consistencyRatio = baseline.source === "activities"
    ? baseline.activeWeeks12 / 8
    : baseline.runDays / 3;
  let score = (
    bounded(volumeRatio, 0, 1) * 0.45
    + bounded(longRatio, 0, 1) * 0.35
    + bounded(consistencyRatio, 0, 1) * 0.2
  );
  if (baseline.review?.count >= 3 && baseline.review.strainedShare >= 0.5) score *= 0.86;
  score = bounded(score, 0, 1);

  let status = "limited";
  let label = "Aktuelle Form noch nicht abgesichert";
  if (score >= 0.82) {
    status = "stable";
    label = "Aktuell stabile Grundlage";
  } else if (score >= 0.62) {
    status = "established";
    label = "Aktuelle Grundlage vorhanden";
  } else if (score >= 0.36) {
    status = "building";
    label = "Aktuelle Form im Aufbau";
  }
  let summary = `${compactNumber(baseline.weeklyKm)} km/Woche, ${compactNumber(baseline.runDays)} Lauftage/Woche und jüngster Longrun-Bestwert ${distanceLabel(baseline.longest)}.`;
  if (baseline.monthlyBest) {
    summary += ` ${distanceLabel(baseline.currentMonthKm)} im aktuellen Monat sind ein neuer Monatsbestwert in der verfügbaren Historie.`;
  }
  if (baseline.review?.count >= 3) {
    summary += baseline.review.strainedShare >= 0.5
      ? " Mehrere aktuelle Reviews begrenzen die Formbewertung."
      : " Die aktuellen Reviews stützen die Belastungsverträglichkeit.";
  }
  return {
    status,
    label,
    summary,
    score: Number(score.toFixed(2)),
    floor,
    volumeRatio: Number(volumeRatio.toFixed(2)),
    longRatio: Number(longRatio.toFixed(2)),
    activeWeeks12: baseline.activeWeeks12,
    consecutiveWeeks: baseline.consecutiveWeeks,
    monthlyBest: baseline.monthlyBest,
  };
}

function disciplineOverlap(left, right) {
  if (left === right) return 1;
  const ultraFamily = new Set(["marathon", "ultra", "backyard"]);
  if (["ultra", "backyard"].includes(left) && ["ultra", "backyard"].includes(right)) return 0.95;
  if (ultraFamily.has(left) && ultraFamily.has(right)) return 0.75;
  const roadOrder = ["5k", "10k", "half_marathon", "marathon"];
  const leftIndex = roadOrder.indexOf(left);
  const rightIndex = roadOrder.indexOf(right);
  if (leftIndex >= 0 && rightIndex >= 0) {
    const difference = Math.abs(leftIndex - rightIndex);
    return difference === 1 ? 0.72 : difference === 2 ? 0.45 : 0.2;
  }
  return 0;
}

function strategicAlignmentForGoal(mission, target, referenceDate) {
  if (!target || eventPriority(target) === "A") return null;
  const reference = localDate(referenceDate) || new Date();
  const mainTarget = missionEvents(mission).find((event) => {
    if (!event.isMainTarget || String(event.id || "") === String(target.id || "")) return false;
    const date = localDate(event.date);
    return date && date >= reference;
  });
  if (!mainTarget) return null;
  const targetDiscipline = inferGoalDiscipline(target);
  const mainDiscipline = inferGoalDiscipline(mainTarget);
  const overlap = disciplineOverlap(targetDiscipline, mainDiscipline);
  if (overlap < 0.65) return null;
  return {
    targetId: mainTarget.id || null,
    targetName: mainTarget.name || "das Hauptziel",
    targetDiscipline: mainDiscipline,
    overlap: Number(overlap.toFixed(2)),
    label: "Direkter Aufbau für das Hauptziel",
    summary: `${target.name || "Das Zwischenziel"} ist ein übertragbarer Priorität-${eventPriority(target)}-Baustein für ${mainTarget.name || "das spätere Hauptziel"}.`,
  };
}

function activePreparationWeeks(runs, startDate, referenceDate) {
  const start = localDate(startDate);
  const reference = localDate(referenceDate);
  if (!start || !reference) return 0;
  return new Set(runs
    .filter((activity) => {
      const timestamp = activityTimestamp(activity);
      return timestamp >= start && timestamp <= reference;
    })
    .map((activity) => weekKey(activityTimestamp(activity)))
    .filter(Boolean)).size;
}

function specificWeekFloor(discipline, mode) {
  const floors = {
    "5k": { finish: 3, time: 6 },
    "10k": { finish: 4, time: 7 },
    half_marathon: { finish: 4, time: 8 },
    marathon: { finish: 8, time: 10 },
    ultra: { finish: 7, time: 10 },
    backyard: { finish: 6, time: 10 },
  };
  return floors[discipline]?.[mode] || 0;
}

function preparationForGoal({
  mission,
  target,
  rule,
  discipline,
  mode,
  weeksLeft,
  baseline,
  currentForm,
  experienceTransfer,
  alignment,
  referenceDate,
  openDistanceGoal,
}) {
  const declaredStartDate = target?.preparationStartDate || mission?.preparationStartDate || "";
  const start = localDate(declaredStartDate);
  const reference = localDate(referenceDate) || new Date();
  const elapsedWeeks = start && start <= reference
    ? Math.max(0, (reference - start) / (7 * DAY_MS))
    : 0;
  const activeWeeks = activePreparationWeeks(baseline.allRuns, declaredStartDate, reference);
  const minimumWeeks = rule.minWeeks[mode] || rule.minWeeks.finish || 0;
  const inheritedCredit = (
    currentForm.score * 0.55
    + experienceTransfer.score * 0.15
    + (alignment?.overlap || 0) * 0.05
  );
  const remainingFraction = Math.max(0.3, 1 - inheritedCredit);
  let specificWeeksNeeded = Math.max(
    specificWeekFloor(discipline, mode),
    Math.ceil(minimumWeeks * remainingFraction),
  );
  if (openDistanceGoal) {
    specificWeeksNeeded = Math.max(
      specificWeekFloor(discipline, mode),
      Math.min(specificWeeksNeeded, 8),
    );
  }
  const inheritedFoundation = currentForm.score >= 0.62
    || (
      currentForm.score >= 0.36
      && (experienceTransfer.score >= 0.58 || activeWeeks >= 5)
    );
  const remaining = Math.max(0, weeksLeft);
  const origin = declaredStartDate && elapsedWeeks > 0
    ? activeWeeks > 0
      ? `Seit ${shortGermanDate(declaredStartDate)} sind ${activeWeeks} aktive Vorbereitungswochen erfasst.`
      : `Der Vorbereitungsbeginn ${shortGermanDate(declaredStartDate)} ist hinterlegt; aktive Wochen werden erst mit Trainingsdaten bestätigt.`
    : inheritedFoundation
      ? "Die vorhandene Trainingshistorie wird als Grundlage angerechnet."
      : "Die zielspezifische Grundlage wird aktuell aufgebaut.";
  const role = inheritedFoundation
    ? `Die verbleibenden ${weeksLabel(remaining)} sind Spezialisierungszeit, nicht deine gesamte Vorbereitung.`
    : `Es bleiben ${weeksLabel(remaining)} für den weiteren Aufbau.`;
  return {
    declaredStartDate,
    elapsedWeeks: Number(elapsedWeeks.toFixed(1)),
    activeWeeks,
    remainingWeeks: Number(remaining.toFixed(1)),
    remainingWeeksLabel: weeksLabel(remaining),
    minimumWeeks,
    specificWeeksNeeded,
    inheritedFoundation,
    summary: `${origin} ${role}${alignment ? ` ${alignment.summary}` : ""}`,
  };
}

function targetGapForGoal({
  discipline,
  mode,
  targetKm,
  targetPaceSeconds,
  observed,
  baseline,
  experience,
  currentForm,
  openDistanceGoal,
}) {
  const distanceGapKm = targetKm > 0
    ? Math.max(0, targetKm - experience.longestDistanceKm)
    : 0;
  const volumeGapKm = Math.max(0, currentForm.floor.weeklyKm - baseline.weeklyKm);
  const longRunGapKm = Math.max(0, currentForm.floor.longest - baseline.longest);
  const projectedPaceSeconds = observed && targetKm > 0
    ? observed.projectedSeconds / targetKm
    : 0;
  const paceGapSeconds = targetPaceSeconds > 0 && projectedPaceSeconds > 0
    ? Math.max(0, projectedPaceSeconds - targetPaceSeconds)
    : 0;
  const areas = [];
  if (volumeGapKm > 0.5) areas.push("Wochenumfang");
  if (longRunGapKm > 0.5) areas.push("aktuelle Longrun-Basis");
  if (mode === "time" && !observed) areas.push("belastbarer Benchmark");
  else if (paceGapSeconds > 5) areas.push("nachhaltige Zielpace");
  if (discipline === "backyard") {
    if (!experience.loopSessionCount) areas.push("Runden- und Pausenroutine");
    if (!experience.backToBackCount) areas.push("Laufen mit Vorermüdung");
    areas.push("Fueling im Stundenrhythmus");
  } else if (discipline === "ultra") {
    if (!experience.backToBackCount) areas.push("Belastung auf Vorermüdung");
    areas.push("Fueling und Zeit auf den Beinen");
  }

  let label = areas.length ? "Konkrete Restaufgaben erkannt" : "Keine große Grundlücke erkannt";
  let summary;
  if (openDistanceGoal) {
    label = "Offenes Distanzziel";
    summary = "Ohne konkrete Rundenzahl oder Distanz erfindet der Coach kein 100-km-Ziel. Er entwickelt die erreichbare Backyard-Distanz aus Form, Loopblöcken und Reviews.";
  } else if (mode === "time") {
    if (!observed) {
      summary = `Die Distanzbasis reicht bis ${distanceLabel(experience.longestDistanceKm)}; für die Zielpace fehlt noch ein belastbarer Vergleichslauf.`;
    } else {
      summary = paceGapSeconds > 0
        ? `Die aktuelle Hochrechnung liegt etwa ${compactNumber(paceGapSeconds, 0)} Sek./km über der Zielpace. Der Coach entwickelt die Pace schrittweise und prüft sie erneut.`
        : "Die aktuelle Hochrechnung deckt die Zielpace ab; jetzt muss sie über die zielspezifische Distanz stabilisiert werden.";
    }
  } else if (discipline === "backyard") {
    summary = experience.ultraDistanceCount
      ? `Ultra-Basis bis ${distanceLabel(experience.longestDistanceKm)} ist vorhanden. Offen bleiben vor allem Rundenrhythmus, kurze Pausen, Fueling und Ermüdungsresistenz.`
      : `Die aktuelle Longrun-Basis liegt bei ${distanceLabel(baseline.longest)}. Backyard-Rhythmus, Pausen und Zeit auf den Beinen werden schrittweise aufgebaut.`;
  } else if (targetKm > 0 && experience.longestDistanceKm > 0) {
    summary = distanceGapKm > 0
      ? `Längste verfügbare Distanz ${distanceLabel(experience.longestDistanceKm)}; zur Wettkampfdistanz bleiben rechnerisch ${distanceLabel(distanceGapKm)}. Der Coach schließt diese Lücke progressiv, nicht durch einen erzwungenen Testlauf über die volle Distanz.`
      : `Die Zieldistanz wurde in der verfügbaren Historie bereits erreicht. Der Plan arbeitet deshalb an aktueller Form und Zielspezifik statt wieder bei null zu beginnen.`;
  } else {
    summary = "Der Coach baut nur die noch fehlenden Fähigkeiten auf und bewertet die Entwicklung mit neuen Trainingsdaten.";
  }
  return {
    label,
    summary,
    areas: [...new Set(areas)],
    distanceGapKm: Number(distanceGapKm.toFixed(1)),
    volumeGapKm: Number(volumeGapKm.toFixed(1)),
    longRunGapKm: Number(longRunGapKm.toFixed(1)),
    paceGapSeconds: Math.round(paceGapSeconds),
    projectedPaceSeconds: Math.round(projectedPaceSeconds),
  };
}

function feasibilityForGoal({
  discipline,
  rule,
  mode,
  weeksLeft,
  observed,
  targetSeconds,
  targetKm,
  targetRunCount,
  currentForm,
  experience,
  preparation,
  targetGap,
  openDistanceGoal,
}) {
  if (discipline === "general") {
    return {
      status: "open",
      label: "Entwicklungsziel",
      summary: "Ohne festes Event steuert der Coach über Belastbarkeit, Regelmäßigkeit und Reviews.",
      reasons: [],
      checkpointNeeded: false,
    };
  }

  const reasons = [];
  let highSeverity = 0;
  let mediumSeverity = 0;
  const addReason = (text, severity = "medium") => {
    reasons.push(text);
    if (severity === "high") highSeverity += 1;
    else mediumSeverity += 1;
  };
  const minimumWeeks = rule.minWeeks[mode] || rule.minWeeks.finish;
  const requiredRuns = rule.requiredRuns[mode] || rule.requiredRuns.finish;
  const specificWeeksNeeded = preparation?.specificWeeksNeeded || minimumWeeks;
  const specificTimeRatio = specificWeeksNeeded > 0 ? weeksLeft / specificWeeksNeeded : 1;
  if (weeksLeft < specificWeeksNeeded) {
    addReason(
      `noch ${weeksLabel(weeksLeft)} für ungefähr ${specificWeeksNeeded} Wochen zielspezifischen Aufbau`,
      specificTimeRatio < 0.65 && currentForm.status !== "stable" ? "high" : "medium",
    );
  }
  if (targetRunCount > 0 && targetRunCount < requiredRuns) {
    addReason(`${targetRunCount} freigegebene Läufe statt der empfohlenen ${requiredRuns} pro Woche`);
  }
  if (currentForm.volumeRatio < 0.55) {
    addReason(
      "die aktuelle Wochenbasis liegt deutlich unter dem zielspezifisch benötigten Rahmen",
      currentForm.longRatio < 0.55 ? "high" : "medium",
    );
  }
  if (currentForm.longRatio < 0.55) {
    addReason(
      "der aktuelle Longrun liegt noch deutlich unter der benötigten Ausdauerbasis",
      currentForm.volumeRatio < 0.55 ? "high" : "medium",
    );
  }

  let status = "realistic";
  let checkpointNeeded = false;
  if (mode === "time") {
    if (!targetSeconds || !targetKm) {
      return {
        status: "incomplete",
        label: "Zielzeit fehlt",
        summary: "Für ein Zeit- oder Bestzeitziel braucht der Coach eine gültige Zielzeit.",
        reasons: ["keine auswertbare Zielzeit hinterlegt"],
        checkpointNeeded: true,
      };
    }
    if (!observed) {
      status = highSeverity >= 2 ? "stretch" : "needs_benchmark";
      checkpointNeeded = true;
      addReason("noch kein ausreichend langer Vergleichslauf für eine belastbare Zielzeit-Prognose");
    } else {
      const ratio = observed.projectedSeconds / targetSeconds;
      if (ratio > 1.18) status = "stretch";
      else if (ratio > 1.07) status = "ambitious";
      if (ratio > 1.07 || observed.confidence !== "high") checkpointNeeded = true;
      if (ratio > 1.03) {
        addReason(
          `die beste aktuelle Hochrechnung liegt bei etwa ${formatGoalDuration(observed.projectedSeconds)}`,
          ratio > 1.18 ? "high" : "medium",
        );
      } else if (observed.confidence !== "high") {
        addReason("die Zielpace ist noch nicht durch einen klar erkannten Wettkampf oder Benchmark abgesichert");
      }
    }
  }

  if (
    !openDistanceGoal
    && ["ultra", "backyard"].includes(discipline)
    && targetKm >= 80
    && experience.longestDistanceKm < targetKm * 0.8
  ) {
    addReason(
      `die längste verfügbare Distanz ${distanceLabel(experience.longestDistanceKm)} liegt noch unter dem Ziel von ${distanceLabel(targetKm)}`,
      experience.ultraDistanceCount || currentForm.status === "stable" ? "medium" : "high",
    );
  }

  if (openDistanceGoal) {
    status = "progressive";
    checkpointNeeded = true;
  } else if (status !== "stretch" && (highSeverity >= 2 || (highSeverity >= 1 && specificTimeRatio < 0.65))) {
    status = "stretch";
  } else if (status === "realistic" && (highSeverity >= 1 || mediumSeverity >= 1)) {
    status = "ambitious";
  }

  const labels = {
    realistic: "Grundlage vorhanden · gezielt weiterbauen",
    ambitious: "Ambitioniert – Grundlage wird angerechnet",
    stretch: "Derzeit sehr ambitioniert",
    needs_benchmark: "Benchmark erforderlich",
    progressive: "Distanz datenbasiert entwickeln",
  };
  const summaries = {
    realistic: `${experience.label}. Aktuelle Form und verbleibende Spezialisierungszeit unterstützen das Ziel; der Coach baut auf dem vorhandenen Stand weiter.`,
    ambitious: `Die vorhandene Grundlage wird vollständig angerechnet. ${targetGap.summary}`,
    stretch: "Die aktuelle Lücke ist groß. Der Coach plant die bestmögliche Annäherung, verspricht das Ergebnis aber nicht blind.",
    needs_benchmark: `Die Distanz- und Trainingsbasis wird angerechnet. Für die Zielzeit benötigt der Coach zusätzlich einen passenden Vergleichslauf.`,
    progressive: targetGap.summary,
  };
  return {
    status,
    label: labels[status],
    summary: summaries[status],
    reasons,
    checkpointNeeded,
    minimumWeeks,
    specificWeeksNeeded,
    requiredRuns,
  };
}

function goalSpecificAbilities(discipline, rule, target = {}, mode = "finish", baseline = {}) {
  const finishAbilities = {
    "5k": baseline.runDays < 1.5 || baseline.longest < 3.5
      ? ["Run-Walk-Verträglichkeit", "zusammenhängend locker laufen", "Regelmäßigkeit", "Erholung"]
      : ["Laufverträglichkeit", "zusammenhängend locker laufen", "Laufökonomie", "Erholung"],
    "10k": ["aerobe Basis", "zusammenhängend locker laufen", "progressive Longruns", "Erholung"],
    half_marathon: ["aerobe Ausdauer", "progressive Longruns", "kontrolliert zügiges Laufen", "Fueling ab langen Einheiten"],
    marathon: ["muskuläre Ausdauer", "lange Läufe", "Fueling unter Belastung", "Renntempo einteilen"],
  };
  const abilities = mode === "finish" && finishAbilities[discipline]
    ? [...finishAbilities[discipline]]
    : [...rule.abilities];
  if (numeric(target.elevationGain) >= 300 || ["trail", "mixed"].includes(target.surface)) {
    abilities.push("Höhenmeter und Untergrund");
  }
  if (eventCourseProfile(target).aidStationMode !== "unspecified") abilities.push("Versorgungsroutine");
  return [...new Set(abilities)];
}

function workingPace(targetPaceSeconds, observed, targetKm, phaseKey) {
  if (!targetPaceSeconds) return 0;
  if (!observed || !targetKm) return 0;
  const currentPace = observed.projectedSeconds / targetKm;
  if (currentPace <= targetPaceSeconds) return targetPaceSeconds;
  const progress = { base: 0.15, build: 0.35, specific: 0.65, peak: 0.85, taper: 1 }[phaseKey] ?? 0.35;
  return Math.round(targetPaceSeconds + (currentPace - targetPaceSeconds) * (1 - progress));
}

export function buildGoalEngine({
  mission = {},
  activities = [],
  activityGroups = [],
  reviews = {},
  profile = {},
  planner = {},
  referenceDate = new Date(),
} = {}) {
  const baseline = recentRunningBaseline(
    activities,
    profile,
    referenceDate,
    activityGroups,
    reviews,
  );
  const experience = historicalRunningExperience(baseline, profile);
  const target = targetFromMission(mission, referenceDate);
  if (!target) {
    const rule = DISCIPLINE_RULES.general;
    const currentForm = currentFormForGoal(baseline, "general", "finish");
    return {
      target: null,
      discipline: "general",
      disciplineLabel: rule.label,
      goalType: "finish",
      mode: "finish",
      targetKm: 0,
      targetSeconds: 0,
      targetPaceSeconds: 0,
      targetPaceLabel: "",
      workingPaceSeconds: 0,
      workingPaceLabel: "",
      daysLeft: 9999,
      weeksLeft: 999,
      phase: phaseForGoal(rule, 9999, "A"),
      abilities: rule.abilities,
      requiredRuns: rule.requiredRuns.finish,
      feasibility: feasibilityForGoal({
        discipline: "general",
        rule,
        mode: "finish",
        weeksLeft: 999,
        baseline,
        observed: null,
        targetSeconds: 0,
        targetKm: 0,
        targetRunCount: numeric(planner.targetRunCount || profile.selfReportedRunsPerWeek),
      }),
      baseline,
      experience,
      experienceTransfer: experienceTransferForGoal(experience, "general", 0),
      currentForm,
      preparation: null,
      targetGap: null,
      strategicAlignment: null,
      observed: null,
      courseProfile: eventCourseProfile({}),
      rule,
      constraintWarnings: [],
    };
  }

  const discipline = inferGoalDiscipline(target);
  const rule = DISCIPLINE_RULES[discipline] || DISCIPLINE_RULES.general;
  const goalType = target.goalType || (target.targetTime ? "time" : "finish");
  const explicitDistance = numeric(target.targetKm);
  const openDistanceGoal = discipline === "backyard" && explicitDistance <= 0;
  const targetKm = openDistanceGoal ? 0 : explicitDistance || rule.canonicalKm;
  const mode = goalMode(goalType);
  const targetSeconds = mode === "time" ? parseGoalDurationSeconds(target.targetTime) : 0;
  const targetPaceSeconds = targetSeconds > 0 && targetKm > 0 ? targetSeconds / targetKm : 0;
  const reference = localDate(referenceDate) || new Date();
  const eventDate = localDate(target.date);
  const daysLeft = eventDate ? Math.ceil((eventDate - reference) / DAY_MS) : 9999;
  const weeksLeft = daysLeft / 7;
  const priority = eventPriority(target);
  const phase = phaseForGoal(rule, daysLeft, priority);
  const observed = targetKm > 0 ? observedPerformance(baseline, targetKm) : null;
  const targetRunCount = numeric(planner.targetRunCount || profile.selfReportedRunsPerWeek);
  const experienceTransfer = experienceTransferForGoal(experience, discipline, targetKm);
  const currentForm = currentFormForGoal(baseline, discipline, mode);
  const strategicAlignment = strategicAlignmentForGoal(mission, target, referenceDate);
  const preparation = preparationForGoal({
    mission,
    target,
    rule,
    discipline,
    mode,
    weeksLeft,
    baseline,
    currentForm,
    experienceTransfer,
    alignment: strategicAlignment,
    referenceDate,
    openDistanceGoal,
  });
  const targetGap = targetGapForGoal({
    discipline,
    mode,
    targetKm,
    targetPaceSeconds,
    observed,
    baseline,
    experience,
    currentForm,
    openDistanceGoal,
  });
  const feasibility = feasibilityForGoal({
    discipline,
    rule,
    mode,
    weeksLeft,
    baseline,
    observed,
    targetSeconds,
    targetKm,
    targetRunCount,
    currentForm,
    experience,
    preparation,
    targetGap,
    openDistanceGoal,
  });
  const requiredRuns = rule.requiredRuns[mode] || rule.requiredRuns.finish;
  const constraintWarnings = [];
  if (targetRunCount > 0 && targetRunCount < requiredRuns) {
    constraintWarnings.push(`Für ${rule.label} mit diesem Ziel empfiehlt der Coach ${requiredRuns} Lauftage; freigegeben sind aktuell ${targetRunCount}.`);
  }
  if (mode === "time" && !targetSeconds) {
    constraintWarnings.push("Die Zielart verlangt eine gültige Zielzeit im Format hh:mm:ss.");
  }
  const workingPaceSeconds = workingPace(targetPaceSeconds, observed, targetKm, phase.key);
  const courseProfile = eventCourseProfile(target);

  return {
    target: {
      ...target,
      ...courseProfile,
      targetKm,
      goalDiscipline: discipline,
      goalKind: discipline === "backyard"
        ? "backyard"
        : discipline === "ultra"
          ? "ultra"
          : courseProfile.courseType === "loop"
            ? "loop"
            : "race",
      priority,
    },
    discipline,
    disciplineLabel: rule.label,
    goalType,
    mode,
    targetKm,
    hasExplicitTargetDistance: explicitDistance > 0,
    openDistanceGoal,
    targetSeconds,
    targetPaceSeconds,
    targetPaceLabel: targetPaceSeconds ? `${formatPaceSeconds(targetPaceSeconds)} min/km` : "",
    workingPaceSeconds,
    workingPaceLabel: workingPaceSeconds ? `${formatPaceSeconds(workingPaceSeconds)} min/km` : "",
    daysLeft,
    weeksLeft,
    phase,
    abilities: goalSpecificAbilities(discipline, rule, target, mode, baseline),
    requiredRuns,
    feasibility,
    baseline,
    experience,
    experienceTransfer,
    currentForm,
    preparation,
    targetGap,
    strategicAlignment,
    observed,
    courseProfile,
    rule,
    constraintWarnings,
  };
}

export function goalLongRunBounds(engine, weeklyTarget = 0) {
  const rule = engine?.rule || DISCIPLINE_RULES.general;
  const starter = numeric(engine?.baseline?.weeklyKm) < 20;
  const beginnerFiveKMinimum = engine?.discipline === "5k"
    && engine?.mode === "finish"
    && ["specific", "peak"].includes(engine?.phase?.key)
    ? 5
    : 0;
  const minimum = beginnerFiveKMinimum || (starter
    ? Math.min(rule.longRun.minimum, Math.max(4, Math.round(numeric(weeklyTarget) * 0.42)))
    : rule.longRun.minimum);
  const distanceCap = engine?.discipline === "half_marathon"
    ? Math.min(rule.longRun.maximum, Math.max(16, engine.targetKm * 0.95))
    : engine?.discipline === "5k" && engine.mode === "finish"
      ? 8
      : rule.longRun.maximum;
  return {
    minimum: Math.max(4, Math.round(minimum)),
    maximum: Math.max(6, Math.round(distanceCap)),
    share: engine?.phase?.longShare || rule.longShares.base,
  };
}

function paceTarget(engine, offsetSeconds = 0) {
  const seconds = numeric(engine?.workingPaceSeconds);
  return seconds ? formatPaceSeconds(Math.max(150, seconds + offsetSeconds)) : "";
}

function workoutBlock({
  label,
  repeats = 1,
  workMinutes = 0,
  workMeters = 0,
  recoveryMinutes = 0,
  targetPace = "",
  toleranceSeconds = 10,
  effort = "Z3 HR",
}) {
  return {
    label,
    repeats,
    workMinutes,
    workMeters,
    recoveryMinutes,
    targetPace,
    toleranceSeconds,
    effort,
  };
}

function qualityDistance(engine, weeklyTarget) {
  const ranges = {
    "5k": [5, 8],
    "10k": [6, 10],
    half_marathon: [7, 13],
    marathon: [8, 15],
    ultra: [7, 13],
    backyard: [7, 13],
    general: [5, 9],
  };
  const [minimum, maximum] = ranges[engine.discipline] || ranges.general;
  return Math.max(minimum, Math.min(maximum, Math.round(numeric(weeklyTarget) * 0.22)));
}

export function isBeginnerFiveKGoal(engine) {
  return engine?.discipline === "5k"
    && engine?.mode === "finish"
    && (numeric(engine?.baseline?.runDays) < 1.5 || numeric(engine?.baseline?.longest) < 3.5);
}

function runWalkPrescription(phaseKey, cycle = 1, recoveryWeek = false) {
  const safeCycle = Math.max(1, Math.min(4, Math.round(numeric(cycle, 1))));
  const prescriptions = {
    base: [
      { workMinutes: 1, recoveryMinutes: 2, repeats: 10 },
      { workMinutes: 2, recoveryMinutes: 2, repeats: 8 },
      { workMinutes: 3, recoveryMinutes: 2, repeats: 7 },
      { workMinutes: 2, recoveryMinutes: 2, repeats: 7 },
    ],
    build: [
      { workMinutes: 5, recoveryMinutes: 2, repeats: 5 },
      { workMinutes: 8, recoveryMinutes: 2, repeats: 4 },
      { workMinutes: 12, recoveryMinutes: 2, repeats: 3 },
      { workMinutes: 8, recoveryMinutes: 2, repeats: 3 },
    ],
    specific: [
      { workMinutes: 15, recoveryMinutes: 2, repeats: 2 },
      { workMinutes: 20, recoveryMinutes: 2, repeats: 2 },
      { workMinutes: 30, recoveryMinutes: 0, repeats: 1 },
      { workMinutes: 20, recoveryMinutes: 0, repeats: 1 },
    ],
    peak: [
      { workMinutes: 35, recoveryMinutes: 0, repeats: 1 },
      { workMinutes: 40, recoveryMinutes: 0, repeats: 1 },
      { workMinutes: 45, recoveryMinutes: 0, repeats: 1 },
      { workMinutes: 30, recoveryMinutes: 0, repeats: 1 },
    ],
    taper: [
      { workMinutes: 20, recoveryMinutes: 0, repeats: 1 },
      { workMinutes: 20, recoveryMinutes: 0, repeats: 1 },
      { workMinutes: 15, recoveryMinutes: 0, repeats: 1 },
      { workMinutes: 15, recoveryMinutes: 0, repeats: 1 },
    ],
  };
  if (recoveryWeek) {
    return phaseKey === "base"
      ? { workMinutes: 2, recoveryMinutes: 2, repeats: 7 }
      : { workMinutes: 8, recoveryMinutes: 2, repeats: 3 };
  }
  return (prescriptions[phaseKey] || prescriptions.base)[safeCycle - 1];
}

function finishGoalSession(engine, context) {
  const beginner5k = isBeginnerFiveKGoal(engine);
  if (beginner5k) {
    const { workMinutes, recoveryMinutes, repeats } = runWalkPrescription(
      engine.phase.key,
      context.cycle,
      context.recoveryWeek,
    );
    const duration = 10 + repeats * (workMinutes + recoveryMinutes) + 5;
    const continuous = repeats === 1 && recoveryMinutes === 0;
    return {
      type: "Easy Run",
      title: continuous
        ? `${workMinutes} min durchgehend locker`
        : `Run-Walk · ${repeats} × ${workMinutes}/${recoveryMinutes} min`,
      distance: Math.max(3, Math.min(5, Math.round(duration / 8))),
      duration,
      keySession: true,
      goalSessionRole: "run_walk_progression",
      notes: continuous
        ? "Ziel: ruhig und zusammenhängend laufen. Tempo ist unwichtig; bei Bedarf kurze geplante Gehpause einlegen."
        : "Ziel: die Laufabschnitte ruhig verlängern. Die Gehpausen sind Teil des Plans, kein Scheitern.",
      goalWorkout: {
        warmupMinutes: 5,
        cooldownMinutes: 5,
        blocks: [workoutBlock({
          label: "Run-Walk",
          repeats,
          workMinutes,
          recoveryMinutes,
          effort: "Z2 HR",
        })],
      },
    };
  }

  if (!["specific", "peak"].includes(engine.phase.key) || context.cycle === 1) return null;
  if (!["10k", "half_marathon", "marathon"].includes(engine.discipline)) return null;
  const distance = qualityDistance(engine, context.weeklyTarget);
  const repeats = engine.discipline === "marathon" ? 3 : 3;
  const workMinutes = engine.discipline === "marathon" ? 10 : engine.discipline === "half_marathon" ? 8 : 6;
  return {
    type: "Schwellenlauf",
    title: `${distance} km mit kontrolliert zügigen Blöcken`,
    distance,
    duration: 25 + repeats * workMinutes + (repeats - 1) * 3,
    keySession: true,
    goalSessionRole: "controlled_steady",
    notes: "Kein All-out-Training: zügig, kontrolliert und mit sauberer Technik. Der Finish-Aufbau bleibt ausdauerorientiert.",
    goalWorkout: {
      warmupMinutes: 15,
      cooldownMinutes: 10,
      blocks: [workoutBlock({
        label: "Kontrolliert zügig",
        repeats,
        workMinutes,
        recoveryMinutes: 3,
        effort: "Z3 HR",
      })],
    },
  };
}

function timedGoalSession(engine, context) {
  const distance = qualityDistance(engine, context.weeklyTarget);
  const needsBenchmark = engine.feasibility.checkpointNeeded && context.cycle === 1 && !["taper", "event"].includes(engine.phase.key);
  if (needsBenchmark) {
    return {
      type: "Schwellenlauf",
      title: `${distance} km mit 20-Minuten-Benchmark`,
      distance,
      duration: 50,
      keySession: true,
      goalSessionRole: "benchmark",
      notes: "Nach ruhigem Einlaufen 20 Minuten gleichmäßig hart, aber kontrolliert laufen. Das Ergebnis dient der ehrlichen Zielprognose; nicht sprinten.",
      goalWorkout: {
        warmupMinutes: 15,
        cooldownMinutes: 10,
        blocks: [workoutBlock({
          label: "20-Minuten-Benchmark",
          repeats: 1,
          workMinutes: 20,
          effort: "Z4 HR",
        })],
      },
    };
  }

  const cycle = context.cycle || 1;
  if (engine.discipline === "5k") {
    if (cycle === 2 || engine.phase.key === "specific") {
      return {
        type: "Intervalle",
        title: `6 × 400 m · Arbeitsziel ${paceTarget(engine) || "5-km-Effort"}`,
        distance,
        duration: 50,
        keySession: true,
        goalSessionRole: "vo2",
        notes: `Kontrollierte 400er. ${engine.workingPaceLabel ? `Aktuelles Arbeitsziel ${engine.workingPaceLabel}; Wettkampfziel bleibt ${engine.targetPaceLabel}.` : "Nach aktuellem 5-km-Effort laufen."}`,
        structuredWorkout: {
          kind: "intervals",
          rounds: 6,
          steps: [
            { kind: "work", unit: "distance", value: 400, ...(paceTarget(engine) ? { targetPace: paceTarget(engine), paceToleranceSeconds: 8 } : {}) },
            { kind: "recovery", unit: "distance", value: 200 },
          ],
          warmupMode: "lap",
          cooldownMode: "lap",
          planningStatus: "final",
        },
      };
    }
    return {
      type: "Schwellenlauf",
      title: `${distance} km mit 3 × 8 min Schwelle`,
      distance,
      duration: 55,
      keySession: true,
      goalSessionRole: "threshold",
      notes: "Schwelle kontrolliert; die letzte Wiederholung soll technisch genauso sauber aussehen wie die erste.",
      goalWorkout: {
        warmupMinutes: 15,
        cooldownMinutes: 10,
        blocks: [workoutBlock({
          label: "Schwelle",
          repeats: 3,
          workMinutes: 8,
          recoveryMinutes: 2,
          targetPace: paceTarget(engine, 12),
          toleranceSeconds: 10,
          effort: "Z4 HR",
        })],
      },
    };
  }

  if (engine.discipline === "10k") {
    if (cycle === 2) {
      return {
        type: "Intervalle",
        title: `5 × 800 m · Arbeitsziel ${paceTarget(engine, -8) || "10-km-Effort"}`,
        distance,
        duration: 60,
        keySession: true,
        goalSessionRole: "race_pace_intervals",
        notes: `Nicht schneller als vorgegeben. ${engine.workingPaceLabel ? `Die Arbeits-Pace wird aus aktuellem Stand und Ziel ${engine.targetPaceLabel} abgeleitet.` : ""}`,
        structuredWorkout: {
          kind: "intervals",
          rounds: 5,
          steps: [
            { kind: "work", unit: "distance", value: 800, ...(paceTarget(engine, -8) ? { targetPace: paceTarget(engine, -8), paceToleranceSeconds: 10 } : {}) },
            { kind: "recovery", unit: "distance", value: 400 },
          ],
          warmupMode: "lap",
          cooldownMode: "lap",
          planningStatus: "final",
        },
      };
    }
    return {
      type: "Schwellenlauf",
      title: `${distance} km mit 3 × 10 min Schwelle`,
      distance,
      duration: 62,
      keySession: true,
      goalSessionRole: "threshold",
      notes: `Gleichmäßige Schwellenblöcke. ${engine.workingPaceLabel ? `Arbeitsziel etwa ${paceTarget(engine, 15)} min/km; nicht die Zielpace erzwingen, wenn sie aktuell noch nicht abgesichert ist.` : ""}`,
      goalWorkout: {
        warmupMinutes: 15,
        cooldownMinutes: 10,
        blocks: [workoutBlock({
          label: "Schwelle",
          repeats: 3,
          workMinutes: 10,
          recoveryMinutes: 3,
          targetPace: paceTarget(engine, 15),
          toleranceSeconds: 12,
          effort: "Z4 HR",
        })],
      },
    };
  }

  if (engine.discipline === "half_marathon") {
    const goalPaceWeek = ["specific", "peak"].includes(engine.phase.key) || cycle === 3;
    const repeats = goalPaceWeek ? 3 : 2;
    const workMinutes = goalPaceWeek ? 12 : 10;
    const offset = goalPaceWeek ? 0 : -12;
    return {
      type: "Schwellenlauf",
      title: goalPaceWeek
        ? `${distance} km mit ${repeats} × ${workMinutes} min HM-Arbeits-Pace`
        : `${distance} km mit ${repeats} × ${workMinutes} min Schwelle`,
      distance,
      duration: 25 + repeats * workMinutes + (repeats - 1) * 3,
      keySession: true,
      goalSessionRole: goalPaceWeek ? "half_marathon_pace" : "threshold",
      notes: goalPaceWeek
        ? `Ziel ist die schrittweise Annäherung an ${engine.targetPaceLabel}. Aktuelles Arbeitsziel: ${engine.workingPaceLabel || "nach kontrolliertem HM-Effort"}.`
        : `Schwelle als Grundlage für das HM-Ziel. Arbeitsziel etwa ${paceTarget(engine, offset) || "Z4"}, ohne das Renntempo vorzeitig zu erzwingen.`,
      goalWorkout: {
        warmupMinutes: 15,
        cooldownMinutes: 10,
        blocks: [workoutBlock({
          label: goalPaceWeek ? "HM-Arbeits-Pace" : "Schwelle",
          repeats,
          workMinutes,
          recoveryMinutes: 3,
          targetPace: paceTarget(engine, offset),
          toleranceSeconds: 12,
          effort: goalPaceWeek ? "Z3 HR" : "Z4 HR",
        })],
      },
    };
  }

  if (engine.discipline === "marathon") {
    const goalPaceWeek = ["specific", "peak"].includes(engine.phase.key) || cycle === 3;
    return {
      type: "Schwellenlauf",
      title: goalPaceWeek ? `${distance} km mit 3 × 15 min Marathon-Arbeits-Pace` : `${distance} km mit 3 × 10 min Schwelle`,
      distance,
      duration: goalPaceWeek ? 75 : 60,
      keySession: true,
      goalSessionRole: goalPaceWeek ? "marathon_pace" : "threshold",
      notes: goalPaceWeek
        ? `Lange, kontrollierte Blöcke in Richtung ${engine.targetPaceLabel}; aktuelles Arbeitsziel ${engine.workingPaceLabel}.`
        : "Schwelle kontrolliert entwickeln; Marathontraining bleibt überwiegend locker.",
      goalWorkout: {
        warmupMinutes: 15,
        cooldownMinutes: 10,
        blocks: [workoutBlock({
          label: goalPaceWeek ? "Marathon-Arbeits-Pace" : "Schwelle",
          repeats: 3,
          workMinutes: goalPaceWeek ? 15 : 10,
          recoveryMinutes: 3,
          targetPace: paceTarget(engine, goalPaceWeek ? 0 : -30),
          toleranceSeconds: 15,
          effort: goalPaceWeek ? "Z3 HR" : "Z4 HR",
        })],
      },
    };
  }

  return null;
}

export function goalSpecificSession(engine, context = {}) {
  if (!engine?.target || context.eventWeek || context.hardAllowed === false) return null;
  if (isBeginnerFiveKGoal(engine)) return finishGoalSession(engine, context);
  if (context.recoveryWeek) return null;
  if (engine.phase.key === "taper" && engine.daysLeft <= 3) return null;
  if (["ultra", "backyard"].includes(engine.discipline) && engine.mode !== "time") return null;
  if (engine.mode === "time") return timedGoalSession(engine, context);
  return finishGoalSession(engine, context);
}

export function estimatedEasyPaceSeconds(engine) {
  const observed = numeric(engine?.baseline?.medianPaceSeconds);
  const targetEasy = numeric(engine?.targetPaceSeconds) ? numeric(engine.targetPaceSeconds) + 70 : 0;
  const estimate = observed && targetEasy ? Math.max(observed, targetEasy) : observed || targetEasy || 420;
  return bounded(estimate, 300, 720);
}

export function longRunGoalGuidance(engine, distance, cycle = 1) {
  const easyPaceSeconds = estimatedEasyPaceSeconds(engine);
  const duration = Math.max(30, Math.round((numeric(distance) * easyPaceSeconds) / 60));
  const course = engine?.courseProfile || {};
  const parts = [];
  if (["half_marathon", "marathon"].includes(engine?.discipline)) {
    parts.push(engine.mode === "time"
      ? `Longrun für ${engine.disciplineLabel}: ruhig beginnen; die Zielpace ${engine.targetPaceLabel} wird nur in den vorgesehenen Qualitätsblöcken trainiert.`
      : `Longrun für das sichere ${engine.disciplineLabel}-Finish: gleichmäßig locker und ohne Endbeschleunigung erzwingen.`);
  } else if (engine?.discipline === "backyard") {
    parts.push("Backyard-spezifisch: Run-Walk-, Runden- und Pausenroutine konsequent üben; nicht auf Durchschnittspace jagen.");
  } else if (engine?.discipline === "ultra") {
    parts.push("Ultra-spezifisch: Zeit auf den Beinen, ökonomisches Gehen und kontrollierte Belastung stehen vor Pace.");
  } else {
    parts.push("Ruhig und kontrolliert; der Longrun baut die Ausdauer auf und ist kein zweiter Tempotag.");
  }
  if (duration >= 75) parts.push("Fuel und Trinken wie für das Ziel vorgesehen trainieren.");
  if (course.aidStationMode === "self_supported") parts.push("Selbstversorgung und Material mitführen.");
  if (numeric(engine?.target?.elevationGain) >= 300) parts.push("Streckenprofil und Höhenmeter schrittweise annähern.");
  if (["ultra", "backyard"].includes(engine?.discipline) && cycle === 3) parts.push("Die Folgebelastung am nächsten Tag nur locker und nur bei stabilen Reviews.");
  return {
    duration,
    notes: parts.join(" "),
    easyPaceSeconds,
  };
}

export function applyGoalWeekendSpecificity(plan = [], engine, { cycle = 1, recoveryWeek = false } = {}) {
  if (!engine?.target || recoveryWeek || cycle !== 3 || !["ultra", "backyard"].includes(engine.discipline)) return plan;
  const longRun = plan.find((entry) => ["Long Run", "Loop-Training", "Backyard Training"].includes(entry.type));
  if (!longRun) return plan;
  const longDate = localDate(longRun.date);
  if (!longDate) return plan;
  const candidates = plan.filter((entry) => {
    if (entry.type !== "Easy Run" || entry.fixed || entry.optional || entry.eventProtection || entry.completed) return false;
    const date = localDate(entry.date);
    if (!date) return false;
    const gap = Math.abs((date - longDate) / DAY_MS);
    return gap === 1;
  });
  const candidate = candidates[0];
  if (!candidate) return plan;
  return plan.map((entry) => entry.id === candidate.id ? {
    ...entry,
    title: `${entry.distance} km locker auf Vorermüdung`,
    goalSessionRole: "back_to_back",
    notes: `${entry.notes || ""} Zielbezug ${engine.disciplineLabel}: lockere Folgebelastung für müde Beine. Keine Pace, bei schlechtem Review auslassen.`,
  } : entry);
}

export function publicGoalSummary(engine) {
  if (!engine) return null;
  return {
    targetId: engine.target?.id || null,
    targetName: engine.target?.name || "",
    targetDate: engine.target?.date || "",
    discipline: engine.discipline,
    disciplineLabel: engine.disciplineLabel,
    goalType: engine.goalType,
    targetKm: engine.targetKm,
    targetTime: engine.targetSeconds ? formatGoalDurationInput(engine.targetSeconds) : "",
    targetPaceLabel: engine.targetPaceLabel,
    workingPaceLabel: engine.workingPaceLabel,
    phase: engine.phase,
    abilities: engine.abilities,
    requiredRuns: engine.requiredRuns,
    feasibility: engine.feasibility,
    experience: engine.experience,
    experienceTransfer: engine.experienceTransfer,
    currentForm: engine.currentForm,
    preparation: engine.preparation,
    targetGap: engine.targetGap,
    strategicAlignment: engine.strategicAlignment,
    constraintWarnings: engine.constraintWarnings,
  };
}
