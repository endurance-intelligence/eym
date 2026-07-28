import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Card } from "./UI";
import { useApp } from "../context/AppContext";
import {
  FUEL_MODES,
  fuelRecommendationFromState,
  isFuelRelevantWorkout,
  suggestedFuelMode,
} from "../services/fuelPlanner";
import "./FuelPartner.css";

const dateFormatter = new Intl.DateTimeFormat("de-DE", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
});

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function workoutDateLabel(workout) {
  if (!workout?.date) return "Termin offen";
  return dateFormatter.format(new Date(`${workout.date}T12:00:00`));
}

function durationLabel(minutes) {
  const total = Math.max(0, Math.round(Number(minutes || 0)));
  if (total < 60) return `${total} min`;
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")} h`;
}

function amountLabel(value, unit) {
  const amount = Number(value || 0).toLocaleString("de-DE", {
    maximumFractionDigits: 1,
  });
  return `${amount} ${unit}`;
}

function consumptionDetail(item) {
  const values = [];
  if (item.carbs > 0) values.push(`${Math.round(item.carbs)} g Carbs`);
  if (item.sodium > 0) values.push(`${Math.round(item.sodium)} mg Natrium`);
  return values.join(" · ") || "Nährwerte noch offen";
}

function upcomingFuelWorkouts(plan = [], todayKey = localDateKey()) {
  return plan
    .filter((item) => (
      item.date >= todayKey
      && !item.completed
      && !item.missedReason
      && !item.archived
      && !item.plannedCancellation
      && isFuelRelevantWorkout(item)
    ))
    .sort((left, right) => (
      `${left.date}${left.time || ""}${left.title || ""}`
        .localeCompare(`${right.date}${right.time || ""}${right.title || ""}`)
    ));
}

export default function FuelPartner() {
  const { state, setState } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const workouts = useMemo(() => upcomingFuelWorkouts(state.plan), [state.plan]);
  const requestedWorkoutId = searchParams.get("workout");
  const workout = workouts.find((item) => item.id === requestedWorkoutId) || workouts[0] || null;
  const mode = workout?.fuelMode || suggestedFuelMode(workout);
  const recommendation = useMemo(
    () => workout ? fuelRecommendationFromState(state, workout, mode) : null,
    [mode, state, workout],
  );

  function selectWorkout(workoutId) {
    const next = new URLSearchParams(searchParams);
    next.set("workout", workoutId);
    setSearchParams(next, { replace: true });
  }

  function selectMode(nextMode) {
    if (!workout) return;
    setState((current) => ({
      ...current,
      plan: current.plan.map((item) => item.id === workout.id
        ? { ...item, fuelMode: nextMode }
        : item),
    }));
  }

  if (!workout || !recommendation) {
    return (
      <Card className="wide fuel-partner fuel-partner-empty">
        <div>
          <p className="eyebrow">Fuel Partner</p>
          <h2>Noch kein kommender Lauf</h2>
          <p className="muted">Sobald ein Lauf im Wochenplan steht, erscheint hier automatisch die passende Verpflegungsstrategie.</p>
        </div>
        <span>Plan → Empfehlung → Review → Lernen</span>
      </Card>
    );
  }

  const selectedMode = FUEL_MODES.find((entry) => entry.key === mode) || FUEL_MODES[0];
  const carbRange = recommendation.target.carbsHighPerHour > 0
    ? `${recommendation.target.carbsLowPerHour}–${recommendation.target.carbsHighPerHour} g/h`
    : "nicht nötig";
  const stockWarning = recommendation.pack.some((item) => item.shortage > 0);

  return (
    <Card className="wide fuel-partner">
      <div className="fuel-partner-heading">
        <div>
          <p className="eyebrow">Fuel Partner</p>
          <h2>Dein nächster Lauf ist versorgt</h2>
          <p>Verbrauch, Packliste und Bestand werden gemeinsam gerechnet. Drink-Carbs zählen mit.</p>
        </div>
        <label>
          Geplanter Lauf
          <select value={workout.id} onChange={(event) => selectWorkout(event.target.value)}>
            {workouts.map((entry) => (
              <option value={entry.id} key={entry.id}>
                {workoutDateLabel(entry)} · {entry.title}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="fuel-partner-mode" role="group" aria-label="Fuel-Modus">
        {FUEL_MODES.map((entry) => (
          <button
            type="button"
            className={mode === entry.key ? "selected" : ""}
            onClick={() => selectMode(entry.key)}
            key={entry.key}
          >
            <b>{entry.label}</b>
            <span>{entry.description}</span>
          </button>
        ))}
      </div>

      <div className="fuel-partner-hero">
        <div className="fuel-partner-workout">
          <span>{workoutDateLabel(workout)}{workout.time ? ` · ${workout.time}` : ""}</span>
          <h3>{workout.title}</h3>
          <p>
            {recommendation.distanceKm ? `${recommendation.distanceKm.toLocaleString("de-DE")} km · ` : ""}
            {durationLabel(recommendation.durationMinutes)}
            {recommendation.temperature != null ? ` · bis ${Math.round(recommendation.temperature)} °C` : ""}
          </p>
        </div>
        <div className={`fuel-partner-pack-summary ${stockWarning ? "warn" : ""}`}>
          <span>Mitnehmen</span>
          <strong>{recommendation.packSummary}</strong>
          <small>{stockWarning ? "Bestand reicht noch nicht vollständig" : recommendation.confidence.label}</small>
        </div>
      </div>

      <div className="fuel-partner-metrics">
        <span>
          <small>Carb-Orientierung</small>
          <strong>{carbRange}</strong>
        </span>
        <span>
          <small>Eingeplant</small>
          <strong>{Math.round(recommendation.actualPlan.carbsTotal)} g Carbs</strong>
        </span>
        <span>
          <small>Trinken</small>
          <strong>{recommendation.target.fluidTotal ? `${recommendation.target.fluidTotal} ml` : "optional"}</strong>
        </span>
        <span>
          <small>Natrium geplant</small>
          <strong>{recommendation.target.sodiumTotal ? `${Math.round(recommendation.target.sodiumTotal)} mg` : "nicht abgedeckt"}</strong>
        </span>
      </div>

      <div className="fuel-partner-plan-grid">
        <section>
          <div className="fuel-partner-section-heading">
            <div>
              <span>Verbrauchsplan</span>
              <h3>Was du wann nimmst</h3>
            </div>
            <small>{selectedMode.label}</small>
          </div>
          {recommendation.timeline.length ? (
            <div className="fuel-partner-timeline">
              {recommendation.timeline.map((entry, index) => (
                <article key={`${entry.minute}-${entry.title}-${index}`}>
                  <b>Min {entry.minute}</b>
                  <div>
                    <strong>{entry.title}</strong>
                    <span>{entry.detail}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="fuel-partner-no-fuel">
              <b>Während des Laufs kein Fuel nötig</b>
              <span>Für diesen Umfang reicht im normalen Modus die übliche Verpflegung vor und nach der Einheit.</span>
            </div>
          )}
          {recommendation.consume.length > 0 && (
            <div className="fuel-partner-products">
              {recommendation.consume.map((item) => (
                <div key={`${item.fuelItemId}-${item.unit}`}>
                  <span>{amountLabel(item.quantity, item.unit)}</span>
                  <strong>{item.product}</strong>
                  <small>{consumptionDetail(item)}</small>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="fuel-partner-section-heading">
            <div>
              <span>Packliste</span>
              <h3>Was wirklich mitkommt</h3>
            </div>
            <small>inkl. Reserve</small>
          </div>
          {recommendation.pack.length ? (
            <div className="fuel-partner-pack-list">
              {recommendation.pack.map((item, index) => (
                <article className={item.shortage > 0 ? "warn" : ""} key={`${item.fuelItemId || "generic"}-${index}`}>
                  <b>{amountLabel(item.quantity, item.unit)}</b>
                  <div>
                    <strong>{item.label}</strong>
                    <span>
                      {item.reserveQuantity > 0 ? `${item.consumeQuantity} verbrauchen · ${item.reserveQuantity} Reserve` : "für den Verbrauchsplan"}
                    </span>
                  </div>
                  <em>{item.shortage > 0 ? `−${amountLabel(item.shortage, item.stockUnit || "Einheiten")}` : "✓"}</em>
                </article>
              ))}
            </div>
          ) : (
            <div className="fuel-partner-no-fuel">
              <b>Keine Packliste nötig</b>
              <span>Der Lauf ist kurz genug für eine normale Versorgung.</span>
            </div>
          )}
          <div className={`fuel-partner-confidence ${recommendation.confidence.key}`}>
            <b>{recommendation.confidence.label}</b>
            <span>{recommendation.confidence.detail}</span>
          </div>
        </section>
      </div>

      {recommendation.warnings.length > 0 && (
        <div className="fuel-partner-warnings">
          <b>Noch offen</b>
          <div>{recommendation.warnings.map((warning) => <span key={warning}>{warning}</span>)}</div>
        </div>
      )}

      <div className="fuel-partner-foot">
        <p>{recommendation.rationale}</p>
        <div>
          <span>{recommendation.caffeinePolicy}</span>
          <span>Im Review vorausgefüllt · Bestand erst nach Bestätigung reduziert.</span>
          {recommendation.target.personalHydration && (
            <span>Trinkmenge aus {recommendation.target.hydrationSamples} gemessenen Schweißraten abgeleitet.</span>
          )}
        </div>
      </div>
    </Card>
  );
}
