import { activitiesWithGroups } from "./activityGroups.js";
import {
  activityTimestamp,
  isRunningActivity,
  preferredActivities,
} from "./activityUtils.js";
import { athleteProfileAssessment } from "./athleteProfile.js";
import { coachDashboard, recovery } from "./insights.js";
import { buildMissionOutlook } from "./missionOutlook.js";
import { mobilityCoachSuggestion } from "./mobilityCoach.js";
import { currentWeekAssessment, goalRequirements } from "./scienceCoach.js";
import { buildTrainingAnalytics } from "./trainingAnalytics.js";

function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function shortHash(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  return Math.abs(hash).toString(36);
}

function uniqueEvidence(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value).replace(/\.+$/, "")))].slice(0, 5);
}

function statusFromSignals(recoveryState, week) {
  if (recoveryState.tone === "bad" || week.level === "adjust") {
    return {
      level: "adjust",
      tone: "bad",
      label: recoveryState.tone === "bad" ? "Erholung priorisieren" : "Woche prüfen",
      title: recoveryState.tone === "bad" ? "Heute bewusst entlasten" : "Die Wochenbelastung verdient einen Blick",
    };
  }
  if (recoveryState.tone === "warn" || week.level === "watch") {
    return {
      level: "watch",
      tone: "warn",
      label: "Aufmerksam steuern",
      title: "Training ist möglich – ohne zusätzlichen Druck",
    };
  }
  if (!recoveryState.reviewed) {
    return {
      level: "open",
      tone: "neutral",
      label: "Daten sammeln",
      title: "Der Plan steht, die persönliche Rückmeldung fehlt noch",
    };
  }
  return {
    level: "ok",
    tone: "good",
    label: "Bereit",
    title: "Die aktuellen Signale passen zum bestehenden Plan",
  };
}

export function buildCoachState(state = {}, now = new Date()) {
  const canonical = preferredActivities(state.activities || [], { hideStrava: Boolean(state.intervals?.connected) });
  const activities = activitiesWithGroups(canonical, state.activityGroups || []);
  const running = activities
    .filter(isRunningActivity)
    .sort((left, right) => activityTimestamp(right) - activityTimestamp(left));
  const dashboard = coachDashboard(activities, state.reviews || {}, now);
  const recoveryState = recovery(state.reviews || {}, running);
  const week = currentWeekAssessment(state, now);
  const analytics = buildTrainingAnalytics(state, now, 8);
  const athlete = athleteProfileAssessment(state, now);
  const outlook = buildMissionOutlook(activities, state.reviews || {}, state.mission || {}, now);
  const mobility = mobilityCoachSuggestion(activities, state.reviews || {}, now);
  const goal = goalRequirements(state);
  const status = statusFromSignals(recoveryState, week);

  const evidence = uniqueEvidence([
    ...week.reasons,
    recoveryState.reviewed
      ? `Letzte Reviews: Beine ${recoveryState.legs}/10, Energie ${recoveryState.energy}/10, Belastung ${recoveryState.rpe}/10`
      : "Noch kein aktuelles Lauf-Review für die persönliche Erholungseinordnung",
    analytics.trend.text,
    analytics.specificity.text,
    mobility?.reason,
  ]);

  const recommendationText = status.level === "open"
    ? "Bestehende Einheiten bleiben wie geplant. Ergänze nach dem nächsten relevanten Lauf ein kurzes Review, damit EYM Belastung und Erholung persönlicher einordnen kann."
    : dashboard.recommendation;
  const action = status.level === "adjust"
    ? { key: "review-week", label: "Woche gezielt prüfen", href: "/planner" }
    : status.level === "watch"
      ? { key: "keep-easy", label: "Plan kontrolliert fortsetzen", href: "/planner" }
      : { key: "keep-plan", label: "Plan beibehalten", href: "/planner" };
  const signature = `${status.level}|${week.reasons.join("|")}|${recoveryState.label}|${analytics.trend.direction}|${mobility?.id || ""}`;
  const recommendation = {
    id: `coach-${localDateKey(now)}-${shortHash(signature)}`,
    generatedAt: new Date(now).toISOString(),
    level: status.level,
    title: status.title,
    text: recommendationText,
    evidence,
    action,
    targetName: goal.target?.name || "",
    confidence: analytics.confidence,
  };

  return {
    generatedAt: new Date(now).toISOString(),
    ...status,
    recommendation,
    recovery: recoveryState,
    week,
    dashboard,
    analytics,
    athlete,
    outlook,
    mobility,
    goal,
    protectionNote: "EYM ändert keinen bestehenden Wochenplan automatisch. Vorschläge werden erst nach deiner ausdrücklichen Auswahl wirksam.",
  };
}

export function recommendationFeedbackEntry(recommendation, status, now = new Date()) {
  if (!recommendation?.id || !["helpful", "not_helpful"].includes(status)) return null;
  return {
    id: `${recommendation.id}-${status}`,
    recommendationId: recommendation.id,
    recommendationType: recommendation.level,
    title: recommendation.title,
    text: recommendation.text,
    evidence: Array.isArray(recommendation.evidence) ? recommendation.evidence : [],
    status,
    respondedAt: new Date(now).toISOString(),
  };
}

export function recommendationOutcome(entry, activities = [], reviews = {}) {
  if (!entry?.respondedAt) return { status: "open", label: "Noch ohne Folgedaten" };
  const respondedAt = new Date(entry.respondedAt);
  const nextReviewedRun = preferredActivities(activities)
    .filter(isRunningActivity)
    .filter((activity) => activityTimestamp(activity) > respondedAt && reviews?.[activity.id])
    .sort((left, right) => activityTimestamp(left) - activityTimestamp(right))[0];
  if (!nextReviewedRun) return { status: "open", label: "Nächstes Lauf-Review abwarten" };
  const review = reviews[nextReviewedRun.id];
  const warning = (Number(review.legs || 0) > 0 && Number(review.legs) <= 4)
    || (Number(review.energy || 0) > 0 && Number(review.energy) <= 4);
  return {
    status: warning ? "watch" : "stable",
    label: warning ? "Folgesignal weiter auffällig" : "Folgereview stabil",
    activityId: nextReviewedRun.id,
    activityName: nextReviewedRun.name || "Nächster Lauf",
    activityDate: nextReviewedRun.date || nextReviewedRun.startDateLocal,
  };
}
