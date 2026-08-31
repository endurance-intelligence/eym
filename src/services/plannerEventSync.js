import { eventDurationMinutes } from "./goalPlanning.js";

function normalizedText(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function numericClose(left, right, tolerance = 0.05) {
  return Math.abs(Number(left || 0) - Number(right || 0)) <= tolerance;
}

function eventIdentity(event = {}) {
  if (event.id) return `id:${String(event.id)}`;
  return `fallback:${event.date || ""}:${normalizedText(event.name)}`;
}

function findPlannedEvent(event, plannedEntries = []) {
  if (event?.id) {
    const byId = plannedEntries.find((entry) => String(entry.targetEventId || "") === String(event.id));
    if (byId) return byId;
  }
  return plannedEntries.find((entry) => (
    String(entry.date || "") === String(event?.date || "")
    && normalizedText(entry.title) === normalizedText(event?.name)
  )) || null;
}

function changedFields(event = {}, entry = {}) {
  const fields = [];
  if (String(entry.date || "") !== String(event.date || "")) fields.push("date");
  if (event.name && normalizedText(entry.title) !== normalizedText(event.name)) fields.push("name");
  if (event.time && String(entry.time || "") !== String(event.time || "")) fields.push("time");
  if (Number(event.targetKm || 0) > 0 && !numericClose(entry.distance, event.targetKm)) fields.push("distance");
  if (event.priority && String(entry.goalPriority || "") !== String(event.priority || "")) fields.push("priority");
  const expectedDuration = Number(eventDurationMinutes(event) || 0);
  if (expectedDuration > 0 && Math.abs(Number(entry.duration || 0) - expectedDuration) > 1) fields.push("duration");
  return fields;
}

export function plannerEventSyncStatus(events = [], plan = []) {
  const expectedEvents = (Array.isArray(events) ? events : []).filter((event) => event?.date);
  const plannedEntries = (Array.isArray(plan) ? plan : []).filter((entry) => entry?.raceEvent);
  const matchedEntryIds = new Set();
  const missingEvents = [];
  const changedEvents = [];

  expectedEvents.forEach((event) => {
    const entry = findPlannedEvent(event, plannedEntries);
    if (!entry) {
      missingEvents.push(event);
      return;
    }
    matchedEntryIds.add(entry.id || eventIdentity(entry));
    const fields = changedFields(event, entry);
    if (fields.length) changedEvents.push({ event, entry, fields });
  });

  const expectedIdentities = new Set(expectedEvents.map(eventIdentity));
  const orphanedEntries = plannedEntries.filter((entry) => {
    if (matchedEntryIds.has(entry.id || eventIdentity(entry))) return false;
    if (entry.targetEventId && expectedEvents.some((event) => String(event.id || "") === String(entry.targetEventId))) return false;
    const fallbackIdentity = eventIdentity({ date: entry.date, name: entry.title });
    return !expectedIdentities.has(fallbackIdentity);
  });

  return {
    upToDate: missingEvents.length === 0 && changedEvents.length === 0 && orphanedEntries.length === 0,
    missingEvents,
    changedEvents,
    orphanedEntries,
    expectedCount: expectedEvents.length,
    plannedCount: plannedEntries.length,
  };
}
