function validTime(value: unknown) {
  return /^\d{2}:\d{2}$/.test(String(value || ""));
}

function isSpontaneousWorkout(item: Record<string, unknown>) {
  if (item.fixed || item.commitmentId) return false;
  if (typeof item.spontaneous === "boolean") return item.spontaneous;
  return true;
}

export function intervalsStartDateLocal(item: Record<string, unknown>) {
  const date = String(item.date || "");
  const time = !isSpontaneousWorkout(item) && validTime(item.time) ? String(item.time) : "00:00";
  return `${date}T${time}:00`;
}
