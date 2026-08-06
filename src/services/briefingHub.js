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

export function weekHubSummary({ planner = {}, now = new Date(), openItems = 0, completedKm = 0 } = {}) {
  const prescription = currentWeekPrescription(planner, now);
  if (!prescription) {
    return {
      prescription: null,
      typeLabel: "Wochensteuerung offen",
      corridorLabel: planner?.lastTarget ? `${planner.lastTarget} km bisheriger Rahmen` : "Noch nicht berechnet",
      focus: "Die nächste Wochenberechnung legt Trainingsphase, Umfang und Schwerpunkt transparent fest.",
      meta: `${openItems} offene Einheit${openItems === 1 ? "" : "en"} · ${numeric(completedKm).toFixed(1).replace(".0", "")} km absolviert`,
      tone: "neutral",
    };
  }
  return {
    prescription,
    typeLabel: prescription.weekType?.label || "Trainingswoche",
    corridorLabel: prescription.corridor?.label || `${prescription.targetKm || planner?.lastTarget || "–"} km`,
    focus: prescription.focus || prescription.weekType?.summary || "Der Coach steuert Umfang und Reize automatisch.",
    meta: `${openItems} offene Einheit${openItems === 1 ? "" : "en"} · ${numeric(completedKm).toFixed(1).replace(".0", "")} km absolviert`,
    tone: prescription.weekType?.tone || "neutral",
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
