import {
  mergeRunningEventSuggestions,
  normalizeEventSearchText,
  rankRunningEventSuggestions,
} from "./eventCatalog.js";

function stableEventId(event = {}) {
  const provider = normalizeEventSearchText(event.provider || "event").replace(/\s+/g, "-") || "event";
  const providerId = normalizeEventSearchText(event.providerEventId || event.id).replace(/\s+/g, "-");
  const fallback = normalizeEventSearchText(`${event.name || "event"}-${event.date || "open"}-${event.disciplineName || event.targetKm || "event"}`)
    .replace(/\s+/g, "-")
    .slice(0, 180);
  return `${provider}-${providerId || fallback || "unknown"}`;
}

export function normalizeDiscoveredEvent(event = {}) {
  const targetKm = event.targetKm === "" || event.targetKm == null ? null : Number(event.targetKm);
  const elevationGain = event.elevationGain === "" || event.elevationGain == null ? 0 : Number(event.elevationGain);
  const elevationLoss = event.elevationLoss === "" || event.elevationLoss == null ? 0 : Number(event.elevationLoss);
  const normalized = {
    id: "",
    provider: String(event.provider || "unknown").trim().toLowerCase(),
    providerEventId: String(event.providerEventId || event.id || "").trim(),
    name: String(event.name || "").trim(),
    edition: String(event.edition || "").trim(),
    disciplineName: String(event.disciplineName || "").trim(),
    aliases: Array.isArray(event.aliases) ? event.aliases.map(String).filter(Boolean) : [],
    date: String(event.date || "").slice(0, 10),
    endDate: String(event.endDate || event.date || "").slice(0, 10),
    time: String(event.time || "").slice(0, 5),
    location: String(event.location || "").trim(),
    countryCode: String(event.countryCode || "").toUpperCase().slice(0, 2),
    targetKm: Number.isFinite(targetKm) && targetKm > 0 ? targetKm : null,
    goalDiscipline: event.goalDiscipline || "auto",
    surface: event.surface || "road",
    courseType: event.courseType || "unspecified",
    elevationGain: Number.isFinite(elevationGain) && elevationGain > 0 ? elevationGain : 0,
    elevationLoss: Number.isFinite(elevationLoss) && elevationLoss > 0 ? elevationLoss : 0,
    sourceName: String(event.sourceName || "").trim(),
    sourceUrl: String(event.sourceUrl || "").trim(),
    verifiedAt: String(event.verifiedAt || "").slice(0, 10),
    status: event.status || "provider",
    details: String(event.details || "").trim(),
  };
  normalized.id = String(event.id || stableEventId(normalized));
  return normalized;
}

export function combineEventDiscoveryResults(query, localEvents = [], remoteEvents = [], limit = 8) {
  const normalizedRemote = remoteEvents.map(normalizeDiscoveredEvent).filter((event) => event.name);
  return rankRunningEventSuggestions(
    mergeRunningEventSuggestions(localEvents, normalizedRemote),
    query,
    { limit },
  );
}
