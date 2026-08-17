function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("de-DE")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function withinWeek(item, weekStart, weekEnd) {
  const date = String(item?.date || "");
  return Boolean(date && date >= String(weekStart || "") && date <= String(weekEnd || ""));
}

export function planEntriesForWeek(plan = [], weekStart = "", weekEnd = "") {
  return (Array.isArray(plan) ? plan : [])
    .filter((item) => withinWeek(item, weekStart, weekEnd) && !item.archived)
    .map((item) => ({ ...item }))
    .sort((left, right) => `${left.date || ""}${left.time || ""}${left.title || ""}`.localeCompare(`${right.date || ""}${right.time || ""}${right.title || ""}`));
}

function planRole(item = {}) {
  if (item.commitmentId) return `commitment:${item.commitmentId}`;
  if (item.fixedSlot) return `fixed:${item.fixedSlot}`;
  if (item.saturdaySlot) return "fixed:saturday";
  if (item.raceEvent) return `race:${item.goalId || normalizeText(item.title) || "event"}`;

  const text = normalizeText(`${item.type || ""} ${item.title || ""}`);
  if (/fussball|football/.test(text)) return "football";
  if (/rudern|rowing|rowerg/.test(text)) return "rowing";
  if (/stabi|mobility|mobilitat|kraft/.test(text)) return "mobility";
  if (/ruhetag|rest|erholungstag/.test(text)) return "rest";
  if (/track|intervall|interval/.test(text)) return "track";
  if (/backyard|loop|longrun|long run|langer lauf/.test(text)) return "long";
  if (/schwelle|threshold|tempo/.test(text)) return "quality";
  if (/recovery|regeneration/.test(text)) return "recovery";
  if (/easy|locker|grundlage|lauf|running|orc run/.test(text)) return "easy";
  return text || "other";
}

function displayFingerprint(item = {}) {
  return JSON.stringify({
    date: item.date || "",
    time: item.time || "",
    title: item.title || "",
    type: item.type || "",
    distance: numeric(item.distance),
    duration: numeric(item.duration),
    optional: Boolean(item.optional),
    fixed: Boolean(item.fixed),
    keySession: Boolean(item.keySession),
    missedReason: item.missedReason || "",
    plannedCancellation: Boolean(item.plannedCancellation),
  });
}

function sortEntries(entries = []) {
  return [...entries].sort((left, right) => `${left.date || ""}${left.time || ""}${left.title || ""}`.localeCompare(`${right.date || ""}${right.time || ""}${right.title || ""}`));
}

function comparableFields(before = {}, after = {}) {
  const fields = [];
  if ((before.date || "") !== (after.date || "")) fields.push("date");
  if ((before.time || "") !== (after.time || "")) fields.push("time");
  if ((before.title || "") !== (after.title || "")) fields.push("title");
  if ((before.type || "") !== (after.type || "")) fields.push("type");
  if (Math.abs(numeric(before.distance) - numeric(after.distance)) > 0.01) fields.push("distance");
  if (Math.abs(numeric(before.duration) - numeric(after.duration)) > 0.5) fields.push("duration");
  if (Boolean(before.optional) !== Boolean(after.optional)) fields.push("optional");
  if (Boolean(before.fixed) !== Boolean(after.fixed)) fields.push("fixed");
  return fields;
}

function isRunningEntry(item = {}) {
  const role = planRole(item);
  return Boolean(item.raceEvent)
    || role.startsWith("race:")
    || ["easy", "recovery", "quality", "track", "long"].includes(role)
    || normalizeText(item.type) === "running";
}

function runningKm(entries = []) {
  return entries.reduce((sum, item) => sum + (isRunningEntry(item) && !item.missedReason && !item.plannedCancellation ? numeric(item.distance) : 0), 0);
}

function pairGroups(beforeEntries, afterEntries) {
  const beforeGroups = new Map();
  const afterGroups = new Map();
  beforeEntries.forEach((item) => {
    const key = `${item.date || ""}|${planRole(item)}`;
    beforeGroups.set(key, [...(beforeGroups.get(key) || []), item]);
  });
  afterEntries.forEach((item) => {
    const key = `${item.date || ""}|${planRole(item)}`;
    afterGroups.set(key, [...(afterGroups.get(key) || []), item]);
  });

  const paired = [];
  const removed = [];
  const added = [];
  const keys = new Set([...beforeGroups.keys(), ...afterGroups.keys()]);
  keys.forEach((key) => {
    const before = sortEntries(beforeGroups.get(key) || []);
    const after = sortEntries(afterGroups.get(key) || []);
    const count = Math.min(before.length, after.length);
    for (let index = 0; index < count; index += 1) paired.push([before[index], after[index]]);
    removed.push(...before.slice(count));
    added.push(...after.slice(count));
  });

  return { paired, removed, added };
}

function pairMovedEntries(removedEntries, addedEntries) {
  const removed = [...removedEntries];
  const added = [...addedEntries];
  const moved = [];

  for (let removedIndex = removed.length - 1; removedIndex >= 0; removedIndex -= 1) {
    const before = removed[removedIndex];
    const beforeRole = planRole(before);
    const beforeTitle = normalizeText(before.title);
    let matchIndex = added.findIndex((after) => planRole(after) === beforeRole && normalizeText(after.title) === beforeTitle);
    if (matchIndex < 0) {
      const sameRole = added.filter((after) => planRole(after) === beforeRole);
      if (sameRole.length === 1 && removed.filter((item) => planRole(item) === beforeRole).length === 1) {
        matchIndex = added.indexOf(sameRole[0]);
      }
    }
    if (matchIndex < 0) continue;
    moved.push([before, added[matchIndex]]);
    removed.splice(removedIndex, 1);
    added.splice(matchIndex, 1);
  }

  return { moved, removed, added };
}

export function buildPlanChangePreview(beforeEntries = [], afterEntries = []) {
  const before = sortEntries(beforeEntries);
  const after = sortEntries(afterEntries);
  const grouped = pairGroups(before, after);
  const moved = pairMovedEntries(grouped.removed, grouped.added);
  const changed = [];
  let unchangedCount = 0;

  [...grouped.paired, ...moved.moved].forEach(([previous, next]) => {
    if (displayFingerprint(previous) === displayFingerprint(next)) {
      unchangedCount += 1;
      return;
    }
    changed.push({
      before: previous,
      after: next,
      fields: comparableFields(previous, next),
    });
  });

  const beforeRunningKm = runningKm(before);
  const afterRunningKm = runningKm(after);
  const deltaRunningKm = afterRunningKm - beforeRunningKm;
  const added = sortEntries(moved.added);
  const removed = sortEntries(moved.removed);

  return {
    beforeRunningKm,
    afterRunningKm,
    deltaRunningKm,
    changed,
    added,
    removed,
    unchangedCount,
    changeCount: changed.length + added.length + removed.length,
    hasChanges: changed.length > 0 || added.length > 0 || removed.length > 0,
  };
}

const volatilePlanFields = new Set([
  "id",
  "createdAt",
  "updatedAt",
  "intervalsPublishedAt",
  "intervalsPublishedFingerprint",
]);

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value)
    .filter((key) => !volatilePlanFields.has(key))
    .sort()
    .reduce((result, key) => {
      result[key] = canonicalValue(value[key]);
      return result;
    }, {});
}

function stableEntry(item = {}) {
  return canonicalValue(item);
}

function fnv1a(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function planChangeFingerprint(entries = []) {
  const stable = sortEntries(entries).map(stableEntry);
  return fnv1a(JSON.stringify(stable));
}

export function mergeGeneratedWeekPlan(currentPlan = [], generatedPlan = [], {
  weekStart = "",
  weekEnd = "",
  requestedDates = [],
  offsetWeeks = 0,
  todayKey = "",
} = {}) {
  const requested = new Set(Array.isArray(requestedDates) ? requestedDates : []);
  const base = (Array.isArray(currentPlan) ? currentPlan : []).filter((item) => {
    const outsideWeek = !withinWeek(item, weekStart, weekEnd);
    const protectedEntry = item.source !== "planner-engine"
      || item.completed
      || item.missedReason
      || (offsetWeeks === 0 && todayKey && String(item.date || "") < todayKey);
    if (requested.size) return outsideWeek || !requested.has(item.date) || protectedEntry;
    return outsideWeek || protectedEntry;
  });
  const additions = requested.size
    ? (Array.isArray(generatedPlan) ? generatedPlan : []).filter((item) => requested.has(item.date))
    : (Array.isArray(generatedPlan) ? generatedPlan : []);
  return [...base, ...additions];
}

export function canUndoPlanChange(currentEntries = [], snapshot = null) {
  if (!snapshot?.afterFingerprint) return false;
  return planChangeFingerprint(currentEntries) === snapshot.afterFingerprint;
}

export function restorePlanFromSnapshot(currentPlan = [], snapshot = null) {
  if (!snapshot?.weekStart || !snapshot?.weekEnd || !Array.isArray(snapshot.beforeEntries)) return currentPlan;
  return [
    ...(Array.isArray(currentPlan) ? currentPlan : []).filter((item) => !withinWeek(item, snapshot.weekStart, snapshot.weekEnd) || item.archived),
    ...snapshot.beforeEntries.map((item) => ({ ...item })),
  ];
}
