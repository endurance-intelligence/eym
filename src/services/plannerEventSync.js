import { eventActiveOnDate, eventDurationMinutes, eventPlanningWindowMinutes } from "./goalPlanning.js";

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


function datePlusDays(date, days) {
  const value = new Date(`${date}T12:00:00`);
  if (!Number.isFinite(value.getTime())) return "";
  value.setDate(value.getDate() + days);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function continuationDates(event = {}) {
  if (!event?.date || eventPlanningWindowMinutes(event) <= 24 * 60) return [];
  const dates = [];
  for (let offset = 1; offset <= 7; offset += 1) {
    const date = datePlusDays(event.date, offset);
    if (!date || !eventActiveOnDate(event, date)) break;
    dates.push(date);
  }
  return dates;
}

function sameEvent(entry = {}, event = {}) {
  if (event.id && String(entry.targetEventId || "") === String(event.id)) return true;
  const eventName = normalizedText(event.name);
  if (!eventName) return false;
  return normalizedText(entry.title).includes(eventName) || normalizedText(entry.notes).includes(eventName);
}

function generatedRecoveryForEvent(entry = {}, event = {}) {
  if (String(entry.type || "") !== "Ruhetag") return false;
  if (!sameEvent(entry, event)) return false;
  const text = `${normalizedText(entry.title)} ${normalizedText(entry.notes)}`;
  return /erholung nach|recovery|eventwoche|wettkampf/.test(text);
}

function continuationEntry(event = {}, date = "") {
  const hours = Math.round(eventPlanningWindowMinutes(event) / 60);
  return {
    id: `event-continuation:${event.id || `${event.date}:${event.name || "event"}`}:${date}`,
    date,
    day: "",
    time: "",
    title: `${event.name || "Event"} · mögliche Fortsetzung`,
    type: "Wettkampf-Fortsetzung",
    distance: 0,
    duration: 0,
    notes: `Das Event ist mit einem Planungshorizont von ${hours} h hinterlegt und kann bis in diesen Kalendertag laufen. Kein separater Longrun und keine zusätzliche Trainingseinheit einplanen.`,
    optional: false,
    fixed: true,
    spontaneous: false,
    eventContinuation: true,
    targetEventId: event.id || null,
    goalPriority: event.priority,
    goalType: event.goalType,
    source: "planner-engine",
    archived: false,
  };
}

export function reconcileEventContinuationEntries(events = [], plan = []) {
  const expectedEvents = (Array.isArray(events) ? events : []).filter((event) => event?.date);
  let next = Array.isArray(plan) ? [...plan] : [];
  let changed = false;

  expectedEvents.forEach((event) => {
    const expectedDates = new Set(continuationDates(event));

    if (!expectedDates.size) {
      const beforeLength = next.length;
      next = next.filter((entry) => !(entry.eventContinuation && sameEvent(entry, event)));
      if (next.length !== beforeLength) changed = true;
      return;
    }

    const beforeLength = next.length;
    next = next.filter((entry) => !(
      expectedDates.has(String(entry.date || ""))
      && generatedRecoveryForEvent(entry, event)
    ));
    if (next.length !== beforeLength) changed = true;

    expectedDates.forEach((date) => {
      const existing = next.find((entry) => entry.eventContinuation && String(entry.date || "") === date && sameEvent(entry, event));
      if (!existing) {
        next.push(continuationEntry(event, date));
        changed = true;
      }
    });

    const beforeObsolete = next.length;
    next = next.filter((entry) => !(
      entry.eventContinuation
      && sameEvent(entry, event)
      && !expectedDates.has(String(entry.date || ""))
    ));
    if (next.length !== beforeObsolete) changed = true;
  });

  const expectedEventIds = new Set(expectedEvents.map((event) => String(event.id || "")).filter(Boolean));
  const beforeOrphans = next.length;
  next = next.filter((entry) => !(
    entry.eventContinuation
    && entry.targetEventId
    && !expectedEventIds.has(String(entry.targetEventId))
    && (entry.source === "planner-engine" || String(entry.id || "").startsWith("event-continuation:"))
  ));
  if (next.length !== beforeOrphans) changed = true;

  return { plan: changed ? next : plan, changed };
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
  const allPlanEntries = Array.isArray(plan) ? plan : [];
  const plannedEntries = allPlanEntries.filter((entry) => entry?.raceEvent);
  const plannedContinuations = allPlanEntries.filter((entry) => entry?.eventContinuation);
  const matchedEntryIds = new Set();
  const missingEvents = [];
  const changedEvents = [];
  const missingContinuations = [];

  expectedEvents.forEach((event) => {
    const entry = findPlannedEvent(event, plannedEntries);
    if (!entry) {
      missingEvents.push(event);
      return;
    }
    matchedEntryIds.add(entry.id || eventIdentity(entry));
    const fields = changedFields(event, entry);
    if (fields.length) changedEvents.push({ event, entry, fields });
    continuationDates(event).forEach((date) => {
      const continuation = plannedContinuations.find((item) => String(item.date || "") === date && sameEvent(item, event));
      if (!continuation) missingContinuations.push({ event, date });
    });
  });

  const expectedIdentities = new Set(expectedEvents.map(eventIdentity));
  const orphanedEntries = plannedEntries.filter((entry) => {
    if (matchedEntryIds.has(entry.id || eventIdentity(entry))) return false;
    if (entry.targetEventId && expectedEvents.some((event) => String(event.id || "") === String(entry.targetEventId))) return false;
    const fallbackIdentity = eventIdentity({ date: entry.date, name: entry.title });
    return !expectedIdentities.has(fallbackIdentity);
  });

  return {
    upToDate: missingEvents.length === 0 && changedEvents.length === 0 && orphanedEntries.length === 0 && missingContinuations.length === 0,
    missingEvents,
    changedEvents,
    orphanedEntries,
    missingContinuations,
    expectedCount: expectedEvents.length,
    plannedCount: plannedEntries.length,
  };
}
