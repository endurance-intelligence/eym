import { fuelRecommendationForWorkout } from "./fuelPlanner.js";
import { defaultConsumptionUnit, fuelDisplayName, nutritionForConsumption } from "./fuelNutrition.js";
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

function localActivityId(activity = {}) {
  return String(activity.id || activity.activityId || "");
}

function activityDurationMinutes(activity = {}) {
  const seconds = numeric(activity.durationSeconds);
  if (seconds > 0) return seconds / 60;
  return numeric(activity.duration);
}

function cleanSymptoms(review = {}) {
  return (Array.isArray(review.stomachSymptoms) ? review.stomachSymptoms : [])
    .filter((entry) => !String(entry).startsWith("Keine"));
}
function isHydrationFuelItem(item = {}) {
  return Number(item?.preparedVolumeMl || 0) > 0
    || ["Drink Mix", "Elektrolyte"].includes(String(item?.category || ""));
}
function hydrationReferenceVolume(item = {}) {
  const prepared = numeric(item.preparedVolumeMl);
  if (prepared > 0) return prepared;
  if (item.servingUnit === "ml") return numeric(item.servingQuantity);
  return 0;
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
    routeGpxUrl: "",
    fuelItemIds: null,
    manualFuelItems: [],
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
    routeGpxUrl: event.routeGpxUrl || event.gpxUrl || "",
    eventDistanceKm: targetDistance,
    courseType: event.courseType || (loopKm > 0 ? "loop" : ""),
    loopMode: event.loopMode || (/backyard/.test(text) ? "fixed_interval" : /heartbeat/.test(text) ? "time_limit" : "free"),
    eventTimeLimit: event.eventTimeLimit || "",
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
    fuelItemIds: input.fuelItemIds == null ? null : [...new Set((Array.isArray(input.fuelItemIds) ? input.fuelItemIds : []).map(String))],
    manualFuelItems: (Array.isArray(input.manualFuelItems) ? input.manualFuelItems : []).map((item) => ({
      id: String(item.id || `manual-${Math.random().toString(36).slice(2)}`),
      name: String(item.name || "Eigenes Lebensmittel").trim() || "Eigenes Lebensmittel",
      carbs: numeric(item.carbs),
      sodium: numeric(item.sodium),
      caffeine: numeric(item.caffeine),
    })),
  };
}

export function racePrepFuelEvidence(state = {}) {
  const activities = new Map((Array.isArray(state.activities) ? state.activities : []).map((activity) => [localActivityId(activity), activity]));
  const stats = new Map();

  Object.entries(state.reviews || {}).forEach(([activityId, review]) => {
    const activity = activities.get(String(activityId));
    const durationMinutes = activityDurationMinutes(activity);
    const reviewSuccessful = numeric(review?.stomach) >= 7 && cleanSymptoms(review).length === 0;
    (Array.isArray(review?.nutritionItems) ? review.nutritionItems : []).forEach((item) => {
      if (!item?.fuelItemId) return;
      const id = String(item.fuelItemId);
      const current = stats.get(id) || { uses: 0, good: 0, watch: 0, bad: 0, longestGoodMinutes: 0, lastGoodTiming: "" };
      current.uses += 1;
      const explicitGood = item.intakeTolerance === "good";
      const explicitWatch = item.intakeTolerance === "watch";
      const explicitBad = item.intakeTolerance === "bad";
      const inferredGood = !item.intakeTolerance && reviewSuccessful;
      if (explicitGood || inferredGood) {
        current.good += 1;
        current.longestGoodMinutes = Math.max(current.longestGoodMinutes, durationMinutes);
        const timingValue = String(item.intakeTimingValue || "").trim();
        if (timingValue) {
          const prefix = item.intakeTimingMode === "round" ? "Runde " : item.intakeTimingMode === "km" ? "km " : item.intakeTimingMode === "minute" ? "Min " : "";
          current.lastGoodTiming = `${prefix}${timingValue}`;
        }
      }
      if (explicitWatch) current.watch += 1;
      if (explicitBad) current.bad += 1;
      stats.set(id, current);
    });
  });

  return (Array.isArray(state.fuel) ? state.fuel : [])
    .filter((item) => !item.archived)
    .map((item) => {
      const evidence = stats.get(String(item.id)) || { uses: 0, good: 0, watch: 0, bad: 0, longestGoodMinutes: 0, lastGoodTiming: "" };
      const tone = evidence.bad > 0 ? "bad" : evidence.watch > 0 && evidence.good === 0 ? "watch" : evidence.good > 0 ? "good" : evidence.uses > 0 ? "used" : "untested";
      const recommended = evidence.good > 0 && evidence.bad === 0;
      const durationLabel = evidence.longestGoodMinutes >= 60
        ? `${(evidence.longestGoodMinutes / 60).toLocaleString("de-DE", { maximumFractionDigits: 1 })} h`
        : evidence.longestGoodMinutes > 0 ? `${Math.round(evidence.longestGoodMinutes)} min` : "";
      const detail = evidence.good > 0
        ? `${evidence.good}× gut vertragen${durationLabel ? ` · längster guter Test ${durationLabel}` : ""}${evidence.lastGoodTiming ? ` · zuletzt ${evidence.lastGoodTiming}` : ""}`
        : evidence.bad > 0
          ? `${evidence.bad}× problematisch${evidence.watch ? ` · ${evidence.watch}× auffällig` : ""}`
          : evidence.watch > 0
            ? `${evidence.watch}× auffällig`
            : evidence.uses > 0
              ? `${evidence.uses}× eingesetzt · noch ohne positive Einzelbewertung`
              : "Noch nicht im Training dokumentiert";
      return {
        id: String(item.id),
        name: fuelDisplayName(item),
        carbs: numeric(item.carbs),
        sodium: numeric(item.sodium),
        caffeine: numeric(item.caffeine),
        category: item.category || "Sonstiges",
        role: isHydrationFuelItem(item) ? "hydration" : "fuel",
        tone,
        recommended,
        detail,
        evidence,
        item,
      };
    })
    .sort((left, right) => {
      const score = (entry) => entry.evidence.good * 100 + entry.evidence.uses * 8 - entry.evidence.watch * 50 - entry.evidence.bad * 250;
      return score(right) - score(left) || left.name.localeCompare(right.name);
    });
}

export function racePrepProfileWithEvidenceDefaults(profile) {
  const normalized = normalizeRacePrepProfile(profile);
  if (normalized.fuelItemIds !== null) return normalized;
  // Evidence is decision support only. Race Prep never selects products on the athlete's behalf.
  return { ...normalized, fuelItemIds: [] };
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

function phasePlan(profile, recommendation) {
  const hydrationName = recommendation.hydrationProduct?.product || "";
  const duringFuel = recommendation.target.carbsPerHour > 0
    ? `${Math.round(recommendation.target.carbsPerHour)} g KH/h · insgesamt ca. ${Math.round(recommendation.target.carbsTotal)} g`
    : "Während des Rennens ist kein zusätzlicher Kohlenhydrat-Plan nötig.";
  const duringFluid = recommendation.target.fluidTotal > 0
    ? `Orientierung ${Math.round(recommendation.target.fluidLowPerHour)}–${Math.round(recommendation.target.fluidHighPerHour)} ml/h · Planbasis ${Math.round(recommendation.target.fluidPerHour)} ml/h / ca. ${Math.round(recommendation.target.fluidTotal)} ml · nach Durst, Bedingungen und Verpflegungsstellen${hydrationName ? ` · gewählter Drink: ${hydrationName}` : ""}`
    : hydrationName
      ? `Kein fixer DURING-Drink nötig. ${hydrationName} bleibt als gewählte Option für PRE, Hitze oder tatsächlichen Durst sichtbar.`
      : "Trinken nach Durst und Bedingungen; kein fixer DURING-Block erforderlich.";

  return [
    { key: "pre", label: "PRE", title: "Vor dem Start", detail: `Vertraute Mahlzeit und Getränke einplanen. Keine neuen Produkte am Renntag testen.${hydrationName ? ` Gewählte Getränkebasis: ${hydrationName}.` : ""}`, note: "PRE wird bewusst nicht in die DURING-Mengen eingerechnet." },
    { key: "during", label: "DURING", title: profile.format === "loop" ? "Pro Runde / Rennstunde" : "Während des Rennens", detail: `${duringFuel} · ${duringFluid}`, note: "Ein gemeinsames KH-Budget: Kohlenhydrate aus dem Drink werden vollständig angerechnet; Gels und Food schließen nur den verbleibenden Bedarf." },
    { key: "post", label: "POST", title: "Nach dem Ziel / Tagesblock", detail: "Recovery-Verpflegung separat bereitlegen und nach tatsächlichem Hunger, Durst und Verträglichkeit nutzen.", note: "POST wird im Review getrennt erfasst und verändert die DURING-Rate nicht." },
  ];
}

function consumptionEntryFromCatalog(entry, quantity) {
  return {
    fuelItemId: entry.id,
    product: entry.name,
    category: entry.category,
    quantity,
    unit: defaultConsumptionUnit(entry.item),
    carbs: quantity * entry.carbs,
    sodium: quantity * entry.sodium,
    caffeine: quantity * entry.caffeine,
    inventoryUnits: 0,
    stockUnit: entry.item?.stockUnit || "",
    availableInventory: 0,
    item: entry.item,
    evidenceLabel: entry.detail,
    evidenceTone: entry.tone,
  };
}

function consumptionEntryFromManual(entry, quantity) {
  return {
    fuelItemId: entry.id,
    product: entry.name,
    category: "Eigenes Lebensmittel",
    quantity,
    unit: "Portionen",
    carbs: quantity * numeric(entry.carbs),
    sodium: quantity * numeric(entry.sodium),
    caffeine: quantity * numeric(entry.caffeine),
    inventoryUnits: 0,
    stockUnit: "",
    availableInventory: 0,
    item: { id: entry.id, name: entry.name, carbs: numeric(entry.carbs), sodium: numeric(entry.sodium), caffeine: numeric(entry.caffeine) },
    evidenceLabel: "Manuell ergänzt · nicht automatisch als trainingsbewährt gewertet",
    evidenceTone: "base",
  };
}

function hydrationEntryFromCatalog(entry, fluidTotal) {
  if (!entry || !(fluidTotal > 0)) return null;
  const referenceVolumeMl = hydrationReferenceVolume(entry.item);
  if (!(referenceVolumeMl > 0)) return null;
  const nutrition = nutritionForConsumption({ quantity: fluidTotal, unit: "ml" }, entry.item);
  return {
    fuelItemId: entry.id,
    product: entry.name,
    category: entry.category,
    quantity: fluidTotal,
    unit: "ml",
    carbs: numeric(nutrition.carbs),
    sodium: numeric(nutrition.sodium),
    caffeine: numeric(nutrition.caffeine),
    inventoryUnits: 0,
    stockUnit: entry.item?.stockUnit || "",
    availableInventory: 0,
    item: entry.item,
    evidenceLabel: entry.detail,
    evidenceTone: entry.tone,
    hydration: true,
  };
}

function buildEvidenceConsumption(targetCarbs, selectedCatalog, manualItems) {
  const sources = [
    ...selectedCatalog.filter((entry) => entry.carbs > 0).map((entry) => ({ ...entry, source: "catalog", unitCarbs: numeric(entry.carbs) })),
    ...manualItems.filter((entry) => numeric(entry.carbs) > 0).map((entry) => ({ ...entry, source: "manual", unitCarbs: numeric(entry.carbs) })),
  ];
  if (!(targetCarbs > 0) || !sources.length) return [];

  // Do not add a whole gel/portion just to close a tiny mathematical remainder.
  // The selected drink has already been counted against the same carbohydrate budget.
  const smallestUnit = Math.min(...sources.map((entry) => entry.unitCarbs).filter((value) => value > 0));
  if (targetCarbs <= Math.max(5, smallestUnit * 0.2)) return [];

  const counts = new Map();
  let planned = 0;
  let index = 0;
  const targetLow = Math.max(0, targetCarbs * 0.95);
  const safetyLimit = 5000;

  while (planned < targetLow && index < safetyLimit) {
    const remaining = Math.max(0, targetCarbs - planned);
    const rotationSource = sources[index % sources.length];
    const bestFit = [...sources]
      .sort((left, right) => {
        const leftDelta = Math.abs(remaining - left.unitCarbs);
        const rightDelta = Math.abs(remaining - right.unitCarbs);
        return leftDelta - rightDelta;
      })[0];
    const source = remaining <= smallestUnit * 1.5 ? bestFit : rotationSource;
    if (!(source?.unitCarbs > 0)) break;
    counts.set(source.id, (counts.get(source.id) || 0) + 1);
    planned += source.unitCarbs;
    index += 1;
  }

  return sources
    .filter((source) => counts.get(source.id))
    .map((source) => source.source === "catalog"
      ? consumptionEntryFromCatalog(source, counts.get(source.id))
      : consumptionEntryFromManual(source, counts.get(source.id)));
}

function carbohydrateBudget(target, hydrationEntry, fuelConsume, durationMinutes) {
  const targetTotal = numeric(target?.carbsTotal);
  const drinkCarbs = numeric(hydrationEntry?.carbs);
  const fuelCarbs = fuelConsume.reduce((sum, entry) => sum + numeric(entry.carbs), 0);
  const plannedTotal = drinkCarbs + fuelCarbs;
  const durationHours = numeric(durationMinutes) / 60;
  return {
    targetTotal,
    targetPerHour: numeric(target?.carbsPerHour),
    drinkCarbs,
    fuelCarbs,
    plannedTotal,
    plannedPerHour: durationHours > 0 ? plannedTotal / durationHours : 0,
    remainingBeforeFuel: Math.max(0, targetTotal - drinkCarbs),
    delta: plannedTotal - targetTotal,
    coveragePercent: targetTotal > 0 ? plannedTotal / targetTotal * 100 : 100,
  };
}

function selectionConfidence(selectedCatalog, manualItems) {
  if (selectedCatalog.length > 0 && selectedCatalog.every((entry) => entry.tone === "good") && manualItems.length === 0) {
    return { key: "training-proven", label: "Trainingserprobt", detail: "Alle eingeplanten Fuel-Quellen wurden in deinen Reviews positiv bestätigt." };
  }
  if (selectedCatalog.some((entry) => entry.tone === "good")) {
    return { key: "personal", label: "Mit Trainingsbelegen", detail: "Mindestens eine eingeplante Fuel-Quelle ist aus deinen Reviews positiv belegt." };
  }
  if (manualItems.length > 0) {
    return { key: "manual", label: "Manuell ergänzt", detail: "Die Auswahl enthält eigene Lebensmittel ohne automatische Trainingsfreigabe." };
  }
  return { key: "open", label: "Fuel-Basis offen", detail: "Für die automatische Race-Planung fehlt noch eine ausgewählte, getestete Fuel-Quelle." };
}

export function buildRacePrepPlan({ profile: inputProfile, state = {} } = {}) {
  const profile = normalizeRacePrepProfile(inputProfile);
  if (!(profile.durationMinutes > 0)) return { valid: false, profile, error: "Für die Verpflegungsplanung fehlt eine erwartete Renndauer." };
  if (profile.format === "distance" && !(profile.distanceKm > 0)) return { valid: false, profile, error: "Für ein Distanzrennen fehlt die Distanz." };

  const workout = syntheticRaceWorkout(profile);
  const baseRecommendation = fuelRecommendationForWorkout({
    workout,
    fuel: (Array.isArray(state.fuel) ? state.fuel : []).map((item) => ({ ...item, quantity: 9999 })),
    activities: state.activities,
    reviews: state.reviews,
    mode: "race",
  });
  const evidenceCatalog = racePrepFuelEvidence(state);
  const effectiveFuelItemIds = profile.fuelItemIds === null
    ? racePrepProfileWithEvidenceDefaults(profile, state).fuelItemIds
    : profile.fuelItemIds;
  const selectedCatalog = effectiveFuelItemIds.map((id) => evidenceCatalog.find((entry) => entry.id === String(id))).filter(Boolean);
  const selectedHydration = selectedCatalog.find((entry) => entry.role === "hydration") || null;
  const selectedFuelCatalog = selectedCatalog.filter((entry) => entry.role !== "hydration");
  const manualItems = profile.manualFuelItems || [];
  const hydrationEntry = hydrationEntryFromCatalog(selectedHydration, baseRecommendation.target.fluidTotal);
  const carbTargetAfterDrink = Math.max(0, baseRecommendation.target.carbsTotal - numeric(hydrationEntry?.carbs));
  const fuelConsume = buildEvidenceConsumption(carbTargetAfterDrink, selectedFuelCatalog, manualItems);
  const carbBudget = carbohydrateBudget(baseRecommendation.target, hydrationEntry, fuelConsume, profile.durationMinutes);
  const consume = [...(hydrationEntry ? [hydrationEntry] : []), ...fuelConsume];
  const confidence = selectionConfidence(selectedCatalog, manualItems);
  const hydrationProduct = selectedHydration ? {
    id: selectedHydration.id,
    product: selectedHydration.name,
    category: selectedHydration.category,
    evidenceLabel: selectedHydration.detail,
    evidenceTone: selectedHydration.tone,
    referenceVolumeMl: hydrationReferenceVolume(selectedHydration.item),
  } : null;
  const warnings = [];

  if (profile.durationEstimated) warnings.push(`Renndauer ist aktuell geschätzt (${formatDuration(profile.durationMinutes)}). Für den finalen Plan bitte die erwartete Dauer anpassen.`);
  selectedCatalog.filter((entry) => entry.tone === "bad").forEach((entry) => warnings.push(`${entry.name}: im Training bereits problematisch bewertet. Nur bewusst und nicht automatisch als sichere Race-Basis verwenden.`));
  selectedCatalog.filter((entry) => entry.tone === "watch").forEach((entry) => warnings.push(`${entry.name}: bisher nur auffällige Aufnahme dokumentiert.`));
  selectedCatalog.filter((entry) => numeric(entry.item?.quantity) <= 0).forEach((entry) => warnings.push(`${entry.name}: aktuell nicht im Bestand. Die Auswahl bleibt erlaubt, damit du das Produkt bewusst einplanen oder vorher besorgen kannst.`));
  if (baseRecommendation.target.carbsTotal > 0 && fuelConsume.length === 0 && numeric(hydrationEntry?.carbs) < baseRecommendation.target.carbsTotal * 0.8) warnings.push("Für dieses Rennen ist DURING-Fuel sinnvoll, aber es ist noch keine geeignete Fuel-Quelle ausgewählt oder der gewählte Drink deckt das KH-Ziel nicht ausreichend. Wähle ein Gel, einen Riegel oder ein anderes Fuel-Produkt dazu.");
  if (baseRecommendation.target.carbsTotal > 0 && carbBudget.coveragePercent < 80) warnings.push(`KH-Bilanz noch offen: geplant sind ca. ${Math.round(carbBudget.plannedTotal)} von ${Math.round(carbBudget.targetTotal)} g. Getränk und Fuel werden gemeinsam gegen dasselbe DURING-Ziel gerechnet.`);
  if (baseRecommendation.target.carbsTotal > 0 && carbBudget.coveragePercent > 125) warnings.push(`KH-Bilanz deutlich über Ziel: geplant sind ca. ${Math.round(carbBudget.plannedTotal)} statt ${Math.round(carbBudget.targetTotal)} g. Prüfe Auswahl oder Portionsgrößen.`);
  if (baseRecommendation.target.fluidTotal > 0 && !selectedHydration) warnings.push("Für die Trinkstrategie ist noch kein Drink-/Elektrolytprodukt ausgewählt. Die ml sind nur eine Planbasis; wähle dein Getränk bewusst aus dem Fuel Lab.");
  if (baseRecommendation.target.fluidTotal > 0 && selectedHydration && !hydrationEntry) warnings.push(`${selectedHydration.name}: Als Drink/Elektrolyt ausgewählt, aber das Mischvolumen pro Portion fehlt. Hinterlege im Fuel Lab den Mischvorschlag, damit Menge und Nährwerte korrekt berechnet werden.`);
  if (profile.durationMinutes >= 6 * 60 && fuelConsume.length === 1) warnings.push("Langes Rennen: Die Strategie hängt aktuell an nur einer festen Fuel-Quelle. Ergänze eine zweite im Training verträgliche Option für Rotation und Geschmackswechsel.");

  const recommendation = {
    ...baseRecommendation,
    consume,
    hydrationProduct,
    pack: [],
    warnings,
    confidence,
    carbBudget,
  };
  const strategy = raceFuelStrategy({ workout, recommendation, reviews: state.reviews });

  return {
    valid: true,
    profile,
    workout,
    recommendation,
    strategy,
    phases: phasePlan(profile, recommendation),
    evidenceCatalog,
    effectiveFuelItemIds,
    selectedCatalog,
    manualItems,
    warnings: [...new Set([...warnings, ...(strategy?.warnings || [])])],
    pack: [],
    shopping: [],
    shoppingNeeded: [],
    stockReady: true,
    summary: {
      durationLabel: formatDuration(profile.durationMinutes),
      distanceLabel: profile.distanceKm > 0 ? `${profile.distanceKm.toLocaleString("de-DE")} km` : "offene Distanz",
      carbsTotal: Math.round(recommendation.target.carbsTotal),
      carbsPerHour: Math.round(recommendation.target.carbsPerHour),
      carbsDrinkTotal: Math.round(carbBudget.drinkCarbs),
      carbsFuelTotal: Math.round(carbBudget.fuelCarbs),
      carbsPlannedTotal: Math.round(carbBudget.plannedTotal),
      carbsPlannedPerHour: Math.round(carbBudget.plannedPerHour),
      carbCoveragePercent: Math.round(carbBudget.coveragePercent),
      fluidTotal: Math.round(recommendation.target.fluidTotal),
      fluidPerHour: Math.round(recommendation.target.fluidPerHour),
      schedulePoints: strategy?.rows?.length || 0,
      selectedFuelSources: new Set(consume.map((entry) => entry.fuelItemId)).size,
    },
  };
}
