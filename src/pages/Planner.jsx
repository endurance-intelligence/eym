import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Card, PageTitle } from "../components/UI";
import TrainingSectionNav from "../components/SectionNav";
import WorkoutRoleBadges from "../components/WorkoutRoleBadges";
import { useApp } from "../context/AppContext";
import { getCurrentPosition } from "../services/weather";
import {
  dateForDay,
  fetchWeeklyForecast,
  generateWeekPlan,
  isoDate,
  planningConstraintViolations,
  reviewGuidance,
  startOfWeek,
  workoutTypes,
} from "../services/plannerEngine";
import { downloadCalendar } from "../services/calendar";
import { plannerSportType, preferredActivities, reviewKind } from "../services/activityUtils";
import { formatCrossTrainingContext, formatCrossTrainingCredit, summarizeCrossTrainingCredits } from "../services/crossTrainingLoad";
import {
  applyOptionalLongRunExtension,
  buildMissedSessionDecision,
} from "../services/missedSessionDecision";
import { activitiesWithGroups } from "../services/activityGroups";
import { completedActivityDestination } from "../services/briefingNavigation";
import { publishIntervalsWeek } from "../services/intervals";
import { DEFAULT_REPLACEMENT_SPORTS, SPORT_OPTIONS, sortCommitments, sportLabel } from "../services/configuration";
import { goalRequirements } from "../services/scienceCoach";
import { missionEvents } from "../services/goalPlanning";
import { plannerEventSyncStatus } from "../services/plannerEventSync";
import { buildRacePrepPlan, racePrepProfileFromEvent } from "../services/racePrepPlanner";
import {
  buildRaceProtocol,
  normalizeRaceProtocolSettings,
  raceProtocolSessionKey,
  raceProtocolSettingsFromSessions,
} from "../services/raceProtocol";
import { buildCoachState } from "../services/coachState";
import {
  clearCoachSuggestionDecision,
  coachSuggestionDecision,
  coachSuggestionDecisionKey,
  updateCoachSuggestionDecisions,
  visibleCoachSuggestions,
} from "../services/coachSuggestions";
import {
  buildCancelledCommitmentPlanEntry,
  buildCommitmentPlanEntry,
  findCommitmentReplacementCandidate,
  findCommitmentSlot,
  replacementLabelForAdjustment,
} from "../services/plannerCommitments";
import {
  hasReviewCoverage,
  planningClosureOffset,
  requiresWeeklyReview,
} from "../services/reviewCoverage";
import {
  WEEK_APPROVAL_STATES,
  acceptWeekPlan,
  invalidateWeekPlanApproval,
  weekPlanApprovalStatus,
} from "../services/plannerApproval";
import {
  buildTrackWorkoutTemplate,
  formatTrackPaceInput,
  isProvisionalTrackWorkout,
  isTrackWorkout,
  normalizeTrackRounds,
  normalizeTrackStep,
  normalizeTrackWorkout,
  normalizeTrackWorkoutTemplates,
  trackWorkoutDistance,
  trackWorkoutForEditing,
  TRACK_MAIN_CONTROL_MODES,
  trackWorkoutSummary,
  trackStepGarminCue,
  trackWorkoutTemplateLabel,
  updateTrackStepDraft,
  updateTrackWorkoutDraft,
  workoutFromTrackTemplate,
} from "../services/trackWorkout";
import {
  canManuallyCompleteWorkout,
  isSpontaneousWorkout,
  normalizeWorkoutTiming,
  workoutSortTime,
  workoutTimingLabel,
} from "../services/plannerTime";
import {
  TRACK_PUBLICATION_STATES,
  planPublicationFingerprint,
  trackPublicationStatus,
  workoutPublicationFingerprint,
} from "../services/workoutPublication";
import {
  fuelRecommendationFromState,
  isFuelRelevantWorkout,
} from "../services/fuelPlanner";
import {
  coachPaceGuidance,
  normalizeWorkoutPaceGuidance,
  paceRangeDurationMinutes,
  prepareWorkoutPaceGuidance,
  supportsWorkoutPaceGuidance,
  workoutPaceLabel,
} from "../services/workoutPace";
import {
  LOOP_CONTROL_MODES,
  LOOP_MODES,
  LOOP_PACE_MODES,
  formatLoopDuration,
  isLoopWorkout,
  loopControlLabel,
  loopModeLabel,
  loopWorkoutCompactLabel,
  loopWorkoutPaceLabel,
  normalizeLoopWorkoutItem,
} from "../services/loopWorkout";
import {
  buildPlanChangePreview,
  canUndoPlanChange,
  mergeGeneratedWeekPlan,
  planChangeFingerprint,
  planEntriesForWeek,
  restorePlanFromSnapshot,
} from "../services/plannerChangePreview";
import {
  AVAILABILITY_REASONS,
  WEEKLY_CONTEXT_PRESETS,
  WEEKLY_CONTEXT_RESTRICTIONS,
  availabilityExceptionsForWeek,
  availabilityForDate,
  availabilityLabel,
  applyWeeklyPlanningContext,
  mergeAvailabilityExceptions,
  normalizeAvailabilityExceptions,
  planningConstraintsFromNote,
  planningNoteForWeek,
  removeAvailabilityException,
  upsertAvailabilityException,
  upsertPlanningCheckinRecord,
  weeklyContextException,
  weeklyContextLabel,
  weeklyContextPreset,
} from "../services/plannerAvailability";
import { workoutRoleAssessment } from "../services/workoutRoles";
import { weeklyReviewSummary } from "../services/weeklyReview";
import "./Planner.css";

const dayFormatter = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
const trackDistanceFormatter = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 });
const reasonOptions = ["Termin fiel aus", "Keine Zeit", "Müde", "Schmerzen", "Krankheit", "Wetter", "Verschoben", "Bewusst ausgelassen", "Aktivität nicht erkannt", "Sonstiges"];
const cancellationReasonOptions = ["Termin fiel aus", "Keine Zeit", "Müde", "Schmerzen", "Krankheit", "Wetter", "Bewusst ausgelassen", "Sonstiges"];
const plannerDays = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
const generatedPlannerKeys = [
  "lastGeneratedAt",
  "lastTarget",
  "lastPhase",
  "lastCycleWeek",
  "lastRecoveryWeek",
  "lastPlanningTarget",
  "lastGoalProfile",
  "lastLoopStrategy",
  "lastLoopDecision",
  "lastRecoveryReason",
  "lastReadiness",
  "lastEventWeek",
  "weekPrescriptions",
  "crossTrainingCredits",
  "weekApprovals",
];

function plannerValueSnapshot(planner = {}, keys = []) {
  const values = {};
  const missingKeys = [];
  [...new Set(keys)].forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(planner, key)) values[key] = planner[key];
    else missingKeys.push(key);
  });
  return { values, missingKeys };
}

function restorePlannerValues(planner = {}, snapshot = {}) {
  const restored = { ...planner };
  Object.entries(snapshot.values || {}).forEach(([key, value]) => { restored[key] = value; });
  (snapshot.missingKeys || []).forEach((key) => { delete restored[key]; });
  delete restored.lastPlanChange;
  return restored;
}

function planChangeDateLabel(value) {
  if (!value) return "Datum offen";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" }).format(date);
}

function planChangeMetricLabel(item = {}) {
  const parts = [];
  if (Number(item.distance || 0) > 0) parts.push(`${Number(item.distance).toFixed(1).replace(".0", "")} km`);
  if (Number(item.duration || 0) > 0) parts.push(`${Math.round(Number(item.duration))} min`);
  if (item.time) parts.push(`${item.time} Uhr`);
  return parts.join(" · ") || "ohne Distanzvorgabe";
}

function planChangeFieldsLabel(fields = []) {
  const labels = {
    date: "Tag",
    time: "Uhrzeit",
    title: "Einheit",
    type: "Sportart",
    distance: "Distanz",
    duration: "Dauer",
    optional: "Priorität",
    fixed: "Fixtermin",
  };
  return fields.map((field) => labels[field] || field).join(" · ");
}

function planningConstraintLabel(constraint = {}) {
  if (constraint.status === "blocked") return "kein Training";
  if (constraint.recoveryOnly) return `nur Recovery/Aktivierung${constraint.maxDurationMinutes ? ` · max. ${constraint.maxDurationMinutes} min` : ""}`;
  if (constraint.noRunning) return `kein Lauf${constraint.maxDurationMinutes ? ` · max. ${constraint.maxDurationMinutes} min` : ""}`;
  if (constraint.maxDurationMinutes) return `max. ${constraint.maxDurationMinutes} min`;
  return constraint.noDouble ? "keine Doppeleinheit" : "Woche angepasst";
}


function raceEventFromPlanItem(item = {}, events = []) {
  return (Array.isArray(events) ? events : []).find((event) => String(event.id || "") === String(item.targetEventId || "")) || {
    id: item.targetEventId || item.id,
    name: item.title,
    date: item.date,
    time: item.time,
    targetKm: item.distance,
    priority: item.goalPriority,
    goalType: item.goalType,
  };
}

function racePrepProfileForEventState(state = {}, event = {}) {
  const saved = (Array.isArray(state.racePrepPlans) ? state.racePrepPlans : [])
    .find((profile) => String(profile.originEventId || "") === String(event.id || ""));
  const profile = saved || racePrepProfileFromEvent(event);
  const setup = state.raceCoachSessions?.[raceProtocolSessionKey(event)]?.setup || {};
  return Number(setup.targetDurationMinutes || 0) > 0
    ? { ...profile, durationMinutes: Number(setup.targetDurationMinutes), durationEstimated: false }
    : profile;
}

function buildRaceProtocolForState(state = {}, event = {}, settings = null, availabilityExceptions = null) {
  const profile = racePrepProfileForEventState(state, event);
  const racePrepPlan = buildRacePrepPlan({ profile, state });
  const effectiveSettings = settings || raceProtocolSettingsFromSessions(state.raceCoachSessions, event);
  const dayContext = availabilityForDate(
    availabilityExceptions || state.planner?.availabilityExceptions || [],
    event.date || "",
  );
  return buildRaceProtocol({
    event,
    settings: effectiveSettings,
    athleteProfile: state.profile,
    racePrepPlan: racePrepPlan?.valid ? racePrepPlan : null,
    dayContext,
  });
}

function blocksTrainingDayByDefault(reason = "") {
  return ["Keine Zeit", "Krankheit", "Schmerzen", "Müde", "Bewusst ausgelassen"].includes(reason);
}

function replacementWorkoutType(sport) {
  return {
    running: "Easy Run",
    football: "Fußball",
    cycling: "Radfahren",
    rowing: "Rudern",
    mobility: "Mobility",
    swimming: "Schwimmen",
    strength: "Stabi",
  }[sport] || "Sonstiges";
}

function adjustmentReplacementOptions(planner = {}) {
  const allowed = new Set(planner.replacementSports?.length ? planner.replacementSports : DEFAULT_REPLACEMENT_SPORTS);
  const options = [];
  if (allowed.has("running")) {
    options.push({ key: "preset:easy-run", label: "Lockerer Zone-2-Lauf", sport: "running", type: "Easy Run", preserveDistance: true });
  }
  SPORT_OPTIONS.filter((entry) => allowed.has(entry.value) && entry.value !== "running" && entry.value !== "other").forEach((entry) => {
    options.push({ key: `sport:${entry.value}`, label: entry.label, sport: entry.value, type: replacementWorkoutType(entry.value), preserveDistance: false });
  });
  (planner.recurringCommitments || []).filter((entry) => entry.enabled !== false).forEach((entry) => {
    options.push({
      key: `commitment:${entry.id}`,
      label: `${entry.name} (Fixtermin)`,
      sport: entry.sport,
      type: entry.workoutType || replacementWorkoutType(entry.sport),
      title: entry.name,
      duration: Number(entry.durationMinutes || 0),
      distance: Number(entry.distanceKm || 0),
      time: entry.time || "18:00",
      preserveDistance: entry.sport === "running" && !Number(entry.distanceKm || 0),
      commitmentId: entry.id,
    });
  });
  options.push({ key: "preset:rest", label: "Ruhetag / Erholung", sport: "rest", type: "Ruhetag", preserveDistance: false, duration: 0 });
  return options.filter((entry, index, all) => all.findIndex((candidate) => candidate.key === entry.key) === index);
}

function commitmentDate(weekStart, commitment) {
  const index = plannerDays.indexOf(commitment.weekday);
  return index >= 0 ? isoDate(dateForDay(weekStart, index)) : "";
}


function createBlank(weekStart) {
  const date = dateForDay(weekStart, 1);
  return {
    id: crypto.randomUUID(),
    date: isoDate(date),
    day: "Dienstag",
    time: "",
    spontaneous: true,
    title: "",
    type: "Easy Run",
    distance: 0,
    duration: 60,
    notes: "",
    optional: false,
    completed: false,
    source: "planner",
    archived: false,
  };
}

function prepareWorkoutForEditing(item) {
  const loopPrepared = isLoopWorkout(item) ? normalizeLoopWorkoutItem(item) : item;
  const prepared = prepareWorkoutPaceGuidance(loopPrepared);
  if (!isTrackWorkout(prepared)) return prepared;
  return {
    ...prepared,
    structuredWorkout: trackWorkoutForEditing(prepared.structuredWorkout),
  };
}

function trackDurationLabel(seconds) {
  const minutes = Math.floor(Number(seconds || 0) / 60);
  const remainder = Number(seconds || 0) % 60;
  if (!minutes) return `${remainder} Sek.`;
  return remainder ? `${minutes}:${String(remainder).padStart(2, "0")} Min.` : `${minutes} Min.`;
}

function adjustmentMoveTimingLabel(item, draft = {}) {
  if (!item.fixed && !item.commitmentId && draft.moveSpontaneous) return "Spontan";
  const time = draft.moveTime || item.time;
  return time ? `${time} Uhr` : "Uhrzeit offen";
}

function isSaturdayPlannerSlot(item, saturdayDate) {
  if (!item || item.date !== saturdayDate || item.source !== "planner-engine") return false;
  if (item.saturdaySlot) return true;
  if (["Samstagsoption", "ORC Track"].includes(item.type)) return true;
  return item.type === "Easy Run" && /orc track|alternativlauf/i.test(`${item.title || ""} ${item.notes || ""}`);
}

function saturdayModeOf(item) {
  if (!item) return "off";
  if (item.choicePending || item.type === "Samstagsoption") return "open";
  if (item.type === "ORC Track") return "orc";
  return "alternative";
}

function isLiveAppointmentSlot(item, date, key) {
  if (!item || item.date !== date || item.source !== "planner-engine") return false;
  if (item.fixedSlot === key || item.replacementFor === key || item.restFor === key) return true;
  const text = `${item.title || ""} ${item.type || ""}`.toLowerCase();
  if (key === "football") return /fußball|football|soccer/.test(text);
  if (key === "orcRun") return /orc run/.test(text);
  return false;
}

function liveAppointmentMode(item, key) {
  if (!item) return "rest";
  if (item.replacementFor === key) return "replacement";
  if (item.restFor === key || item.type === "Ruhetag") return "rest";
  return "fixed";
}

function activityDate(activity) {
  return String(activity.startDateLocal || activity.date || "").slice(0, 10);
}

function activityTime(activity) {
  const raw = activity.startDateLocal || activity.date;
  if (!raw || !String(raw).includes("T")) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function normalizedType(value = "") {
  const type = String(value).toLowerCase();
  if (type.includes("football") || type.includes("soccer") || type.includes("fußball")) return "football";
  if (type.includes("row") || type.includes("rud")) return "rowing";
  if (type.includes("bike") || type.includes("cycl") || type.includes("rad")) return "cycling";
  if (type.includes("swim") || type.includes("schwimm")) return "swimming";
  if (type.includes("walk") || type.includes("hike") || type.includes("wander") || type.includes("gehen")) return "walking";
  if (type.includes("mobility") || type.includes("mobilität") || type.includes("yoga")) return "mobility";
  if (type.includes("strength") || type.includes("stabi") || type.includes("workout") || type.includes("kraft")) return "strength";
  if (type.includes("rest") || type.includes("ruhe") || type.includes("erholungstag")) return "rest";
  if (type.includes("run") || type.includes("lauf") || type.includes("treadmill") || type.includes("orc") || type.includes("backyard") || type.includes("interval") || type.includes("schwelle") || type.includes("wettkampf") || type.includes("race") || type.includes("marathon") || type.includes("ultra")) return "running";
  return type;
}

function weeklyClosureSummary({ weekStart, plan, activities, allActivities, reviews, activityGroups }) {
  const weekEnd = dateForDay(weekStart, 6);
  const startKey = isoDate(weekStart);
  const endKey = isoDate(weekEnd);
  const planEntries = (plan || []).filter((item) => !item.archived && item.date >= startKey && item.date <= endKey);
  const weekActivities = activitiesWithGroups(
    (activities || []).filter((activity) => {
      const value = activityDate(activity);
      return value >= startKey && value <= endKey;
    }),
    activityGroups || [],
  );
  const matches = findMatches(planEntries, weekActivities);
  const missingReviews = weekActivities
    .filter(requiresWeeklyReview)
    .filter((activity) => !hasReviewCoverage(activity, reviews, allActivities));
  const unresolvedItems = planEntries.filter((item) => {
    const type = normalizedType(`${item.type || ""} ${item.title || ""}`);
    if (item.optional || type === "rest") return false;
    return !item.completed && !matches.has(item.id) && !item.missedReason;
  });
  return {
    ready: missingReviews.length === 0 && unresolvedItems.length === 0,
    missingReviews,
    unresolvedItems,
    activityCount: weekActivities.length,
    planCount: planEntries.length,
  };
}

function isRunningActivity(activity) {
  return plannerSportType(activity) === "running";
}

function compatible(plan, activity) {
  const planType = normalizedType(`${plan.type} ${plan.title}`);
  const activityType = plannerSportType(activity);
  return planType === activityType || (planType === "running" && activityType === "running");
}

function matchScore(plan, activity) {
  if (plan.date !== activityDate(activity) || !compatible(plan, activity)) return -1;
  let score = 10;
  const planText = `${plan.title} ${plan.type}`.toLowerCase();
  const actualText = `${activity.name || ""} ${activity.type || ""} ${activity.sportType || ""}`.toLowerCase();
  if (planText.includes("orc") && actualText.includes("orc")) score += 8;
  const plannedDistance = Number(plan.distance || 0);
  const actualDistance = Number(activity.distance || 0);
  if (plannedDistance && actualDistance) score += Math.max(0, 6 - Math.abs(plannedDistance - actualDistance));
  const plannedDuration = Number(plan.duration || 0);
  const actualDuration = Number(activity.duration || 0);
  if (plannedDuration && actualDuration) score += Math.max(0, 4 - Math.abs(plannedDuration - actualDuration) / 15);
  return score;
}

function findMatches(plan, activities) {
  const used = new Set();
  const matches = new Map();
  [...plan].sort((a, b) => `${a.date}${a.time || ""}`.localeCompare(`${b.date}${b.time || ""}`)).forEach((item) => {
    let best = null;
    let bestScore = -1;
    activities.forEach((activity) => {
      if (used.has(activity.id)) return;
      const score = matchScore(item, activity);
      if (score > bestScore) {
        best = activity;
        bestScore = score;
      }
    });
    if (best && bestScore >= 10) {
      matches.set(item.id, best);
      used.add(best.id);
    }
  });
  return matches;
}


function crossTrainingReplanPreview(plan = [], summary = {}, todayKey = "", includeCurrentWeek = true) {
  const future = plan.filter((item) => !item.completed && !item.missedReason && !item.plannedCancellation)
    .filter((item) => !todayKey || String(item.date || "") >= todayKey);
  const eligible = future.filter((item) => {
    const label = `${item.type || ""} ${item.title || ""}`.toLowerCase();
    if (normalizedType(label) !== "running") return false;
    if (item.fixed || item.commitmentId || item.keySession || item.raceEvent) return false;
    if (/longrun|long run|backyard|loop|track|intervall|interval|schwelle|threshold|tempo|wettkampf|race/.test(label)) return false;
    return item.optional || /easy|locker|recovery|regeneration|grundlage/.test(label);
  });
  const protectedEntries = future.filter((item) => {
    const label = `${item.type || ""} ${item.title || ""}`.toLowerCase();
    return normalizedType(label) === "running"
      && (item.fixed || item.commitmentId || item.keySession || item.raceEvent
        || /longrun|long run|backyard|loop|track|intervall|interval|schwelle|threshold|tempo|wettkampf|race/.test(label));
  });
  return {
    impactLevel: summary?.impactLevel || "none",
    actionable: Array.isArray(summary?.actionable) ? summary.actionable : [],
    eligible,
    protectedEntries,
    hasEligible: eligible.length > 0,
    includesCurrentWeek: includeCurrentWeek,
  };
}

function recentReasonCounts(plan, weekStart) {
  const since = new Date(weekStart);
  since.setDate(since.getDate() - 21);
  return plan.reduce((result, item) => {
    const date = new Date(`${item.date || "1970-01-01"}T12:00:00`);
    if (date < since || date >= weekStart) return result;
    if (item.missedReason === "Müde") result.fatigue += 1;
    if (item.missedReason === "Schmerzen") result.pain += 1;
    if (item.missedReason === "Krankheit") result.illness += 1;
    return result;
  }, { fatigue: 0, pain: 0, illness: 0 });
}

export default function Planner() {
  const { state, setState, session, calendarToken } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const requestedWorkoutId = location.state?.workoutId;
  const [offsetWeeks, setOffsetWeeks] = useState(0);
  const [forecast, setForecast] = useState([]);
  const [status, setStatus] = useState("");
  const [workoutDetailId, setWorkoutDetailId] = useState(() => {
    const requestedWorkout = state.plan.find((item) => String(item.id) === String(requestedWorkoutId || ""));
    return requestedWorkout?.id || null;
  });
  const [editing, setEditing] = useState(null);
  const [missedEditing, setMissedEditing] = useState(null);
  const [planningOpen, setPlanningOpen] = useState(false);
  const [planningDraft, setPlanningDraft] = useState(null);
  const [planningMode, setPlanningMode] = useState("create");
  const [adjustmentOpen, setAdjustmentOpen] = useState(false);
  const [adjustmentDraft, setAdjustmentDraft] = useState(null);
  const [planningInfoOpen, setPlanningInfoOpen] = useState(false);
  const [crossTrainingPreviewOpen, setCrossTrainingPreviewOpen] = useState(false);
  const [pendingPlanChange, setPendingPlanChange] = useState(null);
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);
  const [plannerNow, setPlannerNow] = useState(() => new Date());
  const [availabilityEditing, setAvailabilityEditing] = useState(null);
  const [weeklyContextDraft, setWeeklyContextDraft] = useState(null);
  const [availabilityFocusId, setAvailabilityFocusId] = useState("");

  const weekStart = useMemo(() => startOfWeek(new Date(), offsetWeeks), [offsetWeeks]);
  const weekEnd = dateForDay(weekStart, 6);
  const planningDraftConstraints = useMemo(
    () => planningConstraintsFromNote(planningDraft?.checkin?.notes || "", weekStart),
    [planningDraft?.checkin?.notes, weekStart],
  );
  const planningDraftStructuredConstraints = useMemo(
    () => mergeAvailabilityExceptions(planningDraft?.weeklyContextExceptions, planningDraftConstraints),
    [planningDraft?.weeklyContextExceptions, planningDraftConstraints],
  );
  const weekMissionEvents = useMemo(() => missionEvents(state.mission).filter((event) => (
    event.date >= isoDate(weekStart) && event.date <= isoDate(weekEnd)
  )), [state.mission, weekStart, weekEnd]);
  const planningImpactLines = useMemo(() => {
    const lines = [];
    weekMissionEvents.forEach((event) => {
      const eventDate = new Date(`${event.date}T12:00:00`);
      if (Number.isNaN(eventDate.getTime())) return;
      const dayBefore = new Date(eventDate);
      dayBefore.setDate(dayBefore.getDate() - 1);
      const dayBeforeKey = isoDate(dayBefore);
      const blockedPreRace = planningDraftStructuredConstraints.find((entry) => entry.date === dayBeforeKey && (entry.status === "blocked" || entry.recoveryOnly || entry.noRunning || (Number(entry.maxDurationMinutes || 0) > 0 && Number(entry.maxDurationMinutes) < 30)));
      if (blockedPreRace) lines.push(`Der Tag direkt vor ${event.name || "dem Wettkampf"} ist eingeschränkt. Der Coach sucht den nächsten geeigneten Pre-Race-/Shake-out-Slot davor.`);
    });
    if (planningDraftStructuredConstraints.some((entry) => entry.status === "blocked")) lines.push("Komplett gesperrte Tage bleiben trainingsfrei; ausgefallene Kilometer werden nicht als Schuld auf andere Tage verschoben.");
    if (planningDraftStructuredConstraints.some((entry) => entry.recoveryOnly)) lines.push("Recovery-only-Tage bekommen höchstens eine kurze optionale Aktivierung – keine Qualität und keinen regulären Lauf.");
    return [...new Set(lines)];
  }, [planningDraftStructuredConstraints, weekMissionEvents]);
  const canonicalActivities = useMemo(() => preferredActivities(state.activities, { hideStrava: Boolean(state.intervals?.connected) }), [state.activities, state.intervals?.connected]);
  const groupedActivities = useMemo(() => activitiesWithGroups(canonicalActivities, state.activityGroups), [canonicalActivities, state.activityGroups]);
  const activityById = useMemo(() => new Map([...canonicalActivities, ...groupedActivities].map((activity) => [activity.id, activity])), [canonicalActivities, groupedActivities]);
  const weekPlan = useMemo(() => state.plan.filter((item) => {
    const value = item.date || "";
    return value >= isoDate(weekStart) && value <= isoDate(weekEnd) && !item.archived;
  }).sort((a, b) => `${a.date}${workoutSortTime(a)}${a.title || ""}`.localeCompare(`${b.date}${workoutSortTime(b)}${b.title || ""}`)), [state.plan, weekStart, weekEnd]);
  const weekEventSync = useMemo(() => plannerEventSyncStatus(weekMissionEvents, weekPlan), [weekMissionEvents, weekPlan]);
  const weekEventPlanNeedsRefresh = offsetWeeks >= 0 && weekPlan.length > 0 && !weekEventSync.upToDate;
  const fuelRecommendations = useMemo(() => new Map(
    weekPlan
      .filter(isFuelRelevantWorkout)
      .map((item) => [item.id, fuelRecommendationFromState(state, item, item.fuelMode)]),
  ), [state, weekPlan]);
  const mondayDate = isoDate(dateForDay(weekStart, 0));
  const wednesdayDate = isoDate(dateForDay(weekStart, 2));
  const saturdayDate = isoDate(dateForDay(weekStart, 5));
  const footballSlot = weekPlan.find((item) => isLiveAppointmentSlot(item, mondayDate, "football")) || null;
  const orcRunSlot = weekPlan.find((item) => isLiveAppointmentSlot(item, wednesdayDate, "orcRun")) || null;
  const footballMode = liveAppointmentMode(footballSlot, "football");
  const orcRunMode = liveAppointmentMode(orcRunSlot, "orcRun");
  const saturdaySlot = weekPlan.find((item) => isSaturdayPlannerSlot(item, saturdayDate)) || null;
  const saturdayPlanMode = saturdayModeOf(saturdaySlot);
  const weekActivities = useMemo(() => groupedActivities.filter((activity) => {
    const value = activityDate(activity);
    return value >= isoDate(weekStart) && value <= isoDate(weekEnd);
  }).sort((a, b) => String(a.startDateLocal || a.date).localeCompare(String(b.startDateLocal || b.date))), [groupedActivities, weekStart, weekEnd]);
  const matches = useMemo(() => findMatches(weekPlan, weekActivities), [weekPlan, weekActivities]);
  const closureOffset = planningClosureOffset(offsetWeeks, weekPlan.length > 0);
  const previousWeekClosure = useMemo(() => {
    if (closureOffset == null) return null;
    return weeklyClosureSummary({
      weekStart: startOfWeek(new Date(), closureOffset),
      plan: state.plan,
      activities: canonicalActivities,
      allActivities: state.activities,
      reviews: state.reviews,
      activityGroups: state.activityGroups,
    });
  }, [closureOffset, state.plan, state.activities, canonicalActivities, state.reviews, state.activityGroups]);
  const previousWeekReview = useMemo(() => {
    if (closureOffset == null || !previousWeekClosure?.ready) return null;
    return weeklyReviewSummary({
      weekStart: startOfWeek(new Date(), closureOffset),
      plan: state.plan,
      activities: groupedActivities,
      allActivities: state.activities,
      reviews: state.reviews,
    });
  }, [closureOffset, previousWeekClosure?.ready, state.plan, groupedActivities, state.activities, state.reviews]);
  const matchedActivityIds = useMemo(() => new Set([...matches.values()].map((activity) => activity.id)), [matches]);
  const todayKey = isoDate(new Date());
  const footballEditable = mondayDate >= todayKey && !footballSlot?.completed;
  const orcRunEditable = wednesdayDate >= todayKey && !orcRunSlot?.completed;
  const saturdayEditable = saturdayDate >= todayKey && !saturdaySlot?.completed;
  const missed = weekPlan.filter((item) => item.date < todayKey && !item.completed && !matches.has(item.id) && !item.missedReason);
  const actualRunningKm = weekActivities.filter(isRunningActivity).reduce((sum, activity) => sum + Number(activity.distance || 0), 0);
  const plannedKm = weekPlan
    .filter((item) => !item.completed && !item.missedReason && normalizedType(`${item.type || ""} ${item.title || ""}`) === "running")
    .reduce((sum, item) => sum + Number(item.distance || 0), 0);
  const completedKm = actualRunningKm || weekPlan
    .filter((item) => item.completed && normalizedType(`${item.type || ""} ${item.title || ""}`) === "running")
    .reduce((sum, item) => sum + Number(item.distance || 0), 0);
  const weekRunningKm = completedKm + plannedKm;
  const previousWeekHasPlan = useMemo(() => {
    const previousStart = startOfWeek(new Date(), offsetWeeks - 1);
    const previousEnd = dateForDay(previousStart, 6);
    return state.plan.some((item) => !item.archived && item.date >= isoDate(previousStart) && item.date <= isoDate(previousEnd));
  }, [state.plan, offsetWeeks]);
  const config = useMemo(() => state.planner || {}, [state.planner]);
  const availabilityExceptions = useMemo(
    () => normalizeAvailabilityExceptions(config.availabilityExceptions),
    [config.availabilityExceptions],
  );
  const weekAvailability = useMemo(() => new Map(
    availabilityExceptions
      .filter((entry) => entry.date >= isoDate(weekStart) && entry.date <= isoDate(weekEnd))
      .map((entry) => [entry.date, entry]),
  ), [availabilityExceptions, weekStart, weekEnd]);
  const plannedCrossTrainingActivityIds = useMemo(
    () => new Set([...matches.values()].map((activity) => String(activity?.id || "")).filter(Boolean)),
    [matches],
  );
  const crossTrainingSummary = useMemo(
    () => summarizeCrossTrainingCredits(weekActivities, {
      targetKm: Number(config.lastTarget || 0),
      allActivities: canonicalActivities,
      phaseLabel: config.lastPhase || "",
      recoveryWeek: Boolean(config.lastRecoveryWeek),
      reviews: state.reviews,
      plannedActivityIds: plannedCrossTrainingActivityIds,
    }),
    [weekActivities, canonicalActivities, config.lastTarget, config.lastPhase, config.lastRecoveryWeek, state.reviews, plannedCrossTrainingActivityIds],
  );
  const crossTrainingLabel = formatCrossTrainingCredit(crossTrainingSummary);
  const crossTrainingContextLabel = formatCrossTrainingContext(crossTrainingSummary);
  const missedSessionDecision = useMemo(
    () => buildMissedSessionDecision({
      plan: weekPlan,
      activities: canonicalActivities,
      planner: config,
      today: plannerNow,
    }),
    [weekPlan, canonicalActivities, config, plannerNow],
  );
  const lastGeneratedTimestamp = Date.parse(config.lastGeneratedAt || "") || 0;
  const crossTrainingNeedsReplan = offsetWeeks === 0
    && weekPlan.length > 0
    && crossTrainingSummary.latestActionableActivityAt > lastGeneratedTimestamp;
  const crossTrainingPreview = useMemo(() => crossTrainingReplanPreview(
    weekPlan,
    crossTrainingSummary,
    todayKey,
    offsetWeeks === 0,
  ), [weekPlan, crossTrainingSummary, todayKey, offsetWeeks]);
  const trackWorkoutTemplates = useMemo(
    () => normalizeTrackWorkoutTemplates(config.trackWorkoutTemplates),
    [config.trackWorkoutTemplates],
  );
  const unifiedCoach = useMemo(() => buildCoachState(state), [state]);
  const scienceAssessment = unifiedCoach.week;
  const goalProfile = useMemo(() => goalRequirements(state), [state]);
  const recurringCommitments = sortCommitments(
    Array.isArray(config.recurringCommitments)
      ? config.recurringCommitments.filter((entry) => entry.enabled !== false)
      : [],
  );
  const hasLegacyPersonalSlots = Boolean(
    config.fixedAppointments?.football
    || config.fixedAppointments?.orcRun
    || !["", "off"].includes(config.fixedAppointments?.saturdayMode || "off")
    || weekPlan.some((item) => ["football", "orcRun", "saturday"].includes(item.fixedSlot)),
  );
  const replacementOptions = useMemo(() => adjustmentReplacementOptions(config), [config]);
  const reasonCounts = useMemo(() => recentReasonCounts(state.plan, weekStart), [state.plan, weekStart]);
  const coachReviewReference = useMemo(() => {
    if (offsetWeeks !== 0) return weekStart;
    const reference = new Date(`${todayKey}T12:00:00`);
    reference.setDate(reference.getDate() + 1);
    return reference;
  }, [offsetWeeks, weekStart, todayKey]);
  const coachGuidance = useMemo(() => reviewGuidance(canonicalActivities, state.reviews, coachReviewReference), [canonicalActivities, state.reviews, coachReviewReference]);
  const futurePlan = useMemo(
    () => weekPlan.filter((item) => !item.completed && !item.missedReason && (offsetWeeks > 0 || item.date >= todayKey)),
    [weekPlan, offsetWeeks, todayKey],
  );
  const availabilityConflicts = useMemo(() => futurePlan
    .filter((item) => !item.raceEvent && weekAvailability.has(item.date))
    .map((item) => {
      const availability = weekAvailability.get(item.date) || {};
      const restriction = availability.status === "blocked"
        ? `Nicht verfügbar${availability.reason ? `: ${availability.reason}` : ""}`
        : availability.recoveryOnly
          ? `${availability.reason || "Eingeschränkt"} · nur Recovery${availability.maxDurationMinutes ? ` bis ${availability.maxDurationMinutes} min` : ""}`
          : availability.noRunning
            ? `${availability.reason || "Eingeschränkt"} · kein Lauf`
            : availability.maxDurationMinutes
              ? `${availability.reason || "Eingeschränkt"} · max. ${availability.maxDurationMinutes} min`
              : availability.reason || "Eingeschränkter Tag";
      return { item, availability, restriction };
    }), [futurePlan, weekAvailability]);
  const provisionalTrackPlan = useMemo(
    () => futurePlan.filter(isProvisionalTrackWorkout),
    [futurePlan],
  );
  const publishablePlan = useMemo(
    () => futurePlan.filter((item) => !isProvisionalTrackWorkout(item)),
    [futurePlan],
  );
  const weekKey = isoDate(weekStart);
  const weekPrescription = config.weekPrescriptions?.[weekKey] || null;
  const coachSuggestionDecisions = config.coachSuggestionDecisions || {};
  const coachSuggestionContext = {
    weekKey,
    recommendationId: unifiedCoach.recommendation.id,
  };
  const activeCoachSuggestions = visibleCoachSuggestions(
    scienceAssessment.candidates,
    coachSuggestionDecisions,
    coachSuggestionContext,
  );
  const loadRatio = Number(scienceAssessment.ratio || 1);
  const loadComparisonLabel = !scienceAssessment.hasBaseline
    ? "Vergleich noch offen"
    : loadRatio < 0.84
      ? "Bewusst reduziert"
      : loadRatio <= 1.12
        ? "Im üblichen Bereich"
        : "Erhöhte Belastung";
  const fixedSessionCount = weekPlan.filter((item) => !item.missedReason && (item.fixed || item.commitmentId)).length;
  const keySessionCount = weekPlan.filter((item) => !item.missedReason && (item.keySession || /orc\s*track|intervall|schwelle|longrun|loop-training|backyard/i.test(`${item.type || ""} ${item.title || ""}`))).length;
  const specificWeekEntry = weekPlan.find((item) => isLoopWorkout(item))
    || weekPlan.find((item) => /backyard-spezifisch|zielspezifisch|rundenroutine|pausenroutine/i.test(`${item.notes || ""} ${item.title || ""}`));
  const loopExplanation = config.lastLoopStrategy
    ? `${config.lastLoopStrategy.loops} × ${String(config.lastLoopStrategy.loopKm).replace(".", ",")} km sind als vollständiger Loop-Block eingeplant.`
    : config.lastLoopDecision?.reason
      || (specificWeekEntry
        ? `${specificWeekEntry.title} übernimmt diese Woche den zielspezifischen Dauerreiz. Ein vollständiger Loop-Block wird nicht in jede Woche gezwungen.`
        : "Diese Woche enthält keinen vollständigen Loop-Block; die Begründung wird nach der nächsten Planberechnung gespeichert.");
  const coachAlertCause = scienceAssessment.reasons.some((reason) => /review|müde|energie/i.test(reason))
    ? "aufgrund deiner aktuellen Reviews"
    : "aufgrund der aktuellen Wochenbelastung";
  const currentPlanFingerprint = useMemo(() => planPublicationFingerprint(publishablePlan), [publishablePlan]);
  const approvalFingerprint = useMemo(() => planPublicationFingerprint(weekPlan), [weekPlan]);
  const weekApprovals = config.weekApprovals || {};
  const weekApproval = weekApprovals[weekKey] || null;
  const storedWeekApprovalState = weekPlanApprovalStatus(weekApprovals, weekKey, approvalFingerprint);
  const weekApprovalState = weekEventPlanNeedsRefresh ? WEEK_APPROVAL_STATES.CHANGED : storedWeekApprovalState;
  const weekAccepted = weekApprovalState === WEEK_APPROVAL_STATES.ACCEPTED;
  const acceptedAtLabel = weekAccepted && weekApproval?.acceptedAt
    ? new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(weekApproval.acceptedAt))
    : "";
  const publishedWeek = config.intervalSync?.[weekKey] || null;
  const planChangedAfterPublish = Boolean(publishedWeek && publishedWeek.fingerprint !== currentPlanFingerprint);
  const garminChecksOpen = weekPlan.filter((item) => {
    if (!isTrackWorkout(item) || isProvisionalTrackWorkout(item) || item.completed || item.missedReason) return false;
    const fingerprint = workoutPublicationFingerprint(item);
    return String(item.intervalsPublishedFingerprint || "") === fingerprint
      && String(item.garminConfirmedFingerprint || "") !== fingerprint;
  });
  const lastPlanChange = config.lastPlanChange || null;
  const lastPlanChangeForWeek = lastPlanChange?.weekStart === weekKey ? lastPlanChange : null;
  const lastPlanChangeUndoable = Boolean(lastPlanChangeForWeek && canUndoPlanChange(weekPlan, lastPlanChangeForWeek));
  const adjustmentSelectedItems = adjustmentDraft?.selectedIds?.map((id) => weekPlan.find((item) => item.id === id)).filter(Boolean) || [];
  const adjustmentReplacementLabel = replacementLabelForAdjustment(adjustmentDraft, replacementOptions);
  const planningWeekPending = offsetWeeks >= 0 && weekPlan.length === 0;
  const planningWeekLocked = Boolean(planningWeekPending && previousWeekClosure && !previousWeekClosure.ready);
  const planningTargetLabel = offsetWeeks === 1 ? "Nächste Woche" : "Aktuelle Woche";
  const closurePeriodLabel = offsetWeeks === 1 ? "aktuelle Woche" : "Vorwoche";
  const isPastWeek = offsetWeeks < 0;
  const detailWorkout = workoutDetailId
    ? state.plan.find((item) => String(item.id) === String(workoutDetailId) && !item.archived) || null
    : null;
  const modalVisible = Boolean(detailWorkout || editing || missedEditing || availabilityEditing || planningOpen || adjustmentOpen || planningInfoOpen || crossTrainingPreviewOpen || pendingPlanChange || publishConfirmOpen);
  const editingTrackWorkout = editing && isTrackWorkout(editing)
    ? editing.structuredWorkout
    : null;
  const editingTrackDistance = editingTrackWorkout
    ? trackWorkoutDistance(editingTrackWorkout)
    : null;
  const editingLoopWorkout = editing && isLoopWorkout(editing)
    ? normalizeLoopWorkoutItem(editing)
    : null;
  const editingLoop = editingLoopWorkout?.loopTraining || null;
  const editingLoopPaceMode = editingLoop?.paceMode || LOOP_PACE_MODES.NONE;
  const editingSupportsPaceGuidance = Boolean(editing && supportsWorkoutPaceGuidance(editing));
  const editingCoachPaceGuidance = editingSupportsPaceGuidance
    ? coachPaceGuidance({ ...editing, paceGuidance: null })
    : null;
  const editingPaceMode = editing?.paceGuidance?.mode || editingCoachPaceGuidance?.mode || "none";
  const editingRecommendedFaster = editing?.paceGuidance?.recommendedFaster || editingCoachPaceGuidance?.faster || "";
  const editingRecommendedSlower = editing?.paceGuidance?.recommendedSlower || editingCoachPaceGuidance?.slower || "";

  useEffect(() => {
    if (!modalVisible) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [modalVisible]);

  useEffect(() => {
    const timer = window.setInterval(() => setPlannerNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const updates = [...matches.entries()].filter(([id, activity]) => {
      const item = state.plan.find((entry) => entry.id === id);
      return item && (!item.completed || item.matchedActivityId !== activity.id);
    });
    if (!updates.length) return;
    const byId = new Map(updates);
    setState((current) => ({
      ...current,
      plan: current.plan.map((item) => {
        const activity = byId.get(item.id);
        if (!activity) return item;
        return {
          ...item,
          completed: true,
          completedAt: activity.startDateLocal || activity.date,
          matchedActivityId: activity.id,
          actualTitle: activity.name || activity.title,
          actualDistance: Number(activity.distance || 0),
          actualDuration: Number(activity.duration || 0),
          actualSource: activity.source || "Garmin",
          missedReason: "",
        };
      }),
    }));
  }, [matches, setState, state.plan]);

  function patchConfig(patch) {
    setState((current) => ({ ...current, planner: { ...current.planner, ...patch } }));
  }

  function requestPlanning() {
    if (isPastWeek) return;
    if (weekPlan.length) {
      openAdjustment();
      return;
    }
    if (planningWeekLocked) {
      setStatus(`${planningTargetLabel} wird freigeschaltet, sobald alle tatsächlich erforderlichen Reviews vorliegen und offene Einheiten der ${closurePeriodLabel} geklärt sind.`);
      return;
    }
    openPlanning("create");
  }

  function openAdjustment(preselectedId = "", preferredAction = "replace", preferredReplacementKey = "", coachAlternative = null) {
    const adjustable = weekPlan.filter((item) => !item.completed && (!item.missedReason || item.plannedCancellation) && (offsetWeeks > 0 || item.date >= todayKey));
    const initialId = preselectedId || adjustable.find((item) => normalizedType(`${item.type} ${item.title}`) === "running")?.id || adjustable[0]?.id || "";
    const initial = adjustable.find((item) => item.id === initialId);
    const replacementKey = replacementOptions.some((entry) => entry.key === preferredReplacementKey)
      ? preferredReplacementKey
      : replacementOptions[0]?.key || "";
    setAdjustmentDraft({
      action: preferredAction,
      selectedIds: initialId ? [initialId] : [],
      replacementKey,
      moveDate: initial?.date || isoDate(weekStart),
      moveTime: initial?.time || "18:00",
      moveSpontaneous: initial ? isSpontaneousWorkout(initial) : true,
      cancelReason: initial?.missedReason || "Termin fiel aus",
      cancelNote: initial?.missedNote || "",
      blockDay: initial?.missedMeta?.blockDay
        ?? blocksTrainingDayByDefault(initial?.missedReason || "Termin fiel aus"),
      coachAlternative,
    });
    setAdjustmentOpen(true);
  }

  function openPlanning(mode = "create") {
    const lastCheckin = state.healthCheckins?.[0]?.checkin || config.checkin || {};
    const savedWeekNote = planningNoteForWeek(state.healthCheckins, weekStart, mode);
    setPlanningMode(mode);
    setWeeklyContextDraft(null);
    setPlanningDraft({
      stabiCount: Number(config.stabiCount ?? 2),
      stabiDays: Array.isArray(config.stabiDays) ? config.stabiDays : [],
      targetRunCount: Number(config.targetRunCount || state.profile?.selfReportedRunsPerWeek || 0),
      rowingCount: Number(config.rowingCount ?? 0),
      rowingDays: Array.isArray(config.rowingDays) ? config.rowingDays : [],
      rowingDistanceKm: Number(config.rowingDistanceKm ?? 5),
      rowingDuration: Number(config.rowingDuration ?? 35),
      rowingSpmMin: Number(config.rowingSpmMin ?? 24),
      rowingSpmMax: Number(config.rowingSpmMax ?? 26),
      runDays: Array.isArray(config.runDays) ? config.runDays : [],
      doubleTrainingDays: Array.isArray(config.doubleTrainingDays) ? config.doubleTrainingDays : [],
      weeklyContextExceptions: availabilityExceptionsForWeek(config.availabilityExceptions, weekStart, ["weekly-context"]),
      recurringCommitments: (config.recurringCommitments || []).map((entry) => ({ ...entry, activeThisWeek: entry.enabled !== false })),
      fixedAppointments: {
        football: config.fixedAppointments?.football !== false,
        orcRun: config.fixedAppointments?.orcRun !== false,
        saturdayMode: config.fixedAppointments?.saturdayMode || "open",
        extraOrcTrackDay: config.fixedAppointments?.extraOrcTrackDay || "",
      },
      checkin: {
        energy: Number(lastCheckin.energy || 4),
        fatigue: reasonCounts.fatigue ? "unchanged" : "none",
        fatigueCause: "",
        pain: reasonCounts.pain ? "unchanged" : "none",
        painLevel: Number(lastCheckin.painLevel || 0),
        painArea: lastCheckin.painArea || "",
        illness: reasonCounts.illness ? "recovering" : (lastCheckin.illness || "healthy"),
        notes: savedWeekNote,
      },
    });
    setPlanningOpen(true);
  }

  function acceptCurrentWeek() {
    if (weekEventPlanNeedsRefresh) {
      replanCurrentWeek();
      setStatus("Deine Mission enthält einen Wettkampf in dieser Woche, der im aktuellen Plan noch fehlt oder geändert wurde. Bitte die Woche zuerst auf den Wettkampf abstimmen.");
      return;
    }
    if (!weekPlan.length || !approvalFingerprint) return;
    const acceptedAt = new Date().toISOString();
    setState((current) => ({
      ...current,
      planner: {
        ...current.planner,
        weekApprovals: acceptWeekPlan(
          current.planner?.weekApprovals,
          weekKey,
          approvalFingerprint,
          acceptedAt,
        ),
        lastPlanChange: null,
      },
    }));
    setStatus("Wochenplan angenommen. Du kannst ihn jetzt an Garmin senden; spätere Änderungen müssen erneut bestätigt werden.");
  }

  function replanCurrentWeek() {
    openPlanning("replan");
    setStatus("Neuplanung geöffnet. Der bestehende Plan wird erst ersetzt, wenn du die Berechnung bestätigst.");
  }

  function toggleAdjustmentItem(id) {
    setAdjustmentDraft((current) => ({
      ...current,
      selectedIds: current.selectedIds.includes(id)
        ? current.selectedIds.filter((value) => value !== id)
        : [...current.selectedIds, id],
    }));
  }

  function replacementWorkout(item, option, coachAlternative = null) {
    if (!option) return item;
    const originalDistance = Number(item.distance || 0);
    const nextDistance = option.preserveDistance ? originalDistance : Number(option.distance || 0);
    const nextDuration = coachAlternative?.duration != null
      ? Number(coachAlternative.duration)
      : option.duration != null
        ? Number(option.duration)
        : Number(item.duration || 60);
    const title = coachAlternative?.title || (option.key === "preset:easy-run"
      ? `${nextDistance || originalDistance || 5} km locker`
      : coachAlternative?.label || option.title || option.label);
    const fixed = Boolean(option.commitmentId);
    const replaced = {
      ...item,
      title,
      type: option.type,
      distance: nextDistance,
      duration: nextDuration,
      optional: false,
      fixed,
      spontaneous: !fixed,
      time: fixed ? option.time || item.time || "18:00" : "",
      commitmentId: option.commitmentId || null,
      choicePending: false,
      choiceOptions: null,
      missedReason: "",
      missedNote: "",
      missedMeta: {},
      plannedCancellation: false,
      cancelledAt: null,
      intervalsPublishedAt: null,
      coachAlternative: null,
      replacedWorkout: { title: item.title, type: item.type, distance: originalDistance },
      notes: `Wochenanpassung: ${item.title} wurde durch ${title} ersetzt. Andere Einheiten an diesem Tag bleiben unverändert.`,
    };
    if (isTrackWorkout(replaced)) return { ...replaced, loopTraining: null, paceGuidance: null };
    if (isLoopWorkout(replaced)) return normalizeLoopWorkoutItem({ ...replaced, structuredWorkout: null, paceGuidance: null });
    const plain = { ...replaced, structuredWorkout: null, loopTraining: null, paceGuidance: null };
    return supportsWorkoutPaceGuidance(plain) ? prepareWorkoutPaceGuidance(plain) : plain;
  }

  function coachDecisionKey(candidate) {
    return coachSuggestionDecisionKey({ ...coachSuggestionContext, candidate });
  }

  function applyCoachSuggestion(candidate) {
    const option = replacementOptions.find((entry) => entry.key === candidate?.coachAlternative?.key);
    const item = weekPlan.find((entry) => entry.id === candidate?.id);
    if (!item || !option) return;
    const decisionKey = coachDecisionKey(candidate);
    setState((current) => ({
      ...current,
      plan: current.plan.map((entry) => entry.id === item.id
        ? replacementWorkout(entry, option, candidate.coachAlternative)
        : entry),
      planner: {
        ...current.planner,
        coachSuggestionDecisions: updateCoachSuggestionDecisions(
          current.planner?.coachSuggestionDecisions,
          decisionKey,
          "accepted",
        ),
      },
    }));
    setStatus(`Coach-Vorschlag übernommen: ${item.title} wurde durch ${candidate.coachAlternative.label} ersetzt. Der übrige Wochenplan blieb unverändert.`);
  }

  function rejectCoachSuggestion(candidate) {
    const decisionKey = coachDecisionKey(candidate);
    setState((current) => ({
      ...current,
      planner: {
        ...current.planner,
        coachSuggestionDecisions: updateCoachSuggestionDecisions(
          current.planner?.coachSuggestionDecisions,
          decisionKey,
          "rejected",
        ),
      },
    }));
    const nextCandidate = activeCoachSuggestions.find((entry) => entry.id !== candidate.id);
    setStatus(nextCandidate
      ? `Coach-Vorschlag für ${candidate.title} abgelehnt. Die Einheit bleibt unverändert; als Nächstes wird die flexible Alternative bei ${nextCandidate.title} angeboten.`
      : `Coach-Vorschlag für ${candidate.title} abgelehnt. Die Einheit bleibt unverändert; es gibt aktuell keinen weiteren sinnvollen Tausch.`);
  }

  function reconsiderCoachSuggestion(candidate) {
    const decisionKey = coachDecisionKey(candidate);
    setState((current) => ({
      ...current,
      planner: {
        ...current.planner,
        coachSuggestionDecisions: clearCoachSuggestionDecision(
          current.planner?.coachSuggestionDecisions,
          decisionKey,
        ),
      },
    }));
  }

  function applyUnitAdjustment(event) {
    event.preventDefault();
    if (!adjustmentDraft?.selectedIds?.length) return;
    const selected = new Set(adjustmentDraft.selectedIds);
    const option = replacementOptions.find((entry) => entry.key === adjustmentDraft.replacementKey);
    const cancelledAt = new Date().toISOString();
    setState((current) => ({
      ...current,
      plan: current.plan.map((item) => {
        if (!selected.has(item.id)) return item;
        if (adjustmentDraft.action === "cancel") {
          return {
            ...item,
            completed: false,
            matchedActivityId: null,
            missedReason: adjustmentDraft.cancelReason || "Termin fiel aus",
            missedNote: adjustmentDraft.cancelNote || "",
            missedMeta: {
              ...(item.missedMeta || {}),
              plannedCancellation: true,
              blockDay: Boolean(adjustmentDraft.blockDay),
            },
            plannedCancellation: true,
            cancelledAt,
            intervalsPublishedAt: null,
            coachAlternative: null,
          };
        }
        if (adjustmentDraft.action === "move") {
          const movedDate = new Date(`${adjustmentDraft.moveDate}T12:00:00`);
          const spontaneous = item.fixed || item.commitmentId ? false : Boolean(adjustmentDraft.moveSpontaneous);
          return {
            ...item,
            date: adjustmentDraft.moveDate,
            day: plannerDays[movedDate.getDay() === 0 ? 6 : movedDate.getDay() - 1],
            spontaneous,
            time: spontaneous ? "" : adjustmentDraft.moveTime || item.time || "18:00",
            missedReason: "",
            missedNote: "",
            missedMeta: {},
            plannedCancellation: false,
            cancelledAt: null,
            intervalsPublishedAt: null,
            coachAlternative: null,
          };
        }
        if (!option) return item;
        const selectedCoachAlternative = adjustmentDraft.coachAlternative?.key === option.key
          ? adjustmentDraft.coachAlternative
          : null;
        return replacementWorkout(item, option, selectedCoachAlternative);
      }),
    }));
    const actionLabel = adjustmentDraft.action === "cancel" ? "als ausgefallen markiert" : adjustmentDraft.action === "move" ? "verschoben" : "angepasst";
    setStatus(`${adjustmentDraft.selectedIds.length} Einheit${adjustmentDraft.selectedIds.length === 1 ? "" : "en"} ${actionLabel}. Der übrige Wochenplan blieb unverändert.`);
    setAdjustmentOpen(false);
  }

  function restoreCancelledWorkout(item) {
    updateWorkout(item.id, {
      missedReason: "",
      missedNote: "",
      missedMeta: {},
      plannedCancellation: false,
      cancelledAt: null,
      intervalsPublishedAt: null,
    });
    setStatus(`${item.title} ist wieder als offene Einheit eingeplant.`);
  }

  function applyMissedLongRunExtension() {
    if (!missedSessionDecision?.canApply) return;
    const longRun = weekPlan.find((item) => item.id === missedSessionDecision.longRunId);
    if (!longRun) return;
    const adjusted = applyOptionalLongRunExtension(longRun, missedSessionDecision);
    updateWorkout(longRun.id, adjusted);
    setStatus(`Longrun optional um ${missedSessionDecision.extraMinutes} ruhige Minuten ergänzt. Die ausgefallene Einheit wird nicht vollständig nachgeholt.`);
  }

  function toggleDay(field, day) {
    setPlanningDraft((current) => ({
      ...current,
      [field]: current[field].includes(day)
        ? current[field].filter((value) => value !== day)
        : [...current[field], day],
    }));
  }

  function updateCheckin(field, value) {
    setPlanningDraft((current) => ({ ...current, checkin: { ...current.checkin, [field]: value } }));
  }

  function openWeeklyContext(contextKey) {
    const preset = weeklyContextPreset(contextKey);
    setWeeklyContextDraft({
      contextKey: preset.key,
      days: [],
      restriction: preset.defaultRestriction,
      maxDurationMinutes: preset.defaultMinutes || 20,
      note: "",
    });
  }

  function toggleWeeklyContextDay(day) {
    setWeeklyContextDraft((current) => current ? {
      ...current,
      days: current.days.includes(day)
        ? current.days.filter((value) => value !== day)
        : [...current.days, day],
    } : current);
  }

  function saveWeeklyContext() {
    if (!weeklyContextDraft?.days?.length) return;
    const additions = weeklyContextDraft.days.map((day) => {
      const index = plannerDays.indexOf(day);
      const date = isoDate(dateForDay(weekStart, index));
      return weeklyContextException({
        date,
        contextKey: weeklyContextDraft.contextKey,
        restriction: weeklyContextDraft.restriction,
        maxDurationMinutes: weeklyContextDraft.maxDurationMinutes,
        note: weeklyContextDraft.note,
      });
    });
    setPlanningDraft((current) => ({
      ...current,
      weeklyContextExceptions: mergeAvailabilityExceptions(current.weeklyContextExceptions, additions),
    }));
    setWeeklyContextDraft(null);
  }

  function removeWeeklyContext(date) {
    setPlanningDraft((current) => ({
      ...current,
      weeklyContextExceptions: (current.weeklyContextExceptions || []).filter((entry) => entry.date !== date),
    }));
  }


  function commitPlanningNumber(field, minimum, maximum, fallback) {
    setPlanningDraft((current) => {
      const raw = current?.[field];
      const parsed = raw === "" || raw == null ? Number.NaN : Number(raw);
      const value = Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
      return { ...current, [field]: value };
    });
  }

  function updateWeeklyCommitment(id, activeThisWeek) {
    setPlanningDraft((current) => ({
      ...current,
      recurringCommitments: current.recurringCommitments.map((entry) => entry.id === id ? { ...entry, activeThisWeek } : entry),
    }));
  }

  function setLiveAppointmentMode(key, mode) {
    const isFootball = key === "football";
    const date = isFootball ? mondayDate : wednesdayDate;
    const day = isFootball ? "Montag" : "Mittwoch";
    const existing = isFootball ? footballSlot : orcRunSlot;
    const editable = isFootball ? footballEditable : orcRunEditable;
    if (!editable) return;

    const target = Math.max(24, Number(config.lastTarget || 45));
    const baseDistance = Math.max(5, Number(existing?.baseDistance || existing?.distance || (isFootball ? Math.min(9, Math.max(6, Math.round(target * 0.16))) : Math.min(10, Math.max(6, Math.round(target * 0.18))))));
    const cautious = !coachGuidance.hardAllowed || Boolean(config.lastRecoveryWeek);
    const common = {
      id: existing?.id || crypto.randomUUID(),
      date,
      day,
      time: existing?.time || (isFootball ? config.footballTime || "19:00" : config.orcTime || "19:00"),
      completed: false,
      source: "planner-engine",
      archived: false,
      optional: false,
      fixedSlot: key,
      baseDistance,
      intervalsPublishedAt: null,
    };

    let next;
    if (mode === "fixed") {
      next = isFootball ? {
        ...common,
        title: "Fußball",
        type: "Fußball",
        distance: 0,
        duration: 90,
        fixed: true,
        spontaneous: false,
        notes: "Bestätigter Fixtermin. Wird als intensive Belastung berücksichtigt, aber nicht als Laufkilometer.",
      } : {
        ...common,
        title: "ORC Run",
        type: "ORC Run",
        distance: baseDistance,
        duration: Math.round(baseDistance * 6.2),
        fixed: true,
        spontaneous: false,
        notes: "Bestätigter Gruppenlauf. Intensität kontrolliert und passend zur Gesamtwoche halten.",
      };
    } else if (mode === "replacement") {
      const replacementDistance = cautious ? Math.min(6, baseDistance) : baseDistance;
      next = {
        ...common,
        title: cautious
          ? `${replacementDistance} km Recovery`
          : isFootball
            ? `${replacementDistance} km locker + 6 Steigerungen`
            : `${replacementDistance} km locker`,
        type: "Easy Run",
        distance: replacementDistance,
        duration: Math.round(replacementDistance * (cautious ? 7 : 6.3)),
        fixed: false,
        spontaneous: true,
        time: "",
        replacementFor: key,
        notes: cautious
          ? "Intelligenter Ersatz: Die Reviews zeigen aktuell ein Belastungssignal. Nur locker laufen und bei schweren Beinen kürzen."
          : isFootball
            ? "Intelligenter Ersatz für das ausgefallene Fußballtraining: locker laufen, am Ende 6 kurze saubere Steigerungen mit vollständiger Erholung."
            : "Intelligenter Ersatz für den ausgefallenen ORC Run: kontrollierter lockerer Dauerlauf ohne zusätzlichen Qualitätsreiz.",
      };
    } else {
      next = {
        ...common,
        title: "Erholungstag",
        type: "Ruhetag",
        distance: 0,
        duration: 0,
        fixed: false,
        spontaneous: true,
        time: "",
        restFor: key,
        notes: isFootball
          ? "Fußball ist abgesagt. Der Coach nutzt den Tag bewusst zur Erholung; keine Einheit muss nachgeholt werden."
          : "ORC Run findet nicht statt. Der Coach nutzt den Tag bewusst zur Erholung.",
      };
    }

    setState((current) => ({
      ...current,
      plan: [
        ...current.plan.filter((item) => !isLiveAppointmentSlot(item, date, key)),
        next,
      ],
      planner: {
        ...current.planner,
        fixedAppointments: {
          ...(current.planner?.fixedAppointments || {}),
          [key]: mode === "fixed",
        },
      },
    }));

    const label = isFootball ? "Fußball" : "ORC Run";
    setStatus(mode === "fixed"
      ? `${label} ist wieder als Fixtermin eingeplant.`
      : mode === "replacement"
        ? `${label} wurde durch eine coachbasierte Alternative ersetzt.`
        : `${label} wurde entfernt. Der Tag ist jetzt als Erholungstag markiert.`);
  }

  function setSaturdayPlanMode(mode) {
    if (!saturdayEditable) return;
    const existing = saturdaySlot;
    const distance = Math.max(5, Number(existing?.baseDistance || existing?.distance || Math.min(10, Math.max(6, Math.round(Number(config.lastTarget || 45) * 0.13)))));
    const common = {
      id: existing?.id || crypto.randomUUID(),
      date: saturdayDate,
      day: "Samstag",
      time: existing?.time || config.orcTrackTime || "09:00",
      distance,
      duration: existing?.duration || Math.round(distance * 6.4),
      completed: false,
      source: "planner-engine",
      archived: false,
      optional: false,
      saturdaySlot: true,
      baseDistance: distance,
      intervalsPublishedAt: null,
    };
    let next = null;
    if (mode === "open") {
      next = {
        ...common,
        title: `ORC Track oder ${distance} km locker`,
        type: "Samstagsoption",
        fixed: false,
        spontaneous: true,
        time: "",
        saturdayMode: "open",
        choicePending: true,
        selectedChoice: null,
        notes: "Entscheidung meist am Freitag: ORC Track wählen oder denselben Umfang locker als Alternativlauf absolvieren.",
        choiceOptions: {
          orc: { title: "ORC Track", type: "ORC Track", fixed: true },
          alternative: { title: `${distance} km locker`, type: "Easy Run", fixed: false },
        },
      };
    } else if (mode === "orc") {
      next = {
        ...common,
        title: "ORC Track",
        type: "ORC Track",
        fixed: true,
        spontaneous: false,
        time: config.orcTrackTime || existing?.time || "09:00",
        saturdayMode: "orc",
        choicePending: false,
        selectedChoice: "orc",
        choiceOptions: null,
        notes: "Samstagsentscheidung: ORC Track findet statt. Intensität kontrolliert halten.",
      };
    } else if (mode === "alternative") {
      next = {
        ...common,
        title: `${distance} km locker`,
        type: "Easy Run",
        fixed: false,
        spontaneous: true,
        time: "",
        saturdayMode: "alternative",
        choicePending: false,
        selectedChoice: "alternative",
        choiceOptions: null,
        notes: "Samstagsentscheidung: lockerer Alternativlauf statt ORC Track.",
      };
    }

    setState((current) => ({
      ...current,
      plan: [
        ...current.plan.filter((item) => !isSaturdayPlannerSlot(item, saturdayDate)),
        ...(next ? [next] : []),
      ],
      planner: {
        ...current.planner,
        fixedAppointments: {
          ...(current.planner?.fixedAppointments || {}),
          saturdayMode: mode,
        },
      },
    }));
    setStatus(mode === "orc"
      ? "Samstag wurde auf ORC Track gesetzt."
      : mode === "alternative"
        ? `ORC Track wurde entfernt. Samstag ist jetzt ein lockerer Alternativlauf über ${distance} km.`
        : mode === "open"
          ? "Samstag bleibt offen: ORC Track oder Alternativlauf."
          : "Die Laufoption am Samstag wurde aus dem Wochenplan entfernt.");
  }

  function editCommitmentThisWeek(commitment, date, slot, replacementCandidate) {
    if (slot) {
      if (isTrackWorkout(slot)) {
        setEditing(prepareWorkoutForEditing(slot));
        return;
      }
      openAdjustment(slot.id);
      return;
    }
    if (replacementCandidate) {
      openAdjustment(replacementCandidate.id, "replace", `commitment:${commitment.id}`);
      setStatus(`${commitment.name} ist als gezielter Ersatz vorausgewählt. Geändert wird erst nach deiner Bestätigung; der übrige Wochenplan bleibt unverändert.`);
      return;
    }
    setEditing(prepareWorkoutForEditing(buildCommitmentPlanEntry(commitment, date, crypto.randomUUID())));
    setStatus(`${commitment.name} ist noch nicht in dieser Woche eingeplant und kann jetzt ergänzt werden.`);
  }

  function skipCommitmentThisWeek(item, commitment, date) {
    if (item) {
      openAdjustment(item.id, "cancel");
    } else {
      const cancelledAt = new Date().toISOString();
      const placeholder = buildCancelledCommitmentPlanEntry(commitment, date, crypto.randomUUID(), cancelledAt);
      setState((current) => ({ ...current, plan: [...current.plan, placeholder] }));
    }
    setStatus(`${commitment.name} wird nur für diese Woche ausgesetzt. Die feste Konfiguration bleibt erhalten.`);
  }

  function resolveSaturdayChoice(_item, choice) {
    setSaturdayPlanMode(choice === "orc" ? "orc" : "alternative");
  }

  async function generate(overrideConfig = null) {
    setStatus("Plane Woche aus Mission, Trainingshistorie und Check-in …");
    let weather = forecast;
    try {
      if (!weather.length) {
        const position = await getCurrentPosition(session?.user?.id);
        weather = await fetchWeeklyForecast(position.latitude, position.longitude, weekStart);
        setForecast(weather);
      }
    } catch {
      setStatus("Standort/Wetter nicht verfügbar – Plan wird ohne Wetteranpassung erstellt.");
    }

    const requestedDates = Array.isArray(overrideConfig?.adjustDates) ? overrideConfig.adjustDates : [];
    const draftCommitments = Array.isArray(overrideConfig?.recurringCommitments)
      ? overrideConfig.recurringCommitments.map(({ activeThisWeek, ...entry }) => ({ ...entry, enabled: activeThisWeek !== false }))
      : config.recurringCommitments;
    const overridePlanner = { ...(overrideConfig || {}) };
    delete overridePlanner.adjustDates;
    delete overridePlanner.recurringCommitments;
    const effectiveConfig = applyWeeklyPlanningContext(
      config,
      { ...overridePlanner, recurringCommitments: draftCommitments },
      weekStart,
    );
    let generated = generateWeekPlan({
      activities: canonicalActivities,
      activityGroups: state.activityGroups,
      reviews: state.reviews,
      planHistory: state.plan,
      mission: state.mission,
      profile: state.profile,
      config: effectiveConfig,
      raceCoachSessions: state.raceCoachSessions,
      forecast: weather,
      offsetWeeks,
      completedRunningKm: actualRunningKm,
      completedCrossTrainingKm: 0,
      crossTrainingDetails: crossTrainingSummary.details,
    });
    const generatedMissionEvents = missionEvents(state.mission);
    generated = {
      ...generated,
      plan: generated.plan.map((entry) => {
        if (!entry.raceEvent) return entry;
        const event = raceEventFromPlanItem(entry, generatedMissionEvents);
        return { ...entry, raceProtocol: buildRaceProtocolForState(state, event, null, effectiveConfig.availabilityExceptions) };
      }),
    };

    if (generated.planningConstraintViolations?.length) {
      const first = generated.planningConstraintViolations[0];
      setStatus(`Plan nicht freigegeben: ${planChangeDateLabel(first.date)} verletzt deine Wochenangabe (${first.message}). Bitte Vorschau erneut berechnen.`);
      return;
    }

    const checkinRecord = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      weekStart: generated.weekStart,
      checkin: effectiveConfig.checkin,
    };
    setState((current) => ({
      ...current,
      healthCheckins: upsertPlanningCheckinRecord(current.healthCheckins, checkinRecord),
    }));

    const loadLabel = generated.weekPrescription?.weekType?.label
      || (generated.eventWeek
        ? `${generated.eventWeek.label} · ${generated.eventWeek.protectionText}`
        : generated.recoveryWeek
          ? "Entlastungswoche"
          : `Aufbauwoche ${generated.cycleWeek}/3`);
    const readinessNotes = generated.readiness.notes.length ? ` ${generated.readiness.notes.join(" ")}` : "";
    const targetLabel = generated.planningTarget?.name
      ? ` · Fokus ${generated.planningTarget.name}${generated.planningTarget.targetPaceLabel ? ` (${generated.planningTarget.targetPaceLabel})` : ""}`
      : "";
    const loopLabel = generated.loopStrategy ? ` · Loop-Block ${generated.loopStrategy.loops} × ${String(generated.loopStrategy.loopKm).replace(".", ",")} km` : "";
    const scopeLabel = requestedDates.length ? `Ausgewählte Tage (${requestedDates.length}) neu geplant. ` : "";
    const crossTrainingImpact = generated.crossTrainingCredit?.impactLevel || "none";
    const crossTrainingDetailCount = generated.crossTrainingCredit?.details?.length || 0;
    const crossTrainingStatus = crossTrainingImpact === "adjust"
      ? " Dein Review zur Zusatzbelastung hat eine konservative Anpassung einer flexiblen Folgeeinheit ausgelöst; es wurden keine Fremdsport-Kilometer verrechnet."
      : crossTrainingImpact === "review"
        ? " Eine ungewöhnliche Zusatzbelastung ist erkannt. Vor einer Planänderung wartet der Coach auf dein Review."
        : crossTrainingImpact === "watch"
          ? " Die Zusatzbelastung war auffällig, wird laut Review aber aktuell stabil verarbeitet; der Laufumfang bleibt bestehen."
          : crossTrainingDetailCount > 0
            ? " Zusatzsport wird als Gesamtbelastung berücksichtigt und bleibt getrennt von echten Laufkilometern."
            : "";
    const corridorLabel = generated.weekPrescription?.corridor?.label || `${generated.target} km`;
    const statusText = `${scopeLabel}${loadLabel}${targetLabel} · automatisch berechneter Laufkorridor ${corridorLabel} · konkreter Planwert ${generated.target} km${loopLabel}. Bereits gelaufen: ${actualRunningKm.toFixed(1)} km.${crossTrainingStatus} ${generated.weekPrescription?.focus || generated.recoveryReason}${readinessNotes} Der neue Wochenplan ist noch nicht angenommen.`;
    const previewWeekStart = isoDate(weekStart);
    const previewWeekEnd = isoDate(weekEnd);
    const beforeEntries = planEntriesForWeek(state.plan, previewWeekStart, previewWeekEnd);
    const nextPlan = mergeGeneratedWeekPlan(state.plan, generated.plan, {
      weekStart: previewWeekStart,
      weekEnd: previewWeekEnd,
      requestedDates,
      offsetWeeks,
      todayKey,
    });
    const afterEntries = planEntriesForWeek(nextPlan, previewWeekStart, previewWeekEnd);
    const previewConstraintViolations = planningConstraintViolations(afterEntries, effectiveConfig.availabilityExceptions);
    if (previewConstraintViolations.length) {
      const first = previewConstraintViolations[0];
      setStatus(`Planvorschau gestoppt: ${planChangeDateLabel(first.date)} verletzt deine Wochenangabe (${first.message}). Eine bestehende oder geschützte Einheit muss dort zuerst angepasst werden.`);
      return;
    }

    setPendingPlanChange({
      mode: planningMode,
      generated,
      effectiveConfig,
      requestedDates,
      checkinRecord,
      weekStart: previewWeekStart,
      weekEnd: previewWeekEnd,
      offsetWeeks,
      todayKey,
      beforeFingerprint: planChangeFingerprint(beforeEntries),
      preview: buildPlanChangePreview(beforeEntries, afterEntries),
      statusText,
    });
    setStatus("Planvorschau berechnet. Noch wurde keine Einheit verändert.");
    setPlanningOpen(false);
  }

  function applyPendingPlanChange() {
    if (!pendingPlanChange) return;
    const currentEntries = planEntriesForWeek(state.plan, pendingPlanChange.weekStart, pendingPlanChange.weekEnd);
    if (planChangeFingerprint(currentEntries) !== pendingPlanChange.beforeFingerprint) {
      setPendingPlanChange(null);
      setStatus("Der Wochenplan wurde während der Vorschau verändert. Bitte die Neuplanung erneut berechnen.");
      return;
    }

    const appliedAt = new Date().toISOString();
    setState((current) => {
      const beforeEntries = planEntriesForWeek(current.plan, pendingPlanChange.weekStart, pendingPlanChange.weekEnd);
      if (planChangeFingerprint(beforeEntries) !== pendingPlanChange.beforeFingerprint) return current;

      const nextPlan = mergeGeneratedWeekPlan(current.plan, pendingPlanChange.generated.plan, {
        weekStart: pendingPlanChange.weekStart,
        weekEnd: pendingPlanChange.weekEnd,
        requestedDates: pendingPlanChange.requestedDates,
        offsetWeeks: pendingPlanChange.offsetWeeks,
        todayKey: pendingPlanChange.todayKey,
      });
      const afterEntries = planEntriesForWeek(nextPlan, pendingPlanChange.weekStart, pendingPlanChange.weekEnd);
      const plannerKeys = [
        ...Object.keys(pendingPlanChange.effectiveConfig || {}).filter((key) => !["recurringCommitments", "lastPlanChange"].includes(key)),
        ...generatedPlannerKeys,
      ];
      const snapshot = {
        id: crypto.randomUUID(),
        createdAt: appliedAt,
        weekStart: pendingPlanChange.weekStart,
        weekEnd: pendingPlanChange.weekEnd,
        reason: pendingPlanChange.mode === "replan" ? "Wochenplan neu berechnet" : "Wochenplan berechnet",
        beforeEntries,
        afterFingerprint: planChangeFingerprint(afterEntries),
        plannerSnapshot: plannerValueSnapshot(current.planner || {}, plannerKeys),
        checkinRecordId: pendingPlanChange.checkinRecord.id,
      };
      const generated = pendingPlanChange.generated;

      return {
        ...current,
        plan: nextPlan,
        healthCheckins: upsertPlanningCheckinRecord(current.healthCheckins, pendingPlanChange.checkinRecord),
        planner: {
          ...current.planner,
          ...pendingPlanChange.effectiveConfig,
          recurringCommitments: current.planner?.recurringCommitments || [],
          lastGeneratedAt: appliedAt,
          lastTarget: generated.target,
          lastPhase: generated.phase.label,
          lastCycleWeek: generated.cycleWeek,
          lastRecoveryWeek: generated.recoveryWeek,
          lastPlanningTarget: generated.planningTarget || null,
          lastGoalProfile: generated.goalProfile || null,
          lastLoopStrategy: generated.loopStrategy || null,
          lastLoopDecision: generated.loopDecision || null,
          lastRecoveryReason: generated.recoveryReason || "",
          lastReadiness: generated.readiness || null,
          lastEventWeek: generated.eventWeek || null,
          weekPrescriptions: {
            ...(current.planner?.weekPrescriptions || {}),
            [generated.weekStart]: generated.weekPrescription || null,
          },
          crossTrainingCredits: {
            ...(current.planner?.crossTrainingCredits || {}),
            [generated.weekStart]: generated.crossTrainingCredit || null,
          },
          weekApprovals: pendingPlanChange.preview.hasChanges
            ? invalidateWeekPlanApproval(current.planner?.weekApprovals, weekKey)
            : current.planner?.weekApprovals,
          lastPlanChange: pendingPlanChange.preview.hasChanges ? snapshot : null,
        },
      };
    });

    setStatus(pendingPlanChange.statusText);
    setPendingPlanChange(null);
    setPlanningMode("create");
  }

  function undoLastPlanChange() {
    const snapshot = state.planner?.lastPlanChange;
    const currentEntries = snapshot
      ? planEntriesForWeek(state.plan, snapshot.weekStart, snapshot.weekEnd)
      : [];
    if (!snapshot || !canUndoPlanChange(currentEntries, snapshot)) {
      setStatus("Rückgängig ist nicht mehr möglich, weil der Wochenplan danach bereits weiter verändert wurde.");
      return;
    }

    setState((current) => {
      const liveEntries = planEntriesForWeek(current.plan, snapshot.weekStart, snapshot.weekEnd);
      if (!canUndoPlanChange(liveEntries, snapshot)) return current;
      return {
        ...current,
        plan: restorePlanFromSnapshot(current.plan, snapshot),
        healthCheckins: (current.healthCheckins || []).filter((item) => item.id !== snapshot.checkinRecordId),
        planner: restorePlannerValues(current.planner || {}, snapshot.plannerSnapshot),
      };
    });
    setStatus("Die letzte Coach-Neuplanung wurde vollständig rückgängig gemacht.");
  }

  async function publishWeek() {
    setPublishBusy(true);
    setStatus("Übertrage den bestätigten Wochenplan an Intervals.icu …");
    try {
      const result = await publishIntervalsWeek({
        weekStart: isoDate(weekStart),
        weekEnd: isoDate(weekEnd),
        plan: publishablePlan,
        forceGarminRefresh: Boolean(publishedWeek),
      });
      const publishedAt = result.publishedAt || new Date().toISOString();
      setState((current) => ({
        ...current,
        plan: current.plan.map((item) => {
          const publishedItem = publishablePlan.find((entry) => entry.id === item.id);
          if (publishedItem) {
            return {
              ...item,
              intervalsPublishedAt: publishedAt,
              intervalsPublishedFingerprint: workoutPublicationFingerprint(publishedItem),
            };
          }
          if (item.date >= isoDate(weekStart) && item.date <= isoDate(weekEnd) && isProvisionalTrackWorkout(item)) {
            return {
              ...item,
              intervalsPublishedAt: null,
              intervalsPublishedFingerprint: null,
            };
          }
          return item;
        }),
        planner: {
          ...current.planner,
          intervalSync: {
            ...(current.planner?.intervalSync || {}),
            [weekKey]: {
              publishedAt,
              fingerprint: currentPlanFingerprint,
              uploaded: Number(result.uploaded || publishablePlan.length),
              guided: Number(result.guided || 0),
              notes: Number(result.notes || 0),
              refreshed: Number(result.refreshed || 0),
            },
          },
        },
      }));
      const refreshed = Number(result.refreshed || 0);
      setStatus(`${Number(result.uploaded || publishablePlan.length)} Einheiten von Intervals.icu übernommen · ${Number(result.guided || 0)} strukturierte Workouts.${refreshed ? ` ${refreshed} Workout${refreshed === 1 ? " wurde" : "s wurden"} dafür in Intervals.icu bewusst neu angelegt, damit der Garmin-Export erneut ausgelöst wird.` : ""} Wichtig: EI kann nicht prüfen, ob Garmin Connect sie schon auf die Uhr übertragen hat. Bitte Garmin synchronisieren und die wichtigen Workouts einmal auf der Uhr öffnen.${provisionalTrackPlan.length ? ` ${provisionalTrackPlan.length} vorläufige Track-Einheit${provisionalTrackPlan.length === 1 ? "" : "en"} blieb${provisionalTrackPlan.length === 1 ? "" : "en"} nur im Wochenplan.` : ""}`);
      setPublishConfirmOpen(false);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setPublishBusy(false);
    }
  }

  function requestPublish() {
    if (weekEventPlanNeedsRefresh) {
      setStatus("Der Wochenplan ist gegenüber deiner Mission veraltet. Bitte den Wettkampf zuerst über „Woche auf Wettkampf abstimmen“ einplanen, bevor Intervals/Garmin aktualisiert wird.");
      return;
    }
    if (!weekAccepted) {
      setStatus("Bitte den Wochenplan zuerst annehmen. So landet kein ungeprüfter Entwurf auf Garmin.");
      return;
    }
    if (!state.intervals?.connected) {
      setStatus("Intervals.icu ist noch nicht verbunden. Bitte zuerst unter Einstellungen die Verbindung prüfen.");
      return;
    }
    setPublishConfirmOpen(true);
  }

  function confirmTrackOnGarmin(item) {
    const fingerprint = workoutPublicationFingerprint(item);
    setState((current) => ({
      ...current,
      plan: current.plan.map((entry) => entry.id === item.id ? {
        ...entry,
        garminConfirmedAt: new Date().toISOString(),
        garminConfirmedFingerprint: fingerprint,
      } : entry),
    }));
    setStatus(`${item.title}: auf der Garmin-Uhr bestätigt.`);
  }

  function saveWorkout(event) {
    event.preventDefault();
    if (!editing?.title.trim()) return;
    const preparedEditing = isLoopWorkout(editing) ? normalizeLoopWorkoutItem(editing) : editing;
    const date = new Date(`${preparedEditing.date}T12:00:00`);
    const weatherForecast = forecast.find((day) => day.date === preparedEditing.date)
      || (preparedEditing.weatherForecast?.date === preparedEditing.date ? preparedEditing.weatherForecast : null);
    const next = normalizeWorkoutTiming({
      ...preparedEditing,
      day: new Intl.DateTimeFormat("de-DE", { weekday: "long" }).format(date),
      distance: Number(preparedEditing.distance || 0),
      duration: Number(preparedEditing.duration || 60),
      title: preparedEditing.title.trim(),
      structuredWorkout: isTrackWorkout(preparedEditing)
        ? normalizeTrackWorkout(preparedEditing.structuredWorkout)
        : null,
      paceGuidance: normalizeWorkoutPaceGuidance(preparedEditing),
      weatherForecast,
    });
    if (next.paceGuidance?.mode === "range") {
      next.duration = paceRangeDurationMinutes(next.distance, next.paceGuidance) || next.duration;
    }
    const existingItem = weekPlan.find((item) => item.id === next.id) || null;
    const publicationChanged = !existingItem
      || workoutPublicationFingerprint(existingItem) !== workoutPublicationFingerprint(next);
    setState((current) => ({
      ...current,
      plan: current.plan.some((item) => item.id === next.id)
        ? current.plan.map((item) => item.id === next.id ? next : item)
        : [...current.plan, next],
    }));
    if (isProvisionalTrackWorkout(next)) {
      setStatus("Track-Workout vorläufig gespeichert. Es bleibt nur im Wochenplan und wird nicht an Intervals.icu oder Garmin gesendet.");
    } else if (isTrackWorkout(next)) {
      if (!publicationChanged && existingItem) {
        const existingStatus = trackPublicationStatus({
          item: existingItem,
          approvalState: weekApprovalState,
          publishedWeekCurrent: Boolean(publishedWeek && !planChangedAfterPublish),
          weekWasPublished: Boolean(publishedWeek),
        });
        setStatus(`Track-Workout unverändert gespeichert. Übertragungsstatus: ${existingStatus?.label || "wird geprüft"}.`);
      } else {
        const approvalAction = weekApproval ? "„Erneut annehmen“" : "„Plan annehmen“";
        const publishAction = publishedWeek ? "„Garmin aktualisieren“" : "„An Garmin senden“";
        setStatus(`Track-Workout final gespeichert – noch nicht übertragen. Bitte jetzt ${approvalAction} und danach ${publishAction} drücken.`);
      }
    }
    setEditing(null);
  }

  function updateWorkout(id, patch) {
    setState((current) => ({ ...current, plan: current.plan.map((item) => item.id === id ? { ...item, ...patch } : item) }));
  }

  function updateRaceProtocol(item, patch) {
    if (!item?.raceEvent) return;
    setState((current) => {
      const event = raceEventFromPlanItem(item, missionEvents(current.mission));
      const sessionKey = raceProtocolSessionKey(event);
      if (!sessionKey) return current;
      const currentSettings = raceProtocolSettingsFromSessions(current.raceCoachSessions, event);
      const nextSettings = normalizeRaceProtocolSettings({
        ...currentSettings,
        ...patch,
        components: {
          ...currentSettings.components,
          ...(patch.components || {}),
        },
      });
      const protocol = buildRaceProtocolForState(current, event, nextSettings);
      return {
        ...current,
        raceCoachSessions: {
          ...(current.raceCoachSessions || {}),
          [sessionKey]: {
            ...(current.raceCoachSessions?.[sessionKey] || {}),
            setup: {
              ...(current.raceCoachSessions?.[sessionKey]?.setup || {}),
              raceProtocol: nextSettings,
            },
            updatedAt: new Date().toISOString(),
          },
        },
        plan: current.plan.map((entry) => entry.id === item.id ? { ...entry, raceProtocol: protocol } : entry),
      };
    });
  }

  function removeManualWorkout(item) {
    if (!item || item.source !== "manual") return;
    if (!window.confirm(`„${item.title}“ wirklich aus dem Wochenplan entfernen? Die Einheit wird nicht als ausgefallen gewertet.`)) return;
    updateWorkout(item.id, { archived: true });
    setStatus(`„${item.title}“ wurde aus dem Wochenplan entfernt.`);
  }

  function openWorkoutEditor(item) {
    setWorkoutDetailId(null);
    setEditing(prepareWorkoutForEditing(item));
  }

  function openWorkoutDetails(item) {
    if (!item?.id) return;
    setWorkoutDetailId(item.id);
  }

  function openCompletedReview(destination, event) {
    if (event.target.closest?.("button, a, input, select, textarea")) return;
    navigate(destination.pathname, { state: destination.state });
  }

  function openCompletedReviewFromKeyboard(destination, event) {
    if (event.target !== event.currentTarget || !["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    navigate(destination.pathname, { state: destination.state });
  }

  function openWorkoutFromRow(item, event) {
    if (event.target.closest?.("button, a, input, select, textarea")) return;
    openWorkoutDetails(item);
  }

  function openWorkoutFromKeyboard(item, event) {
    if (event.target !== event.currentTarget || !["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    openWorkoutDetails(item);
  }

  function updateEditingType(type) {
    setEditing((current) => {
      const next = { ...current, type };
      if (isTrackWorkout(next)) {
        return { ...next, structuredWorkout: current?.structuredWorkout || trackWorkoutForEditing(), paceGuidance: null, loopTraining: null };
      }
      if (isLoopWorkout(next)) {
        return normalizeLoopWorkoutItem({
          ...next,
          structuredWorkout: null,
          paceGuidance: null,
          loopTraining: current?.loopTraining || {
            loops: 2,
            loopKm: Number(current?.distance || 0) > 0 ? Number(current.distance) / 2 : 6.7,
            mode: /backyard/i.test(`${type} ${current?.title || ""}`) ? LOOP_MODES.FIXED_INTERVAL : LOOP_MODES.FREE,
            intervalMinutes: 60,
            controlMode: LOOP_CONTROL_MODES.MANUAL_LAP,
            paceMode: LOOP_PACE_MODES.NONE,
          },
        });
      }
      const plain = { ...next, structuredWorkout: null, loopTraining: null };
      return supportsWorkoutPaceGuidance(plain)
        ? prepareWorkoutPaceGuidance(plain)
        : { ...plain, paceGuidance: null };
    });
  }

  function updateLoopTraining(field, value) {
    setEditing((current) => ({
      ...current,
      loopTraining: {
        ...(current?.loopTraining || {}),
        [field]: value,
      },
    }));
  }

  function commitLoopTraining() {
    setEditing((current) => current ? normalizeLoopWorkoutItem(current) : current);
  }

  function setLoopPaceMode(mode) {
    setEditing((current) => {
      if (!current) return current;
      const normalized = normalizeLoopWorkoutItem(current);
      return normalizeLoopWorkoutItem({
        ...normalized,
        loopTraining: {
          ...normalized.loopTraining,
          paceMode: mode,
        },
      });
    });
  }

  function setLoopControlMode(mode) {
    setEditing((current) => {
      if (!current) return current;
      const normalized = normalizeLoopWorkoutItem(current);
      return normalizeLoopWorkoutItem({
        ...normalized,
        loopTraining: {
          ...normalized.loopTraining,
          controlMode: mode,
        },
      });
    });
  }

  function setPaceGuidanceMode(mode) {
    setEditing((current) => {
      if (!current || !supportsWorkoutPaceGuidance(current)) return current;
      const coach = coachPaceGuidance({ ...current, paceGuidance: null });
      const existing = current.paceGuidance || {};
      if (mode === "none") {
        return {
          ...current,
          paceGuidance: {
            mode: "none",
            source: "manual",
            recommendedFaster: existing.recommendedFaster || coach?.recommendedFaster || coach?.faster || "",
            recommendedSlower: existing.recommendedSlower || coach?.recommendedSlower || coach?.slower || "",
            coachReason: existing.coachReason || coach?.coachReason || "",
          },
        };
      }
      const faster = existing.faster || existing.recommendedFaster || coach?.faster || "";
      const slower = existing.slower || existing.recommendedSlower || coach?.slower || "";
      return {
        ...current,
        paceGuidance: {
          mode: "range",
          faster,
          slower,
          recommendedFaster: existing.recommendedFaster || coach?.recommendedFaster || coach?.faster || faster,
          recommendedSlower: existing.recommendedSlower || coach?.recommendedSlower || coach?.slower || slower,
          source: existing.source === "manual" ? "manual" : "coach",
          coachReason: existing.coachReason || coach?.coachReason || "",
        },
      };
    });
  }

  function updatePaceGuidance(field, value) {
    setEditing((current) => ({
      ...current,
      paceGuidance: {
        ...(current?.paceGuidance || coachPaceGuidance({ ...current, paceGuidance: null }) || {}),
        mode: "range",
        [field]: value,
        source: "manual",
      },
    }));
  }

  function commitPaceGuidance() {
    setEditing((current) => {
      if (!current || !supportsWorkoutPaceGuidance(current)) return current;
      const guidance = normalizeWorkoutPaceGuidance(current);
      if (!guidance) return current;
      return {
        ...current,
        paceGuidance: guidance,
        duration: guidance.mode === "range"
          ? paceRangeDurationMinutes(current.distance, guidance) || current.duration
          : current.duration,
      };
    });
  }

  function restoreCoachPaceGuidance() {
    setEditing((current) => {
      if (!current || !supportsWorkoutPaceGuidance(current)) return current;
      const existing = current.paceGuidance || {};
      const coach = coachPaceGuidance({ ...current, paceGuidance: null });
      const faster = existing.recommendedFaster || coach?.faster || "";
      const slower = existing.recommendedSlower || coach?.slower || "";
      if (!faster || !slower) return { ...current, paceGuidance: coach };
      const guidance = {
        mode: "range",
        faster,
        slower,
        recommendedFaster: faster,
        recommendedSlower: slower,
        source: "coach",
        coachReason: coach?.coachReason || existing.coachReason || "",
      };
      return {
        ...current,
        paceGuidance: guidance,
        duration: paceRangeDurationMinutes(current.distance, guidance) || current.duration,
      };
    });
  }

  function updateTrackWorkout(field, value) {
    setEditing((current) => ({
      ...current,
      structuredWorkout: updateTrackWorkoutDraft(current?.structuredWorkout, field, value),
    }));
  }

  function updateTrackStep(index, field, value) {
    setEditing((current) => ({
      ...current,
      structuredWorkout: updateTrackStepDraft(current?.structuredWorkout, index, field, value),
    }));
  }

  function commitTrackRounds() {
    setEditing((current) => {
      const workout = current?.structuredWorkout || trackWorkoutForEditing();
      return {
        ...current,
        structuredWorkout: {
          ...workout,
          rounds: normalizeTrackRounds(workout.rounds),
        },
      };
    });
  }

  function commitTrackStep(index) {
    setEditing((current) => {
      const workout = current?.structuredWorkout || trackWorkoutForEditing();
      return {
        ...current,
        structuredWorkout: {
          ...workout,
          steps: workout.steps.map((step, stepIndex) => (
            stepIndex === index ? normalizeTrackStep(step, step.kind) : step
          )),
        },
      };
    });
  }

  function addTrackStep(kind) {
    setEditing((current) => {
      const workout = current?.structuredWorkout || trackWorkoutForEditing();
      if (workout.steps.length >= 16) return current;
      return {
        ...current,
        structuredWorkout: {
          ...workout,
          steps: [
            ...workout.steps,
            { kind, unit: "distance", value: kind === "recovery" ? 200 : 400 },
          ],
        },
      };
    });
  }

  function removeTrackStep(index) {
    setEditing((current) => {
      const workout = current?.structuredWorkout || trackWorkoutForEditing();
      if (workout.steps.length <= 1) return current;
      return {
        ...current,
        structuredWorkout: {
          ...workout,
          steps: workout.steps.filter((_, stepIndex) => stepIndex !== index),
        },
      };
    });
  }

  function moveTrackStep(index, direction) {
    setEditing((current) => {
      const workout = current?.structuredWorkout || trackWorkoutForEditing();
      const target = index + direction;
      if (target < 0 || target >= workout.steps.length) return current;
      const steps = [...workout.steps];
      [steps[index], steps[target]] = [steps[target], steps[index]];
      return { ...current, structuredWorkout: { ...workout, steps } };
    });
  }

  function selectTrackTemplate(templateId) {
    const template = trackWorkoutTemplates.find((entry) => entry.id === templateId);
    setEditing((current) => {
      const currentWorkout = current?.structuredWorkout || trackWorkoutForEditing();
      if (template) {
        return {
          ...current,
          structuredWorkout: {
            ...workoutFromTrackTemplate(template),
            planningStatus: currentWorkout.planningStatus,
          },
        };
      }
      const workout = normalizeTrackWorkout(currentWorkout);
      return {
        ...current,
        structuredWorkout: {
          kind: workout.kind,
          rounds: workout.rounds,
          steps: workout.steps,
          warmupMode: "lap",
          cooldownMode: "lap",
          planningStatus: currentWorkout.planningStatus,
        },
      };
    });
  }

  function saveTrackTemplate(createCopy = false) {
    const workout = normalizeTrackWorkout(editing?.structuredWorkout);
    const name = String(workout.templateName || "").trim();
    if (!name) return;
    const existing = !createCopy && workout.templateId
      ? trackWorkoutTemplates.find((entry) => entry.id === workout.templateId)
      : null;
    const id = existing?.id || crypto.randomUUID();
    const now = new Date().toISOString();
    const template = buildTrackWorkoutTemplate({
      id,
      name,
      workout,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    });
    setState((current) => {
      const templates = normalizeTrackWorkoutTemplates(current.planner?.trackWorkoutTemplates);
      return {
        ...current,
        planner: {
          ...current.planner,
          trackWorkoutTemplates: existing
            ? templates.map((entry) => entry.id === id ? template : entry)
            : [template, ...templates],
        },
      };
    });
    setEditing((current) => ({
      ...current,
      structuredWorkout: {
        ...normalizeTrackWorkout(current?.structuredWorkout),
        templateId: id,
        templateName: name,
      },
    }));
  }

  function deleteTrackTemplate() {
    const workout = normalizeTrackWorkout(editing?.structuredWorkout);
    const template = trackWorkoutTemplates.find((entry) => entry.id === workout.templateId);
    if (!template || !window.confirm(`„${template.name}“ wirklich aus dem Vorlagenarchiv entfernen? Das aktuelle Training bleibt erhalten.`)) return;
    setState((current) => ({
      ...current,
      planner: {
        ...current.planner,
        trackWorkoutTemplates: normalizeTrackWorkoutTemplates(current.planner?.trackWorkoutTemplates)
          .filter((entry) => entry.id !== template.id),
      },
    }));
    setEditing((current) => ({
      ...current,
      structuredWorkout: {
        ...normalizeTrackWorkout(current?.structuredWorkout),
        templateId: "",
        templateName: template.name,
      },
    }));
  }

  function saveMissed(event) {
    event.preventDefault();
    if (!missedEditing?.reason) return;
    if (missedEditing.reason === "Verschoben" && missedEditing.newDate) {
      updateWorkout(missedEditing.id, { date: missedEditing.newDate, completed: false, missedReason: "", missedNote: missedEditing.note || "", matchedActivityId: null });
    } else if (missedEditing.reason === "Aktivität nicht erkannt" && missedEditing.activityId) {
      const activity = canonicalActivities.find((entry) => String(entry.id) === String(missedEditing.activityId));
      if (activity) {
        updateWorkout(missedEditing.id, {
          completed: true,
          matchedActivityId: activity.id,
          actualTitle: activity.name || activity.title,
          actualDistance: Number(activity.distance || 0),
          actualDuration: Number(activity.duration || 0),
          actualSource: activity.source || "Garmin",
          missedReason: "",
        });
      }
    } else {
      updateWorkout(missedEditing.id, {
        missedReason: missedEditing.reason,
        missedNote: missedEditing.note || "",
        missedMeta: {
          fatigueCause: missedEditing.fatigueCause || "",
          painArea: missedEditing.painArea || "",
          painLevel: Number(missedEditing.painLevel || 0),
        },
        completed: false,
      });
    }
    setMissedEditing(null);
  }

  function openMissed(item) {
    setMissedEditing({
      id: item.id,
      title: item.title,
      date: item.date,
      reason: item.missedReason || "",
      note: item.missedNote || "",
      newDate: "",
      activityId: "",
      fatigueCause: item.missedMeta?.fatigueCause || "",
      painArea: item.missedMeta?.painArea || "",
      painLevel: item.missedMeta?.painLevel || 0,
    });
  }

  function openAvailability(date) {
    const existing = availabilityForDate(availabilityExceptions, date);
    setAvailabilityEditing({
      date,
      reason: existing?.reason || "Familie",
      note: existing?.note || "",
      exists: Boolean(existing),
    });
  }

  function saveAvailability(event) {
    event.preventDefault();
    if (!availabilityEditing?.date) return;
    const blockedDate = availabilityEditing.date;
    const hasPlanConflict = weekPlan.some((item) => item.date === blockedDate && !item.completed && !item.missedReason && !item.raceEvent);
    setState((current) => ({
      ...current,
      planner: {
        ...current.planner,
        availabilityExceptions: upsertAvailabilityException(current.planner?.availabilityExceptions, {
          date: blockedDate,
          status: "blocked",
          reason: availabilityEditing.reason,
          note: availabilityEditing.note,
          updatedAt: new Date().toISOString(),
        }),
        weekApprovals: invalidateWeekPlanApproval(current.planner?.weekApprovals, weekKey),
        lastPlanChange: null,
      },
    }));
    setAvailabilityEditing(null);
    setStatus(hasPlanConflict
      ? `${planChangeDateLabel(blockedDate)} ist jetzt für Training blockiert. Die betroffene Einheit wird oben genannt; du kannst sie direkt ansehen oder den Plan gezielt anpassen.`
      : `${planChangeDateLabel(blockedDate)} ist für Training blockiert. Der Coach hält den Tag bei der nächsten Planung frei.`);
  }

  function clearAvailability() {
    if (!availabilityEditing?.date) return;
    const date = availabilityEditing.date;
    setState((current) => ({
      ...current,
      planner: {
        ...current.planner,
        availabilityExceptions: removeAvailabilityException(current.planner?.availabilityExceptions, date),
        weekApprovals: invalidateWeekPlanApproval(current.planner?.weekApprovals, weekKey),
        lastPlanChange: null,
      },
    }));
    setAvailabilityEditing(null);
    setStatus(`${planChangeDateLabel(date)} ist wieder für Training verfügbar. Bestehende Einheiten bleiben unverändert, bis du die Woche neu planst.`);
  }

  const focusAvailabilityConflict = (entryId) => {
    if (!entryId) return;
    setAvailabilityFocusId(entryId);
    requestAnimationFrame(() => {
      document.getElementById(`planner-workout-${entryId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    window.setTimeout(() => {
      setAvailabilityFocusId((current) => current === entryId ? "" : current);
    }, 2200);
  };

  return (
    <>
      <PageTitle eyebrow="Training" title="Deine Woche">
        <div className="page-actions planner-page-actions">
          <button className="primary planner-generate" onClick={requestPlanning} disabled={isPastWeek || planningWeekLocked}>
            ✦ {isPastWeek ? "Woche abgeschlossen" : weekPlan.length ? "Woche anpassen" : planningWeekLocked ? "Noch nicht planbar" : offsetWeeks === 1 ? "Nächste Woche planen" : "Woche planen"}
          </button>
          <button className={`planner-publish-button ${publishedWeek && !planChangedAfterPublish ? "intervals-published-button" : ""}`} onClick={requestPublish} disabled={publishBusy || !weekAccepted || (!publishedWeek && publishablePlan.length === 0)}>
            {publishBusy ? "Senden …" : weekEventPlanNeedsRefresh ? "Wettkampf einplanen" : !weekAccepted && weekPlan.length ? "Plan erst annehmen" : publishedWeek ? (planChangedAfterPublish ? "Für Garmin aktualisieren" : "✓ Intervals") : "Für Garmin senden"}
          </button>
          <details className="action-menu planner-action-menu">
            <summary aria-label="Weitere Aktionen" title="Weitere Aktionen">•••</summary>
            <div className="action-menu-panel">
              {calendarToken && <span className="action-menu-status">✓ Kalenderabo aktiv</span>}
              {publishedWeek && <span className="action-menu-status">{planChangedAfterPublish ? "! Intervals-Stand veraltet" : garminChecksOpen.length ? `! ${garminChecksOpen.length} Garmin-Check${garminChecksOpen.length === 1 ? "" : "s"} offen` : `✓ ${publishedWeek.guided || 0} Workouts in Intervals bestätigt`}</span>}
              <button type="button" onClick={(event) => { setPlanningInfoOpen(true); event.currentTarget.closest("details")?.removeAttribute("open"); }}>Wie plant dein Coach?</button>
              {!isPastWeek && weekPlan.length > 0 && <button type="button" onClick={(event) => { replanCurrentWeek(); event.currentTarget.closest("details")?.removeAttribute("open"); }}>Woche komplett neu planen</button>}
              <button type="button" onClick={(event) => { downloadCalendar(weekPlan); event.currentTarget.closest("details")?.removeAttribute("open"); }} disabled={!weekPlan.length}>ICS-Datei laden</button>
              <button type="button" onClick={(event) => { requestPublish(); event.currentTarget.closest("details")?.removeAttribute("open"); }} disabled={publishBusy || !weekAccepted || (!publishedWeek && publishablePlan.length === 0)}>{weekEventPlanNeedsRefresh ? "Wettkampf zuerst einplanen" : !weekAccepted && weekPlan.length ? "Plan zuerst annehmen" : publishedWeek ? "Sync erneut anstoßen" : "Für Garmin veröffentlichen"}</button>
            </div>
          </details>
        </div>
      </PageTitle>
      <TrainingSectionNav />
      <section className="planner-week-dashboard">
        <section className="planner-week-focus-card">
          <div className="planner-week-focus-copy">
            <span>Wochenfokus</span>
            <strong>{weekPrescription?.weekType?.label || (weekPlan.length ? "Trainingswoche" : "Woche vorbereiten")}</strong>
            <small>{weekPrescription?.focus || "Training passend zur aktuellen Phase und deinem Alltag steuern."}</small>
          </div>
          {goalProfile.target?.name && (
            <Link className="planner-week-focus-goal" to="/mission" aria-label={`${goalProfile.target.name}: Hauptziel öffnen`}>
              <span>Hauptziel</span>
              <strong>{goalProfile.target.name}</strong>
              <small>{goalProfile.disciplineLabel} · {goalProfile.phase?.label || "Phase wird berechnet"}</small>
            </Link>
          )}
        </section>

        {!isPastWeek && weekPlan.length > 0 && (
          <section className={`planner-plan-approval ${weekApprovalState}`}>
            <div className="planner-plan-approval-copy">
              <span className="planner-plan-approval-dot" aria-hidden="true" />
              <strong>{weekEventPlanNeedsRefresh ? "Wettkampf noch nicht im Wochenplan" : weekAccepted ? "Plan aktuell" : weekApprovalState === WEEK_APPROVAL_STATES.CHANGED ? "Plan geändert · erneut bestätigen" : "Plan noch nicht bestätigt"}</strong>
              <small>{weekEventPlanNeedsRefresh
                ? "Mission und Wochenplan sind nicht mehr deckungsgleich. Der Coach muss die Woche mit Wettkampf, Frische und Pre-Race-Ablauf neu abstimmen."
                : weekAccepted
                  ? `Bestätigt am ${acceptedAtLabel} · bereit für Intervals und Garmin.`
                  : weekApprovalState === WEEK_APPROVAL_STATES.CHANGED
                    ? "Kurz prüfen und bestätigen; danach kann Garmin aktualisiert werden."
                    : "Kurz prüfen und bestätigen, bevor die Woche veröffentlicht wird."}</small>
            </div>
            <div className="planner-plan-approval-actions">
              {weekEventPlanNeedsRefresh
                ? <button type="button" className="primary" onClick={replanCurrentWeek}>Woche auf Wettkampf abstimmen</button>
                : !weekAccepted && <button type="button" className="primary" onClick={acceptCurrentWeek}>{weekApprovalState === WEEK_APPROVAL_STATES.CHANGED ? "Erneut annehmen" : "Plan annehmen"}</button>}
            </div>
          </section>
        )}

        {!isPastWeek && publishedWeek && !planChangedAfterPublish && garminChecksOpen.length > 0 && (
          <section className="planner-inline-notice planner-garmin-preflight">
            <div>
              <span>Garmin-Check offen</span>
              <strong>{garminChecksOpen.length} Track-Workout{garminChecksOpen.length === 1 ? "" : "s"} noch nicht auf der Uhr bestätigt</strong>
              <small>Intervals.icu hat die Fassung erhalten. Synchronisiere Garmin Connect und öffne das Workout vor dem Training einmal auf der Uhr – so gibt es am Start keine Überraschung.</small>
            </div>
          </section>
        )}

        {!isPastWeek && !weekAccepted && lastPlanChangeForWeek && lastPlanChangeUndoable && (
          <section className="planner-inline-notice planner-inline-notice-undo">
            <div>
              <span>Letzte Coach-Änderung</span>
              <strong>{lastPlanChangeForWeek.reason || "Wochenplan angepasst"}</strong>
            </div>
            <button type="button" onClick={undoLastPlanChange}>Rückgängig</button>
          </section>
        )}

        {!isPastWeek && availabilityConflicts.length > 0 && (
          <section className="planner-inline-notice planner-inline-notice-warning planner-availability-conflicts">
            <div className="planner-availability-conflict-copy">
              <span>{availabilityConflicts.length === 1 ? "Wochenangabe betrifft eine Einheit" : `${availabilityConflicts.length} Einheiten prüfen`}</span>
              <div className="planner-availability-conflict-list">
                {availabilityConflicts.slice(0, 3).map(({ item, restriction }) => (
                  <div className="planner-availability-conflict-row" key={item.id}>
                    <strong>{dayFormatter.format(new Date(`${item.date}T12:00:00`))} · {item.title}</strong>
                    <small>{[
                      item.distance ? `${item.distance} km` : "",
                      item.duration ? `${item.duration} min` : "",
                      restriction,
                    ].filter(Boolean).join(" · ")}</small>
                  </div>
                ))}
                {availabilityConflicts.length > 3 && <small>+ {availabilityConflicts.length - 3} weitere Einheit{availabilityConflicts.length - 3 === 1 ? "" : "en"}</small>}
              </div>
            </div>
            <div className="planner-availability-conflict-actions">
              <button type="button" onClick={() => focusAvailabilityConflict(availabilityConflicts[0]?.item?.id)}>Einheit ansehen</button>
              <button type="button" className="ghost" onClick={replanCurrentWeek}>Plan anpassen</button>
            </div>
          </section>
        )}

        {offsetWeeks === 0 && ["adjust", "watch"].includes(unifiedCoach.level) && activeCoachSuggestions.length > 0 && (
          <details className={`planner-coach-alert ${unifiedCoach.level}`}>
            <summary>
              <div>
                <span>Coach-Update</span>
                <strong>{activeCoachSuggestions.length === 1 ? "1 Änderung vorgeschlagen" : `${activeCoachSuggestions.length} Änderungen vorgeschlagen`}</strong>
                <small>{coachAlertCause}</small>
              </div>
              <b>Ansehen</b>
            </summary>
            <div className="planner-coach-alert-body">
              <p>{unifiedCoach.recommendation.text}</p>
              <div className="planner-coach-alert-list">
                {activeCoachSuggestions.map((candidate) => (
                  <a href={`#planner-workout-${candidate.id}`} key={candidate.id}>
                    <span>{candidate.title}</span>
                    <strong>→ {candidate.coachAlternative?.label || "Alternative prüfen"}</strong>
                    <small>{candidate.coachAlternative?.reason || candidate.suggestion}</small>
                  </a>
                ))}
              </div>
              <small>Die Empfehlung findest du zusätzlich direkt an der betroffenen Einheit.</small>
            </div>
          </details>
        )}

        {offsetWeeks === 0 && weekPlan.length > 0 && (
          <details className={`planner-week-logic ${scienceAssessment.loadBand?.tone || "neutral"}`}>
            <summary>
              <div className="planner-week-logic-lead">
                <span>Warum dieser Plan?</span>
                <strong>{weekPrescription?.weekType?.label || "Trainingswoche"}</strong>
                <small>{loadComparisonLabel} · {scienceAssessment.loadBand?.label || "Wird eingeordnet"}</small>
              </div>
              <div className="planner-week-logic-metrics">
                <span><b>{weekRunningKm.toFixed(1).replace(".0", "")} km</b> diese Woche</span>
                <span><b>{fixedSessionCount}</b> Termine</span>
                <span><b>{scienceAssessment.hardCount ?? keySessionCount}</b> Reize</span>
              </div>
              <b className="planner-week-logic-toggle">Erklärung</b>
            </summary>
            <div className="planner-week-logic-body">
              <article className="planner-week-logic-focus">
                <span>Ziel dieser Woche</span>
                <strong>{weekPrescription?.focus || "Training passend zur aktuellen Phase steuern."}</strong>
                {weekPrescription?.weekType?.summary && <p>{weekPrescription.weekType.summary}</p>}
                {weekPrescription?.deliveryNote && <p>{weekPrescription.deliveryNote}</p>}
              </article>
              <article>
                <span>Wochenumfang</span>
                <strong>{weekRunningKm.toFixed(1).replace(".0", "")} km aktuell · {completedKm.toFixed(1).replace(".0", "")} km erledigt · {plannedKm.toFixed(1).replace(".0", "")} km offen</strong>
                <p>{weekPrescription?.corridor?.label
                  ? `Der normale Coach-Rahmen liegt aktuell bei ${weekPrescription.corridor.label}. Er ist kein Wochen-Soll, sondern ein Belastungskorridor aus deiner Entwicklung. Die konkrete Woche darf durch Wettkampf, Verfügbarkeit und Erholung darunter liegen; die Differenz ist keine Kilometerschuld.`
                  : "Die konkrete Wochenplanung zählt erledigte und noch offene Laufeinheiten. Nicht gelaufene Differenzen werden nicht als Kilometerschuld nachgeholt."}</p>
              </article>
              <article>
                <span>Warum dieser Wochentyp?</span>
                <strong>{weekPrescription?.why?.[0] || "Der Coach ordnet Belastung und Erholung aus dem aktuellen Verlauf ein."}</strong>
                {weekPrescription?.why?.length > 1 && <p>{weekPrescription.why.slice(1).join(" ")}</p>}
              </article>
              <article>
                <span>Nächster Schritt</span>
                <strong>{weekPrescription?.nextStep || "Woche wie geplant umsetzen und Reviews als Rückmeldung nutzen."}</strong>
                {weekPrescription?.confidenceText && <p>{weekPrescription.confidenceText}</p>}
                {weekPrescription?.noDebtText && <p>{weekPrescription.noDebtText}</p>}
              </article>
              <article>
                <span>Belastungsrechnung</span>
                <strong>{scienceAssessment.projected} Punkte geplant · jüngstes Mittel {scienceAssessment.average || "–"} aus {scienceAssessment.baselineWeeks || 0} Wochen</strong>
                <p>{scienceAssessment.completed} Punkte sind bereits absolviert, {scienceAssessment.remaining} Punkte liegen noch vor dir. Der Coach-Load-Index verbindet Dauer, Sportart, Distanz, Höhenmeter und vorhandene Reviews; er ist ein transparenter Steuerungswert und kein medizinischer Messwert.</p>
              </article>
              <article>
                <span>Sportübergreifende Belastung</span>
                <strong>{crossTrainingContextLabel}</strong>
                <p>{crossTrainingLabel || "Fußball und Rennrad werden als eigene Belastung betrachtet."} Sie werden nicht in Laufkilometer umgerechnet. Erst eine ungewöhnliche Belastung zusammen mit deinem Review kann eine flexible Folgeeinheit verändern; Schlüsselreize bleiben geschützt.</p>
              </article>
              <article>
                <span>Fixtermine & Doppeltraining</span>
                <strong>Freie Tage werden vor harten Fixterminen belegt</strong>
                <p>Ein freigegebener Doppeltrainingstag ist nur eine Erlaubnis, kein Planungsauftrag. Auf einen harten ORC-Track- oder Fußballtag setzt der Coach keinen zusätzlichen generierten Lauf. Eine zweite Einheit wird zuerst auf einen freien Tag verschoben.</p>
              </article>
              <article>
                <span>Zielspezifität</span>
                <strong>{specificWeekEntry ? specificWeekEntry.title : goalProfile.target?.name || "Aktuelles Hauptziel"}</strong>
                <p>{loopExplanation}</p>
              </article>
              <article>
                <span>Coach-Anpassungen</span>
                <strong>Flexible Einheiten zuerst, Fixtermine zuletzt</strong>
                <p>Lehnst du eine Empfehlung ab, bleibt die Einheit bestehen und der nächste flexible Kandidat wird angeboten. Gruppen- und Vereinstermine werden nur vorgeschlagen, wenn flexible Änderungen die Belastung nicht ausreichend senken.</p>
              </article>
            </div>
          </details>
        )}
      </section>

      {crossTrainingNeedsReplan && (
        <section className={`planner-cross-training-alert ${crossTrainingSummary.impactLevel || "none"}`}>
          <div>
            <span>{crossTrainingSummary.impactLevel === "review" ? "Review zur Zusatzbelastung offen" : "Zusatzbelastung prüfen"}</span>
            <strong>{crossTrainingSummary.impactLevel === "review"
              ? `${crossTrainingLabel || "Die Einheit"} war deutlich außerhalb deines persönlichen Erwartungsbereichs.`
              : "Dein Review zeigt, dass die zusätzliche Belastung die weitere Woche beeinflussen kann."}</strong>
            <small>{crossTrainingSummary.impactLevel === "review"
              ? "EI kürzt deshalb noch keinen Lauf. Erst dein Review entscheidet, ob der Coach überhaupt eingreifen soll."
              : "Keine 1:1-Kilometerverrechnung: angepasst werden darf nur eine flexible Folgeeinheit, wenn deine tatsächliche Erholung dafür spricht."}</small>
          </div>
          <button type="button" onClick={() => setCrossTrainingPreviewOpen(true)}>Details prüfen</button>
        </section>
      )}


      <div className="planner-week-nav">
        <button disabled={offsetWeeks === 0 && !previousWeekHasPlan} title={offsetWeeks === 0 && !previousWeekHasPlan ? "Keine ältere geplante Woche vorhanden" : "Vorherige Woche"} onClick={() => { setOffsetWeeks((value) => value - 1); setForecast([]); setStatus(""); }}>←</button>
        <div><strong>{dayFormatter.format(weekStart)} – {dayFormatter.format(weekEnd)}</strong><span>{offsetWeeks === 0 ? `Aktuelle Woche · ${weekEventPlanNeedsRefresh ? "Wettkampf offen" : weekAccepted ? "angenommen" : weekApprovalState === WEEK_APPROVAL_STATES.CHANGED ? "geändert" : "Entwurf"}` : offsetWeeks === 1 ? `Nächste Woche · ${weekAccepted ? "angenommen" : weekApprovalState === WEEK_APPROVAL_STATES.CHANGED ? "geändert" : weekPlan.length ? "Entwurf" : "noch nicht geplant"}` : "Abgeschlossene Trainingswoche"}</span></div>
        <button disabled={offsetWeeks >= 1} title={offsetWeeks >= 1 ? "Es wird immer nur die nächste Woche vorbereitet" : "Nächste Woche"} onClick={() => { setOffsetWeeks((value) => value + 1); setForecast([]); setStatus(""); }}>→</button>
      </div>

      <section className="planner-overview-strip">
        <div className="planner-overview-volume">
          <span>Wochenumfang</span>
          <strong>{weekRunningKm.toFixed(1).replace(".0", "")} km</strong>
          <small>{completedKm.toFixed(1).replace(".0", "")} km erledigt · {plannedKm.toFixed(1).replace(".0", "")} km offen</small>
        </div>
        <div title={crossTrainingLabel || "Keine zusätzliche sportübergreifende Belastung erkannt"}><span>Zusatzlast</span><strong>{crossTrainingSummary.details.length ? (crossTrainingSummary.impactLevel === "adjust" ? "Prüfen" : crossTrainingSummary.impactLevel === "review" ? "Review offen" : "Im Rahmen") : "–"}</strong></div>
        <div><span>Erledigt</span><strong>{weekActivities.length} Einheiten</strong></div>
        <div className="planner-overview-state"><span>Status</span><strong>{isPastWeek ? "Abgeschlossen" : weekPlan.length ? (weekEventPlanNeedsRefresh ? "Wettkampf einplanen" : weekAccepted ? "Angenommen · Änderungen gezielt" : weekApprovalState === WEEK_APPROVAL_STATES.CHANGED ? "Geändert · erneut annehmen" : "Entwurf · noch annehmen") : planningWeekLocked ? "Wochenabschluss fehlt" : "Bereit zur Planung"}</strong></div>
        <button onClick={() => setEditing(createBlank(weekStart))} disabled={isPastWeek || planningWeekPending}>+ Einheit</button>
      </section>

      {weekMissionEvents.length > 0 && (
        <Card className={`wide planner-event-week-card ${weekEventPlanNeedsRefresh ? "needs-refresh" : "is-synced"}`}>
          <div className="planner-event-week-main">
            <p className="eyebrow">Wettkampf diese Woche</p>
            <h2>{weekMissionEvents.map((event) => event.name || "Event").join(" · ")}</h2>
            <p>{weekEventPlanNeedsRefresh
              ? "Der Wettkampf steht in deiner Mission, ist aber im aktuellen Wochenplan noch nicht korrekt abgebildet. Der Coach soll jetzt Qualität, Frische, Shake-out und den Wettkampftag darauf abstimmen."
              : "Der Coach integriert den Wettkampf als Wochenreiz und schützt die unmittelbare Frische, ohne die Hauptmission aus dem Blick zu verlieren."}</p>
            {config.lastPlanningTarget?.name && <small>Strategischer Trainingsfokus bleibt: <strong>{config.lastPlanningTarget.name}</strong>.</small>}
          </div>
          <div className="planner-event-week-side">
            <div className="planner-event-week-badges">
              {weekMissionEvents.map((event) => <span key={event.id || `${event.date}-${event.name}`}>{event.targetKm ? `${Number(event.targetKm).toFixed(1).replace(".0", "")} km` : "Event"}{event.time ? ` · ${event.time} Uhr` : ""} · {event.priority || "B"}-Event</span>)}
            </div>
            {weekEventPlanNeedsRefresh && <button type="button" className="primary" onClick={replanCurrentWeek}>Woche auf Wettkampf abstimmen</button>}
          </div>
        </Card>
      )}

      {planningWeekPending ? (
        <Card className={`wide planner-week-gate ${planningWeekLocked ? "locked" : "ready"}`}>
          <div>
            <p className="eyebrow">Wochenabschluss</p>
            <h2>{planningWeekLocked ? `${planningTargetLabel} ist noch nicht planbar` : `${closurePeriodLabel === "Vorwoche" ? "Vorwoche" : "Aktuelle Woche"} ist ausgewertet`}</h2>
            <p className="muted">{planningWeekLocked ? `Dein Coach wartet auf die erforderlichen Rückmeldungen der ${closurePeriodLabel}, bevor die nächste Belastung berechnet wird.` : "Alle tatsächlich erforderlichen Reviews liegen vor und jede geplante Einheit ist erledigt oder nachvollziehbar geklärt."}</p>
          </div>
          <div className="planner-gate-checks">
            <div className={previousWeekClosure?.missingReviews.length ? "open" : "done"}><b>{previousWeekClosure?.missingReviews.length ? "!" : "✓"}</b><span><strong>Reviews</strong><small>{previousWeekClosure?.missingReviews.length ? `${previousWeekClosure.missingReviews.length} Rückmeldung${previousWeekClosure.missingReviews.length === 1 ? " fehlt" : "en fehlen"}` : "Alle erforderlichen Reviews vorhanden"}</small></span></div>
            <div className={previousWeekClosure?.unresolvedItems.length ? "open" : "done"}><b>{previousWeekClosure?.unresolvedItems.length ? "!" : "✓"}</b><span><strong>Geplante Einheiten</strong><small>{previousWeekClosure?.unresolvedItems.length ? `${previousWeekClosure.unresolvedItems.length} Einheit${previousWeekClosure.unresolvedItems.length === 1 ? " ist" : "en sind"} noch offen` : "Alles erledigt, verschoben oder als ausgefallen markiert"}</small></span></div>
            <div className="done"><b>✓</b><span><strong>Trainingsdaten</strong><small>{previousWeekClosure?.activityCount || 0} Aktivitäten der {closurePeriodLabel} berücksichtigt</small></span></div>
          </div>
          {!planningWeekLocked && previousWeekReview && (
            <div className={`planner-week-review ${previousWeekReview.tone}`}>
              <div className="planner-week-review-head">
                <div><span>Coach-Wochenreview</span><strong>{previousWeekReview.headline}</strong><small>{previousWeekReview.summary}</small></div>
                <b>{previousWeekReview.tone === "good" ? "✓ stabil" : previousWeekReview.tone === "mixed" ? "↗ beobachten" : "! steuern"}</b>
              </div>
              <div className="planner-week-review-metrics">
                <div>
                  <span>Laufumfang</span>
                  <strong>{previousWeekReview.metrics.actualRunningKm.toFixed(1).replace(".0", "").replace(".", ",")} km</strong>
                  <small>{previousWeekReview.metrics.plannedRunningKm > 0
                    ? `Geplant ${previousWeekReview.metrics.plannedRunningKm.toFixed(1).replace(".0", "").replace(".", ",")} km`
                    : previousWeekReview.metrics.plannedRunningSessions > 0
                      ? "Planumfang nicht vollständig gespeichert"
                      : "Keine Laufkilometer geplant"}</small>
                </div>
                <div>
                  <span>Schlüsselreize</span>
                  <strong>{previousWeekReview.metrics.keyCompleted} von {previousWeekReview.metrics.keyPlanned}</strong>
                  <small>{previousWeekReview.metrics.keyPlanned > 0 ? "geplante Reize absolviert" : "kein Schlüsselreiz geplant"}</small>
                </div>
                <div>
                  <span>Zusatzbelastung</span>
                  <strong>{previousWeekReview.metrics.extraActivities || "Keine"}</strong>
                  <small>{previousWeekReview.metrics.extraActivities === 1 ? "Aktivität außerhalb des Plans" : previousWeekReview.metrics.extraActivities > 1 ? "Aktivitäten außerhalb des Plans" : "keine ungeplante Belastung"}</small>
                </div>
                <div>
                  <span>Reviews</span>
                  <strong>{previousWeekReview.metrics.reviewCount}</strong>
                  <small>Ø RPE {previousWeekReview.metrics.averageRpe?.toFixed(1).replace(".", ",") || "–"}</small>
                </div>
              </div>
              <div className="planner-week-review-columns">
                <article className="positive"><span>Was gut war</span>{previousWeekReview.positives.map((item) => <p key={item}>✓ {item}</p>)}</article>
                <article className="watch"><span>Auffällig</span>{previousWeekReview.watchouts.map((item) => <p key={item}>• {item}</p>)}</article>
                <article className="consequence"><span>Konsequenz</span><p>{previousWeekReview.consequence}</p></article>
              </div>
            </div>
          )}
          <div className="planner-gate-actions">
            {previousWeekClosure?.missingReviews.length > 0 && <Link className="secondary" to="/training">Reviews abschließen</Link>}
            {previousWeekClosure?.unresolvedItems.length > 0 && closureOffset != null && <button type="button" onClick={() => setOffsetWeeks(closureOffset)}>{closurePeriodLabel === "Vorwoche" ? "Vorwoche öffnen" : "Aktuelle Woche öffnen"}</button>}
            {!planningWeekLocked && <button type="button" className="primary" onClick={requestPlanning}>{planningTargetLabel} planen</button>}
          </div>
          {previousWeekClosure?.missingReviews.length > 0 && <div className="planner-gate-list"><strong>Fehlende Reviews</strong>{previousWeekClosure.missingReviews.slice(0, 4).map((activity) => <span key={activity.id}>{activityDate(activity)} · {activity.name || activity.type || "Training"}</span>)}</div>}
          {previousWeekClosure?.unresolvedItems.length > 0 && <div className="planner-gate-list"><strong>Offene Einheiten</strong>{previousWeekClosure.unresolvedItems.slice(0, 4).map((item) => <span key={item.id}>{item.date} · {item.title}</span>)}</div>}
        </Card>
      ) : <>

      {offsetWeeks >= 0 && recurringCommitments.length > 0 && (
        <details className="card wide planner-commitments-disclosure planner-generic-appointments">
          <summary>
            <div><p className="eyebrow">Feste Termine dieser Woche</p><h2>{recurringCommitments.length} Termine</h2><span>{recurringCommitments.map((item) => `${item.weekday.slice(0, 2)} · ${item.name}`).join(" · ")}</span></div>
            <b>Termine anzeigen</b>
          </summary>
          <div className="planner-commitments-body">
            <p className="muted">Hier änderst du nur diese konkrete Woche. Die Grundkonfiguration unter Settings bleibt erhalten.</p>
            <div className="planner-live-appointment-grid">
              {recurringCommitments.map((commitment) => {
                const date = commitmentDate(weekStart, commitment);
                const slot = findCommitmentSlot(weekPlan, commitment, date);
                const replacementCandidate = slot ? null : findCommitmentReplacementCandidate(weekPlan, commitment, date);
                const editable = Boolean(!slot?.completed && (offsetWeeks > 0 || date >= todayKey));
                const cancelled = Boolean(slot?.plannedCancellation);
                const trackConfigurable = Boolean(slot && isTrackWorkout(slot));
                return <section className={cancelled ? "cancelled" : ""} key={commitment.id}>
                  <div><span>{commitment.weekday} · {commitment.time}</span><strong>{slot?.title || commitment.name}</strong><small>{cancelled ? `Ausgefallen · ${slot.missedReason}` : `${!slot ? "Noch nicht im Wochenplan · " : ""}${sportLabel(commitment.sport)} · ${commitment.durationMinutes || slot?.duration || 0} min${commitment.distanceKm ? ` · ${commitment.distanceKm} km` : ""}`}</small></div>
                  <div className="planner-live-buttons">{cancelled ? <><button type="button" onClick={() => restoreCancelledWorkout(slot)} disabled={!editable}>Wieder einplanen</button><button type="button" onClick={() => openAdjustment(slot.id, "cancel")} disabled={!editable}>Grund ändern</button></> : <><button type="button" onClick={() => editCommitmentThisWeek(commitment, date, slot, replacementCandidate)} disabled={!editable}>{trackConfigurable ? "Track konfigurieren" : "Einheit anpassen"}</button><button type="button" onClick={() => skipCommitmentThisWeek(slot, commitment, date)} disabled={!editable}>Diese Woche aussetzen</button></>}</div>
                </section>;
              })}
            </div>
            {publishedWeek && planChangedAfterPublish && <small className="planner-saturday-dirty">Fixtermin geändert – anschließend „Garmin aktualisieren“ drücken.</small>}
          </div>
        </details>
      )}

      {offsetWeeks >= 0 && !recurringCommitments.length && hasLegacyPersonalSlots && (
        <Card className="wide planner-live-appointments">
          <div className="planner-live-appointments-copy">
            <p className="eyebrow">Fixtermine anpassen</p>
            <h2>Absage? Der Coach plant den Tag neu.</h2>
            <p className="muted">Fußball und ORC Run können nach der Wochenplanung noch geändert werden. „Ersatz“ nutzt Reviews und Wochenbelastung; „Erholung“ markiert bewusst einen freien Tag.</p>
          </div>
          <div className="planner-live-appointment-grid">
            <section>
              <div><span>Montag</span><strong>{footballMode === "fixed" ? "Fußball" : footballMode === "replacement" ? footballSlot?.title : "Erholungstag"}</strong></div>
              <div className="planner-live-buttons"><button type="button" className={footballMode === "fixed" ? "selected" : ""} onClick={() => setLiveAppointmentMode("football", "fixed")} disabled={!footballEditable}>⚽ Fußball</button><button type="button" className={footballMode === "replacement" ? "selected" : ""} onClick={() => setLiveAppointmentMode("football", "replacement")} disabled={!footballEditable}>✦ Ersatz</button><button type="button" className={footballMode === "rest" ? "selected" : ""} onClick={() => setLiveAppointmentMode("football", "rest")} disabled={!footballEditable}>○ Erholung</button></div>
            </section>
            <section>
              <div><span>Mittwoch</span><strong>{orcRunMode === "fixed" ? "ORC Run" : orcRunMode === "replacement" ? orcRunSlot?.title : "Erholungstag"}</strong></div>
              <div className="planner-live-buttons"><button type="button" className={orcRunMode === "fixed" ? "selected" : ""} onClick={() => setLiveAppointmentMode("orcRun", "fixed")} disabled={!orcRunEditable}>📍 ORC Run</button><button type="button" className={orcRunMode === "replacement" ? "selected" : ""} onClick={() => setLiveAppointmentMode("orcRun", "replacement")} disabled={!orcRunEditable}>🟢 Alternative</button><button type="button" className={orcRunMode === "rest" ? "selected" : ""} onClick={() => setLiveAppointmentMode("orcRun", "rest")} disabled={!orcRunEditable}>○ Erholung</button></div>
            </section>
          </div>
          {publishedWeek && planChangedAfterPublish && <small className="planner-saturday-dirty">Fixtermin geändert – anschließend „Garmin aktualisieren“ drücken.</small>}
        </Card>
      )}

      {offsetWeeks >= 0 && !recurringCommitments.length && hasLegacyPersonalSlots && (
        <Card className="wide planner-saturday-control">
          <div>
            <p className="eyebrow">Samstagsentscheidung</p>
            <h2>{saturdayPlanMode === "orc" ? "ORC Track" : saturdayPlanMode === "alternative" ? `${Number(saturdaySlot?.distance || 0)} km Alternativlauf` : saturdayPlanMode === "open" ? "Noch offen" : "Kein Samstagslauf"}</h2>
            <p className="muted">Du kannst die Entscheidung jederzeit ändern. ORC Track und Alternativlauf belegen denselben Trainingsplatz und werden nie gleichzeitig geplant.</p>
          </div>
          <div className="planner-saturday-buttons" role="group" aria-label="Samstagsoption ändern">
            <button type="button" className={saturdayPlanMode === "open" ? "selected" : ""} onClick={() => setSaturdayPlanMode("open")} disabled={!saturdayEditable}>Offen</button>
            <button type="button" className={saturdayPlanMode === "orc" ? "selected" : ""} onClick={() => setSaturdayPlanMode("orc")} disabled={!saturdayEditable}>📍 ORC Track</button>
            <button type="button" className={saturdayPlanMode === "alternative" ? "selected" : ""} onClick={() => setSaturdayPlanMode("alternative")} disabled={!saturdayEditable}>🟢 Alternative</button>
            <button type="button" className={saturdayPlanMode === "off" ? "selected" : ""} onClick={() => setSaturdayPlanMode("off")} disabled={!saturdayEditable}>Kein Lauf</button>
          </div>
          {!saturdayEditable && <small className="muted">Der Samstag liegt bereits zurück oder die Einheit wurde erledigt.</small>}
          {publishedWeek && planChangedAfterPublish && <small className="planner-saturday-dirty">Plan geändert – anschließend „Garmin aktualisieren“ drücken.</small>}
        </Card>
      )}





      {status && <p className="planner-status">{status}</p>}
      {missed.length > 0 && (
        <button className="planner-attention" onClick={() => openMissed(missed[0])}>
          <strong>{missed.length} offene Rückmeldung{missed.length > 1 ? "en" : ""}</strong>
          <span>{missed[0].title} vom {new Intl.DateTimeFormat("de-DE").format(new Date(`${missed[0].date}T12:00:00`))} wurde nicht erkannt. Grund angeben →</span>
        </button>
      )}



      <div className="planner-days">
        {Array.from({ length: 7 }, (_, index) => {
          const date = dateForDay(weekStart, index);
          const dateKey = isoDate(date);
          const entries = weekPlan.filter((item) => item.date === dateKey);
          const actuals = weekActivities.filter((activity) => activityDate(activity) === dateKey && !matchedActivityIds.has(activity.id));
          const dayWeather = forecast.find((item) => item.date === dateKey);
          const availability = weekAvailability.get(dateKey) || null;
          const availabilityEditable = !isPastWeek && dateKey >= todayKey;
          return (
            <article className={`planner-day ${availability?.status === "blocked" ? "availability-blocked" : availability ? "availability-limited" : ""}`.trim()} key={dateKey}>
              <header>
                <div className="planner-day-label"><strong>{dayFormatter.format(date)}</strong>{dateKey === todayKey && <span>Heute</span>}</div>
                <div className="planner-day-header-actions">
                  {dayWeather && <small>{dayWeather.maxTemp}° · Böen {dayWeather.maxGust} · Regen {dayWeather.rainChance}%</small>}
                  {availabilityEditable && <button type="button" className={availability ? "blocked" : ""} onClick={() => openAvailability(dateKey)}>{availability ? (availability.status === "blocked" ? "Nicht verfügbar" : "Eingeschränkt") : "Verfügbarkeit"}</button>}
                </div>
              </header>

              <div className="planner-day-body">
              {availability && (
                <div className="planner-availability-note">
                  <div className="planner-availability-note-main">
                    <span>{availability.status === "blocked" ? "Training nicht möglich" : "Diese Woche angepasst"}</span>
                    <strong>{availabilityLabel(availability)}</strong>
                  </div>
                  {availability.note && (
                    <details className="planner-availability-note-details">
                      <summary>Warum?</summary>
                      <small>{availability.note}</small>
                    </details>
                  )}
                  {availabilityEditable && <button type="button" onClick={() => openAvailability(dateKey)}>Ändern</button>}
                </div>
              )}

              {actuals.map((activity) => {
                const reviewDestination = reviewKind(activity)
                  ? completedActivityDestination(activity.id)
                  : null;
                const roleAssessment = workoutRoleAssessment(activity, {
                  plan: state.plan,
                  goal: goalProfile,
                  weekPrescription,
                });
                return (
                  <div
                    className={`planner-workout planner-workout-compact planner-actual completed ${reviewDestination ? "planner-workout-review-open" : ""}`}
                    key={`actual-${activity.id}`}
                    role={reviewDestination ? "button" : undefined}
                    tabIndex={reviewDestination ? 0 : undefined}
                    title={reviewDestination ? "Review öffnen" : undefined}
                    aria-label={reviewDestination ? `${activity.name || activity.type || "Training"}: Review öffnen` : undefined}
                    onClick={reviewDestination ? (event) => openCompletedReview(reviewDestination, event) : undefined}
                    onKeyDown={reviewDestination ? (event) => openCompletedReviewFromKeyboard(reviewDestination, event) : undefined}
                  >
                    <div className="planner-check">✓</div>
                    <div className="planner-workout-main planner-workout-compact-main">
                      <div className="planner-compact-kicker"><span>{activityTime(activity) ? `${activityTime(activity)} · ` : ""}Erledigt</span></div>
                      <div className="planner-compact-title-row">
                        <h3>{activity.name || activity.title || activity.type || "Training"}</h3>
                        <WorkoutRoleBadges assessment={roleAssessment} className="planner-workout-roles planner-workout-roles-compact" />
                      </div>
                      <p>{activity.type || activity.sportType || "Einheit"}{Number(activity.distance || 0) ? ` · ${Number(activity.distance).toFixed(1)} km` : ""}{Number(activity.duration || 0) ? ` · ${Math.round(Number(activity.duration))} min` : ""}</p>
                    </div>
                    {reviewDestination && <span className="planner-review-cue">Review →</span>}
                  </div>
                );
              })}

              {entries.length === 0 && actuals.length === 0 ? (
                availability
                  ? availability.status === "blocked"
                    ? <div className="planner-empty planner-empty-blocked"><strong>Training frei gehalten</strong><span>Der Coach plant an diesem Tag keine Einheit.</span></div>
                    : <div className="planner-empty planner-empty-limited"><strong>Heute bewusst eingeschränkt</strong><span>{availabilityLabel(availability)}. Der Coach nutzt den Tag nur innerhalb dieser Grenze.</span></div>
                  : <button className="planner-empty" onClick={() => setEditing({ ...createBlank(weekStart), date: dateKey })}>+ frei</button>
              ) : entries.map((item) => {
                const matched = matches.get(item.id) || (item.matchedActivityId ? activityById.get(item.matchedActivityId) : null);
                const isCancelled = Boolean(item.plannedCancellation);
                const isMissed = !isCancelled && item.date < todayKey && !item.completed && !matched;
                const completed = Boolean(item.completed || matched);
                const linkedCompletion = Boolean(matched || item.matchedActivityId);
                const reviewDestination = completed && matched && reviewKind(matched)
                  ? completedActivityDestination(matched.id)
                  : null;
                const canComplete = canManuallyCompleteWorkout(item, plannerNow);
                const hasStateMarker = completed || isCancelled || canComplete;
                const trackTemplateLabel = trackWorkoutTemplateLabel(item.structuredWorkout);
                const paceLabel = loopWorkoutPaceLabel(item) || workoutPaceLabel(item, { includeSource: true });
                const loopLabel = loopWorkoutCompactLabel(item);
                const trackSyncStatus = trackPublicationStatus({
                  item,
                  approvalState: weekApprovalState,
                  publishedWeekCurrent: Boolean(publishedWeek && !planChangedAfterPublish),
                  weekWasPublished: Boolean(publishedWeek),
                });
                const roleAssessment = workoutRoleAssessment(item, {
                  plan: state.plan,
                  goal: goalProfile,
                  weekPrescription,
                });
                const compactMetrics = [
                  trackTemplateLabel,
                  item.distance ? `${Number(item.distance).toFixed(1).replace(".0", "")} km` : "",
                  matched && Number(matched.distance || item.actualDistance || 0) ? `${Number(matched.distance || item.actualDistance).toFixed(1).replace(".0", "")} km erledigt` : "",
                  item.duration ? `${Math.round(Number(item.duration))} min` : "",
                  paceLabel,
                  loopLabel,
                ].filter(Boolean).join(" · ");
                const compactStatus = completed
                  ? "Erledigt"
                  : isCancelled
                    ? "Ausgefallen"
                    : isMissed
                      ? "Rückmeldung offen"
                      : item.optional
                        ? "Optional"
                        : "";
                const garminAttention = trackSyncStatus?.action
                  ? trackSyncStatus.state === TRACK_PUBLICATION_STATES.DRAFT
                    ? "Vorläufig"
                    : trackSyncStatus.state === TRACK_PUBLICATION_STATES.INTERVALS_CONFIRMED
                      ? "Garmin prüfen"
                      : "Garmin aktualisieren"
                  : "";
                const garminCompactLabel = trackSyncStatus?.action
                  ? trackSyncStatus.state === TRACK_PUBLICATION_STATES.DRAFT
                    ? "⌚ Offen"
                    : trackSyncStatus.state === TRACK_PUBLICATION_STATES.INTERVALS_CONFIRMED
                      ? "⌚ Prüfen"
                      : "⌚ Garmin ↻"
                  : "";
                const className = `planner-workout planner-workout-compact ${completed ? "completed" : ""} ${isMissed ? "missed" : ""} ${isCancelled ? "cancelled" : ""} ${hasStateMarker ? "" : "no-marker"} ${availabilityFocusId === item.id ? "planner-workout-highlighted" : ""}`;
                const opensDetail = !completed;
                return (
                  <div
                    className={`${className} ${reviewDestination ? "planner-workout-review-open" : opensDetail ? "planner-workout-detail-open" : ""}`}
                    id={`planner-workout-${item.id}`}
                    key={item.id}
                    role={reviewDestination || opensDetail ? "button" : undefined}
                    tabIndex={reviewDestination || opensDetail ? 0 : undefined}
                    title={reviewDestination ? "Review öffnen" : opensDetail ? "Einheitsdetails öffnen" : undefined}
                    aria-label={reviewDestination ? `${item.title}: Review öffnen` : opensDetail ? `${item.title}: Einheitsdetails öffnen` : undefined}
                    onClick={reviewDestination ? (event) => openCompletedReview(reviewDestination, event) : opensDetail ? (event) => openWorkoutFromRow(item, event) : undefined}
                    onKeyDown={reviewDestination ? (event) => openCompletedReviewFromKeyboard(reviewDestination, event) : opensDetail ? (event) => openWorkoutFromKeyboard(item, event) : undefined}
                  >
                    {completed && linkedCompletion && <div className="planner-check completed" title="Erledigt" aria-label="Erledigt">✓</div>}
                    {completed && !linkedCompletion && (
                      <button
                        className="planner-check completed"
                        title="Erledigt zurücknehmen"
                        aria-label={`${item.title}: Erledigt zurücknehmen`}
                        onClick={() => updateWorkout(item.id, { completed: false, completedAt: null })}
                      >
                        ✓
                      </button>
                    )}
                    {!completed && isCancelled && <button className="planner-check cancelled" title="Ausfall zurücknehmen" aria-label={`${item.title}: Ausfall zurücknehmen`} onClick={() => restoreCancelledWorkout(item)}>×</button>}
                    {!completed && !isCancelled && canComplete && (
                      <button
                        className={`planner-check ${isMissed ? "missed" : "ready"}`}
                        title={isMissed ? "Nachträglich als erledigt markieren" : "Als erledigt markieren"}
                        aria-label={`${item.title}: Als erledigt markieren`}
                        onClick={() => updateWorkout(item.id, {
                          completed: true,
                          completedAt: new Date().toISOString(),
                          missedReason: "",
                          missedNote: "",
                          missedMeta: {},
                          plannedCancellation: false,
                        })}
                      >
                        {isMissed ? "!" : ""}
                      </button>
                    )}
                    <div className="planner-workout-main planner-workout-compact-main">
                      <div className="planner-compact-kicker">
                        <span>{workoutTimingLabel(item)}{compactStatus ? ` · ${compactStatus}` : ""}</span>
                      </div>
                      <div className="planner-compact-title-row">
                        <h3>{item.title}</h3>
                        <div className="planner-compact-trailing">
                          <WorkoutRoleBadges assessment={roleAssessment} className="planner-workout-roles planner-workout-roles-compact" />
                          {garminAttention && <em className={`planner-compact-system-alert ${trackSyncStatus?.state || ""}`} title={garminAttention} aria-label={garminAttention}>{garminCompactLabel}</em>}
                        </div>
                      </div>
                      {compactMetrics && <p>{compactMetrics}</p>}
                      {(item.missedReason || isCancelled) && <small>{item.missedReason ? `Grund: ${item.missedReason}${item.missedNote ? ` · ${item.missedNote}` : ""}` : "Einheit wurde für diese Woche aus dem Plan genommen."}</small>}
                    </div>
                    {reviewDestination
                      ? <span className="planner-review-cue">Review →</span>
                      : opensDetail && <span className="planner-detail-cue" aria-hidden="true">→</span>}
                  </div>
                );
              })}
              </div>
            </article>
          );
        })}
      </div>
      </>}

      {detailWorkout && (() => {
        const matched = matches.get(detailWorkout.id) || (detailWorkout.matchedActivityId ? activityById.get(detailWorkout.matchedActivityId) : null);
        const completed = Boolean(detailWorkout.completed || matched);
        const isCancelled = Boolean(detailWorkout.plannedCancellation);
        const isMissed = !isCancelled && detailWorkout.date < todayKey && !completed;
        const fuelRecommendation = fuelRecommendations.get(detailWorkout.id);
        const trackTemplate = trackWorkoutTemplateLabel(detailWorkout.structuredWorkout);
        const paceLabel = loopWorkoutPaceLabel(detailWorkout) || workoutPaceLabel(detailWorkout, { includeSource: true });
        const loopLabel = loopWorkoutCompactLabel(detailWorkout);
        const roleAssessment = workoutRoleAssessment(detailWorkout, {
          plan: state.plan,
          goal: goalProfile,
          weekPrescription,
        });
        const trackSyncStatus = trackPublicationStatus({
          item: detailWorkout,
          approvalState: weekApprovalState,
          publishedWeekCurrent: Boolean(publishedWeek && !planChangedAfterPublish),
          weekWasPublished: Boolean(publishedWeek),
        });
        const coachCandidate = scienceAssessment.candidates.find((candidate) => candidate.id === detailWorkout.id) || null;
        const coachCandidateDecision = coachCandidate
          ? coachSuggestionDecision(coachSuggestionDecisions, coachDecisionKey(coachCandidate))
          : null;
        const canRemoveFromPlan = detailWorkout.source === "manual" && !detailWorkout.raceEvent;
        const raceEventDetails = detailWorkout.raceEvent ? raceEventFromPlanItem(detailWorkout, weekMissionEvents) : null;
        const raceProtocol = detailWorkout.raceEvent
          ? detailWorkout.raceProtocol || buildRaceProtocolForState(state, raceEventDetails)
          : null;
        const summaryMetrics = [
          trackTemplate,
          Number(detailWorkout.distance || 0) > 0 ? `${Number(detailWorkout.distance).toFixed(1).replace(".0", "")} km` : "",
          Number(detailWorkout.duration || 0) > 0 ? `${Math.round(Number(detailWorkout.duration))} min` : "",
          paceLabel,
          loopLabel,
        ].filter(Boolean);
        return (
          <div className="modal-backdrop">
            <div className="modal planner-workout-detail-modal">
              <button type="button" className="close" onClick={() => setWorkoutDetailId(null)}>×</button>
              <div className="planner-workout-detail-head">
                <div>
                  <p className="eyebrow">{new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "2-digit", month: "2-digit" }).format(new Date(`${detailWorkout.date}T12:00:00`))} · {workoutTimingLabel(detailWorkout)}</p>
                  <h2>{detailWorkout.title}</h2>
                  <p className="planner-workout-detail-summary">{summaryMetrics.join(" · ") || detailWorkout.type || "Training"}</p>
                </div>
                <WorkoutRoleBadges assessment={roleAssessment} className="planner-workout-detail-roles" />
              </div>

              <div className="planner-workout-detail-grid">
                <section>
                  <span>Einheit</span>
                  <strong>{detailWorkout.type || "Training"}</strong>
                  <small>{detailWorkout.optional ? "Optional eingeplant" : detailWorkout.fixed || detailWorkout.commitmentId ? "Fester Termin" : "Geplante Einheit"}</small>
                </section>
                <section>
                  <span>Umfang</span>
                  <strong>{Number(detailWorkout.distance || 0) > 0 ? `${Number(detailWorkout.distance).toFixed(1).replace(".0", "")} km` : Number(detailWorkout.duration || 0) > 0 ? `${Math.round(Number(detailWorkout.duration))} min` : "Offen"}</strong>
                  <small>{Number(detailWorkout.distance || 0) > 0 && Number(detailWorkout.duration || 0) > 0 ? `${Math.round(Number(detailWorkout.duration))} min geplant` : paceLabel || "ohne weitere Vorgabe"}</small>
                </section>
                <section>
                  <span>Status</span>
                  <strong>{completed ? "Erledigt" : isCancelled ? "Ausgefallen" : isMissed ? "Rückmeldung offen" : "Geplant"}</strong>
                  <small>{matched ? matched.name || "Aktivität zugeordnet" : detailWorkout.optional ? "kann ausgelassen werden" : "Teil des Wochenplans"}</small>
                </section>
              </div>

              <section className="planner-workout-detail-purpose">
                <div><span>Trainingszweck</span><strong>{roleAssessment.title}</strong></div>
                <p>{roleAssessment.explanation}</p>
                {roleAssessment.context && <small>{roleAssessment.context}</small>}
              </section>

              {detailWorkout.notes && <section className="planner-workout-detail-note"><span>Coach-Hinweis</span><p>{detailWorkout.notes}</p></section>}

              {missedSessionDecision?.cancellationId === detailWorkout.id && (
                <section className={`planner-workout-detail-system ${missedSessionDecision.tone}`}>
                  <div><span>Coach-Einordnung</span><strong>{missedSessionDecision.title}</strong><small>{missedSessionDecision.recommendation} {missedSessionDecision.reason}</small></div>
                  {missedSessionDecision.canApply && <button type="button" onClick={() => applyMissedLongRunExtension()}>+ {missedSessionDecision.extraMinutes} min optional</button>}
                </section>
              )}

              {detailWorkout.raceEvent && raceProtocol && !completed && !isCancelled && (
                <details className="planner-race-protocol planner-workout-detail-race">
                  <summary className="planner-race-protocol-head">
                    <div>
                      <span>Race Protocol</span>
                      <strong>{raceProtocol.enabled || raceProtocol.settings.mode === "auto" ? raceProtocol.recommendation.label : "Nur Wettkampf"}</strong>
                      <small>{raceProtocol.enabled || raceProtocol.settings.mode === "auto" ? raceProtocol.recommendation.reason : "Kein zusätzlicher Race-Day-Ablauf."}</small>
                    </div>
                    <b>Plan anzeigen</b>
                  </summary>
                  <div className="planner-race-protocol-body">
                    <div className="planner-race-protocol-modes" role="group" aria-label="Race Protocol auswählen">
                      <button type="button" className={raceProtocol.settings.mode === "auto" ? "selected" : ""} onClick={() => updateRaceProtocol(detailWorkout, { mode: "auto" })}>Auto</button>
                      <button type="button" className={raceProtocol.settings.mode === "on" ? "selected" : ""} onClick={() => updateRaceProtocol(detailWorkout, { mode: "on" })}>Race Protocol</button>
                      <button type="button" className={raceProtocol.settings.mode === "off" ? "selected" : ""} onClick={() => updateRaceProtocol(detailWorkout, { mode: "off" })}>Nur Wettkampf</button>
                    </div>
                    {raceProtocol.enabled && <>
                      <div className="planner-race-protocol-timeline">
                        {raceProtocol.timeline.filter((step) => step.key !== "start").map((step) => <article key={step.key}><span>{step.time || step.relative || "vor Start"}{step.optional ? " · optional" : ""}</span><b>{step.label}</b><small>{step.detail}</small></article>)}
                      </div>
                      <details className="planner-race-protocol-options">
                        <summary>Bausteine auswählen</summary>
                        <div>
                          {[
                            ["fueling", "🥣 Pre-Race Fueling"],
                            ["hydration", "💧 Trink-Reminder"],
                            ["activation", "⚡ Race-Day Activation"],
                            ["warmup", "🏃 Warm-up"],
                            ["strides", "↗ Strides"],
                            ["calendarReminders", "🔔 Kalender-Erinnerungen"],
                          ].map(([key, label]) => <label key={key}><input type="checkbox" checked={Boolean(raceProtocol.settings.components[key])} onChange={(event) => updateRaceProtocol(detailWorkout, { components: { [key]: event.target.checked } })} /><span>{label}</span></label>)}
                        </div>
                        {raceProtocol.settings.components.activation && !raceProtocol.activationDecision.recommended && <small>{raceProtocol.activationDecision.reason}</small>}
                        {raceProtocol.settings.components.calendarReminders && !raceProtocol.startTimeKnown && <small>Kalender-Erinnerungen brauchen eine Startzeit am Event.</small>}
                      </details>
                    </>}
                  </div>
                </details>
              )}

              {trackSyncStatus && !completed && !isCancelled && !isMissed && (
                <section className={`planner-workout-detail-system ${trackSyncStatus.state}`}>
                  <div>
                    <span>Garmin</span>
                    <strong>{trackSyncStatus.label}</strong>
                    <small>{trackSyncStatus.detail}</small>
                  </div>
                  <div className="planner-track-sync-actions">
                    {trackSyncStatus.action === "edit" && <button type="button" onClick={() => openWorkoutEditor(detailWorkout)}>Finalisieren</button>}
                    {trackSyncStatus.action === "accept" && <button type="button" className="primary" onClick={acceptCurrentWeek}>{trackSyncStatus.actionLabel}</button>}
                    {trackSyncStatus.action === "publish" && <button type="button" className="primary" onClick={requestPublish}>{trackSyncStatus.actionLabel}</button>}
                    {trackSyncStatus.action === "confirm-device" && <button type="button" className="primary" onClick={() => confirmTrackOnGarmin(detailWorkout)}>{trackSyncStatus.actionLabel}</button>}
                    {trackSyncStatus.secondaryAction === "publish" && <button type="button" onClick={requestPublish}>{trackSyncStatus.secondaryActionLabel}</button>}
                  </div>
                </section>
              )}

              {coachCandidate && !completed && !isCancelled && !isMissed && !coachCandidateDecision && (
                <section className="planner-workout-detail-system coach">
                  <div>
                    <span>Coach empfiehlt</span>
                    <strong>{coachCandidate.coachAlternative?.label || "Alternative prüfen"}</strong>
                    <small>{coachCandidate.coachAlternative?.reason || coachCandidate.suggestion}</small>
                  </div>
                  <div className="planner-track-sync-actions">
                    <button type="button" className="primary" onClick={() => { applyCoachSuggestion(coachCandidate); setWorkoutDetailId(null); }}>Annehmen</button>
                    <button type="button" onClick={() => rejectCoachSuggestion(coachCandidate)}>Ablehnen</button>
                  </div>
                </section>
              )}

              {coachCandidate && coachCandidateDecision?.status === "rejected" && !completed && !isCancelled && !isMissed && (
                <section className="planner-workout-detail-system dismissed">
                  <div><span>Coach-Vorschlag</span><strong>Abgelehnt</strong><small>Die bestehende Einheit bleibt unverändert im Wochenplan.</small></div>
                  <button type="button" onClick={() => reconsiderCoachSuggestion(coachCandidate)}>Neu prüfen</button>
                </section>
              )}

              {detailWorkout.coachAlternative?.source === "weather-cycling" && !completed && !isCancelled && !isMissed && (
                <section className="planner-workout-detail-system coach">
                  <div><span>Coach-Alternative · Wetter</span><strong>{detailWorkout.coachAlternative.label}</strong><small>{detailWorkout.coachAlternative.reason}</small></div>
                  <button type="button" onClick={() => { setWorkoutDetailId(null); openAdjustment(detailWorkout.id, "replace", detailWorkout.coachAlternative.key, detailWorkout.coachAlternative); }}>Vorschlag prüfen</button>
                </section>
              )}

              {detailWorkout.choicePending && detailWorkout.choiceOptions && (
                <section className="planner-workout-detail-system coach">
                  <div><span>Samstagsentscheidung</span><strong>Einheit auswählen</strong><small>Beide Optionen belegen denselben Trainingsplatz.</small></div>
                  <div className="planner-track-sync-actions">
                    <button type="button" onClick={() => { resolveSaturdayChoice(detailWorkout, "orc"); setWorkoutDetailId(null); }}>📍 ORC Track</button>
                    <button type="button" onClick={() => { resolveSaturdayChoice(detailWorkout, "alternative"); setWorkoutDetailId(null); }}>🟢 Alternativlauf</button>
                  </div>
                </section>
              )}

              {fuelRecommendation && !completed && !isCancelled && !isMissed && (
                <Link className={`planner-workout-detail-fuel ${fuelRecommendation.warnings.length ? "warn" : ""}`} to={`/fuel?workout=${detailWorkout.id}`} onClick={() => setWorkoutDetailId(null)}>
                  <div><span>Fuel</span><strong>{fuelRecommendation.packSummary}</strong><small>{fuelRecommendation.modeLabel}{fuelRecommendation.warnings.length ? " · Bestand oder Produktdaten prüfen" : " · Strategie ist vorbereitet"}</small></div>
                  <b>Öffnen →</b>
                </Link>
              )}

              <details className="planner-workout-detail-system-meta">
                <summary>Planstatus & Systemdetails</summary>
                <div>
                  <span>Quelle <b>{String(detailWorkout.source || "planner").toUpperCase()}</b></span>
                  <span>Priorität <b>{detailWorkout.optional ? "Optional" : "Geplant"}</b></span>
                  <span>Termin <b>{detailWorkout.fixed || detailWorkout.commitmentId ? "Fixtermin" : detailWorkout.spontaneous ? "Spontan" : "Geplant"}</b></span>
                  {detailWorkout.intervalsPublishedAt && <span>Intervals <b>veröffentlicht</b></span>}
                </div>
              </details>

              <div className="planner-workout-detail-actions">
                {detailWorkout.raceEvent
                  ? <button type="button" className="primary" onClick={() => { setWorkoutDetailId(null); navigate("/mission"); }}>Ziel öffnen</button>
                  : <button type="button" className="primary" onClick={() => openWorkoutEditor(detailWorkout)}>Bearbeiten</button>}
                {!completed && isMissed && <button type="button" onClick={() => { setWorkoutDetailId(null); openMissed(detailWorkout); }}>Grund angeben</button>}
                {!completed && isCancelled && <button type="button" onClick={() => { restoreCancelledWorkout(detailWorkout); setWorkoutDetailId(null); }}>Wieder einplanen</button>}
                {!completed && !isCancelled && !isPastWeek && <button type="button" onClick={() => { setWorkoutDetailId(null); openAdjustment(detailWorkout.id, "cancel"); }}>Fällt aus</button>}
                {canRemoveFromPlan && <button type="button" className="danger" onClick={() => { setWorkoutDetailId(null); removeManualWorkout(detailWorkout); }}>Entfernen</button>}
              </div>
            </div>
          </div>
        );
      })()}

      {publishConfirmOpen && (
        <div className="modal-backdrop">
          <div className="modal planner-publish-modal">
            <button type="button" className="close" onClick={() => setPublishConfirmOpen(false)}>×</button>
            <p className="eyebrow">Woche bestätigen</p>
            <h2>Für Garmin über Intervals.icu veröffentlichen?</h2>
            <p><strong>{publishablePlan.length}</strong> zukünftige Einheit{publishablePlan.length === 1 ? "" : "en"} werden für {dayFormatter.format(weekStart)} bis {dayFormatter.format(weekEnd)} veröffentlicht.</p>
            {provisionalTrackPlan.length > 0 && <p className="planner-publish-draft-note"><strong>{provisionalTrackPlan.length} vorläufige Track-Einheit{provisionalTrackPlan.length === 1 ? "" : "en"}</strong> bleibt{provisionalTrackPlan.length === 1 ? "" : "en"} im Wochenplan und wird{provisionalTrackPlan.length === 1 ? "" : "werden"} nicht an Garmin gesendet. Eine früher gesendete Fassung wird beim Aktualisieren entfernt.</p>}
            <div className="planner-protection-list">
              <span>✓ Lauf- und Radeinheiten werden als strukturierte Workouts angelegt</span>
              <span>✓ Vorläufige Track-Workouts bleiben im Wochenplan, bis du sie ausdrücklich auf „Final“ stellst</span>
              <span>✓ Eine noch offene Samstagswahl bleibt zunächst als Kalendereintrag und wird nach deiner Entscheidung aktualisiert</span>
              <span>✓ Fußball, Stabi, Mobility und Rudern bleiben reine Kalendereinträge</span>
              <span>✓ Erneutes Senden aktualisiert bestehende Einträge statt Duplikate anzulegen</span>
              <span>✓ Entfernte Einheiten werden auch aus dieser Intervals-Woche entfernt</span>
              <span>✓ EYM bleibt die führende Fassung; direkte Änderungen in Intervals.icu können beim nächsten Update überschrieben werden</span>
            </div>
            <p className="muted"><strong>Wichtig:</strong> EI kann die Übergabe an Intervals.icu bestätigen, aber nicht sehen, ob Garmin Connect das Workout bereits auf deine Uhr synchronisiert hat. Nach dem Senden Garmin synchronisieren und wichtige Workouts einmal auf der Uhr öffnen. In Intervals.icu muss „Upload planned workouts“ aktiviert sein. Garmin erhält von Intervals.icu nur Workouts im nächsten 7-Tage-Fenster.</p>
            {publishedWeek && <p className="planner-publish-refresh-note"><strong>Erneutes Senden:</strong> Strukturierte Workouts werden in Intervals.icu diesmal gelöscht und frisch angelegt. Ein normales Update desselben Events stößt den Garmin-Export nicht zuverlässig erneut an.</p>}
            <div className="modal-actions">
              <button type="button" onClick={() => setPublishConfirmOpen(false)}>Abbrechen</button>
              <button type="button" className="primary" disabled={publishBusy} onClick={publishWeek}>{publishBusy ? "Wird gesendet …" : "Bestätigen und senden"}</button>
            </div>
          </div>
        </div>
      )}

      {adjustmentOpen && adjustmentDraft && (
        <div className="modal-backdrop">
          <form className="modal planner-modal planner-adjustment-modal" onSubmit={applyUnitAdjustment}>
            <button type="button" className="close" onClick={() => setAdjustmentOpen(false)}>×</button>
            <p className="eyebrow">Woche anpassen</p>
            <h2>Nur das ändern, was wirklich betroffen ist</h2>
            <p className="muted">Der bestehende Wochenplan bleibt stabil. Wähle nur die Einheit aus, die ersetzt, verschoben oder als ausgefallen dokumentiert werden soll.</p>

            <div className={`planner-adjustment-layout ${adjustmentDraft.action === "cancel" ? "cancel-mode" : ""}`}>
              <section className="planner-adjustment-selection">
                <h3>1. Einheit auswählen</h3>
                <div className="planner-adjustment-units">
                  {plannerDays.map((day, index) => {
                    const date = isoDate(dateForDay(weekStart, index));
                    const entries = weekPlan.filter((item) => item.date === date && !item.completed && (!item.missedReason || item.plannedCancellation) && (offsetWeeks > 0 || item.date >= todayKey));
                    if (!entries.length) return null;
                    return <div className="planner-adjustment-day" key={date}>
                      <div className="planner-adjustment-day-heading">{day} · {new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" }).format(new Date(`${date}T12:00:00`))}</div>
                      {entries.map((item) => <label className="planner-adjustment-unit" key={item.id}><input type="checkbox" checked={adjustmentDraft.selectedIds.includes(item.id)} onChange={() => toggleAdjustmentItem(item.id)} /><span><b>{workoutTimingLabel(item)} · {item.title}</b><small>{item.plannedCancellation ? `Aktuell ausgefallen · ${item.missedReason}` : `${item.type}${Number(item.distance || 0) ? ` · ${Number(item.distance).toFixed(1).replace(".0", "")} km` : ""} · ${item.duration || 0} min`}</small></span></label>)}
                    </div>;
                  })}
                </div>
              </section>

              <section className="planner-adjustment-change">
                <h3>2. Änderung festlegen</h3>
                {adjustmentDraft.coachAlternative && (
                  <div className="setup-note planner-coach-alternative">
                    <strong>Coach-Vorschlag: {adjustmentDraft.coachAlternative.label}</strong>
                    <span>{adjustmentDraft.coachAlternative.reason} Du kannst unten trotzdem jede andere freigegebene Alternative wählen.</span>
                  </div>
                )}
                <div className="planner-adjustment-actions">
                  <button type="button" className={adjustmentDraft.action === "replace" ? "selected" : ""} onClick={() => setAdjustmentDraft({ ...adjustmentDraft, action: "replace" })}>Ersetzen</button>
                  <button type="button" className={adjustmentDraft.action === "move" ? "selected" : ""} onClick={() => setAdjustmentDraft({ ...adjustmentDraft, action: "move" })}>Verschieben</button>
                  <button type="button" className={adjustmentDraft.action === "cancel" ? "selected" : ""} onClick={() => setAdjustmentDraft({ ...adjustmentDraft, action: "cancel" })}>Fällt aus</button>
                </div>
                {adjustmentDraft.action === "replace" && <label>Ersatz<select value={adjustmentDraft.replacementKey} onChange={(event) => setAdjustmentDraft({ ...adjustmentDraft, replacementKey: event.target.value })}>{replacementOptions.map((option) => <option value={option.key} key={option.key}>{option.label}</option>)}</select></label>}
                {adjustmentDraft.action === "move" && <div className="form-grid planner-move-timing"><label>Neues Datum<input type="date" min={todayKey} value={adjustmentDraft.moveDate} onChange={(event) => setAdjustmentDraft({ ...adjustmentDraft, moveDate: event.target.value })} /></label><label className="planner-spontaneous-toggle"><input type="checkbox" checked={Boolean(adjustmentDraft.moveSpontaneous)} disabled={adjustmentSelectedItems.some((item) => item.fixed || item.commitmentId)} onChange={(event) => setAdjustmentDraft({ ...adjustmentDraft, moveSpontaneous: event.target.checked, moveTime: event.target.checked ? "" : adjustmentDraft.moveTime || "18:00" })} /><span><b>Spontan</b><small>Ohne feste Uhrzeit; der Wetter-Slot bleibt nur eine Empfehlung.</small></span></label>{!adjustmentDraft.moveSpontaneous && <label>Neue Uhrzeit<input type="time" value={adjustmentDraft.moveTime} onChange={(event) => setAdjustmentDraft({ ...adjustmentDraft, moveTime: event.target.value })} /></label>}</div>}
                {adjustmentDraft.action === "cancel" && <div className="planner-cancel-fields"><label>Warum fällt die Einheit aus?<select value={adjustmentDraft.cancelReason} onChange={(event) => { const cancelReason = event.target.value; setAdjustmentDraft({ ...adjustmentDraft, cancelReason, blockDay: blocksTrainingDayByDefault(cancelReason) }); }}>{cancellationReasonOptions.map((reason) => <option key={reason}>{reason}</option>)}</select></label><label>Notiz (optional)<textarea value={adjustmentDraft.cancelNote} onChange={(event) => setAdjustmentDraft({ ...adjustmentDraft, cancelNote: event.target.value })} placeholder="z. B. Familienausflug – ganzer Tag verplant" /></label><label className="planner-block-day-toggle"><input type="checkbox" checked={Boolean(adjustmentDraft.blockDay)} onChange={(event) => setAdjustmentDraft({ ...adjustmentDraft, blockDay: event.target.checked })} /><span><b>Tag für Training blockieren</b><small>Bei der nächsten Neuplanung setzt der Coach keine Ersatz-Einheit auf diesen Tag.</small></span></label><div className="setup-note"><strong>Keine Kilometerschulden.</strong> Die Einheit bleibt mit Grund in der Historie. Der Coach prüft separat, ob der nächste Longrun unverändert bleibt oder höchstens eine kleine optionale Verlängerung verträgt.</div></div>}
                <button className="primary" type="submit" disabled={!adjustmentDraft.selectedIds.length}>{adjustmentDraft.action === "replace" ? "Ausgewählte Einheit ersetzen" : adjustmentDraft.action === "move" ? "Ausgewählte Einheit verschieben" : "Als ausgefallen markieren"}</button>
              </section>
            </div>

            <section className="planner-adjustment-preview">
              <div><p className="eyebrow">3. Änderung prüfen</p><h3>Das wird geändert</h3></div>
              {adjustmentSelectedItems.length ? <div className="planner-adjustment-preview-list">{adjustmentSelectedItems.map((item) => <article key={item.id}><div><strong>{item.day || new Intl.DateTimeFormat("de-DE", { weekday: "long" }).format(new Date(`${item.date}T12:00:00`))} · {workoutTimingLabel(item)}</strong><span>{item.title}</span></div><b>→</b><div><strong>{adjustmentDraft.action === "replace" ? adjustmentReplacementLabel || "Ersatz auswählen" : adjustmentDraft.action === "move" ? `${adjustmentDraft.moveDate || "Datum wählen"} · ${adjustmentMoveTimingLabel(item, adjustmentDraft)}` : "Wird als ausgefallen markiert"}</strong><span>{adjustmentDraft.action === "replace" ? "Andere Einheiten des Tages bleiben erhalten" : adjustmentDraft.action === "move" ? "Inhalt der Einheit bleibt gleich" : `${adjustmentDraft.cancelReason || "Grund auswählen"}${adjustmentDraft.blockDay ? " · Tag blockiert" : ""}`}</span></div></article>)}</div> : <p className="muted">Wähle links mindestens eine Einheit aus. Danach siehst du hier die konkrete Auswirkung.</p>}
              <div className="planner-adjustment-scope-note">Nicht ausgewählte Einheiten und Tage bleiben unverändert. Die Woche wird nicht neu berechnet.</div>
            </section>
          </form>
        </div>
      )}

      {planningInfoOpen && (
        <div className="modal-backdrop">
          <div className="modal planner-logic-modal">
            <button type="button" className="close" onClick={() => setPlanningInfoOpen(false)}>×</button>
            <p className="eyebrow">Planlogik</p>
            <h2>So plant dein Coach deine Woche</h2>
            <div className="planner-logic-flow">Zielanforderung <b>→</b> Athletenbasis <b>→</b> Trainingsphase <b>→</b> Reviews <b>→</b> Wochenkorridor</div>
            <p className="muted">Der Coach hält intern den langfristigen Kurs bis zum Ziel, veröffentlicht aber immer nur die nächste Woche. Der Umfang entsteht aus abgeschlossenen Trainingswochen, Zielprofil, Belastungsphase, Verfügbarkeit und Erholung. Geplante Einheiten zählen nie als bereits erreichte Entwicklung.</p>
            <div className="form-grid">
              <label>Max. Außentemperatur<input type="number" value={config.maxOutdoorTemperature || 29} onChange={(event) => patchConfig({ maxOutdoorTemperature: Number(event.target.value) })} /></label>
              <label>Max. Böen in km/h<input type="number" value={config.maxWindGust || 55} onChange={(event) => patchConfig({ maxWindGust: Number(event.target.value) })} /></label>
              <label>Letzte Phase<input readOnly value={config.lastPhase || "Noch nicht berechnet"} /></label>
              <label>Letzter Laufrahmen<input readOnly value={weekPrescription?.corridor?.label || (config.lastTarget ? `${config.lastTarget} km` : "Noch nicht berechnet")} /></label>
              <label>Wochentyp<input readOnly value={weekPrescription?.weekType?.label || "Noch nicht berechnet"} /></label>
              <label>Zielprofil<input readOnly value={config.lastGoalProfile?.disciplineLabel || goalProfile.disciplineLabel || "Noch nicht berechnet"} /></label>
              <label>Machbarkeit<input readOnly value={config.lastGoalProfile?.feasibility?.label || goalProfile.feasibility?.label || "Noch nicht geprüft"} /></label>
            </div>
            <div className="planner-protection-list">
              <span>✓ Aktive Wochen werden nur gezielt geändert</span>
              <span>✓ Ausfälle bleiben mit Grund in der Historie</span>
              <span>✓ Die nächste Woche wartet auf Reviews und geklärte Einheiten</span>
              <span>✓ Entlastung ist geplant und wird nie als Kilometerdefizit behandelt</span>
            </div>
            <button type="button" className="primary" onClick={() => setPlanningInfoOpen(false)}>Verstanden</button>
          </div>
        </div>
      )}

      {editing && (
        <div className="modal-backdrop">
          <form className={`modal planner-modal ${editingTrackWorkout ? "planner-track-modal" : ""}`} onSubmit={saveWorkout}>
            <button type="button" className="close" onClick={() => setEditing(null)}>×</button>
            <p className="eyebrow">Einheit</p>
            <h2>{state.plan.some((item) => item.id === editing.id) ? "Training bearbeiten" : "Training hinzufügen"}</h2>
            <div className="form-grid">
              <label>Datum<input type="date" value={editing.date} onChange={(event) => setEditing({ ...editing, date: event.target.value })} /></label>
              {editing.fixed || editing.commitmentId
                ? <label>Uhrzeit des Fixtermins<input type="time" value={editing.time || "18:00"} onChange={(event) => setEditing({ ...editing, spontaneous: false, time: event.target.value })} /></label>
                : <>
                  <label className="planner-spontaneous-toggle"><input type="checkbox" checked={isSpontaneousWorkout(editing)} onChange={(event) => setEditing({ ...editing, spontaneous: event.target.checked, time: event.target.checked ? "" : editing.time || "18:00" })} /><span><b>Spontan</b><small>Keine feste Uhrzeit. Das Briefing empfiehlt bei Outdoor-Einheiten den besten Wetter-Slot.</small></span></label>
                  {!isSpontaneousWorkout(editing) && <label>Uhrzeit<input type="time" value={editing.time || "18:00"} onChange={(event) => setEditing({ ...editing, time: event.target.value })} /></label>}
                </>}
              <label>Titel<input value={editing.title} onChange={(event) => setEditing({ ...editing, title: event.target.value })} required /></label>
              <label>Typ<select value={editing.type} onChange={(event) => updateEditingType(event.target.value)}>{workoutTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
              {!editingLoopWorkout && <label>Distanz in km<input type="number" min="0" step="0.1" value={editing.distance} onChange={(event) => setEditing({ ...editing, distance: event.target.value })} /></label>}
              {!editingLoopWorkout && <label>Dauer in Minuten<input type="number" min="0" value={editing.duration} onChange={(event) => setEditing({ ...editing, duration: event.target.value })} /></label>}
            </div>
            {editingLoopWorkout && editingLoop && (
              <section className="planner-loop-guidance">
                <div className="planner-loop-heading">
                  <div>
                    <p className="eyebrow">Runden-Workout</p>
                    <h3>Offizieller Rundenpunkt statt GPS-Zufall</h3>
                    <p>Die Rundenlänge bleibt eine Planungsgröße. Standardmäßig wechselst du Runde und Pause am echten Start-/Zielpunkt mit der LAP-Taste, damit Toilettenwege und GPS-Abweichungen nichts verschieben.</p>
                  </div>
                  <span>{loopModeLabel(editingLoop.mode)}</span>
                </div>

                <div className="planner-loop-metrics">
                  <div><small>Runden</small><strong>{editingLoop.loops}</strong></div>
                  <div><small>Je Runde planerisch</small><strong>{String(editingLoop.loopKm).replace(".", ",")} km</strong></div>
                  <div><small>Gesamtdistanz</small><strong>{String(editingLoopWorkout.distance).replace(".", ",")} km</strong></div>
                  <div><small>Trainingsblock</small><strong>{formatLoopDuration(editingLoopWorkout.duration, { compact: true })}</strong></div>
                </div>

                <div className="form-grid planner-loop-fields">
                  <label>Rundenzahl<input type="number" min="1" max="30" step="1" value={editing.loopTraining?.loops ?? editingLoop.loops} onChange={(event) => updateLoopTraining("loops", event.target.value)} onBlur={commitLoopTraining} /></label>
                  <label>Rundenlänge für die Planung (km)<input type="number" min="0.1" max="100" step="0.1" value={editing.loopTraining?.loopKm ?? editingLoop.loopKm} onChange={(event) => updateLoopTraining("loopKm", event.target.value)} onBlur={commitLoopTraining} /></label>
                  <label>Rundenformat<select value={editing.loopTraining?.mode || editingLoop.mode} onChange={(event) => updateLoopTraining("mode", event.target.value)} onBlur={commitLoopTraining}><option value={LOOP_MODES.FIXED_INTERVAL}>Fester Starttakt · Backyard</option><option value={LOOP_MODES.TIME_LIMIT}>Gesamtzeitlimit · Heartbeat/Stundenlauf</option><option value={LOOP_MODES.FREE}>Freier Rundkurs</option></select></label>
                  {editingLoop.mode === LOOP_MODES.FIXED_INTERVAL && <label>Starttakt je Runde (Minuten)<input type="number" min="10" max="240" step="1" value={editing.loopTraining?.intervalMinutes ?? editingLoop.intervalMinutes} onChange={(event) => updateLoopTraining("intervalMinutes", event.target.value)} onBlur={commitLoopTraining} /><small>{editingLoop.loops} Runden ergeben einen Block von {formatLoopDuration(editingLoopWorkout.duration, { compact: true })}.</small></label>}
                  {editingLoop.mode === LOOP_MODES.TIME_LIMIT && <>
                    <label>Event-Zeitlimit (hh:mm:ss)<input type="text" inputMode="numeric" pattern="[0-9]{1,3}:[0-5][0-9]:[0-5][0-9]" value={editing.loopTraining?.eventTimeLimit ?? editingLoop.eventTimeLimit} onChange={(event) => updateLoopTraining("eventTimeLimit", event.target.value)} onBlur={commitLoopTraining} /></label>
                    <label>Zieldistanz des Events (km)<input type="number" min="0.1" step="0.1" value={editing.loopTraining?.targetKm ?? editingLoop.targetKm} onChange={(event) => updateLoopTraining("targetKm", event.target.value)} onBlur={commitLoopTraining} /></label>
                    <label>Geplanter Boxenstopp (Minuten)<input type="number" min="0" max="60" step="0.5" value={editing.loopTraining?.plannedStopMinutes ?? editingLoop.plannedStopMinutes} onChange={(event) => updateLoopTraining("plannedStopMinutes", event.target.value)} onBlur={commitLoopTraining} /></label>
                  </>}
                </div>

                <div className="planner-loop-control">
                  <div><p className="eyebrow">Garmin-Rundensteuerung</p><h4>{loopControlLabel(editingLoop.controlMode)}</h4></div>
                  <div className="planner-pace-mode" role="group" aria-label="Rundenende auf Garmin">
                    <button type="button" className={editingLoop.controlMode === LOOP_CONTROL_MODES.MANUAL_LAP ? "selected" : ""} onClick={() => setLoopControlMode(LOOP_CONTROL_MODES.MANUAL_LAP)}>Manuell per LAP</button>
                    <button type="button" className={editingLoop.controlMode === LOOP_CONTROL_MODES.AUTOMATIC_DISTANCE ? "selected" : ""} onClick={() => setLoopControlMode(LOOP_CONTROL_MODES.AUTOMATIC_DISTANCE)}>Automatisch nach Distanz</button>
                  </div>
                </div>
                {editingLoop.controlMode === LOOP_CONTROL_MODES.AUTOMATIC_DISTANCE && <p className="planner-loop-warning">Bei offiziellen Rundenevents kann Garmin durch Toilettenwege, Verpflegungsbewegung oder GPS-Abweichungen zu früh umschalten. Manuelle LAP-Steuerung ist deshalb der Standard.</p>}

                <div className="planner-loop-control pace-control">
                  <div><p className="eyebrow">Pace-Vorgabe</p><h4>{loopWorkoutPaceLabel(editingLoopWorkout, { includeNone: true })}</h4></div>
                  <div className="planner-pace-mode planner-loop-pace-mode" role="group" aria-label="Pace-Ziel für das Loop-Workout">
                    <button type="button" className={editingLoopPaceMode === LOOP_PACE_MODES.NONE ? "selected" : ""} onClick={() => setLoopPaceMode(LOOP_PACE_MODES.NONE)}>Keine Vorgabe</button>
                    <button type="button" className={editingLoopPaceMode === LOOP_PACE_MODES.COACH ? "selected" : ""} disabled={!editingLoop.coachFaster || !editingLoop.coachSlower} onClick={() => setLoopPaceMode(LOOP_PACE_MODES.COACH)}>Coach-Empfehlung</button>
                    <button type="button" className={editingLoopPaceMode === LOOP_PACE_MODES.CUSTOM ? "selected" : ""} onClick={() => setLoopPaceMode(LOOP_PACE_MODES.CUSTOM)}>Eigener Bereich</button>
                  </div>
                </div>
                {editingLoopPaceMode === LOOP_PACE_MODES.CUSTOM && <div className="form-grid planner-pace-fields">
                  <label>Schneller Rand /km<input type="text" inputMode="decimal" pattern="[0-9]{1,2}[:.,][0-5][0-9]" placeholder={editingLoop.coachFaster || "7:00"} value={editing.loopTraining?.faster || ""} onChange={(event) => updateLoopTraining("faster", event.target.value)} onBlur={commitLoopTraining} /></label>
                  <label>Langsamer Rand /km<input type="text" inputMode="decimal" pattern="[0-9]{1,2}[:.,][0-5][0-9]" placeholder={editingLoop.coachSlower || "7:40"} value={editing.loopTraining?.slower || ""} onChange={(event) => updateLoopTraining("slower", event.target.value)} onBlur={commitLoopTraining} /></label>
                </div>}
                {editingLoopPaceMode === LOOP_PACE_MODES.COACH && <div className="planner-pace-preview"><div><small>Garmin erhält</small><strong>{editingLoop.coachFaster}–{editingLoop.coachSlower}/km</strong></div><span>Der Coach setzt nur den Pace-Bereich. Rundenende und Pause bleiben weiterhin LAP-gesteuert.</span></div>}
                {editingLoopPaceMode === LOOP_PACE_MODES.NONE && <div className="planner-pace-preview no-target"><div><small>Garmin erhält</small><strong>Kein Pace-Ziel</strong></div><span>Die Uhr führt nur durch Runde und Boxenstopp. Du steuerst das Backyard-/Ultra-Pacing intuitiv.</span></div>}

                <div className="planner-loop-garmin-flow">
                  {Array.from({ length: Math.min(editingLoop.loops, 4) }, (_, index) => <span key={index}><b>Runde {index + 1}</b><small>{editingLoop.controlMode === LOOP_CONTROL_MODES.MANUAL_LAP ? "bis LAP" : `${String(editingLoop.loopKm).replace(".", ",")} km automatisch`}</small>{index < editingLoop.loops - 1 && <em>Pause bis LAP</em>}</span>)}
                  {editingLoop.loops > 4 && <span><b>+ {editingLoop.loops - 4} Runden</b><small>gleicher Ablauf</small></span>}
                </div>

                {editingLoop.mode === LOOP_MODES.TIME_LIMIT && editingLoop.matchPlan && <div className="planner-loop-matchplan">
                  <div><small>Event-Zeitlimit</small><strong>{formatLoopDuration(editingLoop.matchPlan.timeLimitMinutes, { compact: true })}</strong></div>
                  <div><small>Budget je Runde</small><strong>{formatLoopDuration(editingLoop.matchPlan.averageLoopBudgetMinutes)}</strong></div>
                  <div><small>Boxenstopp</small><strong>{String(editingLoop.matchPlan.plannedStopMinutes).replace(".", ",")} min</strong></div>
                  <div><small>Laufbudget je Runde</small><strong>{formatLoopDuration(editingLoop.matchPlan.runBudgetMinutes)}</strong></div>
                  <div><small>Späteste Ø-Pace ohne Puffer</small><strong>{editingLoop.matchPlan.requiredPace}/km</strong></div>
                  <p>{editingLoop.matchPlan.targetLoops} offizielle Runden ergeben {String(editingLoop.matchPlan.plannedDistanceKm).replace(".", ",")} km{Math.abs(editingLoop.matchPlan.distanceDeltaKm) >= 0.05 ? ` und bilden das ${String(editingLoop.matchPlan.targetKm).replace(".", ",")}-km-Ziel praxisnah ab` : ""}. Die Pace ist die rechnerische Obergrenze ohne Sicherheitspuffer. Diese Rechnung bleibt in der App; Garmin schaltet nicht nach theoretischen GPS-Kilometern um.</p>
                </div>}
              </section>
            )}
            {editingSupportsPaceGuidance && (
              <section className="planner-pace-guidance">
                <div className="planner-pace-guidance-heading">
                  <div>
                    <p className="eyebrow">Pace-Steuerung</p>
                    <h3>Coach-Empfehlung und Garmin-Ziel</h3>
                    <p>Die gleiche Pace, die du hier siehst, wird an Intervals.icu und anschließend an Garmin übertragen. Damit stimmen Plan, Dauer und Hinweistöne überein.</p>
                  </div>
                  <div className="planner-pace-mode" role="group" aria-label="Pace-Ziel für Garmin">
                    <button type="button" className={editingPaceMode === "range" ? "selected" : ""} disabled={!editingRecommendedFaster || !editingRecommendedSlower} onClick={() => setPaceGuidanceMode("range")}>Pace-Bereich</button>
                    <button type="button" className={editingPaceMode === "none" ? "selected" : ""} onClick={() => setPaceGuidanceMode("none")}>Ohne Pace-Ziel</button>
                  </div>
                </div>
                {editingPaceMode === "range" ? (
                  <>
                    <div className="form-grid planner-pace-fields">
                      <label>Schneller Rand /km<input type="text" inputMode="decimal" pattern="[0-9]{1,2}[:.,][0-5][0-9]" placeholder="z. B. 6:00" value={editing.paceGuidance?.faster || editingRecommendedFaster} onChange={(event) => updatePaceGuidance("faster", event.target.value)} onBlur={commitPaceGuidance} /></label>
                      <label>Langsamer Rand /km<input type="text" inputMode="decimal" pattern="[0-9]{1,2}[:.,][0-5][0-9]" placeholder="z. B. 6:30" value={editing.paceGuidance?.slower || editingRecommendedSlower} onChange={(event) => updatePaceGuidance("slower", event.target.value)} onBlur={commitPaceGuidance} /></label>
                    </div>
                    <div className="planner-pace-preview">
                      <div><small>Garmin erhält</small><strong>{editing.paceGuidance?.faster || editingRecommendedFaster}–{editing.paceGuidance?.slower || editingRecommendedSlower}/km</strong></div>
                      <span>Die geplante Dauer wird beim Speichern aus der Mitte des Bereichs berechnet.</span>
                    </div>
                    {editingRecommendedFaster && editingRecommendedSlower && (
                      <button type="button" className="planner-pace-reset" onClick={restoreCoachPaceGuidance}>Coach-Vorschlag {editingRecommendedFaster}–{editingRecommendedSlower}/km wiederherstellen</button>
                    )}
                  </>
                ) : (
                  <div className="planner-pace-preview no-target">
                    <div><small>Garmin erhält</small><strong>Kein Pace-Ziel</strong></div>
                    <span>Distanz und Trainingsschritt bleiben erhalten, aber die Uhr gibt keine Zu-schnell- oder Zu-langsam-Alarme aus.</span>
                  </div>
                )}
              </section>
            )}
            {editingTrackWorkout && (
              <section className="planner-track-builder">
                <div className="planner-track-builder-head">
                  <div>
                    <p className="eyebrow">Track Workout</p>
                    <h3>Abfolge festlegen</h3>
                    <p>Warm-up und Cool-down bleiben offen. Für den Hauptteil entscheidest du, ob Garmin automatisch weiterschaltet oder du auf der Bahn selbst mit LAP steuerst.</p>
                  </div>
                  <span>{editingTrackWorkout.mainControlMode === TRACK_MAIN_CONTROL_MODES.MANUAL_LAP ? "LAP auf Bahn" : "Automatisch"}</span>
                </div>
                <div className="planner-track-control-mode" role="group" aria-label="Steuerung des Hauptteils">
                  <button type="button" className={editingTrackWorkout.mainControlMode !== TRACK_MAIN_CONTROL_MODES.MANUAL_LAP ? "selected" : ""} onClick={() => updateTrackWorkout("mainControlMode", TRACK_MAIN_CONTROL_MODES.AUTOMATIC)}>
                    <strong>Automatisch</strong>
                    <small>Distanz oder Zeit beendet jeden Schritt selbst.</small>
                  </button>
                  <button type="button" className={editingTrackWorkout.mainControlMode === TRACK_MAIN_CONTROL_MODES.MANUAL_LAP ? "selected" : ""} onClick={() => updateTrackWorkout("mainControlMode", TRACK_MAIN_CONTROL_MODES.MANUAL_LAP)}>
                    <strong>LAP auf Bahn</strong>
                    <small>Distanzschritte enden erst mit LAP. Zeitintervalle wie 20-s-Strides laufen weiter automatisch.</small>
                  </button>
                </div>
                <div className={`planner-track-planning-status ${editingTrackWorkout.planningStatus === "draft" ? "draft" : "final"}`}>
                  <div>
                    <strong>Planungsstand</strong>
                    <small>{editingTrackWorkout.planningStatus === "draft"
                      ? "Im Wochenplan speichern, aber noch nicht an Garmin senden. Ideal, wenn Runden oder Pausen erst am Trainingstag feststehen."
                      : "Die Abfolge ist lokal final, aber noch nicht automatisch übertragen. Nach dem Speichern musst du den Wochenplan annehmen und anschließend an Garmin senden bzw. aktualisieren."}</small>
                  </div>
                  <div role="group" aria-label="Planungsstand des Track-Workouts">
                    <button type="button" className={editingTrackWorkout.planningStatus === "draft" ? "selected" : ""} onClick={() => updateTrackWorkout("planningStatus", "draft")}>Vorläufig</button>
                    <button type="button" className={editingTrackWorkout.planningStatus === "final" ? "selected" : ""} onClick={() => updateTrackWorkout("planningStatus", "final")}>Final freigeben</button>
                  </div>
                </div>
                <details className="planner-track-archive planner-track-archive-details">
                  <summary className="planner-track-archive-heading">
                    <div><p className="eyebrow">Vorlagen</p><h4>Bewährte Einheit laden oder speichern</h4></div>
                    <span>{trackWorkoutTemplates.length} gespeichert</span>
                  </summary>
                  <div className="planner-track-archive-body">
                  <div className="form-grid">
                    <label>Vorlage auswählen
                      <select value={editingTrackWorkout.templateId || ""} onChange={(event) => selectTrackTemplate(event.target.value)}>
                        <option value="">Neues Workout / keine Vorlage</option>
                        {trackWorkoutTemplates.map((template) => <option value={template.id} key={template.id}>{template.name} · {template.kind === "sprints" ? "Sprints" : "Intervalle"}</option>)}
                      </select>
                    </label>
                    <label>Name der Vorlage
                      <input maxLength="80" value={editingTrackWorkout.templateName || ""} onChange={(event) => updateTrackWorkout("templateName", event.target.value)} placeholder="z. B. 1200/800 Mix" />
                    </label>
                  </div>
                  <div className="planner-track-archive-actions">
                    {editingTrackWorkout.templateId
                      ? <><button type="button" onClick={() => saveTrackTemplate(false)} disabled={!editingTrackWorkout.templateName?.trim()}>Vorlage aktualisieren</button><button type="button" onClick={() => saveTrackTemplate(true)} disabled={!editingTrackWorkout.templateName?.trim()}>Als neue Vorlage speichern</button><button type="button" className="danger" onClick={deleteTrackTemplate}>Aus Archiv entfernen</button></>
                      : <button type="button" onClick={() => saveTrackTemplate(true)} disabled={!editingTrackWorkout.templateName?.trim()}>Im Archiv speichern</button>}
                  </div>
                  <small>Auswählen kopiert die Vorlage in diesen Termin. Änderungen am Termin bleiben lokal, bis du ausdrücklich „Vorlage aktualisieren“ wählst.</small>
                  </div>
                </details>
                <div className="planner-track-lap-flow" aria-label="Workout-Ablauf">
                  <span><b>Warm-up</b><small>bis LAP</small></span>
                  <strong>→</strong>
                  <span><b>{editingTrackWorkout.rounds}× Hauptteil</b><small>{editingTrackWorkout.mainControlMode === TRACK_MAIN_CONTROL_MODES.MANUAL_LAP ? "Distanz per LAP · Zeit automatisch" : "automatisch"}</small></span>
                  <strong>→</strong>
                  <span><b>Cool-down</b><small>bis LAP</small></span>
                </div>
                <div className="planner-track-settings planner-track-compact-settings">
                  <label><span>Art</span><select value={editingTrackWorkout.kind} onChange={(event) => updateTrackWorkout("kind", event.target.value)}><option value="intervals">Intervalle</option><option value="sprints">Sprints / Strides</option></select></label>
                  <label><span>Durchgänge</span><input type="number" min="1" max="30" value={editingTrackWorkout.rounds} onChange={(event) => updateTrackWorkout("rounds", event.target.value)} onBlur={commitTrackRounds} /></label>
                </div>
                <div className="planner-track-sequence">
                  <div className="planner-track-sequence-heading">
                    <div><strong>Schritte je Durchgang</strong><small>{editingTrackWorkout.mainControlMode === TRACK_MAIN_CONTROL_MODES.MANUAL_LAP ? "Auf der Bahn zeigen die Hinweise Distanz und Zielpace; du drückst am echten Runden-/Abschnittsende LAP." : "Garmin beendet die Schritte automatisch nach Distanz oder Zeit."} „510“ wird automatisch zu „5:10“.</small></div>
                    <span>{editingTrackWorkout.steps.length}/16</span>
                  </div>
                  {editingTrackWorkout.steps.map((step, index) => (
                    <article className={step.kind} key={`${index}-${step.kind}`}>
                      <b>{index + 1}</b>
                      <label><span>Abschnitt</span><select value={step.kind} onChange={(event) => updateTrackStep(index, "kind", event.target.value)}><option value="work">Belastung</option><option value="recovery">Pause</option></select></label>
                      <label><span>Einheit</span><select value={step.unit} onChange={(event) => updateTrackStep(index, "unit", event.target.value)}><option value="distance">Meter</option><option value="time">Sekunden</option></select></label>
                      <label><span>Wert</span><input type="number" min={step.unit === "distance" ? "20" : "5"} max={step.unit === "distance" ? "5000" : "3600"} value={step.value} onChange={(event) => updateTrackStep(index, "value", event.target.value)} onBlur={() => commitTrackStep(index)} /></label>
                      <label><span>Ziel-Pace /km</span><input type="text" inputMode="numeric" pattern="[0-9]{1,2}[:.,][0-5][0-9]" placeholder="z. B. 4:40 oder 440" title="Pace als 4:40 oder 440 eingeben" value={step.targetPace || ""} onChange={(event) => updateTrackStep(index, "targetPace", formatTrackPaceInput(event.target.value))} onBlur={() => commitTrackStep(index)} /></label>
                      <label><span>Toleranz</span><select value={step.paceToleranceSeconds ?? 5} disabled={!step.targetPace} onChange={(event) => updateTrackStep(index, "paceToleranceSeconds", Number(event.target.value))}><option value="5">± 5 Sek.</option><option value="10">± 10 Sek.</option><option value="15">± 15 Sek.</option><option value="20">± 20 Sek.</option><option value="30">± 30 Sek.</option></select></label>
                      <div className="planner-track-garmin-cue"><small>Auf Garmin</small><strong>{editingTrackWorkout.mainControlMode === TRACK_MAIN_CONTROL_MODES.MANUAL_LAP && step.unit === "distance" ? "LAP · " : ""}{trackStepGarminCue(step)}</strong></div>
                      <div className="planner-track-step-actions">
                        <button type="button" onClick={() => moveTrackStep(index, -1)} disabled={index === 0} aria-label={`Schritt ${index + 1} nach oben`}>↑</button>
                        <button type="button" onClick={() => moveTrackStep(index, 1)} disabled={index === editingTrackWorkout.steps.length - 1} aria-label={`Schritt ${index + 1} nach unten`}>↓</button>
                        <button type="button" className="danger" onClick={() => removeTrackStep(index)} disabled={editingTrackWorkout.steps.length === 1} aria-label={`Schritt ${index + 1} entfernen`}>×</button>
                      </div>
                    </article>
                  ))}
                  <div className="planner-track-add-actions">
                    <button type="button" onClick={() => addTrackStep("work")} disabled={editingTrackWorkout.steps.length >= 16}>+ Belastung</button>
                    <button type="button" onClick={() => addTrackStep("recovery")} disabled={editingTrackWorkout.steps.length >= 16}>+ Pause</button>
                  </div>
                </div>
                <strong className="planner-track-summary">{trackWorkoutSummary(editingTrackWorkout)}</strong>
                <div className="planner-track-distance" aria-label="Berechnete Track-Distanz">
                  <div>
                    <small>Hauptteil</small>
                    <strong>{trackDistanceFormatter.format(editingTrackDistance.mainDistanceKm)} km{editingTrackDistance.hasTimedSteps ? " + Zeit" : ""}</strong>
                    <span>{trackDistanceFormatter.format(editingTrackDistance.workDistanceKm)} km Belastung · {trackDistanceFormatter.format(editingTrackDistance.recoveryDistanceKm)} km Pausen</span>
                  </div>
                  <div>
                    <small>Warm-up & Cool-down</small>
                    <strong>je ca. 2–3 km</strong>
                    <span>bleiben auf Garmin per LAP offen</span>
                  </div>
                  <div>
                    <small>{editingTrackDistance.hasTimedSteps ? "Bekannte Mindestdistanz" : "Gesamt geschätzt"}</small>
                    <strong>{editingTrackDistance.hasTimedSteps ? "ab " : ""}{trackDistanceFormatter.format(editingTrackDistance.estimatedTotalMinKm)}{editingTrackDistance.hasTimedSteps ? "" : `–${trackDistanceFormatter.format(editingTrackDistance.estimatedTotalMaxKm)}`} km</strong>
                    <span>{editingTrackDistance.hasTimedSteps ? `plus ${trackDurationLabel(editingTrackDistance.timedSeconds)} zeitgesteuerte Abschnitte` : "inklusive Ein- und Auslaufen"}</span>
                  </div>
                </div>
                <small>{editingTrackWorkout.mainControlMode === TRACK_MAIN_CONTROL_MODES.MANUAL_LAP ? "LAP auf Bahn: Distanzschritte bleiben auf Garmin offen, bis du LAP drückst. Die angegebene Distanz steht im Hinweis; dadurch beendet GPS den Abschnitt nicht vor deiner echten Bahnmarkierung. Zeitbasierte Schritte bleiben automatisch." : "Automatisch: Distanz- und Zeitvorgaben schalten Garmin selbstständig zum nächsten Schritt."} Belastungen können zusätzlich einen Pace-Korridor und einen Hinweis wie „600er @ 4:30/km“ erhalten. Intervals.icu benötigt bei der Garmin-Verbindung „Upload planned workouts“.</small>
              </section>
            )}
            <label>Notiz<textarea value={editing.notes} onChange={(event) => setEditing({ ...editing, notes: event.target.value })} /></label>
            <label className="planner-optional"><input type="checkbox" checked={editing.optional} onChange={(event) => setEditing({ ...editing, optional: event.target.checked })} /> Einheit ist optional</label>
            <button className="primary" type="submit">{editingTrackWorkout ? (editingTrackWorkout.planningStatus === "final" ? "Final speichern" : "Vorläufig speichern") : "Speichern"}</button>
          </form>
        </div>
      )}


      {pendingPlanChange && (
        <div className="modal-backdrop">
          <section className="modal planner-plan-change-preview" role="dialog" aria-modal="true" aria-labelledby="plan-change-preview-title">
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Sichere Planänderung</p>
                <h2 id="plan-change-preview-title">Vorher sehen, dann entscheiden</h2>
              </div>
              <button type="button" onClick={() => { setPendingPlanChange(null); setStatus("Planvorschau geschlossen. Der bestehende Wochenplan blieb unverändert."); }}>Schließen</button>
            </div>

            {pendingPlanChange.generated.weekPrescription && (
              <section className={`planner-change-prescription ${pendingPlanChange.generated.weekPrescription.weekType?.tone || "neutral"}`}>
                <div>
                  <span>Geplanter Wochentyp</span>
                  <strong>{pendingPlanChange.generated.weekPrescription.weekType?.label}</strong>
                  <small>{pendingPlanChange.generated.weekPrescription.focus}</small>
                </div>
                <div>
                  <b>{pendingPlanChange.generated.weekPrescription.corridor?.label}</b>
                  <span>automatischer Korridor</span>
                </div>
              </section>
            )}

            {pendingPlanChange.generated.planningConstraints?.length > 0 && (
              <section className="planner-change-constraints">
                <div>
                  <span>So berücksichtigt der Coach die Woche</span>
                  <strong>{pendingPlanChange.generated.planningConstraints.length} angepasste{pendingPlanChange.generated.planningConstraints.length === 1 ? "r Tag" : " Tage"}</strong>
                </div>
                <ul>
                  {pendingPlanChange.generated.planningConstraints.map((constraint) => (
                    <li key={`${constraint.date}-${constraint.reason}`}>
                      <b>{planChangeDateLabel(constraint.date)}</b>
                      <span>{planningConstraintLabel(constraint)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <div className="planner-change-summary">
              <article>
                <span>Wochenumfang vorher</span>
                <strong>{pendingPlanChange.preview.beforeRunningKm.toFixed(1).replace(".0", "")} km</strong>
              </article>
              <article>
                <span>Wochenumfang nachher</span>
                <strong>{pendingPlanChange.preview.afterRunningKm.toFixed(1).replace(".0", "")} km</strong>
              </article>
              <article className={pendingPlanChange.preview.deltaRunningKm < -0.01 ? "reduced" : pendingPlanChange.preview.deltaRunningKm > 0.01 ? "increased" : "neutral"}>
                <span>Auswirkung</span>
                <strong>{Math.abs(pendingPlanChange.preview.deltaRunningKm) < 0.01
                  ? "Umfang unverändert"
                  : `${pendingPlanChange.preview.deltaRunningKm > 0 ? "+" : "−"}${Math.abs(pendingPlanChange.preview.deltaRunningKm).toFixed(1).replace(".0", "")} km`}</strong>
              </article>
            </div>

            {pendingPlanChange.preview.hasChanges ? (
              <div className="planner-change-sections">
                {pendingPlanChange.preview.changed.length > 0 && (
                  <section>
                    <div className="planner-change-section-heading"><span>Wird angepasst</span><strong>{pendingPlanChange.preview.changed.length}</strong></div>
                    <div className="planner-change-list changed">
                      {pendingPlanChange.preview.changed.map((change, index) => (
                        <article key={`${change.before.id || index}-${change.after.id || index}`}>
                          <div>
                            <small>Bisher · {planChangeDateLabel(change.before.date)}</small>
                            <strong>{change.before.title}</strong>
                            <span>{planChangeMetricLabel(change.before)}</span>
                          </div>
                          <b aria-hidden="true">→</b>
                          <div>
                            <small>Neu · {planChangeDateLabel(change.after.date)}</small>
                            <strong>{change.after.title}</strong>
                            <span>{planChangeMetricLabel(change.after)}</span>
                          </div>
                          <em>{planChangeFieldsLabel(change.fields)}</em>
                        </article>
                      ))}
                    </div>
                  </section>
                )}

                <div className="planner-change-secondary-grid">
                  {pendingPlanChange.preview.added.length > 0 && (
                    <section className="added">
                      <div className="planner-change-section-heading"><span>Kommt hinzu</span><strong>{pendingPlanChange.preview.added.length}</strong></div>
                      <ul>{pendingPlanChange.preview.added.map((item, index) => <li key={item.id || `${item.date}-${index}`}><b>{planChangeDateLabel(item.date)} · {item.title}</b><span>{planChangeMetricLabel(item)}</span></li>)}</ul>
                    </section>
                  )}
                  {pendingPlanChange.preview.removed.length > 0 && (
                    <section className="removed">
                      <div className="planner-change-section-heading"><span>Entfällt</span><strong>{pendingPlanChange.preview.removed.length}</strong></div>
                      <ul>{pendingPlanChange.preview.removed.map((item, index) => <li key={item.id || `${item.date}-${index}`}><b>{planChangeDateLabel(item.date)} · {item.title}</b><span>{planChangeMetricLabel(item)}</span></li>)}</ul>
                    </section>
                  )}
                </div>
              </div>
            ) : (
              <div className="planner-change-empty">
                <strong>Keine Einheit muss verändert werden.</strong>
                <p>Der aktuelle Wochenplan passt bereits zu Check-in, Zielphase und erkannter Zusatzbelastung. Die neue Berechnung würde nur die Coach-Datengrundlage aktualisieren.</p>
              </div>
            )}

            <div className="planner-change-protection">
              <b>Geschützt</b>
              <span>{pendingPlanChange.preview.unchangedCount} bestehende Einheit{pendingPlanChange.preview.unchangedCount === 1 ? " bleibt" : "en bleiben"} unverändert. Absolvierte Einheiten, dokumentierte Ausfälle, vergangene Tage und manuelle Einträge werden nicht überschrieben.</span>
            </div>

            <div className="modal-actions planner-change-actions">
              <button type="button" onClick={() => {
                const mode = pendingPlanChange.mode;
                setPendingPlanChange(null);
                setPlanningMode(mode);
                setPlanningOpen(true);
                setStatus("Check-in geöffnet. Der bestehende Plan ist weiterhin unverändert.");
              }}>Check-in ändern</button>
              <button type="button" onClick={() => { setPendingPlanChange(null); setStatus("Keine Änderung übernommen. Der bestehende Wochenplan bleibt bestehen."); }}>Abbrechen</button>
              <button type="button" className="primary" onClick={applyPendingPlanChange}>{pendingPlanChange.preview.hasChanges ? "Änderungen übernehmen" : "Berechnung übernehmen"}</button>
            </div>
          </section>
        </div>
      )}

      {crossTrainingPreviewOpen && (
        <div className="modal-backdrop">
          <section className="modal planner-cross-training-preview" role="dialog" aria-modal="true" aria-labelledby="cross-training-preview-title">
            <div className="modal-heading">
              <div><p className="eyebrow">Zusatzbelastung einordnen</p><h2 id="cross-training-preview-title">Erst Reaktion verstehen, dann planen</h2></div>
              <button type="button" onClick={() => setCrossTrainingPreviewOpen(false)}>Schließen</button>
            </div>
            <p>{crossTrainingLabel || "Die erkannte Zusatzbelastung"} bleibt von deinem Laufumfang getrennt. EI rechnet keine Fußball- oder Rennradkilometer gegen geplante Laufkilometer.</p>
            <div className="planner-cross-training-preview-grid">
              <article>
                <span>Persönlicher Vergleich</span>
                <strong>{crossTrainingContextLabel}</strong>
                {crossTrainingPreview.actionable.length ? <ul>{crossTrainingPreview.actionable.map((detail) => <li key={detail.activityId || detail.activityAt}><b>{detail.label}</b> · {detail.comparison} {detail.reviewLabel}.</li>)}</ul> : <p>Die Belastung liegt aktuell im erwarteten persönlichen Rahmen.</p>}
              </article>
              <article className="protected">
                <span>Was darf sich ändern?</span>
                <strong>{crossTrainingSummary.impactLevel === "adjust" ? "Nur flexible Folgeeinheiten" : "Noch nichts"}</strong>
                {crossTrainingSummary.impactLevel === "adjust" && crossTrainingPreview.hasEligible ? <ul>{crossTrainingPreview.eligible.map((item) => <li key={item.id}>{item.date} · {item.title}{Number(item.distance || 0) ? ` · ${Number(item.distance).toFixed(1).replace(".0", "")} km` : ""}</li>)}</ul> : <p>{crossTrainingSummary.impactLevel === "review" ? "Der Coach wartet auf dein Review und ändert vorher keinen Lauf." : "Schlüsselreize, Longrun und feste Termine bleiben geschützt."}</p>}
              </article>
            </div>
            <p className="planner-cross-training-preview-note">{crossTrainingSummary.impactLevel === "review" ? "Nach dem Review wird neu bewertet, ob überhaupt eine Anpassung nötig ist." : "Eine Anpassung entsteht aus deiner tatsächlichen Reaktion auf die Belastung – nicht aus einer Kilometer-Umrechnung der anderen Sportart."}</p>
            <div className="modal-actions">
              <button type="button" onClick={() => setCrossTrainingPreviewOpen(false)}>Schließen</button>
              {crossTrainingSummary.impactLevel === "adjust" && <button type="button" className="primary" onClick={() => { setCrossTrainingPreviewOpen(false); replanCurrentWeek(); }}>Neuplanung öffnen</button>}
            </div>
          </section>
        </div>
      )}

      {planningOpen && planningDraft && (
        <div className="modal-backdrop">
          <form className="modal planner-modal planner-setup" onSubmit={(event) => { event.preventDefault(); generate(planningDraft); }}>
            <button type="button" className="close" onClick={() => setPlanningOpen(false)}>×</button>
            <p className="eyebrow">{planningMode === "replan" ? "Wochenplan neu berechnen" : "Intelligente Wochenplanung"}</p>
            <h2>{planningMode === "replan" ? "Woche wirklich neu planen?" : "Wie geht es dir – und wann hast du Zeit?"}</h2>
            <p className="muted">Dein Hauptziel legt Fähigkeiten, Phase und notwendige Schlüsseleinheiten fest. Die letzten Trainingswochen und dieser Check-in bestimmen, wie viel davon aktuell sicher umsetzbar ist. Erholungssignale können jederzeit eine frühere Entlastung auslösen.</p>
            {planningMode === "replan" && <div className="planner-replan-notice"><strong>Der bestehende Entwurf bleibt vollständig erhalten.</strong><span>Zuerst berechnet der Coach eine exakte Vorher-/Nachher-Vorschau. Erst wenn du diese anschließend bestätigst, werden zukünftige Coach-Einheiten ersetzt. Bereits absolvierte Einheiten, dokumentierte Ausfälle und manuell angelegte Einträge bleiben geschützt.</span></div>}

            {(reasonCounts.fatigue > 0 || reasonCounts.pain > 0 || reasonCounts.illness > 0) && (
              <div className="planner-history-alert">
                <strong>Rückfragen aus den letzten drei Wochen</strong>
                {reasonCounts.fatigue > 0 && <span>{reasonCounts.fatigue} × Müdigkeit: Ist sie inzwischen besser?</span>}
                {reasonCounts.pain > 0 && <span>{reasonCounts.pain} × Schmerzen: Sind sie abgeklungen?</span>}
                {reasonCounts.illness > 0 && <span>{reasonCounts.illness} × Krankheit: Fühlst du dich wieder zu 100 % fit?</span>}
              </div>
            )}

            <section className="planner-fixed-appointments">
              <div className="planner-fixed-copy">
                <p className="eyebrow">Fixtermine dieser Woche</p>
                <h3>Welche Termine stehen wirklich?</h3>
                <p className="muted">Deine wiederkehrenden Termine kommen aus den Settings. Eine Absage gilt nur für diese Woche und ändert die Grundkonfiguration nicht.</p>
              </div>
              {planningDraft.recurringCommitments?.length ? sortCommitments(planningDraft.recurringCommitments).map((commitment) => (
                <label className="planner-fixed-toggle" key={commitment.id}>
                  <input type="checkbox" checked={commitment.activeThisWeek !== false} onChange={(event) => updateWeeklyCommitment(commitment.id, event.target.checked)} />
                  <span><b>{commitment.weekday} · {commitment.name}</b><small>{commitment.time || "flexibel"} · {sportLabel(commitment.sport)} · Belastung {commitment.load === "high" ? "hoch" : commitment.load === "low" ? "niedrig" : "mittel"}</small></span>
                </label>
              )) : <div className="settings-empty-state">Noch keine wiederkehrenden Fixtermine. Du kannst sie unter Settings anlegen.</div>}
            </section>

            <div className="form-grid">
              <label>Energie heute
                <select value={planningDraft.checkin.energy} onChange={(event) => updateCheckin("energy", Number(event.target.value))}>
                  <option value="1">1 – sehr niedrig</option><option value="2">2 – niedrig</option><option value="3">3 – mittel</option><option value="4">4 – gut</option><option value="5">5 – sehr gut</option>
                </select>
              </label>
              <label>Müdigkeit
                <select value={planningDraft.checkin.fatigue} onChange={(event) => updateCheckin("fatigue", event.target.value)}>
                  <option value="none">Keine</option><option value="better">Besser</option><option value="unchanged">Unverändert</option><option value="worse">Schlechter</option>
                </select>
              </label>
              <label>Schmerzen
                <select value={planningDraft.checkin.pain} onChange={(event) => updateCheckin("pain", event.target.value)}>
                  <option value="none">Keine</option><option value="better">Besser</option><option value="unchanged">Unverändert</option><option value="worse">Schlechter</option>
                </select>
              </label>
              <label>Krankheit
                <select value={planningDraft.checkin.illness} onChange={(event) => updateCheckin("illness", event.target.value)}>
                  <option value="healthy">100 % fit</option><option value="recovering">Noch etwas angeschlagen</option><option value="symptoms">Noch Symptome</option>
                </select>
              </label>
              {planningDraft.checkin.fatigue !== "none" && <label>Warum müde?<select value={planningDraft.checkin.fatigueCause} onChange={(event) => updateCheckin("fatigueCause", event.target.value)}><option value="">Bitte auswählen</option><option>Schlaf</option><option>Arbeit/Stress</option><option>Training</option><option>Familie/Alltag</option><option>Unklar</option></select></label>}
              {planningDraft.checkin.pain !== "none" && <label>Schmerzstärke<input type="number" min="0" max="10" value={planningDraft.checkin.painLevel} onChange={(event) => updateCheckin("painLevel", Number(event.target.value))} /></label>}
              {planningDraft.checkin.pain !== "none" && <label>Wo?<input value={planningDraft.checkin.painArea} onChange={(event) => updateCheckin("painArea", event.target.value)} placeholder="z. B. linke Wade" /></label>}
              <label>Zielrahmen Lauftage<input type="number" min="0" max="7" value={planningDraft.targetRunCount || 0} onChange={(event) => setPlanningDraft({ ...planningDraft, targetRunCount: Number(event.target.value) })} /><small>Obergrenze für diese neue Woche. Dein Coach nutzt nur verfügbare Tage und kann darunter bleiben.</small></label>
              <label>Stabi-Einheiten<input type="number" min="0" max="7" value={planningDraft.stabiCount} onChange={(event) => setPlanningDraft({ ...planningDraft, stabiCount: Number(event.target.value) })} /></label>
              <label>Ruder-Einheiten<input type="number" min="0" max="7" value={planningDraft.rowingCount} onChange={(event) => setPlanningDraft({ ...planningDraft, rowingCount: Number(event.target.value) })} /></label>
            </div>

            {Number(planningDraft.rowingCount || 0) > 0 && (
              <section className="planner-rowing-setup">
                <div>
                  <p className="eyebrow">Lockeres Rudern</p>
                  <h3>Ruhige Grundlageneinheit konfigurieren</h3>
                  <p className="muted">Standard sind 5.000 m in 35 Minuten. Der SPM-Korridor dient nur als Technik- und Rhythmushilfe; daraus wird keine zusätzliche harte Intervalleinheit.</p>
                </div>
                <div className="form-grid">
                  <label>Ziel in km<input type="number" min="0.5" max="50" step="0.5" value={planningDraft.rowingDistanceKm} onChange={(event) => setPlanningDraft({ ...planningDraft, rowingDistanceKm: event.target.value })} onBlur={() => commitPlanningNumber("rowingDistanceKm", 0.5, 50, 5)} /></label>
                  <label>Zeitansatz in Minuten<input type="number" min="5" max="180" value={planningDraft.rowingDuration} onChange={(event) => setPlanningDraft({ ...planningDraft, rowingDuration: event.target.value })} onBlur={() => commitPlanningNumber("rowingDuration", 5, 180, 35)} /></label>
                  <label>SPM von<input type="number" min="14" max="40" value={planningDraft.rowingSpmMin} onChange={(event) => setPlanningDraft({ ...planningDraft, rowingSpmMin: event.target.value })} onBlur={() => commitPlanningNumber("rowingSpmMin", 14, 40, 24)} /></label>
                  <label>SPM bis<input type="number" min="14" max="40" value={planningDraft.rowingSpmMax} onChange={(event) => setPlanningDraft({ ...planningDraft, rowingSpmMax: event.target.value })} onBlur={() => commitPlanningNumber("rowingSpmMax", 14, 40, 26)} /></label>
                </div>
              </section>
            )}

            <section className="planner-normal-week">
              <div className="planner-section-heading">
                <div><p className="eyebrow">Deine normale Trainingswoche</p><h3>Wann kannst du grundsätzlich trainieren?</h3></div>
                <small>Das ist deine normale Routine. Besonderheiten für genau diese Woche kommen darunter.</small>
              </div>
              <div className="planner-availability-grid">
                <div className="planner-day-picker"><strong>Laufen</strong><div>{plannerDays.map((day) => <button type="button" className={planningDraft.runDays.includes(day) ? "selected" : ""} onClick={() => toggleDay("runDays", day)} key={`run-${day}`}>{day.slice(0, 2)}</button>)}</div></div>
                <div className="planner-day-picker"><strong>Stabi / Mobility</strong><div>{plannerDays.map((day) => <button type="button" className={planningDraft.stabiDays.includes(day) ? "selected" : ""} onClick={() => toggleDay("stabiDays", day)} key={`stabi-${day}`}>{day.slice(0, 2)}</button>)}</div></div>
                <div className="planner-day-picker"><strong>Rudern</strong><div>{plannerDays.map((day) => <button type="button" className={planningDraft.rowingDays.includes(day) ? "selected" : ""} onClick={() => toggleDay("rowingDays", day)} key={`row-${day}`}>{day.slice(0, 2)}</button>)}</div></div>
                <div className="planner-day-picker"><strong>Echtes Doppeltraining erlaubt</strong><div>{plannerDays.map((day) => <button type="button" className={planningDraft.doubleTrainingDays.includes(day) ? "selected" : ""} onClick={() => toggleDay("doubleTrainingDays", day)} key={`double-${day}`}>{day.slice(0, 2)}</button>)}</div><small>Fußball + Lauf, Rudern + Lauf oder zwei Ausdauereinheiten. Stabi/Mobility + Lauf zählt nur als Kombi-Tag.</small></div>
              </div>
            </section>

            <section className="planner-week-context">
              <div className="planner-section-heading">
                <div><p className="eyebrow">Diese Woche anders als sonst?</p><h3>Was muss der Coach für diese Woche wissen?</h3></div>
                <small>Wähle zuerst die Situation und dann die betroffenen Tage. Diese Angabe überstimmt deine normale Verfügbarkeit.</small>
              </div>
              <div className="planner-context-presets">
                {WEEKLY_CONTEXT_PRESETS.map((preset) => <button type="button" key={preset.key} onClick={() => openWeeklyContext(preset.key)}><span>{preset.icon}</span><div><b>{preset.label}</b><small>{preset.help}</small></div></button>)}
              </div>

              {weeklyContextDraft && (
                <div className="planner-context-editor">
                  <div className="planner-context-editor-head"><div><span>{weeklyContextPreset(weeklyContextDraft.contextKey).icon}</span><strong>{weeklyContextPreset(weeklyContextDraft.contextKey).label}</strong></div><button type="button" onClick={() => setWeeklyContextDraft(null)}>Abbrechen</button></div>
                  <div className="planner-day-picker compact"><strong>Welche Tage?</strong><div>{plannerDays.map((day) => <button type="button" className={weeklyContextDraft.days.includes(day) ? "selected" : ""} onClick={() => toggleWeeklyContextDay(day)} key={`context-${day}`}>{day.slice(0, 2)}</button>)}</div></div>
                  <div className="planner-context-restrictions" role="group" aria-label="Wie stark bist du eingeschränkt?">
                    {WEEKLY_CONTEXT_RESTRICTIONS
                      .filter((option) => weeklyContextDraft.contextKey === "blocked"
                        ? option.key === "blocked"
                        : ["illness", "recovery"].includes(weeklyContextDraft.contextKey)
                          ? ["recovery", "blocked"].includes(option.key)
                          : true)
                      .map((option) => <button type="button" className={weeklyContextDraft.restriction === option.key ? "selected" : ""} onClick={() => setWeeklyContextDraft({ ...weeklyContextDraft, restriction: option.key })} key={option.key}><b>{option.label}</b><small>{option.help}</small></button>)}
                  </div>
                  {["short", "recovery"].includes(weeklyContextDraft.restriction) && <label>Maximale Zeit<input type="number" min="5" max="180" step="5" value={weeklyContextDraft.maxDurationMinutes} onChange={(event) => setWeeklyContextDraft({ ...weeklyContextDraft, maxDurationMinutes: Number(event.target.value) })} /><small>Minuten pro ausgewähltem Tag.</small></label>}
                  <label>Optionaler Hinweis<input value={weeklyContextDraft.note} onChange={(event) => setWeeklyContextDraft({ ...weeklyContextDraft, note: event.target.value })} placeholder="z. B. 7–8 h Autofahrt, danach wahrscheinlich müde" /></label>
                  <button type="button" className="primary" disabled={!weeklyContextDraft.days.length} onClick={saveWeeklyContext}>Für diese Woche übernehmen</button>
                </div>
              )}

              {(planningDraft.weeklyContextExceptions || []).length > 0 && (
                <div className="planner-context-selected">
                  {(planningDraft.weeklyContextExceptions || []).map((constraint) => <article key={`weekly-${constraint.date}`}><div><span>{weeklyContextLabel(constraint)}</span><strong>{planChangeDateLabel(constraint.date)}</strong><small>{planningConstraintLabel(constraint)}{constraint.note ? ` · ${constraint.note}` : ""}</small></div><button type="button" onClick={() => removeWeeklyContext(constraint.date)}>Entfernen</button></article>)}
                </div>
              )}
            </section>

            <label className="planner-coach-note"><span>Zusätzliche Hinweise für den Coach</span><textarea value={planningDraft.checkin.notes} onChange={(event) => updateCheckin("notes", event.target.value)} placeholder="z. B. Nach langen Fahrten bin ich oft platt; Freitag will ich den Wettkampf kontrolliert hart laufen …" /><small>Freitext ergänzt den Kontext. Harte Grenzen stellst du am sichersten oben über „Diese Woche anders als sonst?“ ein.</small></label>

            {(planningDraftStructuredConstraints.length > 0 || String(planningDraft.checkin.notes || "").trim()) && (
              <div className={`planner-live-constraints ${planningDraftStructuredConstraints.length ? "recognized" : "unrecognized"}`}>
                <strong>{planningDraftStructuredConstraints.length ? "So berücksichtigt der Coach deine Woche" : "Zusatzhinweis gespeichert"}</strong>
                {planningDraftStructuredConstraints.length ? (
                  <>
                    <ul>{planningDraftStructuredConstraints.map((constraint) => (
                      <li key={`${constraint.date}-${constraint.reason}`}>
                        <div><b>{planChangeDateLabel(constraint.date)}</b><small>{weeklyContextLabel(constraint)}</small></div>
                        <span>{planningConstraintLabel(constraint)}</span>
                      </li>
                    ))}</ul>
                    {planningImpactLines.length > 0 && <div className="planner-context-impact"><b>Auswirkung auf den Plan</b>{planningImpactLines.map((line) => <span key={line}>→ {line}</span>)}</div>}
                  </>
                ) : (
                  <span>Der Hinweis bleibt als Coach-Kontext erhalten. Es wurde daraus keine feste Tagesgrenze abgeleitet – das ist okay, wenn du nur zusätzliche Hintergrundinfo geben wolltest.</span>
                )}
              </div>
            )}
            <button className="primary" type="submit">{planningMode === "replan" ? "Änderungsvorschau berechnen" : "Planvorschau berechnen"}</button>
          </form>
        </div>
      )}

      {availabilityEditing && (
        <div className="modal-backdrop">
          <form className="modal planner-modal planner-availability-modal" onSubmit={saveAvailability}>
            <button type="button" className="close" onClick={() => setAvailabilityEditing(null)}>×</button>
            <p className="eyebrow">Verfügbarkeit</p>
            <h2>{planChangeDateLabel(availabilityEditing.date)} für Training freihalten</h2>
            <p className="muted">Der Coach plant an diesem Datum keine neue Einheit. Bestehende Einheiten werden nicht automatisch verschoben, sondern erst nach deiner Vorher-/Nachher-Prüfung angepasst.</p>
            <div className="planner-availability-reasons" role="group" aria-label="Grund für den freien Tag">
              {AVAILABILITY_REASONS.map((reason) => <button type="button" className={availabilityEditing.reason === reason ? "selected" : ""} onClick={() => setAvailabilityEditing({ ...availabilityEditing, reason })} key={reason}>{reason}</button>)}
            </div>
            <label>Notiz (optional)<textarea value={availabilityEditing.note} maxLength="240" onChange={(event) => setAvailabilityEditing({ ...availabilityEditing, note: event.target.value })} placeholder="z. B. Familienausflug – ganzer Tag verplant" /></label>
            <div className="setup-note"><strong>Keine Kilometerschulden.</strong> Ein blockierter Tag führt nicht dazu, dass der Coach den nächsten Longrun stumpf verlängert. Er verteilt nur geeignete flexible Einheiten neu oder akzeptiert eine kleinere Woche.</div>
            <div className="modal-actions">
              {availabilityEditing.exists && <button type="button" onClick={clearAvailability}>Blockierung entfernen</button>}
              <button type="button" onClick={() => setAvailabilityEditing(null)}>Abbrechen</button>
              <button className="primary" type="submit">Tag blockieren</button>
            </div>
          </form>
        </div>
      )}

      {missedEditing && (
        <div className="modal-backdrop">
          <form className="modal planner-modal" onSubmit={saveMissed}>
            <button type="button" className="close" onClick={() => setMissedEditing(null)}>×</button>
            <p className="eyebrow">Offene Rückmeldung</p>
            <h2>Warum wurde „{missedEditing.title}“ nicht gemacht?</h2>
            <div className="planner-reasons">{reasonOptions.map((reason) => <button type="button" className={missedEditing.reason === reason ? "selected" : ""} onClick={() => setMissedEditing({ ...missedEditing, reason })} key={reason}>{reason}</button>)}</div>
            {missedEditing.reason === "Müde" && <label>Warum warst du müde?<select value={missedEditing.fatigueCause} onChange={(event) => setMissedEditing({ ...missedEditing, fatigueCause: event.target.value })}><option value="">Bitte auswählen</option><option>Schlaf</option><option>Arbeit/Stress</option><option>Training</option><option>Familie/Alltag</option><option>Unklar</option></select></label>}
            {missedEditing.reason === "Schmerzen" && <div className="form-grid"><label>Wo waren die Schmerzen?<input value={missedEditing.painArea} onChange={(event) => setMissedEditing({ ...missedEditing, painArea: event.target.value })} /></label><label>Stärke 0–10<input type="number" min="0" max="10" value={missedEditing.painLevel} onChange={(event) => setMissedEditing({ ...missedEditing, painLevel: event.target.value })} /></label></div>}
            {missedEditing.reason === "Verschoben" && <label>Neues Datum<input type="date" min={todayKey} value={missedEditing.newDate} onChange={(event) => setMissedEditing({ ...missedEditing, newDate: event.target.value })} required /></label>}
            {missedEditing.reason === "Aktivität nicht erkannt" && <label>Aktivität zuordnen<select value={missedEditing.activityId} onChange={(event) => setMissedEditing({ ...missedEditing, activityId: event.target.value })} required><option value="">Bitte auswählen</option>{weekActivities.map((activity) => <option value={activity.id} key={activity.id}>{activityDate(activity)} · {activity.name || activity.type} {Number(activity.distance || 0) ? `(${Number(activity.distance).toFixed(1)} km)` : ""}</option>)}</select></label>}
            <label>Notiz (optional)<textarea value={missedEditing.note} onChange={(event) => setMissedEditing({ ...missedEditing, note: event.target.value })} /></label>
            <button className="primary" type="submit" disabled={!missedEditing.reason}>Rückmeldung speichern</button>
          </form>
        </div>
      )}
    </>
  );
}
