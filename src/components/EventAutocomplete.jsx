import { useEffect, useMemo, useRef, useState } from "react";
import {
  eventProviderLabel,
  eventSourceStatusLabel,
} from "../services/eventCatalog";
import {
  combineEventDiscoveryResults,
  discoverRunningEvents,
  EVENT_DISCOVERY_DEBOUNCE_MS,
  EVENT_DISCOVERY_MIN_QUERY_LENGTH,
  localRunningEventSuggestions,
} from "../services/eventDiscovery";
import { fmtDate } from "../utils/format";

function dateLabel(value) {
  return value ? fmtDate(value) : "Datum offen";
}

function distanceLabel(value) {
  const distance = Number(value || 0);
  return distance > 0 ? `${distance.toLocaleString("de-DE", { maximumFractionDigits: 3 })} km` : "Distanz offen";
}

function discoveryMessage(state, resultCount) {
  if (state.phase === "loading") return "Race Result und Davengo werden durchsucht …";
  if (state.phase === "error") return "Live-Suche nicht erreichbar · lokale Vorschläge bleiben verfügbar.";
  if (state.phase === "done" && resultCount === 0) return "Kein passendes veröffentlichtes Event gefunden. Du kannst das Event weiterhin manuell eintragen.";
  if (state.phase === "done" && state.partial) return "Ergebnisse geladen · mindestens eine Eventquelle war vorübergehend nicht erreichbar.";
  if (state.phase === "done" && state.cached) return "Eventdaten aus dem geprüften Zwischenspeicher geladen.";
  return "";
}

export default function EventAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = "Eventname oder Ort",
  inputProps = {},
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const [remoteResult, setRemoteResult] = useState({ query: "", events: [] });
  const [discovery, setDiscovery] = useState({ query: "", phase: "idle", cached: false, partial: false, providers: [] });
  const requestSequence = useRef(0);
  const trimmedValue = value.trim();
  const localEvents = useMemo(() => localRunningEventSuggestions(value, 6), [value]);
  const queryIsSearchable = trimmedValue.length >= EVENT_DISCOVERY_MIN_QUERY_LENGTH;
  const activeDiscovery = !queryIsSearchable
    ? { phase: "idle", cached: false, partial: false, providers: [] }
    : discovery.query === trimmedValue
      ? discovery
      : { query: trimmedValue, phase: "loading", cached: false, partial: false, providers: [] };
  const suggestions = useMemo(
    () => combineEventDiscoveryResults(
      value,
      localEvents,
      remoteResult.query === trimmedValue ? remoteResult.events : [],
      8,
    ),
    [localEvents, remoteResult, trimmedValue, value],
  );

  useEffect(() => {
    const currentRequest = requestSequence.current + 1;
    requestSequence.current = currentRequest;
    if (trimmedValue.length < EVENT_DISCOVERY_MIN_QUERY_LENGTH) return undefined;

    const timer = window.setTimeout(async () => {
      setDiscovery({ query: trimmedValue, phase: "loading", cached: false, partial: false, providers: [] });
      try {
        const result = await discoverRunningEvents(trimmedValue, { limit: 10 });
        if (requestSequence.current !== currentRequest) return;
        setRemoteResult({ query: trimmedValue, events: result.events });
        setDiscovery({
          query: trimmedValue,
          phase: "done",
          cached: result.cached,
          partial: result.partial,
          providers: result.providers,
          warnings: result.warnings,
        });
      } catch (error) {
        if (requestSequence.current !== currentRequest) return;
        setRemoteResult({ query: trimmedValue, events: [] });
        setDiscovery({ query: trimmedValue, phase: "error", cached: false, partial: true, providers: [], error: error.message });
      }
    }, EVENT_DISCOVERY_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [trimmedValue]);

  const message = discoveryMessage(activeDiscovery, suggestions.length);

  return (
    <div className={`event-autocomplete ${className}`.trim()}>
      <input
        {...inputProps}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open && trimmedValue.length >= EVENT_DISCOVERY_MIN_QUERY_LENGTH}
        onFocus={(event) => {
          setOpen(true);
          inputProps.onFocus?.(event);
        }}
        onBlur={(event) => {
          window.setTimeout(() => setOpen(false), 160);
          inputProps.onBlur?.(event);
        }}
        onChange={(event) => {
          onChange(event.target.value, event);
          setOpen(true);
        }}
      />
      {open && trimmedValue.length >= EVENT_DISCOVERY_MIN_QUERY_LENGTH && (
        <div className="event-suggestions" role="listbox" aria-label="Laufevent-Vorschläge">
          <div className={`event-discovery-status ${activeDiscovery.phase}`} role="status">
            <span className="event-discovery-dot" aria-hidden="true" />
            <div>
              <strong>{activeDiscovery.phase === "loading" ? "Live-Eventsuche" : "Eventsuche"}</strong>
              <small>{message || `${suggestions.length} passende Vorschläge aus lokalen und veröffentlichten Eventdaten.`}</small>
            </div>
          </div>
          {suggestions.map((event) => (
            <button
              key={event.id}
              type="button"
              role="option"
              aria-selected="false"
              onMouseDown={(mouseEvent) => mouseEvent.preventDefault()}
              onClick={() => {
                onSelect(event);
                setOpen(false);
              }}
            >
              <span className="event-suggestion-main">
                <strong>{event.name}</strong>
                {event.disciplineName && event.disciplineName !== event.name && <em>{event.disciplineName}</em>}
                <small>{dateLabel(event.date)} · {event.time || "Startzeit offen"} · {distanceLabel(event.targetKm)}</small>
              </span>
              <span className="event-suggestion-side">
                <b className={`provider-${event.provider || "unknown"}`}>{eventProviderLabel(event.provider)}</b>
                <small>{event.location || "Ort offen"}</small>
                <small>{eventSourceStatusLabel(event.status)}</small>
              </span>
            </button>
          ))}
          {activeDiscovery.phase !== "loading" && suggestions.length === 0 && (
            <div className="event-suggestion-empty">
              <strong>Manueller Eintrag bleibt möglich</strong>
              <small>Name, Datum, Ort und Distanz können direkt im Formular ergänzt werden.</small>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
