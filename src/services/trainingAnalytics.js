import {
  activityDate,
  activityTimestamp,
  isRunningActivity,
  preferredActivities,
  startOfIsoWeek,
} from "./activityUtils.js";
import { activitiesWithGroups } from "./activityGroups.js";
import { goalRequirements } from "./scienceCoach.js";

const DAY = 86400000;

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(numeric(value) * factor) / factor;
}

function isoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function durationMinutes(activity) {
  return numeric(activity?.durationSeconds) > 0
    ? numeric(activity.durationSeconds) / 60
    : numeric(activity?.duration);
}

function activityText(activity) {
  return `${activity?.name || ""} ${activity?.type || ""} ${activity?.sportType || ""}`.toLowerCase();
}

export function runningIntensity(activity) {
  const text = activityText(activity);
  const distance = numeric(activity?.distance);
  const duration = durationMinutes(activity);
  if (/intervall|interval|track|schwelle|threshold|tempo|sprint|race|wettkampf/.test(text)) return "quality";
  if (distance >= 20 || duration >= 120 || /longrun|long run|backyard|ultra/.test(text)) return "long";
  if (/easy|locker|recovery|regeneration|grundlage|ga1/.test(text)) return "easy";
  return "steady";
}

function isPlannedRun(item) {
  const text = `${item?.title || ""} ${item?.type || ""}`.toLowerCase();
  if (/fußball|football|rad|cycling|rowing|rudern|stabi|mobility|kraft|swim|schwimm|ruhetag/.test(text)) return false;
  return numeric(item?.distance) > 0 || /run|lauf|track|intervall|schwelle|tempo|backyard|ultra/.test(text);
}

function reviewWarning(review = {}) {
  const symptoms = Array.isArray(review.legSymptoms) ? review.legSymptoms.join(" ") : String(review.legSymptoms || "");
  return (numeric(review.legs) > 0 && numeric(review.legs) <= 4)
    || (numeric(review.energy) > 0 && numeric(review.energy) <= 4)
    || /schmerz/i.test(symptoms);
}

function reviewStable(review = {}) {
  const hasSignal = numeric(review.legs) > 0 || numeric(review.energy) > 0 || numeric(review.overallFeeling) > 0;
  if (!hasSignal || reviewWarning(review)) return false;
  const legsStable = !numeric(review.legs) || numeric(review.legs) >= 6;
  const energyStable = !numeric(review.energy) || numeric(review.energy) >= 6;
  const feelingStable = !numeric(review.overallFeeling) || numeric(review.overallFeeling) >= 6;
  return legsStable && energyStable && feelingStable;
}

function backToBackBlocks(runs) {
  const days = [...new Set(runs.map(activityDate).filter(Boolean))].sort();
  return days.reduce((count, day, index) => {
    if (!index) return count;
    const previous = new Date(`${days[index - 1]}T12:00:00`);
    const current = new Date(`${day}T12:00:00`);
    return count + (Math.round((current - previous) / DAY) === 1 ? 1 : 0);
  }, 0);
}

function average(values) {
  const usable = values.map(numeric).filter((value) => Number.isFinite(value));
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : 0;
}

function volumeTrend(weeks) {
  const completedWeeks = weeks.slice(0, -1);
  if (completedWeeks.length < 4) {
    return {
      direction: "open",
      label: "Noch im Aufbau",
      percent: null,
      text: "Für einen belastbaren Umfangstrend werden mindestens vier abgeschlossene Trainingswochen benötigt.",
    };
  }
  const recent = completedWeeks.slice(-3);
  const previous = completedWeeks.slice(-6, -3);
  const recentAverage = average(recent.map((week) => week.km));
  const previousAverage = average(previous.map((week) => week.km));
  if (!previous.length || previousAverage <= 0) {
    return {
      direction: "open",
      label: `${round(recentAverage, 0)} km/Woche`,
      percent: null,
      text: "Der aktuelle Drei-Wochen-Rahmen ist sichtbar; für den Vergleich fehlt noch eine vollständige Vorperiode.",
    };
  }
  const percent = Math.round(((recentAverage / previousAverage) - 1) * 100);
  const direction = percent >= 12 ? "up" : percent <= -12 ? "down" : "stable";
  return {
    direction,
    label: `${percent >= 0 ? "+" : ""}${percent} %`,
    percent,
    text: `Die letzten drei abgeschlossenen Wochen lagen im Mittel bei ${round(recentAverage, 0)} km, die drei Wochen davor bei ${round(previousAverage, 0)} km.`,
  };
}

function goalSpecificity(goal, metrics) {
  if (goal.discipline === "ultra") {
    const score = Math.min(100, Math.round(
      metrics.consistency * 45
      + Math.min(1, metrics.longRuns / 3) * 30
      + Math.min(1, metrics.backToBackBlocks / 3) * 25,
    ));
    return {
      score,
      label: score >= 75 ? "Ultra-spezifisch" : score >= 50 ? "Basis mit Spezifität" : "Grundlage aufbauen",
      text: `${metrics.longRuns} lange Läufe und ${metrics.backToBackBlocks} Back-to-Back-Verbindungen im gewählten Zeitraum. Für Ultra-Ziele zählen Konstanz, Zeit auf den Beinen und kontrollierte Folgetage stärker als einzelne schnelle Einheiten.`,
    };
  }
  if (goal.discipline === "hilly") {
    const score = Math.min(100, Math.round(metrics.consistency * 55 + Math.min(1, metrics.weeklyElevation / 350) * 45));
    return {
      score,
      label: score >= 70 ? "Profil passend" : "Mehr Profil möglich",
      text: `Im Mittel ${round(metrics.weeklyElevation, 0)} Höhenmeter pro Woche. Profilierte Ziele profitieren von regelmäßigen Höhenmetern statt einzelnen extremen Bergtagen.`,
    };
  }
  if (["5k", "10k"].includes(goal.discipline)) {
    const qualityShare = metrics.runs ? metrics.qualityRuns / metrics.runs : 0;
    const score = Math.min(100, Math.round(metrics.consistency * 60 + Math.min(1, qualityShare / 0.25) * 40));
    return {
      score,
      label: score >= 70 ? "Zielnaher Mix" : "Qualität dosieren",
      text: `${metrics.qualityRuns} Qualitätseinheiten bei ${metrics.runs} Läufen. Für das Ziel bleiben regelmäßige lockere Läufe die Basis; gezielte Qualität ergänzt sie.`,
    };
  }
  const score = Math.round(metrics.consistency * 100);
  return {
    score,
    label: score >= 75 ? "Konstante Basis" : "Routine festigen",
    text: `${metrics.activeWeeks} von ${metrics.weekCount} Wochen enthalten Lauftraining. Konstanz ist für das allgemeine Ausdauerziel aktuell das wichtigste Signal.`,
  };
}

function dataConfidence(runs, reviews) {
  if (!runs.length) {
    return {
      score: 0,
      level: "low",
      label: "Noch keine Laufdaten",
      text: "Nach dem ersten Import kann EYM Datenabdeckung und Trends bewerten.",
      coverage: {},
    };
  }
  const share = (predicate) => runs.filter(predicate).length / runs.length;
  const coverage = {
    basis: share((activity) => numeric(activity.distance) > 0 && durationMinutes(activity) > 0),
    heartRate: share((activity) => numeric(activity.avgHr) > 0 || Boolean(activity.heartRateZones?.zones?.length)),
    load: share((activity) => numeric(activity.trainingLoad) > 0 || numeric(activity.trimp) > 0),
    elevation: share((activity) => activity.elevation != null || activity.elevationGain != null),
    reviews: share((activity) => Boolean(reviews?.[activity.id])),
    weather: share((activity) => activity.weather?.temperature != null || activity.temperature != null),
  };
  const score = Math.round(
    coverage.basis * 35
    + coverage.heartRate * 20
    + coverage.load * 15
    + coverage.elevation * 10
    + coverage.reviews * 15
    + coverage.weather * 5,
  );
  const level = score >= 75 ? "high" : score >= 50 ? "medium" : "low";
  return {
    score,
    level,
    label: level === "high" ? "Hohe Datentiefe" : level === "medium" ? "Solide Datengrundlage" : "Eingeschränkte Datengrundlage",
    text: `${Math.round(coverage.reviews * 100)} % der Läufe besitzen ein Review, ${Math.round(coverage.heartRate * 100)} % Herzfrequenzdaten und ${Math.round(coverage.load * 100)} % einen externen Belastungswert.`,
    coverage,
  };
}

export function buildTrainingAnalytics(state = {}, now = new Date(), weekCount = 8) {
  const safeWeekCount = Math.max(4, Math.min(16, Number(weekCount) || 8));
  const canonical = preferredActivities(state.activities || [], { hideStrava: Boolean(state.intervals?.connected) });
  const activities = activitiesWithGroups(canonical, state.activityGroups || []);
  const currentWeek = startOfIsoWeek(now);
  const firstWeek = new Date(currentWeek);
  firstWeek.setDate(firstWeek.getDate() - (safeWeekCount - 1) * 7);
  const rangeEnd = new Date(currentWeek);
  rangeEnd.setDate(rangeEnd.getDate() + 7);
  const runs = activities
    .filter((activity) => isRunningActivity(activity) && activityTimestamp(activity) >= firstWeek && activityTimestamp(activity) < rangeEnd)
    .sort((left, right) => activityTimestamp(left) - activityTimestamp(right));

  const weeks = Array.from({ length: safeWeekCount }, (_, index) => {
    const start = new Date(firstWeek);
    start.setDate(start.getDate() + index * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const entries = runs.filter((activity) => activityTimestamp(activity) >= start && activityTimestamp(activity) < end);
    const plan = (state.plan || []).filter((item) => !item.archived && isPlannedRun(item) && item.date >= isoDate(start) && item.date < isoDate(end));
    const completedPlan = plan.filter((item) => item.completed || item.matchedActivityId);
    const reviewed = entries.filter((activity) => state.reviews?.[activity.id]);
    return {
      key: isoDate(start),
      start,
      end,
      current: isoDate(start) === isoDate(currentWeek),
      km: round(entries.reduce((sum, activity) => sum + numeric(activity.distance), 0)),
      durationMinutes: Math.round(entries.reduce((sum, activity) => sum + durationMinutes(activity), 0)),
      elevation: Math.round(entries.reduce((sum, activity) => sum + numeric(activity.elevation || activity.elevationGain), 0)),
      runs: entries.length,
      longest: round(Math.max(0, ...entries.map((activity) => numeric(activity.distance)))),
      quality: entries.filter((activity) => runningIntensity(activity) === "quality").length,
      long: entries.filter((activity) => runningIntensity(activity) === "long").length,
      backToBack: backToBackBlocks(entries),
      plannedKm: round(plan.reduce((sum, item) => sum + numeric(item.distance), 0)),
      plannedRuns: plan.length,
      completedPlan: completedPlan.length,
      reviewed: reviewed.length,
    };
  });

  const intensity = {
    easy: runs.filter((activity) => runningIntensity(activity) === "easy").length,
    steady: runs.filter((activity) => runningIntensity(activity) === "steady").length,
    quality: runs.filter((activity) => runningIntensity(activity) === "quality").length,
    long: runs.filter((activity) => runningIntensity(activity) === "long").length,
  };
  const reviewedRuns = runs.filter((activity) => state.reviews?.[activity.id]);
  const warningReviews = reviewedRuns.filter((activity) => reviewWarning(state.reviews[activity.id]));
  const stableReviews = reviewedRuns.filter((activity) => reviewStable(state.reviews[activity.id]));
  const longFuelRuns = runs.filter((activity) => durationMinutes(activity) >= 90 && state.reviews?.[activity.id]);
  const fuelTracked = longFuelRuns.filter((activity) => {
    const review = state.reviews[activity.id];
    return numeric(review.carbohydratesPerHour) > 0 || (Array.isArray(review.nutritionItems) && review.nutritionItems.length > 0);
  });
  const fuelInRange = fuelTracked.filter((activity) => state.reviews[activity.id]?.carbohydrateStatus === "good");
  const plannedRuns = weeks.reduce((sum, week) => sum + week.plannedRuns, 0);
  const completedPlan = weeks.reduce((sum, week) => sum + week.completedPlan, 0);
  const activeWeeks = weeks.filter((week) => week.runs > 0).length;
  const totalKm = runs.reduce((sum, activity) => sum + numeric(activity.distance), 0);
  const metrics = {
    weekCount: safeWeekCount,
    runs: runs.length,
    totalKm: round(totalKm),
    averageKm: round(totalKm / safeWeekCount),
    activeWeeks,
    consistency: activeWeeks / safeWeekCount,
    longestRun: round(Math.max(0, ...runs.map((activity) => numeric(activity.distance)))),
    weeklyElevation: weeks.reduce((sum, week) => sum + week.elevation, 0) / safeWeekCount,
    qualityRuns: intensity.quality,
    longRuns: intensity.long,
    backToBackBlocks: backToBackBlocks(runs),
    planAdherence: plannedRuns ? completedPlan / plannedRuns : null,
    plannedRuns,
    completedPlan,
    reviewedRuns: reviewedRuns.length,
    stableReviews: stableReviews.length,
    warningReviews: warningReviews.length,
    fuelRuns: longFuelRuns.length,
    fuelTracked: fuelTracked.length,
    fuelInRange: fuelInRange.length,
  };
  const goal = goalRequirements(state);
  const trend = volumeTrend(weeks);
  const specificity = goalSpecificity(goal, metrics);
  const confidence = dataConfidence(runs, state.reviews || {});

  return {
    generatedAt: new Date(now).toISOString(),
    range: { from: isoDate(firstWeek), to: isoDate(rangeEnd), weekCount: safeWeekCount },
    weeks,
    runs,
    intensity,
    metrics,
    goal,
    trend,
    specificity,
    confidence,
  };
}
