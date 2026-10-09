import { isRunningActivity } from "./activityUtils.js";
import { workoutRoleAssessment } from "./workoutRoles.js";

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function isoDateLocal(value = new Date()) {
  const date = value instanceof Date ? new Date(value) : new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return String(value || "").slice(0, 10);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function startOfWeekIso(value = new Date()) {
  const date = value instanceof Date ? new Date(value) : new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  const day = date.getDay() || 7;
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - day + 1);
  return isoDateLocal(date);
}

export function currentWeekPrescription(planner = {}, now = new Date()) {
  const weekKey = startOfWeekIso(now);
  return planner?.weekPrescriptions?.[weekKey] || null;
}

export function weekHubSummary({ planner = {}, now = new Date(), openItems = 0, completedKm = 0, volumeSummary = null } = {}) {
  const prescription = currentWeekPrescription(planner, now);
  if (!prescription) {
    return {
      prescription: null,
      typeLabel: "Wochensteuerung offen",
      corridorLabel: volumeSummary?.label || (planner?.lastTarget ? `${planner.lastTarget} km bisheriger Rahmen` : "Noch nicht berechnet"),
      focus: "Die nächste Wochenberechnung legt Trainingsphase, Umfang und Schwerpunkt transparent fest.",
      meta: `${openItems} offene Einheit${openItems === 1 ? "" : "en"} · ${numeric(completedKm).toFixed(1).replace(".0", "")} km absolviert${volumeSummary?.optionalLabel ? ` · ${volumeSummary.optionalLabel}` : ""}`,
      tone: "neutral",
    };
  }
  return {
    prescription,
    typeLabel: prescription.weekType?.label || "Trainingswoche",
    corridorLabel: volumeSummary?.label || prescription.corridor?.label || `${prescription.targetKm || planner?.lastTarget || "–"} km`,
    focus: prescription.focus || prescription.weekType?.summary || "Der Coach steuert Umfang und Reize automatisch.",
    meta: `${openItems} offene Einheit${openItems === 1 ? "" : "en"} · ${numeric(completedKm).toFixed(1).replace(".0", "")} km absolviert${volumeSummary?.optionalLabel ? ` · ${volumeSummary.optionalLabel}` : ""}`,
    tone: prescription.weekType?.tone || "neutral",
  };
}


function compactKm(value) {
  return numeric(value).toFixed(1).replace(".0", "");
}

function plannedDistanceBounds(item = {}) {
  const explicitMin = Number(item.distanceMinKm ?? item.distanceMin);
  const explicitMax = Number(item.distanceMaxKm ?? item.distanceMax);
  if (Number.isFinite(explicitMin) && explicitMin >= 0 && Number.isFinite(explicitMax) && explicitMax >= explicitMin) {
    return { min: explicitMin, max: explicitMax };
  }
  const range = String(item.title || "").replace(/,/g, ".").match(/(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)\s*km/i);
  if (range) return { min: Number(range[1]), max: Number(range[2]) };
  const distance = Math.max(0, Number(item.distance || 0));
  return { min: distance, max: distance };
}

function kmRangeLabel(min, max) {
  return Math.abs(numeric(max) - numeric(min)) <= 0.05
    ? `${compactKm(max)} km`
    : `${compactKm(min)}–${compactKm(max)} km`;
}

export function currentWeekVolumeSummary({ plan = [], completedKm = 0, now = new Date() } = {}) {
  const startKey = startOfWeekIso(now);
  const weekEnd = new Date(`${startKey}T12:00:00`);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const endKey = isoDateLocal(weekEnd);
  const todayKey = isoDateLocal(now);
  const openRunning = (Array.isArray(plan) ? plan : []).filter((item) => {
    if (item.archived || item.completed || item.matchedActivityId || item.missedReason || item.plannedCancellation) return false;
    if (item.date < todayKey || item.date < startKey || item.date > endKey) return false;
    return isRunningActivity(item);
  });
  const required = openRunning.filter((item) => !item.optional);
  const optional = openRunning.filter((item) => item.optional);
  const requiredMin = required.reduce((sum, item) => sum + plannedDistanceBounds(item).min, 0);
  const requiredMax = required.reduce((sum, item) => sum + plannedDistanceBounds(item).max, 0);
  const optionalMin = optional.reduce((sum, item) => sum + plannedDistanceBounds(item).min, 0);
  const optionalMax = optional.reduce((sum, item) => sum + plannedDistanceBounds(item).max, 0);
  const totalMin = numeric(completedKm) + requiredMin;
  const totalMax = numeric(completedKm) + requiredMax;
  return {
    label: kmRangeLabel(totalMin, totalMax),
    completedKm: numeric(completedKm),
    requiredOpenLabel: kmRangeLabel(requiredMin, requiredMax),
    optionalLabel: optionalMax > 0 ? `+${kmRangeLabel(optionalMin, optionalMax)} optional` : "",
    requiredOpenCount: required.length,
    optionalOpenCount: optional.length,
  };
}

function workoutSortValue(item = {}) {
  return `${item.date || "9999-12-31"}T${item.time || "23:59"}-${item.title || ""}`;
}

export function nextKeySession({ plan = [], now = new Date(), weekPrescription = null, goal = null } = {}) {
  const today = isoDateLocal(now);
  const candidates = (Array.isArray(plan) ? plan : [])
    .filter((item) => !item.archived && !item.completed && !item.missedReason && item.date >= today)
    .map((item) => ({
      item,
      assessment: workoutRoleAssessment(item, {
        plan,
        weekPrescription,
        goal: goal || (weekPrescription?.goal ? { target: weekPrescription.goal } : null),
      }),
    }))
    .filter(({ assessment }) => assessment.isKeySession)
    .sort((left, right) => workoutSortValue(left.item).localeCompare(workoutSortValue(right.item)));
  return candidates[0] || null;
}

export function keySessionDateLabel(dateValue, now = new Date()) {
  const date = new Date(`${dateValue}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "Termin offen";
  const today = new Date(now);
  today.setHours(12, 0, 0, 0);
  const difference = Math.round((date - today) / 86400000);
  if (difference === 0) return "Heute";
  if (difference === 1) return "Morgen";
  const weekday = new Intl.DateTimeFormat("de-DE", { weekday: "long" }).format(date);
  if (difference > 1 && difference <= 6) return `${weekday} · in ${difference} Tagen`;
  const dateLabel = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" }).format(date);
  return `${weekday} · ${dateLabel}`;
}

export function missionFocusTarget(mission = {}, weekPrescription = null) {
  const milestones = Array.isArray(mission?.milestones) ? mission.milestones : [];
  const mainTarget = milestones.find((item) => item.isMainTarget && !item.archived)
    || (mission?.name && mission?.date ? mission : null);
  const prescribedGoal = weekPrescription?.goal;
  const matchingFocus = prescribedGoal?.id
    ? milestones.find((item) => String(item.id) === String(prescribedGoal.id) && !item.archived)
    : null;
  const focusTarget = matchingFocus
    || (prescribedGoal?.name && prescribedGoal.name !== mainTarget?.name ? prescribedGoal : null)
    || null;
  return { mainTarget, focusTarget };
}
