import { useEffect, useMemo, useState } from "react";
import { useApp } from "../context/AppContext";
import { hydration } from "../services/insights";
import { eventTitleFor, isOfficialEvent } from "../services/achievements";
import { isRoadCyclingActivity, reviewKind, reviewKindLabel } from "../services/activityUtils";
import { activityCoordinatesFor, fetchActivityWeather } from "../services/activityWeather";
import { useModalScrollLock } from "../services/modalScrollLock";
import {
  consumptionSummary,
  consumedInventoryUnits,
  consumptionUnitsForFuel,
  defaultConsumptionUnit,
  fuelDisplayName,
  normalizeMixedDrinkConsumption,
  nutritionForConsumption,
  usesMixedDrinkTracking,
} from "../services/fuelNutrition";
import { activityCoachAssessment } from "../services/activityCoach";
import { fuelRecommendationFromState, plannedWorkoutForActivity } from "../services/fuelPlanner";
import ActivityRouteMap from "./ActivityRouteMap";

const FUEL_TIMING_OPTIONS = [
  { value: "round", label: "Runde" },
  { value: "minute", label: "Minute" },
  { value: "km", label: "Kilometer" },
  { value: "free", label: "Freitext" },
];

function fuelTimingFieldLabel(mode) {
  return {
    round: "Runde",
    minute: "Minute",
    km: "Kilometer",
    free: "Zeitpunkt",
  }[mode] || "Minute";
}

function fuelTimingPlaceholder(mode) {
  if (mode === "round") return "z. B. 4";
  if (mode === "km") return "z. B. 18,5";
  if (mode === "free") return "z. B. direkt am VP";
  return "z. B. 45";
}
import "./ReviewModal.css";

const emptyNutritionItem = (mode = "catalog") => ({
  id: crypto.randomUUID(),
  mode,
  type: "Gel",
  fuelItemId: "",
  product: "",
  manufacturer: "",
  quantity: "1",
  unit: "Stück",
  intakeTolerance: "unknown",
  intakeSymptoms: [],
  intakeReactionNote: "",
  carbohydratesPerUnit: "",
  sodiumPerUnit: "",
  caffeinePerUnit: "",
  affectsInventory: false,
});

function scoreMeaning(value, variant = "positive") {
  const numeric = Number(value || 0);
  if (variant === "effort") {
    if (numeric <= 2) return "Sehr locker";
    if (numeric <= 4) return "Locker";
    if (numeric <= 6) return "Moderat";
    if (numeric <= 8) return "Hart";
    return numeric === 10 ? "Maximal" : "Sehr hart";
  }
  if (variant === "soreness") {
    if (numeric === 0) return "Keine Beschwerden";
    if (numeric <= 2) return "Kaum spürbar";
    if (numeric <= 4) return "Leicht";
    if (numeric <= 6) return "Deutlich";
    if (numeric <= 8) return "Stark";
    return "Sehr stark";
  }
  if (numeric <= 2) return "Sehr schlecht";
  if (numeric <= 4) return "Schlecht";
  if (numeric <= 6) return "Okay";
  if (numeric <= 8) return "Gut";
  return "Sehr gut";
}

function formatReviewDuration(hours) {
  const minutes = Math.max(0, Math.round(Number(hours || 0) * 60));
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")} h`;
}

function activeSymptoms(values = []) {
  return values.filter((value) => !String(value).startsWith("Keine"));
}

function activitySummaryFacts(activity, weather) {
  const durationHours = Number(activity.durationSeconds || 0) > 0
    ? Number(activity.durationSeconds) / 3600
    : Number(activity.duration || 0) / 60;
  return [
    Number(activity.distance || 0) > 0 ? `${Number(activity.distance).toLocaleString("de-DE", { maximumFractionDigits: 2 })} km` : "",
    durationHours > 0 ? formatReviewDuration(durationHours) : "",
    Number(activity.avgHr || 0) > 0 ? `Ø ${Math.round(Number(activity.avgHr))} bpm` : "",
    Number(activity.elevation || 0) > 0 ? `${Math.round(Number(activity.elevation))} hm` : "",
    weather?.temperature != null ? `${Math.round(Number(weather.temperature))} °C` : "",
  ].filter(Boolean);
}

function ReviewScore({ label, value, onChange, low, high, description, variant = "positive", min = 1, wide = false }) {
  const minimum = Number(min);
  const selected = Math.min(10, Math.max(minimum, Number(value ?? minimum)));
  const values = Array.from({ length: 11 - minimum }, (_, index) => minimum + index);

  function moveSelection(event, current) {
    const next = ["ArrowRight", "ArrowUp"].includes(event.key)
      ? Math.min(10, current + 1)
      : ["ArrowLeft", "ArrowDown"].includes(event.key)
        ? Math.max(minimum, current - 1)
        : event.key === "Home"
          ? minimum
          : event.key === "End"
            ? 10
            : null;
    if (next == null) return;
    event.preventDefault();
    onChange(next);
    event.currentTarget.parentElement?.querySelector(`[data-score-value="${next}"]`)?.focus();
  }

  return (
    <div className={`review-score review-score-${variant} ${wide ? "wide-score" : ""}`}>
      <span className="review-score-heading"><b>{label}</b><strong>{selected}/10 · {scoreMeaning(selected, variant)}</strong></span>
      <div
        className="review-score-segments"
        role="radiogroup"
        aria-label={`${label}: ${selected} von 10`}
        style={{ "--review-score-steps": values.length }}
      >
        {values.map((score) => (
          <button
            type="button"
            role="radio"
            aria-checked={score === selected}
            aria-label={`${score} von 10${score === selected ? ", ausgewählt" : ""}`}
            className={`${score < selected ? "filled" : ""} ${score === selected ? "selected" : ""}`.trim()}
            data-score-value={score}
            tabIndex={score === selected ? 0 : -1}
            onClick={() => onChange(score)}
            onKeyDown={(event) => moveSelection(event, score)}
          >
            <span aria-hidden="true">{score}</span>
          </button>
        ))}
      </div>
      <span className="review-score-scale"><small>{low}</small><small>{high}</small></span>
      {description && <p>{description}</p>}
    </div>
  );
}

function SymptomPicker({ title, options, selected = [], onChange }) {
  function toggle(value) {
    if (value.startsWith("Keine")) {
      onChange(selected.includes(value) ? [] : [value]);
      return;
    }
    const withoutNone = selected.filter((item) => !item.startsWith("Keine"));
    onChange(withoutNone.includes(value) ? withoutNone.filter((item) => item !== value) : [...withoutNone, value]);
  }
  return (
    <div className="review-symptom-picker">
      <b>{title}</b>
      <div>{options.map((option) => <button type="button" className={selected.includes(option) ? "selected" : ""} onClick={() => toggle(option)} key={option}>{option}</button>)}</div>
    </div>
  );
}

export default function ReviewModal({ activity, onClose }) {
  const { state, upsertReview, updateActivity } = useApp();
  useModalScrollLock(true);
  const [saveError, setSaveError] = useState("");
  const kind = reviewKind(activity);
  const old = state.reviews[activity.id] || {};
  const hasStoredReview = Object.keys(old).length > 0;
  const [editingReview, setEditingReview] = useState(() => !hasStoredReview);
  const activityDay = String(activity.startDateLocal || activity.date || "").slice(0, 10);
  const plannedWorkout = !hasStoredReview ? plannedWorkoutForActivity(state, activity) : null;
  const detectedEvent = isOfficialEvent(activity, old) || Boolean(plannedWorkout?.raceEvent);
  const inventoryApplies = (fuelItem) => Boolean(fuelItem && (!fuelItem.stockTrackedFrom || !activityDay || activityDay >= fuelItem.stockTrackedFrom));
  const defaultBottleVolumeMl = Number(state.profile?.defaultBottleVolumeMl || 650);
  const oldNutrition = (Array.isArray(old.nutritionItems) ? old.nutritionItems : []).filter((item) => !item.hydrationLinked).map((item) => {
    const fuelItem = state.fuel.find((fuel) => fuel.id === item.fuelItemId);
    const normalized = normalizeMixedDrinkConsumption(item, fuelItem, defaultBottleVolumeMl);
    return {
      ...normalized,
      mode: item.mode || (item.fuelItemId ? "catalog" : "manual"),
      carbohydratesPerUnit: item.carbohydratesPerUnit ?? fuelItem?.carbs ?? "",
      sodiumPerUnit: item.sodiumPerUnit ?? fuelItem?.sodium ?? "",
      caffeinePerUnit: item.caffeinePerUnit ?? fuelItem?.caffeine ?? "",
      affectsInventory: typeof item.affectsInventory === "boolean"
        ? item.affectsInventory
        : Boolean(item.fuelItemId && inventoryApplies(fuelItem)),
    };
  });
  const plannedFuelRecommendation = plannedWorkout
    ? fuelRecommendationFromState(state, plannedWorkout, plannedWorkout.fuelMode)
    : null;
  const plannedNutrition = (plannedFuelRecommendation?.reviewItems || []).map((item) => {
    const fuelItem = state.fuel.find((fuel) => fuel.id === item.fuelItemId);
    return {
      ...normalizeMixedDrinkConsumption(item, fuelItem, defaultBottleVolumeMl),
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
    overallFeeling: old.overallFeeling ?? 7,
    legSymptoms: Array.isArray(old.legSymptoms) ? old.legSymptoms : [],
    stomachSymptoms: Array.isArray(old.stomachSymptoms) ? old.stomachSymptoms : [],
    upperBodySoreness: old.upperBodySoreness ?? 0,
    backSoreness: old.backSoreness ?? 0,
    mobility: old.mobility ?? 7,
    impactOnRunning: old.impactOnRunning || "nein",
    drinkBeforeMl: old.drinkBeforeMl || "",
    drinkMl: old.drinkMl || "",
    drinkAfterMl: old.drinkAfterMl || "",
    hydrationThirst: old.hydrationThirst || "normal",
    hydrationNote: old.hydrationNote || "",
    weightBefore: old.weightBefore || "",
    weightAfter: old.weightAfter || "",
    urineMl: old.urineMl || 0,
    sweat: old.sweat || "mittel",
    notes: old.notes || "",
    usedNutrition: old.usedNutrition ?? (oldNutrition.length > 0 || plannedNutrition.length > 0),
    nutritionItems: oldNutrition.length > 0 ? oldNutrition : plannedNutrition,
    isEvent: old.isEvent ?? detectedEvent,
    eventTitle: old.eventTitle || (plannedWorkout?.raceEvent ? plannedWorkout.title : detectedEvent ? eventTitleFor(activity, old) : ""),
    eventCategory: old.eventCategory || (plannedWorkout?.goalPriority === "C" || plannedWorkout?.goalType === "training" ? "Trainingswettkampf" : "Offizieller Lauf"),
    eventPlanningImpact: old.eventPlanningImpact || (plannedWorkout?.goalPriority === "C" ? "training" : "hard"),
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
    const totals = items.reduce((sum, item) => {
      const fuel = item.fuelItemId ? state.fuel.find((candidate) => candidate.id === item.fuelItemId) : null;
      const values = nutritionForConsumption(item, fuel);
      return {
        carbs: sum.carbs + values.carbs,
        sodium: sum.sodium + values.sodium,
        caffeine: sum.caffeine + values.caffeine,
        fluid: sum.fluid + Number(values.fluidConsumedMl || 0),
      };
    }, { carbs: 0, sodium: 0, caffeine: 0, fluid: 0 });
    const durationHours = Number(activity.durationSeconds || 0) > 0
      ? Number(activity.durationSeconds) / 3600
      : Number(activity.duration || 0) / 60;
    const carbsPerHour = durationHours > 0 ? totals.carbs / durationHours : 0;
    const sodiumPerHour = durationHours > 0 ? totals.sodium / durationHours : 0;
    let targetLow = 0;
    let targetHigh = 30;
    let label = "Bei kurzen Einheiten ist Verpflegung meist optional.";
    if (durationHours >= 1 && durationHours < 2.5) {
      targetLow = 30; targetHigh = 60; label = "Orientierung für längere Ausdauerbelastungen: 30–60 g/h.";
    } else if (durationHours >= 2.5) {
      targetLow = 60; targetHigh = 90; label = "Orientierung für lange Ausdauer- und Ultraeinheiten: 60–90 g/h, individuell trainieren.";
    }
    const status = !totals.carbs ? "none" : carbsPerHour < targetLow ? "low" : carbsPerHour > targetHigh ? "high" : "good";
    const durationLabel = formatReviewDuration(durationHours);
    const stomachSymptoms = activeSymptoms(review.stomachSymptoms);
    let feedback = label;
    if (status === "good") {
      const position = targetHigh > targetLow ? (carbsPerHour - targetLow) / (targetHigh - targetLow) : 0;
      feedback = `Kohlenhydratzufuhr gut getroffen. Mit ${Math.round(carbsPerHour)} g/h liegst du für ${durationLabel} ${position > 0.72 ? "am oberen Ende" : "im"} Orientierungsbereich von ${targetLow}–${targetHigh} g/h.`;
      if (stomachSymptoms.length > 0) feedback += ` Die Menge lag rechnerisch passend, aber ${stomachSymptoms.join(" und ")} sprechen gegen diese Kombination bei ähnlich intensiven Einheiten.`;
      else if (Number(review.stomach || 0) >= 8) feedback += " Die Menge wurde gut vertragen – für ähnlich lange Einheiten kannst du diese Strategie beibehalten.";
      else if (Number(review.stomach || 0) <= 5) feedback += " Die Menge war passend, wurde aber nicht optimal vertragen. Kleinere, gleichmäßigere Portionen oder andere Produkte testen.";
    } else if (status === "low") {
      feedback = `Mit ${Math.round(carbsPerHour)} g/h liegst du für ${durationLabel} unter dem Orientierungsbereich von ${targetLow}–${targetHigh} g/h. Bei ähnlichen langen Einheiten früher oder gleichmäßiger zuführen.`;
    } else if (status === "high") {
      feedback = `Mit ${Math.round(carbsPerHour)} g/h liegst du für ${durationLabel} über dem Orientierungsbereich von ${targetLow}–${targetHigh} g/h. Nur beibehalten, wenn Energie und Magenverträglichkeit stabil bleiben.`;
    }
    return {
      totalCarbs: totals.carbs,
      totalSodium: totals.sodium,
      totalCaffeine: totals.caffeine,
      totalFluidMl: totals.fluid,
      durationHours,
      carbsPerHour,
      sodiumPerHour,
      targetLow,
      targetHigh,
      label,
      status,
      feedback,
    };
  }, [activity.duration, activity.durationSeconds, review.nutritionItems, review.stomach, review.stomachSymptoms, review.usedNutrition, state.fuel]);

  if (!kind) return null;

  const coachAssessment = activityCoachAssessment(state, activity, review, weather);
  const summaryFacts = activitySummaryFacts(activity, weather);
  const summarySymptoms = [
    ...activeSymptoms(review.legSymptoms),
    ...activeSymptoms(review.stomachSymptoms),
  ];
  const summaryScores = kind === "endurance"
    ? [
      ["Belastung", review.rpe],
      ["Gesamtgefühl", review.overallFeeling],
      ["Beine", review.legs],
      ["Energie", review.energy],
      ["Magen", review.stomach],
    ]
    : [
      ["Belastung", review.rpe],
      ["Energie", review.energy],
      ["Oberkörper", review.upperBodySoreness],
      ["Rücken", review.backSoreness],
      ["Beweglichkeit", review.mobility],
    ];
  const coachMetrics = [
    ["Belastung", coachAssessment.load],
    ["Ausführung", coachAssessment.execution],
    ["Konsequenz", coachAssessment.recovery],
  ];
  const summaryDrinkMl = Math.round(Number(review.drinkMl || nutritionSummary.totalFluidMl || 0));
  const summaryFuelProducts = (review.usedNutrition ? review.nutritionItems : [])
    .map((item) => {
      const fuel = item.fuelItemId ? state.fuel.find((candidate) => candidate.id === item.fuelItemId) : null;
      return fuel
        ? fuelDisplayName(fuel)
        : [item.manufacturer, item.product || item.type].filter(Boolean).join(" ");
    })
    .filter(Boolean);
  const set = (key, value) => setReview((current) => ({ ...current, [key]: value }));
  const hydrationResult = kind === "endurance" ? hydration(activity, review) : null;


  function updateDrink(value) {
    setReview((current) => ({ ...current, drinkMl: String(value || "") }));
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
        if (key === "unit" && item.fuelItemId) {
          const selected = state.fuel.find((fuel) => fuel.id === item.fuelItemId);
          const prepared = Number(selected?.preparedVolumeMl || 0);
          if (prepared > 0 && item.unit === "ml" && value === "Portionen") return { ...item, unit: value, quantity: String(Number(item.quantity || 0) / prepared) };
          if (prepared > 0 && item.unit === "Portionen" && value === "ml") return { ...item, unit: value, quantity: String(Number(item.quantity || 0) * prepared) };
        }
        return { ...item, [key]: value };
      }),
    }));
  }

  function updateMixedPortions(id, value) {
    setReview((current) => ({
      ...current,
      nutritionItems: current.nutritionItems.map((item) => {
        if (item.id !== id) return item;
        const previousPortions = Math.max(0.01, Number(item.quantity || 1));
        const nextPortions = Math.max(0, Number(value || 0));
        const bottleVolume = Number(item.mixedVolumeMl || 0) / previousPortions || defaultBottleVolumeMl;
        const wasFullyConsumed = item.consumedVolumeMl === ""
          || Number(item.consumedVolumeMl || 0) === Number(item.mixedVolumeMl || 0);
        const mixedVolumeMl = Math.round(bottleVolume * nextPortions);
        return {
          ...item,
          quantity: String(value),
          mixedVolumeMl: String(mixedVolumeMl),
          consumedVolumeMl: wasFullyConsumed ? String(mixedVolumeMl) : item.consumedVolumeMl,
        };
      }),
    }));
  }

  function updateBottleVolume(id, value) {
    setReview((current) => ({
      ...current,
      nutritionItems: current.nutritionItems.map((item) => {
        if (item.id !== id) return item;
        const portions = Math.max(0, Number(item.quantity || 0));
        const mixedVolumeMl = Math.round(portions * Number(value || 0));
        const wasFullyConsumed = item.consumedVolumeMl === ""
          || Number(item.consumedVolumeMl || 0) === Number(item.mixedVolumeMl || 0);
        return {
          ...item,
          mixedVolumeMl: String(mixedVolumeMl),
          consumedVolumeMl: wasFullyConsumed ? String(mixedVolumeMl) : item.consumedVolumeMl,
        };
      }),
    }));
  }

  function selectFuelItem(id, fuelItemId) {
    const selected = state.fuel.find((item) => item.id === fuelItemId);
    const mixedDrink = usesMixedDrinkTracking(selected);
    setReview((current) => ({
      ...current,
      nutritionItems: current.nutritionItems.map((item) => item.id !== id ? item : selected ? {
        ...item,
        mode: "catalog",
        type: selected.category || item.type,
        fuelItemId: selected.id,
        manufacturer: selected.brand || "",
        product: selected.name || "",
        unit: mixedDrink ? "Portionen" : defaultConsumptionUnit(selected),
        quantity: "1",
        mixedVolumeMl: mixedDrink ? String(defaultBottleVolumeMl) : undefined,
        consumedVolumeMl: mixedDrink ? String(defaultBottleVolumeMl) : undefined,
        carbohydratesPerUnit: selected.carbs ?? item.carbohydratesPerUnit ?? "",
        sodiumPerUnit: selected.sodium ?? item.sodiumPerUnit ?? "",
        caffeinePerUnit: selected.caffeine ?? item.caffeinePerUnit ?? "",
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
    const usageFor = (items) => items.reduce((usage, item) => {
      const fuel = state.fuel.find((candidate) => candidate.id === item.fuelItemId);
      const consumed = consumedInventoryUnits(item, fuel);
      if (!consumed) return usage;
      usage[item.fuelItemId] = (usage[item.fuelItemId] || 0) + consumed;
      return usage;
    }, {});
    const previousUsage = usageFor(previousNutrition);
    const nextUsage = usageFor(nextNutrition);
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
      drinkMl: kind === "endurance" && !review.drinkMl && nutritionSummary.totalFluidMl > 0
        ? String(Math.round(nutritionSummary.totalFluidMl))
        : review.drinkMl,
      usedNutrition: kind === "endurance" && review.usedNutrition,
      isEvent: kind === "endurance" && review.isEvent,
      eventPlanningImpact: kind === "endurance" && review.isEvent ? review.eventPlanningImpact : null,
      plannedEventId: plannedWorkout?.targetEventId || old.plannedEventId || null,
      eventPriority: plannedWorkout?.goalPriority || old.eventPriority || null,
      nutritionCarbsTotal: kind === "endurance" ? Number(nutritionSummary.totalCarbs.toFixed(1)) : 0,
      carbohydratesPerHour: kind === "endurance" ? Number(nutritionSummary.carbsPerHour.toFixed(1)) : 0,
      nutritionSodiumTotal: kind === "endurance" ? Math.round(nutritionSummary.totalSodium) : 0,
      sodiumPerHour: kind === "endurance" ? Math.round(nutritionSummary.sodiumPerHour) : 0,
      nutritionCaffeineTotal: kind === "endurance" ? Math.round(nutritionSummary.totalCaffeine) : 0,
      nutritionFluidTotal: kind === "endurance" ? Math.round(nutritionSummary.totalFluidMl) : 0,
      carbohydrateTargetLow: kind === "endurance" ? nutritionSummary.targetLow : 0,
      carbohydrateTargetHigh: kind === "endurance" ? nutritionSummary.targetHigh : 0,
      carbohydrateStatus: kind === "endurance" ? nutritionSummary.status : null,
      plannedFuelWorkoutId: plannedWorkout?.id || old.plannedFuelWorkoutId || null,
      plannedFuelMode: plannedFuelRecommendation?.mode || old.plannedFuelMode || null,
      plannedFuelCarbsTarget: plannedFuelRecommendation?.target.carbsTotal ?? old.plannedFuelCarbsTarget ?? null,
      plannedFuelFluidTarget: plannedFuelRecommendation?.target.fluidTotal ?? old.plannedFuelFluidTarget ?? null,
      weather: weather || old.weather || null,
      coachAssessment,
      updatedAt: new Date().toISOString(),
    }, { memberIds: activity.memberActivityIds || [] });
    setEditingReview(false);
  }

  const enduranceTitle = isRoadCyclingActivity(activity) ? "Rennrad Review" : "Workout Review";

  if (hasStoredReview && !editingReview) {
    return (
      <div className="modal-backdrop" role="presentation">
        <section className="modal review-modal review-summary-modal" aria-label={`Review von ${activity.name}`}>
          <button type="button" className="close" onClick={onClose}>×</button>
          <div className="review-summary-heading">
            <div>
              <p className="eyebrow">Review abgeschlossen</p>
              <h2>{activity.name}</h2>
            </div>
            <span>✓ Gespeichert</span>
          </div>

          <section className="review-summary-section">
            <div className="review-summary-section-heading">
              <div><small>Kurze Zusammenfassung</small><strong>So war die Einheit</strong></div>
            </div>
            <div className="review-summary-facts">
              {summaryFacts.map((fact) => <span key={fact}>{fact}</span>)}
            </div>
            <div className="review-summary-scores">
              {summaryScores.map(([label, value]) => (
                <article key={label}>
                  <small>{label}</small>
                  <strong>{value}/10</strong>
                </article>
              ))}
            </div>
            {summarySymptoms.length > 0 && (
              <div className="review-summary-alert">
                <b>Auffälligkeiten</b>
                <span>{summarySymptoms.join(" · ")}</span>
              </div>
            )}
            {kind === "endurance" && review.isEvent && (
              <div className="review-summary-event-impact">
                <small>Wirkung auf die Folgeplanung</small>
                <strong>{{
                  training: "Wie eine normale Trainingseinheit verarbeitet",
                  hard: "Spürbar härter als Training",
                  depleted: "Deutlich geleert · Erholung nötig",
                }[review.eventPlanningImpact] || "Noch nicht bewertet"}</strong>
              </div>
            )}
            {kind === "endurance" && (review.usedNutrition || summaryDrinkMl > 0) && (
              <div className="review-summary-fuel">
                <div>
                  <small>Verpflegung & Trinken</small>
                  <strong>{summaryFuelProducts.join(" · ") || "Getränk erfasst"}</strong>
                </div>
                <span>
                  {nutritionSummary.totalCarbs > 0 ? `${Math.round(nutritionSummary.totalCarbs)} g KH` : "keine KH erfasst"}
                  {summaryDrinkMl > 0 ? ` · ${summaryDrinkMl} ml getrunken` : ""}
                </span>
              </div>
            )}
            {review.notes && <p className="review-summary-notes"><b>Notiz:</b> {review.notes}</p>}
          </section>

          <ActivityRouteMap activity={activity} />

          <section className="review-summary-coach">
            <div className="review-summary-section-heading">
              <div><small>Coach-Einschätzung</small><strong>Das sagt dein Coach</strong></div>
              <span className={`tone-${coachAssessment.confidence.tone}`}>Datengrundlage {coachAssessment.confidence.value}</span>
            </div>
            <p>{coachAssessment.summary}</p>
            <div className="review-summary-coach-metrics">
              {coachMetrics.map(([label, entry]) => (
                <article className={`tone-${entry.tone}`} key={label}>
                  <small>{label}</small>
                  <strong>{entry.value}</strong>
                </article>
              ))}
            </div>
            <div className="review-summary-conclusion"><b>Dein Review:</b> {coachAssessment.comparison}</div>
          </section>

          <div className="review-summary-actions">
            <button type="button" onClick={onClose}>Schließen</button>
            <button type="button" className="primary" onClick={() => setEditingReview(true)}>Review bearbeiten</button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form className={`modal review-modal review-${kind}`} onSubmit={save}>
        <button type="button" className="close" onClick={onClose}>×</button>
        <p className="eyebrow">{kind === "strength" ? reviewKindLabel(activity) : enduranceTitle}</p>
        <h2>{activity.name}</h2>
        {activity.isActivityGroup && <div className="review-group-summary"><strong>{activity.memberCount} Teilaktivitäten zusammengefasst</strong><span>{Number(activity.distance || 0).toFixed(1)} km · {activity.elevation || 0} hm · {Math.round(Number(activity.duration || 0))} min</span></div>}
        <ActivityRouteMap activity={activity} />

        {kind === "endurance" ? (
          <>
            <div className="review-timing-note"><strong>Bewertung direkt nach der Einheit</strong><span>Bewerte, wie du dich unmittelbar nach Abschluss der Einheit fühlst. Beschwerden oder Auffälligkeiten während der Einheit kannst du zusätzlich markieren.</span></div>
            <div className="scores review-score-grid">
              <ReviewScore label="Beine" value={review.legs} onChange={(value) => set("legs", value)} low="Sehr schlecht · schwer / schmerzhaft" high="Sehr gut · frisch / beschwerdefrei" description="10 bedeutet: Die Beine fühlen sich frisch, locker und ohne Auffälligkeiten an." />
              <ReviewScore label="Energie" value={review.energy} onChange={(value) => set("energy", value)} low="Völlig leer" high="Sehr energiegeladen" description="10 bedeutet: Du fühlst dich körperlich und mental sehr energiegeladen." />
              <ReviewScore label="Magenverträglichkeit" value={review.stomach} onChange={(value) => set("stomach", value)} low="Starke Beschwerden" high="Keine Beschwerden" description="10 bedeutet: Getränke und Verpflegung wurden ohne Magen-Darm-Beschwerden vertragen." />
              <ReviewScore label="Wahrgenommene Belastung" value={review.rpe} onChange={(value) => set("rpe", value)} low="Sehr locker" high="Maximal anstrengend" description="Hier beschreibt eine hohe Zahl nicht die Qualität, sondern wie anstrengend die Einheit war." variant="effort" />
              <ReviewScore label="Gesamtgefühl" value={review.overallFeeling} onChange={(value) => set("overallFeeling", value)} low="Sehr schlecht" high="Sehr gut" description="Wie zufrieden bist du insgesamt mit der Einheit und deinem Zustand danach?" wide />
            </div>
            <div className="review-symptom-grid">
              <SymptomPicker title="Auffälligkeiten Beine" selected={review.legSymptoms} onChange={(value) => set("legSymptoms", value)} options={["Keine Auffälligkeiten", "Schwere Beine", "Muskelkater", "Schmerzen", "Krämpfe"]} />
              <SymptomPicker title="Auffälligkeiten Magen" selected={review.stomachSymptoms} onChange={(value) => set("stomachSymptoms", value)} options={["Keine Beschwerden", "Aufstoßen", "Blähungen", "Übelkeit", "Völlegefühl", "Seitenstechen", "Toilettendrang"]} />
            </div>
            <div className="form-grid">
              <label>PRE · vorher getrunken (ml)<input type="number" min="0" value={review.drinkBeforeMl} onChange={(event) => set("drinkBeforeMl", event.target.value)} /></label>
              <label>DURING · währenddessen (ml)<input type="number" min="0" value={review.drinkMl} onChange={(event) => updateDrink(event.target.value)} /></label>
              <label>POST · danach getrunken (ml)<input type="number" min="0" value={review.drinkAfterMl} onChange={(event) => set("drinkAfterMl", event.target.value)} /></label>
              <label>Durst währenddessen<select value={review.hydrationThirst} onChange={(event) => set("hydrationThirst", event.target.value)}><option value="gering">Gering</option><option value="normal">Normal</option><option value="stark">Stark</option></select></label>
              <label>Schwitzen<select value={review.sweat} onChange={(event) => set("sweat", event.target.value)}><option>niedrig</option><option>mittel</option><option>hoch</option></select></label>
              <label>Gewicht vorher (kg)<input type="number" step="0.1" value={review.weightBefore} onChange={(event) => set("weightBefore", event.target.value)} /></label>
              <label>Gewicht nachher (kg)<input type="number" step="0.1" value={review.weightAfter} onChange={(event) => set("weightAfter", event.target.value)} /></label>
              <label>Urin währenddessen (ml, optional)<input type="number" min="0" value={review.urineMl} onChange={(event) => set("urineMl", event.target.value)} /></label>
            </div>
            <label>Hydration-Notiz<input value={review.hydrationNote} onChange={(event) => set("hydrationNote", event.target.value)} placeholder="z. B. Flasche nicht leer · starker Durst ab Runde 4 · danach Recovery Drink" /></label>

            <section className={`review-feature-box activity-weather-box ${weather ? "active" : ""}`}>
              <div className="activity-weather-heading">
                <div><b>Wetter bei der Einheit</b><small>Werte am Startort und möglichst nah an der Startzeit.{activity.weatherSource ? ` · Quelle: ${activity.weatherSource}` : ""}</small></div>
                {weather?.source && <em>{weather.source}</em>}
              </div>
              {weather ? (
                <>
                  {(weather.location || activity.location) && <div className="activity-weather-location"><small>Standort</small><strong>{weather.location || activity.location}</strong></div>}
                  <div className="activity-weather-grid compact">
                  {weather.temperature != null && <span><small>Temperatur</small><strong>{Number(weather.temperature).toFixed(0)} °C</strong></span>}
                  {weather.feelsLike != null && <span><small>Gefühlt</small><strong>{Number(weather.feelsLike).toFixed(0)} °C</strong></span>}
                  {weather.condition && <span><small>Wetter</small><strong>{weather.condition}</strong></span>}
                  {weather.windSpeed != null && <span><small>Wind</small><strong>{Number(weather.windSpeed).toFixed(0)} km/h</strong></span>}
                  {weather.windGusts != null && <span><small>Böen</small><strong>{Number(weather.windGusts).toFixed(0)} km/h</strong></span>}
                  {weather.precipitation != null && <span><small>Niederschlag</small><strong>{Number(weather.precipitation).toFixed(1)} mm</strong></span>}
                  </div>
                  {!weather.location && weather.feelsLike == null && !weather.condition && weather.windSpeed == null && weather.windGusts == null && weather.precipitation == null && <p className="muted">Weitere Wetterdaten wurden für diese Aktivität nicht bereitgestellt.</p>}
                </>
              ) : <p className="muted">{weatherStatus || "Keine Wetterdaten verfügbar."}</p>}
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

            <section className="review-feature-box coach-activity-assessment">
              <div className="coach-activity-heading"><div><b>Coach-Einschätzung</b><small>Was die Einheit bedeutet und was jetzt sinnvoll ist</small></div><span className={`tone-${coachAssessment.confidence.tone}`}>Datengrundlage {coachAssessment.confidence.value}</span></div>
              <p className="coach-activity-summary">{coachAssessment.summary}</p>
              <div className="coach-activity-metrics">
                {coachMetrics.map(([label, entry]) => <article className={`tone-${entry.tone}`} key={label}><small>{label}</small><strong>{entry.value}</strong><span>{entry.text}</span></article>)}
              </div>
              <p className="coach-activity-comparison"><b>Dein Review:</b> {coachAssessment.comparison}</p>
              <details><summary>Berücksichtigte Daten</summary><div className="coach-activity-factors">{coachAssessment.factors.map((factor) => <span key={factor}>{factor}</span>)}</div><p>{coachAssessment.confidence.text} Der interne Belastungswert dient nur dem persönlichen Vergleich und ist weder eine medizinische Bewertung noch eine Kopie der Garmin-Kennzahl. Bei Müdigkeit, Schmerzen oder ungewöhnlich schlechtem Gefühl hat deine Rückmeldung immer Vorrang.</p></details>
            </section>

            <section className={`review-feature-box ${review.usedNutrition ? "active" : ""}`}>
              {plannedFuelRecommendation && (
                <div className="review-fuel-prefill">
                  <div>
                    <b>Fuel Partner übernommen</b>
                    <span>{plannedWorkout.title} · {plannedFuelRecommendation.packSummary}</span>
                  </div>
                  <small>Geplante Produkte und Trinkmenge sind vorausgefüllt. Bitte auf den tatsächlichen Verbrauch korrigieren; erst beim Speichern wird Bestand reduziert.</small>
                </div>
              )}
              <label className="review-toggle-row">
                <span><b>Verpflegung</b><small>Produkte aus dem Fuel Lab übernehmen oder einmalig manuell erfassen.</small></span>
                <input type="checkbox" checked={review.usedNutrition} onChange={(event) => toggleNutrition(event.target.checked)} />
              </label>
              {review.usedNutrition && (
                <div className="nutrition-review-list">
                  <div className="nutrition-add-toolbar">
                    <button type="button" onClick={() => setReview((current) => ({ ...current, nutritionItems: [...current.nutritionItems, emptyNutritionItem("catalog")] }))}>+ Aus Fuel Lab</button>
                    <button type="button" className="secondary" onClick={() => setReview((current) => ({ ...current, nutritionItems: [...current.nutritionItems, emptyNutritionItem("manual")] }))}>+ Manuell</button>
                  </div>
                  {review.nutritionItems.some((item) => item.fuelItemId && item.affectsInventory === false) && <div className="nutrition-inventory-note"><b>Bestand bleibt unverändert</b><span>Mindestens ein historischer oder bereits verbrauchter Artikel ist ohne Bestandsabzug markiert. Dieser Hinweis gilt für alle entsprechend markierten Einträge.</span></div>}
                  {review.nutritionItems.map((item, index) => {
                    const selectedFuel = item.fuelItemId ? state.fuel.find((fuel) => fuel.id === item.fuelItemId) : null;
                    const mixedDrink = usesMixedDrinkTracking(selectedFuel);
                    const totals = nutritionForConsumption(item, selectedFuel);
                    return <div className={`nutrition-review-item ${item.mode === "manual" ? "manual" : "catalog"}`} key={item.id}>
                      <div className="nutrition-review-heading"><div><b>Verpflegung {index + 1}</b><small>{item.mode === "manual" ? "Manuelle Eingabe" : "Fuel Lab"}</small></div><button type="button" className="text-danger" onClick={() => removeNutritionItem(item.id)}>Entfernen</button></div>
                      {item.mode !== "manual" ? <>
                        {!selectedFuel && <label className="nutrition-catalog-select">Produkt aus Fuel Lab
                          <select value={item.fuelItemId || ""} onChange={(event) => selectFuelItem(item.id, event.target.value)}>
                            <option value="">Produkt auswählen …</option>
                      <div className="nutrition-timing-fields">
                        <label>Wann genommen?
                          <select value={item.intakeTimingMode || "minute"} onChange={(event) => updateNutritionItem(item.id, "intakeTimingMode", event.target.value)}>
                            {FUEL_TIMING_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
                          </select>
                        </label>
                        <label>{fuelTimingFieldLabel(item.intakeTimingMode || "minute")}
                          <input
                            type={(item.intakeTimingMode || "minute") === "free" ? "text" : "number"}
                            min={(item.intakeTimingMode || "minute") === "round" ? "1" : "0"}
                            step={(item.intakeTimingMode || "minute") === "km" ? "0.1" : "1"}
                            value={item.intakeTimingValue || ""}
                            onChange={(event) => updateNutritionItem(item.id, "intakeTimingValue", event.target.value)}
                            placeholder={fuelTimingPlaceholder(item.intakeTimingMode || "minute")}
                          />
                        </label>
                        <label className="nutrition-timing-note">Kurze Notiz
                          <input value={item.intakeNote || ""} onChange={(event) => updateNutritionItem(item.id, "intakeNote", event.target.value)} placeholder="z. B. mit Wasser · im Zelt · halbe Portion" />
                        </label>
                      </div>
                      {(selectedFuel || item.mode === "manual") && (
                        <div className="nutrition-intake-tolerance">
                          <label>Magenverträglichkeit dieser Aufnahme
                            <select value={item.intakeTolerance || "unknown"} onChange={(event) => updateNutritionItem(item.id, "intakeTolerance", event.target.value)}>
                              {[{ value: "unknown", label: "Nicht bewertet" }, { value: "good", label: "Gut vertragen" }, { value: "watch", label: "Auffällig" }, { value: "bad", label: "Problematisch" }].map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
                            </select>
                          </label>
                          {(item.intakeTolerance || "unknown") !== "unknown" && (
                            <>
                              <SymptomPicker
                                title="Reaktion auf diese Aufnahme"
                                options={["Aufstoßen", "Blähungen", "Übelkeit", "Völlegefühl", "Seitenstechen", "Toilettendrang"]}
                                selected={Array.isArray(item.intakeSymptoms) ? item.intakeSymptoms : []}
                                onChange={(value) => updateNutritionItem(item.id, "intakeSymptoms", value)}
                              />
                              <label>Beobachtung
                                <input value={item.intakeReactionNote || ""} onChange={(event) => updateNutritionItem(item.id, "intakeReactionNote", event.target.value)} placeholder="z. B. 20 min später schwerer Magen · danach wieder okay" />
                              </label>
                            </>
                          )}
                        </div>
                      )}
                            {state.fuel.filter((fuel) => !fuel.archived).map((fuel) => <option key={fuel.id} value={fuel.id}>{fuelDisplayName(fuel)} · {fuel.quantity} {fuel.stockUnit || "Stück"}</option>)}
                          </select>
                        </label>}
                        {selectedFuel && <div className="nutrition-catalog-card">
                          <div className="nutrition-catalog-copy">
                            <span>{selectedFuel.category}</span>
                            <b>{fuelDisplayName(selectedFuel)}</b>
                            {mixedDrink
                              ? <small>{Number(selectedFuel.carbs || 0).toFixed(1).replace(".0", "")} g Kohlenhydrate pro Portion{selectedFuel.sodium ? ` · ${Math.round(Number(selectedFuel.sodium))} mg Natrium` : ""}. Mischvorschlag des Produkts: {selectedFuel.preparedVolumeMl} ml.</small>
                              : selectedFuel.servingQuantity && <small>{selectedFuel.servingQuantity} {selectedFuel.servingUnit || "g"} pro Portion.</small>}
                            <button type="button" className="nutrition-change-product" onClick={() => selectFuelItem(item.id, "")}>Produkt wechseln</button>
                          </div>
                          {mixedDrink ? (
                            <div className="nutrition-mix-fields">
                              <label>Portionen<input type="number" min="0" step="0.25" value={item.quantity} onChange={(event) => updateMixedPortions(item.id, event.target.value)} /></label>
                              <label>Flasche je Portion (ml)<input type="number" min="0" step="10" value={Number(item.quantity || 0) > 0 ? Math.round(Number(item.mixedVolumeMl || 0) / Number(item.quantity)) : ""} onChange={(event) => updateBottleVolume(item.id, event.target.value)} /></label>
                              <label>Insgesamt getrunken (ml)<input type="number" min="0" max={item.mixedVolumeMl || undefined} step="10" value={item.consumedVolumeMl || ""} onChange={(event) => updateNutritionItem(item.id, "consumedVolumeMl", event.target.value)} /></label>
                              <div className="nutrition-bottle-presets"><span>Flaschengröße je Portion</span>{[500, 650].map((volume) => <button type="button" className={Number(item.quantity || 0) > 0 && Math.round(Number(item.mixedVolumeMl || 0) / Number(item.quantity)) === volume ? "selected" : ""} onClick={() => updateBottleVolume(item.id, volume)} key={volume}>{volume} ml</button>)}</div>
                            </div>
                          ) : (
                            <div className="nutrition-consumption-fields">
                              <label>Menge<input type="number" min="0" step={item.unit === "ml" ? "10" : "0.1"} value={item.quantity} onChange={(event) => updateNutritionItem(item.id, "quantity", event.target.value)} /></label>
                              <label>Einheit<select value={item.unit} onChange={(event) => updateNutritionItem(item.id, "unit", event.target.value)}>{consumptionUnitsForFuel(selectedFuel).map((unit) => <option key={unit}>{unit}</option>)}</select></label>
                            </div>
                          )}
                          <div className="nutrition-live-values">{consumptionSummary(item, selectedFuel).map((part) => <span key={part}>{part}</span>)}{!consumptionSummary(item, selectedFuel).length && <span>Nährwerte im Fuel Lab noch nicht vollständig.</span>}</div>
                          <label className="inventory-impact-toggle"><input type="checkbox" checked={item.affectsInventory !== false} onChange={(event) => updateNutritionItem(item.id, "affectsInventory", event.target.checked)} /><span>Aktuellen Bestand reduzieren{item.affectsInventory !== false && totals.inventoryUnits > 0 ? ` · ${totals.inventoryUnits.toFixed(1).replace(".0", "")} ${selectedFuel.stockUnit || "Einheiten"}` : ""}</span></label>
                        </div>}
                      </> : <div className="nutrition-manual-grid">
                        <label>Art<select value={item.type} onChange={(event) => updateNutritionItem(item.id, "type", event.target.value)}><option>Gel</option><option>Elektrolyte</option><option>Drink Mix</option><option>Riegel</option><option>Salz</option><option>Sonstiges</option></select></label>
                        <label>Hersteller<input value={item.manufacturer} onChange={(event) => updateNutritionItem(item.id, "manufacturer", event.target.value)} placeholder="z. B. Maurten" /></label>
                        <label>Produkt<input value={item.product} onChange={(event) => updateNutritionItem(item.id, "product", event.target.value)} placeholder="z. B. Gel 100" /></label>
                        <label>Menge<input type="number" min="0" step="0.1" value={item.quantity} onChange={(event) => updateNutritionItem(item.id, "quantity", event.target.value)} /></label>
                        <label>Einheit<select value={item.unit} onChange={(event) => updateNutritionItem(item.id, "unit", event.target.value)}><option>Stück</option><option>Portionen</option><option>ml</option><option>g</option><option>Tabletten</option><option>Beutel</option></select></label>
                        <label>{item.unit === "ml" || item.unit === "g" ? `Carbs pro 100 ${item.unit} (g)` : "Carbs pro Einheit (g)"}<input type="number" min="0" step="0.1" value={item.carbohydratesPerUnit ?? ""} onChange={(event) => updateNutritionItem(item.id, "carbohydratesPerUnit", event.target.value)} /></label>
                        <label>{item.unit === "ml" || item.unit === "g" ? `Natrium pro 100 ${item.unit} (mg)` : "Natrium pro Einheit (mg)"}<input type="number" min="0" step="1" value={item.sodiumPerUnit ?? ""} onChange={(event) => updateNutritionItem(item.id, "sodiumPerUnit", event.target.value)} /></label>
                        <label>{item.unit === "ml" || item.unit === "g" ? `Koffein pro 100 ${item.unit} (mg)` : "Koffein pro Einheit (mg)"}<input type="number" min="0" step="1" value={item.caffeinePerUnit ?? ""} onChange={(event) => updateNutritionItem(item.id, "caffeinePerUnit", event.target.value)} /></label>
                      </div>}
                    </div>;
                  })}
                  {review.nutritionItems.length === 0 && <div className="nutrition-empty-state"><b>Noch keine Verpflegung eingetragen</b><span>Wähle „Aus Fuel Lab“ oder „Manuell“.</span></div>}
                  <div className={`fuel-review-analysis ${nutritionSummary.status}`}>
                    <div className="fuel-review-metrics">
                      <span><small>Kohlenhydrate gesamt</small><strong>{nutritionSummary.totalCarbs.toFixed(0)} g</strong></span>
                      <span><small>Kohlenhydrate pro Stunde</small><strong>{nutritionSummary.durationHours > 0 ? `${nutritionSummary.carbsPerHour.toFixed(0)} g/h` : "–"}</strong></span>
                      <span><small>Produktgetränk</small><strong>{nutritionSummary.totalFluidMl > 0 ? `${Math.round(nutritionSummary.totalFluidMl)} ml` : "nicht erfasst"}</strong></span>
                      <span><small>Natrium gesamt</small><strong>{nutritionSummary.totalSodium > 0 ? `${Math.round(nutritionSummary.totalSodium)} mg` : "nicht erfasst"}</strong></span>
                      <span><small>Natrium pro Stunde</small><strong>{nutritionSummary.totalSodium > 0 && nutritionSummary.durationHours > 0 ? `${Math.round(nutritionSummary.sodiumPerHour)} mg/h` : "–"}</strong></span>
                      <span><small>Koffein gesamt</small><strong>{nutritionSummary.totalCaffeine > 0 ? `${Math.round(nutritionSummary.totalCaffeine)} mg` : "nicht erfasst"}</strong></span>
                      <span><small>Carb-Orientierung</small><strong>{nutritionSummary.targetLow}–{nutritionSummary.targetHigh} g/h</strong></span>
                    </div>
                    <div className="fuel-review-feedback"><b>{nutritionSummary.status === "good" ? "Gut getroffen" : nutritionSummary.status === "low" ? "Eher wenig" : nutritionSummary.status === "high" ? "Über Orientierung" : "Noch keine Bewertung"}</b><p>{nutritionSummary.feedback}</p>{nutritionSummary.totalSodium > 0 && <small>Natrium wird erfasst, aber nicht pauschal als gut oder schlecht bewertet. Ein persönlicher Zielbereich hängt unter anderem von Schweißrate, Hitze und Salzverlust ab.</small>}</div>
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
                  <label className="wide-field">Wirkung auf die nächste Trainingswoche
                    <select value={review.eventPlanningImpact} onChange={(event) => set("eventPlanningImpact", event.target.value)}>
                      <option value="training">Hat sich wie eine normale Trainingseinheit angefühlt</option>
                      <option value="hard">War spürbar härter als Training</option>
                      <option value="depleted">Hat mich deutlich geleert · Erholung nötig</option>
                    </select>
                    <small>Bei „normale Trainingseinheit“ erzwingt der Eventstatus keine zusätzliche Pause. Beine, Energie und Beschwerden werden weiterhin berücksichtigt.</small>
                  </label>
                </div>
              )}
            </section>
          </>
        ) : (
          <>
            <div className="review-timing-note"><strong>Bewertung direkt nach der Einheit</strong><span>Bewerte, wie du dich unmittelbar nach Abschluss der Einheit fühlst. Beschwerden während der Einheit kannst du in den Notizen ergänzen.</span></div>
            <div className="strength-review-intro">
              <strong>Einfluss auf das Lauftraining</strong>
              <span>Rudern, Stabi und Mobility belasten anders als ein Lauf. Deshalb erfassen wir Muskelkater, Rücken und Beweglichkeit separat.</span>
            </div>
            <div className="scores strength-scores review-score-grid">
              <ReviewScore label="Muskelkater Oberkörper" value={review.upperBodySoreness} onChange={(value) => set("upperBodySoreness", value)} low="Keine Beschwerden" high="Sehr stark" variant="soreness" min={0} description="0 bedeutet: kein Muskelkater oder ungewöhnliches Spannungsgefühl." />
              <ReviewScore label="Rücken / Nacken" value={review.backSoreness} onChange={(value) => set("backSoreness", value)} low="Frei" high="Stark belastet" variant="soreness" min={0} description="0 bedeutet: Rücken und Nacken fühlen sich frei an." />
              <ReviewScore label="Beweglichkeit" value={review.mobility} onChange={(value) => set("mobility", value)} low="Sehr eingeschränkt" high="Sehr beweglich" description="10 bedeutet: Du fühlst dich frei beweglich und ohne Einschränkungen." />
              <ReviewScore label="Energie" value={review.energy} onChange={(value) => set("energy", value)} low="Völlig leer" high="Sehr energiegeladen" />
              <ReviewScore label="Wahrgenommene Belastung" value={review.rpe} onChange={(value) => set("rpe", value)} low="Sehr locker" high="Maximal anstrengend" variant="effort" description="Eine hohe Zahl bedeutet: Die Einheit war sehr anstrengend." />
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
        {kind === "endurance" && hydrationResult && (review.drinkMl || review.drinkBeforeMl || review.drinkAfterMl || (review.weightBefore && review.weightAfter)) && (
          <div className="hydration-box">
            <b>Hydration V2 · PRE / DURING / POST</b>
            <span>Vorher {hydrationResult.before} ml · währenddessen {hydrationResult.during} ml ({hydrationResult.duringRate} ml/h) · danach {hydrationResult.after} ml</span>
            <span>{hydrationResult.measured ? "Gemessene" : "Geschätzte"} Schweißrate: ca. {hydrationResult.rate} ml/h · Defizit am Ende: {hydrationResult.deficit} ml</span>
            {hydrationResult.reliable && <span>Orientierung währenddessen: {hydrationResult.recommendedLow}–{hydrationResult.recommendedHigh} ml/h · keine Trinkpflicht.</span>}
            {!hydrationResult.reliable && hydrationResult.reason && <span>{hydrationResult.reason}</span>}
            {hydrationResult.recoveryGap > 0 && <span>Nach POST verbleibt rechnerisch ca. {hydrationResult.recoveryGap} ml Restdefizit · ebenfalls keine Trinkpflicht.</span>}
            <span>{hydrationResult.guidance}</span>
          </div>
        )}
        {saveError && <div className="review-save-error">{saveError}</div>}
        <button className="primary">Review speichern</button>
      </form>
    </div>
  );
}
