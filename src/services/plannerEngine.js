import { reviewKind } from "./activityUtils.js";
import { crossTrainingTargetShare } from "./crossTrainingLoad.js";
import { blockedTrainingDates } from "./missedSessionDecision.js";
import {
  availabilityForDate,
  blockedAvailabilityDates,
  mergeAvailabilityExceptions,
  planningConstraintsFromNote,
  runningRestrictedAvailabilityDates,
} from "./plannerAvailability.js";
import {
  buildEventWeek,
  eventDurationMinutes,
  eventGoalLabel,
  eventRelation,
} from "./goalPlanning.js";
import {
  applyGoalWeekendSpecificity,
  buildGoalEngine,
  goalLongRunBounds,
  goalSpecificSession,
  isBeginnerFiveKGoal,
  longRunGoalGuidance,
  publicGoalSummary,
} from "./goalEngine.js";
import { applyPlanPaceGuidance, formatPaceSeconds } from "./workoutPace.js";
import { LOOP_CONTROL_MODES, LOOP_PACE_MODES, isLoopWorkout, normalizeLoopWorkoutItem } from "./loopWorkout.js";
import { buildWeekPrescription } from "./trainingPeriodization.js";

const DAY_NAMES = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const DAY_INDEX = { Montag: 0, Dienstag: 1, Mittwoch: 2, Donnerstag: 3, Freitag: 4, Samstag: 5, Sonntag: 6 };
const DAY_MS = 86400000;

export const workoutTypes = [
  "Easy Run",
  "Long Run",
  "Schwellenlauf",
  "Intervalle",
  "Backyard Training",
  "Loop-Training",
  "ORC Run",
  "ORC Track",
  "Samstagsoption",
  "Fußball",
  "Stabi",
  "Rudern",
  "Laufband",
  "Radfahren",
  "Schwimmen",
  "Mobility",
  "Wettkampf",
  "Sonstiges",
  "Ruhetag",
];

export function startOfWeek(input = new Date(), offsetWeeks = 0) {
  const date = new Date(input);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1 + offsetWeeks * 7);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function isoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dateForDay(weekStart, index) {
  const date = new Date(weekStart);
  date.setDate(date.getDate() + index);
  return date;
}

function activityDate(activity) {
  return String(activity?.startDateLocal || activity?.date || "").slice(0, 10);
}

function isRun(activity) {
  const value = `${activity?.type || ""} ${activity?.sportType || ""} ${activity?.name || ""}`.toLowerCase();
  return value.includes("run") || value.includes("lauf") || value.includes("treadmill");
}

function runningWeeks(activities, weekStart, count = 8) {
  return Array.from({ length: count }, (_, index) => {
    const end = new Date(weekStart);
    end.setDate(end.getDate() - index * 7);
    const start = new Date(end);
    start.setDate(start.getDate() - 7);
    const km = activities.reduce((sum, activity) => {
      const date = new Date(`${activityDate(activity)}T12:00:00`);
      return isRun(activity) && date >= start && date < end ? sum + Number(activity.distance || 0) : sum;
    }, 0);
    return { start, km };
  });
}

function weightedAverage(values) {
  const weights = [0.4, 0.3, 0.2, 0.1];
  const available = values.slice(0, 4);
  const weightSum = available.reduce((sum, _value, index) => sum + weights[index], 0);
  return weightSum ? available.reduce((sum, value, index) => sum + value * weights[index], 0) / weightSum : 0;
}

function boundedNumber(value, minimum, maximum, fallback) {
  if (value === "" || value == null) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function isRunningPlanEntry(entry) {
  const value = `${entry?.type || ""} ${entry?.title || ""}`.toLowerCase();
  if (/rudern|rowing|rad|\bride\b|bike|cycling|schwimm|swim|fußball|football|soccer|stabi|mobility|mobilität|ruhetag|\brest\b/.test(value)) return false;
  return /run|lauf|orc|interval|schwelle|backyard|loop|track|treadmill|wettkampf|race|marathon|ultra/.test(value);
}

function parseGoalTimeSeconds(value = "") {
  const match = String(value || "").trim().match(/^(\d{1,3}):([0-5]\d):([0-5]\d)$/);
  if (!match) return 0;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function activityDurationSecondsForPace(activity = {}) {
  const values = [
    Number(activity.movingTime),
    Number(activity.elapsedTime),
    Number(activity.durationSeconds),
    Number(activity.duration) > 600 ? Number(activity.duration) : Number(activity.duration) * 60,
  ];
  return values.find((value) => Number.isFinite(value) && value > 0) || 0;
}

function recentPerformancePaceSeconds(activities = [], referenceDate = new Date()) {
  const cutoff = new Date(referenceDate);
  cutoff.setDate(cutoff.getDate() - 120);
  const candidates = (Array.isArray(activities) ? activities : [])
    .filter((activity) => isRun(activity))
    .map((activity) => {
      const distance = Number(activity.distance || 0);
      const durationSeconds = activityDurationSecondsForPace(activity);
      const date = new Date(`${activityDate(activity)}T12:00:00`);
      const pace = distance > 0 ? durationSeconds / distance : 0;
      const text = `${activity.name || ""} ${activity.type || ""}`.toLowerCase();
      const verifiedPerformance = Boolean(
        activity.race
        || activity.officialEvent
        || /race|wettkampf|benchmark|time trial|bestzeit|personal best|\bpb\b/.test(text)
      );
      const structuredSessionSummary = !verifiedPerformance && /track|intervall|interval|schwelle|threshold/.test(text);
      const easySession = /easy|locker|recovery|regeneration|grundlage|zone[- ]?2|z2/.test(text);
      const effortEvidence = verifiedPerformance
        || (!structuredSessionSummary && !easySession && (Number(activity.perceivedExertion || 0) >= 7 || distance <= 12));
      return { pace, distance, date, verifiedPerformance, structuredSessionSummary, effortEvidence };
    })
    .filter((entry) => entry.date >= cutoff && entry.date < referenceDate && entry.distance >= 3 && entry.distance <= 21.2 && entry.pace >= 180 && entry.pace <= 720);
  if (!candidates.length) return 0;

  const verified = candidates.filter((entry) => entry.verifiedPerformance);
  const effort = candidates.filter((entry) => entry.effortEvidence && !entry.structuredSessionSummary);
  const usable = candidates.filter((entry) => !entry.structuredSessionSummary);
  const pool = verified.length ? verified : effort.length ? effort : usable.length ? usable : candidates;
  const sorted = [...pool].sort((left, right) => left.pace - right.pace);
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.25));
  return Math.round(sorted[index].pace);
}

function raceStrategyTargetSeconds(event = {}, raceCoachSessions = {}) {
  const eventId = String(event.id || "").trim();
  if (!eventId) return 0;
  const minutes = Number(raceCoachSessions?.[`event:${eventId}`]?.setup?.targetDurationMinutes || 0);
  return Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes * 60) : 0;
}

function stridePrescription({ event = {}, activities = [], goalEngine = {}, raceCoachSessions = {}, weekStart = new Date() } = {}) {
  const eventDistance = Number(event.targetKm || 0);
  const explicitEventTimeSeconds = parseGoalTimeSeconds(event.targetTime);
  const raceStrategyTimeSeconds = explicitEventTimeSeconds > 0 ? 0 : raceStrategyTargetSeconds(event, raceCoachSessions);
  const eventTimeSeconds = explicitEventTimeSeconds || raceStrategyTimeSeconds;
  const eventPaceSeconds = eventDistance > 0 && eventTimeSeconds > 0 ? eventTimeSeconds / eventDistance : 0;
  const performancePace = recentPerformancePaceSeconds(activities, weekStart);
  const easyPace = Number(goalEngine?.baseline?.medianPaceSeconds || 0);
  const anchor = eventPaceSeconds || performancePace || (easyPace > 0 ? Math.max(210, easyPace - 55) : 300);
  const centerSeconds = Math.max(180, Math.round(anchor - (eventPaceSeconds ? 44 : performancePace ? 18 : 12)));
  const displayTolerance = Math.max(6, Math.min(10, Math.round(centerSeconds * 0.035)));
  const garminTolerance = Math.max(15, Math.min(25, displayTolerance + 10));
  const faster = formatPaceSeconds(Math.max(180, centerSeconds - displayTolerance));
  const slower = formatPaceSeconds(centerSeconds + displayTolerance);
  return {
    targetPace: formatPaceSeconds(centerSeconds),
    faster,
    slower,
    displayToleranceSeconds: displayTolerance,
    garminToleranceSeconds: garminTolerance,
    source: explicitEventTimeSeconds > 0
      ? "event-target"
      : raceStrategyTimeSeconds > 0
        ? "race-strategy-target"
        : performancePace
          ? "recent-performance"
          : "easy-baseline",
  };
}

function preRaceActivationDistance(targetKm = 0, baseline = {}) {
  const weekly = Math.max(Number(targetKm || 0), Number(baseline?.weeklyKm || 0));
  if (weekly >= 45) return 7;
  if (weekly >= 28) return 6;
  if (weekly >= 18) return 5;
  return 4;
}

function preRaceActivationCandidate(plan = [], weekStart, event, runRestrictedDates = new Set(), availabilityExceptions = []) {
  const eventIndex = weekDayIndex(weekStart, event.date);
  if (eventIndex < 0 || eventIndex > 6) return null;
  return [1, 2, 3]
    .map((daysBefore) => {
      const index = eventIndex - daysBefore;
      if (index < 0) return null;
      const date = isoDate(dateForDay(weekStart, index));
      if (runRestrictedDates.has(date)) return null;
      const availability = availabilityForDate(availabilityExceptions, date);
      if (availability?.recoveryOnly || availability?.noRunning || (Number(availability?.maxDurationMinutes || 0) > 0 && Number(availability.maxDurationMinutes) < 30)) return null;
      const entries = plan.filter((entry) => entry.date === date && !entry.raceEvent);
      const highLoad = entries.some((entry) => isHardEventWeekEntry(entry) && !isRunningPlanEntry(entry));
      if (highLoad) return null;
      const running = entries.filter((entry) => isRunningPlanEntry(entry));
      const hardRun = running.some((entry) => isHardEventWeekEntry(entry));
      const score = daysBefore * 10 + (hardRun ? 5 : 0) + (running.length ? -2 : 0);
      return { date, index, daysBefore, running, score };
    })
    .filter(Boolean)
    .sort((left, right) => left.score - right.score)[0] || null;
}

function addPreRaceActivation(plan, weekStart, eventWeek, context = {}) {
  if (!eventWeek?.primary) return plan;
  const event = eventWeek.primary;
  const candidate = preRaceActivationCandidate(
    plan,
    weekStart,
    event,
    context.runRestrictedDates,
    context.availabilityExceptions,
  );
  if (!candidate) return plan;

  const prescription = stridePrescription({
    event,
    activities: context.activities,
    goalEngine: context.goalEngine,
    raceCoachSessions: context.raceCoachSessions,
    weekStart,
  });
  const baseDistance = preRaceActivationDistance(context.targetKm, context.goalEngine?.baseline);
  const existing = candidate.running.find((entry) => !entry.raceEvent) || null;
  const distance = Math.max(4, Math.min(8, Number(existing?.distance || baseDistance)));
  const strideCount = Number(context.goalEngine?.baseline?.runDays || 0) >= 4 || Number(context.targetKm || 0) >= 45 ? 5 : 4;
  const strideSeconds = Number(context.goalEngine?.baseline?.runDays || 0) < 2 ? 15 : 20;
  const recoverySeconds = strideSeconds <= 15 ? 75 : 80;
  const easyPaceSeconds = Number(context.goalEngine?.baseline?.medianPaceSeconds || 0) || 390;
  const totalMinutes = Math.max(30, Math.round((distance * easyPaceSeconds) / 60));
  const fastBlockMinutes = Math.ceil((strideCount * (strideSeconds + recoverySeconds)) / 60);
  const warmupMinutes = Math.max(18, Math.round((totalMinutes - fastBlockMinutes) * 0.7));
  const cooldownMinutes = Math.max(8, totalMinutes - fastBlockMinutes - warmupMinutes);
  const templateName = `${strideCount} × ${strideSeconds} s Strides @ ${prescription.faster}–${prescription.slower}/km · ${recoverySeconds} s locker`;
  const activation = item(weekStart, candidate.index, {
    ...(existing || {}),
    id: existing?.id || crypto.randomUUID(),
    date: candidate.date,
    day: DAY_NAMES[dateForDay(weekStart, candidate.index).getDay()],
    title: `Shake-out / Pre-Race Activation · ${templateName}`,
    type: "Easy Run",
    distance,
    duration: totalMinutes,
    optional: false,
    fixed: Boolean(existing?.fixed),
    spontaneous: existing ? existing.spontaneous : true,
    time: existing?.time || "",
    eventProtection: true,
    preRaceActivation: true,
    goalSessionRole: "pre_race_activation",
    keySession: false,
    structuredWorkout: {
      kind: "sprints",
      rounds: strideCount,
      steps: [
        {
          kind: "work",
          unit: "time",
          value: strideSeconds,
          targetPace: prescription.targetPace,
          paceToleranceSeconds: prescription.garminToleranceSeconds,
        },
        { kind: "recovery", unit: "time", value: recoverySeconds },
      ],
      warmupMode: "time",
      cooldownMode: "time",
      warmupMinutes,
      cooldownMinutes,
      planningStatus: "final",
      templateName,
    },
    notes: `Shake-out vor ${event.name}: ${distance} km insgesamt locker. ${templateName}. Strides kontrolliert bei etwa RPE 7/10, kein Sprint. Die kurzen Strides erhalten neuromuskuläre Spannung und Laufökonomie, ohne einen zusätzlichen Ermüdungsreiz aufzubauen. Garmin erhält für die kurzen GPS-Schritte bewusst einen breiteren Pace-Korridor um ${prescription.targetPace}/km.`,
  });

  const ids = new Set(candidate.running.map((entry) => entry.id));
  const withoutCandidateRuns = plan.filter((entry) => !ids.has(entry.id));
  withoutCandidateRuns.push(activation);
  return withoutCandidateRuns;
}

function constrainedRecoveryEntry(entry, constraint) {
  const maxDuration = Math.max(5, Number(constraint?.maxDurationMinutes || 20));
  return {
    ...entry,
    title: "Kurze Recovery-Aktivierung",
    type: "Mobility",
    distance: 0,
    duration: Math.min(maxDuration, Math.max(10, Number(entry?.duration || maxDuration))),
    optional: true,
    fixed: false,
    spontaneous: true,
    time: "",
    keySession: false,
    structuredWorkout: null,
    goalWorkout: null,
    paceGuidance: null,
    travelConstraint: true,
    notes: `${constraint.reason || "Wochenbesonderheit"}: maximal ${maxDuration} Minuten sehr lockere Recovery/Aktivierung. Keine reguläre Lauf- oder Qualitätseinheit und keine Doppeleinheit.${constraint.note ? ` ${constraint.note}` : ""}`,
  };
}

function applyDailyAvailabilityConstraints(plan = [], availabilityExceptions = [], weekStart = new Date()) {
  const constraints = new Map((Array.isArray(availabilityExceptions) ? availabilityExceptions : []).map((entry) => [entry.date, entry]));
  const constrained = [];
  const datesWithEntries = new Set();

  (Array.isArray(plan) ? plan : []).forEach((entry) => {
    const constraint = constraints.get(entry.date);
    if (!constraint || entry.raceEvent) {
      constrained.push(entry);
      datesWithEntries.add(entry.date);
      return;
    }
    if (constraint.status === "blocked") return;
    if (constraint.recoveryOnly) {
      if (entry.type === "Ruhetag") {
        constrained.push({
          ...constrainedRecoveryEntry(entry, constraint),
          title: `${constraint.reason || "Reisetag"} · Recovery-Aktivierung optional`,
        });
        datesWithEntries.add(entry.date);
        return;
      }
      const alreadyRecovery = /mobility|mobilität|recovery|regeneration|aktivierung/.test(`${entry.type || ""} ${entry.title || ""}`.toLowerCase());
      if (alreadyRecovery) {
        const strengthLike = /stabi|kraft|strength/.test(`${entry.type || ""} ${entry.title || ""}`.toLowerCase());
        constrained.push({
          ...entry,
          ...(strengthLike ? { title: "Kurze Mobility & Aktivierung", type: "Mobility", distance: 0 } : {}),
          duration: Math.min(Number(constraint.maxDurationMinutes || entry.duration || 20), Number(entry.duration || constraint.maxDurationMinutes || 20)),
          optional: true,
          structuredWorkout: null,
          goalWorkout: null,
          keySession: false,
          travelConstraint: true,
          notes: `${entry.notes || ""} Wochenbesonderheit: nur sehr lockere Aktivierung${constraint.maxDurationMinutes ? ` bis maximal ${constraint.maxDurationMinutes} Minuten` : ""}.`.trim(),
        });
      } else {
        constrained.push(constrainedRecoveryEntry(entry, constraint));
      }
      datesWithEntries.add(entry.date);
      return;
    }
    if (constraint.noRunning && isRunningPlanEntry(entry)) {
      // A pure no-running constraint (for example a long car journey) blocks the run
      // without silently deleting an otherwise allowed short strength/mobility session.
      datesWithEntries.add(entry.date);
      return;
    }
    if (constraint.maxDurationMinutes && Number(entry.duration || 0) > Number(constraint.maxDurationMinutes)) {
      const originalDuration = Math.max(1, Number(entry.duration || 0));
      const cappedDuration = Number(constraint.maxDurationMinutes);
      const running = isRunningPlanEntry(entry);
      const adjustedDistance = running && Number(entry.distance || 0) > 0
        ? Math.max(0.1, Math.round((Number(entry.distance) * cappedDuration / originalDuration) * 10) / 10)
        : Number(entry.distance || 0);
      const structured = Boolean(entry.structuredWorkout || entry.goalWorkout);
      constrained.push({
        ...entry,
        duration: cappedDuration,
        ...(running ? { distance: adjustedDistance } : {}),
        ...(structured && running ? { type: "Easy Run", structuredWorkout: null, goalWorkout: null, keySession: false } : {}),
        notes: `${entry.notes || ""} Zeitlimit für diese Woche: maximal ${constraint.maxDurationMinutes} Minuten.${structured ? " Die strukturierte Qualität wird dafür nicht gekürzt, sondern als lockere verkürzte Einheit behandelt." : ""}`.trim(),
      });
      datesWithEntries.add(entry.date);
      return;
    }
    constrained.push(entry);
    datesWithEntries.add(entry.date);
  });

  constraints.forEach((constraint, date) => {
    if (datesWithEntries.has(date)) return;
    const index = weekDayIndex(weekStart, date);
    if (index < 0 || index > 6) return;
    if (constraint.status === "blocked") {
      if (!["planning-note", "weekly-context"].includes(constraint.source)) return;
      constrained.push(item(weekStart, index, {
        title: `${constraint.reason || "Termin"} · kein Training`,
        type: "Ruhetag",
        distance: 0,
        duration: 0,
        optional: false,
        travelConstraint: true,
        notes: `Diese Woche anders als sonst: Training ist an diesem Tag nicht möglich.${constraint.note ? ` ${constraint.note}` : ""}`,
      }));
      return;
    }
    if (constraint.recoveryOnly || constraint.maxDurationMinutes) {
      constrained.push(item(weekStart, index, {
        title: "Kurze Recovery-Aktivierung optional",
        type: "Mobility",
        distance: 0,
        duration: Math.min(20, Number(constraint.maxDurationMinutes || 20)),
        optional: true,
        travelConstraint: true,
        notes: `${constraint.reason || "Wochenbesonderheit"}: nur sehr lockere Aktivierung${constraint.maxDurationMinutes ? ` bis maximal ${constraint.maxDurationMinutes} Minuten` : ""}. Keine reguläre Lauf- oder Qualitätseinheit.${constraint.note ? ` ${constraint.note}` : ""}`,
      }));
    }
  });

  if (![...constraints.values()].some((constraint) => constraint.noDouble)) return constrained;
  const grouped = new Map();
  constrained.forEach((entry) => grouped.set(entry.date, [...(grouped.get(entry.date) || []), entry]));
  return [...grouped.entries()].flatMap(([date, entries]) => {
    const constraint = constraints.get(date);
    if (!constraint?.noDouble || entries.length <= 1) return entries;
    const race = entries.find((entry) => entry.raceEvent);
    if (race) return [race];
    const selected = [...entries].sort((left, right) => {
      const leftRecovery = /mobility|ruhetag|recovery|aktivierung/.test(`${left.type || ""} ${left.title || ""}`.toLowerCase());
      const rightRecovery = /mobility|ruhetag|recovery|aktivierung/.test(`${right.type || ""} ${right.title || ""}`.toLowerCase());
      return Number(rightRecovery) - Number(leftRecovery) || Number(left.duration || 999) - Number(right.duration || 999);
    })[0];
    return selected ? [selected] : [];
  });
}


export function planningConstraintViolations(plan = [], availabilityExceptions = []) {
  const constraints = (Array.isArray(availabilityExceptions) ? availabilityExceptions : [])
    .filter((entry) => ["planning-note", "weekly-context"].includes(entry?.source) && entry?.date);
  const violations = [];

  constraints.forEach((constraint) => {
    const entries = (Array.isArray(plan) ? plan : []).filter((entry) => entry.date === constraint.date);
    if (constraint.status === "blocked") {
      const invalid = entries.find((entry) => entry.raceEvent
        || Number(entry.distance || 0) > 0
        || Number(entry.duration || 0) > 0
        || !/ruhetag|rest|kein training/i.test(`${entry.type || ""} ${entry.title || ""}`));
      if (invalid) {
        violations.push({ date: constraint.date, message: "Training ist an diesem Tag gesperrt", entryId: invalid.id || "" });
      }
      return;
    }

    if (constraint.recoveryOnly) {
      const maxDuration = Number(constraint.maxDurationMinutes || 20);
      const invalid = entries.filter((entry) => !entry.raceEvent).find((entry) => {
        const text = `${entry.type || ""} ${entry.title || ""}`.toLowerCase();
        const recoveryLike = /mobility|mobilität|recovery|regeneration|aktivierung|ruhetag|rest/.test(text);
        return isRunningPlanEntry(entry)
          || Number(entry.distance || 0) > 0
          || /stabi|kraft|strength|intervall|threshold|schwelle|tempo|track/.test(text)
          || !recoveryLike
          || (maxDuration > 0 && Number(entry.duration || 0) > maxDuration);
      });
      if (invalid) {
        violations.push({ date: constraint.date, message: `nur Recovery/Aktivierung bis maximal ${maxDuration} Minuten erlaubt`, entryId: invalid.id || "" });
      }
      return;
    }

    if (constraint.noRunning) {
      const invalid = entries.filter((entry) => !entry.raceEvent).find((entry) => isRunningPlanEntry(entry) || Number(entry.distance || 0) > 0);
      if (invalid) violations.push({ date: constraint.date, message: "keine Laufeinheit erlaubt", entryId: invalid.id || "" });
      return;
    }

    if (constraint.maxDurationMinutes) {
      const maxDuration = Number(constraint.maxDurationMinutes);
      const invalid = entries.filter((entry) => !entry.raceEvent).find((entry) => Number(entry.duration || 0) > maxDuration);
      if (invalid) violations.push({ date: constraint.date, message: `maximal ${maxDuration} Minuten erlaubt`, entryId: invalid.id || "" });
    }

    if (constraint.noDouble && entries.filter((entry) => entry.type !== "Ruhetag").length > 1) {
      violations.push({ date: constraint.date, message: "keine Doppeleinheit erlaubt", entryId: "" });
    }
  });

  return violations;
}


export function applyCrossTrainingCreditToPlan(plan = [], requestedCreditKm = 0) {
  let remainingCredit = Math.max(0, Number(requestedCreditKm || 0));
  if (remainingCredit <= 0) return { plan, appliedCreditKm: 0, unusedCreditKm: 0 };

  const adjustable = plan
    .filter((entry) => {
      if (!isRunningPlanEntry(entry) || entry.raceEvent || entry.fixed || entry.commitmentId || entry.keySession || isLoopWorkout(entry)) return false;
      const text = `${entry.title || ""} ${entry.type || ""}`.toLowerCase();
      if (/track|intervall|schwelle|tempo|long\s*run|longrun|wettkampf|race|marathon|ultra/.test(text)) return false;
      return /easy|locker|recovery|regeneration|laufband/.test(text);
    })
    .sort((left, right) => {
      const optionalDelta = Number(Boolean(right.optional)) - Number(Boolean(left.optional));
      if (optionalDelta) return optionalDelta;
      return Number(left.distance || 0) - Number(right.distance || 0);
    });

  const reductions = new Map();
  adjustable.forEach((entry) => {
    if (remainingCredit <= 0) return;
    const distance = Math.max(0, Number(entry.distance || 0));
    const minimum = entry.optional ? 0 : Math.min(3, distance);
    const reducible = Math.max(0, distance - minimum);
    const reduction = Math.min(reducible, remainingCredit);
    if (reduction <= 0) return;
    reductions.set(entry.id, reduction);
    remainingCredit -= reduction;
  });

  const adjustedPlan = plan
    .map((entry) => {
      const reduction = reductions.get(entry.id) || 0;
      if (!reduction) return entry;
      const distance = Math.max(0, Number(entry.distance || 0));
      const adjustedDistance = Math.max(0, Math.round((distance - reduction) * 10) / 10);
      const distanceLabel = String(adjustedDistance).replace(".", ",");
      return {
        ...entry,
        distance: adjustedDistance,
        title: String(entry.title || "").replace(/^\d+(?:[.,]\d+)?\s*km/, `${distanceLabel} km`),
        notes: `${entry.notes || ""} Bereits absolvierte Fußballbelastung oder der zeit- und intensitätsbasierte Rennradersatz wurde auf den flexiblen Easy-Umfang angerechnet. Schlüssel- und zielspezifische Einheiten bleiben unverändert.`.trim(),
        crossTrainingAdjusted: true,
      };
    })
    .filter((entry) => Number(entry.distance || 0) > 0 || !isRunningPlanEntry(entry) || entry.fixed || entry.commitmentId || entry.keySession || entry.raceEvent);

  const appliedCreditKm = Math.max(0, Number(requestedCreditKm || 0) - remainingCredit);
  return { plan: adjustedPlan, appliedCreditKm, unusedCreditKm: remainingCredit };
}

function recentLongestRun(activities, weekStart) {
  const start = new Date(weekStart);
  start.setDate(start.getDate() - 56);
  return activities.reduce((max, activity) => {
    const date = new Date(`${activityDate(activity)}T12:00:00`);
    if (!isRun(activity) || date < start || date >= weekStart) return max;
    return Math.max(max, Number(activity.distance || 0));
  }, 0);
}

function loopTrainingDecision(goal, daysLeft, longRun, cycle, recoveryWeek) {
  const loopKm = Number(goal?.loopKm || 0);
  const eventName = goal?.name || "das Rundenziel";
  const base = {
    scheduled: false,
    eventName,
    loopKm,
    reason: "",
    prescription: null,
  };
  if (!loopKm) return { ...base, reason: "Für das Ziel ist keine offizielle Rundenlänge hinterlegt; deshalb wird kein künstlicher Loop-Block erzeugt." };
  if (recoveryWeek) return { ...base, reason: `Diese Woche ist bewusst entlastet. ${eventName} bleibt über einen lockeren zielspezifischen Longrun präsent, der vollständige Loop-Block folgt in einer belastbaren Woche.` };
  if (daysLeft > 84) return { ...base, reason: `Der Wettkampf ist noch mehr als zwölf Wochen entfernt. Zunächst wird die allgemeine Ausdauer aufgebaut; vollständige ${String(loopKm).replace(".", ",")}-km-Runden werden später häufiger.` };
  if (daysLeft <= 14) return { ...base, reason: "In den letzten zwei Wochen wird kein großer Loop-Block mehr erzwungen; Frische und vorhandene Routine haben Vorrang." };
  if (longRun < loopKm * 2) return { ...base, reason: `Der sichere Longrun-Rahmen dieser Woche liegt unter zwei vollständigen Runden. Deshalb bleibt die Einheit zielspezifisch, ohne eine unvollständige Runde zu konstruieren.` };
  const alternatingWeek = Math.floor(daysLeft / 7) % 2 === 0;
  const specificEnough = daysLeft <= 49 || alternatingWeek || cycle === 3;
  if (!specificEnough) return { ...base, reason: `Diese Woche trainiert den zielspezifischen Dauerreiz ohne festen Loop-Block. Die vollständige Rundenprobe wird im Wechsel mit normalen Longruns gesetzt, damit nicht jeder lange Lauf dieselbe Belastung erzeugt.` };
  const desiredLoops = daysLeft > 56 ? 3 : daysLeft > 35 ? 4 : 5;
  const availableLoops = Math.max(2, Math.floor(longRun / loopKm));
  const loops = Math.max(2, Math.min(desiredLoops, availableLoops, goal.goalKind === "backyard" ? 6 : 7));
  const distance = Math.round(loops * loopKm * 10) / 10;
  const loopLabel = String(loopKm).replace(".", ",");
  const supplyRoutine = goal.aidStationMode === "every_loop"
    ? "Nach jeder Runde den geplanten kurzen Stopp und den Zugriff auf Getränke oder Fuel proben."
    : goal.aidStationMode === "fixed_stations"
      ? "Die Abstände der Verpflegungspunkte im Training realistisch simulieren."
      : goal.aidStationMode === "self_supported"
        ? "Die geplante Selbstversorgung und das komplette Material mitführen."
        : "Pausen- und Fuel-Routine passend zum Event testen.";
  const prescription = {
    loops,
    loopKm,
    distance,
    mode: goal.loopMode,
    intervalMinutes: Number(goal.loopIntervalMinutes || 60),
    eventTimeLimit: goal.eventTimeLimit || "",
    eventTimeLimitMinutes: Number(goal.eventTimeLimitMinutes || 0),
    targetKm: Number(goal.targetKm || 0),
    plannedStopMinutes: Number(goal.plannedStopMinutes ?? (goal.goalKind === "backyard" ? 8 : 3)),
    controlMode: LOOP_CONTROL_MODES.MANUAL_LAP,
    paceMode: LOOP_PACE_MODES.NONE,
    title: `${loops} × ${loopLabel} km${goal?.name ? ` · ${goal.name}` : " Loop-Training"}`,
    notes: goal.goalKind === "backyard"
      ? `Spezifischer Backyard-Block: jede Runde kontrolliert und die Geh-/Rundenroutine testen. ${supplyRoutine} Garmin-Runden und Pausen werden am echten Rundenpunkt manuell per LAP gesteuert.`
      : `Spezifischer Loop-Block für ${goal?.name || "das Hauptziel"}: gleichmäßiger Rhythmus und kurze Stopps. ${supplyRoutine} Garmin-Runden und Boxenstopps werden am echten Rundenpunkt manuell per LAP gesteuert.`,
  };
  return {
    ...base,
    scheduled: true,
    reason: `${loops} vollständige Runden passen in den sicheren Longrun-Rahmen und setzen diese Woche den geplanten spezifischen Rundenreiz.`,
    prescription,
  };
}

function cycleWeek(mission, weekStart) {
  const raw = mission?.preparationStartDate || mission?.date;
  if (!raw) return 1;
  const start = startOfWeek(new Date(`${raw}T12:00:00`));
  const diffWeeks = Math.max(0, Math.floor((weekStart - start) / (7 * DAY_MS)));
  return (diffWeeks % 4) + 1;
}

function loadWaveRecoveryDecision(history = [], cycle = 1, phaseKey = "base", eventWeek = null, previousPrescription = null) {
  if (eventWeek || ["event", "taper"].includes(phaseKey)) {
    return { scheduled: false, reason: "Event- oder Tapersteuerung ersetzt die normale Belastungswelle." };
  }
  if (["recovery", "taper"].includes(previousPrescription?.weekType?.key)) {
    return {
      scheduled: false,
      reason: "Die vorherige Planwoche war bereits eine Entlastungs- oder Taperwoche. Der Coach erzwingt keine zweite starre Reduktionswoche.",
    };
  }
  const values = history.map((week) => Number(week?.km || 0)).filter((km) => km > 0.5);
  if (values.length < 3) {
    return {
      scheduled: cycle === 4,
      reason: cycle === 4
        ? "Noch fehlen mehrere abgeschlossene Wochen; der Coach setzt vorsichtshalber eine frühe Entlastung."
        : "Noch fehlen mehrere abgeschlossene Wochen für eine belastbare Wellenanalyse.",
    };
  }
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  const typical = ordered.length % 2
    ? ordered[middle]
    : (ordered[middle - 1] + ordered[middle]) / 2;
  const lastWeekKm = values[0];
  const recentThree = values.slice(0, 3);
  const recentAverage = recentThree.reduce((sum, value) => sum + value, 0) / recentThree.length;
  const alreadyReduced = lastWeekKm <= typical * 0.82;
  const peakCompleted = lastWeekKm >= typical * 1.14;
  const accumulatedLoad = recentAverage >= typical * 1.02
    || Math.max(...recentThree) >= typical * 1.12;
  const scheduled = !alreadyReduced && (peakCompleted || (cycle === 4 && accumulatedLoad));
  return {
    scheduled,
    reason: scheduled
      ? peakCompleted
        ? `Die letzte abgeschlossene Woche lag mit ${Math.round(lastWeekKm)} km deutlich über der etablierten Normalbelastung. Der nächste Block verarbeitet diese Spitze.`
        : "Mehrere belastende Wochen wurden stabil absolviert. Der nächste Block verarbeitet diese Belastungswelle, bevor wieder aufgebaut wird."
      : alreadyReduced
        ? "Die letzte abgeschlossene Woche war bereits deutlich reduziert und wird nicht durch eine zweite starre Entlastungswoche ergänzt."
        : "Die abgeschlossenen Wochen zeigen noch keine Belastungsspitze, die eine automatische Entlastung erzwingt.",
  };
}

function recentMissedSignals(planHistory, weekStart) {
  const since = new Date(weekStart);
  since.setDate(since.getDate() - 21);
  return planHistory.reduce((signals, item) => {
    const date = new Date(`${item.date || "1970-01-01"}T12:00:00`);
    if (date < since || date >= weekStart) return signals;
    const reason = String(item.missedReason || "").toLowerCase();
    if (reason.includes("müde")) signals.fatigue += 1;
    if (reason.includes("schmerz")) signals.pain += 1;
    if (reason.includes("krank")) signals.illness += 1;
    return signals;
  }, { fatigue: 0, pain: 0, illness: 0 });
}

function readinessDecision(config, missedSignals) {
  const checkin = config.checkin || {};
  let factor = 1;
  let hardAllowed = true;
  let longRunAllowed = true;
  const notes = [];

  const energy = Number(checkin.energy || 4);
  if (energy <= 2) {
    factor *= 0.78;
    hardAllowed = false;
    notes.push("Energie niedrig: Umfang reduziert und keine zusätzliche Qualitätseinheit.");
  }

  if (["unchanged", "worse"].includes(checkin.fatigue)) {
    factor *= checkin.fatigue === "worse" ? 0.72 : 0.84;
    hardAllowed = false;
    notes.push("Müdigkeit noch vorhanden: Belastung wird vorsichtig geplant.");
  } else if (missedSignals.fatigue >= 2 && checkin.fatigue !== "better") {
    factor *= 0.88;
    hardAllowed = false;
    notes.push("Mehrere Müdigkeits-Rückmeldungen aus den letzten Wochen berücksichtigt.");
  }

  const painLevel = Number(checkin.painLevel || 0);
  if (["unchanged", "worse"].includes(checkin.pain) || painLevel >= 4) {
    factor *= painLevel >= 7 || checkin.pain === "worse" ? 0.5 : 0.7;
    hardAllowed = false;
    longRunAllowed = painLevel < 7;
    notes.push("Schmerzen nicht vollständig abgeklungen: kein intensives Training, Longrun begrenzt.");
  } else if (missedSignals.pain > 0 && checkin.pain !== "better" && checkin.pain !== "none") {
    factor *= 0.82;
    hardAllowed = false;
  }

  if (checkin.illness === "symptoms") {
    factor *= 0.35;
    hardAllowed = false;
    longRunAllowed = false;
    notes.push("Noch Krankheitssymptome: nur sehr leichte Bewegung oder Pause einplanen.");
  } else if (checkin.illness === "recovering") {
    factor *= 0.62;
    hardAllowed = false;
    longRunAllowed = false;
    notes.push("Noch nicht bei 100 %: stufenweiser Wiedereinstieg ohne harte Einheit.");
  } else if (missedSignals.illness > 0 && checkin.illness !== "healthy") {
    factor *= 0.75;
    hardAllowed = false;
  }

  return { factor, hardAllowed, longRunAllowed, notes };
}

function highZoneShare(activity) {
  return (activity?.heartRateZones?.zones || [])
    .filter((zone) => Number(zone.zone) >= 4)
    .reduce((sum, zone) => sum + Number(zone.percentage || 0), 0);
}

function isExpectedHardSession(activity, review) {
  if (review?.isEvent && review?.eventPlanningImpact === "training") return false;
  const text = `${activity?.name || ""} ${activity?.type || ""} ${activity?.sportType || ""}`.toLowerCase();
  const durationMinutes = Number(activity?.durationSeconds || 0) / 60 || Number(activity?.duration || 0);
  const elevation = Number(activity?.elevation || activity?.elevationGain || 0);
  const distance = Number(activity?.distance || 0);
  const objectiveDemand = distance >= 20
    || durationMinutes >= 90
    || elevation >= 300
    || /longrun|long run|backyard|intervall|interval|schwelle|threshold|sprint|orc track|wettkampf|race/.test(text);
  const recoveryProblem = Number(review?.legs ?? 10) <= 4 || Number(review?.energy ?? 10) <= 4;
  return Number(review?.rpe || 0) >= 8 && objectiveDemand && !recoveryProblem;
}

function isUnexpectedHardSession(activity, review) {
  if (review?.isEvent && review?.eventPlanningImpact === "training") {
    return Number(review?.legs ?? 10) <= 4 || Number(review?.energy ?? 10) <= 4;
  }
  const rpe = Number(review?.rpe || 0);
  if (Number(review?.legs ?? 10) <= 4 || Number(review?.energy ?? 10) <= 4) return true;
  if (rpe < 8) return false;
  return !isExpectedHardSession(activity, review);
}

export function reviewGuidance(activities = [], reviews = {}, weekStart = new Date()) {
  const cutoff = new Date(weekStart);
  cutoff.setDate(cutoff.getDate() - 14);
  const recent = activities.filter((activity) => {
    const date = new Date(`${activityDate(activity)}T12:00:00`);
    return date >= cutoff && date < weekStart && reviews[activity.id];
  });

  let factor = 1;
  let hardAllowed = true;
  let longRunAllowed = true;
  let strengthFactor = 1;
  let avoidDoubleStrength = false;
  const notes = [];

  const endurance = recent.filter((activity) => reviewKind(activity) === "endurance");
  const strength = recent.filter((activity) => reviewKind(activity) === "strength");
  const tired = endurance.filter((activity) => {
    const review = reviews[activity.id];
    return Number(review.legs || 5) <= 4 || Number(review.energy || 5) <= 4;
  }).length;
  const unexpectedHard = endurance.filter((activity) => isUnexpectedHardSession(activity, reviews[activity.id])).length;
  const expectedHard = endurance.filter((activity) => isExpectedHardSession(activity, reviews[activity.id])).length;
  const depletedEvents = endurance.filter((activity) => reviews[activity.id]?.isEvent && reviews[activity.id]?.eventPlanningImpact === "depleted").length;
  const highHr = endurance.filter((activity) => {
    if (reviews[activity.id]?.isEvent) return false;
    const text = `${activity.name || ""} ${activity.type || ""}`.toLowerCase();
    const intendedEasy = /locker|easy|recovery|longrun|long run|orc run/.test(text) && !/intervall|schwelle|tempo|race|wettkampf/.test(text);
    return intendedEasy && highZoneShare(activity) >= 25 && Number(reviews[activity.id]?.rpe || 5) >= 6;
  }).length;
  const strong = endurance.filter((activity) => {
    const review = reviews[activity.id];
    return Number(review.legs || 0) >= 7 && Number(review.energy || 0) >= 7 && Number(review.rpe || 10) <= 5;
  }).length;
  const upperBodyLoad = strength.filter((activity) => {
    const review = reviews[activity.id];
    return Number(review.upperBodySoreness || 0) >= 6
      || Number(review.backSoreness || 0) >= 5
      || review.impactOnRunning === "deutlich";
  }).length;

  if (tired >= 2) {
    factor *= 0.86;
    hardAllowed = false;
    notes.push("Mehrere Reviews zeigen niedrige Beine oder Energie: Umfang und Intensität werden reduziert.");
  }
  if (unexpectedHard >= 2) {
    factor *= 0.9;
    hardAllowed = false;
    notes.push("Mehrere Einheiten waren härter als ihr Trainingscharakter erwarten ließ oder wurden schlecht verarbeitet: keine zusätzliche Qualitätseinheit.");
  } else if (expectedHard >= 2) {
    notes.push("Mehrere harte Schlüsselreize wurden als erwartbar erkannt. Sie zählen als Belastung, lösen ohne Erholungswarnung aber keine automatische Entlastung aus.");
  }
  if (depletedEvents >= 1) {
    factor *= 0.78;
    hardAllowed = false;
    notes.push("Dein Event-Review meldet deutliche Erschöpfung: Die nächste Woche wird entlastet und ohne harte Zusatzbelastung geplant.");
  }
  if (highHr >= 1) {
    factor *= highHr >= 2 ? 0.86 : 0.93;
    hardAllowed = false;
    notes.push("Herzfrequenz war bei einem lockeren Lauf auffällig hoch: zunächst ruhiger planen und Entwicklung beobachten.");
  }
  if (upperBodyLoad >= 1) {
    strengthFactor = upperBodyLoad >= 2 ? 0.55 : 0.7;
    avoidDoubleStrength = true;
    notes.push("Oberkörper/Rücken sind noch belastet: Rudern und Stabi werden verkürzt und nicht als hartes Doppeltraining gelegt.");
  }
  if (!tired && !unexpectedHard && !highHr && strong >= 3) {
    factor *= 1.03;
    notes.push("Mehrere stabile Reviews erlauben einen kleinen, kontrollierten Aufbau.");
  }

  if (factor < 0.7) longRunAllowed = false;
  return { factor, hardAllowed, longRunAllowed, strengthFactor, avoidDoubleStrength, notes, reviewed: recent.length };
}

function combineReadiness(checkinReadiness, reviewReadiness) {
  return {
    factor: checkinReadiness.factor * reviewReadiness.factor,
    hardAllowed: checkinReadiness.hardAllowed && reviewReadiness.hardAllowed,
    longRunAllowed: checkinReadiness.longRunAllowed && reviewReadiness.longRunAllowed,
    strengthFactor: reviewReadiness.strengthFactor,
    avoidDoubleStrength: reviewReadiness.avoidDoubleStrength,
    notes: [...checkinReadiness.notes, ...reviewReadiness.notes],
  };
}

function weatherForDate(forecast, date) {
  return forecast?.find((item) => item.date === isoDate(date)) || null;
}

function weatherDecision(weather, config) {
  if (!weather) return null;
  const tooHot = weather.maxTemp >= Number(config.maxOutdoorTemperature || 29);
  const tooWindy = weather.maxGust >= Number(config.maxWindGust || 55);
  const storm = weather.weatherCode >= 95;
  return { tooHot, tooWindy, storm, indoor: tooHot || tooWindy || storm };
}

function hasCyclingAlternative(config = {}) {
  return Array.isArray(config.replacementSports) && config.replacementSports.includes("cycling");
}

function cyclingWeatherCandidate(entry, config = {}) {
  const weather = entry?.weatherForecast;
  if (!weather) return null;
  const weatherCode = Number(weather.weatherCode);
  const rainChance = Number(weather.rainChance ?? 100);
  const maxGust = Number(weather.maxGust ?? 999);
  const maxTemp = Number(weather.maxTemp);
  const precipitation = (weatherCode >= 51 && weatherCode <= 67)
    || (weatherCode >= 80 && weatherCode <= 82)
    || weatherCode >= 95;
  const windLimit = Math.min(40, Number(config.maxWindGust || 55));
  const temperatureLimit = Number(config.maxOutdoorTemperature || 29);
  if (
    precipitation
    || rainChance > 30
    || maxGust > windLimit
    || !Number.isFinite(maxTemp)
    || maxTemp < 8
    || maxTemp > temperatureLimit
  ) return null;

  const dayPreference = { Samstag: 0, Sonntag: 2, Freitag: 4 }[entry.day] ?? 6;
  const temperaturePenalty = Math.abs(maxTemp - 18);
  return {
    entry,
    weather,
    score: rainChance * 2 + maxGust + temperaturePenalty + dayPreference,
  };
}

export function suggestRoadCyclingAlternative(plan = [], config = {}, context = {}) {
  if (!hasCyclingAlternative(config) || context.eventWeek) return plan;
  if (context.readiness?.hardAllowed === false) return plan;
  if (["recovering", "symptoms"].includes(config.checkin?.illness)) return plan;

  const eligible = plan
    .filter((entry) => (
      entry.type === "Easy Run"
      && ["Freitag", "Samstag", "Sonntag"].includes(entry.day)
      && !entry.fixed
      && !entry.commitmentId
      && !entry.eventProtection
      && !entry.raceEvent
      && !entry.keySession
      && !entry.loopTraining
      && !entry.completed
      && !entry.missedReason
    ))
    .map((entry) => cyclingWeatherCandidate(entry, config))
    .filter(Boolean)
    .sort((left, right) => left.score - right.score);

  const recommendation = eligible[0];
  if (!recommendation) return plan;

  const duration = Math.max(
    45,
    Math.min(120, Math.round((Number(recommendation.entry.duration || 45) * 1.3) / 5) * 5),
  );
  const weather = recommendation.weather;
  const day = recommendation.entry.day;
  const reason = `${day} bietet laut Vorhersage das passendste Rennradfenster: `
    + `${weather.maxTemp} °C · ${weather.rainChance} % Regenrisiko · Böen ${weather.maxGust} km/h. `
    + "Der lockere Lauf bleibt stehen, bis du den Tausch bestätigst.";

  return plan.map((entry) => entry.id === recommendation.entry.id ? {
    ...entry,
    coachAlternative: {
      source: "weather-cycling",
      key: "sport:cycling",
      label: "Lockere Rennradrunde",
      title: `${duration} min Rennrad locker`,
      duration,
      reason,
      weather: {
        date: weather.date,
        weatherCode: weather.weatherCode,
        maxTemp: weather.maxTemp,
        maxGust: weather.maxGust,
        rainChance: weather.rainChance,
      },
    },
  } : entry);
}

function item(weekStart, dayIndex, values) {
  const date = dateForDay(weekStart, dayIndex);
  const fixed = Boolean(values.fixed);
  const spontaneous = fixed ? false : values.spontaneous !== false;
  return {
    id: crypto.randomUUID(),
    date: isoDate(date),
    day: DAY_NAMES[date.getDay()],
    duration: 60,
    completed: false,
    source: "planner-engine",
    archived: false,
    ...values,
    fixed,
    spontaneous,
    time: spontaneous ? "" : values.time || "",
  };
}

function eventWeekTarget(base, readiness, eventWeek) {
  if (!eventWeek) return null;
  const readinessFactor = Math.max(0.35, Math.min(1, Number(readiness.factor || 1)));
  const supplementalKm = Math.round(Math.min(
    eventWeek.maxSupplementalKm,
    base * eventWeek.supplementalShare,
  ) * readinessFactor);
  return Math.max(
    Math.round(eventWeek.totalDistanceKm),
    Math.round(eventWeek.totalDistanceKm + supplementalKm),
  );
}

function weekDayIndex(weekStart, dateValue) {
  const date = new Date(`${dateValue}T12:00:00`);
  date.setHours(0, 0, 0, 0);
  return Math.round((date - weekStart) / DAY_MS);
}

function addMissionEvents(plan, weekStart, eventWeek) {
  if (!eventWeek) return;
  eventWeek.events.forEach((event) => {
    const dayIndex = weekDayIndex(weekStart, event.date);
    if (dayIndex < 0 || dayIndex > 6) return;
    const profile = [
      Number(event.elevationGain || 0) > 0 ? `${Number(event.elevationGain)} hm aufwärts` : "",
      event.surface ? `Untergrund ${event.surface}` : "",
    ].filter(Boolean).join(" · ");
    plan.push(item(weekStart, dayIndex, {
      time: event.time || "",
      title: event.name || "Event",
      type: "Wettkampf",
      distance: Number(event.targetKm || 0),
      duration: eventDurationMinutes(event),
      notes: [
        `Priorität ${event.priority} · ${eventGoalLabel(event)}.`,
        `Diese Einheit ersetzt die harte Schlüsseleinheit der Woche; der übrige Plan schützt deine Frische.`,
        event.role ? `Rolle im Aufbau: ${event.role}.` : "",
        profile,
      ].filter(Boolean).join(" "),
      optional: false,
      fixed: true,
      spontaneous: false,
      race: true,
      officialEvent: true,
      raceEvent: true,
      keySession: true,
      calendarOnly: true,
      targetEventId: event.id || null,
      goalPriority: event.priority,
      goalType: event.goalType,
      location: event.location || "",
      elevationGain: Number(event.elevationGain || 0),
      elevationLoss: Number(event.elevationLoss || 0),
      surface: event.surface || "",
      fuelMode: "race",
    }));
  });
}

function isHardEventWeekEntry(entry) {
  const text = `${entry?.type || ""} ${entry?.title || ""}`.toLowerCase();
  return entry?.commitmentLoad === "high"
    || /fußball|football|soccer|orc track|intervall|interval|schwelle|threshold|tempo|sprint|backyard|loop|long run|longrun/.test(text);
}

function isStrengthEntry(entry) {
  return /stabi|mobility|mobilität|kraft|strength|rudern|rowing/.test(`${entry?.type || ""} ${entry?.title || ""}`.toLowerCase());
}

function eventProtectedMobility(entry, eventName, afterEvent = false) {
  return {
    ...entry,
    title: afterEvent ? "Optionale Mobility zur Erholung" : "Kurze Mobility & Aktivierung",
    type: "Mobility",
    distance: 0,
    duration: Math.min(15, Number(entry.duration || 15)),
    optional: true,
    eventProtection: true,
    notes: afterEvent
      ? `Erholung nach ${eventName}: nur lockere Mobilität, kein Kraft- oder Ruderreiz.`
      : `Frische für ${eventName}: nur Mobilität und Aktivierung, keine ermüdende Kraftbelastung.`,
  };
}

function applyEventWeekProtection(plan, weekStart, eventWeek) {
  if (!eventWeek) return plan;
  const protectedPlan = plan.flatMap((entry) => {
    if (entry.raceEvent || entry.type === "Ruhetag" || entry.preRaceActivation) return [entry];
    const relation = eventRelation(entry.date, eventWeek);
    if (!relation) return [entry];
    const eventName = relation.event.name || "das Event";
    const running = isRunningPlanEntry(entry);
    const hard = isHardEventWeekEntry(entry);
    const strength = isStrengthEntry(entry);

    if (relation.days === 0) {
      if (strength) return [];
      if (!entry.fixed && !entry.commitmentId) return [];
      return [{
        ...entry,
        title: `${entry.title} auslassen`,
        distance: 0,
        optional: true,
        eventProtection: true,
        notes: `${eventName} ist die Schlüsseleinheit des Tages. Dieser zusätzliche Fixtermin soll ausfallen.`,
      }];
    }

    if (relation.days === 1) {
      if (strength) return [eventProtectedMobility(entry, eventName)];
      if (!entry.fixed && !entry.commitmentId) return [];
      if (running && !hard) {
        const distance = Math.min(4, Math.max(3, Number(entry.distance || 4)));
        return [{
          ...entry,
          title: `${distance} km Shake-out optional`,
          type: "Easy Run",
          distance,
          duration: Math.round(distance * 6.8),
          optional: true,
          eventProtection: true,
          notes: `Nur wenn die Beine gut sind: sehr locker vor ${eventName}, keine Pace und keine Zusatzkilometer.`,
        }];
      }
      return [{
        ...entry,
        title: `${entry.title} auslassen`,
        distance: 0,
        optional: true,
        eventProtection: true,
        notes: `Ruhetag vor ${eventName}: keine zusätzliche Belastung.`,
      }];
    }

    if (relation.days > 1 && relation.days <= eventWeek.hardProtectionDays && hard) {
      if (running) {
        const distance = Math.min(5, Math.max(3, Number(entry.distance || 5)));
        return [{
          ...entry,
          title: `${entry.title} · nur locker`,
          type: "Easy Run",
          distance,
          duration: Math.round(distance * 6.6),
          optional: false,
          eventProtection: true,
          structuredWorkout: null,
          notes: `Frische für ${eventName}: keine Intervalle, keine Schwelle und kein Sprint. Nur locker mit höchstens vier kurzen Steigerungen.`,
        }];
      }
      return [{
        ...entry,
        title: `${entry.title} auslassen für ${eventName}`,
        distance: 0,
        optional: true,
        eventProtection: true,
        notes: `${eventWeek.protectionText}. Dieser intensive Termin ist deshalb nur als Auslass-Hinweis eingeplant.`,
      }];
    }

    if (relation.days > 0 && running && !hard) {
      const distance = Math.min(eventWeek.easyRunCapKm, Math.max(3, Number(entry.distance || 4)));
      return [{
        ...entry,
        title: entry.fixed || entry.commitmentId ? `${entry.title} · ${distance} km locker` : `${distance} km locker`,
        type: "Easy Run",
        distance,
        duration: Math.round(distance * 6.5),
        eventProtection: true,
        structuredWorkout: null,
        notes: `Locker im Frischerahmen für ${eventName}. Keine Zusatzkilometer und keine ungeplante Intensität.`,
      }];
    }

    if (relation.days < 0) {
      const daysAfter = Math.abs(relation.days);
      if (strength) return [eventProtectedMobility(entry, eventName, true)];
      if (daysAfter === 1 && !entry.fixed && !entry.commitmentId) return [];
      if (eventWeek.priority === "C" && daysAfter >= 2 && running) {
        const eventDistance = Number(relation.event.targetKm || 0);
        if (isLoopWorkout(entry)) {
          const normalized = normalizeLoopWorkoutItem(entry);
          const originalLoops = Number(normalized.loopTraining?.loops || 1);
          const adjustedLoops = eventDistance >= 7 && originalLoops >= 3 ? Math.max(2, originalLoops - 1) : originalLoops;
          const adjusted = adjustedLoops === originalLoops
            ? normalized
            : normalizeLoopWorkoutItem({
              ...normalized,
              loopTraining: { ...normalized.loopTraining, loops: adjustedLoops },
            });
          return [{
            ...adjusted,
            optional: true,
            eventProtection: true,
            notes: `${adjusted.notes || ""} ${eventName} ist ein C-Event und ersetzt den Qualitätsreiz, nicht den missionsbezogenen Aufbau. Der folgende Loop-/Longrun wird deshalb nur moderat reduziert und bleibt abhängig von Event-Review, Beinen und Energie.`.trim(),
          }];
        }
        const longSpecific = /long\s*run|longrun|backyard/.test(`${entry.type || ""} ${entry.title || ""}`.toLowerCase());
        const reductionFactor = longSpecific ? (eventDistance >= 15 ? 0.72 : eventDistance >= 7 ? 0.82 : 0.9) : 1;
        const distance = longSpecific ? Math.max(5, Math.round(Number(entry.distance || 0) * reductionFactor)) : Number(entry.distance || 0);
        return [{
          ...entry,
          type: longSpecific ? entry.type : "Easy Run",
          distance,
          title: longSpecific && Number(entry.distance || 0) !== distance
            ? String(entry.title || `${distance} km locker`).replace(/^\d+(?:[.,]\d+)?\s*km/, `${distance} km`)
            : entry.title,
          optional: true,
          eventProtection: true,
          structuredWorkout: null,
          goalWorkout: null,
          notes: `${entry.notes || ""} ${eventName} ist ein C-Event und ersetzt den Qualitätsreiz, nicht automatisch den missionsbezogenen Wochenaufbau. Diese aerobe Einheit bleibt deshalb als Option bestehen, sofern Beine, Energie und Event-Review am Wochenende unauffällig sind.`.trim(),
        }];
      }
      if (hard && !running) {
        return [{
          ...entry,
          title: `${entry.title} auslassen`,
          distance: 0,
          optional: true,
          eventProtection: true,
          notes: `Erholung nach ${eventName}: keine weitere intensive Belastung in dieser Eventwoche.`,
        }];
      }
      if (running) {
        const distance = Math.min(eventWeek.priority === "C" ? 5 : 4, Math.max(3, Number(entry.distance || 4)));
        return [{
          ...entry,
          title: `${distance} km Recovery optional`,
          type: "Easy Run",
          distance,
          duration: Math.round(distance * 7),
          optional: true,
          eventProtection: true,
          structuredWorkout: null,
          notes: `Nur zur lockeren Erholung nach ${eventName}. Bei schweren Beinen komplett auslassen.`,
        }];
      }
    }

    return [entry];
  });

  eventWeek.events.forEach((event) => {
    const eventIndex = weekDayIndex(weekStart, event.date);
    [
      { index: eventIndex - 1, title: `Ruhetag vor ${event.name}`, notes: `Bewusste Frische für das Event mit Priorität ${event.priority}.` },
      { index: eventIndex + 1, title: `Erholung nach ${event.name}`, notes: "Kein Nachholen ausgefallener Kilometer; Schlaf, Essen und lockere Bewegung haben Vorrang." },
    ].forEach((rest) => {
      if (rest.index < 0 || rest.index > 6) return;
      const date = isoDate(dateForDay(weekStart, rest.index));
      if (protectedPlan.some((entry) => entry.date === date)) return;
      protectedPlan.push(item(weekStart, rest.index, {
        title: rest.title,
        type: "Ruhetag",
        distance: 0,
        duration: 0,
        notes: rest.notes,
        optional: false,
        eventProtection: true,
      }));
    });
  });

  return protectedPlan;
}

function addStrengthSessions(plan, weekStart, config, readiness, blockedDates = new Set()) {
  const trueDoubleDays = new Set(config.doubleTrainingDays || []);
  const strengthFactor = Number(readiness.strengthFactor || 1);
  const stabiDays = (Array.isArray(config.stabiDays) ? config.stabiDays : []).slice(0, Number(config.stabiCount ?? 0));
  const rowingDays = (Array.isArray(config.rowingDays) ? config.rowingDays : []).slice(0, Number(config.rowingCount ?? 0));
  const rowingDistanceKm = boundedNumber(config.rowingDistanceKm, 0.5, 50, 5);
  const rowingDuration = boundedNumber(config.rowingDuration, 5, 180, 35);
  const firstSpm = Math.round(boundedNumber(config.rowingSpmMin, 14, 40, 24));
  const secondSpm = Math.round(boundedNumber(config.rowingSpmMax, 14, 40, 26));
  const rowingSpmMin = Math.min(firstSpm, secondSpm);
  const rowingSpmMax = Math.max(firstSpm, secondSpm);

  function sessionsOnDay(day) {
    const dayIndex = DAY_INDEX[day];
    if (dayIndex === undefined) return [];
    const date = isoDate(dateForDay(weekStart, dayIndex));
    return plan.filter((entry) => entry.date === date && entry.type !== "Ruhetag");
  }

  stabiDays.forEach((day, index) => {
    if (DAY_INDEX[day] === undefined) return;
    const date = isoDate(dateForDay(weekStart, DAY_INDEX[day]));
    if (blockedDates.has(date)) return;
    const paired = sessionsOnDay(day).length > 0;
    plan.push(item(weekStart, DAY_INDEX[day], {
      time: paired ? "07:00" : "18:30",
      title: strengthFactor < 0.8 ? "Leichte Mobilität" : "Stabi & Mobilität",
      type: "Stabi",
      distance: 0,
      duration: Math.max(12, Math.round(Number(config.stabiDuration || 25) * strengthFactor)),
      notes: strengthFactor < 0.8 ? "Review-Anpassung: nur Mobilität, Aktivierung und saubere Bewegung." : "Fester Bestandteil: Rumpf, Rücken, Hüfte und Füße.",
      optional: strengthFactor < 0.65,
      comboSession: paired,
      doubleSession: false,
      sequence: index + 1,
    }));
  });

  rowingDays.forEach((day, index) => {
    if (DAY_INDEX[day] === undefined) return;
    const originalDate = isoDate(dateForDay(weekStart, DAY_INDEX[day]));
    if (blockedDates.has(originalDate)) return;
    const paired = sessionsOnDay(day).length > 0;
    const trueDouble = paired && trueDoubleDays.has(day) && !readiness.avoidDoubleStrength;
    if (paired && !trueDouble) {
      const fallback = ["Donnerstag", "Freitag", "Dienstag", "Sonntag", "Samstag"]
        .find((candidate) => {
          if (DAY_INDEX[candidate] === undefined) return false;
          const candidateDate = isoDate(dateForDay(weekStart, DAY_INDEX[candidate]));
          return !blockedDates.has(candidateDate) && sessionsOnDay(candidate).length === 0;
        });
      if (fallback) day = fallback;
    }
    const finalPaired = sessionsOnDay(day).length > 0;
    const finalDouble = finalPaired && trueDoubleDays.has(day) && !readiness.avoidDoubleStrength;
    const adjustedDistanceKm = Number((rowingDistanceKm * strengthFactor).toFixed(1));
    const adjustedMeters = Math.round(adjustedDistanceKm * 1000);
    const adjustedDuration = Math.max(15, Math.round(rowingDuration * strengthFactor));
    plan.push(item(weekStart, DAY_INDEX[day], {
      time: finalDouble ? "07:00" : "18:30",
      title: `${adjustedMeters.toLocaleString("de-DE")} m Rudern ${strengthFactor < 0.8 ? "sehr locker" : "locker"}`,
      type: "Rudern",
      distance: adjustedDistanceKm,
      duration: adjustedDuration,
      notes: strengthFactor < 0.8
        ? `Review-Anpassung: ${adjustedMeters.toLocaleString("de-DE")} m sehr locker, niedriger Widerstand, ${rowingSpmMin}–${rowingSpmMax} SPM und kein Druck auf Rücken oder Schultern.`
        : `${adjustedMeters.toLocaleString("de-DE")} m ruhige Grundlageneinheit in etwa ${adjustedDuration} min · gleichmäßig ${rowingSpmMin}–${rowingSpmMax} SPM · kein Pace-Druck.`,
      rowingTarget: {
        distanceMeters: adjustedMeters,
        durationMinutes: adjustedDuration,
        spmMin: rowingSpmMin,
        spmMax: rowingSpmMax,
        intensity: "easy",
      },
      optional: strengthFactor < 0.65,
      comboSession: false,
      doubleSession: finalDouble,
      sequence: index + 1,
    }));
  });
}

function applyExtraOrcTrack(plan, weekStart, dayName, config, blockedDates = new Set()) {
  const dayIndex = DAY_INDEX[dayName];
  if (dayIndex === undefined) return;
  const date = isoDate(dateForDay(weekStart, dayIndex));
  if (blockedDates.has(date)) return;
  const replaceableTypes = new Set(["Easy Run", "Schwellenlauf", "Intervalle", "Laufband", "Backyard Training", "Loop-Training", "Long Run"]);
  const candidates = plan
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.date === date && replaceableTypes.has(entry.type))
    .sort((left, right) => {
      const priority = (entry) => ["Easy Run", "Schwellenlauf", "Intervalle", "Laufband", "Backyard Training", "Loop-Training", "Long Run"].indexOf(entry.type);
      return priority(left.entry) - priority(right.entry);
    });
  const target = candidates[0];
  if (!target) return;

  const replaced = target.entry;
  plan[target.index] = {
    ...replaced,
    time: config.orcTrackTime || replaced.time || "19:00",
    title: "ORC Track",
    type: "ORC Track",
    fixed: true,
    spontaneous: false,
    fixedSlot: "extraOrcTrack",
    optional: false,
    choicePending: false,
    choiceOptions: null,
    selectedChoice: null,
    replacedWorkout: { title: replaced.title, type: replaced.type },
    notes: `Wochenanpassung: ${replaced.title} wurde durch ORC Track ersetzt. Umfang bleibt mit ${Number(replaced.distance || 0)} km im Wochenrahmen; Intensität kontrolliert halten.`,
  };
}


function commitmentWorkoutType(commitment) {
  if (commitment.workoutType) return commitment.workoutType;
  return {
    running: "Easy Run",
    football: "Fußball",
    cycling: "Radfahren",
    rowing: "Rudern",
    mobility: "Stabi",
    swimming: "Schwimmen",
    strength: "Stabi",
  }[commitment.sport] || "Sonstiges";
}

function isReplaceablePlanEntry(entry) {
  return entry.source === "planner-engine"
    && !entry.completed
    && !entry.fixed
    && !["Stabi", "Mobility", "Ruhetag"].includes(entry.type);
}

function applyRecurringCommitments(plan, weekStart, config, mode = "all", blockedDates = new Set()) {
  const commitments = Array.isArray(config.recurringCommitments)
    ? config.recurringCommitments.filter((entry) => entry && entry.enabled !== false)
    : [];

  commitments.forEach((commitment) => {
    if (mode === "running" && commitment.sport !== "running") return;
    if (mode === "non-running" && commitment.sport === "running") return;
    const dayIndex = DAY_INDEX[commitment.weekday];
    if (dayIndex === undefined) return;
    const date = isoDate(dateForDay(weekStart, dayIndex));
    if (blockedDates.has(date)) return;
    const type = commitmentWorkoutType(commitment);
    const sameDay = plan.map((entry, index) => ({ entry, index })).filter(({ entry }) => entry.date === date);
    const conflictMode = commitment.conflictMode
      || (commitment.replaceRunOnSameDay === true ? "replace" : commitment.allowCombination === false ? "exclusive" : "combine");
    const replaceable = conflictMode === "replace"
      ? sameDay.find(({ entry }) => isReplaceablePlanEntry(entry))
      : null;
    const distance = Number(commitment.distanceKm || replaceable?.entry?.distance || 0);
    const duration = Number(commitment.durationMinutes || replaceable?.entry?.duration || 60);
    const values = {
      time: commitment.time || replaceable?.entry?.time || "18:00",
      title: commitment.name || type,
      type,
      distance,
      duration,
      notes: `Konfigurierter Fixtermin (${commitment.weekday}). Belastung: ${commitment.load === "high" ? "hoch" : commitment.load === "low" ? "niedrig" : "mittel"}.`,
      optional: false,
      fixed: true,
      spontaneous: false,
      commitmentId: commitment.id,
      commitmentLoad: commitment.load || "medium",
      conflictMode,
      allowCombination: conflictMode !== "exclusive",
      replacedWorkout: replaceable ? { title: replaceable.entry.title, type: replaceable.entry.type } : null,
    };

    if (replaceable) {
      plan[replaceable.index] = { ...replaceable.entry, ...values };
      return;
    }

    if (conflictMode === "exclusive") {
      sameDay
        .filter(({ entry }) => !entry.completed && entry.source === "planner-engine")
        .map(({ index }) => index)
        .sort((left, right) => right - left)
        .forEach((index) => plan.splice(index, 1));
    }
    plan.push(item(weekStart, dayIndex, values));
  });
}

function addGoalSpecificWorkout(plan, weekStart, prescription, config, engine, longRunDay, blockedDates = new Set()) {
  if (!prescription) return;
  const runningQuality = plan.filter((entry) => (
    /orc\s*track|intervall|schwelle|threshold|tempo/i.test(`${entry.type || ""} ${entry.title || ""}`)
    && isRunningPlanEntry(entry)
  ));
  const runLimit = Math.max(1, Math.min(7, Number(config.targetRunCount || 0) || 3));
  const existingRuns = plan.filter(isRunningPlanEntry).length;
  const canCarrySecondQuality = engine.mode === "time"
    && ["half_marathon", "marathon"].includes(engine.discipline)
    && engine.baseline.runDays >= 3.5
    && runLimit >= 5;

  if (runningQuality.length && !canCarrySecondQuality && prescription.goalSessionRole !== "run_walk_progression") {
    const existing = runningQuality[0];
    const index = plan.findIndex((entry) => entry.id === existing.id);
    if (index >= 0) {
      plan[index] = {
        ...existing,
        keySession: true,
        goalSessionRole: "existing_quality",
        goalTargetId: engine.target?.id || null,
        notes: `${existing.notes || ""} Zielbezug ${engine.disciplineLabel}: Diese Einheit übernimmt den Qualitätsreiz der Woche. ${engine.targetPaceLabel ? `Das Wettkampfziel entspricht ${engine.targetPaceLabel}; den Vereinsinhalt trotzdem nicht eigenmächtig verschärfen.` : ""}`.trim(),
      };
    }
    return;
  }

  const allowed = new Set(Array.isArray(config.runDays) ? config.runDays : []);
  (config.recurringCommitments || [])
    .filter((entry) => entry?.enabled !== false && entry.sport === "running")
    .forEach((entry) => allowed.add(entry.weekday));
  const doubleDays = new Set(config.doubleTrainingDays || []);
  const preferred = ["Dienstag", "Donnerstag", "Freitag", "Mittwoch", "Samstag", "Montag", "Sonntag"];
  const longIndex = DAY_INDEX[longRunDay];
  const candidates = preferred
    .filter((day) => {
      if (!allowed.has(day) || DAY_INDEX[day] === longIndex) return false;
      const date = isoDate(dateForDay(weekStart, DAY_INDEX[day]));
      return !blockedDates.has(date);
    })
    .map((day) => {
      const date = isoDate(dateForDay(weekStart, DAY_INDEX[day]));
      const entries = plan.filter((entry) => entry.date === date && !["Stabi", "Mobility", "Ruhetag"].includes(entry.type));
      const occupied = entries.length > 0;
      const distanceFromLongRun = longIndex == null ? 3 : Math.abs(DAY_INDEX[day] - longIndex);
      const adjacentPenalty = prescription.goalSessionRole === "run_walk_progression" ? 0 : distanceFromLongRun <= 1 ? 20 : 0;
      const loadPenalty = entries.some((entry) => entry.commitmentLoad === "high" || /fußball|track|intervall|schwelle/.test(`${entry.type} ${entry.title}`.toLowerCase())) ? 40 : 0;
      return {
        day,
        occupied,
        score: adjacentPenalty + loadPenalty + (occupied && !doubleDays.has(day) ? 100 : 0),
      };
    })
    .sort((left, right) => left.score - right.score);
  const selected = candidates.find((candidate) => candidate.score < 100);
  if (!selected) return;

  if (existingRuns >= runLimit) {
    const replaceableIndex = plan.findIndex((entry) => (
      entry.type === "Easy Run"
      && !entry.fixed
      && !entry.commitmentId
      && !entry.keySession
    ));
    if (replaceableIndex < 0) return;
    plan.splice(replaceableIndex, 1);
  }

  const paired = selected.occupied;
  plan.push(item(weekStart, DAY_INDEX[selected.day], {
    time: paired ? "07:00" : "18:00",
    ...prescription,
    optional: false,
    fixed: false,
    spontaneous: true,
    doubleSession: paired,
    comboSession: false,
    goalTargetId: engine.target?.id || null,
    goalDiscipline: engine.discipline,
    targetPaceLabel: engine.targetPaceLabel,
  }));
}

function applyBeginnerFiveKRunWalk(plan, engine) {
  if (!isBeginnerFiveKGoal(engine)) return plan;
  return plan.map((entry) => {
    if (
      entry.fixed
      || entry.raceEvent
      || entry.goalSessionRole === "run_walk_progression"
      || !["Easy Run", "Long Run", "Laufband"].includes(entry.type)
    ) return entry;
    const distance = Number(entry.distance || 0);
    return {
      ...entry,
      type: "Easy Run",
      title: `${distance} km Run-Walk locker`,
      duration: Math.max(Number(entry.duration || 0), Math.round(distance * 9)),
      goalSessionRole: entry.type === "Long Run" ? "run_walk_long" : "run_walk_easy",
      goalTargetId: engine.target?.id || null,
      goalDiscipline: engine.discipline,
      notes: `${entry.notes || ""} Gehpause früh und geplant nutzen; Ziel ist sichere Regelmäßigkeit, nicht Tempo oder Durchbeißen.`.trim(),
    };
  });
}

function distributeEasyKilometers(plan, weekStart, target, fixedKm, config, phase, readiness, cycle, eventWeek = null, blockedDates = new Set()) {
  const allowed = new Set(Array.isArray(config.runDays) ? config.runDays : []);
  const trueDoubleDays = new Set(config.doubleTrainingDays || []);
  const existingQuality = plan.some((entry) => /orc\s*track|intervall|schwelle|threshold|tempo/i.test(`${entry.type || ""} ${entry.title || ""}`));
  const preference = ["Donnerstag", "Freitag", "Dienstag", "Mittwoch", "Sonntag", "Samstag", "Montag"];

  function dayEntries(day) {
    const date = isoDate(dateForDay(weekStart, DAY_INDEX[day]));
    return plan.filter((entry) => entry.date === date && !["Stabi", "Mobility", "Ruhetag"].includes(entry.type));
  }

  function isHardEntry(entry) {
    return entry.commitmentLoad === "high"
      || /fußball|football|orc\s*track|intervall|schwelle|threshold|tempo|wettkampf|race/i.test(`${entry.type || ""} ${entry.title || ""}`);
  }

  const hardDayIndexes = new Set(plan
    .filter(isHardEntry)
    .map((entry) => DAY_INDEX[entry.day])
    .filter((value) => value !== undefined));

  const candidates = preference
    .filter((day) => {
      if (!allowed.has(day)) return false;
      const date = isoDate(dateForDay(weekStart, DAY_INDEX[day]));
      return !blockedDates.has(date);
    })
    .map((day) => {
      const entries = dayEntries(day);
      const occupied = entries.length > 0;
      const hard = entries.some(isHardEntry);
      const date = isoDate(dateForDay(weekStart, DAY_INDEX[day]));
      const relation = eventRelation(date, eventWeek);
      const eventBlocked = Boolean(relation && [0, 1].includes(relation.days));
      const doubleAllowed = occupied && trueDoubleDays.has(day);
      const safeDouble = doubleAllowed && !hard;
      const adjacentHard = [...hardDayIndexes].some((index) => Math.abs(index - DAY_INDEX[day]) === 1);
      return {
        day,
        occupied,
        hard,
        eventBlocked,
        safeDouble,
        score: (occupied ? 100 : 0) + (adjacentHard ? 12 : 0) + preference.indexOf(day),
      };
    })
    .filter((candidate) => !candidate.eventBlocked && (!candidate.occupied || candidate.safeDouble))
    .sort((left, right) => left.score - right.score);

  const remaining = Math.max(0, target - fixedKm);
  const defaultDesiredSessions = target >= 75 ? 3 : remaining > 12 ? 2 : 1;
  const existingRunSessions = plan.filter((entry) => /run|lauf|track|intervall|schwelle|tempo|backyard/i.test(`${entry.type || ""} ${entry.title || ""}`)).length;
  const acceptedTargetRunCount = Math.max(0, Math.min(7, Number(config.targetRunCount || 0)));
  const progressionSessions = acceptedTargetRunCount > 0 ? Math.max(0, acceptedTargetRunCount - existingRunSessions) : 0;
  const desiredSessions = acceptedTargetRunCount > 0 ? progressionSessions : defaultDesiredSessions;
  const maxSessionsByKilometers = remaining >= 4 ? Math.floor(remaining / 4) : remaining >= 3 ? 1 : 0;
  const sessionCount = Math.min(
    desiredSessions,
    candidates.length,
    maxSessionsByKilometers,
    eventWeek?.maxGeneratedRuns ?? Number.POSITIVE_INFINITY,
  );
  if (!sessionCount || remaining < 3) return;

  const weights = sessionCount === 1
    ? [1]
    : sessionCount === 2
      ? [0.55, 0.45]
      : sessionCount === 3
        ? [0.4, 0.34, 0.26]
        : (() => {
            const raw = Array.from({ length: sessionCount }, (_value, index) => Math.max(0.45, 1 - index * 0.1));
            const totalWeight = raw.reduce((sum, value) => sum + value, 0);
            return raw.map((value) => value / totalWeight);
          })();
  candidates.slice(0, sessionCount).forEach((candidate, index) => {
    const day = candidate.day;
    const date = isoDate(dateForDay(weekStart, DAY_INDEX[day]));
    const relation = eventRelation(date, eventWeek);
    const afterEvent = Boolean(relation && relation.days < 0);
    const rawDistance = Math.max(eventWeek ? 3 : 4, Math.round(remaining * weights[index]));
    const normalDistance = eventWeek ? Math.min(eventWeek.easyRunCapKm, rawDistance) : rawDistance;
    const distance = candidate.occupied ? Math.min(6, normalDistance) : normalDistance;
    const paired = candidate.occupied;
    const quality = !existingQuality && !eventWeek && day === "Freitag" && !paired && readiness.hardAllowed && ["build", "specific"].includes(phase.key) && cycle >= 2 && target >= 45;
    plan.push(item(weekStart, DAY_INDEX[day], {
      time: paired ? "07:00" : "18:00",
      title: quality ? `${distance} km mit Schwellenblock` : afterEvent ? `${distance} km Recovery optional` : paired ? `${distance} km Recovery locker` : `${distance} km locker`,
      type: quality ? "Schwellenlauf" : "Easy Run",
      distance,
      duration: Math.round(distance * (afterEvent || paired ? 7 : 6.4)),
      notes: quality
        ? "Nur kontrolliert: Einlaufen, kurzer Schwellenblock und auslaufen."
        : afterEvent
          ? `Nur zur lockeren Erholung nach ${relation.event.name}. Bei schweren Beinen komplett auslassen.`
          : paired
            ? "Bewusst kleine zweite Einheit an einem freigegebenen Doppeltrainingstag. Eine Doppeleinheit ist eine Option, kein Muss; bei müden Beinen auslassen."
            : eventWeek
              ? `Locker im Frischerahmen für ${eventWeek.primary.name}. Keine Zusatzkilometer und keine ungeplante Intensität.`
              : "Locker laufen, keine Pace erzwingen.",
      optional: afterEvent || paired || (index === sessionCount - 1 && target >= 55),
      doubleSession: paired,
      comboSession: false,
      eventProtection: Boolean(eventWeek),
    }));
  });
}

export function generateWeekPlan({
  activities = [],
  activityGroups = [],
  planHistory = [],
  mission,
  profile = {},
  config = {},
  raceCoachSessions = {},
  forecast = [],
  offsetWeeks = 0,
  completedRunningKm = 0,
  completedCrossTrainingKm = 0,
  crossTrainingDetails = [],
  reviews = {},
  today = new Date(),
}) {
  const weekStart = startOfWeek(today, offsetWeeks);
  const weekEndKey = isoDate(dateForDay(weekStart, 6));
  const missedBlockedDates = blockedTrainingDates(planHistory, isoDate(weekStart), weekEndKey);
  const noteAvailabilityConstraints = planningConstraintsFromNote(config.checkin?.notes, weekStart);
  const effectiveAvailabilityExceptions = mergeAvailabilityExceptions(config.availabilityExceptions, noteAvailabilityConstraints);
  const configuredAvailabilityBlockedDates = blockedAvailabilityDates(effectiveAvailabilityExceptions, isoDate(weekStart), weekEndKey);
  const runningRestrictedDates = runningRestrictedAvailabilityDates(effectiveAvailabilityExceptions, isoDate(weekStart), weekEndKey);
  const blockedDates = new Set([...missedBlockedDates, ...configuredAvailabilityBlockedDates]);
  const runBlockedDates = new Set([...blockedDates, ...runningRestrictedDates]);
  const currentWeekStart = startOfWeek(today, 0);
  const historyCutoff = weekStart > currentWeekStart ? currentWeekStart : weekStart;
  const history = runningWeeks(activities, historyCutoff, 8);
  const recentAverage = weightedAverage(history.map((week) => week.km));
  const lastWeek = history[0]?.km || recentAverage;
  const reportedWeeklyKmAvailable = profile.selfReportedWeeklyKm !== "" && profile.selfReportedWeeklyKm !== null && profile.selfReportedWeeklyKm !== undefined;
  const reportedWeeklyKm = boundedNumber(profile.selfReportedWeeklyKm, 0, 300, 0);
  const reportedLongestRun = boundedNumber(profile.selfReportedLongestRunKm, 0, 250, 0);
  const longestRecent = recentLongestRun(activities, historyCutoff) || reportedLongestRun;
  const goalEngine = buildGoalEngine({
    mission,
    activities,
    activityGroups,
    reviews,
    profile,
    planner: config,
    referenceDate: weekStart,
  });
  const goal = goalEngine.target || {};
  const daysLeft = goalEngine.daysLeft;
  const eventWeek = buildEventWeek(mission, weekStart);
  const protectedEventWeek = eventWeek?.priority === "C" ? null : eventWeek;
  const strategicPhase = goalEngine.phase;
  const phase = protectedEventWeek
    ? { key: "event", label: protectedEventWeek.phaseLabel, factor: 1, longShare: 0 }
    : strategicPhase;
  const cycle = cycleWeek(mission, weekStart);
  const previousPrescriptionKey = isoDate(dateForDay(weekStart, -7));
  const previousPrescription = config.weekPrescriptions?.[previousPrescriptionKey]
    || (offsetWeeks > 0 && config.lastRecoveryWeek
      ? { weekType: { key: "recovery", label: "Entlastungswoche" } }
      : null);
  const loadWaveRecovery = loadWaveRecoveryDecision(history, cycle, phase.key, protectedEventWeek, previousPrescription);
  const scheduledRecoveryWeek = loadWaveRecovery.scheduled;
  const missedSignals = recentMissedSignals(planHistory, historyCutoff);
  const checkinReadiness = readinessDecision(config, missedSignals);
  const reviewReference = weekStart > today ? weekStart : new Date(today.getTime() + DAY_MS);
  const reviewReadiness = reviewGuidance(activities, reviews, reviewReference);
  const readiness = combineReadiness(checkinReadiness, reviewReadiness);
  const earlyRecoveryWeek = readiness.factor < 0.86 || !readiness.longRunAllowed || ["unchanged", "worse"].includes(config.checkin?.pain) || ["recovering", "symptoms"].includes(config.checkin?.illness);
  const recoveryWeek = scheduledRecoveryWeek || earlyRecoveryWeek;
  const recoveryReason = protectedEventWeek
    ? `${protectedEventWeek.protectionText}. Das Event ersetzt Longrun und harte Qualität; danach ist Erholung eingeplant.`
    : scheduledRecoveryWeek
      ? loadWaveRecovery.reason
      : earlyRecoveryWeek
        ? "Entlastung wurde wegen Befinden, Reviews oder ausgefallener Einheiten vorgezogen."
        : "Belastungswoche innerhalb des adaptiven Aufbauzyklus.";
  const hasRecurringCommitments = Array.isArray(config.recurringCommitments) && config.recurringCommitments.length > 0;
  const fixedAppointments = {
    football: hasRecurringCommitments ? false : config.fixedAppointments?.football !== false,
    orcRun: hasRecurringCommitments ? false : config.fixedAppointments?.orcRun !== false,
    saturdayMode: hasRecurringCommitments ? "off" : config.fixedAppointments?.saturdayMode || "open",
    extraOrcTrackDay: hasRecurringCommitments ? "" : config.fixedAppointments?.extraOrcTrackDay || "",
  };

  const startingRunCount = Math.max(1, Math.min(7, Number(config.targetRunCount || profile.selfReportedRunsPerWeek || 2)));
  const starterFallback = Math.max(6, Math.min(28, startingRunCount * 4));
  const goalFallback = Math.max(25, Math.min(45, Number(goal?.targetKm || mission?.targetKm || 50) * 0.4));
  const fallbackBase = recentAverage || (reportedWeeklyKmAvailable ? (reportedWeeklyKm || starterFallback) : goalFallback);
  const protectedEventTarget = eventWeekTarget(fallbackBase, readiness, protectedEventWeek);
  const weekPrescription = buildWeekPrescription({
    history,
    fallbackWeeklyKm: fallbackBase,
    goalEngine,
    cycleWeek: cycle,
    recoveryWeek,
    scheduledRecoveryWeek,
    earlyRecoveryWeek,
    recoveryReason,
    readiness,
    eventWeek: protectedEventWeek,
    protectedEventTarget,
    previousWeekKm: lastWeek,
    maxWeeklyKm: config.maxWeeklyKm,
    weekStart: isoDate(weekStart),
  });
  const base = weekPrescription.capacity.baseKm;
  let target = protectedEventTarget ?? weekPrescription.targetKm;
  target = protectedEventWeek
    ? Math.max(Math.round(protectedEventWeek.totalDistanceKm), Math.round(target))
    : Math.max(4, Math.round(target));

  const crossTrainingMaxShare = crossTrainingTargetShare({
    phaseKey: phase.key,
    phaseLabel: phase.label,
    recoveryWeek,
  });
  const crossTrainingCreditCapKm = Math.max(0, target * crossTrainingMaxShare);
  const recognizedCrossTrainingKm = Math.max(0, Number(completedCrossTrainingKm || 0));
  const cappedCrossTrainingKm = Math.min(recognizedCrossTrainingKm, crossTrainingCreditCapKm);
  let appliedCrossTrainingKm = 0;
  let unusedCrossTrainingKm = cappedCrossTrainingKm;

  const allowedRuns = new Set(Array.isArray(config.runDays) ? config.runDays : []);
  (config.recurringCommitments || [])
    .filter((entry) => entry?.enabled !== false && entry.sport === "running" && DAY_INDEX[entry.weekday] !== undefined)
    .forEach((entry) => allowedRuns.add(entry.weekday));
  const wednesdayKm = fixedAppointments.orcRun
    ? Math.min(eventWeek?.easyRunCapKm || 10, Math.max(eventWeek ? 4 : 6, Math.round(target * 0.18)))
    : 0;
  const saturdayKm = !eventWeek && fixedAppointments.saturdayMode !== "off" && phase.key !== "taper" && readiness.longRunAllowed
    ? Math.min(10, Math.max(recoveryWeek ? 5 : 6, Math.round(target * 0.13)))
    : 0;
  const goalLongRun = goalLongRunBounds(goalEngine, target);
  const desiredLong = protectedEventWeek ? 0 : Math.round(target * goalLongRun.share * (recoveryWeek ? 0.82 : 1));
  const starterBaseline = !recentAverage && reportedWeeklyKmAvailable && reportedWeeklyKm < 20;
  const progressionCap = longestRecent > 0
    ? Math.max(4, Math.round(longestRecent * 1.15))
    : starterBaseline
      ? Math.max(4, Math.round(base * 0.45))
      : desiredLong;
  const longRun = !protectedEventWeek && readiness.longRunAllowed
    ? Math.max(4, Math.min(
      Math.max(goalLongRun.minimum, desiredLong),
      progressionCap,
      goalLongRun.maximum,
      Number(config.maxLongRun || 38),
    ))
    : 0;
  const loopDecision = loopTrainingDecision(goal, daysLeft, longRun, cycle, recoveryWeek);
  const loopPrescription = loopDecision.prescription;

  const fridayWeather = weatherDecision(weatherForDate(forecast, dateForDay(weekStart, 4)), config);
  let plan = [];

  if (fixedAppointments.football && !blockedDates.has(isoDate(dateForDay(weekStart, 0)))) {
    plan.push(item(weekStart, 0, {
      time: config.footballTime || "19:00",
      title: "Fußball",
      type: "Fußball",
      distance: 0,
      notes: "Bestätigter Fixtermin. Wird als intensive Belastung berücksichtigt, aber nicht als Laufkilometer.",
      optional: false,
      fixed: true,
      fixedSlot: "football",
      baseDistance: 0,
    }));
  }

  if (wednesdayKm > 0 && !runBlockedDates.has(isoDate(dateForDay(weekStart, 2)))) {
    plan.push(item(weekStart, 2, {
      time: config.orcTime || "19:00",
      title: "ORC Run",
      type: "ORC Run",
      distance: wednesdayKm,
      notes: fixedAppointments.football ? "Bestätigter Gruppenlauf. Intensität nach dem Fußball kontrolliert halten." : "Bestätigter Gruppenlauf. Locker und gruppengerecht laufen.",
      optional: false,
      fixed: true,
      fixedSlot: "orcRun",
      baseDistance: wednesdayKm,
    }));
  }

  if (saturdayKm > 0 && !runBlockedDates.has(isoDate(dateForDay(weekStart, 5)))) {
    if (fixedAppointments.saturdayMode === "orc") {
      plan.push(item(weekStart, 5, {
        time: config.orcTrackTime || "09:00",
        title: "ORC Track",
        type: "ORC Track",
        distance: saturdayKm,
        notes: phase.key === "specific" ? "Bestätigter ORC Track als Vorbelastung vor dem Longrun." : "Bestätigter ORC Track. Intensität kontrolliert halten.",
        optional: false,
        fixed: true,
        saturdaySlot: true,
        fixedSlot: "saturday",
        saturdayMode: "orc",
        baseDistance: saturdayKm,
      }));
    } else if (fixedAppointments.saturdayMode === "alternative") {
      plan.push(item(weekStart, 5, {
        time: "09:00",
        title: `${saturdayKm} km locker`,
        type: "Easy Run",
        distance: saturdayKm,
        notes: "ORC Track findet für dich nicht statt. Stattdessen lockerer Alternativlauf.",
        optional: false,
        saturdaySlot: true,
        fixedSlot: "saturday",
        saturdayMode: "alternative",
        baseDistance: saturdayKm,
      }));
    } else {
      plan.push(item(weekStart, 5, {
        time: config.orcTrackTime || "09:00",
        title: `ORC Track oder ${saturdayKm} km locker`,
        type: "Samstagsoption",
        distance: saturdayKm,
        notes: "Entscheidung meist am Freitag: ORC Track wählen oder denselben Umfang locker als Alternativlauf absolvieren.",
        optional: false,
        saturdaySlot: true,
        fixedSlot: "saturday",
        saturdayMode: "open",
        baseDistance: saturdayKm,
        choicePending: true,
        choiceOptions: {
          orc: { title: "ORC Track", type: "ORC Track", fixed: true },
          alternative: { title: `${saturdayKm} km locker`, type: "Easy Run", fixed: false },
        },
      }));
    }
  }

  applyRecurringCommitments(plan, weekStart, config, "running", runBlockedDates);
  addMissionEvents(plan, weekStart, eventWeek);

  const trueDoubleDays = new Set(config.doubleTrainingDays || []);
  const longRunDay = ["Sonntag", "Samstag", "Freitag", "Donnerstag", "Mittwoch", "Dienstag", "Montag"]
    .find((day) => {
      if (!allowedRuns.has(day)) return false;
      const date = isoDate(dateForDay(weekStart, DAY_INDEX[day]));
      if (runBlockedDates.has(date)) return false;
      const occupied = plan.some((entry) => entry.date === date && !["Stabi", "Mobility", "Ruhetag"].includes(entry.type));
      return !occupied || trueDoubleDays.has(day);
    });

  const goalWorkout = goalSpecificSession(goalEngine, {
    cycle,
    recoveryWeek,
    eventWeek,
    hardAllowed: readiness.hardAllowed,
    weeklyTarget: target,
    targetRunCount: startingRunCount,
  });
  addGoalSpecificWorkout(plan, weekStart, goalWorkout, config, goalEngine, longRunDay, runBlockedDates);

  if (longRun > 0 && longRunDay) {
    const longRunDayIndex = DAY_INDEX[longRunDay];
    const longRunWeather = weatherDecision(weatherForDate(forecast, dateForDay(weekStart, longRunDayIndex)), config);
    const plannedLongDistance = loopPrescription?.distance || longRun;
    const longRunGuidance = longRunGoalGuidance(goalEngine, plannedLongDistance, cycle);
    const normalizedLoopItem = loopPrescription
      ? normalizeLoopWorkoutItem({
        title: loopPrescription.title,
        type: "Loop-Training",
        distance: plannedLongDistance,
        duration: longRunGuidance.duration,
        loopTraining: {
          ...loopPrescription,
          coachPaceSeconds: longRunGuidance.easyPaceSeconds,
        },
      })
      : null;
    plan.push(item(weekStart, longRunDayIndex, {
      time: longRunWeather?.tooHot ? "07:00" : "09:00",
      title: loopPrescription?.title || `${longRun} km Longrun`,
      type: longRunWeather?.indoor ? "Laufband" : loopPrescription ? "Loop-Training" : "Long Run",
      distance: normalizedLoopItem?.distance || plannedLongDistance,
      duration: normalizedLoopItem?.duration || longRunGuidance.duration,
      notes: longRunWeather?.indoor
        ? `Wetteranpassung: ${longRunWeather.tooHot ? "früh starten oder Laufband" : "bei Sturm/Gewitter nach innen wechseln"}. ${longRunGuidance.notes}`
        : `${loopPrescription?.notes || ""} ${longRunGuidance.notes}`.trim(),
      optional: false,
      weatherAdjusted: Boolean(longRunWeather?.indoor),
      loopTraining: normalizedLoopItem?.loopTraining || null,
      targetEventId: goal?.id || null,
      goalTargetId: goal?.id || null,
      goalDiscipline: goalEngine.discipline,
      goalSessionRole: loopPrescription ? "course_specific_long_run" : "long_run",
      keySession: true,
    }));
  }

  plan = addPreRaceActivation(plan, weekStart, eventWeek, {
    activities,
    goalEngine,
    raceCoachSessions,
    targetKm: target,
    runRestrictedDates: runningRestrictedDates,
    availabilityExceptions: effectiveAvailabilityExceptions,
  });

  const fixedKm = plan.reduce((sum, entry) => sum + Number(entry.distance || 0), 0);
  distributeEasyKilometers(plan, weekStart, target, fixedKm, config, phase, readiness, cycle, eventWeek, runBlockedDates);
  plan = applyGoalWeekendSpecificity(plan, goalEngine, { cycle, recoveryWeek });
  plan = applyBeginnerFiveKRunWalk(plan, goalEngine);
  applyExtraOrcTrack(plan, weekStart, fixedAppointments.extraOrcTrackDay, config, runBlockedDates);
  applyRecurringCommitments(plan, weekStart, config, "non-running", blockedDates);
  addStrengthSessions(plan, weekStart, config, readiness, blockedDates);
  plan = applyEventWeekProtection(plan, weekStart, eventWeek);

  if (!readiness.hardAllowed) {
    const painLevel = Number(config.checkin?.painLevel || 0);
    plan = plan
      .filter((entry) => !(painLevel >= 4 && ["Fußball", "ORC Track"].includes(entry.type)))
      .map((entry) => {
        if (["Schwellenlauf", "Intervalle"].includes(entry.type)) {
          return { ...entry, type: "Easy Run", title: `${entry.distance} km locker`, notes: "Qualität wegen Check-in ausgesetzt. Nur locker laufen." };
        }
        if (entry.type === "Fußball") {
          return {
            ...entry,
            optional: true,
            readinessRestricted: true,
            notes: "Der Fixtermin bleibt unverändert sichtbar. Wegen der aktuellen Erholungssignale empfiehlt der Coach als Alternative einen Ruhetag; die Entscheidung bleibt bei dir.",
          };
        }
        if (entry.type === "ORC Track") {
          return {
            ...entry,
            optional: true,
            readinessRestricted: true,
            notes: "Der Fixtermin bleibt unverändert sichtbar. Wegen der aktuellen Erholungssignale empfiehlt der Coach eine lockere Alternative oder Erholung.",
          };
        }
        if (entry.type === "Samstagsoption") {
          return { ...entry, type: "Easy Run", title: `${entry.distance} km locker`, choicePending: false, choiceOptions: null, notes: "Coach-Anpassung: kein ORC Track, nur lockerer Alternativlauf." };
        }
        return entry;
      });
  }

  if (config.checkin?.illness === "recovering") {
    plan = plan
      .filter((entry) => !["Fußball", "ORC Track", "Samstagsoption", "Backyard Training", "Loop-Training", "Long Run"].includes(entry.type))
      .map((entry) => {
        if (["ORC Run", "Easy Run", "Laufband", "Schwellenlauf"].includes(entry.type)) {
          const distance = Math.min(6, Math.max(3, Number(entry.distance || 4)));
          return {
            ...entry,
            type: "Easy Run",
            title: `${distance} km Wiedereinstieg`,
            distance,
            optional: true,
            fixed: false,
            spontaneous: true,
            time: "",
            fixedSlot: null,
            notes: "Nur locker und nur, wenn du dich im Alltag wieder normal fühlst. Bei Verschlechterung abbrechen.",
          };
        }
        if (entry.type === "Rudern") {
          const distance = Math.min(3.5, Number(entry.distance || 3.5));
          const distanceMeters = Math.round(distance * 1000);
          return {
            ...entry,
            title: `${distanceMeters.toLocaleString("de-DE")} m Rudern sehr locker`,
            distance,
            duration: Math.min(25, entry.duration || 25),
            optional: true,
            rowingTarget: {
              ...(entry.rowingTarget || {}),
              distanceMeters,
              durationMinutes: Math.min(25, entry.duration || 25),
              intensity: "recovery",
            },
            notes: "Sehr locker als Wiedereinstieg; niedriger Widerstand und kein Druck.",
          };
        }
        if (entry.type === "Stabi") return { ...entry, title: "Leichte Mobilität", duration: Math.min(20, entry.duration || 20), optional: true, notes: "Nur Mobilität und Aktivierung, kein anstrengendes Krafttraining." };
        return entry;
      });
  }

  if (config.checkin?.illness === "symptoms") {
    plan = plan.filter((entry) => entry.type === "Stabi").map((entry) => ({
      ...entry,
      title: "Optionale leichte Mobilität",
      duration: Math.min(15, entry.duration || 15),
      optional: true,
      notes: "Nur wenn du dich dabei gut fühlst. Kein Training gegen Krankheitssymptome erzwingen.",
    }));
    plan.push(item(weekStart, 1, {
      time: "18:00",
      title: "Erholen & neu bewerten",
      type: "Ruhetag",
      distance: 0,
      duration: 0,
      notes: "Bei Fieber, Brustschmerz, Atemnot oder deutlicher Verschlechterung nicht trainieren und medizinisch abklären.",
      optional: false,
    }));
  }

  if (blockedDates.size) {
    plan = plan.filter((entry) => entry.raceEvent || !blockedDates.has(entry.date));
  }
  plan = applyDailyAvailabilityConstraints(plan, effectiveAvailabilityExceptions, weekStart);

  const todayKey = isoDate(today);
  if (offsetWeeks === 0) {
    plan = plan.filter((entry) => entry.date >= todayKey);
    const remainingTarget = Math.max(0, target - Number(completedRunningKm || 0));
    const runEntries = plan.filter((entry) => Number(entry.distance || 0) > 0 && isRunningPlanEntry(entry));
    const protectedRaceKm = runEntries
      .filter((entry) => entry.raceEvent)
      .reduce((sum, entry) => sum + Number(entry.distance || 0), 0);
    const adjustableRunEntries = runEntries.filter((entry) => !entry.raceEvent);
    const generatedRunKm = adjustableRunEntries.reduce((sum, entry) => sum + Number(entry.distance || 0), 0);
    const adjustableTarget = Math.max(0, remainingTarget - protectedRaceKm);
    if (generatedRunKm > 0 && adjustableTarget < generatedRunKm) {
      const factor = adjustableTarget / generatedRunKm;
      plan = plan.map((entry) => {
        if (!adjustableRunEntries.some((runEntry) => runEntry.id === entry.id)) return entry;
        if (isLoopWorkout(entry)) {
          const normalized = normalizeLoopWorkoutItem(entry);
          const originalLoops = Number(normalized.loopTraining?.loops || 1);
          const loopKm = Number(normalized.loopTraining?.loopKm || 0);
          const minimumLoops = originalLoops >= 2 ? 2 : 1;
          const adjustedLoops = loopKm > 0
            ? Math.max(minimumLoops, Math.min(originalLoops, Math.round((Number(entry.distance || 0) * factor) / loopKm)))
            : originalLoops;
          const adjustedLoop = normalizeLoopWorkoutItem({
            ...normalized,
            loopTraining: {
              ...normalized.loopTraining,
              loops: adjustedLoops,
            },
          });
          return {
            ...adjustedLoop,
            notes: `${entry.notes} Bereits absolvierte Laufkilometer dieser Woche wurden berücksichtigt; der Loop-Block bleibt in vollständigen offiziellen Runden erhalten.`,
          };
        }
        const adjusted = Math.max(entry.optional ? 0 : 3, Math.round(Number(entry.distance || 0) * factor));
        return {
          ...entry,
          distance: adjusted,
          title: entry.title.replace(/^\d+(?:[.,]\d+)?\s*km/, `${adjusted} km`),
          notes: `${entry.notes} Bereits absolvierte Laufkilometer dieser Woche wurden berücksichtigt.`,
        };
      }).filter((entry) => Number(entry.distance || 0) > 0 || ["Fußball", "Stabi", "Mobility", "Rudern", "Ruhetag", "Wettkampf"].includes(entry.type));
    }
  }

  if (offsetWeeks === 0 && cappedCrossTrainingKm > 0) {
    const crossTrainingAdjustment = applyCrossTrainingCreditToPlan(plan, cappedCrossTrainingKm);
    plan = crossTrainingAdjustment.plan;
    appliedCrossTrainingKm = crossTrainingAdjustment.appliedCreditKm;
    unusedCrossTrainingKm = crossTrainingAdjustment.unusedCreditKm;
  }

  plan = plan.map((entry) => {
    const weatherForecast = forecast.find((day) => day.date === entry.date);
    return weatherForecast ? {
      ...entry,
      weatherForecast: {
        date: weatherForecast.date,
        weatherCode: weatherForecast.weatherCode,
        maxTemp: weatherForecast.maxTemp,
        minTemp: weatherForecast.minTemp,
        maxGust: weatherForecast.maxGust,
        rainChance: weatherForecast.rainChance,
      },
    } : entry;
  });
  plan = suggestRoadCyclingAlternative(plan, config, { eventWeek, readiness });
  // Hard safety net: nothing after the first constraint pass may re-introduce a
  // run, quality session or long session on a day restricted by the planning note.
  plan = applyDailyAvailabilityConstraints(plan, effectiveAvailabilityExceptions, weekStart);
  plan = applyPlanPaceGuidance(plan);
  plan.sort((a, b) => `${a.date}${a.time || ""}`.localeCompare(`${b.date}${b.time || ""}`));
  const finalPlanningConstraintViolations = planningConstraintViolations(plan, effectiveAvailabilityExceptions);
  if (eventWeek) {
    const plannedRunningKm = plan
      .filter((entry) => !entry.plannedCancellation && isRunningPlanEntry(entry))
      .reduce((sum, entry) => sum + Number(entry.distance || 0), 0);
    if (plannedRunningKm > 0) target = Math.round(plannedRunningKm);
  }

  const rawFootballCreditKm = crossTrainingDetails
    .filter((detail) => detail.kind === "football")
    .reduce((sum, detail) => sum + Number(detail.equivalentKm || 0), 0);
  const rawRoadCyclingCreditKm = crossTrainingDetails
    .filter((detail) => detail.kind === "roadCycling")
    .reduce((sum, detail) => sum + Number(detail.equivalentKm || 0), 0);
  const rawRoadCyclingAerobicMinutes = crossTrainingDetails
    .filter((detail) => detail.kind === "roadCycling")
    .reduce((sum, detail) => sum + Number(detail.aerobicMinutes || 0), 0);
  const appliedFootballCreditKm = Math.min(rawFootballCreditKm, appliedCrossTrainingKm);
  const appliedRoadCyclingCreditKm = Math.min(
    rawRoadCyclingCreditKm,
    Math.max(0, appliedCrossTrainingKm - appliedFootballCreditKm),
  );
  const appliedRoadCyclingAerobicMinutes = rawRoadCyclingCreditKm > 0
    ? rawRoadCyclingAerobicMinutes * (appliedRoadCyclingCreditKm / rawRoadCyclingCreditKm)
    : 0;
  const plannedFutureRunningKm = plan
    .filter((entry) => !entry.plannedCancellation && isRunningPlanEntry(entry))
    .reduce((sum, entry) => sum + Number(entry.distance || 0), 0);
  const projectedRunningKm = Number(completedRunningKm || 0) + plannedFutureRunningKm;
  const projectedLoadEquivalentKm = projectedRunningKm + appliedCrossTrainingKm;
  const corridorLowKm = Number(weekPrescription.corridor?.lowKm || target);
  const corridorHighKm = Number(weekPrescription.corridor?.highKm || target);
  const withinCorridor = projectedLoadEquivalentKm >= corridorLowKm - 1
    && projectedLoadEquivalentKm <= corridorHighKm + 1;
  const finalWeekPrescription = {
    ...weekPrescription,
    targetKm: target,
    plannedFutureRunningKm: Math.round(plannedFutureRunningKm * 10) / 10,
    completedRunningKm: Math.round(Number(completedRunningKm || 0) * 10) / 10,
    projectedRunningKm: Math.round(projectedRunningKm * 10) / 10,
    projectedLoadEquivalentKm: Math.round(projectedLoadEquivalentKm * 10) / 10,
    withinCorridor,
    deliveryNote: withinCorridor
      ? "Der konkrete Plan liegt im automatisch berechneten Wochenkorridor."
      : projectedLoadEquivalentKm < corridorLowKm
        ? "Verfügbarkeit, absolvierte Einheiten oder geschützte Schlüsselreize begrenzen die Woche unterhalb des Korridors. Der Coach erzeugt daraus keine Kilometerschuld."
        : "Fixtermine oder bereits absolvierte Belastung liegen über dem Korridor. Der Coach schützt deshalb zusätzliche flexible Einheiten und Intensität.",
  };

  return {
    plan,
    target,
    remainingTarget: Math.max(0, target - Number(completedRunningKm || 0) - appliedCrossTrainingKm),
    blockedDates: [...blockedDates],
    availabilityBlockedDates: [...configuredAvailabilityBlockedDates],
    planningConstraints: effectiveAvailabilityExceptions
      .filter((entry) => ["planning-note", "weekly-context"].includes(entry.source))
      .map((entry) => ({
        date: entry.date,
        status: entry.status,
        reason: entry.reason,
        maxDurationMinutes: entry.maxDurationMinutes || null,
        recoveryOnly: Boolean(entry.recoveryOnly),
        noRunning: Boolean(entry.noRunning),
        noDouble: Boolean(entry.noDouble),
        note: entry.note,
      })),
    planningConstraintViolations: finalPlanningConstraintViolations,
    crossTrainingCredit: {
      recognizedKm: recognizedCrossTrainingKm,
      cappedKm: cappedCrossTrainingKm,
      appliedKm: appliedCrossTrainingKm,
      unusedKm: unusedCrossTrainingKm,
      capKm: crossTrainingCreditCapKm,
      maxShare: crossTrainingMaxShare,
      appliedFootballKm: appliedFootballCreditKm,
      appliedRoadCyclingKm: appliedRoadCyclingCreditKm,
      appliedRoadCyclingAerobicMinutes,
      details: crossTrainingDetails,
    },
    recentAverage: Math.round(recentAverage),
    weekStart: isoDate(weekStart),
    phase,
    cycleWeek: cycle,
    recoveryWeek,
    scheduledRecoveryWeek,
    earlyRecoveryWeek,
    recoveryReason,
    readiness,
    daysLeft,
    planningTarget: goalEngine.target ? {
      id: goal.id,
      name: goal.name,
      date: goal.date,
      time: goal.time || "",
      targetKm: goal.targetKm,
      targetMinKm: goal.targetMinKm,
      targetMaxKm: goal.targetMaxKm,
      goalKind: goal.goalKind,
      courseType: goal.courseType,
      loopKm: goal.loopKm,
      loopMode: goal.loopMode,
      loopIntervalMinutes: goal.loopIntervalMinutes,
      eventTimeLimit: goal.eventTimeLimit,
      eventTimeLimitMinutes: goal.eventTimeLimitMinutes,
      plannedStopMinutes: goal.plannedStopMinutes,
      aidStationMode: goal.aidStationMode,
      priority: goal.priority || (goal.isMainTarget ? "A" : "B"),
      goalType: goal.goalType || "finish",
      targetTime: goal.targetTime || "",
      goalDiscipline: goalEngine.discipline,
      disciplineLabel: goalEngine.disciplineLabel,
      targetPaceLabel: goalEngine.targetPaceLabel,
      feasibility: goalEngine.feasibility,
    } : null,
    goalProfile: publicGoalSummary(goalEngine),
    weekPrescription: finalWeekPrescription,
    eventWeek: eventWeek ? {
      weekStart: eventWeek.weekStart,
      priority: eventWeek.priority,
      label: eventWeek.label,
      phaseLabel: eventWeek.phaseLabel,
      hardProtectionDays: eventWeek.hardProtectionDays,
      protectionText: eventWeek.protectionText,
      events: eventWeek.events.map((event) => ({
        id: event.id,
        name: event.name,
        date: event.date,
        time: event.time || "",
        targetKm: event.targetKm,
        priority: event.priority,
        goalType: event.goalType,
      })),
    } : null,
    loopStrategy: loopPrescription,
    loopDecision: {
      scheduled: loopDecision.scheduled,
      eventName: loopDecision.eventName,
      loopKm: loopDecision.loopKm,
      reason: loopDecision.reason,
    },
    history: history.map((week) => ({ start: isoDate(week.start), km: Math.round(week.km * 10) / 10 })),
    weatherNote: fridayWeather?.indoor ? "Freitag wetterbedingt angepasst." : "",
  };
}

export async function fetchWeeklyForecast(latitude, longitude, weekStart) {
  const start = isoDate(weekStart);
  const endDate = new Date(weekStart);
  endDate.setDate(endDate.getDate() + 6);
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    daily: "weather_code,temperature_2m_max,temperature_2m_min,wind_gusts_10m_max,precipitation_probability_max",
    timezone: "auto",
    start_date: start,
    end_date: isoDate(endDate),
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!response.ok) throw new Error("Wochenwetter konnte nicht geladen werden.");
  const data = await response.json();
  return (data.daily?.time || []).map((date, index) => ({
    date,
    weatherCode: data.daily.weather_code[index],
    maxTemp: Math.round(data.daily.temperature_2m_max[index]),
    minTemp: Math.round(data.daily.temperature_2m_min[index]),
    maxGust: Math.round(data.daily.wind_gusts_10m_max[index]),
    rainChance: Math.round(data.daily.precipitation_probability_max[index] || 0),
  }));
}
