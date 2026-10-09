import { isPassiveRecoveryWorkout } from "./plannerTime.js";

function localDateKey(value = new Date()) {
  const date = value instanceof Date ? new Date(value) : new Date(`${String(value || "").slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function isImplicitMissedWorkout(item = {}, { now = new Date(), todayKey = "", matched = false } = {}) {
  if (!item || item.archived || item.optional || item.completed || item.matchedActivityId || matched) return false;
  if (item.missedReason || item.plannedCancellation || isPassiveRecoveryWorkout(item)) return false;
  const workoutDate = String(item.date || "").slice(0, 10);
  const currentDate = todayKey || localDateKey(now);
  return Boolean(workoutDate && currentDate && workoutDate < currentDate);
}

export function isMissedWorkout(item = {}, options = {}) {
  return Boolean(item?.missedReason || item?.plannedCancellation || isImplicitMissedWorkout(item, options));
}
