import { isLoopWorkout } from "./loopWorkout.js";

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function roundTo(value, step = 1) {
  if (!step) return value;
  return Math.round(value / step) * step;
}

function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

function timingLabel(item = {}) {
  const value = String(item.intakeTimingValue ?? "").trim();
  if (!value) return "";
  if (item.intakeTimingMode === "round") return `Runde ${value}`;
  if (item.intakeTimingMode === "km") return `km ${value.replace(".", ",")}`;
  if (item.intakeTimingMode === "minute") return `Min ${value}`;
  return value;
}

function reviewEvidence(reviews = {}) {
  const map = new Map();
  Object.values(reviews || {}).forEach((review) => {
    (Array.isArray(review?.nutritionItems) ? review.nutritionItems : []).forEach((item) => {
      if (!item?.fuelItemId) return;
      const current = map.get(item.fuelItemId) || {
        good: 0,
        watch: 0,
        bad: 0,
        timings: [],
      };
      if (item.intakeTolerance === "good") current.good += 1;
      if (item.intakeTolerance === "watch") current.watch += 1;
      if (item.intakeTolerance === "bad") current.bad += 1;
      const timing = timingLabel(item);
      if (timing && item.intakeTolerance === "good") current.timings.push(timing);
      map.set(item.fuelItemId, current);
    });
  });
  return map;
}

function evidenceForProduct(entry, evidence) {
  if (entry?.evidenceLabel) {
    return {
      good: entry.evidenceTone === "good" ? 1 : 0,
      watch: entry.evidenceTone === "watch" ? 1 : 0,
      bad: entry.evidenceTone === "bad" ? 1 : 0,
      timings: [],
      lastGoodTiming: "",
      label: entry.evidenceLabel,
    };
  }
  const result = evidence.get(entry.fuelItemId);
  if (!result) return null;
  const lastGoodTiming = result.timings.at(-1) || "";
  return {
    ...result,
    lastGoodTiming,
    label: result.good > 0
      ? `${result.good}× gut vertragen${lastGoodTiming ? ` · zuletzt ${lastGoodTiming}` : ""}`
      : result.bad > 0
        ? `${result.bad}× problematisch`
        : result.watch > 0
          ? `${result.watch}× auffällig`
          : "Noch ohne Einzelbewertung",
  };
}

function solidUnits(consumption = []) {
  return consumption.flatMap((entry) => {
    if (entry.unit === "ml") return [];
    const count = Math.max(0, Math.round(numeric(entry.quantity)));
    return Array.from({ length: count }, () => entry);
  });
}

function fluidDistribution(total, slots) {
  if (!(total > 0) || !(slots > 0)) return Array.from({ length: slots }, () => 0);
  const roundedTotal = Math.round(total);
  const base = Math.floor(roundedTotal / slots);
  const values = Array.from({ length: slots }, () => base);
  values[values.length - 1] += roundedTotal - (base * slots);
  return values;
}

function loopStrategy(workout, recommendation, evidence) {
  const loop = workout?.loopTraining || {};
  const loopKm = numeric(loop.loopKm) || 6.7;
  const rounds = Math.max(
    1,
    Math.round(
      numeric(loop.matchPlan?.targetLoops)
      || numeric(loop.loops)
      || (numeric(workout?.distance) > 0 ? numeric(workout.distance) / loopKm : 1),
    ),
  );
  const fluids = fluidDistribution(numeric(recommendation?.target?.fluidTotal), rounds);
  const rows = Array.from({ length: rounds }, (_, index) => ({
    key: `round-${index + 1}`,
    marker: `Runde ${index + 1}`,
    secondary: `${roundTo((index + 1) * loopKm, 0.1).toLocaleString("de-DE")} km gesamt`,
    drinkMl: fluids[index],
    fuel: [],
  }));

  const units = solidUnits(recommendation.consume);
  units.forEach((entry, index) => {
    const roundNumber = clamp(Math.ceil(((index + 1) * rounds) / Math.max(1, units.length)), 1, rounds);
    const productEvidence = evidenceForProduct(entry, evidence);
    rows[roundNumber - 1].fuel.push({
      product: entry.product,
      detail: `1 ${entry.unit === "Stück" ? "Stück" : entry.unit}`,
      evidence: productEvidence?.label || "Noch nicht einzeln bewertet",
      evidenceTone: productEvidence?.bad > 0 ? "bad" : productEvidence?.watch > 0 ? "watch" : productEvidence?.good > 0 ? "good" : "base",
    });
  });

  return {
    kind: "loop",
    label: "Rundenstrategie",
    description: `${rounds} Runden à ${loopKm.toLocaleString("de-DE")} km · Versorgung wird pro Runde vorbereitet.`,
    rows,
  };
}

function timeStrategy(workout, recommendation, evidence) {
  const duration = Math.max(1, Math.round(numeric(recommendation.durationMinutes)));
  const distance = numeric(recommendation.distanceKm || workout?.distance);
  const events = new Map();
  const ensure = (minute) => {
    const key = Math.max(1, Math.min(duration, Math.round(minute)));
    if (!events.has(key)) events.set(key, { minute: key, drinkMl: 0, fuel: [] });
    return events.get(key);
  };

  const fluidTotal = numeric(recommendation?.target?.fluidTotal);
  if (fluidTotal > 0) {
    const interval = duration >= 120 ? 20 : 25;
    const drinkMinutes = [];
    for (let minute = 15; minute < duration; minute += interval) drinkMinutes.push(minute);
    if (!drinkMinutes.length) drinkMinutes.push(Math.min(15, duration));
    const amounts = fluidDistribution(fluidTotal, drinkMinutes.length);
    drinkMinutes.forEach((minute, index) => {
      ensure(minute).drinkMl += amounts[index];
    });
  }

  const units = solidUnits(recommendation.consume);
  units.forEach((entry, index) => {
    const minute = clamp(
      roundTo(((index + 1) * duration) / Math.max(1, units.length + 1), 5),
      20,
      Math.max(20, duration - 10),
    );
    const productEvidence = evidenceForProduct(entry, evidence);
    ensure(minute).fuel.push({
      product: entry.product,
      detail: `1 ${entry.unit === "Stück" ? "Stück" : entry.unit}`,
      evidence: productEvidence?.label || "Noch nicht einzeln bewertet",
      evidenceTone: productEvidence?.bad > 0 ? "bad" : productEvidence?.watch > 0 ? "watch" : productEvidence?.good > 0 ? "good" : "base",
    });
  });

  const rows = [...events.values()]
    .sort((left, right) => left.minute - right.minute)
    .map((entry) => {
      const km = distance > 0 ? roundTo((distance * entry.minute) / duration, 0.5) : 0;
      return {
        key: `minute-${entry.minute}`,
        marker: km > 0 ? `km ${km.toLocaleString("de-DE")}` : `Min ${entry.minute}`,
        secondary: km > 0 ? `ca. Min ${entry.minute}` : "Zeitplan",
        drinkMl: entry.drinkMl,
        fuel: entry.fuel,
      };
    });

  return {
    kind: distance > 0 ? "distance" : "time",
    label: distance > 0 ? "Kilometer- & Zeitstrategie" : "Zeitstrategie",
    description: distance > 0
      ? `${distance.toLocaleString("de-DE")} km · Gel und Trinken nach Strecke und ungefährer Rennzeit.`
      : `${duration} Minuten · Versorgung nach Rennzeit.`,
    rows,
  };
}

export function raceFuelStrategy({ workout, recommendation, reviews = {} } = {}) {
  if (!workout || !recommendation?.applicable || recommendation.mode !== "race") return null;
  const evidence = reviewEvidence(reviews);
  const strategy = isLoopWorkout(workout)
    ? loopStrategy(workout, recommendation, evidence)
    : timeStrategy(workout, recommendation, evidence);

  const consumedProducts = recommendation.consume.filter((entry) => entry.unit !== "ml");
  const productEvidence = consumedProducts.map((entry) => evidenceForProduct(entry, evidence)).filter(Boolean);
  const goodIntakes = productEvidence.reduce((sum, item) => sum + item.good, 0);
  const warningIntakes = productEvidence.reduce((sum, item) => sum + item.watch + item.bad, 0);
  const testedProducts = productEvidence.filter((item) => item.good > 0).length;
  const warnings = [];

  consumedProducts.forEach((entry) => {
    const itemEvidence = evidenceForProduct(entry, evidence);
    if (itemEvidence?.bad > 0) warnings.push(`${entry.product}: ${itemEvidence.bad} problematische Einzelaufnahme${itemEvidence.bad === 1 ? "" : "n"} im Review.`);
    else if (itemEvidence?.watch > 0 && itemEvidence.good === 0) warnings.push(`${entry.product}: bisher nur auffällige Einzelaufnahme dokumentiert.`);
  });

  if (consumedProducts.length > 0 && testedProducts === 0) {
    warnings.push("Die eingeplanten Fuel-Produkte wurden noch nicht mit einer positiven Einzelaufnahme bestätigt.");
  }

  return {
    ...strategy,
    evidence: {
      goodIntakes,
      warningIntakes,
      testedProducts,
      hydrationSamples: numeric(recommendation?.target?.hydrationSamples),
    },
    warnings: [...new Set(warnings)],
  };
}

export function backyardCrewPlan(strategy) {
  if (!strategy || strategy.kind !== "loop" || !Array.isArray(strategy.rows) || strategy.rows.length === 0) return null;

  const rows = strategy.rows.map((row, index) => ({
    round: index + 1,
    key: row.key || `round-${index + 1}`,
    marker: row.marker || `Runde ${index + 1}`,
    secondary: row.secondary || "",
    drinkMl: Math.max(0, Math.round(numeric(row.drinkMl))),
    fuel: Array.isArray(row.fuel) ? row.fuel : [],
  }));

  return {
    totalRounds: rows.length,
    rows,
    checklist: [
      "Flasche leer / Trinkmenge geschafft?",
      "Magen okay?",
      "Durst normal?",
      "Noch Lust auf süß?",
    ],
  };
}
