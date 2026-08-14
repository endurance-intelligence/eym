import { activityDate } from "./activityUtils.js";

export const WORKOUT_ROLE_DEFINITIONS = {
  key: { key: "key", label: "Schlüsselreiz", icon: "🔑", tone: "key" },
  quality: { key: "quality", label: "Qualität", icon: "⚡", tone: "quality" },
  long: { key: "long", label: "Lang / spezifisch", icon: "⏱", tone: "long" },
  easy: { key: "easy", label: "Locker", icon: "🟢", tone: "easy" },
  steady: { key: "steady", label: "Ruhig", icon: "🔵", tone: "steady" },
  support: { key: "support", label: "Ergänzung", icon: "🧩", tone: "support" },
  additional: { key: "additional", label: "Zusatzbelastung", icon: "↗", tone: "additional" },
  intense: { key: "intense", label: "Intensiv", icon: "⚡", tone: "quality" },
};

const ROLE_REASON_BY_SESSION = {
  run_walk_progression: "Die Einheit entwickelt deine belastbare Laufdauer schrittweise und kontrolliert.",
  controlled_steady: "Die Einheit stabilisiert ein kontrolliertes, gleichmäßiges Arbeitstempo.",
  benchmark: "Die Einheit liefert einen gezielten Leistungsanker für die weitere Trainingssteuerung.",
  vo2: "Die schnellen Abschnitte setzen einen gezielten VO₂max- und Laufökonomie-Reiz.",
  threshold: "Die Einheit entwickelt deine Schwelle und die Fähigkeit, ein hohes Tempo kontrolliert zu halten.",
  race_pace_intervals: "Die Intervalle trainieren gezielt das Tempo und die Belastungsstruktur deines Wettkampfs.",
  half_marathon_pace: "Die Einheit verbindet aerobe Ausdauer mit deinem geplanten Halbmarathon-Arbeitstempo.",
  marathon_pace: "Die Einheit trainiert Marathon-Arbeitstempo unter zunehmender Ermüdung.",
  back_to_back: "Die Einheit trainiert Belastungsverträglichkeit an aufeinanderfolgenden Tagen.",
  existing_quality: "Der feste Qualitätstermin erhält deinen Temporeiz und wird in der Wochenbelastung geschützt.",
  run_walk_long: "Die Einheit verlängert die belastbare Zeit auf den Beinen mit kontrollierten Gehanteilen.",
  run_walk_easy: "Die Einheit baut ruhige Laufverträglichkeit mit kontrollierten Gehanteilen auf.",
  course_specific_long_run: "Die Einheit trainiert zielspezifische Dauer, Ablauf, Verpflegung und Ermüdungsresistenz.",
  long_run: "Der lange Lauf entwickelt aerobe Ausdauer, muskuläre Robustheit und Zeit auf den Beinen.",
};

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function durationMinutes(item = {}) {
  if (numeric(item.durationSeconds) > 0) return numeric(item.durationSeconds) / 60;
  return numeric(item.duration);
}

function normalizedText(item = {}) {
  return `${item.title || ""} ${item.name || ""} ${item.type || ""} ${item.sportType || ""} ${item.category || ""} ${item.notes || ""} ${item.description || ""}`.toLowerCase();
}

function sportFamily(item = {}) {
  const text = normalizedText(item);
  if (/fußball|fussball|football|soccer/.test(text)) return "football";
  if (/rennrad|road bike|cycling|radfahren|rad fahren|ride|gravel|mountainbike|mtb|e-?bike/.test(text)) return "cycling";
  if (/rudern|rowing|rowerg|indoor row/.test(text)) return "rowing";
  if (/stabi|mobility|kraft|strength|gym|core|yoga|pilates/.test(text)) return "support";
  if (/schwimm|swim/.test(text)) return "swimming";
  if (/lauf|run|track|intervall|interval|schwelle|threshold|tempo|backyard|ultra|marathon|jog/.test(text) || String(item.category || "").toLowerCase() === "running") return "running";
  return "other";
}

function isQuality(item = {}) {
  const text = normalizedText(item);
  const sessionRole = String(item.goalSessionRole || "");
  return /intervall|interval|track|schwelle|threshold|tempo|sprint|fahrtspiel|vo2|race pace|wettkampfpace/.test(text)
    || ["benchmark", "vo2", "threshold", "race_pace_intervals", "half_marathon_pace", "marathon_pace", "existing_quality"].includes(sessionRole);
}

function isLongSpecific(item = {}) {
  const text = normalizedText(item);
  const sessionRole = String(item.goalSessionRole || "");
  return numeric(item.distance) >= 20
    || durationMinutes(item) >= 120
    || /longrun|long run|backyard|ultra|loop|rundenroutine|pausenroutine|zeit auf den beinen|zielspezif/.test(text)
    || ["back_to_back", "run_walk_long", "course_specific_long_run", "long_run"].includes(sessionRole);
}

function isEasy(item = {}) {
  return /easy|locker|recovery|regeneration|grundlage|ga1|zone\s*2|z2/.test(normalizedText(item));
}

function sourceTokens(item = {}) {
  return normalizedText(item)
    .replace(/[^a-z0-9äöüß]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 5);
}

function sameSport(left = {}, right = {}) {
  return sportFamily(left) === sportFamily(right);
}

export function findPlannedWorkoutForActivity(plan = [], activity = {}) {
  const entries = Array.isArray(plan) ? plan.filter((item) => !item.archived) : [];
  const direct = entries.find((item) => (
    item.matchedActivityId === activity.id
    || (Array.isArray(activity.memberActivityIds) && activity.memberActivityIds.includes(item.matchedActivityId))
  ));
  if (direct) return direct;

  const day = activityDate(activity);
  if (!day) return null;
  const candidates = entries.filter((item) => item.date === day && sameSport(item, activity));
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0];

  const actualTokens = sourceTokens(activity);
  return candidates
    .map((item) => {
      const plannedTokens = sourceTokens(item);
      const overlap = plannedTokens.filter((token) => actualTokens.includes(token)).length;
      const distancePenalty = numeric(activity.distance) > 0 && numeric(item.distance) > 0
        ? Math.abs(numeric(activity.distance) - numeric(item.distance)) / Math.max(numeric(activity.distance), numeric(item.distance))
        : 0.5;
      const durationPenalty = durationMinutes(activity) > 0 && durationMinutes(item) > 0
        ? Math.abs(durationMinutes(activity) - durationMinutes(item)) / Math.max(durationMinutes(activity), durationMinutes(item))
        : 0.5;
      return { item, score: overlap * 5 - distancePenalty - durationPenalty };
    })
    .sort((left, right) => right.score - left.score)[0]?.item || null;
}

function goalLabel(goal = {}) {
  return goal?.target?.name || goal?.name || goal?.disciplineLabel || "dein aktuelles Ziel";
}

function roleReason(roleKey, item, context, matchedPlan) {
  const sessionRole = String(item.goalSessionRole || matchedPlan?.goalSessionRole || "");
  if (ROLE_REASON_BY_SESSION[sessionRole]) return ROLE_REASON_BY_SESSION[sessionRole];
  const target = goalLabel(context.goal);
  if (roleKey === "quality") return `Die Einheit setzt einen gezielten intensiven Reiz. Sie entwickelt Tempo, Schwelle oder Laufökonomie und wird deshalb nicht wie ein lockerer Lauf bewertet.`;
  if (roleKey === "long") return `Die Einheit entwickelt lange Belastungsverträglichkeit, Zeit auf den Beinen oder eine konkrete Wettkampfanforderung für ${target}.`;
  if (roleKey === "easy") return "Die Einheit stärkt die aerobe Grundlage und unterstützt die Erholung zwischen den wichtigen Reizen.";
  if (roleKey === "steady") return "Die Einheit ist ein ruhiger bis moderater Dauerreiz. Aus den vorhandenen Daten lässt sich keine eindeutigere Intensitätsrolle ableiten.";
  if (roleKey === "support") return "Die Einheit ergänzt das Lauftraining durch Stabilität, Beweglichkeit oder aerobe Arbeit mit geringer zusätzlicher Stoßbelastung.";
  if (roleKey === "additional") return "Die Einheit erzeugt relevante zusätzliche Bein- und Gesamtbelastung. Der Coach berücksichtigt sie bei Intensität, Erholung und der Verteilung weiterer Reize.";
  return "Die Einheit wird anhand von Sportart, Inhalt, Distanz, Dauer und Planbezug eingeordnet.";
}

function secondaryRole(item, family) {
  if (family === "running") {
    if (isQuality(item)) return "quality";
    if (isLongSpecific(item)) return "long";
    if (isEasy(item)) return "easy";
    return "steady";
  }
  if (family === "football") return "intense";
  return null;
}

export function workoutRoleAssessment(item = {}, context = {}) {
  const matchedPlan = context.matchedPlan || findPlannedWorkoutForActivity(context.plan, item);
  const roleItem = matchedPlan
    ? {
      ...item,
      title: matchedPlan.title || item.title || item.name,
      type: matchedPlan.type || item.type,
      notes: matchedPlan.notes || item.notes,
      keySession: Boolean(matchedPlan.keySession),
      raceEvent: Boolean(matchedPlan.raceEvent || item.raceEvent),
      goalSessionRole: matchedPlan.goalSessionRole || item.goalSessionRole,
    }
    : item;
  const family = sportFamily(roleItem);
  const keySession = Boolean(roleItem.keySession || roleItem.raceEvent);
  let classificationKey;

  if (family === "football" || family === "cycling") classificationKey = "additional";
  else if (["rowing", "support", "swimming"].includes(family)) classificationKey = "support";
  else classificationKey = secondaryRole(roleItem, family) || "steady";

  const markerKeys = [];
  if (keySession) markerKeys.push("key");
  if (keySession) {
    const secondary = secondaryRole(roleItem, family);
    if (secondary) markerKeys.push(secondary);
  } else if (family === "football") markerKeys.push("additional", "intense");
  else markerKeys.push(classificationKey);

  const markers = [...new Set(markerKeys)]
    .slice(0, 2)
    .map((key) => WORKOUT_ROLE_DEFINITIONS[key])
    .filter(Boolean);
  const phaseLabel = context.weekPrescription?.weekType?.label || context.phaseLabel || "";
  const reason = roleReason(classificationKey, roleItem, context, matchedPlan);
  const keyReason = keySession
    ? `${reason} Der Coach schützt sie deshalb als einen der wichtigsten Reize dieses Trainingsblocks.`
    : reason;

  return {
    classificationKey,
    family,
    isKeySession: keySession,
    markers,
    title: keySession ? "Warum ist das ein Schlüsselreiz?" : `Warum ${WORKOUT_ROLE_DEFINITIONS[classificationKey]?.label || "diese Rolle"}?`,
    explanation: keyReason,
    context: [phaseLabel, goalLabel(context.goal)].filter(Boolean).join(" · "),
    matchedPlanId: matchedPlan?.id || null,
    source: matchedPlan ? "plan" : "inferred",
  };
}

export function workoutRoleDistribution(items = [], context = {}) {
  const details = {
    easy: [],
    steady: [],
    quality: [],
    long: [],
    support: [],
    additional: [],
    key: [],
  };
  (Array.isArray(items) ? items : []).forEach((item) => {
    const assessment = workoutRoleAssessment(item, context);
    const row = {
      id: item.id,
      name: item.name || item.title || item.type || "Training",
      date: activityDate(item) || item.date || "",
      explanation: assessment.explanation,
      markers: assessment.markers,
      isKeySession: assessment.isKeySession,
    };
    if (details[assessment.classificationKey]) details[assessment.classificationKey].push(row);
    if (assessment.isKeySession) details.key.push(row);
  });
  return details;
}
