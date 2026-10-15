import { hydration as hydrationAssessment } from "./insights.js";
import { fuelDisplayName } from "./fuelNutrition.js";
import { eventCourseProfile } from "./goalPlanning.js";
import {
  PIT_CREW_DEFAULT_GEL_PRIORITY,
  normalizeGelPriority,
  pitPortion,
  pitProduct,
  recommendPitCrew,
} from "./pitCrewCoach.js";

const RESOURCE_LABELS = {
  water: "Wasser",
  iso: "Iso / Sportdrink",
  cola: "Cola",
  banana: "Banane / Obst",
  savory: "Salziges",
  broth: "Brühe",
  organizerGel: "Veranstalter-Gel",
  toilet: "Toilette",
  dropbag: "Dropbag",
  crew: "Crew-Zugang",
};

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function positive(value) {
  const parsed = number(value);
  return parsed > 0 ? parsed : 0;
}

function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

function median(values = []) {
  const clean = values.map(number).filter((value) => value > 0).sort((a, b) => a - b);
  if (!clean.length) return 0;
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[mid] : (clean[mid - 1] + clean[mid]) / 2;
}

export function compactNumber(value, digits = 1) {
  const numeric = number(value);
  return numeric.toLocaleString("de-DE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

export function officialRaceDistance(event = {}) {
  const candidates = [
    event.eventDistanceKm,
    event.targetKm,
    event.targetDistanceKm,
    event.distanceKm,
    event.distance,
    event.profile?.eventDistanceKm,
    event.profile?.targetDistanceKm,
    event.profile?.distanceKm,
  ];
  return positive(candidates.find((value) => positive(value)) || 0);
}

export function raceLoopDistance(event = {}) {
  const candidates = [
    event.loopDistanceKm,
    event.loopKm,
    event.roundDistanceKm,
    event.profile?.loopDistanceKm,
    event.profile?.loopKm,
  ];
  return positive(candidates.find((value) => positive(value)) || 0);
}

function durationStringHours(value) {
  const text = String(value || "").trim();
  if (!/^\d{1,3}:\d{2}(?::\d{2})?$/.test(text)) return 0;
  const [hours, minutes, seconds = "0"] = text.split(":").map(Number);
  if (![hours, minutes, seconds].every(Number.isFinite)) return 0;
  return hours + minutes / 60 + seconds / 3600;
}

export function raceDurationHours(event = {}) {
  const directHours = positive(event.durationHours || event.timeLimitHours || event.profile?.durationHours);
  if (directHours) return directHours;
  const minutes = positive(
    event.durationMinutes
      || event.targetDurationMinutes
      || event.timeLimitMinutes
      || event.profile?.durationMinutes
      || event.profile?.targetDurationMinutes,
  );
  if (minutes) return minutes / 60;
  const hours = positive(event.targetHours);
  const mins = positive(event.targetMinutes);
  if (hours || mins) return hours + mins / 60;
  const stringHours = durationStringHours(event.eventTimeLimit || event.targetTime || event.profile?.eventTimeLimit || event.profile?.targetTime);
  return stringHours;
}

export function raceFormat(event = {}) {
  const text = [
    event.format,
    event.courseType,
    event.loopMode,
    event.name,
    event.label,
    event.title,
    event.profile?.format,
    event.profile?.courseType,
    event.profile?.loopMode,
  ].filter(Boolean).join(" ").toLowerCase();
  if (/backyard|fixed.interval|fixed_interval/.test(text)) return "backyard";
  if (/timed|stunden|time.limit|time_limit/.test(text) && !raceLoopDistance(event)) return "timed";
  if (raceLoopDistance(event) || /loop|runde|rundkurs|circuit/.test(text)) return "loop";
  return "distance";
}

export function raceFormatLabel(event = {}) {
  return {
    backyard: "Backyard",
    timed: "Zeitrennen",
    loop: "Rundkurs",
    distance: "Streckenrennen",
  }[raceFormat(event)];
}

export function raceEventKey(event = {}, index = 0) {
  return String(event.id || event.key || event.eventId || event.name || event.title || `race-${index}`);
}

export function raceEventsFromState(state = {}, now = new Date()) {
  const mission = state.mission || {};
  const today = new Date(now);
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const raw = [
    ...(Array.isArray(mission.milestones) ? mission.milestones : []),
    ...(Array.isArray(mission.events) ? mission.events : []),
    ...(mission.id || mission.name ? [mission] : []),
  ];
  const seen = new Set();
  return raw.filter((event) => {
    if (!event || typeof event !== "object" || event.archived) return false;
    const key = raceEventKey(event);
    if (seen.has(key)) return false;
    seen.add(key);
    if (event.date && String(event.date) < todayKey) return false;
    return Boolean(event.date || event.name || event.title);
  }).sort((a, b) => String(a.date || "9999-12-31").localeCompare(String(b.date || "9999-12-31")));
}

function reviewHours(review = {}) {
  const minutes = positive(review.durationMinutes || review.activityDurationMinutes);
  if (minutes) return minutes / 60;
  const seconds = positive(review.durationSeconds || review.activityDurationSeconds);
  return seconds ? seconds / 3600 : 0;
}

export function raceFuelEvidence(state = {}) {
  const reviews = Object.values(state.reviews || {});
  const successful = reviews
    .map((review) => ({
      carbs: positive(review.carbohydratesPerHour || review.carbsPerHour),
      stomach: number(review.stomach),
      hours: reviewHours(review),
      status: review.carbohydrateStatus,
      symptoms: Array.isArray(review.stomachSymptoms) ? review.stomachSymptoms : [],
    }))
    .filter((entry) => entry.carbs > 0)
    .filter((entry) => entry.status === "good" || entry.stomach >= 7)
    .filter((entry) => !entry.symptoms.some((item) => item && item !== "Keine Beschwerden"));
  const long = successful.filter((entry) => entry.hours >= 2 || entry.hours === 0);
  const values = (long.length ? long : successful).map((entry) => entry.carbs);
  return {
    count: values.length,
    median: median(values),
    upper: values.length ? Math.max(...values) : 0,
    proven70: values.some((value) => value >= 70),
    proven80: values.some((value) => value >= 80),
  };
}

export function raceHydrationEvidence(state = {}) {
  const activities = new Map((state.activities || []).map((activity) => [String(activity.id), activity]));
  const calibrated = [];
  const observed = [];

  Object.entries(state.reviews || {}).forEach(([activityId, review]) => {
    const activity = activities.get(String(activityId));
    if (activity) {
      const result = hydrationAssessment(activity, review);
      if (result?.reliable && result.recommendedLow && result.recommendedHigh) {
        calibrated.push((result.recommendedLow + result.recommendedHigh) / 2);
      }
      if (result?.duringRate >= 200 && result.duringRate <= 1500) observed.push(result.duringRate);
      return;
    }
    const explicit = positive(review.hydrationMlPerHour || review.drinkMlPerHour);
    if (explicit >= 200 && explicit <= 1500) observed.push(explicit);
  });

  const values = calibrated.length ? calibrated : observed;
  return {
    count: calibrated.length,
    observedCount: observed.length,
    median: median(values),
    source: calibrated.length ? "sweat-calibration" : observed.length ? "observed-intake" : "default",
  };
}

export function raceFuelTargets({ event = {}, state = {}, temperatureC = null } = {}) {
  const hours = raceDurationHours(event);
  const evidence = raceFuelEvidence(state);
  let carbLow = 0;
  let carbHigh = 0;
  let carbReason = "Für kurze Rennen ist DURING-Fuel optional.";

  if (hours >= 2.5 || officialRaceDistance(event) >= 30) {
    if (evidence.proven70 || evidence.count >= 3) {
      carbLow = 70;
      carbHigh = 90;
      carbReason = `${evidence.count} gut verträgliche Fuel-Reviews stützen den etablierten Ultra-Korridor; die konkrete Quelle wird aus getesteten Produkten gewählt.`;
    } else if (evidence.count) {
      carbLow = 60;
      carbHigh = clamp(Math.round(evidence.upper + 10), 70, 90);
      carbReason = "Die lange Renndauer verlangt Fueling, aber der obere Bereich wird nur aus erprobter Verträglichkeit freigegeben.";
    } else {
      carbLow = 60;
      carbHigh = 80;
      carbReason = "Noch keine belastbare persönliche Fuel-Historie: konservativ starten und nur trainiert steigern.";
    }
  } else if (hours >= 1) {
    carbLow = 30;
    carbHigh = 60;
    carbReason = "Moderate Renndauer: gleichmäßig zuführen, ohne Ultra-Mengen zu erzwingen.";
  }

  const hydration = raceHydrationEvidence(state);
  let hydrationMid = hydration.median || 550;
  if (temperatureC != null) {
    const temp = number(temperatureC);
    if (temp >= 22) hydrationMid += 100;
    else if (temp <= 7) hydrationMid -= 75;
  }
  hydrationMid = clamp(hydrationMid, 350, 850);
  const hydrationLow = Math.round(clamp(hydrationMid - 100, 300, 900) / 50) * 50;
  const hydrationHigh = Math.round(clamp(hydrationMid + 100, 350, 1000) / 50) * 50;

  return {
    carbs: {
      low: carbLow,
      high: carbHigh,
      label: carbHigh ? `${carbLow}–${carbHigh} g KH/h` : "kein Pflicht-Fuel",
      reason: carbReason,
      evidence,
    },
    hydration: {
      low: hydrationLow,
      high: hydrationHigh,
      label: `${hydrationLow}–${hydrationHigh} ml/h`,
      reason: hydration.source === "sweat-calibration"
        ? `Orientierung aus ${hydration.count} belastbaren Schweißraten-Messung${hydration.count === 1 ? "" : "en"}; Wetter und Durst dürfen den Wert verschieben.`
        : hydration.source === "observed-intake"
          ? `Vorläufig aus ${hydration.observedCount} dokumentierten Trink-Erfahrungen abgeleitet; noch keine belastbare Schweißraten-Kalibrierung.`
          : "Startkorridor ohne persönliche Schweißmessung. Kein Trinkzwang pro Runde.",
      evidence: hydration,
    },
  };
}

export function raceRoundCount(event = {}) {
  const explicit = positive(event.planningHorizonRounds || event.rounds || event.laps || event.profile?.planningHorizonRounds || event.profile?.rounds);
  if (explicit) return Math.max(1, Math.ceil(explicit));
  const format = raceFormat(event);
  if (format === "backyard") {
    const horizonHours = positive(event.planningHorizonHours || event.profile?.planningHorizonHours);
    const intervalMinutes = positive(event.loopIntervalMinutes || event.profile?.loopIntervalMinutes) || 60;
    if (horizonHours) return Math.max(1, Math.ceil(horizonHours * 60 / intervalMinutes));
  }
  const distance = officialRaceDistance(event);
  const loop = raceLoopDistance(event);
  return distance > 0 && loop > 0 ? Math.max(1, Math.round(distance / loop)) : 0;
}

export function buildRacePhases({ event = {}, state = {}, temperatureC = null } = {}) {
  const targets = raceFuelTargets({ event, state, temperatureC });
  const format = raceFormat(event);
  const base = [
    { key: "settle", label: "Ankommen", from: 0, to: 0.17, effort: "bewusst konservativ", carbDelta: -10, note: "Rhythmus finden; Frühstück/Vorversorgung wirken lassen." },
    { key: "work", label: "Arbeitsphase", from: 0.17, to: 0.5, effort: "Race-Rhythmus stabilisieren", carbDelta: 0, note: "Gleichmäßig essen und trinken; nichts nachholen erzwingen." },
    { key: "stabilize", label: "Stabilisieren", from: 0.5, to: 0.78, effort: "Formcheck statt Pace erzwingen", carbDelta: 0, note: "Magen, HF/RPE und Ermüdung entscheiden über Anpassungen." },
    { key: "finish", label: "Finish", from: 0.78, to: 1, effort: "einfach und zuverlässig", carbDelta: 0, note: "Verträgliche Quellen priorisieren; Koffein nur nach geplantem Einsatz." },
  ];
  const rounds = raceRoundCount(event);
  return base.map((phase, index) => {
    const low = targets.carbs.low ? Math.max(30, targets.carbs.low + phase.carbDelta) : 0;
    const high = targets.carbs.high ? Math.max(low, targets.carbs.high + (index === 0 ? -10 : 0)) : 0;
    const roundFrom = rounds ? Math.max(1, Math.floor(phase.from * rounds) + 1) : null;
    const roundTo = rounds ? Math.max(roundFrom, index === base.length - 1 ? rounds : Math.floor(phase.to * rounds)) : null;
    return {
      ...phase,
      roundFrom,
      roundTo,
      title: rounds ? `Runde ${roundFrom}–${roundTo}` : `${Math.round(phase.from * 100)}–${Math.round(phase.to * 100)} %`,
      carbLabel: high ? `${low}–${high} g KH/h` : "nach Bedarf",
      hydrationLabel: targets.hydration.label,
      format,
    };
  });
}

export function raceGelOptions(state = {}) {
  const fuelLabGels = (Array.isArray(state.fuel) ? state.fuel : [])
    .filter((item) => !item?.archived && String(item?.category || "").toLowerCase() === "gel")
    .map((item) => {
      const servingQuantity = positive(item.servingQuantity);
      const directCarbs = positive(item.carbs);
      const carbsPer100 = positive(item.carbsPer100);
      const carbs = directCarbs || (servingQuantity && carbsPer100 ? servingQuantity / 100 * carbsPer100 : 0);
      const directSodium = positive(item.sodium);
      const sodiumPer100 = positive(item.sodiumPer100);
      const sodiumMg = directSodium || (servingQuantity && sodiumPer100 ? servingQuantity / 100 * sodiumPer100 : 0);
      const directCaffeine = positive(item.caffeine);
      const caffeinePer100 = positive(item.caffeinePer100);
      const caffeineMg = directCaffeine || (servingQuantity && caffeinePer100 ? servingQuantity / 100 * caffeinePer100 : 0);
      const unit = String(item.servingUnit || "").trim();
      return {
        id: String(item.id),
        label: fuelDisplayName(item),
        carbs,
        sodiumMg,
        caffeineMg,
        portionLabel: servingQuantity ? `1 Gel · ${compactNumber(servingQuantity)}${unit ? ` ${unit}` : ""}` : "1 Gel",
        source: "fuel-lab",
      };
    });

  if (fuelLabGels.length) return fuelLabGels;

  return normalizeGelPriority(PIT_CREW_DEFAULT_GEL_PRIORITY).map((id) => {
    const portion = (pitProduct(id)?.portions || []).find((item) => Number(item.carbs || 0) > 0);
    return {
      id,
      label: pitProduct(id)?.label || id,
      carbs: Number(portion?.carbs || 0),
      sodiumMg: Number(portion?.sodiumMg || 0),
      caffeineMg: Number(portion?.caffeineMg || 0),
      portionLabel: portion?.label || "1 Gel",
      source: "fallback",
    };
  });
}

const STANDARD_UNKNOWN_SPORT_DRINK_CARBS_PER_100_ML = 6;

export function raceDrinkOptions(state = {}) {
  return (Array.isArray(state.fuel) ? state.fuel : [])
    .filter((item) => {
      if (item?.archived) return false;
      const category = String(item?.category || "").toLowerCase();
      return category === "drink mix" || category === "elektrolyte";
    })
    .map((item) => {
      const servingQuantity = positive(item.servingQuantity);
      const directCarbs = number(item.carbs);
      const carbsPer100 = number(item.carbsPer100);
      const carbs = directCarbs > 0
        ? directCarbs
        : servingQuantity > 0 && carbsPer100 > 0
          ? servingQuantity / 100 * carbsPer100
          : 0;
      const directSodium = number(item.sodium);
      const sodiumPer100 = number(item.sodiumPer100);
      const sodiumMg = directSodium > 0
        ? directSodium
        : servingQuantity > 0 && sodiumPer100 > 0
          ? servingQuantity / 100 * sodiumPer100
          : 0;
      const preparedVolumeMl = positive(item.preparedVolumeMl)
        || (String(item.servingUnit || "").toLowerCase() === "ml" ? servingQuantity : 0);
      return {
        id: String(item.id),
        label: fuelDisplayName(item),
        carbs,
        sodiumMg,
        preparedVolumeMl,
        category: item.category,
      };
    });
}

function raceDrinkSource(plan = {}, event = {}) {
  if (["own", "organizer_known", "organizer_unknown"].includes(plan.drinkSource)) return plan.drinkSource;
  return raceAidStationMode(event) === "every_loop" ? "organizer_unknown" : "own";
}

export function raceDrinkPlanForVolume({ event = {}, state = {}, supply = {}, fluidMl = 0 } = {}) {
  const normalized = normalizeRaceSupplyPlan(supply, state);
  const source = raceDrinkSource(normalized, event);
  const options = raceDrinkOptions(state);
  const productId = source === "own" ? normalized.ownDrinkProductId : normalized.organizerDrinkProductId;
  const product = options.find((item) => item.id === productId) || null;
  const ml = Math.max(0, Math.round(number(fluidMl)));

  if (source === "organizer_unknown") {
    const carbs = ml * STANDARD_UNKNOWN_SPORT_DRINK_CARBS_PER_100_ML / 100;
    return {
      source,
      productId: "",
      label: "Veranstalter-Sportdrink · Produkt unbekannt",
      fluidMl: ml,
      carbs,
      sodiumMg: 0,
      carbsPer100Ml: STANDARD_UNKNOWN_SPORT_DRINK_CARBS_PER_100_ML,
      estimated: true,
      configured: true,
      note: `Planungsannahme: ${STANDARD_UNKNOWN_SPORT_DRINK_CARBS_PER_100_ML} g KH / 100 ml.`,
    };
  }

  if (!product) {
    return {
      source,
      productId: "",
      label: source === "own" ? "Eigenes Getränk · Produkt wählen" : "Veranstaltergetränk · Produkt wählen",
      fluidMl: ml,
      carbs: 0,
      sodiumMg: 0,
      carbsPer100Ml: 0,
      estimated: false,
      configured: false,
      note: "Getränk aus dem Fuel Lab wählen, damit KH und Natrium in den Rennplan einfließen.",
    };
  }

  const preparedVolumeMl = positive(product.preparedVolumeMl);
  const factor = preparedVolumeMl > 0 ? ml / preparedVolumeMl : 0;
  return {
    source,
    productId: product.id,
    label: product.label,
    fluidMl: ml,
    carbs: factor > 0 ? product.carbs * factor : 0,
    sodiumMg: factor > 0 ? product.sodiumMg * factor : 0,
    carbsPer100Ml: preparedVolumeMl > 0 ? product.carbs / preparedVolumeMl * 100 : 0,
    estimated: false,
    configured: preparedVolumeMl > 0,
    note: preparedVolumeMl > 0
      ? `${compactNumber(product.carbs, 1)} g KH pro ${compactNumber(preparedVolumeMl)} ml laut Fuel Lab.`
      : "Misch-/Trinkvolumen fehlt im Fuel Lab; Getränk-KH werden bis dahin nicht eingerechnet.",
  };
}

function normalizedRaceGelPriority(value, options = []) {
  const available = options.map((option) => String(option.id));
  const allowed = new Set(available);
  const requested = Array.isArray(value) ? value.map(String).filter((id) => allowed.has(id)) : [];
  return [...new Set([...requested, ...available])];
}

export function defaultRaceSupplyPlan(state = {}) {
  return {
    mode: "hybrid",
    organizerResources: ["water", "iso"],
    organizerGelApproved: false,
    gelPriority: raceGelOptions(state).map((item) => item.id),
    gelExcludedIds: [],
    drinkSource: "",
    ownDrinkProductId: "",
    organizerDrinkProductId: "",
    aidStations: [],
    note: "",
  };
}

export function normalizeRaceSupplyPlan(value = {}, state = {}) {
  const gelOptions = raceGelOptions(state);
  const drinkOptions = raceDrinkOptions(state);
  const defaults = defaultRaceSupplyPlan(state);
  const availableGelIds = new Set(gelOptions.map((item) => String(item.id)));
  const availableDrinkIds = new Set(drinkOptions.map((item) => String(item.id)));
  const resources = Array.isArray(value.organizerResources)
    ? value.organizerResources.filter((key) => RESOURCE_LABELS[key])
    : defaults.organizerResources;
  return {
    ...defaults,
    ...value,
    mode: ["own", "vp", "hybrid"].includes(value.mode) ? value.mode : defaults.mode,
    organizerResources: resources,
    organizerGelApproved: Boolean(value.organizerGelApproved),
    gelPriority: normalizedRaceGelPriority(value.gelPriority, gelOptions),
    gelExcludedIds: Array.isArray(value.gelExcludedIds)
      ? [...new Set(value.gelExcludedIds.map(String).filter((id) => availableGelIds.has(id)))]
      : [],
    drinkSource: ["own", "organizer_known", "organizer_unknown"].includes(value.drinkSource) ? value.drinkSource : "",
    ownDrinkProductId: availableDrinkIds.has(String(value.ownDrinkProductId || "")) ? String(value.ownDrinkProductId) : "",
    organizerDrinkProductId: availableDrinkIds.has(String(value.organizerDrinkProductId || "")) ? String(value.organizerDrinkProductId) : "",
    aidStations: Array.isArray(value.aidStations)
      ? value.aidStations.map((station, index) => ({
          id: String(station.id || `vp-${index + 1}`),
          km: positive(station.km),
          name: station.name || `VP ${index + 1}`,
          resources: Array.isArray(station.resources) ? station.resources.filter((key) => RESOURCE_LABELS[key]) : [],
          note: station.note || "",
        })).sort((a, b) => a.km - b.km)
      : [],
  };
}

export function activeRaceGelPriority(plan = {}, state = {}) {
  const normalized = normalizeRaceSupplyPlan(plan, state);
  const excluded = new Set(normalized.gelExcludedIds || []);
  return normalized.gelPriority.filter((id) => !excluded.has(id));
}

export function raceAidStationMode(event = {}) {
  return eventCourseProfile(event).aidStationMode;
}

function weatherFlagsForRace(temperatureC) {
  const temperature = Number(temperatureC);
  if (!Number.isFinite(temperature)) return [];
  if (temperature >= 24) return ["hot"];
  if (temperature <= 7) return ["cold"];
  return [];
}

function closestDrinkPortion(productId, targetMl) {
  const product = pitProduct(productId);
  const portions = (product?.portions || []).filter((portion) => Number(portion.fluidMl || 0) > 0);
  if (!portions.length || !(targetMl > 0)) return null;
  return [...portions].sort((left, right) => Math.abs(Number(left.fluidMl) - targetMl) - Math.abs(Number(right.fluidMl) - targetMl))[0];
}

function adaptPitDrinkToRace(selection = [], targetMl = 0) {
  let adapted = false;
  return selection.map((entry) => {
    const product = pitProduct(entry.productId);
    const current = pitPortion(entry.productId, entry.portionId);
    if (adapted || product?.category !== "drink" || (entry.timing || "now") !== "carry" || !(Number(current?.fluidMl || 0) > 0)) return entry;
    const portion = closestDrinkPortion(entry.productId, targetMl);
    if (!portion) return entry;
    adapted = true;
    return { ...entry, portionId: String(portion.id) };
  });
}

function gelPortion(productId, state = {}) {
  const fuelLab = raceGelOptions(state).find((item) => item.id === String(productId) && item.source === "fuel-lab");
  if (fuelLab) {
    if (!(fuelLab.carbs > 0)) return null;
    return {
      product: { label: fuelLab.label },
      portion: {
        id: "fuel-lab",
        label: fuelLab.portionLabel,
        carbs: fuelLab.carbs,
        sodiumMg: fuelLab.sodiumMg,
        caffeineMg: fuelLab.caffeineMg,
      },
    };
  }
  const product = pitProduct(productId);
  const portion = (product?.portions || []).find((item) => Number(item.carbs || 0) > 0);
  if (!product || !portion) return null;
  return { product, portion };
}

function gelPriorityIndexForSlot(slotNumber, length) {
  if (length >= 4 && slotNumber % 16 === 0) return 3;
  if (length >= 3 && slotNumber % 8 === 0) return 2;
  if (length >= 2 && slotNumber % 4 === 0) return 1;
  return 0;
}

function buildGelLedLoopFuelRotation({ event = {}, state = {}, supply = {}, temperatureC = null } = {}) {
  const normalizedSupply = normalizeRaceSupplyPlan(supply, state);
  const rounds = raceRoundCount(event);
  if (!rounds) return [];
  const targets = raceFuelTargets({ event, state, temperatureC });
  const hours = raceDurationHours(event);
  const roundHours = hours > 0 ? hours / rounds : 1;
  const carbMid = targets.carbs.high > 0 ? (targets.carbs.low + targets.carbs.high) / 2 : 0;
  const targetCarbsPerRound = carbMid > 0 ? carbMid * roundHours : 0;
  const fluidMid = (targets.hydration.low + targets.hydration.high) / 2;
  const fluidPerRound = clamp(Math.round((fluidMid * roundHours) / 50) * 50, 150, 750);
  const gelPriority = activeRaceGelPriority(normalizedSupply, state).filter((id) => gelPortion(id, state));
  const aidMode = raceAidStationMode(event);
  const drinkTiming = aidMode === "every_loop" ? "vp" : "carry";
  let cumulativeCarbs = 0;
  let gelSlotNumber = 0;
  const rows = [];

  for (let round = 1; round <= rounds; round += 1) {
    const drink = raceDrinkPlanForVolume({ event, state, supply: normalizedSupply, fluidMl: fluidPerRound });
    const drinkCarbs = Number(drink.carbs || 0);
    cumulativeCarbs += drinkCarbs;

    const chosen = [];
    let gelCarbs = 0;
    const cumulativeTarget = targetCarbsPerRound * round;
    let guard = 0;
    while (
      gelPriority.length
      && targetCarbsPerRound > 0
      && cumulativeCarbs < cumulativeTarget - 8
      && guard < 2
    ) {
      gelSlotNumber += 1;
      const primaryIndex = gelPriorityIndexForSlot(gelSlotNumber, gelPriority.length);
      const productId = gelPriority[primaryIndex] || gelPriority[0];
      const entry = gelPortion(productId, state);
      const carbs = Number(entry?.portion?.carbs || 0);
      if (!(carbs > 0)) break;
      chosen.push(productId);
      gelCarbs += carbs;
      cumulativeCarbs += carbs;
      guard += 1;
    }

    const items = chosen.map((productId, index) => {
      const entry = gelPortion(productId, state);
      return {
        productId,
        portionId: String(entry.portion.id),
        quantity: 1,
        timing: "carry",
        label: entry.product.label,
        category: "gel",
        portionLabel: entry.portion.label || "1 Gel",
        carbs: Number(entry.portion.carbs || 0),
        fluidMl: 0,
        sodiumMg: Number(entry.portion.sodiumMg || 0),
        slot: index === 0 ? "basis" : "ergänzung",
      };
    });

    items.push({
      productId: drink.productId || `race-${drink.source}-drink`,
      portionId: String(fluidPerRound),
      quantity: 1,
      timing: drinkTiming,
      label: drink.label,
      category: "drink",
      portionLabel: `${fluidPerRound} ml${drink.configured || drink.estimated ? ` · ${drink.estimated ? "≈" : ""}${compactNumber(drinkCarbs, 1)} g KH` : " · KH offen"}`,
      carbs: drinkCarbs,
      fluidMl: fluidPerRound,
      sodiumMg: Number(drink.sodiumMg || 0),
      estimatedCarbs: Boolean(drink.estimated),
      uncountedCarbs: !drink.configured && !drink.estimated,
    });

    rows.push({
      round,
      items,
      carbs: Math.round(gelCarbs + drinkCarbs),
      gelCarbs: Math.round(gelCarbs),
      drinkCarbs: Math.round(drinkCarbs * 10) / 10,
      targetCarbs: Math.round(targetCarbsPerRound),
      fluidMl: fluidPerRound,
      drink,
      why: "Getränke-KH werden zuerst auf das Rundenziel angerechnet; Gels schließen nur die verbleibende Lücke. Unbestätigtes VP-Essen bleibt Reserve.",
      gelIds: chosen,
    });
  }
  return rows;
}

export function buildRaceFuelRotation({ event = {}, state = {}, supply = {}, temperatureC = null } = {}) {
  const normalizedSupply = normalizeRaceSupplyPlan(supply, state);
  const rounds = raceRoundCount(event);
  const format = raceFormat(event);
  if (!rounds || !["loop", "backyard"].includes(format)) return [];
  if (format === "loop") return buildGelLedLoopFuelRotation({ event, state, supply: normalizedSupply, temperatureC });
  const targets = raceFuelTargets({ event, state, temperatureC });
  const hours = raceDurationHours(event);
  const loopIntervalMinutes = positive(event.loopIntervalMinutes || event.profile?.loopIntervalMinutes) || 60;
  const roundHours = hours > 0 ? hours / rounds : format === "backyard" ? loopIntervalMinutes / 60 : 1;
  const fluidMid = (targets.hydration.low + targets.hydration.high) / 2;
  const fluidPerRound = clamp(Math.round((fluidMid * roundHours) / 50) * 50, 150, 750);
  const weather = weatherFlagsForRace(temperatureC);
  const history = [];
  const rows = [];

  for (let round = 1; round <= rounds; round += 1) {
    const recommendation = recommendPitCrew({
      round,
      minutesToStart: 10,
      history,
      weather,
      gelPriority: normalizedSupply.gelPriority,
    });
    const selection = adaptPitDrinkToRace(recommendation.selection, fluidPerRound);
    const items = selection.map((entry) => {
      const product = pitProduct(entry.productId);
      const portion = pitPortion(entry.productId, entry.portionId);
      return {
        ...entry,
        label: product?.label || entry.productId,
        category: product?.category || "fuel",
        portionLabel: portion?.label || "",
        carbs: Number(portion?.carbs || 0) * Number(entry.quantity || 1),
        fluidMl: Number(portion?.fluidMl || 0) * Number(entry.quantity || 1),
        sodiumMg: Number(portion?.sodiumMg || 0) * Number(entry.quantity || 1),
      };
    });
    const carbs = Math.round(items.reduce((sum, item) => sum + item.carbs, 0));
    const fluidMl = Math.round(items.reduce((sum, item) => sum + item.fluidMl, 0));
    rows.push({
      round,
      items,
      carbs,
      fluidMl,
      why: recommendation.why,
      gelIds: items.filter((item) => item.category === "gel").map((item) => item.productId),
    });
    history.push({ round, selection, confirmedAt: `plan-${round}` });
  }
  return rows;
}

export function resourceLabel(key) {
  return RESOURCE_LABELS[key] || key;
}

export function resourceOptions() {
  return Object.entries(RESOURCE_LABELS).map(([value, label]) => ({ value, label }));
}

export function supplyModeCopy(mode) {
  if (mode === "own") return "Eigene Gels und eigene Drinks sind die Primärquelle. VPs bleiben Backup.";
  if (mode === "vp") return "Nur bestätigte VP-Ressourcen tragen die Basis; eigene Gels bleiben die verlässliche Reserve.";
  return "Eigene, getestete Gels bilden die Basis. Vom VP wird nur das fest eingeplant, was du ausdrücklich bestätigst.";
}

export function aidStationSegments(event = {}, plan = {}, state = {}, temperatureC = null) {
  const distance = officialRaceDistance(event);
  const stations = normalizeRaceSupplyPlan(plan).aidStations.filter((station) => station.km > 0);
  const points = [{ km: 0, name: "Start" }, ...stations];
  if (distance > 0) points.push({ km: distance, name: "Ziel" });
  const totalHours = raceDurationHours(event);
  const targets = raceFuelTargets({ event, state, temperatureC });
  return points.slice(0, -1).map((point, index) => {
    const next = points[index + 1];
    const delta = Math.max(0, next.km - point.km);
    const hours = distance > 0 && totalHours > 0 ? totalHours * delta / distance : 0;
    const minutes = hours > 0 ? Math.round(hours * 60) : 0;
    const carbLow = hours > 0 ? Math.round(targets.carbs.low * hours) : 0;
    const carbHigh = hours > 0 ? Math.round(targets.carbs.high * hours) : 0;
    const fluidLow = hours > 0 ? Math.round(targets.hydration.low * hours / 50) * 50 : 0;
    const fluidHigh = hours > 0 ? Math.round(targets.hydration.high * hours / 50) * 50 : 0;
    const carryHint = hours > 0
      ? `${minutes} min · ${carbHigh ? `${carbLow}–${carbHigh} g KH` : "Fuel nach Bedarf"} · ${fluidLow}–${fluidHigh} ml Trinkkorridor`
      : delta >= 15 ? "langer Abschnitt · Flüssigkeit und Fuel bewusst auffüllen"
        : delta >= 8 ? "mittlerer Abschnitt · normalen Carry planen"
          : "kurzer Abschnitt · keine unnötige Reserve mitschleppen";
    return {
      from: point.name,
      to: next.name,
      km: delta,
      hours,
      minutes,
      carbLow,
      carbHigh,
      fluidLow,
      fluidHigh,
      carryHint,
    };
  });
}
