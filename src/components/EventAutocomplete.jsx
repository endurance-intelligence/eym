import { useMemo, useState } from "react";
import { searchRunningEvents } from "../services/eventCatalog";
import { fmtDate } from "../utils/format";

export default function EventAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = "z. B. Hermannslauf",
  inputProps = {},
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const suggestions = useMemo(() => searchRunningEvents(value), [value]);

  return (
    <div className={`event-autocomplete ${className}`.trim()}>
      <input
        {...inputProps}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={(event) => {
          setOpen(true);
          inputProps.onFocus?.(event);
        }}
        onBlur={(event) => {
          window.setTimeout(() => setOpen(false), 120);
          inputProps.onBlur?.(event);
        }}
        onChange={(event) => {
          onChange(event.target.value, event);
          setOpen(true);
        }}
      />
      {open && value.trim().length >= 2 && suggestions.length > 0 && (
        <div className="event-suggestions" role="listbox" aria-label="Laufevent-Vorschläge">
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
                <small>{fmtDate(event.date)} · {event.time || "Startzeit offen"} · {event.targetKm ? `${event.targetKm.toLocaleString("de-DE")} km` : "Distanz offen"}</small>
              </span>
              <span className="event-suggestion-side">
                <b>✓ Offiziell</b>
                <small>{event.location}</small>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
