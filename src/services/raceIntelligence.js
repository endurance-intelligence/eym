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
  pretzelSticks: "Salzstangen",
  breadRoll: "Brötchen",
  pasta: "Nudeln",
  pickle: "Essiggurke",
  potatoes: "Kartoffeln",
  savory: "Salziges",
  broth: "Brühe",
  organizerGel: "Veranstalter-Gel",
  toilet: "Toilette",
  dropbag: "Dropbag",
  crew: "Crew-Zugang",
};

const VP_FUEL_OPTIONS = {
  cola: { role: "fuel", family: "sweet", portions: [{ label: "200 ml Cola", carbs: 22 }, { label: "250 ml Cola", carbs: 27 }] },
  banana: { role: "fuel", family: "sweet", portions: [{ label: "½ Banane", carbs: 12 }, { label: "1 Banane", carbs: 23 }] },
  pretzelSticks: { role: "fuel", family: "salty", portions: [{ label: "1 kleine Handvoll Salzstangen", carbs: 25 }] },
  breadRoll: { role: "fuel", family: "salty", portions: [{ label: "½ Brötchen", carbs: 13 }, { label: "1 Brötchen", carbs: 25 }] },
  pasta: { role: "fuel", family: "salty", portions: [{ label: "1 kleine Portion Nudeln", carbs: 30 }] },
  potatoes: { role: "fuel", family: "salty", portions: [{ label: "1 kleine Kartoffel", carbs: 18 }, { label: "2 kleine Kartoffeln", carbs: 36 }] },
  pickle: { role: "support", family: "salty", portions: [{ label: "1 Essiggurke", carbs: 2 }] },
  broth: { role: "support", family: "salty", portions: [{ label: "1 Becher Brühe", carbs: 0 }] },
  savory: { role: "support", family: "salty", portions: [{ label: "etwas Salziges", carbs: 0 }] },
};

const KNOWN_RACE_DRINKS = [
  { id: "catalog-maurten-160", label: "Maurten Drink Mix 160", carbs: 40, sodiumMg: 0, preparedVolumeMl: 500, category: "Drink Mix", source: "EI Produktkatalog" },
  { id: "catalog-maurten-320", label: "Maurten Drink Mix 320", carbs: 80, sodiumMg: 0, preparedVolumeMl: 500, category: "Drink Mix", source: "EI Produktkatalog" },
  { id: "catalog-maurten-320-caf100", label: "Maurten Drink Mix 320 Caf 100", carbs: 80, sodiumMg: 0, preparedVolumeMl: 500, category: "Drink Mix", source: "EI Produktkatalog" },
];

const VP_PAIR_COMPATIBILITY = new Set([
  "banana+pretzelSticks",
  "banana+cola",
  "breadRoll+pretzelSticks",
  "breadRoll+cola",
  "breadRoll+potatoes",
  "pasta+potatoes",
  "pasta+pretzelSticks",
  "potatoes+pretzelSticks",
]);

function compatibleVpPair(leftKey, rightKey) {
  const direct = `${leftKey}+${rightKey}`;
  const reverse = `${rightKey}+${leftKey}`;
  return VP_PAIR_COMPATIBILITY.has(direct) || VP_PAIR_COMPATIBILITY.has(reverse);
}

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

function normalizedSearchText(value) {
  return String(value || "")
    .toLocaleLowerCase("de-DE")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function searchRaceDrinkOptions(state = {}, query = "") {
  const fuelLab = raceDrinkOptions(state).map((option) => ({ ...option, source: option.source || "Fuel Lab" }));
  const options = [...fuelLab, ...KNOWN_RACE_DRINKS.filter((catalog) => !fuelLab.some((item) => normalizedSearchText(item.label) === normalizedSearchText(catalog.label)))];
  const tokens = normalizedSearchText(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return fuelLab;
  return options
    .map((option, index) => {
      const haystack = normalizedSearchText(option.label);
      if (!tokens.every((token) => haystack.includes(token))) return null;
      const exact = haystack === tokens.join(" ");
      const starts = haystack.startsWith(tokens[0]);
      const fuelLabBonus = option.source === "Fuel Lab" ? 0.25 : 0;
      return { option, score: (exact ? 3 : starts ? 2 : 1) + fuelLabBonus, index };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((entry) => entry.option);
}

function vpFuelPortions(resources = []) {
  return [...new Set((Array.isArray(resources) ? resources : []).map(String))]
    .flatMap((key) => {
      const option = VP_FUEL_OPTIONS[key];
      if (!option || option.role !== "fuel") return [];
      return (option.portions || []).map((portion, index) => ({
        key,
        id: `${key}-${index}`,
        family: option.family || "neutral",
        label: portion.label,
        carbs: positive(portion.carbs),
      })).filter((portion) => portion.carbs > 0);
    });
}

function vpReplacementCandidates(resources = [], replacementCarbs = 0) {
  const portions = vpFuelPortions(resources);
  const minimumUseful = Math.max(12, replacementCarbs * 0.65);
  const maximumUseful = replacementCarbs * 1.2;
  const candidates = portions.map((portion) => ({
    key: portion.id,
    resourceKeys: [portion.key],
    label: portion.label,
    carbs: portion.carbs,
    balanced: false,
  }));

  for (let leftIndex = 0; leftIndex < portions.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < portions.length; rightIndex += 1) {
      const left = portions[leftIndex];
      const right = portions[rightIndex];
      if (left.key === right.key || !compatibleVpPair(left.key, right.key)) continue;
      const carbs = left.carbs + right.carbs;
      candidates.push({
        key: `${left.id}+${right.id}`,
        resourceKeys: [left.key, right.key],
        label: `${left.label} + ${right.label}`,
        carbs,
        balanced: left.family !== right.family,
      });
    }
  }

  return candidates
    .filter((candidate) => candidate.carbs >= minimumUseful && candidate.carbs <= maximumUseful)
    .map((candidate) => ({
      ...candidate,
      difference: Math.abs(candidate.carbs - replacementCarbs),
      score: Math.abs(candidate.carbs - replacementCarbs) - (candidate.balanced ? 4 : 0),
    }))
    .sort((left, right) => left.score - right.score || left.difference - right.difference || left.label.localeCompare(right.label, "de"))
    .slice(0, 8);
}

export function raceVpAlternatives(resources = [], replacementCarbs = 0, round = 1) {
  const selected = [...new Set((Array.isArray(resources) ? resources : []).map(String))];
  const candidates = replacementCarbs > 0 ? vpReplacementCandidates(selected, replacementCarbs) : [];
  const specificSaltySelected = selected.some((key) => ["pretzelSticks", "breadRoll", "pasta", "potatoes", "pickle", "broth"].includes(key));
  const supportPool = selected
    .map((key) => ({ key, ...(VP_FUEL_OPTIONS[key] || {}) }))
    .filter((item) => item.role === "support" && !(item.key === "savory" && specificSaltySelected))
    .map((item) => ({ key: item.key, label: item.portions?.[0]?.label || RESOURCE_LABELS[item.key] || item.key, note: "Geschmack/Salz variieren · nicht als KH-Ersatz gerechnet" }));

  if (!(replacementCarbs > 0) || !candidates.length) {
    const supportIndex = supportPool.length ? Math.max(0, Number(round || 1) - 1) % supportPool.length : 0;
    return { replacements: [], support: supportPool.length ? [supportPool[supportIndex]] : [] };
  }

  const preferredIndex = Math.max(0, Number(round || 1) - 1) % candidates.length;
  const preferred = candidates[preferredIndex];
  const alternate = candidates.find((candidate) => candidate.key !== preferred.key && candidate.resourceKeys.every((key) => !preferred.resourceKeys.includes(key)))
    || candidates.find((candidate) => candidate.key !== preferred.key);
  const supportIndex = supportPool.length ? Math.floor(Math.max(0, Number(round || 1) - 1) / 2) % supportPool.length : 0;

  return {
    replacements: [preferred, alternate].filter(Boolean).slice(0, 2),
    support: supportPool.length && Number(round || 1) % 3 === 0 ? [supportPool[supportIndex]] : [],
  };
}

function normalizedOrganizerDrinkProduct(value = null) {
  if (!value || typeof value !== "object") return null;
  const label = String(value.label || "").trim();
  const carbs = positive(value.carbs);
  const preparedVolumeMl = positive(value.preparedVolumeMl);
  if (!label || !(carbs > 0)) return null;
  return {
    id: String(value.id || "organizer-search"),
    label,
    carbs,
    sodiumMg: positive(value.sodiumMg),
    preparedVolumeMl,
    source: String(value.source || "Produktsuche"),
  };
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
  const localProduct = options.find((item) => item.id === productId) || null;
  const product = source === "organizer_known"
    ? localProduct || normalized.organizerDrinkProduct || null
    : localProduct;
  const ml = Math.max(0, Math.round(number(fluidMl)));

  if (source === "organizer_unknown") {
    const carbs = ml * STANDARD_UNKNOWN_SPORT_DRINK_CARBS_PER_100_ML / 100;
    return {
      source,
      productId: "",
      label: "VP-Sportdrink",
      fluidMl: ml,
      carbs,
      sodiumMg: 0,
      carbsPer100Ml: STANDARD_UNKNOWN_SPORT_DRINK_CARBS_PER_100_ML,
      estimated: true,
      configured: true,
      note: `Produkt unbekannt · Planungsannahme ${STANDARD_UNKNOWN_SPORT_DRINK_CARBS_PER_100_ML} g KH / 100 ml.`,
    };
  }

  if (!product) {
    const provisionalOrganizer = source === "organizer_known";
    const carbs = provisionalOrganizer ? ml * STANDARD_UNKNOWN_SPORT_DRINK_CARBS_PER_100_ML / 100 : 0;
    return {
      source,
      productId: "",
      label: source === "own" ? "Eigenes Getränk" : "VP-Drink · Produkt offen",
      fluidMl: ml,
      carbs,
      sodiumMg: 0,
      carbsPer100Ml: provisionalOrganizer ? STANDARD_UNKNOWN_SPORT_DRINK_CARBS_PER_100_ML : 0,
      estimated: provisionalOrganizer,
      configured: false,
      note: provisionalOrganizer
        ? `Produkt noch nicht bestätigt · vorläufig ${STANDARD_UNKNOWN_SPORT_DRINK_CARBS_PER_100_ML} g KH / 100 ml eingeplant.`
        : "Getränk aus dem Fuel Lab wählen, damit KH und Natrium in den Rennplan einfließen.",
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
      ? `${compactNumber(product.carbs, 1)} g KH pro ${compactNumber(preparedVolumeMl)} ml · ${product.source || "Fuel Lab"}.`
      : "Misch-/Trinkvolumen fehlt; Getränk-KH werden bis dahin nicht eingerechnet.",
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
    organizerDrinkProduct: null,
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
    organizerDrinkProduct: normalizedOrganizerDrinkProduct(value.organizerDrinkProduct),
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
      && guard < 1
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

    const remainingCarbGap = Math.max(0, Math.round((cumulativeTarget - cumulativeCarbs) * 10) / 10);
    const vpAlternatives = aidMode === "every_loop"
      ? raceVpAlternatives(normalizedSupply.organizerResources, gelCarbs, round)
      : { replacements: [], support: [] };

    rows.push({
      round,
      items,
      carbs: Math.round(gelCarbs + drinkCarbs),
      gelCarbs: Math.round(gelCarbs),
      drinkCarbs: Math.round(drinkCarbs * 10) / 10,
      targetCarbs: Math.round(targetCarbsPerRound),
      remainingCarbGap,
      fluidMl: fluidPerRound,
      drink,
      vpAlternatives,
      why: "Getränke-KH werden zuerst auf das Rundenziel angerechnet. Pro Runde wird höchstens ein Gel automatisch eingeplant; eine Restlücke wird sichtbar statt mit einem zweiten Gel überladen. Bestätigte VP-Lebensmittel erscheinen als rotierende Alternative und werden nicht doppelt gezählt.",
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
