import { supabase } from "./supabase";
import { searchRunningEvents } from "./eventCatalog";
export {
  combineEventDiscoveryResults,
  normalizeDiscoveredEvent,
} from "./eventDiscoveryCore";
import { normalizeDiscoveredEvent } from "./eventDiscoveryCore";

export const EVENT_DISCOVERY_MIN_QUERY_LENGTH = 3;
export const EVENT_DISCOVERY_DEBOUNCE_MS = 420;

export async function discoverRunningEvents(query, { limit = 8 } = {}) {
  const trimmed = String(query || "").trim();
  if (trimmed.length < EVENT_DISCOVERY_MIN_QUERY_LENGTH) {
    return { events: [], providers: [], cached: false, partial: false, warnings: [] };
  }

  const { data, error } = await supabase.functions.invoke("event-search", {
    body: { query: trimmed, limit },
  });
  if (error) throw new Error(error.message || "Die Live-Eventsuche ist gerade nicht erreichbar.");
  if (!data || data.ok === false) throw new Error(data?.message || "Die Live-Eventsuche ist gerade nicht erreichbar.");
  return {
    events: Array.isArray(data.events) ? data.events.map(normalizeDiscoveredEvent) : [],
    providers: Array.isArray(data.providers) ? data.providers : [],
    cached: Boolean(data.cached),
    partial: Boolean(data.partial),
    warnings: Array.isArray(data.warnings) ? data.warnings : [],
  };
}

export function localRunningEventSuggestions(query, limit = 6) {
  return searchRunningEvents(query, { limit });
}
