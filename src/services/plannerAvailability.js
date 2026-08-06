export const AVAILABILITY_STATUS = Object.freeze({
  BLOCKED: "blocked",
  AVAILABLE: "available",
});

export const AVAILABILITY_REASONS = [
  "Familie",
  "Reise",
  "Arbeit",
  "Termin",
  "Erholung",
  "Krankheit",
  "Sonstiges",
];

function validIsoDate(value = "") {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

export function normalizeAvailabilityException(exception = {}) {
  const date = validIsoDate(exception.date) ? exception.date : "";
  const status = exception.status === AVAILABILITY_STATUS.AVAILABLE
    ? AVAILABILITY_STATUS.AVAILABLE
    : AVAILABILITY_STATUS.BLOCKED;
  const reason = AVAILABILITY_REASONS.includes(exception.reason)
    ? exception.reason
    : exception.reason
      ? "Sonstiges"
      : "Termin";

  return {
    id: exception.id || `availability-${date || crypto.randomUUID()}`,
    date,
    status,
    reason,
    note: String(exception.note || "").trim().slice(0, 240),
    createdAt: exception.createdAt || new Date().toISOString(),
    updatedAt: exception.updatedAt || new Date().toISOString(),
  };
}

export function normalizeAvailabilityExceptions(exceptions = []) {
  const byDate = new Map();
  (Array.isArray(exceptions) ? exceptions : [])
    .map(normalizeAvailabilityException)
    .filter((entry) => entry.date)
    .forEach((entry) => {
      const existing = byDate.get(entry.date);
      if (!existing || String(entry.updatedAt || "") >= String(existing.updatedAt || "")) byDate.set(entry.date, entry);
    });
  return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
}

export function availabilityForDate(exceptions = [], date = "") {
  if (!validIsoDate(date)) return null;
  return normalizeAvailabilityExceptions(exceptions).find((entry) => entry.date === date) || null;
}

export function blockedAvailabilityDates(exceptions = [], weekStart = "", weekEnd = "") {
  return new Set(normalizeAvailabilityExceptions(exceptions)
    .filter((entry) => entry.status === AVAILABILITY_STATUS.BLOCKED)
    .filter((entry) => (!weekStart || entry.date >= weekStart) && (!weekEnd || entry.date <= weekEnd))
    .map((entry) => entry.date));
}

export function availabilityLabel(exception = {}) {
  if (!exception?.date || exception.status !== AVAILABILITY_STATUS.BLOCKED) return "Verfügbar";
  return exception.reason ? `Nicht verfügbar · ${exception.reason}` : "Nicht verfügbar";
}

export function upsertAvailabilityException(exceptions = [], input = {}) {
  const normalized = normalizeAvailabilityException(input);
  if (!normalized.date) return normalizeAvailabilityExceptions(exceptions);
  return normalizeAvailabilityExceptions([
    ...normalizeAvailabilityExceptions(exceptions).filter((entry) => entry.date !== normalized.date),
    normalized,
  ]);
}

export function removeAvailabilityException(exceptions = [], date = "") {
  return normalizeAvailabilityExceptions(exceptions).filter((entry) => entry.date !== date);
}
