import { activityDate, activityTimestamp, isRunningActivity, preferredActivities } from "./activityUtils.js";
import { goalRequirements } from "./scienceCoach.js";

const DAY = 86400000;
const EXPERIENCE_ORDER = { beginner: 0, advanced: 1, experienced: 2, individual: 1 };

export const EXPERIENCE_OPTIONS = [
  {
    value: "beginner",
    label: "Einstieg",
    title: "Neu oder Wiedereinstieg",
    description: "Noch keine stabile Laufroutine oder nach längerer Pause wieder gestartet.",
  },
  {
    value: "advanced",
    label: "Regelmäßig",
    title: "Meist 2–3 Läufe pro Woche",
    description: "Laufen ist fester Bestandteil der Woche; erste Longruns oder Tempoeinheiten sind bekannt.",
  },
  {
    value: "experienced",
    label: "Erfahren",
    title: "Stabil 4+ Läufe pro Woche",
    description: "Strukturierte Wochen, längere Läufe und gezielte Belastungsblöcke sind vertraut.",
  },
  {
    value: "individual",
    label: "Individuell",
    title: "Eigene Ausgangslage",
    description: "Die Datenlage passt nicht sauber in ein Raster oder soll bewusst selbst eingeordnet werden.",
  },
];

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function startOfWeek(input) {
  const date = new Date(input);
  const day = date.getDay() || 7;
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - day + 1);
  return date;
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function maxRunningStreak(runDates) {
  const unique = [...new Set(runDates)].sort();
  let best = 0;
  let current = 0;
  let previous = null;
  unique.forEach((key) => {
    const value = new Date(`${key}T12:00:00`).getTime();
    if (previous != null && value - previous === DAY) current += 1;
    else current = 1;
    best = Math.max(best, current);
    previous = value;
  });
  return best;
}

function reviewSignals(state, runs) {
  const reviews = state.reviews || {};
  const reviewed = runs.map((activity) => reviews[activity.id]).filter(Boolean);
  const stable = reviewed.filter((review) => numeric(review.legs) >= 6 && numeric(review.energy) >= 6 && !String(review.legSymptoms || "").toLowerCase().includes("schmerz"));
  const strained = reviewed.filter((review) => numeric(review.legs) > 0 && numeric(review.legs) <= 4 || numeric(review.energy) > 0 && numeric(review.energy) <= 4 || (Array.isArray(review.legSymptoms) && review.legSymptoms.includes("Schmerzen")));
  return {
    count: reviewed.length,
    stableShare: reviewed.length ? stable.length / reviewed.length : null,
    strainedShare: reviewed.length ? strained.length / reviewed.length : null,
  };
}

function observedExperience({ runsPerWeek, activeWeeks, weeklyKm }) {
  if (activeWeeks < 3 || runsPerWeek < 1.5 || weeklyKm < 12) return "beginner";
  if (activeWeeks >= 5 && runsPerWeek >= 4 && weeklyKm >= 25) return "experienced";
  return "advanced";
}

function toleranceLevel({ runsPerWeek, activeWeeks, weeklyKm, longestRun, maxStreak, review }) {
  const stableEnough = review.stableShare == null || review.stableShare >= 0.55;
  if (activeWeeks >= 6 && runsPerWeek >= 5 && weeklyKm >= 35 && longestRun >= 15 && maxStreak >= 3 && stableEnough) {
    return { key: "high", label: "hoch", text: "Hohe Laufhäufigkeit und längere Belastungen werden über mehrere Wochen stabil vertragen." };
  }
  if (activeWeeks >= 4 && (runsPerWeek >= 3 || weeklyKm >= 25) && stableEnough) {
    return { key: "stable", label: "stabil", text: "Eine regelmäßige Trainingswoche ist etabliert; Progression sollte kontrolliert erfolgen." };
  }
  return { key: "building", label: "im Aufbau", text: "Die Belastungsgewöhnung wird noch aufgebaut oder die Datenlage ist noch dünn." };
}

function elevationLevel(weeklyElevation) {
  if (weeklyElevation >= 350) return { key: "high", label: "hoch" };
  if (weeklyElevation >= 120) return { key: "moderate", label: "mittel" };
  return { key: "low", label: "ausbaufähig" };
}

function progressionFocus(goal, metrics) {
  if (goal.discipline === "ultra") {
    if (metrics.runsPerWeek >= 5) return "Nicht mehr Lauftage sind der wichtigste nächste Schritt, sondern gezielte Back-to-Back-Blöcke, Zeit auf den Beinen, Fueling und robuste Erholung.";
    return "Eine zusätzliche kurze, lockere Einheit kann später sinnvoll sein; entscheidend bleiben Umfangsverträglichkeit, Longruns und Fueling.";
  }
  if (goal.discipline === "hilly") return "Der nächste sinnvolle Fortschritt liegt eher in profilierten Läufen, Bergauf-Kraftausdauer und kontrollierter Downhill-Belastung als in bloß mehr Lauftagen.";
  if (["5k", "10k"].includes(goal.discipline)) return "Fortschritt entsteht vor allem durch gezielte Qualität, Laufökonomie und ausreichende Erholung – nicht automatisch durch mehr Tage.";
  if (goal.discipline === "marathon") return "Lange Läufe, spezifische Tempoausdauer und Fueling sind wichtiger als eine pauschale Erhöhung der Laufhäufigkeit.";
  return "Progression sollte passend zum Ziel über Umfang, Qualität oder Spezifität erfolgen – nicht automatisch über mehr Trainingstage.";
}

export function athleteProfileAssessment(state, now = new Date()) {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const start = new Date(end.getTime() - 56 * DAY);
  const activities = preferredActivities(state.activities || []);
  const runs = activities.filter((activity) => isRunningActivity(activity) && activityTimestamp(activity) >= start && activityTimestamp(activity) <= end);
  const weeks = Array.from({ length: 8 }, (_, index) => {
    const weekEnd = startOfWeek(new Date(end));
    weekEnd.setDate(weekEnd.getDate() - index * 7 + 7);
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekStart.getDate() - 7);
    const entries = runs.filter((activity) => activityTimestamp(activity) >= weekStart && activityTimestamp(activity) < weekEnd);
    return {
      key: dateKey(weekStart),
      runs: entries.length,
      km: entries.reduce((sum, activity) => sum + numeric(activity.distance), 0),
      elevation: entries.reduce((sum, activity) => sum + numeric(activity.elevation || activity.elevationGain), 0),
    };
  }).reverse();
  const activeWeeks = weeks.filter((week) => week.runs > 0).length;
  const meaningfulWeeks = weeks.filter((week) => week.runs > 0 || week.km > 0);
  const divisor = Math.max(1, Math.min(8, activeWeeks >= 6 ? 8 : activeWeeks || 1));
  const runsPerWeek = runs.length / divisor;
  const weeklyKm = meaningfulWeeks.length ? meaningfulWeeks.reduce((sum, week) => sum + week.km, 0) / divisor : 0;
  const weeklyElevation = meaningfulWeeks.length ? meaningfulWeeks.reduce((sum, week) => sum + week.elevation, 0) / divisor : 0;
  const longestRun = Math.max(0, ...runs.map((activity) => numeric(activity.distance)));
  const typicalRun = median(runs.map((activity) => numeric(activity.distance)).filter((distance) => distance > 0));
  const maxStreak = maxRunningStreak(runs.map(activityDate));
  const review = reviewSignals(state, runs);
  const observedLevel = observedExperience({ runsPerWeek, activeWeeks, weeklyKm });
  const selectedLevel = state.profile?.experienceLevel || "beginner";
  const tolerance = toleranceLevel({ runsPerWeek, activeWeeks, weeklyKm, longestRun, maxStreak, review });
  const elevation = elevationLevel(weeklyElevation);
  const goal = goalRequirements(state);
  const selectedRank = EXPERIENCE_ORDER[selectedLevel] ?? 0;
  const observedRank = EXPERIENCE_ORDER[observedLevel] ?? 0;
  const levelSuggestion = selectedLevel !== "individual" && observedRank > selectedRank ? observedLevel : null;
  const recoveryStable = review.strainedShare == null || review.strainedShare <= 0.35;
  const currentRuns = numeric(state.profile?.selfReportedRunsPerWeek);
  let suggestedRunsPerWeek = null;
  if (activeWeeks >= 6 && recoveryStable && observedLevel !== "beginner" && currentRuns > 0 && runsPerWeek >= currentRuns + 0.65 && currentRuns < 5) {
    suggestedRunsPerWeek = Math.min(5, Math.max(currentRuns + 1, Math.round(runsPerWeek)));
  }
  if (runsPerWeek >= 5) suggestedRunsPerWeek = null;

  const label = observedLevel === "experienced" ? "Erfahren" : observedLevel === "advanced" ? "Regelmäßig" : "Einstieg";
  const evidence = [
    `${runsPerWeek.toFixed(1)} Läufe pro Woche im 8-Wochen-Fenster`,
    `${weeklyKm.toFixed(0)} km pro Woche`,
    `längster Lauf ${longestRun.toFixed(1)} km`,
    `maximal ${maxStreak} Lauftage am Stück`,
  ];
  if (weeklyElevation > 0) evidence.push(`${weeklyElevation.toFixed(0)} hm pro Woche`);
  if (review.count >= 3) evidence.push(`${Math.round((review.stableShare || 0) * 100)} % stabile Reviews`);

  return {
    selectedLevel,
    observedLevel,
    observedLabel: label,
    tolerance,
    specialization: goal.discipline,
    specializationLabel: goal.discipline === "ultra" ? "Ultra" : goal.discipline === "hilly" ? "Profil / Höhenmeter" : goal.discipline === "5k" ? "5 km" : goal.discipline === "10k" ? "10 km" : goal.discipline === "marathon" ? "Marathon" : "Ausdauer",
    elevation,
    metrics: {
      runsPerWeek,
      weeklyKm,
      weeklyElevation,
      longestRun,
      typicalRun,
      activeWeeks,
      maxStreak,
      reviewCount: review.count,
    },
    levelSuggestion,
    suggestedRunsPerWeek,
    progressionFocus: progressionFocus(goal, { runsPerWeek, weeklyKm, longestRun }),
    evidence,
    confidence: activeWeeks >= 6 && runs.length >= 18 ? "high" : activeWeeks >= 4 && runs.length >= 8 ? "medium" : "low",
  };
}

export function experienceLabel(value) {
  return EXPERIENCE_OPTIONS.find((option) => option.value === value)?.label || "Individuell";
}
