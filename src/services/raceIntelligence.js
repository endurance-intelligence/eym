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
  return 0;
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

export function raceEventsFromState(state = {}) {
  const mission = state.mission || {};
  const raw = [
    ...(Array.isArray(mission.milestones) ? mission.milestones : []),
    ...(Array.isArray(mission.events) ? mission.events : []),
    ...(mission.id || mission.name ? [mission] : []),
  ];
  const seen = new Set();
  return raw.filter((event) => {
    if (!event || typeof event !== "object") return false;
    const key = raceEventKey(event);
    if (seen.has(key)) return false;
    seen.add(key);
    return Boolean(event.date || event.name || event.title);
  }).sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
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
  const reviews = Object.values(state.reviews || {});
  const values = reviews.map((review) => {
    const explicit = positive(review.hydrationMlPerHour || review.drinkMlPerHour);
    if (explicit) return explicit;
    const drink = positive(review.drinkMl || review.nutritionFluidTotal);
    const hours = reviewHours(review);
    return drink && hours > 0 ? drink / hours : 0;
  }).filter((value) => value >= 200 && value <= 1500);
  return {
    count: values.length,
    median: median(values),
  };
}

export function raceFuelTargets({ event = {}, state = {}, temperatureC = null } = {}) {
  const hours = raceDurationHours(event);
  const evidence = raceFuelEvidence(state);
  let carbLow = 0;
  let carbHigh = 0;
  let carbReason = "Für kurze Rennen ist DURING-Fuel optional.";

  if (hours >= 2.5 || officialRaceDistance(event) >= 30) {
    if (evidence.proven70) {
      carbLow = 70;
      carbHigh = 90;
      carbReason = `${evidence.count} gut verträgliche Fuel-Reviews stützen einen höheren Ultra-Korridor.`;
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
      reason: hydration.count
        ? `Orientierung aus ${hydration.count} dokumentierten Trink-Reviews; Wetter und Durst dürfen den Wert verschieben.`
        : "Startkorridor ohne persönliche Schweißmessung. Kein Trinkzwang pro Runde.",
      evidence: hydration,
    },
  };
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
  const rounds = Math.max(0, Math.round(positive(event.planningHorizonRounds || event.rounds || event.laps || event.profile?.planningHorizonRounds)));
  return base.map((phase, index) => {
    const low = targets.carbs.low ? Math.max(30, targets.carbs.low + phase.carbDelta) : 0;
    const high = targets.carbs.high ? Math.max(low, targets.carbs.high + (index === 0 ? -10 : 0)) : 0;
    const roundFrom = rounds ? Math.max(1, Math.floor(phase.from * rounds) + 1) : null;
    const roundTo = rounds ? Math.max(roundFrom, Math.ceil(phase.to * rounds)) : null;
    return {
      ...phase,
      title: rounds ? `Runde ${roundFrom}–${roundTo}` : `${Math.round(phase.from * 100)}–${Math.round(phase.to * 100)} %`,
      carbLabel: high ? `${low}–${high} g KH/h` : "nach Bedarf",
      hydrationLabel: targets.hydration.label,
      format,
    };
  });
}

export function defaultRaceSupplyPlan() {
  return {
    mode: "hybrid",
    organizerResources: ["water", "iso", "cola", "banana", "savory"],
    organizerGelApproved: false,
    aidStations: [],
    note: "",
  };
}

export function normalizeRaceSupplyPlan(value = {}) {
  const defaults = defaultRaceSupplyPlan();
  const resources = Array.isArray(value.organizerResources)
    ? value.organizerResources.filter((key) => RESOURCE_LABELS[key])
    : defaults.organizerResources;
  return {
    ...defaults,
    ...value,
    mode: ["own", "vp", "hybrid"].includes(value.mode) ? value.mode : defaults.mode,
    organizerResources: resources,
    organizerGelApproved: Boolean(value.organizerGelApproved),
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

export function resourceLabel(key) {
  return RESOURCE_LABELS[key] || key;
}

export function resourceOptions() {
  return Object.entries(RESOURCE_LABELS).map(([value, label]) => ({ value, label }));
}

export function supplyModeCopy(mode) {
  if (mode === "own") return "Eigene Versorgung ist die Primärquelle. VPs dienen nur als Backup.";
  if (mode === "vp") return "VP-Angebot trägt die Basis. Eigene, getestete Gels bleiben die verlässliche Reserve.";
  return "Eigene, getestete Gels bilden die Basis; Wasser, Drinks und Essen können gezielt vom VP kommen.";
}

export function aidStationSegments(event = {}, plan = {}) {
  const distance = officialRaceDistance(event);
  const stations = normalizeRaceSupplyPlan(plan).aidStations.filter((station) => station.km > 0);
  const points = [{ km: 0, name: "Start" }, ...stations];
  if (distance > 0) points.push({ km: distance, name: "Ziel" });
  return points.slice(0, -1).map((point, index) => {
    const next = points[index + 1];
    const delta = Math.max(0, next.km - point.km);
    return {
      from: point.name,
      to: next.name,
      km: delta,
      carryHint: delta >= 15 ? "langer Abschnitt · Flüssigkeit und Fuel bewusst auffüllen"
        : delta >= 8 ? "mittlerer Abschnitt · normalen Carry planen"
          : "kurzer Abschnitt · keine unnötige Reserve mitschleppen",
    };
  });
}
