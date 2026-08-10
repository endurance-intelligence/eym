import { useMemo, useState } from "react";
import { useApp } from "../context/AppContext";
import { missionEvents } from "../services/goalPlanning";
import {
  buildRacePrepPlan,
  emptyRacePrepProfile,
  RACE_PREP_FORMATS,
  RACE_PREP_PRESETS,
  racePrepProfileFromEvent,
  racePrepProfileFromPreset,
} from "../services/racePrepPlanner";

function numberLabel(value, digits = 1) {
  return Number(value || 0).toLocaleString("de-DE", { maximumFractionDigits: digits });
}

function inventoryLabel(value, unit) {
  return `${numberLabel(value, 1)} ${unit}`;
}

function durationHoursValue(minutes) {
  if (!(Number(minutes) > 0)) return "";
  return Number((Number(minutes) / 60).toFixed(2));
}

function scheduleRows(strategy, limit) {
  const rows = Array.isArray(strategy?.rows) ? strategy.rows : [];
  if (limit === "all" || rows.length <= Number(limit || 0)) return rows;
  const head = rows.slice(0, Math.max(1, Number(limit || 0) - 3));
  const tail = rows.slice(-3);
  return [...head, { key: "schedule-gap", gap: true, hidden: rows.length - head.length - tail.length }, ...tail];
}

export default function RacePrepPlanner() {
  const { state, setState } = useApp();
  const events = useMemo(() => {
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    return missionEvents(state.mission).filter((event) => event.date >= todayKey);
  }, [state.mission]);
  const savedPlans = Array.isArray(state.racePrepPlans) ? state.racePrepPlans : [];
  const initialEvent = events[0] || null;
  const [draft, setDraft] = useState(() => initialEvent
    ? racePrepProfileFromEvent(initialEvent)
    : racePrepProfileFromPreset("marathon"));
  const [sourceKey, setSourceKey] = useState(() => initialEvent ? `event:${initialEvent.id}` : "free");
  const [scheduleLimit, setScheduleLimit] = useState(24);

  const plan = useMemo(() => buildRacePrepPlan({ profile: draft, state }), [draft, state]);
  const rows = scheduleRows(plan.strategy, scheduleLimit);

  function loadSource(value) {
    setSourceKey(value);
    setScheduleLimit(24);
    if (value === "free") {
      setDraft(emptyRacePrepProfile());
      return;
    }
    if (value.startsWith("event:")) {
      const event = events.find((item) => `event:${item.id}` === value);
      if (event) setDraft(racePrepProfileFromEvent(event));
      return;
    }
    if (value.startsWith("saved:")) {
      const saved = savedPlans.find((item) => `saved:${item.id}` === value);
      if (saved) setDraft({ ...saved, source: "saved" });
    }
  }

  function applyPreset(key) {
    setSourceKey("free");
    setScheduleLimit(24);
    setDraft(racePrepProfileFromPreset(key));
  }

  function update(field, value) {
    setDraft((current) => {
      const next = { ...current, [field]: value };
      if (field === "distanceKm" && current.durationEstimated) {
        next.durationMinutes = 0;
      }
      if (field === "durationMinutes") next.durationEstimated = false;
      if (["loopKm", "loopIntervalMinutes", "rounds"].includes(field)) next.durationMinutes = 0;
      return next;
    });
  }

  function savePlan() {
    if (!plan.valid) return;
    const existingId = sourceKey.startsWith("saved:") ? sourceKey.slice(6) : "";
    const id = existingId || crypto.randomUUID();
    const saved = {
      ...plan.profile,
      id,
      source: "saved",
      savedAt: new Date().toISOString(),
    };
    setState((current) => ({
      ...current,
      racePrepPlans: [
        ...(Array.isArray(current.racePrepPlans) ? current.racePrepPlans : []).filter((item) => item.id !== id),
        saved,
      ],
    }));
    setDraft(saved);
    setSourceKey(`saved:${id}`);
  }

  function deletePlan() {
    if (!sourceKey.startsWith("saved:")) return;
    const id = sourceKey.slice(6);
    setState((current) => ({
      ...current,
      racePrepPlans: (Array.isArray(current.racePrepPlans) ? current.racePrepPlans : []).filter((item) => item.id !== id),
    }));
    setSourceKey("free");
    setDraft(emptyRacePrepProfile());
    setScheduleLimit(24);
  }

  return (
    <div className="race-prep-planner">
      <div className="race-prep-heading">
        <div>
          <p className="eyebrow">Race Prep</p>
          <h2>Verpflegung vor dem Rennen durchplanen</h2>
          <p>Beliebige Distanz oder Dauer planen, konkrete Produkte verteilen, Bestand prüfen und fehlende Mengen einkaufen.</p>
        </div>
        <label>
          Vorlage / Rennen
          <select value={sourceKey} onChange={(event) => loadSource(event.target.value)}>
            <option value="free">Freie Planung</option>
            {events.length > 0 && <optgroup label="Meine Ziele">
              {events.map((event) => <option value={`event:${event.id}`} key={event.id}>{event.name} · {event.date}</option>)}
            </optgroup>}
            {savedPlans.length > 0 && <optgroup label="Gespeicherte Race-Prep-Pläne">
              {savedPlans.map((item) => <option value={`saved:${item.id}`} key={item.id}>{item.name}</option>)}
            </optgroup>}
          </select>
        </label>
      </div>

      <div className="race-prep-presets" aria-label="Race-Prep-Schnellwahl">
        {RACE_PREP_PRESETS.map((preset) => (
          <button type="button" key={preset.key} onClick={() => applyPreset(preset.key)}>{preset.label}</button>
        ))}
      </div>

      <section className="race-prep-editor">
        <div className="race-prep-editor-grid">
          <label>
            Rennen / Name
            <input value={draft.name} onChange={(event) => update("name", event.target.value)} />
          </label>
          <label>
            Format
            <select value={draft.format} onChange={(event) => update("format", event.target.value)}>
              {RACE_PREP_FORMATS.map((item) => <option value={item.key} key={item.key}>{item.label}</option>)}
            </select>
          </label>
          {draft.format !== "time" && (
            <label>
              Distanz (km)
              <input type="number" min="0.1" step="0.1" value={draft.format === "loop" ? Number(draft.loopKm || 0) * Number(draft.rounds || 0) : draft.distanceKm || ""} disabled={draft.format === "loop"} onChange={(event) => update("distanceKm", event.target.value)} />
            </label>
          )}
          <label>
            Erwartete Dauer (Stunden)
            <input type="number" min="0.1" step="0.25" value={durationHoursValue(draft.durationMinutes)} onChange={(event) => update("durationMinutes", Number(event.target.value || 0) * 60)} />
            {draft.durationEstimated && <small>Aktuell aus der Distanz geschätzt – für Einkauf und finalen Plan bitte anpassen.</small>}
          </label>
          {draft.format === "loop" && <>
            <label>
              Rundenlänge (km)
              <input type="number" min="0.1" step="0.1" value={draft.loopKm} onChange={(event) => update("loopKm", event.target.value)} />
            </label>
            <label>
              Starttakt je Runde (min)
              <input type="number" min="10" step="1" value={draft.loopIntervalMinutes} onChange={(event) => update("loopIntervalMinutes", event.target.value)} />
            </label>
            <label>
              Planungshorizont (Runden)
              <input type="number" min="1" step="1" value={draft.rounds} onChange={(event) => update("rounds", event.target.value)} />
              <small>Beim offenen Backyard ist das die Menge, für die du einkaufen und vorbereiten willst.</small>
            </label>
          </>}
        </div>
        <div className="race-prep-editor-actions">
          <button type="button" onClick={savePlan} disabled={!plan.valid}>Plan speichern</button>
          {sourceKey.startsWith("saved:") && <button type="button" className="secondary" onClick={deletePlan}>Gespeicherten Plan löschen</button>}
        </div>
      </section>

      {!plan.valid ? (
        <div className="race-prep-error"><b>Plan noch nicht berechenbar</b><span>{plan.error}</span></div>
      ) : <>
        <div className="race-prep-summary">
          <article><span>Rennumfang</span><strong>{plan.summary.distanceLabel}</strong><small>{plan.summary.durationLabel}{plan.profile.durationEstimated ? " · geschätzt" : ""}</small></article>
          <article><span>Carbs DURING</span><strong>{plan.summary.carbsPerHour ? `${plan.summary.carbsPerHour} g/h` : "nicht nötig"}</strong><small>{plan.summary.carbsTotal ? `${plan.summary.carbsTotal} g gesamt` : "Kurz genug ohne Race-Fuel"}</small></article>
          <article><span>Trinken DURING</span><strong>{plan.summary.fluidPerHour ? `${plan.summary.fluidPerHour} ml/h` : "nach Bedarf"}</strong><small>{plan.summary.fluidTotal ? `${numberLabel(plan.summary.fluidTotal, 0)} ml gesamt` : "kein fixer Block"}</small></article>
          <article className={plan.stockReady ? "ready" : "warn"}><span>Bestand</span><strong>{plan.stockReady ? "Race ready" : `${plan.shoppingNeeded.length} Positionen fehlen`}</strong><small>{plan.stockReady ? "Packliste ist abgedeckt" : "Einkaufsliste unten"}</small></article>
        </div>

        <section className="race-prep-phases">
          {plan.phases.map((phase) => (
            <article key={phase.key} className={phase.key}>
              <span>{phase.label}</span>
              <h3>{phase.title}</h3>
              <p>{phase.detail}</p>
              <small>{phase.note}</small>
            </article>
          ))}
        </section>

        <div className="race-prep-columns">
          <section className="race-prep-stock">
            <div className="race-prep-section-heading">
              <div><span>Bestand & Einkauf</span><h3>Was muss wirklich da sein?</h3></div>
              <small>inkl. Race-Reserve</small>
            </div>
            {plan.shopping.length ? (
              <div className="race-prep-stock-list">
                {plan.shopping.map((item) => (
                  <article className={item.ready ? "ready" : "warn"} key={item.fuelItemId}>
                    <div><strong>{item.label}</strong><span>benötigt {inventoryLabel(item.required, item.unit)} · vorhanden {inventoryLabel(item.available, item.unit)}</span></div>
                    <b>{item.ready ? "✓ vorhanden" : `Einkaufen: ${inventoryLabel(item.missing, item.unit)}`}</b>
                  </article>
                ))}
              </div>
            ) : (
              <div className="race-prep-empty"><b>Keine Fuel-Einkäufe nötig</b><span>Für diesen Rennumfang plant die Engine während des Rennens kein zusätzliches Produkt ein.</span></div>
            )}
          </section>

          <section className="race-prep-pack">
            <div className="race-prep-section-heading">
              <div><span>Packplan</span><h3>Verbrauch + Reserve</h3></div>
              <small>{plan.recommendation.confidence.label}</small>
            </div>
            {plan.pack.length ? (
              <div className="race-prep-pack-list">
                {plan.pack.map((item, index) => (
                  <article key={`${item.fuelItemId || "generic"}-${index}`}>
                    <strong>{item.label}</strong>
                    <span>{numberLabel(item.consumeQuantity, 1)} {item.unit} geplant{item.prepReserveQuantity > 0 ? ` · + ${numberLabel(item.prepReserveQuantity, 1)} ${item.unit} Reserve` : ""}</span>
                  </article>
                ))}
              </div>
            ) : <div className="race-prep-empty"><b>Kein DURING-Pack nötig</b><span>PRE und POST bleiben trotzdem Teil der Vorbereitung.</span></div>}
          </section>
        </div>

        {plan.strategy && (
          <section className="race-prep-schedule">
            <div className="race-prep-section-heading">
              <div><span>Race Ablauf</span><h3>Wann kommt was?</h3></div>
              <small>{plan.summary.schedulePoints} Versorgungspunkte</small>
            </div>
            <div className={`fuel-race-strategy-rows ${plan.strategy.kind}`}>
              {rows.map((row) => row.gap ? (
                <article className="race-prep-gap" key={row.key}><b>… {row.hidden} weitere Versorgungspunkte …</b></article>
              ) : (
                <article key={row.key}>
                  <div className="fuel-race-marker"><b>{row.marker}</b><span>{row.secondary}</span></div>
                  <div className="fuel-race-actions">
                    {row.drinkMl > 0 && <span className="drink">💧 {Math.round(row.drinkMl)} ml</span>}
                    {row.fuel.map((fuel, index) => (
                      <div className={`fuel tone-${fuel.evidenceTone}`} key={`${fuel.product}-${index}`}>
                        <strong>{fuel.product}</strong><span>{fuel.detail}</span><small>{fuel.evidence}</small>
                      </div>
                    ))}
                    {row.drinkMl <= 0 && row.fuel.length === 0 && <span className="quiet">Keine zusätzliche Aufnahme geplant</span>}
                  </div>
                </article>
              ))}
            </div>
            {plan.strategy.rows.length > 24 && (
              <button type="button" className="race-prep-schedule-toggle" onClick={() => setScheduleLimit((current) => current === "all" ? 24 : "all")}>
                {scheduleLimit === "all" ? "Kompakt anzeigen" : `Alle ${plan.strategy.rows.length} Versorgungspunkte anzeigen`}
              </button>
            )}
          </section>
        )}

        {plan.warnings.length > 0 && (
          <div className="race-prep-warnings">
            <b>Vor dem Rennen klären</b>
            {plan.warnings.map((warning) => <span key={warning}>{warning}</span>)}
          </div>
        )}
      </>}
    </div>
  );
}
