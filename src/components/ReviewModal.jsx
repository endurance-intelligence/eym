import { useEffect, useMemo, useState } from "react";
import { useApp } from "../context/AppContext";
import { Score } from "./UI";
import { hydration } from "../services/insights";
import { eventTitleFor, isOfficialEvent } from "../services/achievements";
import { isRoadCyclingActivity, reviewKind, reviewKindLabel } from "../services/activityUtils";
import { activityCoordinatesFor, fetchActivityWeather } from "../services/activityWeather";
import { useModalScrollLock } from "../services/modalScrollLock";

const emptyNutritionItem = () => ({
  id: crypto.randomUUID(),
  type: "Gel",
  fuelItemId: "",
  product: "",
  manufacturer: "",
  quantity: "1",
  unit: "Stück",
  carbohydratesPerUnit: "",
  affectsInventory: false,
});

function ZeroScore({ label, value, onChange, help }) {
  return (
    <label className="score">
      <span>{label}<b>{value}/10</b></span>
      <input type="range" min="0" max="10" value={value} onChange={(event) => onChange(Number(event.target.value))} />
      {help && <small>{help}</small>}
    </label>
  );
}

export default function ReviewModal({ activity, onClose }) {
  const { state, upsertReview, updateActivity } = useApp();
  useModalScrollLock(true);
  const [saveError, setSaveError] = useState("");
  const kind = reviewKind(activity);
  const old = state.reviews[activity.id] || {};
  const detectedEvent = isOfficialEvent(activity, old);
  const activityDay = String(activity.startDateLocal || activity.date || "").slice(0, 10);
  const inventoryApplies = (fuelItem) => Boolean(fuelItem && (!fuelItem.stockTrackedFrom || !activityDay || activityDay >= fuelItem.stockTrackedFrom));
  const oldNutrition = (Array.isArray(old.nutritionItems) ? old.nutritionItems : []).map((item) => {
    if (typeof item.affectsInventory === "boolean") return item;
    const fuelItem = state.fuel.find((fuel) => fuel.id === item.fuelItemId);
    return {
      ...item,
      carbohydratesPerUnit: item.carbohydratesPerUnit ?? fuelItem?.carbs ?? "",
      affectsInventory: Boolean(item.fuelItemId && inventoryApplies(fuelItem)),
    };
  });
  const [weather, setWeather] = useState(() => activity.weather || (activity.temperature != null ? {
    temperature: Number(activity.temperature),
    location: activity.location || "",
    source: activity.source === "intervals" ? "Intervals.icu" : activity.source || "Aktivitätsdatei",
  } : null));
  const [weatherStatus, setWeatherStatus] = useState(() => activityCoordinatesFor(activity) && !(activity.weather?.condition && activity.weather?.windSpeed != null && activity.weather?.location)
    ? "Wetter zum Aktivitätszeitpunkt wird geladen …"
    : "");

  const [review, setReview] = useState({
    reviewType: old.reviewType || kind,
    legs: old.legs ?? 7,
    energy: old.energy ?? 7,
    stomach: old.stomach ?? 8,
    rpe: old.rpe ?? 5,
    upperBodySoreness: old.upperBodySoreness ?? 0,
    backSoreness: old.backSoreness ?? 0,
    mobility: old.mobility ?? 7,
    impactOnRunning: old.impactOnRunning || "nein",
    drinkMl: old.drinkMl || "",
    weightBefore: old.weightBefore || "",
    weightAfter: old.weightAfter || "",
    urineMl: old.urineMl || 0,
    sweat: old.sweat || "mittel",
    notes: old.notes || "",
    usedNutrition: old.usedNutrition ?? oldNutrition.length > 0,
    nutritionItems: oldNutrition,
    isEvent: old.isEvent ?? detectedEvent,
    eventTitle: old.eventTitle || (detectedEvent ? eventTitleFor(activity, old) : ""),
    eventCategory: old.eventCategory || "Offizieller Lauf",
  });

  useEffect(() => {
    if (weather?.condition && weather?.windSpeed != null && weather?.location) return undefined;
    if (!activityCoordinatesFor(activity)) return undefined;
    let cancelled = false;
    fetchActivityWeather(activity)
      .then((result) => {
        if (cancelled) return;
        setWeather(result);
        setWeatherStatus("");
        updateActivity(activity.id, { weather: result, temperature: result.temperature });
      })
      .catch((error) => {
        if (!cancelled) setWeatherStatus(error instanceof Error ? error.message : String(error));
      });
    return () => { cancelled = true; };
  // Fetch only once for the selected activity.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity.id]);

  const nutritionSummary = useMemo(() => {
    const items = review.usedNutrition ? review.nutritionItems : [];
    const totalCarbs = items.reduce((sum, item) => {
      const quantity = Number(item.quantity || 0);
      const carbohydrates = Number(item.carbohydratesPerUnit || 0);
      return sum + (item.unit === "ml" ? (quantity / 100) * carbohydrates : quantity * carbohydrates);
    }, 0);
    const durationHours = Number(activity.durationSeconds || 0) > 0
      ? Number(activity.durationSeconds) / 3600
      : Number(activity.duration || 0) / 60;
    const carbsPerHour = durationHours > 0 ? totalCarbs / durationHours : 0;
    let targetLow = 0;
    let targetHigh = 30;
    let label = "Bei kurzen Einheiten ist Verpflegung meist optional.";
    if (durationHours >= 1 && durationHours < 2.5) {
      targetLow = 30; targetHigh = 60; label = "Orientierung für längere Ausdauerbelastungen: 30–60 g/h.";
    } else if (durationHours >= 2.5) {
      targetLow = 60; targetHigh = 90; label = "Orientierung für lange Ausdauer- und Ultraeinheiten: 60–90 g/h, individuell trainieren.";
    }
    const status = !totalCarbs ? "none" : carbsPerHour < targetLow ? "low" : carbsPerHour > targetHigh ? "high" : "good";
    return { totalCarbs, durationHours, carbsPerHour, targetLow, targetHigh, label, status };
  }, [activity.duration, activity.durationSeconds, review.nutritionItems, review.usedNutrition]);

  if (!kind) return null;

  const set = (key, value) => setReview((current) => ({ ...current, [key]: value }));
  const hydrationResult = kind === "endurance" ? hydration(activity, review) : null;


  function updateDrink(value) {
    setReview((current) => {
      const amount = String(value || "");
      const withoutAutomatic = current.nutritionItems.filter((item) => !item.hydrationLinked);
      if (!Number(amount)) return { ...current, drinkMl: amount, nutritionItems: withoutAutomatic };
      const automatic = current.nutritionItems.find((item) => item.hydrationLinked && !item.fuelItemId) || {
        ...emptyNutritionItem(),
        type: "Elektrolyte",
        product: "Getränk / Elektrolyte",
        unit: "ml",
        carbohydratesPerUnit: "",
        affectsInventory: false,
        hydrationLinked: true,
      };
      const nutritionItems = current.nutritionItems.some((item) => item.id === automatic.id)
        ? current.nutritionItems.map((item) => item.id === automatic.id ? { ...item, quantity: amount, type: "Elektrolyte", unit: "ml" } : item)
        : [...withoutAutomatic, { ...automatic, quantity: amount }];
      return { ...current, drinkMl: amount, usedNutrition: true, nutritionItems };
    });
  }

  function toggleEvent(checked) {
    setReview((current) => ({
      ...current,
      isEvent: checked,
      eventTitle: checked && !current.eventTitle.trim() ? (activity.name || activity.sourceName || "Event") : current.eventTitle,
    }));
  }

  function toggleNutrition(checked) {
    setReview((current) => ({
      ...current,
      usedNutrition: checked,
      nutritionItems: checked && current.nutritionItems.length === 0 ? [emptyNutritionItem()] : current.nutritionItems,
    }));
  }

  function compatibleFuel(item, type) {
    if (type === "Sonstiges") return true;
    if (type === "Salz") return item.category === "Kapseln" || item.category === "Elektrolyte";
    return item.category === type;
  }

  function updateNutritionItem(id, key, value) {
    setReview((current) => ({
      ...current,
      nutritionItems: current.nutritionItems.map((item) => {
        if (item.id !== id) return item;
        if (key === "type") {
          const selected = state.fuel.find((fuel) => fuel.id === item.fuelItemId);
          const keepFuel = selected && compatibleFuel(selected, value);
          return { ...item, type: value, fuelItemId: keepFuel ? item.fuelItemId : "", affectsInventory: keepFuel ? item.affectsInventory : false };
        }
        return { ...item, [key]: value };
      }),
    }));
  }

  function selectFuelItem(id, fuelItemId) {
    const selected = state.fuel.find((item) => item.id === fuelItemId);
    setReview((current) => ({
      ...current,
      nutritionItems: current.nutritionItems.map((item) => item.id !== id ? item : selected ? {
        ...item,
        fuelItemId: selected.id,
        manufacturer: selected.brand || "",
        product: selected.name || "",
        unit: selected.stockUnit || "Stück",
        quantity: item.quantity || "1",
        carbohydratesPerUnit: selected.carbs ?? item.carbohydratesPerUnit ?? "",
        affectsInventory: inventoryApplies(selected),
        hydrationLinked: false,
      } : {
        ...item,
        fuelItemId: "",
        affectsInventory: false,
      }),
    }));
  }

  function removeNutritionItem(id) {
    setReview((current) => ({
      ...current,
      nutritionItems: current.nutritionItems.filter((item) => item.id !== id),
    }));
  }

  function save(event) {
    event.preventDefault();
    setSaveError("");
    const nextNutrition = kind === "endurance" && review.usedNutrition ? review.nutritionItems : [];
    const previousNutrition = Array.isArray(old.nutritionItems) ? old.nutritionItems : [];
    const previousUsage = previousNutrition.reduce((usage, item) => {
      if (!item.fuelItemId || item.affectsInventory === false) return usage;
      usage[item.fuelItemId] = (usage[item.fuelItemId] || 0) + (Number(item.quantity) || 0);
      return usage;
    }, {});
    const nextUsage = nextNutrition.reduce((usage, item) => {
      if (!item.fuelItemId || item.affectsInventory === false) return usage;
      usage[item.fuelItemId] = (usage[item.fuelItemId] || 0) + (Number(item.quantity) || 0);
      return usage;
    }, {});
    const unavailable = Object.entries(nextUsage).find(([fuelItemId, amount]) => {
      const fuel = state.fuel.find((item) => item.id === fuelItemId);
      const available = Number(fuel?.quantity || 0) + Number(previousUsage[fuelItemId] || 0);
      return amount > available + 0.0001;
    });
    if (unavailable) {
      const fuel = state.fuel.find((item) => item.id === unavailable[0]);
      setSaveError(`Nicht genug Bestand von ${fuel?.brand ? `${fuel.brand} ` : ""}${fuel?.name || "diesem Produkt"}.`);
      return;
    }

    upsertReview(activity.id, {
      ...review,
      reviewType: kind,
      nutritionItems: nextNutrition,
      usedNutrition: kind === "endurance" && review.usedNutrition,
      isEvent: kind === "endurance" && review.isEvent,
      nutritionCarbsTotal: kind === "endurance" ? Number(nutritionSummary.totalCarbs.toFixed(1)) : 0,
      carbohydratesPerHour: kind === "endurance" ? Number(nutritionSummary.carbsPerHour.toFixed(1)) : 0,
      carbohydrateTargetLow: kind === "endurance" ? nutritionSummary.targetLow : 0,
      carbohydrateTargetHigh: kind === "endurance" ? nutritionSummary.targetHigh : 0,
      carbohydrateStatus: kind === "endurance" ? nutritionSummary.status : null,
      weather: weather || old.weather || null,
      updatedAt: new Date().toISOString(),
    }, { memberIds: activity.memberActivityIds || [] });
    onClose();
  }

  const enduranceTitle = isRoadCyclingActivity(activity) ? "Rennrad Review" : "Workout Review";

  return (
    <div className="modal-backdrop" role="presentation">
      <form className={`modal review-modal review-${kind}`} onSubmit={save}>
        <button type="button" className="close" onClick={onClose}>×</button>
        <p className="eyebrow">{kind === "strength" ? reviewKindLabel(activity) : enduranceTitle}</p>
        <h2>{activity.name}</h2>
        {activity.isActivityGroup && <div className="review-group-summary"><strong>{activity.memberCount} Teilaktivitäten zusammengefasst</strong><span>{Number(activity.distance || 0).toFixed(1)} km · {activity.elevation || 0} hm · {Math.round(Number(activity.duration || 0))} min</span></div>}

        {kind === "endurance" ? (
          <>
            <div className="scores">
              <Score label="Beine" value={review.legs} onChange={(value) => set("legs", Number(value))} />
              <Score label="Energie" value={review.energy} onChange={(value) => set("energy", Number(value))} />
              <Score label="Magen" value={review.stomach} onChange={(value) => set("stomach", Number(value))} />
              <Score label="Anstrengung" value={review.rpe} onChange={(value) => set("rpe", Number(value))} />
            </div>
            <div className="form-grid">
              <label>Getrunken (ml)<input type="number" min="0" value={review.drinkMl} onChange={(event) => updateDrink(event.target.value)} /></label>
              <label>Schwitzen<select value={review.sweat} onChange={(event) => set("sweat", event.target.value)}><option>niedrig</option><option>mittel</option><option>hoch</option></select></label>
              <label>Gewicht vorher (kg)<input type="number" step="0.1" value={review.weightBefore} onChange={(event) => set("weightBefore", event.target.value)} /></label>
              <label>Gewicht nachher (kg)<input type="number" step="0.1" value={review.weightAfter} onChange={(event) => set("weightAfter", event.target.value)} /></label>
            </div>

            <section className={`review-feature-box activity-weather-box ${weather ? "active" : ""}`}>
              <div className="activity-weather-heading">
                <div><b>Wetter bei der Einheit</b><small>Werte am Startort und möglichst nah an der Startzeit.</small></div>
                {weather?.source && <em>{weather.source}</em>}
              </div>
              {weather ? (
                <>
                  <div className="activity-weather-location"><small>Standort</small><strong>{weather.location || activity.location || "Startort nicht benannt"}</strong></div>
                  <div className="activity-weather-grid">
                  <span><small>Temperatur</small><strong>{Number(weather.temperature).toFixed(0)} °C</strong></span>
                  <span><small>Gefühlt</small><strong>{weather.feelsLike != null ? `${Number(weather.feelsLike).toFixed(0)} °C` : "–"}</strong></span>
                  <span><small>Wetter</small><strong>{weather.condition || "–"}</strong></span>
                  <span><small>Wind</small><strong>{weather.windSpeed != null ? `${Number(weather.windSpeed).toFixed(0)} km/h` : "–"}</strong></span>
                  <span><small>Böen</small><strong>{weather.windGusts != null ? `${Number(weather.windGusts).toFixed(0)} km/h` : "–"}</strong></span>
                  <span><small>Niederschlag</small><strong>{weather.precipitation != null ? `${Number(weather.precipitation).toFixed(1)} mm` : "–"}</strong></span>
                  </div>
                </>
              ) : <p className="muted">{weatherStatus || "Keine Wetter- oder Standortdaten in der Aktivität vorhanden."}</p>}
              {weather && weatherStatus && <p className="muted">{weatherStatus}</p>}
            </section>

            {activity.heartRateZones?.zones?.length > 0 && (
              <section className="review-feature-box heart-rate-review-box active">
                <div><b>Herzfrequenz-Zonen</b><small>Aus den Aktivitätsdaten der primären Quelle berechnet.</small></div>
                <div className="heart-zone-list">
                  {activity.heartRateZones.zones.map((zone) => (
                    <div className="heart-zone-row" key={zone.zone}>
                      <span>Z{zone.zone}{zone.min ? ` · ${zone.min}–${zone.max < 0 ? "∞" : zone.max} bpm` : ""}</span>
                      <div><i style={{ width: `${Math.max(2, zone.percentage)}%` }} /></div>
                      <strong>{Math.round(zone.seconds / 60)} min · {zone.percentage}%</strong>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className={`review-feature-box ${review.usedNutrition ? "active" : ""}`}>
              <label className="review-toggle-row">
                <span><b>Verpflegung</b><small>Gel, Elektrolyte, Drink Mix, Riegel oder Salz erfassen.</small></span>
                <input type="checkbox" checked={review.usedNutrition} onChange={(event) => toggleNutrition(event.target.checked)} />
              </label>
              {review.usedNutrition && (
                <div className="nutrition-review-list">
                  {review.nutritionItems.map((item, index) => (
                    <div className="nutrition-review-item" key={item.id}>
                      <div className="nutrition-review-heading"><b>Verpflegung {index + 1}</b>{review.nutritionItems.length > 1 && <button type="button" className="text-danger" onClick={() => removeNutritionItem(item.id)}>Entfernen</button>}</div>
                      <div className="nutrition-grid inventory-nutrition-grid">
                        <label>Art<select value={item.type} onChange={(event) => updateNutritionItem(item.id, "type", event.target.value)}><option>Gel</option><option>Elektrolyte</option><option>Drink Mix</option><option>Riegel</option><option>Salz</option><option>Sonstiges</option></select></label>
                        <label className="nutrition-inventory-select">Produkt aus Fuel Lab
                          <select value={item.fuelItemId || ""} onChange={(event) => selectFuelItem(item.id, event.target.value)}>
                            <option value="">Freie Eingabe / kein Bestandsabzug</option>
                            {state.fuel.filter((fuel) => !fuel.archived && compatibleFuel(fuel, item.type)).map((fuel) => <option key={fuel.id} value={fuel.id}>{fuel.brand ? `${fuel.brand} ` : ""}{fuel.name} · {fuel.quantity} {fuel.stockUnit || "Stück"}</option>)}
                          </select>
                          {item.fuelItemId && (
                            <div className="inventory-impact-toggle">
                              <input type="checkbox" checked={item.affectsInventory !== false} onChange={(event) => updateNutritionItem(item.id, "affectsInventory", event.target.checked)} />
                              <span>Aktuellen Bestand reduzieren</span>
                            </div>
                          )}
                          {item.fuelItemId && item.affectsInventory === false && <small>Historischer oder bereits verbrauchter Artikel – bleibt ohne Abzug vom heutigen Bestand.</small>}
                          {item.fuelItemId && item.affectsInventory !== false && <small>Wird beim Speichern automatisch vom aktuellen Bestand abgezogen.</small>}
                        </label>
                        <label>Hersteller<input value={item.manufacturer} onChange={(event) => updateNutritionItem(item.id, "manufacturer", event.target.value)} placeholder="z. B. Maurten" /></label>
                        <label>Produkt<input value={item.product} onChange={(event) => updateNutritionItem(item.id, "product", event.target.value)} placeholder="z. B. Gel 100" /></label>
                        <label>{item.unit === "ml" ? "Carbs pro 100 ml (g)" : "Carbs pro Einheit (g)"}<input type="number" min="0" step="0.1" value={item.carbohydratesPerUnit ?? ""} onChange={(event) => updateNutritionItem(item.id, "carbohydratesPerUnit", event.target.value)} /></label>
                        <label>Menge<input type="number" min="0" step="0.1" value={item.quantity} onChange={(event) => updateNutritionItem(item.id, "quantity", event.target.value)} /></label>
                        <label>Einheit<select value={item.unit} onChange={(event) => updateNutritionItem(item.id, "unit", event.target.value)} disabled={Boolean(item.fuelItemId)}><option>Stück</option><option>Portionen</option><option>ml</option><option>g</option><option>Tabletten</option><option>Beutel</option></select></label>
                      </div>
                    </div>
                  ))}
                  <button type="button" className="secondary add-review-item" onClick={() => setReview((current) => ({ ...current, nutritionItems: [...current.nutritionItems, emptyNutritionItem()] }))}>+ Weitere Verpflegung</button>
                  <div className={`carb-rate-box ${nutritionSummary.status}`}>
                    <div><span>Kohlenhydrate gesamt</span><strong>{nutritionSummary.totalCarbs.toFixed(0)} g</strong></div>
                    <div><span>Pro Stunde</span><strong>{nutritionSummary.durationHours > 0 ? `${nutritionSummary.carbsPerHour.toFixed(0)} g/h` : "–"}</strong></div>
                    <div><span>Orientierung</span><strong>{nutritionSummary.targetLow}–{nutritionSummary.targetHigh} g/h</strong></div>
                    <p>{nutritionSummary.status === "low" ? "Unter dem Orientierungsbereich – bei langen Läufen frühere oder größere Zufuhr testen." : nutritionSummary.status === "high" ? "Über dem Orientierungsbereich – nur beibehalten, wenn Magen und Verträglichkeit stabil sind." : nutritionSummary.status === "good" ? "Liegt im Orientierungsbereich. Verträglichkeit und Energie weiter beobachten." : nutritionSummary.label}</p>
                  </div>
                </div>
              )}
            </section>

            <section className={`review-feature-box event-review-box ${review.isEvent ? "active" : ""}`}>
              <label className="review-toggle-row">
                <span><b>Event / offizieller Lauf</b><small>Die Einheit erscheint danach unter Mission → Achievements.</small></span>
                <input type="checkbox" checked={review.isEvent} onChange={(event) => toggleEvent(event.target.checked)} />
              </label>
              {review.isEvent && (
                <div className="event-review-fields">
                  <label>Eventname<input value={review.eventTitle} onChange={(event) => set("eventTitle", event.target.value)} placeholder={activity.name || activity.sourceName} /></label>
                  <label>Art<select value={review.eventCategory} onChange={(event) => set("eventCategory", event.target.value)}><option>Offizieller Lauf</option><option>Wettkampf</option><option>Spontanes Event</option><option>Trainingswettkampf</option></select></label>
                </div>
              )}
            </section>
          </>
        ) : (
          <>
            <div className="strength-review-intro">
              <strong>Einfluss auf das Lauftraining</strong>
              <span>Rudern, Stabi und Mobility belasten anders als ein Lauf. Deshalb erfassen wir Muskelkater, Rücken und Beweglichkeit separat.</span>
            </div>
            <div className="scores strength-scores">
              <ZeroScore label="Muskelkater Oberkörper" value={review.upperBodySoreness} onChange={(value) => set("upperBodySoreness", value)} help="0 = keiner, 10 = sehr stark" />
              <ZeroScore label="Rücken / Nacken" value={review.backSoreness} onChange={(value) => set("backSoreness", value)} help="0 = frei, 10 = stark belastet" />
              <Score label="Beweglichkeit" value={review.mobility} onChange={(value) => set("mobility", Number(value))} />
              <Score label="Energie" value={review.energy} onChange={(value) => set("energy", Number(value))} />
              <Score label="Anstrengung" value={review.rpe} onChange={(value) => set("rpe", Number(value))} />
            </div>
            <label className="strength-impact">Beeinträchtigt das dein Laufen?
              <select value={review.impactOnRunning} onChange={(event) => set("impactOnRunning", event.target.value)}>
                <option value="nein">Nein</option>
                <option value="leicht">Leicht</option>
                <option value="deutlich">Deutlich</option>
              </select>
            </label>
          </>
        )}

        <label>Notizen<textarea value={review.notes} onChange={(event) => set("notes", event.target.value)} /></label>
        {kind === "endurance" && review.drinkMl && hydrationResult && <div className="hydration-box"><b>Trinkauswertung</b><span>Verlust ca. {hydrationResult.loss} ml · Rate {hydrationResult.rate} ml/h · Defizit {hydrationResult.deficit} ml</span><span>Nächster Ansatz: {hydrationResult.recommendedLow}–{hydrationResult.recommendedHigh} ml/h</span></div>}
        {saveError && <div className="review-save-error">{saveError}</div>}
        <button className="primary">Review speichern</button>
      </form>
    </div>
  );
}
