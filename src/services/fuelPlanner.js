import { activityDate, isRunningActivity } from "./activityUtils.js";
import {
  defaultConsumptionUnit,
  fuelDisplayName,
  nutritionForConsumption,
} from "./fuelNutrition.js";
import { hydration } from "./insights.js";

export const FUEL_MODES = [
  {
    key: "normal",
    label: "Normal",
    description: "Nur das, was diese Einheit wirklich benötigt.",
  },
  {
    key: "training",
    label: "Fuel-Training",
    description: "Kohlenhydrate und Magen gezielt für lange Ziele trainieren.",
  },
  {
    key: "race",
    label: "Wettkampf",
    description: "Performance-orientiert mit Reserve und klarer Zeitleiste.",
  },
];

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

function roundTo(value, step = 1) {
  if (!step) return value;
  return Math.round(value / step) * step;
}

function formatNumber(value, digits = 0) {
  return Number(value || 0).toLocaleString("de-DE", {
    maximumFractionDigits: digits,
  });
}

function sessionText(entry) {
  return `${entry?.title || ""} ${entry?.name || ""} ${entry?.type || ""} ${entry?.notes || ""}`.toLowerCase();
}

export function isFuelRelevantWorkout(workout) {
  if (!workout || workout.archived || workout.plannedCancellation) return false;
  const text = `${workout?.title || ""} ${workout?.name || ""} ${workout?.type || ""}`.toLowerCase();
  if (/fußball|football|\brad(?:fahren)?\b|cycling|\bride\b|rudern|rowing|schwimm|swim|stabi|mobility|ruhetag/.test(text)) return false;
  return (numeric(workout.distance) > 0 || workoutDurationMinutes(workout) > 0)
    && /\brun(?:ning)?\b|long ?run|lauf|track|intervall|interval|schwelle|tempo|backyard|loop|trail|treadmill|orc|wettkampf|race|marathon|ultra/.test(text);
}

function workoutDurationMinutes(workout) {
  const stored = numeric(workout?.duration);
  if (stored > 0) return stored;
  const distance = numeric(workout?.distance);
  return distance > 0 ? Math.round(distance * 6.4) : 0;
}

function validForecast(workout) {
  const forecast = workout?.weatherForecast;
  if (!forecast || (forecast.date && forecast.date !== workout?.date)) return null;
  return forecast;
}

function workoutTemperature(workout) {
  const forecast = validForecast(workout);
  const value = forecast?.maxTemp ?? workout?.weather?.temperature ?? workout?.temperature;
  return value == null || value === "" ? null : Number(value);
}

function isRaceContext(workout) {
  return Boolean(
    workout?.officialEvent
    || workout?.raceEvent
    || workout?.race
    || /wettkampf|race|marathon|halbmarathon|half marathon|heartbeat ultra/.test(sessionText(workout)),
  );
}

function isUltraRace(workout) {
  return numeric(workout?.distance) >= 50
    || /ultra|backyard|last man standing|heartbeat/.test(sessionText(workout));
}

function isFuelTrainingSession(workout) {
  return workoutDurationMinutes(workout) >= 75
    && /long|loop|backyard|ultra|fuel|zeit auf den beinen/.test(sessionText(workout));
}

export function suggestedFuelMode(workout) {
  if (FUEL_MODES.some((mode) => mode.key === workout?.fuelMode)) return workout.fuelMode;
  if (isRaceContext(workout)) return "race";
  if (isFuelTrainingSession(workout)) return "training";
  return "normal";
}

export function fuelModeLabel(mode) {
  return FUEL_MODES.find((entry) => entry.key === mode)?.label || FUEL_MODES[0].label;
}

function carbohydrateRange(mode, durationMinutes, ultraRace) {
  if (durationMinutes < 45) return { low: 0, high: 0, optional: true };

  if (mode === "race") {
    if (ultraRace) return { low: 30, high: 50, optional: false };
    if (durationMinutes < 75) return { low: 0, high: 30, optional: true };
    if (durationMinutes < 150) return { low: 45, high: 60, optional: false };
    return { low: 60, high: 75, optional: false };
  }

  if (mode === "training") {
    if (durationMinutes < 60) return { low: 20, high: 30, optional: true };
    if (durationMinutes < 90) return { low: 30, high: 40, optional: false };
    if (durationMinutes < 150) return { low: 40, high: 55, optional: false };
    return { low: 45, high: 60, optional: false };
  }

  if (durationMinutes < 75) return { low: 0, high: 0, optional: true };
  if (durationMinutes < 90) return { low: 0, high: 30, optional: true };
  if (durationMinutes < 150) return { low: 30, high: 45, optional: false };
  return { low: 40, high: 60, optional: false };
}

function runningActivityById(activities = []) {
  return new Map(
    activities
      .filter(isRunningActivity)
      .map((activity) => [String(activity.id), activity]),
  );
}

function durationHours(activity) {
  const seconds = numeric(activity?.durationSeconds);
  return seconds > 0 ? seconds / 3600 : numeric(activity?.duration) / 60;
}

function fuelExperience(activities = [], reviews = {}) {
  const activityById = runningActivityById(activities);
  const successfulRates = [];
  const measuredHydration = [];
  const productStats = new Map();
  let eventSuccesses = 0;

  Object.entries(reviews || {}).forEach(([activityId, review]) => {
    const activity = activityById.get(String(activityId));
    if (!activity) return;
    const hours = durationHours(activity);
    const stomach = numeric(review?.stomach);
    const energy = numeric(review?.energy);
    const rate = numeric(review?.carbohydratesPerHour)
      || (hours > 0 ? numeric(review?.nutritionCarbsTotal) / hours : 0);
    const stomachSymptoms = (Array.isArray(review?.stomachSymptoms) ? review.stomachSymptoms : [])
      .filter((symptom) => !String(symptom).startsWith("Keine"));
    const successful = hours >= 0.75
      && rate > 0
      && stomach >= 7
      && energy >= 5
      && stomachSymptoms.length === 0;

    if (successful) {
      successfulRates.push(rate);
      if (review?.isEvent) eventSuccesses += 1;
    }

    const hydrationResult = review?.weightBefore && review?.weightAfter
      ? hydration(activity, review)
      : null;
    if (hydrationResult?.reliable && hydrationResult.measured) {
      measuredHydration.push(hydrationResult);
    }

    (Array.isArray(review?.nutritionItems) ? review.nutritionItems : []).forEach((item) => {
      if (!item?.fuelItemId) return;
      const current = productStats.get(item.fuelItemId) || {
        uses: 0,
        successes: 0,
        eventSuccesses: 0,
        explicitGood: 0,
        explicitWatch: 0,
        explicitBad: 0,
      };
      current.uses += 1;
      if (item.intakeTolerance === "good") current.explicitGood += 1;
      if (item.intakeTolerance === "watch") current.explicitWatch += 1;
      if (item.intakeTolerance === "bad") current.explicitBad += 1;
      const explicitlyNegative = item.intakeTolerance === "watch" || item.intakeTolerance === "bad";
      const itemSuccessful = item.intakeTolerance === "good" || (!explicitlyNegative && successful);
      if (itemSuccessful) current.successes += 1;
      if (itemSuccessful && review?.isEvent) current.eventSuccesses += 1;
      productStats.set(item.fuelItemId, current);
    });
  });

  successfulRates.sort((left, right) => left - right);
  const middle = Math.floor(successfulRates.length / 2);
  const medianCarbsPerHour = successfulRates.length
    ? successfulRates.length % 2
      ? successfulRates[middle]
      : (successfulRates[middle - 1] + successfulRates[middle]) / 2
    : null;

  return {
    successfulRates,
    successfulFuelReviews: successfulRates.length,
    medianCarbsPerHour,
    maxCarbsPerHour: successfulRates.length ? successfulRates.at(-1) : null,
    measuredHydration,
    productStats,
    eventSuccesses,
  };
}

function selectedCarbohydrateRate(range, mode, experience) {
  if (range.high <= 0) return 0;
  if (range.low === 0) return 0;
  if (!experience.medianCarbsPerHour) return range.low;

  const progression = mode === "normal" ? 0 : 5;
  const learned = experience.medianCarbsPerHour + progression;
  return roundTo(clamp(learned, range.low, range.high), 5);
}

function average(values = []) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function fluidRange(durationMinutes, temperature, experience) {
  const personalLow = average(experience.measuredHydration.map((item) => item.recommendedLow).filter(Boolean));
  const personalHigh = average(experience.measuredHydration.map((item) => item.recommendedHigh).filter(Boolean));
  if (personalLow && personalHigh) {
    return {
      low: roundTo(clamp(personalLow, 250, 800), 50),
      high: roundTo(clamp(personalHigh, 350, 900), 50),
      personal: true,
      samples: experience.measuredHydration.length,
    };
  }

  if (Number(temperature) >= 28) return { low: 450, high: 650, personal: false, samples: 0 };
  if (Number(temperature) >= 23) return { low: 400, high: 600, personal: false, samples: 0 };
  if (durationMinutes >= 180) return { low: 300, high: 500, personal: false, samples: 0 };
  return { low: 300, high: 500, personal: false, samples: 0 };
}

function productHistoryScore(item, experience) {
  const history = experience.productStats.get(item.id);
  if (!history) return 0;
  return history.uses * 2
    + history.successes * 12
    + history.eventSuccesses * 18
    + history.explicitGood * 18
    - history.explicitWatch * 24
    - history.explicitBad * 60;
}

function isPreparedDrink(item) {
  if (numeric(item?.preparedVolumeMl) > 0) return true;
  const category = String(item?.category || "");
  return ["Drink Mix", "Elektrolyte"].includes(category)
    && item?.servingUnit === "ml"
    && numeric(item?.servingQuantity) > 0;
}

function productScore(item, experience, kind, targetCarbs) {
  let score = productHistoryScore(item, experience);
  if (numeric(item.quantity) > 0) score += 25;
  score += Math.min(12, numeric(item.quantity));
  if (numeric(item.caffeine) > 0) score -= 1000;

  if (kind === "drink") {
    if (isPreparedDrink(item)) score += 25;
    if (numeric(item.sodium) > 0) score += 8;
    if (targetCarbs > 0 && numeric(item.carbs) > 0) score += 10;
    if (targetCarbs <= 0 && numeric(item.carbs) === 0) score += 12;
    if (item.category === "Elektrolyte") score += 4;
  } else {
    if (item.category === "Gel") score += 14;
    if (item.category === "Riegel") score += 4;
  }
  return score;
}

function rankProducts(items, experience, kind, targetCarbs) {
  return [...items].sort((left, right) => (
    productScore(right, experience, kind, targetCarbs)
    - productScore(left, experience, kind, targetCarbs)
  ));
}

function productConsumption(fuel, quantity, unit) {
  const nutrition = nutritionForConsumption({ quantity, unit }, fuel);
  return {
    fuelItemId: fuel.id,
    product: fuelDisplayName(fuel),
    category: fuel.category || "Sonstiges",
    quantity: Number(quantity),
    unit,
    carbs: nutrition.carbs,
    sodium: nutrition.sodium,
    caffeine: nutrition.caffeine,
    inventoryUnits: nutrition.inventoryUnits,
    stockUnit: fuel.stockUnit || "Stück",
    availableInventory: numeric(fuel.quantity),
    item: fuel,
  };
}

function mergeConsumption(items, next) {
  const existing = items.find((item) => item.fuelItemId === next.fuelItemId && item.unit === next.unit);
  if (!existing) {
    items.push(next);
    return;
  }
  existing.quantity += next.quantity;
  existing.carbs += next.carbs;
  existing.sodium += next.sodium;
  existing.caffeine += next.caffeine;
  existing.inventoryUnits += next.inventoryUnits;
}

function chooseConsumption({
  fuel,
  experience,
  targetCarbs,
  fluidTotal,
}) {
  const active = (Array.isArray(fuel) ? fuel : []).filter((item) => !item.archived);
  const nonCaffeinated = active.filter((item) => numeric(item.caffeine) <= 0);
  const drinkCandidates = rankProducts(
    nonCaffeinated.filter((item) => isPreparedDrink(item) && (numeric(item.carbs) > 0 || numeric(item.sodium) > 0)),
    experience,
    "drink",
    targetCarbs,
  );
  const carbCandidates = rankProducts(
    nonCaffeinated.filter((item) => (
      !isPreparedDrink(item)
      && numeric(item.carbs) > 0
      && !["Recovery", "Drink Mix", "Elektrolyte", "Kapseln"].includes(item.category)
    )),
    experience,
    "fuel",
    targetCarbs,
  );

  const consume = [];
  const warnings = [];
  let selectedDrink = null;

  if (fluidTotal > 0 && drinkCandidates.length) {
    const drink = drinkCandidates[0];
    const unit = "ml";
    selectedDrink = productConsumption(drink, fluidTotal, unit);
    mergeConsumption(consume, selectedDrink);
  }

  const drinkCarbs = selectedDrink?.carbs || 0;
  let remainingCarbs = Math.max(0, targetCarbs - drinkCarbs);
  const usedCandidates = new Set();

  for (const product of carbCandidates) {
    if (remainingCarbs <= 1) break;
    const carbsPerUnit = numeric(product.carbs);
    if (!carbsPerUnit) continue;
    const needed = Math.ceil(remainingCarbs / carbsPerUnit);
    const available = Math.max(0, Math.floor(numeric(product.quantity)));
    const units = Math.min(needed, available);
    if (!units) continue;
    const consumption = productConsumption(product, units, defaultConsumptionUnit(product));
    mergeConsumption(consume, consumption);
    remainingCarbs = Math.max(0, remainingCarbs - consumption.carbs);
    usedCandidates.add(product.id);
    if (usedCandidates.size >= 2) break;
  }

  if (remainingCarbs > 1 && carbCandidates.length) {
    const fallback = carbCandidates.find((item) => !usedCandidates.has(item.id)) || carbCandidates[0];
    const carbsPerUnit = numeric(fallback.carbs);
    if (carbsPerUnit > 0) {
      const units = Math.ceil(remainingCarbs / carbsPerUnit);
      const consumption = productConsumption(fallback, units, defaultConsumptionUnit(fallback));
      mergeConsumption(consume, consumption);
    }
  }

  if (fluidTotal > 0 && !selectedDrink) {
    warnings.push("Für die Trinkmenge fehlt ein passend zubereitetes Getränk im Fuel Lab. Wasser oder Elektrolytgetränk separat einplanen.");
  }
  if (targetCarbs > 0 && !carbCandidates.length && drinkCarbs < targetCarbs * 0.8) {
    const caffeinatedOnly = active.some((item) => numeric(item.carbs) > 0 && numeric(item.caffeine) > 0);
    warnings.push(caffeinatedOnly
      ? "Im Fuel Lab ist aktuell nur koffeinhaltiges Fuel passend. Koffein wird bewusst nicht automatisch eingeplant."
      : "Im Fuel Lab fehlt ein koffeinfreies Produkt mit vollständiger Kohlenhydratangabe.");
  }

  const totalCarbs = consume.reduce((sum, item) => sum + item.carbs, 0);
  if (targetCarbs > 0 && totalCarbs < targetCarbs * 0.8) {
    warnings.push(`Mit dem aktuellen Bestand bleiben rund ${Math.ceil(targetCarbs - totalCarbs)} g Kohlenhydrate offen.`);
  }

  return { consume, warnings, selectedDrink };
}

function packList(consumption, durationMinutes, mode, fluidTotal, selectedDrink) {
  let reserveAssigned = false;
  const reserveNeeded = mode === "race" || durationMinutes >= 120;
  const pack = consumption.map((entry) => {
    const canReserve = entry.unit !== "ml" && reserveNeeded && !reserveAssigned;
    const reserve = canReserve ? 1 : 0;
    if (canReserve) reserveAssigned = true;
    const quantity = entry.quantity + reserve;
    const inventory = nutritionForConsumption(
      { quantity, unit: entry.unit },
      entry.item,
    ).inventoryUnits;
    return {
      fuelItemId: entry.fuelItemId,
      label: entry.product,
      quantity,
      unit: entry.unit,
      consumeQuantity: entry.quantity,
      reserveQuantity: reserve,
      requiredInventory: inventory,
      availableInventory: entry.availableInventory,
      shortage: Math.max(0, inventory - entry.availableInventory),
      stockUnit: entry.stockUnit,
      generic: false,
    };
  });

  if (fluidTotal > 0 && !selectedDrink) {
    pack.unshift({
      fuelItemId: null,
      label: "Wasser / Elektrolytgetränk",
      quantity: fluidTotal,
      unit: "ml",
      consumeQuantity: fluidTotal,
      reserveQuantity: 0,
      requiredInventory: 0,
      availableInventory: null,
      shortage: 0,
      stockUnit: "",
      generic: true,
    });
  }
  return pack;
}

function timelineFor(consumption, durationMinutes, fluidTotal) {
  const timeline = [];
  if (fluidTotal > 0) {
    const interval = durationMinutes >= 120 ? 20 : 25;
    const amount = clamp(roundTo(fluidTotal / Math.max(1, Math.ceil(durationMinutes / interval)), 50), 100, 250);
    timeline.push({
      minute: 15,
      title: "Trinken beginnen",
      detail: `Etwa ${formatNumber(amount)} ml alle ${interval} Minuten, insgesamt rund ${formatNumber(fluidTotal)} ml.`,
      kind: "drink",
    });
  }

  const solidUnits = consumption.flatMap((entry) => {
    if (entry.unit === "ml") return [];
    const wholeUnits = Math.max(1, Math.round(entry.quantity));
    return Array.from({ length: wholeUnits }, () => entry);
  });
  if (solidUnits.length) {
    const spacing = clamp(roundTo(durationMinutes / (solidUnits.length + 1), 5), 30, 45);
    solidUnits.forEach((entry, index) => {
      const minute = Math.min(durationMinutes - 10, spacing * (index + 1));
      timeline.push({
        minute,
        title: entry.product,
        detail: `1 ${entry.unit === "Stück" ? "Stück" : entry.unit}`,
        kind: "fuel",
      });
    });
  }
  return timeline.sort((left, right) => left.minute - right.minute);
}

function packSummary(pack) {
  const fluid = pack.find((item) => item.unit === "ml");
  const solid = pack.filter((item) => item.unit !== "ml");
  const solidQuantity = solid.reduce((sum, item) => sum + numeric(item.quantity), 0);
  let solidLabel = "";
  if (solidQuantity > 0) {
    const onlyGels = solid.every((item) => /gel/i.test(item.label));
    solidLabel = onlyGels
      ? `${formatNumber(solidQuantity, 1)} Gel${solidQuantity === 1 ? "" : "s"}`
      : `${formatNumber(solidQuantity, 1)} Portion${solidQuantity === 1 ? "" : "en"} Fuel`;
  }
  return [
    solidLabel,
    fluid ? `${formatNumber(fluid.quantity)} ml` : "",
  ].filter(Boolean).join(" + ") || "Nichts erforderlich";
}

function confidenceFor(consumption, experience) {
  const linked = consumption
    .map((item) => experience.productStats.get(item.fuelItemId))
    .filter(Boolean);
  const eventSuccesses = linked.reduce((sum, item) => sum + item.eventSuccesses, 0);
  const successes = linked.reduce((sum, item) => sum + item.successes, 0);

  if (eventSuccesses > 0) {
    return {
      key: "race-proven",
      label: "Wettkampferprobt",
      detail: "Mindestens ein eingeplantes Produkt wurde in einem Event gut vertragen.",
    };
  }
  if (successes >= 3) {
    return {
      key: "tested",
      label: "Mehrfach erfolgreich getestet",
      detail: "Die eingeplanten Produkte wurden in mehreren Reviews gut vertragen.",
    };
  }
  if (experience.successfulFuelReviews > 0) {
    return {
      key: "personal",
      label: "Mit persönlichen Daten",
      detail: `${experience.successfulFuelReviews} gut verträgliche Fuel-Review${experience.successfulFuelReviews === 1 ? "" : "s"} beeinflussen die Menge.`,
    };
  }
  return {
    key: "base",
    label: "Basisempfehlung",
    detail: "Die Empfehlung startet mit Dauer, Modus und Wetter und wird durch Reviews persönlicher.",
  };
}

function reviewItemsFor(consumption, workoutId) {
  return consumption.map((entry, index) => ({
    id: `planned-fuel-${workoutId || "workout"}-${index}-${entry.fuelItemId}`,
    mode: "catalog",
    type: entry.category,
    fuelItemId: entry.fuelItemId,
    product: entry.item?.name || entry.product,
    manufacturer: entry.item?.brand || "",
    quantity: String(entry.quantity),
    unit: entry.unit,
    carbohydratesPerUnit: entry.item?.carbs ?? "",
    sodiumPerUnit: entry.item?.sodium ?? "",
    caffeinePerUnit: entry.item?.caffeine ?? "",
    affectsInventory: true,
    hydrationLinked: false,
    plannedFuel: true,
    plannedWorkoutId: workoutId || null,
  }));
}

function recommendationRationale({
  durationMinutes,
  mode,
  temperature,
  targetCarbs,
  fluidTotal,
  range,
  experience,
}) {
  if (targetCarbs <= 0 && fluidTotal <= 0) {
    return `Für ${Math.round(durationMinutes)} Minuten ist während des Laufs normalerweise kein Fuel nötig. Normal essen und trinken reicht in der Regel aus.`;
  }
  const parts = [
    `${Math.round(durationMinutes)} Minuten`,
    fuelModeLabel(mode),
    targetCarbs > 0 ? `rund ${Math.round(targetCarbs)} g Kohlenhydrate gesamt` : "Fuel optional",
    fluidTotal > 0 ? `währenddessen etwa ${Math.round(fluidTotal)} ml trinken` : null,
    temperature != null ? `Tagesmaximum ${Math.round(temperature)} °C` : null,
  ].filter(Boolean);
  const learning = experience.successfulFuelReviews
    ? `Die Menge berücksichtigt ${experience.successfulFuelReviews} gut verträgliche Fuel-Review${experience.successfulFuelReviews === 1 ? "" : "s"}.`
    : "Nach dem Lauf werden tatsächliche Aufnahme, Energie und Magenverträglichkeit zur persönlichen Anpassung genutzt.";
  const optional = range.optional ? " Die Kohlenhydrate sind für diese Einheit optional." : "";
  return `${parts.join(" · ")}. ${learning}${optional}`;
}

export function fuelRecommendationForWorkout({
  workout,
  fuel = [],
  activities = [],
  reviews = {},
  mode: requestedMode,
} = {}) {
  if (!isFuelRelevantWorkout(workout)) {
    return {
      applicable: false,
      mode: "normal",
      modeLabel: fuelModeLabel("normal"),
      consume: [],
      pack: [],
      timeline: [],
      reviewItems: [],
      warnings: [],
    };
  }

  const durationMinutes = workoutDurationMinutes(workout);
  const durationInHours = durationMinutes / 60;
  const mode = FUEL_MODES.some((entry) => entry.key === requestedMode)
    ? requestedMode
    : suggestedFuelMode(workout);
  const temperature = workoutTemperature(workout);
  const experience = fuelExperience(activities, reviews);
  const range = carbohydrateRange(mode, durationMinutes, mode === "race" && isUltraRace(workout));
  const targetCarbsPerHour = selectedCarbohydrateRate(range, mode, experience);
  const targetCarbs = roundTo(targetCarbsPerHour * durationInHours, 5);
  const fluid = fluidRange(durationMinutes, temperature, experience);
  const fluidNeeded = durationMinutes >= 75 || Number(temperature) >= 23;
  const targetFluidPerHour = fluidNeeded ? roundTo((fluid.low + fluid.high) / 2, 25) : 0;
  const fluidTotal = targetFluidPerHour > 0
    ? Math.max(300, roundTo(targetFluidPerHour * durationInHours, 100))
    : 0;
  const selection = chooseConsumption({
    fuel,
    experience,
    targetCarbs,
    fluidTotal,
  });
  const pack = packList(
    selection.consume,
    durationMinutes,
    mode,
    fluidTotal,
    selection.selectedDrink,
  );
  const warnings = [...selection.warnings];
  pack.filter((item) => item.shortage > 0).forEach((item) => {
    warnings.push(
      `${item.label}: Für Packliste und Reserve fehlen ${formatNumber(item.shortage, 1)} ${item.stockUnit || "Einheiten"}.`,
    );
  });
  const totalCarbs = selection.consume.reduce((sum, item) => sum + item.carbs, 0);
  const totalSodium = selection.consume.reduce((sum, item) => sum + item.sodium, 0);
  const totalCaffeine = selection.consume.reduce((sum, item) => sum + item.caffeine, 0);
  const confidence = confidenceFor(selection.consume, experience);

  return {
    applicable: true,
    workoutId: workout.id || null,
    mode,
    modeLabel: fuelModeLabel(mode),
    durationMinutes,
    durationHours: durationInHours,
    distanceKm: numeric(workout.distance),
    temperature,
    weather: validForecast(workout),
    optional: range.optional,
    target: {
      carbsLowPerHour: range.low,
      carbsHighPerHour: range.high,
      carbsPerHour: targetCarbsPerHour,
      carbsTotal: targetCarbs,
      fluidLowPerHour: fluid.low,
      fluidHighPerHour: fluid.high,
      fluidPerHour: targetFluidPerHour,
      fluidTotal,
      sodiumTotal: totalSodium,
      sodiumPerHour: durationInHours > 0 ? totalSodium / durationInHours : 0,
      caffeineTotal: totalCaffeine,
      personalHydration: fluid.personal,
      hydrationSamples: fluid.samples,
    },
    actualPlan: {
      carbsTotal: totalCarbs,
      carbsPerHour: durationInHours > 0 ? totalCarbs / durationInHours : 0,
      sodiumTotal: totalSodium,
      caffeineTotal: totalCaffeine,
    },
    consume: selection.consume,
    pack,
    timeline: timelineFor(selection.consume, durationMinutes, fluidTotal),
    reviewItems: reviewItemsFor(selection.consume, workout.id),
    warnings: [...new Set(warnings)],
    stockOk: !pack.some((item) => item.shortage > 0),
    packSummary: packSummary(pack),
    confidence,
    rationale: recommendationRationale({
      durationMinutes,
      mode,
      temperature,
      targetCarbs,
      fluidTotal,
      range,
      experience,
    }),
    caffeinePolicy: "Koffein wird nicht automatisch eingeplant.",
  };
}

export function fuelRecommendationFromState(state, workout, mode) {
  return fuelRecommendationForWorkout({
    workout,
    fuel: state?.fuel,
    activities: state?.activities,
    reviews: state?.reviews,
    mode,
  });
}

export function plannedWorkoutForActivity(state, activity) {
  if (!activity || !isRunningActivity(activity)) return null;
  const plan = Array.isArray(state?.plan) ? state.plan : [];
  const direct = plan.find((item) => (
    item.matchedActivityId === activity.id
    || (Array.isArray(activity.memberActivityIds) && activity.memberActivityIds.includes(item.matchedActivityId))
  ));
  if (direct) return direct;

  const day = activityDate(activity);
  const actualDistance = numeric(activity.distance);
  const actualDuration = durationHours(activity) * 60;
  const candidates = plan
    .filter((item) => item.date === day && !item.archived && isFuelRelevantWorkout(item))
    .map((item) => {
      const plannedDistance = numeric(item.distance);
      const plannedDuration = workoutDurationMinutes(item);
      const distancePenalty = actualDistance && plannedDistance
        ? Math.abs(actualDistance - plannedDistance) / Math.max(actualDistance, plannedDistance)
        : 0.5;
      const durationPenalty = actualDuration && plannedDuration
        ? Math.abs(actualDuration - plannedDuration) / Math.max(actualDuration, plannedDuration)
        : 0.5;
      return { item, score: distancePenalty * 2 + durationPenalty };
    })
    .sort((left, right) => left.score - right.score);
  return candidates[0]?.item || null;
}
