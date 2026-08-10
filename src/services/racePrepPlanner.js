import { fuelRecommendationForWorkout } from "./fuelPlanner.js";
import { raceFuelStrategy } from "./raceFuelStrategy.js";

const MINUTES_PER_HOUR = 60;

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function roundTo(value, step = 1) {
  if (!step) return value;
  return Math.round(value / step) * step;
}

function parseDuration(value) {
  const text = String(value || "").trim();
  if (!text) return 0;
  if (/^\d+(?:[.,]\d+)?$/.test(text)) return numeric(text.replace(",", ".")) * MINUTES_PER_HOUR;
  const match = text.match(/^(\d{1,4}):([0-5]\d)(?::([0-5]\d))?$/);
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]) + Number(match[3] || 0) / 60;
}

function estimateDurationMinutes(distanceKm) {
  const distance = numeric(distanceKm);
  if (!distance) return 0;
  if (distance <= 10) return Math.round(distance * 6.2);
  if (distance <= 42.2) return Math.round(distance * 6.6);
  if (distance <= 100) return Math.round(distance * 8);
  if (distance <= 200) return Math.round(distance * 9);
  return Math.round(distance * 10);
}

function formatDuration(minutes) {
  const total = Math.max(0, Math.round(numeric(minutes)));
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (!hours) return `${mins} min`;
  return `${hours}:${String(mins).padStart(2, "0")} h`;
}

export const RACE_PREP_FORMATS = [
  { key: "distance", label: "Distanzrennen", description: "5 km bis Ultra · Versorgung nach Zeit und Strecke" },
  { key: "time", label: "Zeitrennen", description: "6 h, 12 h, 24 h oder frei definierte Dauer" },
  { key: "loop", label: "Runden / Backyard", description: "Rundenlänge, Starttakt und Planungshorizont" },
];

export const RACE_PREP_PRESETS = [
  { key: "5k", label: "5 km", format: "distance", name: "5-km-Rennen", distanceKm: 5 },
  { key: "10k", label: "10 km", format: "distance", name: "10-km-Rennen", distanceKm: 10 },
  { key: "half", label: "21,1 km", format: "distance", name: "Halbmarathon", distanceKm: 21.1 },
  { key: "marathon", label: "42,2 km", format: "distance", name: "Marathon", distanceKm: 42.2 },
  { key: "50k", label: "50 km", format: "distance", name: "50-km-Ultra", distanceKm: 50 },
  { key: "100k", label: "100 km", format: "distance", name: "100-km-Ultra", distanceKm: 100 },
  { key: "6h", label: "6 h", format: "time", name: "6-Stunden-Lauf", durationMinutes: 360 },
  { key: "12h", label: "12 h", format: "time", name: "12-Stunden-Lauf", durationMinutes: 720 },
  { key: "24h", label: "24 h", format: "time", name: "24-Stunden-Lauf", durationMinutes: 1440 },
  { key: "backyard", label: "Backyard", format: "loop", name: "Backyard Ultra", loopKm: 6.7, loopIntervalMinutes: 60, rounds: 15 },
  { key: "1000k", label: "1000 km", format: "distance", name: "1000-km-Rennen", distanceKm: 1000 },
];

export function emptyRacePrepProfile() {
  return {
    id: "",
    name: "Freies Rennen",
    format: "distance",
    distanceKm: 0,
    durationMinutes: 0,
    loopKm: 6.7,
    loopIntervalMinutes: 60,
    rounds: 10,
    source: "custom",
    originEventId: "",
  };
}

export function racePrepProfileFromPreset(key) {
  const preset = RACE_PREP_PRESETS.find((item) => item.key === key);
  return normalizeRacePrepProfile({ ...emptyRacePrepProfile(), ...(preset || {}) });
}

export function racePrepProfileFromEvent(event = {}) {
  const text = `${event.name || ""} ${event.courseType || ""} ${event.loopMode || ""}`.toLowerCase();
  const loopKm = numeric(event.loopKm);
  const targetDistance = numeric(event.targetKm || event.targetMaxKm || event.targetMinKm);
  const eventDuration = parseDuration(event.eventTimeLimit) || parseDuration(event.targetTime);
  const isLoop = loopKm > 0 && (/backyard|loop|runde|heartbeat/.test(text) || event.loopMode && event.loopMode !== "free");
  const rounds = isLoop && targetDistance > 0 ? Math.max(1, Math.round(targetDistance / loopKm)) : 0;
  const loopIntervalMinutes = numeric(event.loopIntervalMinutes) || (isLoop && /backyard/.test(text) ? 60 : 0);
  const format = isLoop ? "loop" : targetDistance > 0 ? "distance" : "time";

  return normalizeRacePrepProfile({
    ...emptyRacePrepProfile(),
    id: "",
    name: event.name || "Wettkampf",
    format,
    distanceKm: targetDistance,
    durationMinutes: eventDuration,
    loopKm: loopKm || 6.7,
    loopIntervalMinutes: loopIntervalMinutes || 60,
    rounds: rounds || 10,
    source: "mission",
    originEventId: event.id || "",
  });
}

export function normalizeRacePrepProfile(input = {}) {
  const format = RACE_PREP_FORMATS.some((item) => item.key === input.format) ? input.format : "distance";
  const loopKm = Math.max(0.1, numeric(input.loopKm) || 6.7);
  const rounds = Math.max(1, Math.round(numeric(input.rounds) || 1));
  const loopIntervalMinutes = Math.max(10, Math.round(numeric(input.loopIntervalMinutes) || 60));
  let distanceKm = numeric(input.distanceKm);
  let durationMinutes = numeric(input.durationMinutes);
  let durationEstimated = Boolean(input.durationEstimated);

  if (format === "loop") {
    distanceKm = Number(roundTo(loopKm * rounds, 0.1).toFixed(1));
    if (!(durationMinutes > 0)) durationMinutes = loopIntervalMinutes * rounds;
  } else if (!(durationMinutes > 0) && distanceKm > 0) {
    durationMinutes = estimateDurationMinutes(distanceKm);
    durationEstimated = true;
  }

  return {
    ...emptyRacePrepProfile(),
    ...input,
    format,
    name: String(input.name || "Freies Rennen").trim() || "Freies Rennen",
    distanceKm,
    durationMinutes: Math.max(0, Math.round(durationMinutes)),
    durationEstimated,
    loopKm,
    loopIntervalMinutes,
    rounds,
  };
}

function syntheticRaceWorkout(profile) {
  const workout = {
    id: profile.id || `race-prep-${profile.originEventId || "custom"}`,
    title: profile.name,
    name: profile.name,
    type: profile.format === "loop" ? "Backyard Race" : "Race",
    raceEvent: true,
    fuelMode: "race",
    distance: profile.distanceKm,
    duration: profile.durationMinutes,
  };
  if (profile.format === "loop") {
    workout.loopTraining = {
      loops: profile.rounds,
      loopKm: profile.loopKm,
      intervalMinutes: profile.loopIntervalMinutes,
      mode: profile.loopIntervalMinutes === 60 ? "fixed_interval" : "free",
    };
  }
  return workout;
}

function reserveRate(durationMinutes) {
  if (durationMinutes >= 12 * 60) return 0.15;
  if (durationMinutes >= 4 * 60) return 0.1;
  return 0.05;
}

function prepPack(pack = [], durationMinutes = 0) {
  const rate = reserveRate(durationMinutes);
  return pack.map((item) => {
    if (item.generic) return { ...item, prepReserveQuantity: 0 };
    const consumed = numeric(item.consumeQuantity);
    const originalQuantity = Math.max(numeric(item.quantity), consumed, 1);
    const reserve = item.unit === "ml"
      ? roundTo(consumed * rate, 100)
      : Math.max(numeric(item.reserveQuantity), Math.ceil(consumed * rate));
    const quantity = consumed + reserve;
    const requiredInventory = numeric(item.requiredInventory) * (quantity / originalQuantity);
    const availableInventory = numeric(item.availableInventory);
    return {
      ...item,
      quantity,
      reserveQuantity: reserve,
      prepReserveQuantity: reserve,
      requiredInventory,
      shortage: Math.max(0, requiredInventory - availableInventory),
    };
  });
}

function shoppingList(pack = []) {
  return pack
    .filter((item) => !item.generic)
    .map((item) => ({
      fuelItemId: item.fuelItemId,
      label: item.label,
      required: numeric(item.requiredInventory),
      available: numeric(item.availableInventory),
      missing: numeric(item.shortage),
      unit: item.stockUnit || "Einheiten",
      ready: numeric(item.shortage) <= 0,
    }));
}

function phasePlan(profile, recommendation) {
  const duringFuel = recommendation.target.carbsPerHour > 0
    ? `${Math.round(recommendation.target.carbsPerHour)} g KH/h · insgesamt ca. ${Math.round(recommendation.target.carbsTotal)} g`
    : "Während des Rennens ist kein zusätzlicher Kohlenhydrat-Plan nötig.";
  const duringFluid = recommendation.target.fluidTotal > 0
    ? `Orientierung ${Math.round(recommendation.target.fluidPerHour)} ml/h · insgesamt ca. ${Math.round(recommendation.target.fluidTotal)} ml`
    : "Trinken nach Durst und Bedingungen; kein fixer DURING-Block erforderlich.";

  return [
    {
      key: "pre",
      label: "PRE",
      title: "Vor dem Start",
      detail: "Vertraute Mahlzeit und Getränke einplanen. Keine neuen Produkte am Renntag testen.",
      note: "PRE wird bewusst nicht in die DURING-Mengen eingerechnet.",
    },
    {
      key: "during",
      label: "DURING",
      title: profile.format === "loop" ? "Pro Runde / Rennstunde" : "Während des Rennens",
      detail: `${duringFuel} · ${duringFluid}`,
      note: "Konkrete Produkte und Zeitpunkte stehen im Versorgungsplan unten.",
    },
    {
      key: "post",
      label: "POST",
      title: "Nach dem Ziel / Tagesblock",
      detail: "Recovery-Verpflegung separat bereitlegen und nach tatsächlichem Hunger, Durst und Verträglichkeit nutzen.",
      note: "POST wird im Review getrennt erfasst und verändert die DURING-Rate nicht.",
    },
  ];
}

export function buildRacePrepPlan({ profile: inputProfile, state = {} } = {}) {
  const profile = normalizeRacePrepProfile(inputProfile);
  if (!(profile.durationMinutes > 0)) {
    return {
      valid: false,
      profile,
      error: "Für die Verpflegungsplanung fehlt eine erwartete Renndauer.",
    };
  }
  if (profile.format === "distance" && !(profile.distanceKm > 0)) {
    return {
      valid: false,
      profile,
      error: "Für ein Distanzrennen fehlt die Distanz.",
    };
  }

  const workout = syntheticRaceWorkout(profile);
  const recommendation = fuelRecommendationForWorkout({
    workout,
    fuel: state.fuel,
    activities: state.activities,
    reviews: state.reviews,
    mode: "race",
  });
  const strategy = raceFuelStrategy({ workout, recommendation, reviews: state.reviews });
  const pack = prepPack(recommendation.pack, profile.durationMinutes);
  const shopping = shoppingList(pack);
  const warnings = [...recommendation.warnings, ...(strategy?.warnings || [])];

  if (profile.durationEstimated) {
    warnings.unshift(`Renndauer ist aktuell geschätzt (${formatDuration(profile.durationMinutes)}). Für den finalen Einkaufsplan bitte die erwartete Dauer anpassen.`);
  }
  if (profile.durationMinutes >= 6 * 60) {
    const solidProducts = new Set(recommendation.consume.filter((item) => item.unit !== "ml").map((item) => item.fuelItemId));
    if (solidProducts.size < 2 && recommendation.target.carbsTotal > 0) {
      warnings.push("Langes Rennen: Der aktuelle Plan hängt fast vollständig an einer Fuel-Quelle. Produktrotation und eine herzhafte Alternative vor dem Rennen testen.");
    }
  }

  return {
    valid: true,
    profile,
    workout,
    recommendation,
    strategy,
    phases: phasePlan(profile, recommendation),
    pack,
    shopping,
    shoppingNeeded: shopping.filter((item) => item.missing > 0),
    stockReady: shopping.every((item) => item.ready),
    warnings: [...new Set(warnings)],
    summary: {
      durationLabel: formatDuration(profile.durationMinutes),
      distanceLabel: profile.distanceKm > 0 ? `${profile.distanceKm.toLocaleString("de-DE")} km` : "offene Distanz",
      carbsTotal: Math.round(recommendation.target.carbsTotal),
      carbsPerHour: Math.round(recommendation.target.carbsPerHour),
      fluidTotal: Math.round(recommendation.target.fluidTotal),
      fluidPerHour: Math.round(recommendation.target.fluidPerHour),
      schedulePoints: strategy?.rows?.length || 0,
    },
  };
}
