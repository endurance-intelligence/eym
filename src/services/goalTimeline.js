const shortDateFormatter = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" });

function localDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function buildGoalPath(milestones = [], mainTarget = null, now = new Date()) {
  const today = localDateKey(now);
  const targetDate = mainTarget?.date || "";
  return milestones
    .filter((item) => !item?.archived && item?.date && item.date >= today)
    .filter((item) => !targetDate || item.date <= targetDate)
    .sort((a, b) => a.date.localeCompare(b.date) || Number(Boolean(a.isMainTarget)) - Number(Boolean(b.isMainTarget)) || String(a.name || "").localeCompare(String(b.name || ""), "de"));
}

export function eventDateLabel(dateString) {
  if (!dateString) return "–";
  return shortDateFormatter.format(new Date(`${dateString}T12:00:00`));
}

export function forecastAvailableFromLabel(dateString, horizonDays = 16) {
  if (!dateString) return "–";
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() - horizonDays);
  return shortDateFormatter.format(date);
}

export function weatherGlyph(condition = "") {
  const value = String(condition).toLowerCase();
  if (/gewitter/.test(value)) return "⛈️";
  if (/schnee/.test(value)) return "🌨️";
  if (/regen|niesel|schauer/.test(value)) return "🌧️";
  if (/nebel/.test(value)) return "🌫️";
  if (/bewölkt/.test(value)) return "☁️";
  if (/klar/.test(value)) return "☀️";
  return "🌤️";
}
