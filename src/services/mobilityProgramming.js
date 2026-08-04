import { activityTimestamp } from "./activityUtils.js";

const DAY_MS = 86400000;

function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function textFor(item = {}) {
  return `${item.title || ""} ${item.name || ""} ${item.type || ""} ${item.notes || ""}`.toLocaleLowerCase("de-DE");
}

function sessionKind(item = {}) {
  const text = textFor(item);
  if (/track|intervall|schwelle|tempo|interval/.test(text)) return "track";
  if (/fußball|football|soccer/.test(text)) return "football";
  if (/longrun|long run|langer lauf|backyard|loop|ultra/.test(text) || numeric(item.distance) >= 18 || numeric(item.duration) >= 120) return "long";
  if (/ruhetag|rest|erholung/.test(text)) return "rest";
  if (/easy|locker|zone.?2|recovery/.test(text)) return "easy";
  return "other";
}

function plannedTime(item, dateKey) {
  const time = String(item?.time || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!time) return null;
  const date = new Date(`${dateKey}T${String(time[1]).padStart(2, "0")}:${time[2]}:00`);
  return Number.isFinite(date.getTime()) ? date : null;
}

function planContext(plan = [], now = new Date()) {
  const todayKey = localDateKey(now);
  const tomorrowKey = localDateKey(addDays(now, 1));
  const active = (Array.isArray(plan) ? plan : []).filter((item) => !item.archived && !item.completed && !item.missedReason);
  const today = active.filter((item) => item.date === todayKey && !/stabi|mobility|mobilität|kraft/i.test(textFor(item)));
  const tomorrow = active.filter((item) => item.date === tomorrowKey && !/stabi|mobility|mobilität|kraft/i.test(textFor(item)));
  const ranked = [...today, ...tomorrow].map((item) => ({
    item,
    dateKey: item.date,
    kind: sessionKind(item),
    plannedAt: plannedTime(item, item.date),
  })).sort((a, b) => {
    const order = { track: 0, football: 1, long: 2, easy: 3, rest: 4, other: 5 };
    return (order[a.kind] ?? 9) - (order[b.kind] ?? 9);
  });
  const primary = ranked[0] || null;
  if (!primary) return { kind: "none", timing: "none", title: "Kein Belastungstermin direkt angrenzend" };
  const isToday = primary.dateKey === todayKey;
  const timing = isToday
    ? primary.plannedAt && primary.plannedAt.getTime() <= now.getTime() ? "after" : "before"
    : "tomorrow";
  return {
    ...primary,
    timing,
    title: primary.item.title || primary.item.type || "Training",
  };
}

function latestRelevantActivity(activities = [], now = new Date()) {
  const cutoff = now.getTime() - 36 * 60 * 60 * 1000;
  return (Array.isArray(activities) ? activities : [])
    .filter((activity) => activityTimestamp(activity).getTime() >= cutoff)
    .sort((a, b) => activityTimestamp(b) - activityTimestamp(a))[0] || null;
}

function recentReviewedActivities(activities = [], reviews = {}, now = new Date()) {
  const cutoff = now.getTime() - 14 * DAY_MS;
  return (Array.isArray(activities) ? activities : [])
    .filter((activity) => activityTimestamp(activity).getTime() >= cutoff && reviews?.[activity.id])
    .sort((a, b) => activityTimestamp(b) - activityTimestamp(a))
    .slice(0, 5)
    .map((activity) => ({ activity, review: reviews[activity.id] || {} }));
}

function reviewSignals(reviewed = []) {
  const signals = {
    lowEnergy: 0,
    tiredLegs: 0,
    pain: 0,
    cramps: 0,
    soreness: 0,
    back: 0,
    highLoad: 0,
  };
  reviewed.forEach(({ review }) => {
    const symptoms = Array.isArray(review.legSymptoms) ? review.legSymptoms : [];
    if (numeric(review.energy, 10) <= 5) signals.lowEnergy += 1;
    if (numeric(review.legs, 10) <= 5 || symptoms.includes("Schwere Beine")) signals.tiredLegs += 1;
    if (symptoms.includes("Schmerzen")) signals.pain += 1;
    if (symptoms.includes("Krämpfe")) signals.cramps += 1;
    if (symptoms.includes("Muskelkater")) signals.soreness += 1;
    if (numeric(review.backSoreness) >= 5) signals.back += 1;
    if (numeric(review.rpe) >= 8) signals.highLoad += 1;
  });
  return signals;
}

const CONTEXT_PROFILES = {
  track: {
    focusAreaIds: ["ankle", "hips", "core"],
    before: {
      title: "Track-Vorbereitung: beweglich und stabil, nicht müde",
      reason: "Heute steht eine schnelle oder technisch anspruchsvolle Laufeinheit an. Der Coach priorisiert Sprunggelenk, Hüfte und kontrollierte Rumpfaktivierung und reduziert ermüdende Kraftreize.",
      preferredExerciseIds: ["ankle-circles", "knee-to-wall", "hip-flexor-stretch", "dead-bug", "bird-dog", "glute-bridge"],
      excludedExerciseIds: ["slow-mountain-climber", "goblet-squat", "weighted-rdl"],
    },
    after: {
      title: "Nach dem Track: Hüfte, Wade und ruhiger Core",
      reason: "Die schnelle Einheit liegt bereits in den Beinen. Der Coach hält die Auswahl regenerativ und vermeidet zusätzliche harte Bein- oder Rumpfbelastung.",
      preferredExerciseIds: ["cat-cow", "ankle-pumps", "knee-to-wall", "adductor-rockback", "dead-bug", "child-pose-breathing"],
      excludedExerciseIds: ["slow-mountain-climber", "goblet-squat", "weighted-rdl", "single-leg-calf-raise"],
    },
    tomorrow: {
      title: "Morgen Track: Aktivierung mit Reserven",
      reason: "Der nächste Qualitätstag ist nah. Heute trainiert der Coach Beweglichkeit und Stabilität, ohne die Beine vorzuermüden.",
      preferredExerciseIds: ["ankle-circles", "knee-to-wall", "hip-flexor-stretch", "dead-bug", "bird-dog"],
      excludedExerciseIds: ["slow-mountain-climber", "goblet-squat", "weighted-rdl"],
    },
  },
  football: {
    focusAreaIds: ["adductors", "ankle", "hips"],
    before: {
      title: "Fußball-Vorbereitung: Adduktoren, Hüfte und Sprunggelenk",
      reason: "Richtungswechsel und Sprints fordern Adduktoren, Hüfte und Sprunggelenke. Der Coach aktiviert diese Bereiche, ohne vorher schwere Kraftarbeit zu setzen.",
      preferredExerciseIds: ["adductor-rockback", "ankle-circles", "knee-to-wall", "glute-bridge", "clamshell", "dead-bug"],
      excludedExerciseIds: ["slow-mountain-climber", "goblet-squat", "weighted-rdl"],
    },
    after: {
      title: "Nach Fußball: Adduktoren und Sprunggelenke beruhigen",
      reason: "Nach Richtungswechseln und Sprints setzt der Coach auf kontrollierte Mobilität, Rumpfstabilität und eine ruhige Hüftarbeit.",
      preferredExerciseIds: ["adductor-rockback", "ankle-pumps", "cat-cow", "dead-bug", "child-pose-breathing"],
      excludedExerciseIds: ["slow-mountain-climber", "goblet-squat", "weighted-rdl", "step-up"],
    },
    tomorrow: {
      title: "Morgen Fußball: stabile Achse, frische Beine",
      reason: "Der Coach bereitet Hüfte, Adduktoren und Sprunggelenke vor, hält die muskuläre Ermüdung aber gering.",
      preferredExerciseIds: ["adductor-rockback", "ankle-circles", "clamshell", "dead-bug", "single-leg-balance"],
      excludedExerciseIds: ["slow-mountain-climber", "goblet-squat", "weighted-rdl"],
    },
  },
  long: {
    focusAreaIds: ["hips", "ankle", "core"],
    before: {
      title: "Longrun-Vorbereitung: Stabilität ohne Vorermüdung",
      reason: "Vor dem langen Lauf bleiben Hüfte, Sprunggelenk und Rumpf aktiv, während schwere oder hochdynamische Übungen bewusst entfallen.",
      preferredExerciseIds: ["ankle-circles", "knee-to-wall", "hip-flexor-stretch", "dead-bug", "bird-dog", "glute-bridge"],
      excludedExerciseIds: ["slow-mountain-climber", "goblet-squat", "weighted-rdl", "single-leg-calf-raise"],
    },
    after: {
      title: "Nach dem Longrun: Beweglichkeit und regenerative Rumpfkontrolle",
      reason: "Zeit auf den Beinen wurde bereits trainiert. Der Coach priorisiert Hüfte, Rücken und Sprunggelenk und reduziert zusätzliche Kraftbelastung.",
      preferredExerciseIds: ["cat-cow", "ankle-pumps", "adductor-rockback", "hip-flexor-stretch", "dead-bug", "child-pose-breathing"],
      excludedExerciseIds: ["slow-mountain-climber", "goblet-squat", "weighted-rdl", "step-up", "single-leg-calf-raise"],
    },
    tomorrow: {
      title: "Morgen Longrun: Mobilität mit frischen Beinen",
      reason: "Die Auswahl unterstützt den langen Lauf, ohne heute unnötige Ermüdung aufzubauen.",
      preferredExerciseIds: ["ankle-circles", "knee-to-wall", "hip-flexor-stretch", "dead-bug", "bird-dog"],
      excludedExerciseIds: ["slow-mountain-climber", "goblet-squat", "weighted-rdl"],
    },
  },
};

function historySignals(history = []) {
  const recent = (Array.isArray(history) ? history : []).slice(0, 6);
  const poor = recent.filter((entry) => numeric(entry.fitScore) > 0 && numeric(entry.fitScore) <= 4);
  const worse = recent.filter((entry) => entry.zoneResponse === "worse");
  return { poor: poor.length, worse: worse.length };
}

export function mergeMobilityFocusAreas(primary = [], secondary = [], limit = 3) {
  return unique([...(primary || []), ...(secondary || [])]).slice(0, Math.max(1, numeric(limit, 3)));
}

export function buildAdaptiveMobilityProfile({
  activities = [],
  reviews = {},
  plan = [],
  history = [],
  now = new Date(),
} = {}) {
  const context = planContext(plan, now);
  const reviewed = recentReviewedActivities(activities, reviews, now);
  const signals = reviewSignals(reviewed);
  const historyState = historySignals(history);
  const lastActivity = latestRelevantActivity(activities, now);
  const lastKind = lastActivity ? sessionKind(lastActivity) : "none";
  const base = CONTEXT_PROFILES[context.kind];
  const timingProfile = base?.[context.timing] || null;
  let focusAreaIds = [...(base?.focusAreaIds || ["core", "hips", "ankle"])]
  let preferredExerciseIds = [...(timingProfile?.preferredExerciseIds || ["dead-bug", "bird-dog", "ankle-circles", "glute-bridge"])]
  let excludedExerciseIds = [...(timingProfile?.excludedExerciseIds || [])]
  let condition = "normal";
  let title = timingProfile?.title || "Ausgewogene Läufer-Stabilität";
  let reason = timingProfile?.reason || "Der Coach verbindet Core, Hüfte und Sprunggelenk zu einer ausgewogenen, läuferspezifischen Einheit.";
  const factors = [];

  if (context.kind !== "none") factors.push(`${context.title}: ${context.timing === "after" ? "bereits absolviert" : context.timing === "tomorrow" ? "morgen geplant" : "heute noch geplant"}`);
  if (lastKind === "track" || lastKind === "football" || lastKind === "long") factors.push(`Letzte Belastung: ${lastActivity?.name || lastKind}`);

  if (signals.pain > 0) {
    condition = "tired";
    title = "Beschwerden gemeldet: nur ruhige, kontrollierte Bewegungsqualität";
    reason = "Mindestens ein aktuelles Review enthält Schmerzen. Der Coach reduziert die Auswahl auf niedrige bis mittlere Intensität. Schmerz ist kein Trainingsziel; auffällige Übungen bitte abbrechen.";
    focusAreaIds = mergeMobilityFocusAreas(["mobility", "back", "core"], focusAreaIds);
    preferredExerciseIds = unique(["cat-cow", "dead-bug", "bird-dog", "ankle-pumps", "child-pose-breathing", ...preferredExerciseIds]);
    excludedExerciseIds = unique(["slow-mountain-climber", "goblet-squat", "weighted-rdl", "step-up", "single-leg-calf-raise", ...excludedExerciseIds]);
    factors.push("Review-Signal: Schmerzen");
  } else if (signals.lowEnergy >= 1 || signals.tiredLegs >= 1 || signals.soreness >= 1 || signals.highLoad >= 2) {
    condition = "tired";
    title = timingProfile?.title || "Regenerative Stabi: Bewegungsqualität vor Belastung";
    reason = `${timingProfile?.reason ? `${timingProfile.reason} ` : ""}Aktuelle Reviews melden müde Beine, Muskelkater oder niedrige Energie. Deshalb bleibt die Einheit ruhig und technisch kontrolliert.`;
    focusAreaIds = mergeMobilityFocusAreas(["mobility", "hips", "ankle"], focusAreaIds);
    preferredExerciseIds = unique(["cat-cow", "ankle-pumps", "adductor-rockback", "dead-bug", "bird-dog", "child-pose-breathing", ...preferredExerciseIds]);
    excludedExerciseIds = unique(["slow-mountain-climber", "goblet-squat", "weighted-rdl", ...excludedExerciseIds]);
    if (signals.tiredLegs) factors.push("Review-Signal: müde oder schwere Beine");
    if (signals.lowEnergy) factors.push("Review-Signal: niedrigere Energie");
    if (signals.soreness) factors.push("Review-Signal: Muskelkater");
  } else if (reviewed.length && reviewed.every(({ review }) => numeric(review.legs, 7) >= 7 && numeric(review.energy, 7) >= 7) && context.kind === "rest") {
    condition = "fresh";
    title = "Freier Tag: vollständige Läufer-Stabilität mit Kraftanteil";
    reason = "Die letzten Reviews sind stabil und heute liegt kein harter Laufreiz an. Der Coach darf deshalb neben Mobilität auch kontrollierte Kraft- und Beinachsenarbeit einbauen.";
    focusAreaIds = mergeMobilityFocusAreas(["core", "hips", "strength"], focusAreaIds);
    preferredExerciseIds = unique(["dead-bug", "side-plank", "glute-bridge", "step-up", "suitcase-carry", ...preferredExerciseIds]);
    factors.push("Stabile Reviews und freier Trainingstag");
  }

  if (signals.back > 0) {
    focusAreaIds = mergeMobilityFocusAreas(["back", "core", "mobility"], focusAreaIds);
    preferredExerciseIds = unique(["cat-cow", "bird-dog", "thoracic-rotation", "dead-bug", "child-pose-breathing", ...preferredExerciseIds]);
    excludedExerciseIds = unique(["weighted-rdl", ...excludedExerciseIds]);
    factors.push("Review-Signal: Rücken/Nacken belastet");
  }
  if (signals.cramps > 0) {
    focusAreaIds = mergeMobilityFocusAreas(["ankle", "mobility"], focusAreaIds);
    preferredExerciseIds = unique(["ankle-pumps", "ankle-circles", "knee-to-wall", ...preferredExerciseIds]);
    factors.push("Review-Signal: Krämpfe");
  }
  if (historyState.poor >= 2 || historyState.worse >= 1) {
    condition = "tired";
    excludedExerciseIds = unique(["slow-mountain-climber", "goblet-squat", "weighted-rdl", ...excludedExerciseIds]);
    factors.push("Letzte Mobility-Auswahl wurde schwach bewertet");
  }

  const safetyMode = signals.pain > 0;
  return {
    id: `adaptive-${localDateKey(now)}-${context.kind}-${context.timing}-${condition}-${signals.pain}-${signals.tiredLegs}-${signals.back}`,
    title,
    reason,
    condition,
    focusAreaIds: unique(focusAreaIds).slice(0, 3),
    preferredExerciseIds: unique(preferredExerciseIds),
    excludedExerciseIds: unique(excludedExerciseIds),
    factors: unique(factors),
    safetyMode,
    context: {
      kind: context.kind,
      timing: context.timing,
      title: context.title,
    },
    reviewedCount: reviewed.length,
  };
}

export function adaptiveExerciseReason(profile, item) {
  if (!profile || !item) return "";
  if (profile.preferredExerciseIds?.includes(item.id)) {
    const matched = (item.focusAreas || []).find((focusId) => profile.focusAreaIds?.includes(focusId));
    const label = {
      core: "Rumpfkontrolle",
      hips: "Hüftstabilität",
      ankle: "Sprunggelenk und Fuß",
      adductors: "Adduktoren",
      back: "Rückenbeweglichkeit",
      mobility: "Bewegungsqualität",
      "knee-axis": "Beinachse",
      balance: "Koordination",
      strength: "kontrollierte Kraft",
    }[matched] || "heutigen Schwerpunkt";
    return `Passt zum Coach-Fokus: ${label}.`;
  }
  const matched = (item.focusAreas || []).find((focusId) => profile.focusAreaIds?.includes(focusId));
  if (matched) return "Ergänzt den heutigen Coach-Schwerpunkt, ohne den Basisblock einseitig zu machen.";
  return "Sichert die ausgewogene läuferspezifische Basis der Einheit.";
}
