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
