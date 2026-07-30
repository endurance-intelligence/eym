import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Card, PageTitle } from "../components/UI";
import TrainingSectionNav from "../components/SectionNav";
import { useApp } from "../context/AppContext";
import { getCurrentPosition } from "../services/weather";
import {
  dateForDay,
  fetchWeeklyForecast,
  generateWeekPlan,
  isoDate,
  reviewGuidance,
  startOfWeek,
  workoutTypes,
} from "../services/plannerEngine";
import { downloadCalendar } from "../services/calendar";
import { preferredActivities, reviewKind } from "../services/activityUtils";
import { activitiesWithGroups } from "../services/activityGroups";
import { completedActivityDestination } from "../services/briefingNavigation";
import { publishIntervalsWeek } from "../services/intervals";
import { DEFAULT_REPLACEMENT_SPORTS, SPORT_OPTIONS, sortCommitments, sportLabel } from "../services/configuration";
import { athleteBaseline, goalRequirements } from "../services/scienceCoach";
import { buildCoachState } from "../services/coachState";
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
  buildTrackWorkoutTemplate,
  isProvisionalTrackWorkout,
  isTrackWorkout,
  normalizeTrackRounds,
  normalizeTrackStep,
  normalizeTrackWorkout,
  normalizeTrackWorkoutTemplates,
  trackWorkoutDistance,
  trackWorkoutForEditing,
  trackWorkoutSummary,
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
  fuelRecommendationFromState,
  isFuelRelevantWorkout,
} from "../services/fuelPlanner";
import "./Planner.css";

const dayFormatter = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
const trackDistanceFormatter = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 });
const reasonOptions = ["Termin fiel aus", "Keine Zeit", "Müde", "Schmerzen", "Krankheit", "Wetter", "Verschoben", "Bewusst ausgelassen", "Aktivität nicht erkannt", "Sonstiges"];
const cancellationReasonOptions = ["Termin fiel aus", "Keine Zeit", "Müde", "Schmerzen", "Krankheit", "Wetter", "Bewusst ausgelassen", "Sonstiges"];
const plannerDays = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

function eventProtectionDays(priority) {
  return { A: 5, B: 4, C: 3 }[priority] || 3;
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

function planFingerprint(plan) {
  return JSON.stringify(plan.map((item) => ({
    id: item.id,
    date: item.date,
    time: isSpontaneousWorkout(item) ? "" : item.time,
    spontaneous: isSpontaneousWorkout(item),
    title: item.title,
    type: item.type,
    distance: Number(item.distance || 0),
    duration: Number(item.duration || 0),
    optional: Boolean(item.optional),
    notes: item.notes || "",
    structuredWorkout: item.structuredWorkout || null,
    goalWorkout: item.goalWorkout || null,
  })).sort((a, b) => `${a.date}${a.time}${a.id}`.localeCompare(`${b.date}${b.time}${b.id}`)));
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
  if (!isTrackWorkout(item)) return item;
  return {
    ...item,
    structuredWorkout: trackWorkoutForEditing(item.structuredWorkout),
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
  return normalizedType(activity.type || activity.sportType || activity.name) === "running";
}

function compatible(plan, activity) {
  const planType = normalizedType(`${plan.type} ${plan.title}`);
  const activityType = normalizedType(`${activity.type || ""} ${activity.sportType || ""} ${activity.name || ""}`);
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
  const [editing, setEditing] = useState(() => {
    const requestedWorkout = state.plan.find((item) => String(item.id) === String(requestedWorkoutId || ""));
    return requestedWorkout ? prepareWorkoutForEditing(requestedWorkout) : null;
  });
  const [missedEditing, setMissedEditing] = useState(null);
  const [planningOpen, setPlanningOpen] = useState(false);
  const [planningDraft, setPlanningDraft] = useState(null);
  const [adjustmentOpen, setAdjustmentOpen] = useState(false);
  const [adjustmentDraft, setAdjustmentDraft] = useState(null);
  const [planningInfoOpen, setPlanningInfoOpen] = useState(false);
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);
  const [plannerNow, setPlannerNow] = useState(() => new Date());

  const weekStart = useMemo(() => startOfWeek(new Date(), offsetWeeks), [offsetWeeks]);
  const weekEnd = dateForDay(weekStart, 6);
  const canonicalActivities = useMemo(() => preferredActivities(state.activities, { hideStrava: Boolean(state.intervals?.connected) }), [state.activities, state.intervals?.connected]);
  const groupedActivities = useMemo(() => activitiesWithGroups(canonicalActivities, state.activityGroups), [canonicalActivities, state.activityGroups]);
  const activityById = useMemo(() => new Map([...canonicalActivities, ...groupedActivities].map((activity) => [activity.id, activity])), [canonicalActivities, groupedActivities]);
  const weekPlan = useMemo(() => state.plan.filter((item) => {
    const value = item.date || "";
    return value >= isoDate(weekStart) && value <= isoDate(weekEnd) && !item.archived;
  }).sort((a, b) => `${a.date}${workoutSortTime(a)}${a.title || ""}`.localeCompare(`${b.date}${workoutSortTime(b)}${b.title || ""}`)), [state.plan, weekStart, weekEnd]);
  const weekEventEntries = useMemo(() => weekPlan.filter((item) => item.raceEvent), [weekPlan]);
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
  const previousWeekHasPlan = useMemo(() => {
    const previousStart = startOfWeek(new Date(), offsetWeeks - 1);
    const previousEnd = dateForDay(previousStart, 6);
    return state.plan.some((item) => !item.archived && item.date >= isoDate(previousStart) && item.date <= isoDate(previousEnd));
  }, [state.plan, offsetWeeks]);
  const config = useMemo(() => state.planner || {}, [state.planner]);
  const trackWorkoutTemplates = useMemo(
    () => normalizeTrackWorkoutTemplates(config.trackWorkoutTemplates),
    [config.trackWorkoutTemplates],
  );
  const unifiedCoach = useMemo(() => buildCoachState(state), [state]);
  const scienceAssessment = unifiedCoach.week;
  const baseline = useMemo(() => athleteBaseline(state), [state]);
  const goalProfile = useMemo(() => goalRequirements(state), [state]);
  const goalKeySessions = useMemo(
    () => weekPlan.filter((item) => item.keySession && !item.raceEvent && !item.missedReason),
    [weekPlan],
  );
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
  const provisionalTrackPlan = useMemo(
    () => futurePlan.filter(isProvisionalTrackWorkout),
    [futurePlan],
  );
  const publishablePlan = useMemo(
    () => futurePlan.filter((item) => !isProvisionalTrackWorkout(item)),
    [futurePlan],
  );
  const weekKey = isoDate(weekStart);
  const currentPlanFingerprint = useMemo(() => planFingerprint(publishablePlan), [publishablePlan]);
  const publishedWeek = config.intervalSync?.[weekKey] || null;
  const planChangedAfterPublish = Boolean(publishedWeek && publishedWeek.fingerprint !== currentPlanFingerprint);
  const adjustmentSelectedItems = adjustmentDraft?.selectedIds?.map((id) => weekPlan.find((item) => item.id === id)).filter(Boolean) || [];
  const adjustmentReplacementLabel = replacementLabelForAdjustment(adjustmentDraft, replacementOptions);
  const planningWeekPending = offsetWeeks >= 0 && weekPlan.length === 0;
  const planningWeekLocked = Boolean(planningWeekPending && previousWeekClosure && !previousWeekClosure.ready);
  const planningTargetLabel = offsetWeeks === 1 ? "Nächste Woche" : "Aktuelle Woche";
  const closurePeriodLabel = offsetWeeks === 1 ? "aktuelle Woche" : "Vorwoche";
  const isPastWeek = offsetWeeks < 0;
  const modalVisible = Boolean(editing || missedEditing || planningOpen || adjustmentOpen || planningInfoOpen || publishConfirmOpen);
  const editingTrackWorkout = editing && isTrackWorkout(editing)
    ? editing.structuredWorkout
    : null;
  const editingTrackDistance = editingTrackWorkout
    ? trackWorkoutDistance(editingTrackWorkout)
    : null;

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
    openPlanning();
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
      coachAlternative,
    });
    setAdjustmentOpen(true);
  }

  function openPlanning() {
    const lastCheckin = state.healthCheckins?.[0]?.checkin || config.checkin || {};
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
        notes: "",
      },
    });
    setPlanningOpen(true);
  }

  function toggleAdjustmentItem(id) {
    setAdjustmentDraft((current) => ({
      ...current,
      selectedIds: current.selectedIds.includes(id)
        ? current.selectedIds.filter((value) => value !== id)
        : [...current.selectedIds, id],
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
            missedMeta: { ...(item.missedMeta || {}), plannedCancellation: true },
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
        const originalDistance = Number(item.distance || 0);
        const nextDistance = option.preserveDistance ? originalDistance : Number(option.distance || 0);
        const selectedCoachAlternative = adjustmentDraft.coachAlternative?.key === option.key
          ? adjustmentDraft.coachAlternative
          : null;
        const nextDuration = selectedCoachAlternative?.duration != null
          ? Number(selectedCoachAlternative.duration)
          : option.duration != null
            ? Number(option.duration)
            : Number(item.duration || 60);
        const title = selectedCoachAlternative?.title || (option.key === "preset:easy-run"
          ? `${nextDistance || originalDistance || 5} km locker`
          : selectedCoachAlternative?.label || option.title || option.label);
        const fixed = Boolean(option.commitmentId);
        return {
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
    const effectiveConfig = { ...config, ...overridePlanner, recurringCommitments: draftCommitments };
    const generated = generateWeekPlan({
      activities: canonicalActivities,
      activityGroups: state.activityGroups,
      reviews: state.reviews,
      planHistory: state.plan,
      mission: state.mission,
      profile: state.profile,
      config: effectiveConfig,
      forecast: weather,
      offsetWeeks,
      completedRunningKm: actualRunningKm,
    });

    const checkinRecord = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      weekStart: generated.weekStart,
      checkin: effectiveConfig.checkin,
    };

    setState((current) => ({
      ...current,
      plan: [
        ...current.plan.filter((item) => {
          const outsideWeek = item.date < isoDate(weekStart) || item.date > isoDate(weekEnd);
          const protectedEntry = item.source !== "planner-engine" || item.completed || item.missedReason || (offsetWeeks === 0 && item.date < todayKey);
          if (requestedDates.length) return outsideWeek || !requestedDates.includes(item.date) || protectedEntry;
          return outsideWeek || protectedEntry;
        }),
        ...(requestedDates.length ? generated.plan.filter((item) => requestedDates.includes(item.date)) : generated.plan),
      ],
      healthCheckins: [checkinRecord, ...(current.healthCheckins || [])].slice(0, 20),
      planner: {
        ...current.planner,
        ...effectiveConfig,
        recurringCommitments: current.planner?.recurringCommitments || [],
        lastGeneratedAt: new Date().toISOString(),
        lastTarget: generated.target,
        lastPhase: generated.phase.label,
        lastCycleWeek: generated.cycleWeek,
        lastRecoveryWeek: generated.recoveryWeek,
        lastPlanningTarget: generated.planningTarget || null,
        lastGoalProfile: generated.goalProfile || null,
        lastLoopStrategy: generated.loopStrategy || null,
        lastEventWeek: generated.eventWeek || null,
      },
    }));

    const loadLabel = generated.eventWeek
      ? `${generated.eventWeek.label} · ${generated.eventWeek.protectionText}`
      : generated.recoveryWeek
        ? "Entlastungswoche"
        : `Aufbauwoche ${generated.cycleWeek}/3`;
    const readinessNotes = generated.readiness.notes.length ? ` ${generated.readiness.notes.join(" ")}` : "";
    const targetLabel = generated.planningTarget?.name
      ? ` · Fokus ${generated.planningTarget.name}${generated.planningTarget.targetPaceLabel ? ` (${generated.planningTarget.targetPaceLabel})` : ""}`
      : "";
    const loopLabel = generated.loopStrategy ? ` · Loop-Block ${generated.loopStrategy.loops} × ${String(generated.loopStrategy.loopKm).replace(".", ",")} km` : "";
    const scopeLabel = requestedDates.length ? `Ausgewählte Tage (${requestedDates.length}) neu geplant. ` : "";
    setStatus(`${scopeLabel}${generated.phase.label}${targetLabel} · ${loadLabel} · berechneter Laufrahmen ${generated.target} km${loopLabel}. Bereits gelaufen: ${actualRunningKm.toFixed(1)} km. ${generated.recoveryReason}${readinessNotes}`);
    setPlanningOpen(false);
  }

  async function publishWeek() {
    setPublishBusy(true);
    setStatus("Übertrage den bestätigten Wochenplan an Intervals.icu …");
    try {
      const result = await publishIntervalsWeek({
        weekStart: isoDate(weekStart),
        weekEnd: isoDate(weekEnd),
        plan: publishablePlan,
      });
      const publishedAt = result.publishedAt || new Date().toISOString();
      setState((current) => ({
        ...current,
        plan: current.plan.map((item) => {
          if (publishablePlan.some((entry) => entry.id === item.id)) {
            return { ...item, intervalsPublishedAt: publishedAt };
          }
          if (item.date >= isoDate(weekStart) && item.date <= isoDate(weekEnd) && isProvisionalTrackWorkout(item)) {
            return { ...item, intervalsPublishedAt: null };
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
            },
          },
        },
      }));
      setStatus(`${Number(result.uploaded || publishablePlan.length)} Einheiten an Intervals.icu gesendet · ${Number(result.guided || 0)} geführte Garmin-Workouts · ${Number(result.notes || 0)} Kalendereinträge.${provisionalTrackPlan.length ? ` ${provisionalTrackPlan.length} vorläufige Track-Einheit${provisionalTrackPlan.length === 1 ? "" : "en"} blieb${provisionalTrackPlan.length === 1 ? "" : "en"} nur im Wochenplan.` : ""}`);
      setPublishConfirmOpen(false);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setPublishBusy(false);
    }
  }

  function requestPublish() {
    if (!state.intervals?.connected) {
      setStatus("Intervals.icu ist noch nicht verbunden. Bitte zuerst unter Einstellungen die Verbindung prüfen.");
      return;
    }
    setPublishConfirmOpen(true);
  }

  function saveWorkout(event) {
    event.preventDefault();
    if (!editing?.title.trim()) return;
    const date = new Date(`${editing.date}T12:00:00`);
    const weatherForecast = forecast.find((day) => day.date === editing.date)
      || (editing.weatherForecast?.date === editing.date ? editing.weatherForecast : null);
    const next = normalizeWorkoutTiming({
      ...editing,
      day: new Intl.DateTimeFormat("de-DE", { weekday: "long" }).format(date),
      distance: Number(editing.distance || 0),
      duration: Number(editing.duration || 60),
      title: editing.title.trim(),
      structuredWorkout: isTrackWorkout(editing)
        ? normalizeTrackWorkout(editing.structuredWorkout)
        : null,
      weatherForecast,
    });
    setState((current) => ({
      ...current,
      plan: current.plan.some((item) => item.id === next.id)
        ? current.plan.map((item) => item.id === next.id ? next : item)
        : [...current.plan, next],
    }));
    if (isProvisionalTrackWorkout(next)) {
      setStatus("Track-Workout vorläufig gespeichert. Es bleibt im Wochenplan und wird erst nach „Final“ an Garmin gesendet.");
    } else if (isTrackWorkout(next)) {
      setStatus("Track-Workout final gespeichert. Falls die Woche schon gesendet wurde, anschließend „Garmin aktualisieren“ drücken.");
    }
    setEditing(null);
  }

  function updateWorkout(id, patch) {
    setState((current) => ({ ...current, plan: current.plan.map((item) => item.id === id ? { ...item, ...patch } : item) }));
  }

  function openWorkoutEditor(item) {
    setEditing(prepareWorkoutForEditing(item));
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
    if (item.raceEvent) {
      navigate("/mission");
      return;
    }
    openWorkoutEditor(item);
  }

  function openWorkoutFromKeyboard(item, event) {
    if (event.target !== event.currentTarget || !["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    if (item.raceEvent) {
      navigate("/mission");
      return;
    }
    openWorkoutEditor(item);
  }

  function updateEditingType(type) {
    setEditing((current) => {
      const next = { ...current, type };
      return isTrackWorkout(next)
        ? { ...next, structuredWorkout: current?.structuredWorkout || trackWorkoutForEditing() }
        : { ...next, structuredWorkout: null };
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

  return (
    <>
      <PageTitle eyebrow="Training" title="Deine Woche">
        <div className="page-actions planner-page-actions">
          <button className="primary planner-generate" onClick={requestPlanning} disabled={isPastWeek || planningWeekLocked}>
            ✦ {isPastWeek ? "Woche abgeschlossen" : weekPlan.length ? "Woche anpassen" : planningWeekLocked ? "Noch nicht planbar" : offsetWeeks === 1 ? "Nächste Woche planen" : "Woche planen"}
          </button>
          <button className={`planner-publish-button ${publishedWeek && !planChangedAfterPublish ? "intervals-published-button" : ""}`} onClick={requestPublish} disabled={publishBusy || (!publishedWeek && publishablePlan.length === 0)}>
            {publishBusy ? "Senden …" : publishedWeek ? (planChangedAfterPublish ? "Garmin aktualisieren" : "✓ Garmin") : "An Garmin senden"}
          </button>
          <details className="action-menu planner-action-menu">
            <summary aria-label="Weitere Aktionen" title="Weitere Aktionen">•••</summary>
            <div className="action-menu-panel">
              {calendarToken && <span className="action-menu-status">✓ Kalenderabo aktiv</span>}
              {publishedWeek && <span className="action-menu-status">{planChangedAfterPublish ? "! Garmin-Stand veraltet" : `✓ ${publishedWeek.guided || 0} Workouts und ${publishedWeek.notes || 0} Termine gesendet`}</span>}
              <button type="button" onClick={(event) => { setPlanningInfoOpen(true); event.currentTarget.closest("details")?.removeAttribute("open"); }}>Wie plant dein Coach?</button>
              <button type="button" onClick={(event) => { downloadCalendar(weekPlan); event.currentTarget.closest("details")?.removeAttribute("open"); }} disabled={!weekPlan.length}>ICS-Datei laden</button>
              <button type="button" onClick={(event) => { requestPublish(); event.currentTarget.closest("details")?.removeAttribute("open"); }} disabled={publishBusy || (!publishedWeek && publishablePlan.length === 0)}>{publishedWeek ? "Garmin erneut senden" : "Plan an Garmin senden"}</button>
            </div>
          </details>
        </div>
      </PageTitle>
      <TrainingSectionNav />
      {goalProfile.target?.name && (
        <Card className={`wide planner-goal-engine ${goalProfile.feasibility?.status || "open"}`}>
          <div className="planner-goal-engine-heading">
            <div>
              <p className="eyebrow">Goal Engine · Wochenauftrag</p>
              <h2>{goalProfile.target.name}</h2>
              <p>{goalProfile.disciplineLabel} · {goalProfile.phase?.label || "Phase wird berechnet"}{goalProfile.targetPaceLabel ? ` · Zielpace ${goalProfile.targetPaceLabel}` : ""}</p>
            </div>
            <span>{goalProfile.feasibility?.label || "Ziel wird geprüft"}</span>
          </div>
          {goalProfile.experience && goalProfile.currentForm && goalProfile.targetGap && (
            <div className="planner-goal-engine-context">
              <div><small>Erfahrung</small><strong>{goalProfile.experience.label}</strong><p>{goalProfile.experience.summary}</p></div>
              <div><small>Aktuelle Form</small><strong>{goalProfile.currentForm.label}</strong><p>{goalProfile.currentForm.summary}</p></div>
              <div><small>Offene Aufgabe</small><strong>{goalProfile.targetGap.label}</strong><p>{goalProfile.targetGap.summary}</p></div>
            </div>
          )}
          <div className="planner-goal-engine-body">
            <div>
              <strong>Diese Fähigkeiten steuern den Plan</strong>
              <div className="planner-goal-engine-tags">{goalProfile.focus.map((focus) => <span key={focus}>{focus}</span>)}</div>
            </div>
            <div>
              <strong>Schlüsseleinheiten dieser Woche</strong>
              {goalKeySessions.length
                ? <div className="planner-goal-key-sessions">{goalKeySessions.map((item) => <span key={item.id}>{item.day} · {item.title}</span>)}</div>
                : <p className="muted">Noch keine Woche berechnet oder die aktuelle Woche ist bewusst entlastet.</p>}
            </div>
          </div>
          {goalProfile.feasibility?.summary && <p className="planner-goal-engine-summary">{goalProfile.feasibility.summary}</p>}
          {goalProfile.preparation?.summary && <p className="planner-goal-engine-preparation"><strong>Warum so?</strong> {goalProfile.preparation.summary}</p>}
          {(goalProfile.constraintWarnings || []).map((warning) => <small className="planner-goal-warning" key={warning}>! {warning}</small>)}
        </Card>
      )}
      {offsetWeeks === 0 && ["adjust", "watch"].includes(unifiedCoach.level) && (
        <Card className={`wide planner-science-card ${unifiedCoach.level}`}>
          <div className="planner-science-heading">
            <div><p className="eyebrow">Gemeinsame Coach-Bewertung</p><h2>{unifiedCoach.recommendation.title}</h2></div>
            <span>Dein Coach schlägt vor · du entscheidest</span>
          </div>
          <p>{unifiedCoach.recommendation.text}</p>
          <div className="planner-science-context">
            <span>Gewöhnung: {baseline.runDays.toFixed(1)} Lauftage/Woche · {baseline.weeklyKm.toFixed(0)} km/Woche</span>
            <span>Zielprofil: {goalProfile.focus.join(" · ")}</span>
            <span>Projizierter Load: {scienceAssessment.projected} · jüngster Rahmen: {scienceAssessment.average || "noch offen"}</span>
          </div>
          {scienceAssessment.candidates.length > 0 && (
            <div className="planner-science-suggestions">
              {scienceAssessment.candidates.map((candidate, index) => (
                <article className={index === 0 ? "recommended" : ""} key={candidate.id}>
                  <div className="planner-science-suggestion-heading">
                    <div><b>{candidate.title}</b><span>{candidate.date}</span></div>
                    <em>{index === 0 ? "Coach-Empfehlung" : "Weitere Option"}</em>
                  </div>
                  <p className="planner-science-alternative">
                    <strong>{candidate.coachAlternative?.label || "Alternative prüfen"}</strong>
                    <small>{candidate.coachAlternative?.reason || candidate.suggestion}</small>
                  </p>
                  <button
                    type="button"
                    onClick={() => openAdjustment(
                      candidate.id,
                      "replace",
                      candidate.coachAlternative?.key || "",
                      candidate.coachAlternative || null,
                    )}
                  >
                    Vorschlag prüfen
                  </button>
                </article>
              ))}
            </div>
          )}
          <small>{unifiedCoach.protectionNote} Du kannst jeden Coach-Vorschlag ändern oder den bestehenden Plan unverändert lassen.</small>
        </Card>
      )}

      <div className="planner-week-nav">
        <button disabled={offsetWeeks === 0 && !previousWeekHasPlan} title={offsetWeeks === 0 && !previousWeekHasPlan ? "Keine ältere geplante Woche vorhanden" : "Vorherige Woche"} onClick={() => { setOffsetWeeks((value) => value - 1); setForecast([]); setStatus(""); }}>←</button>
        <div><strong>{dayFormatter.format(weekStart)} – {dayFormatter.format(weekEnd)}</strong><span>{offsetWeeks === 0 ? "Aktuelle Woche · Plan aktiv" : offsetWeeks === 1 ? "Nächste Woche" : "Abgeschlossene Trainingswoche"}</span></div>
        <button disabled={offsetWeeks >= 1} title={offsetWeeks >= 1 ? "Es wird immer nur die nächste Woche vorbereitet" : "Nächste Woche"} onClick={() => { setOffsetWeeks((value) => value + 1); setForecast([]); setStatus(""); }}>→</button>
      </div>

      <section className="planner-overview-strip">
        <div><span>Noch geplant</span><strong>{plannedKm.toFixed(1).replace(".0", "")} km</strong></div>
        <div><span>Gelaufen</span><strong>{completedKm.toFixed(1)} km</strong></div>
        <div><span>Erledigt</span><strong>{weekActivities.length} Einheiten</strong></div>
        <div className="planner-overview-state"><span>Status</span><strong>{isPastWeek ? "Abgeschlossen" : weekPlan.length ? "Plan aktiv · nur gezielte Änderungen" : planningWeekLocked ? "Wochenabschluss fehlt" : "Bereit zur Planung"}</strong></div>
        <button onClick={() => setEditing(createBlank(weekStart))} disabled={isPastWeek || planningWeekPending}>+ Einheit</button>
      </section>

      {weekEventEntries.length > 0 && (
        <Card className="wide planner-event-week-card">
          <div>
            <p className="eyebrow">Eventwoche · Frische geschützt</p>
            <h2>{weekEventEntries.map((item) => item.title).join(" · ")}</h2>
            <p>Das Event ersetzt Longrun und harte Qualität. In den {Math.max(...weekEventEntries.map((item) => eventProtectionDays(item.goalPriority)))} Tagen davor werden intensive Zusatzbelastungen entschärft; danach ist Erholung eingeplant.</p>
            {config.lastPlanningTarget?.name && <small>Strategischer Trainingsfokus bleibt: <strong>{config.lastPlanningTarget.name}</strong>.</small>}
          </div>
          <div className="planner-event-week-badges">
            {weekEventEntries.map((item) => <span key={item.id}>Priorität {item.goalPriority || "B"} · {item.distance ? `${item.distance} km` : "Event"}{item.time ? ` · ${item.time} Uhr` : ""}</span>)}
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
          return (
            <article className="planner-day" key={dateKey}>
              <header>
                <div><span>{dayFormatter.format(date)}</span><strong>{new Intl.DateTimeFormat("de-DE", { weekday: "long" }).format(date)}</strong></div>
                {dayWeather && <small>{dayWeather.maxTemp}° · Böen {dayWeather.maxGust} · Regen {dayWeather.rainChance}%</small>}
              </header>

              {actuals.map((activity) => {
                const reviewDestination = reviewKind(activity)
                  ? completedActivityDestination(activity.id)
                  : null;
                return (
                  <div
                    className={`planner-workout planner-actual completed ${reviewDestination ? "planner-workout-review-open" : ""}`}
                    key={`actual-${activity.id}`}
                    role={reviewDestination ? "button" : undefined}
                    tabIndex={reviewDestination ? 0 : undefined}
                    title={reviewDestination ? "Review öffnen" : undefined}
                    aria-label={reviewDestination ? `${activity.name || activity.type || "Training"}: Review öffnen` : undefined}
                    onClick={reviewDestination ? (event) => openCompletedReview(reviewDestination, event) : undefined}
                    onKeyDown={reviewDestination ? (event) => openCompletedReviewFromKeyboard(reviewDestination, event) : undefined}
                  >
                    <div className="planner-check">✓</div>
                    <div className="planner-workout-main">
                      <div><span>{activityTime(activity) ? `${activityTime(activity)} · ` : ""}ERLEDIGT</span><em>{String(activity.source || "Garmin").toUpperCase()}</em></div>
                      <h3>{activity.name || activity.title || activity.type || "Training"}</h3>
                      <p>{activity.type || activity.sportType || "Einheit"}{Number(activity.distance || 0) ? ` · ${Number(activity.distance).toFixed(1)} km` : ""}{Number(activity.duration || 0) ? ` · ${Math.round(Number(activity.duration))} min` : ""}</p>
                    </div>
                    {reviewDestination && <span className="planner-review-cue">Review →</span>}
                  </div>
                );
              })}

              {entries.length === 0 && actuals.length === 0 ? (
                <button className="planner-empty" onClick={() => setEditing({ ...createBlank(weekStart), date: dateKey })}>+ frei</button>
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
                const fuelRecommendation = fuelRecommendations.get(item.id);
                const trackTemplateLabel = trackWorkoutTemplateLabel(item.structuredWorkout);
                const className = `planner-workout ${completed ? "completed" : ""} ${isMissed ? "missed" : ""} ${isCancelled ? "cancelled" : ""} ${hasStateMarker ? "" : "no-marker"}`;
                return (
                  <div
                    className={`${className} ${reviewDestination ? "planner-workout-review-open" : ""}`}
                    key={item.id}
                    role={reviewDestination ? "button" : undefined}
                    tabIndex={reviewDestination ? 0 : undefined}
                    title={reviewDestination ? "Review öffnen" : completed ? "Review nach dem Aktivitätssync verfügbar" : undefined}
                    aria-label={reviewDestination ? `${item.title}: Review öffnen` : undefined}
                    onClick={reviewDestination ? (event) => openCompletedReview(reviewDestination, event) : undefined}
                    onKeyDown={reviewDestination ? (event) => openCompletedReviewFromKeyboard(reviewDestination, event) : undefined}
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
                    <div
                      className={`planner-workout-main ${!completed && !isCancelled ? "planner-workout-open" : ""}`}
                      role={!completed && !isCancelled ? "button" : undefined}
                      tabIndex={!completed && !isCancelled ? 0 : undefined}
                      title={!completed && !isCancelled ? item.raceEvent ? "Ziel öffnen" : "Training öffnen" : undefined}
                      aria-label={!completed && !isCancelled ? `${item.title}: ${item.raceEvent ? "Ziel" : "Training"} öffnen` : undefined}
                      onClick={!completed && !isCancelled ? (event) => openWorkoutFromRow(item, event) : undefined}
                      onKeyDown={!completed && !isCancelled ? (event) => openWorkoutFromKeyboard(item, event) : undefined}
                    >
                      <div>
                        <span>{workoutTimingLabel(item)} · {completed ? "ERLEDIGT" : isCancelled ? "AUSGEFALLEN" : isMissed ? "NICHT ERLEDIGT" : item.optional ? "OPTIONAL" : "PFLICHT"}</span>
                        {item.weatherAdjusted && <em>WETTER</em>}
                        {item.raceEvent && <em>EVENT {item.goalPriority || "B"}</em>}
                        {item.comboSession && <em>KOMBI-TAG</em>}
                        {item.doubleSession && <em>DOPPELTRAINING</em>}
                        {isProvisionalTrackWorkout(item) ? <em>VORLÄUFIG</em> : item.intervalsPublishedAt && <em>INTERVALS</em>}
                        {matched && <em>{String(matched.source || item.actualSource || "Garmin").toUpperCase()}</em>}
                      </div>
                      <h3>{item.title}</h3>
                      <p>{item.type}{trackTemplateLabel ? ` · ${trackTemplateLabel}` : ""}{item.distance ? ` · ${item.distance} km geplant` : ""}{matched && Number(matched.distance || item.actualDistance || 0) ? ` · ${Number(matched.distance || item.actualDistance).toFixed(1)} km erledigt` : ""}{item.duration ? ` · ${item.duration} min` : ""}</p>
                      {matched && <small>{matched.name || item.actualTitle}</small>}
                      {item.missedReason && <small>Grund: {item.missedReason}{item.missedNote ? ` · ${item.missedNote}` : ""}</small>}
                      {item.notes && !isCancelled && <small>{item.notes}</small>}
                      {item.coachAlternative?.source === "weather-cycling" && !matched && !completed && !isCancelled && !isMissed && (
                        <div className="planner-weather-alternative">
                          <div>
                            <span>Coach-Alternative · Wetter</span>
                            <strong>{item.coachAlternative.label}</strong>
                            <small>{item.coachAlternative.reason}</small>
                          </div>
                          <button
                            type="button"
                            onClick={() => openAdjustment(
                              item.id,
                              "replace",
                              item.coachAlternative.key,
                              item.coachAlternative,
                            )}
                          >
                            Vorschlag prüfen
                          </button>
                        </div>
                      )}
                      {fuelRecommendation && !matched && !item.completed && !isCancelled && !isMissed && (
                        <Link
                          className={`planner-fuel-hint ${fuelRecommendation.warnings.length ? "warn" : ""}`}
                          to={`/fuel?workout=${item.id}`}
                        >
                          <span>◒ Fuel · {fuelRecommendation.modeLabel}</span>
                          <strong>{fuelRecommendation.packSummary}</strong>
                          <small>{fuelRecommendation.warnings.length ? "Bestand oder Produktdaten prüfen →" : "Strategie ansehen →"}</small>
                        </Link>
                      )}
                      {item.choicePending && item.choiceOptions && (
                        <div className="planner-choice-actions">
                          <button type="button" onClick={() => resolveSaturdayChoice(item, "orc")}>📍 ORC Track</button>
                          <button type="button" onClick={() => resolveSaturdayChoice(item, "alternative")}>🟢 Alternativlauf</button>
                        </div>
                      )}
                    </div>
                    {reviewDestination && <span className="planner-review-cue">Review →</span>}
                    {!completed && (
                      <div className="planner-actions">
                        {isMissed && <button className="danger" onClick={() => openMissed(item)}>Grund angeben</button>}
                        {isCancelled
                          ? <button onClick={() => restoreCancelledWorkout(item)}>Wieder einplanen</button>
                          : item.raceEvent
                            ? <button onClick={() => navigate("/mission")}>Ziel öffnen</button>
                            : <button onClick={() => openWorkoutEditor(item)}>Bearbeiten</button>}
                        {!isPastWeek && !isCancelled && <button onClick={() => openAdjustment(item.id, "cancel")}>Fällt aus</button>}
                        {!item.raceEvent && <button onClick={() => updateWorkout(item.id, { archived: true })}>Archiv</button>}
                      </div>
                    )}
                  </div>
                );
              })}
            </article>
          );
        })}
      </div>
      </>}

      {publishConfirmOpen && (
        <div className="modal-backdrop">
          <div className="modal planner-publish-modal">
            <button type="button" className="close" onClick={() => setPublishConfirmOpen(false)}>×</button>
            <p className="eyebrow">Woche bestätigen</p>
            <h2>Plan an Intervals.icu senden?</h2>
            <p><strong>{publishablePlan.length}</strong> zukünftige Einheit{publishablePlan.length === 1 ? "" : "en"} werden für {dayFormatter.format(weekStart)} bis {dayFormatter.format(weekEnd)} veröffentlicht.</p>
            {provisionalTrackPlan.length > 0 && <p className="planner-publish-draft-note"><strong>{provisionalTrackPlan.length} vorläufige Track-Einheit{provisionalTrackPlan.length === 1 ? "" : "en"}</strong> bleibt{provisionalTrackPlan.length === 1 ? "" : "en"} im Wochenplan und wird{provisionalTrackPlan.length === 1 ? "" : "werden"} nicht an Garmin gesendet. Eine früher gesendete Fassung wird beim Aktualisieren entfernt.</p>}
            <div className="planner-protection-list">
              <span>✓ Lauf- und Radeinheiten werden als strukturierte Workouts angelegt</span>
              <span>✓ Vorläufige Track-Workouts bleiben im Wochenplan, bis du sie ausdrücklich auf „Final“ stellst</span>
              <span>✓ Eine noch offene Samstagswahl bleibt zunächst als Kalendereintrag und wird nach deiner Entscheidung aktualisiert</span>
              <span>✓ Fußball, Stabi, Mobility und Rudern bleiben reine Kalendereinträge</span>
              <span>✓ Erneutes Senden aktualisiert bestehende Einträge statt Duplikate anzulegen</span>
              <span>✓ Entfernte Einheiten werden auch aus dieser Intervals-Woche entfernt</span>
            </div>
            <p className="muted">In Intervals.icu muss unter Garmin „Upload planned workouts“ aktiviert sein.</p>
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
                {adjustmentDraft.action === "cancel" && <div className="planner-cancel-fields"><label>Warum fällt die Einheit aus?<select value={adjustmentDraft.cancelReason} onChange={(event) => setAdjustmentDraft({ ...adjustmentDraft, cancelReason: event.target.value })}>{cancellationReasonOptions.map((reason) => <option key={reason}>{reason}</option>)}</select></label><label>Notiz (optional)<textarea value={adjustmentDraft.cancelNote} onChange={(event) => setAdjustmentDraft({ ...adjustmentDraft, cancelNote: event.target.value })} placeholder="z. B. Training vom Verein abgesagt" /></label><div className="setup-note"><strong>Die Einheit bleibt in der Historie.</strong> So erkennt der Coach, ob ein externer Termin ausfiel oder ob Belastung, Krankheit oder Beschwerden der Grund waren.</div></div>}
                <button className="primary" type="submit" disabled={!adjustmentDraft.selectedIds.length}>{adjustmentDraft.action === "replace" ? "Ausgewählte Einheit ersetzen" : adjustmentDraft.action === "move" ? "Ausgewählte Einheit verschieben" : "Als ausgefallen markieren"}</button>
              </section>
            </div>

            <section className="planner-adjustment-preview">
              <div><p className="eyebrow">3. Änderung prüfen</p><h3>Das wird geändert</h3></div>
              {adjustmentSelectedItems.length ? <div className="planner-adjustment-preview-list">{adjustmentSelectedItems.map((item) => <article key={item.id}><div><strong>{item.day || new Intl.DateTimeFormat("de-DE", { weekday: "long" }).format(new Date(`${item.date}T12:00:00`))} · {workoutTimingLabel(item)}</strong><span>{item.title}</span></div><b>→</b><div><strong>{adjustmentDraft.action === "replace" ? adjustmentReplacementLabel || "Ersatz auswählen" : adjustmentDraft.action === "move" ? `${adjustmentDraft.moveDate || "Datum wählen"} · ${adjustmentMoveTimingLabel(item, adjustmentDraft)}` : "Wird als ausgefallen markiert"}</strong><span>{adjustmentDraft.action === "replace" ? "Andere Einheiten des Tages bleiben erhalten" : adjustmentDraft.action === "move" ? "Inhalt der Einheit bleibt gleich" : adjustmentDraft.cancelReason || "Grund auswählen"}</span></div></article>)}</div> : <p className="muted">Wähle links mindestens eine Einheit aus. Danach siehst du hier die konkrete Auswirkung.</p>}
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
            <div className="planner-logic-flow">Hauptziel <b>→</b> Fähigkeiten <b>→</b> aktuelle Lücke <b>→</b> Phase <b>→</b> Woche</div>
            <p className="muted">Zuerst bestimmen Distanz, Zielart, Zielzeit und Streckenprofil, was trainiert werden muss. Danach begrenzen Historie, Fixtermine, Reviews, Check-in und Wetter die konkrete Woche. Sobald der Plan steht, wird er nicht automatisch geändert.</p>
            <div className="form-grid">
              <label>Max. Außentemperatur<input type="number" value={config.maxOutdoorTemperature || 29} onChange={(event) => patchConfig({ maxOutdoorTemperature: Number(event.target.value) })} /></label>
              <label>Max. Böen in km/h<input type="number" value={config.maxWindGust || 55} onChange={(event) => patchConfig({ maxWindGust: Number(event.target.value) })} /></label>
              <label>Letzte Phase<input readOnly value={config.lastPhase || "Noch nicht berechnet"} /></label>
              <label>Letzter Laufrahmen<input readOnly value={config.lastTarget ? `${config.lastTarget} km` : "Noch nicht berechnet"} /></label>
              <label>Zielprofil<input readOnly value={config.lastGoalProfile?.disciplineLabel || goalProfile.disciplineLabel || "Noch nicht berechnet"} /></label>
              <label>Machbarkeit<input readOnly value={config.lastGoalProfile?.feasibility?.label || goalProfile.feasibility?.label || "Noch nicht geprüft"} /></label>
            </div>
            <div className="planner-protection-list">
              <span>✓ Aktive Wochen werden nur gezielt geändert</span>
              <span>✓ Ausfälle bleiben mit Grund in der Historie</span>
              <span>✓ Die nächste Woche wartet auf Reviews und geklärte Einheiten</span>
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
              <label>Distanz in km<input type="number" min="0" step="0.1" value={editing.distance} onChange={(event) => setEditing({ ...editing, distance: event.target.value })} /></label>
              <label>Dauer in Minuten<input type="number" min="0" value={editing.duration} onChange={(event) => setEditing({ ...editing, duration: event.target.value })} /></label>
            </div>
            {editingTrackWorkout && (
              <section className="planner-track-builder">
                <div>
                  <p className="eyebrow">Geführtes Garmin-Workout</p>
                  <h3>Track-Abfolge festlegen</h3>
                  <p>Warm-up und Cool-down bleiben offen. Auf Garmin wechselst du jeweils mit der LAP-Taste zum nächsten Abschnitt. Beide sowie alle Pausen bleiben ohne Pace-Ziel.</p>
                </div>
                <div className={`planner-track-planning-status ${editingTrackWorkout.planningStatus === "draft" ? "draft" : "final"}`}>
                  <div>
                    <strong>Planungsstand</strong>
                    <small>{editingTrackWorkout.planningStatus === "draft"
                      ? "Im Wochenplan speichern, aber noch nicht an Garmin senden. Ideal, wenn Runden oder Pausen erst am Trainingstag feststehen."
                      : "Die Abfolge ist bestätigt und wird beim nächsten Senden bzw. Aktualisieren an Garmin übergeben."}</small>
                  </div>
                  <div role="group" aria-label="Planungsstand des Track-Workouts">
                    <button type="button" className={editingTrackWorkout.planningStatus === "draft" ? "selected" : ""} onClick={() => updateTrackWorkout("planningStatus", "draft")}>Vorläufig</button>
                    <button type="button" className={editingTrackWorkout.planningStatus === "final" ? "selected" : ""} onClick={() => updateTrackWorkout("planningStatus", "final")}>Final</button>
                  </div>
                </div>
                <section className="planner-track-archive">
                  <div className="planner-track-archive-heading">
                    <div><p className="eyebrow">Vorlagenarchiv</p><h4>Bewährte Einheiten wiederverwenden</h4></div>
                    <span>{trackWorkoutTemplates.length} gespeichert</span>
                  </div>
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
                </section>
                <div className="planner-track-lap-flow" aria-label="LAP-gesteuerter Ablauf">
                  <span><b>1 · Warm-up</b><small>locker laufen · dann LAP drücken</small></span>
                  <strong>→</strong>
                  <span><b>2 · Hauptteil</b><small>Schritte laufen automatisch ab</small></span>
                  <strong>→</strong>
                  <span><b>3 · Cool-down</b><small>offen · zum Beenden LAP drücken</small></span>
                </div>
                <div className="form-grid planner-track-settings">
                  <label>Art<select value={editingTrackWorkout.kind} onChange={(event) => updateTrackWorkout("kind", event.target.value)}><option value="intervals">Intervalle</option><option value="sprints">Sprints</option></select></label>
                  <label>Durchgänge<input type="number" min="1" max="30" value={editingTrackWorkout.rounds} onChange={(event) => updateTrackWorkout("rounds", event.target.value)} onBlur={commitTrackRounds} /><small>Ein Durchgang enthält die komplette Reihenfolge unten.</small></label>
                </div>
                <div className="planner-track-sequence">
                  <div className="planner-track-sequence-heading">
                    <div><strong>Schritte je Durchgang</strong><small>Die Reihenfolge wird genauso an Garmin übergeben.</small></div>
                    <span>{editingTrackWorkout.steps.length}/16</span>
                  </div>
                  {editingTrackWorkout.steps.map((step, index) => (
                    <article className={step.kind} key={`${index}-${step.kind}`}>
                      <b>{index + 1}</b>
                      <label>Abschnitt<select value={step.kind} onChange={(event) => updateTrackStep(index, "kind", event.target.value)}><option value="work">Belastung</option><option value="recovery">Pause</option></select></label>
                      <label>Einheit<select value={step.unit} onChange={(event) => updateTrackStep(index, "unit", event.target.value)}><option value="distance">Meter</option><option value="time">Sekunden</option></select></label>
                      <label>Wert<input type="number" min={step.unit === "distance" ? "20" : "5"} max={step.unit === "distance" ? "5000" : "3600"} value={step.value} onChange={(event) => updateTrackStep(index, "value", event.target.value)} onBlur={() => commitTrackStep(index)} /></label>
                      <label>Ziel-Pace /km<input type="text" inputMode="decimal" pattern="[0-9]{1,2}[:.,][0-5][0-9]" placeholder="z. B. 4:40" title="Pace im Format 4:40 min/km" value={step.targetPace || ""} onChange={(event) => updateTrackStep(index, "targetPace", event.target.value)} onBlur={() => commitTrackStep(index)} /></label>
                      <label>Toleranz<select value={step.paceToleranceSeconds ?? 5} disabled={!step.targetPace} onChange={(event) => updateTrackStep(index, "paceToleranceSeconds", Number(event.target.value))}><option value="5">± 5 Sek.</option><option value="10">± 10 Sek.</option><option value="15">± 15 Sek.</option><option value="20">± 20 Sek.</option><option value="30">± 30 Sek.</option></select></label>
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
                <small>Nur Belastungen erhalten ein Pace-Ziel: 4:40 mit ±5 Sekunden wird auf Garmin als Bereich 4:35–4:45 min/km geführt. Warm-up, Pausen und Cool-down bleiben ohne Ziel. Intervals.icu benötigt zusätzlich unter Running eine gesetzte Threshold Pace und bei der Garmin-Verbindung „Upload planned workouts“.</small>
              </section>
            )}
            <label>Notiz<textarea value={editing.notes} onChange={(event) => setEditing({ ...editing, notes: event.target.value })} /></label>
            <label className="planner-optional"><input type="checkbox" checked={editing.optional} onChange={(event) => setEditing({ ...editing, optional: event.target.checked })} /> Einheit ist optional</label>
            <button className="primary" type="submit">Speichern</button>
          </form>
        </div>
      )}

      {planningOpen && planningDraft && (
        <div className="modal-backdrop">
          <form className="modal planner-modal planner-setup" onSubmit={(event) => { event.preventDefault(); generate(planningDraft); }}>
            <button type="button" className="close" onClick={() => setPlanningOpen(false)}>×</button>
            <p className="eyebrow">Intelligente Wochenplanung</p>
            <h2>Wie geht es dir – und wann hast du Zeit?</h2>
            <p className="muted">Dein Hauptziel legt Fähigkeiten, Phase und notwendige Schlüsseleinheiten fest. Die letzten Trainingswochen und dieser Check-in bestimmen, wie viel davon aktuell sicher umsetzbar ist. Erholungssignale können jederzeit eine frühere Entlastung auslösen.</p>

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
              {planningDraft.recurringCommitments?.length ? planningDraft.recurringCommitments.map((commitment) => (
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

            <div className="planner-day-picker"><strong>An welchen Tagen kannst du laufen?</strong><div>{plannerDays.map((day) => <button type="button" className={planningDraft.runDays.includes(day) ? "selected" : ""} onClick={() => toggleDay("runDays", day)} key={`run-${day}`}>{day.slice(0, 2)}</button>)}</div></div>
            <div className="planner-day-picker"><strong>Stabi an welchen Tagen?</strong><div>{plannerDays.map((day) => <button type="button" className={planningDraft.stabiDays.includes(day) ? "selected" : ""} onClick={() => toggleDay("stabiDays", day)} key={`stabi-${day}`}>{day.slice(0, 2)}</button>)}</div></div>
            <div className="planner-day-picker"><strong>Rudern an welchen Tagen?</strong><div>{plannerDays.map((day) => <button type="button" className={planningDraft.rowingDays.includes(day) ? "selected" : ""} onClick={() => toggleDay("rowingDays", day)} key={`row-${day}`}>{day.slice(0, 2)}</button>)}</div></div>
            <div className="planner-day-picker"><strong>An welchen Tagen ist echtes Doppeltraining erlaubt?</strong><div>{plannerDays.map((day) => <button type="button" className={planningDraft.doubleTrainingDays.includes(day) ? "selected" : ""} onClick={() => toggleDay("doubleTrainingDays", day)} key={`double-${day}`}>{day.slice(0, 2)}</button>)}</div><small>Gemeint sind Fußball + Lauf, Rudern + Lauf oder zwei Ausdauereinheiten. Stabi/Mobility + Lauf ist nur ein Kombi-Tag und braucht keine Freigabe.</small></div>
            <label>Zusätzliche Notiz<textarea value={planningDraft.checkin.notes} onChange={(event) => updateCheckin("notes", event.target.value)} placeholder="Reise, wenig Zeit, besondere Termine …" /></label>
            <button className="primary" type="submit">Plan berechnen</button>
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
