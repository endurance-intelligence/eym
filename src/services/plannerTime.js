const TIME_PATTERN = /^\d{2}:\d{2}$/;

export function validWorkoutTime(value) {
  return TIME_PATTERN.test(String(value || ""));
}

export function isFixedAppointment(item = {}) {
  return Boolean(item.fixed || item.commitmentId);
}

export function isSpontaneousWorkout(item = {}) {
  if (isFixedAppointment(item)) return false;
  if (typeof item.spontaneous === "boolean") return item.spontaneous;
  return true;
}

export function normalizeWorkoutTiming(item = {}, fallbackTime = "18:00") {
  const spontaneous = isSpontaneousWorkout(item);
  return {
    ...item,
    spontaneous,
    time: spontaneous
      ? ""
      : validWorkoutTime(item.time)
        ? String(item.time)
        : fallbackTime,
  };
}

export function workoutTimingLabel(item = {}) {
  if (isSpontaneousWorkout(item)) {
    const text = `${item.type || ""} ${item.title || ""}`.toLowerCase();
    return /ruhetag|rest|erholungstag/.test(text) ? "Ganztägig" : "Spontan";
  }
  return validWorkoutTime(item.time) ? `${item.time} Uhr` : "Uhrzeit offen";
}

export function workoutSortTime(item = {}) {
  if (isSpontaneousWorkout(item)) return "99:99";
  return validWorkoutTime(item.time) ? String(item.time) : "99:98";
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function canManuallyCompleteWorkout(item = {}, now = new Date()) {
  if (item.completed || item.matchedActivityId || item.plannedCancellation) return false;

  const workoutDate = String(item.date || "").slice(0, 10);
  if (!workoutDate || Number.isNaN(now.getTime())) return false;

  const today = localDateKey(now);
  if (workoutDate < today) return true;
  if (workoutDate > today) return false;
  if (isSpontaneousWorkout(item)) return true;
  if (!validWorkoutTime(item.time)) return false;

  const [hours, minutes] = String(item.time).split(":").map(Number);
  const scheduledEnd = hours * 60 + minutes + Math.max(0, Number(item.duration || 0));
  const currentTime = now.getHours() * 60 + now.getMinutes();
  return currentTime >= scheduledEnd;
}
