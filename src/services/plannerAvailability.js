export const AVAILABILITY_STATUS = Object.freeze({
  BLOCKED: "blocked",
  AVAILABLE: "available",
});

export const AVAILABILITY_REASONS = [
  "Familie",
  "Reise",
  "Urlaub",
  "Arbeit",
  "Termin",
  "Erholung",
  "Krankheit",
  "Sonstiges",
];

export const WEEKLY_CONTEXT_PRESETS = Object.freeze([
  { key: "travel", icon: "🚗", label: "Reise / langer Fahrtag", help: "Standard: kein Lauf, höchstens kurze regenerative Aktivierung.", reason: "Reise", defaultRestriction: "recovery", defaultMinutes: 20 },
  { key: "illness", icon: "🤒", label: "Krank / angeschlagen", help: "Erholung hat Vorrang; Training wird pausiert oder stark reduziert.", reason: "Krankheit", defaultRestriction: "blocked", defaultMinutes: 20 },
  { key: "vacation", icon: "🏖️", label: "Urlaub", help: "Training bleibt flexibel und wird nicht als Kilometerschuld nachgeholt.", reason: "Urlaub", defaultRestriction: "light", defaultMinutes: 30 },
  { key: "work", icon: "💼", label: "Viele Termine / Arbeit", help: "Zeitfenster begrenzen und unnötige Doppeleinheiten vermeiden.", reason: "Arbeit", defaultRestriction: "short", defaultMinutes: 30 },
  { key: "appointment", icon: "📅", label: "Privater Termin", help: "Der Coach plant um den Termin herum statt dagegen.", reason: "Termin", defaultRestriction: "short", defaultMinutes: 30 },
  { key: "time", icon: "⏱️", label: "Nur wenig Zeit", help: "Einheiten werden auf dein echtes Zeitfenster begrenzt.", reason: "Termin", defaultRestriction: "short", defaultMinutes: 30 },
  { key: "recovery", icon: "🌿", label: "Nur regenerativ", help: "Keine Qualität und kein regulärer Lauf; nur sehr locker bewegen.", reason: "Erholung", defaultRestriction: "recovery", defaultMinutes: 20 },
  { key: "blocked", icon: "⛔", label: "Training nicht möglich", help: "Der Tag bleibt komplett frei und wird nicht nachgeholt.", reason: "Sonstiges", defaultRestriction: "blocked", defaultMinutes: 20 },
]);

export const WEEKLY_CONTEXT_RESTRICTIONS = Object.freeze([
  { key: "light", label: "Leicht eingeschränkt", help: "Training ist möglich, aber keine Doppeleinheit." },
  { key: "short", label: "Nur kurz", help: "Der Coach hält jede Einheit unter deinem Zeitlimit." },
  { key: "recovery", label: "Nur regenerativ", help: "Kein Lauf und keine Qualität; höchstens kurze Mobility/Aktivierung." },
  { key: "blocked", label: "Gar nicht", help: "Der Tag bleibt komplett trainingsfrei." },
]);

const DAY_INDEX = {
  montag: 0,
  dienstag: 1,
  mittwoch: 2,
  donnerstag: 3,
  freitag: 4,
  samstag: 5,
  sonntag: 6,
};

const DAY_ALIASES = {
  montag: "montag",
  mo: "montag",
  dienstag: "dienstag",
  di: "dienstag",
  mittwoch: "mittwoch",
  mi: "mittwoch",
  donnerstag: "donnerstag",
  do: "donnerstag",
  freitag: "freitag",
  fr: "freitag",
  samstag: "samstag",
  sa: "samstag",
  sonntag: "sonntag",
  so: "sonntag",
};

const DAY_TOKEN = /\b(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag|Mo|Di|Mi|Do|Fr|Sa|So)\.?(?=\s|[-,;:&/+()]|$)/gi;

function validIsoDate(value = "") {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function isoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function constraintMinutes(value) {
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(24 * 60, parsed) : null;
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
  const maxDurationMinutes = constraintMinutes(exception.maxDurationMinutes);

  return {
    id: exception.id || `availability-${date || crypto.randomUUID()}`,
    date,
    status,
    reason,
    note: String(exception.note || "").trim().slice(0, 240),
    ...(maxDurationMinutes ? { maxDurationMinutes } : {}),
    recoveryOnly: Boolean(exception.recoveryOnly),
    noRunning: Boolean(exception.noRunning),
    noDouble: Boolean(exception.noDouble),
    source: ["planning-note", "weekly-context"].includes(exception.source) ? exception.source : "manual",
    contextKey: String(exception.contextKey || "").trim().slice(0, 40),
    createdAt: exception.createdAt || new Date().toISOString(),
    updatedAt: exception.updatedAt || new Date().toISOString(),
  };
}

function restrictionRank(exception = {}) {
  if (exception.status === AVAILABILITY_STATUS.BLOCKED) return 4;
  if (exception.recoveryOnly || exception.noRunning) return 3;
  if (exception.maxDurationMinutes) return 2;
  if (exception.noDouble) return 1;
  return 0;
}

function mergeSameDate(left = {}, right = {}) {
  const normalizedLeft = normalizeAvailabilityException(left);
  const normalizedRight = normalizeAvailabilityException(right);
  const status = normalizedLeft.status === AVAILABILITY_STATUS.BLOCKED || normalizedRight.status === AVAILABILITY_STATUS.BLOCKED
    ? AVAILABILITY_STATUS.BLOCKED
    : AVAILABILITY_STATUS.AVAILABLE;
  const durationValues = [normalizedLeft.maxDurationMinutes, normalizedRight.maxDurationMinutes].filter(Number.isFinite);
  const preferred = restrictionRank(normalizedRight) >= restrictionRank(normalizedLeft) ? normalizedRight : normalizedLeft;
  return normalizeAvailabilityException({
    ...preferred,
    id: preferred.id || normalizedLeft.id || normalizedRight.id,
    date: normalizedLeft.date || normalizedRight.date,
    status,
    reason: preferred.reason || normalizedLeft.reason || normalizedRight.reason,
    note: [normalizedLeft.note, normalizedRight.note].filter(Boolean).filter((value, index, values) => values.indexOf(value) === index).join(" · ").slice(0, 240),
    maxDurationMinutes: durationValues.length ? Math.min(...durationValues) : null,
    recoveryOnly: normalizedLeft.recoveryOnly || normalizedRight.recoveryOnly,
    noRunning: normalizedLeft.noRunning || normalizedRight.noRunning,
    noDouble: normalizedLeft.noDouble || normalizedRight.noDouble,
    // Explicit day blocks remain authoritative. Structured weekly context wins
    // over inferred free-text notes, but must never erase a manually blocked day.
    source: normalizedLeft.source === "manual" || normalizedRight.source === "manual"
      ? "manual"
      : normalizedLeft.source === "weekly-context" || normalizedRight.source === "weekly-context"
        ? "weekly-context"
        : "planning-note",
    contextKey: preferred.contextKey || normalizedLeft.contextKey || normalizedRight.contextKey || "",
    createdAt: normalizedLeft.createdAt || normalizedRight.createdAt,
    updatedAt: [normalizedLeft.updatedAt, normalizedRight.updatedAt].sort().at(-1),
  });
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

export function mergeAvailabilityExceptions(...groups) {
  const byDate = new Map();
  groups.forEach((group) => {
    normalizeAvailabilityExceptions(group).forEach((entry) => {
      const existing = byDate.get(entry.date);
      byDate.set(entry.date, existing ? mergeSameDate(existing, entry) : entry);
    });
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

export function runningRestrictedAvailabilityDates(exceptions = [], weekStart = "", weekEnd = "") {
  return new Set(normalizeAvailabilityExceptions(exceptions)
    .filter((entry) => entry.status === AVAILABILITY_STATUS.BLOCKED
      || entry.noRunning
      || entry.recoveryOnly
      || (Number(entry.maxDurationMinutes || 0) > 0 && Number(entry.maxDurationMinutes) < 30))
    .filter((entry) => (!weekStart || entry.date >= weekStart) && (!weekEnd || entry.date <= weekEnd))
    .map((entry) => entry.date));
}

export function availabilityLabel(exception = {}) {
  if (!exception?.date) return "Verfügbar";
  if (exception.status === AVAILABILITY_STATUS.BLOCKED) return exception.reason ? `Nicht verfügbar · ${exception.reason}` : "Nicht verfügbar";
  if (exception.recoveryOnly) return `Nur regenerativ${exception.maxDurationMinutes ? ` · max. ${exception.maxDurationMinutes} min` : ""}`;
  if (exception.maxDurationMinutes) return `Begrenzt · max. ${exception.maxDurationMinutes} min`;
  return "Verfügbar";
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


export function weeklyContextPreset(key = "") {
  return WEEKLY_CONTEXT_PRESETS.find((entry) => entry.key === key) || WEEKLY_CONTEXT_PRESETS.at(-1);
}

export function weeklyContextLabel(exception = {}) {
  const preset = WEEKLY_CONTEXT_PRESETS.find((entry) => entry.key === exception.contextKey);
  if (preset) return `${preset.icon} ${preset.label}`;
  const fallback = {
    Reise: "🚗 Reise / Fahrtag",
    Urlaub: "🏖️ Urlaub",
    Krankheit: "🤒 Krank / angeschlagen",
    Arbeit: "💼 Arbeit / Termine",
    Termin: "📅 Termin / wenig Zeit",
    Erholung: "🌿 Recovery",
  }[exception.reason];
  return fallback || "⚙️ Wochenbesonderheit";
}

export function weeklyContextException({ date = "", contextKey = "", restriction = "light", maxDurationMinutes = null, note = "" } = {}) {
  const preset = weeklyContextPreset(contextKey);
  const minutes = constraintMinutes(maxDurationMinutes) || preset.defaultMinutes || 20;
  const blocked = restriction === "blocked";
  const recoveryOnly = restriction === "recovery";
  const short = restriction === "short";
  return normalizeAvailabilityException({
    id: `weekly-context-${date || crypto.randomUUID()}`,
    date,
    status: blocked ? AVAILABILITY_STATUS.BLOCKED : AVAILABILITY_STATUS.AVAILABLE,
    reason: preset.reason,
    note: String(note || preset.label || "").trim(),
    maxDurationMinutes: short || recoveryOnly ? minutes : null,
    recoveryOnly,
    noRunning: blocked || recoveryOnly,
    noDouble: true,
    source: "weekly-context",
    contextKey: preset.key,
  });
}

export function availabilityExceptionsForWeek(exceptions = [], weekStart = new Date(), sources = null) {
  const start = weekStart instanceof Date ? new Date(weekStart) : new Date(`${String(weekStart || "").slice(0, 10)}T12:00:00`);
  if (Number.isNaN(start.getTime())) return [];
  const startKey = isoDate(start);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const endKey = isoDate(end);
  const sourceSet = Array.isArray(sources) ? new Set(sources) : null;
  return normalizeAvailabilityExceptions(exceptions).filter((entry) => (
    entry.date >= startKey
    && entry.date <= endKey
    && (!sourceSet || sourceSet.has(entry.source))
  ));
}

export function replaceAvailabilityExceptionsForWeek(existing = [], replacements = [], weekStart = new Date(), sources = ["weekly-context", "planning-note"]) {
  const remove = new Set(availabilityExceptionsForWeek(existing, weekStart, sources).map((entry) => entry.id));
  const kept = normalizeAvailabilityExceptions(existing).filter((entry) => !remove.has(entry.id));
  return mergeAvailabilityExceptions(kept, replacements);
}

export function applyWeeklyPlanningContext(baseConfig = {}, draftConfig = {}, weekStart = new Date()) {
  const override = { ...(draftConfig || {}) };
  const weeklyContextExceptions = Array.isArray(override.weeklyContextExceptions)
    ? override.weeklyContextExceptions
    : availabilityExceptionsForWeek(baseConfig.availabilityExceptions, weekStart, ["weekly-context"]);
  delete override.weeklyContextExceptions;

  const noteText = String(override.checkin?.notes ?? baseConfig.checkin?.notes ?? "");
  const inferredConstraints = planningConstraintsFromNote(noteText, weekStart);
  const weekAvailability = replaceAvailabilityExceptionsForWeek(
    baseConfig.availabilityExceptions,
    [...weeklyContextExceptions, ...inferredConstraints],
    weekStart,
    ["weekly-context", "planning-note"],
  );

  return {
    ...baseConfig,
    ...override,
    checkin: {
      ...(baseConfig.checkin || {}),
      ...(override.checkin || {}),
      notes: noteText,
    },
    availabilityExceptions: mergeAvailabilityExceptions(
      weekAvailability,
      override.availabilityExceptions,
    ),
  };
}

export function planningNoteForWeek(records = [], weekStart = new Date()) {
  const weekKey = weekStart instanceof Date
    ? isoDate(weekStart)
    : String(weekStart || "").slice(0, 10);
  if (!validIsoDate(weekKey)) return "";
  const record = (Array.isArray(records) ? records : []).find((entry) => String(entry?.weekStart || "").slice(0, 10) === weekKey);
  return String(record?.checkin?.notes || "");
}

export function upsertPlanningCheckinRecord(records = [], record = {}, limit = 20) {
  const weekKey = String(record?.weekStart || "").slice(0, 10);
  if (!validIsoDate(weekKey) || !record?.checkin) return Array.isArray(records) ? records : [];
  const existing = Array.isArray(records) ? records : [];
  return [
    record,
    ...existing.filter((entry) => String(entry?.weekStart || "").slice(0, 10) !== weekKey),
  ].slice(0, Math.max(1, Number(limit || 20)));
}

function parseMaximumMinutes(text = "") {
  const match = String(text).match(/(?:max(?:imal)?\.?|höchstens|nur)\s*(?:ca\.?\s*)?(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?\s*(?:min(?:uten)?|min\b)/i);
  if (!match) return null;
  return constraintMinutes(match[2] || match[1]);
}

function travelHours(text = "") {
  const matches = [...String(text).matchAll(/(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?\s*(?:h|std\.?|stunden?)\b/gi)];
  return matches.reduce((max, match) => Math.max(max, Number(match[2] || match[1]) || 0), 0);
}

function travelSignal(text = "") {
  return /reise|reisestress|reisetag|autofahrt|zugfahrt|bahnreise|flug|fliegen|unterwegs|mehrstündig|mehrere\s+stunden|stundenlang|(?:mit\s+(?:dem\s+)?)auto|im\s+auto|auto\s+(?:fahren|fahre|fahrt|unterwegs|sitzen)|lang(?:e|er|en|es)?\s+auto\s+fahr/i.test(text);
}

function reasonFromText(text = "") {
  if (travelSignal(text)) return "Reise";
  if (/arbeit|beruf|meeting|dienst/i.test(text)) return "Arbeit";
  if (/famil/i.test(text)) return "Familie";
  if (/krank|symptom/i.test(text)) return "Krankheit";
  if (/erhol|regener/i.test(text)) return "Erholung";
  if (/termin|veranstaltung/i.test(text)) return "Termin";
  return "Sonstiges";
}

function normalizedDayToken(token = "") {
  return DAY_ALIASES[String(token || "").replace(/\.$/, "").toLocaleLowerCase("de-DE")] || "";
}

function daySegmentPayload(text = "") {
  return String(text || "")
    .replace(/^\s*(?:Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag|Mo|Di|Mi|Do|Fr|Sa|So)\.?/i, "")
    .trim()
    .replace(/^[,:;\-\s]+|[,:;\-\s]+$/g, "");
}

function connectorOnlyPayload(payload = "") {
  return /^(?:(?:und|sowie|oder|bzw\.?|&|\+|\/)[,;:\-\s]*)*$/i.test(String(payload || "").trim());
}

function daySegments(note = "") {
  const text = String(note || "").trim();
  if (!text) return [];
  const matches = [...text.matchAll(DAY_TOKEN)];
  const segments = matches.map((match, index) => ({
    day: normalizedDayToken(match[1]),
    text: text.slice(match.index, matches[index + 1]?.index ?? text.length).trim().replace(/^[,:;\-\s]+|[,:;\-\s]+$/g, ""),
  })).filter((segment) => segment.day);

  let sharedPayload = "";
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const payload = daySegmentPayload(segments[index].text);
    if (payload && !connectorOnlyPayload(payload)) {
      sharedPayload = payload;
      continue;
    }
    if (sharedPayload && connectorOnlyPayload(payload)) {
      segments[index] = { ...segments[index], text: `${segments[index].text} ${sharedPayload}`.trim() };
    }
  }
  return segments;
}

export function planningConstraintsFromNote(note = "", weekStart = new Date()) {
  const start = weekStart instanceof Date ? new Date(weekStart) : new Date(`${String(weekStart || "").slice(0, 10)}T12:00:00`);
  if (Number.isNaN(start.getTime())) return [];
  start.setHours(12, 0, 0, 0);

  const parsed = daySegments(note).map((segment) => {
    const dayIndex = DAY_INDEX[segment.day];
    if (dayIndex == null) return null;
    const date = new Date(start);
    date.setDate(date.getDate() + dayIndex);
    const text = segment.text;
    const maxDurationMinutes = parseMaximumMinutes(text);
    const travel = travelSignal(text);
    const travelStress = /reisestress|anstrengend(?:e|er|en)?\s+(?:reise|fahrt)|reisetag/i.test(text);
    const longTravel = travel && (travelHours(text) >= 4 || travelStress || /lang(?:e|er|en|es)?\s+(?:reise|autofahrt|zugfahrt|fahrt)|lang(?:e|er|en|es)?\s+auto\s+fahr|mehrstündig|mehrere\s+stunden|stundenlang|ganztägig/i.test(text));
    const explicitUnavailable = /(?:training|laufen|lauf|einheit)?\s*(?:zeitlich\s*)?(?:nicht|kaum)\s*möglich|training\s*unmöglich|keine\s+zeit|ganztägig(?:er|e|es)?\s+(?:termin|unterwegs|reise)|komplett\s+verplant/i.test(text);
    const explicitlyRecoveryOnly = /nur\s+(?:sehr\s+)?(?:locker|regenerativ|recovery|aktivierung|mobility)|nur\s+(?:eine\s+)?kurze\s+(?:einheit|aktivierung)|(?:wenn\s+überhaupt\s+)?nur\s+(?:sehr\s+)?kurz(?:e|en)?(?:\s+(?:und|oder)\s+(?:sehr\s+)?(?:locker|regenerativ|recovery))?|(?:wenn\s+überhaupt[^.;]{0,60})?(?:kurz|kurze\s+einheit)[^.;]{0,40}(?:regenerativ|locker|recovery)|maximal\s+\d{1,3}(?:\s*[-–]\s*\d{1,3})?\s*min/i.test(text);
    const noRunning = /kein(?:e|en)?\s+(?:lauf|laufen|laufeinheit)|nicht\s+laufen/i.test(text);
    const recoveryOnly = !explicitUnavailable && (explicitlyRecoveryOnly || (maxDurationMinutes != null && maxDurationMinutes <= 30));
    const inferredDuration = maxDurationMinutes || (recoveryOnly && longTravel ? 20 : null);
    const travelNoRunning = longTravel;

    if (!explicitUnavailable && !recoveryOnly && !noRunning && !travelNoRunning && !inferredDuration && !travel) return null;
    return normalizeAvailabilityException({
      id: `planning-note-${isoDate(date)}`,
      date: isoDate(date),
      status: explicitUnavailable ? AVAILABILITY_STATUS.BLOCKED : AVAILABILITY_STATUS.AVAILABLE,
      reason: reasonFromText(text),
      note: text,
      maxDurationMinutes: inferredDuration,
      recoveryOnly,
      noRunning: noRunning || recoveryOnly || travelNoRunning,
      noDouble: explicitUnavailable || recoveryOnly || travel || Boolean(inferredDuration),
      source: "planning-note",
    });
  }).filter(Boolean);

  // A natural note may mention the same weekday more than once, e.g.
  // "Dienstag lange Auto fahren. Dienstag Training nicht möglich."
  // Keep the strictest interpretation instead of letting timestamp order decide.
  const byDate = new Map();
  parsed.forEach((constraint) => {
    const existing = byDate.get(constraint.date);
    byDate.set(constraint.date, existing ? mergeSameDate(existing, constraint) : constraint);
  });
  return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
}
