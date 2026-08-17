import {
  activityDate,
  isRunningActivity,
  sportGroup,
} from "./activityUtils.js";
import { reviewEntriesForActivity } from "./reviewCoverage.js";
import {
  findPlannedWorkoutForActivity,
  workoutRoleAssessment,
} from "./workoutRoles.js";

function dateKey(value) {
  const date = value instanceof Date ? new Date(value) : new Date(`${String(value || "").slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function weekEndKey(weekStart) {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  return dateKey(end);
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function average(values = []) {
  const usable = values.map(number).filter((value) => value > 0);
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : 0;
}

function compactKm(value) {
  return Number(value || 0).toFixed(1).replace(".0", "").replace(".", ",");
}

function relevantPlanEntry(item = {}) {
  const text = `${item.type || ""} ${item.title || ""}`.toLowerCase();
  return !item.archived && !item.optional && !/ruhe|rest|erholungstag/.test(text);
}

function reviewRows(activities, reviews, allActivities) {
  return activities.flatMap((activity) => reviewEntriesForActivity(activity, reviews, allActivities)
    .map((review) => ({ activity, review })));
}

function symptomValues(review = {}) {
  const general = [
    ...(Array.isArray(review.stomachSymptoms) ? review.stomachSymptoms : []),
  ].filter((value) => value && !String(value).startsWith("Keine"));
  const intake = (Array.isArray(review.nutritionItems) ? review.nutritionItems : []).flatMap((item) => [
    ...(Array.isArray(item.intakeSymptoms) ? item.intakeSymptoms : []),
    ["watch", "bad"].includes(item.intakeTolerance) ? item.intakeTolerance : null,
  ]).filter(Boolean);
  return [...general, ...intake];
}

function uniqueActivityLabels(activities = []) {
  return [...new Set(activities.map((activity) => sportGroup(activity).label).filter(Boolean))];
}

export function weeklyReviewSummary({
  weekStart,
  plan = [],
  activities = [],
  allActivities = activities,
  reviews = {},
} = {}) {
  const startKey = dateKey(weekStart);
  const endKey = weekEndKey(weekStart);
  if (!startKey || !endKey) return null;

  const planEntries = plan.filter((item) => {
    const date = String(item.date || "");
    return relevantPlanEntry(item) && date >= startKey && date <= endKey;
  });
  const weekActivities = activities.filter((activity) => {
    const date = activityDate(activity);
    return date >= startKey && date <= endKey;
  });

  const matchedPlanIds = new Set();
  const unmatchedActivities = [];
  weekActivities.forEach((activity) => {
    const matched = findPlannedWorkoutForActivity(planEntries, activity);
    if (matched) matchedPlanIds.add(matched.id);
    else unmatchedActivities.push(activity);
  });

  const plannedRunningEntries = planEntries.filter(isRunningActivity);
  const plannedRunningKm = plannedRunningEntries
    .reduce((sum, item) => sum + number(item.distance), 0);
  const actualRunningKm = weekActivities
    .filter(isRunningActivity)
    .reduce((sum, activity) => sum + number(activity.distance), 0);

  const missedEntries = planEntries.filter((item) => item.missedReason);
  const completedEntries = planEntries.filter((item) => item.completed || matchedPlanIds.has(item.id));
  const keyEntries = planEntries.filter((item) => workoutRoleAssessment(item, { plan: planEntries }).isKeySession);
  const keyCompleted = keyEntries.filter((item) => item.completed || matchedPlanIds.has(item.id));
  const keyMissed = keyEntries.filter((item) => item.missedReason && !item.completed && !matchedPlanIds.has(item.id));

  const rows = reviewRows(weekActivities, reviews, allActivities);
  const lowRecoveryRows = rows.filter(({ review }) => (
    number(review.legs || 10) <= 4
    || number(review.energy || 10) <= 4
    || number(review.overallFeeling || 10) <= 4
  ));
  const giRows = rows.filter(({ review }) => number(review.stomach || 10) <= 5 || symptomValues(review).length > 0);
  const strongThirstRows = rows.filter(({ review }) => review.hydrationThirst === "stark");
  const stableRows = rows.filter(({ review }) => (
    number(review.legs) >= 6
    && number(review.energy) >= 6
    && number(review.overallFeeling || 7) >= 6
  ));

  const volumeRatio = plannedRunningKm > 0 ? actualRunningKm / plannedRunningKm : null;
  const positives = [];
  if (keyEntries.length > 0 && keyCompleted.length === keyEntries.length) {
    positives.push(`${keyCompleted.length} von ${keyEntries.length} geplanten Schlüsselreizen wurden absolviert.`);
  } else if (keyCompleted.length > 0) {
    positives.push(`${keyCompleted.length} Schlüsselreiz${keyCompleted.length === 1 ? "" : "e"} wurde${keyCompleted.length === 1 ? "" : "n"} absolviert.`);
  }
  if (planEntries.length > 0 && missedEntries.length === 0) {
    positives.push(`Alle ${planEntries.length} relevanten Planeinheiten wurden erledigt oder durch eine passende Aktivität abgedeckt.`);
  }
  if (rows.length > 0 && lowRecoveryRows.length === 0 && stableRows.length > 0) {
    positives.push(`${stableRows.length} Review${stableRows.length === 1 ? "" : "s"} zeigen stabile Beine, Energie und Gesamtgefühl.`);
  }
  if (volumeRatio != null && volumeRatio >= 0.85 && volumeRatio <= 1.15) {
    positives.push(`Der Laufumfang lag mit ${compactKm(actualRunningKm)} km nahe am geplanten Rahmen von ${compactKm(plannedRunningKm)} km.`);
  }
  if (!positives.length) positives.push("Die Woche ist vollständig dokumentiert und kann für die nächste Planung belastbar ausgewertet werden.");

  const watchouts = [];
  if (missedEntries.length > 0) {
    watchouts.push(`${missedEntries.length} geplante Einheit${missedEntries.length === 1 ? " ist" : "en sind"} ausgefallen oder bewusst ausgelassen worden.`);
  }
  if (keyMissed.length > 0) {
    watchouts.push(`${keyMissed.length} Schlüsselreiz${keyMissed.length === 1 ? "" : "e"} wurde${keyMissed.length === 1 ? "" : "n"} nicht absolviert.`);
  }
  if (unmatchedActivities.length > 0) {
    const labels = uniqueActivityLabels(unmatchedActivities).slice(0, 3).join(" · ");
    watchouts.push(`${unmatchedActivities.length} zusätzliche Aktivität${unmatchedActivities.length === 1 ? "" : "en"} außerhalb des Plans${labels ? ` (${labels})` : ""} erhöht${unmatchedActivities.length === 1 ? "" : "en"} die reale Wochenbelastung.`);
  }
  if (lowRecoveryRows.length > 0) {
    watchouts.push(`${lowRecoveryRows.length} Review${lowRecoveryRows.length === 1 ? "" : "s"} zeigen niedrige Beine, Energie oder ein schwaches Gesamtgefühl.`);
  }
  if (giRows.length > 0) {
    watchouts.push(`${giRows.length} Einheit${giRows.length === 1 ? "" : "en"} enthielt${giRows.length === 1 ? "" : "en"} Magen-/GI-Auffälligkeiten oder auffällige Fueling-Reaktionen.`);
  }
  if (strongThirstRows.length > 0) {
    watchouts.push(`${strongThirstRows.length} Review${strongThirstRows.length === 1 ? "" : "s"} meldet${strongThirstRows.length === 1 ? "" : "en"} starken Durst während der Belastung.`);
  }
  if (volumeRatio != null && volumeRatio > 1.2) {
    watchouts.push(`Der Laufumfang lag rund ${Math.round((volumeRatio - 1) * 100)} % über dem geplanten Rahmen.`);
  } else if (volumeRatio != null && volumeRatio < 0.75) {
    watchouts.push(`Der Laufumfang lag rund ${Math.round((1 - volumeRatio) * 100)} % unter dem geplanten Rahmen.`);
  }
  if (!watchouts.length) watchouts.push("Keine auffälligen Warnsignale aus Umfang, Schlüsselreizen, Reviews oder Zusatzbelastung.");

  let consequence = "Kein Kilometer-Nachholen nötig. Die nächste Woche kann aus dem aktuellen Belastungsniveau normal weitergeplant werden.";
  if (keyMissed.length > 0) {
    consequence = "Ausgefallene Schlüsselreize werden nicht nachgeholt. Der Coach setzt den nächsten wichtigen Reiz neu in die kommende Woche, ohne Reize zu stapeln.";
  } else if (lowRecoveryRows.length >= 2) {
    consequence = "Die nächste Woche sollte nur dann normal gesteigert werden, wenn Beine und Energie wieder stabil sind; zusätzliche Intensität bleibt bis dahin begrenzt.";
  } else if (giRows.length > 0) {
    consequence = "Die Trainingsbelastung kann grundsätzlich weiterlaufen, aber auffälliges Fueling wird beim nächsten langen oder spezifischen Reiz gezielt und einzeln getestet statt gleichzeitig erhöht.";
  } else if (unmatchedActivities.length > 0 || (volumeRatio != null && volumeRatio > 1.2)) {
    consequence = "Die Zusatzbelastung wird in der nächsten Woche bei flexiblen Easy-Anteilen berücksichtigt; Schlüsselreiz und Longrun werden nicht künstlich verdichtet.";
  }

  const tone = keyMissed.length > 0 || lowRecoveryRows.length >= 2 || giRows.length >= 2 || (volumeRatio != null && volumeRatio > 1.25)
    ? "watch"
    : missedEntries.length > 0 || unmatchedActivities.length > 0 || giRows.length > 0 || strongThirstRows.length > 0
      ? "mixed"
      : "good";

  const headline = tone === "good"
    ? "Woche stabil verarbeitet"
    : tone === "mixed"
      ? "Solide Woche mit steuerungsrelevanten Details"
      : "Woche abgeschlossen – Belastung gezielt weiterführen";

  return {
    period: { start: startKey, end: endKey },
    headline,
    tone,
    summary: `${compactKm(actualRunningKm)} km gelaufen · ${completedEntries.length} von ${planEntries.length || 0} Planeinheiten abgedeckt · Ø RPE ${rows.length ? average(rows.map(({ review }) => review.rpe)).toFixed(1).replace(".", ",") : "–"}`,
    positives,
    watchouts,
    consequence,
    metrics: {
      plannedRunningKm: Number(plannedRunningKm.toFixed(1)),
      plannedRunningSessions: plannedRunningEntries.length,
      actualRunningKm: Number(actualRunningKm.toFixed(1)),
      plannedSessions: planEntries.length,
      completedSessions: completedEntries.length,
      missedSessions: missedEntries.length,
      extraActivities: unmatchedActivities.length,
      keyPlanned: keyEntries.length,
      keyCompleted: keyCompleted.length,
      reviewCount: rows.length,
      averageRpe: rows.length ? Number(average(rows.map(({ review }) => review.rpe)).toFixed(1)) : null,
      recoveryFlags: lowRecoveryRows.length,
      giFlags: giRows.length,
      thirstFlags: strongThirstRows.length,
    },
  };
}
