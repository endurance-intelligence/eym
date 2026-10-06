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

function todaySessionGuidance(state = {}, now = new Date()) {
  const today = localDateKey(now);
  const planned = (state.plan || [])
    .filter((item) => item && item.date === today && !item.archived && !item.cancelled && !item.completedAt)
    .sort((left, right) => Number(Boolean(right.keySession || right.isKeySession)) - Number(Boolean(left.keySession || left.isKeySession)))[0];
  if (!planned) {
    return {
      planned: false,
      title: "Heute kein fester Trainingsreiz",
      purpose: "Erholung und Alltag gehören zur Planung dazu. Kein Zusatztraining nur deshalb einschieben, weil der Kalender leer ist.",
      watch: ["Beine und Energie", "ungewöhnliche Beschwerden", "Erholung vor dem nächsten Schlüsselreiz"],
      adjust: "Nur spontan trainieren, wenn es zum Wochenziel passt und die Erholung stabil ist.",
    };
  }

  const text = `${planned.title || ""} ${planned.type || ""} ${planned.description || ""}`.toLowerCase();
  const distance = Number(planned.distance || planned.targetKm || 0);
  const duration = Number(planned.duration || planned.durationMinutes || 0);
  const label = planned.title || planned.name || planned.type || "Geplante Einheit";
  const detail = [distance > 0 ? `${distance.toLocaleString("de-DE", { maximumFractionDigits: 1 })} km` : "", duration > 0 ? `${Math.round(duration)} min` : ""].filter(Boolean).join(" · ");
  let purpose = "Den geplanten Trainingsreiz sauber setzen, ohne unnötig darüber hinauszugehen.";
  let watch = ["subjektive Belastung", "Beine und Energie", "Abweichung vom geplanten Umfang"];
  let adjust = "Wenn sich die Einheit deutlich härter als geplant anfühlt, Umfang reduzieren statt Intensität erzwingen.";

  if (/easy|locker|recovery|regeneration/.test(text)) {
    purpose = "Aerobe Arbeit mit niedrigen Kosten: locker bleiben und Erholung nicht in einen versteckten Tempolauf verwandeln.";
    watch = ["HF im Verhältnis zur gewohnten Easy-Pace", "RPE / Atemgefühl", "Beine und Energie"];
    adjust = "Ist die HF bei ähnlicher Pace ungewöhnlich hoch oder wirken die Beine klar schwerer, Tempo herausnehmen oder verkürzen.";
  } else if (/intervall|interval|track|tempo|schwelle|threshold|vo2/.test(text)) {
    purpose = "Qualität vor Menge: die vorgesehenen schnellen Abschnitte kontrolliert und möglichst gleichmäßig treffen.";
    watch = ["Pace-/Leistungsabfall zwischen Wiederholungen", "HF und RPE", "Technik / muskuläre Warnsignale"];
    adjust = "Bricht die Qualität deutlich ein, den Reiz beenden statt schlechte Wiederholungen zu sammeln.";
  } else if (/long|lang|ultra|backyard|loop/.test(text) || distance >= 18 || duration >= 90) {
    purpose = "Ermüdungsresistenz, Zeit auf den Beinen und – wenn vorgesehen – Fueling unter langer Belastung trainieren.";
    watch = ["Pace/HF-Drift", "Fueling und Magenverträglichkeit", "muskuläre Stabilität in der zweiten Hälfte"];
    adjust = "Bei deutlicher Drift plus schlechtem Gefühl nicht auf Distanz bestehen; den spezifischen Reiz sichern und gesund beenden.";
  } else if (/fußball|football|soccer/.test(text)) {
    purpose = "Zusatzbelastung aus Beschleunigungen und Richtungswechseln aufnehmen, ohne daraus noch einen Laufreiz machen zu müssen.";
    watch = ["muskuläre Müdigkeit", "Waden/Adduktoren", "Folgeerholung bis zum nächsten Lauf"];
    adjust = "Bei ungewöhnlicher muskulärer Belastung den nächsten Lauf konservativer behandeln.";
  } else if (/kraft|stabi|mobility/.test(text)) {
    purpose = "Bewegungsqualität und robuste Kraft ergänzen, ohne relevante Laufmüdigkeit zu erzeugen.";
    watch = ["saubere Bewegung", "Schmerzfreiheit", "lokale Ermüdung"];
    adjust = "Qualität vor Wiederholungszahl; schmerzhafte Bewegungen nicht erzwingen.";
  }

  return {
    planned: true,
    id: planned.id,
    title: detail ? `${label} · ${detail}` : label,
    purpose,
    watch,
    adjust,
    keySession: Boolean(planned.keySession || planned.isKeySession),
  };
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
      title: "Plan beibehalten oder eine Einheit anpassen?",
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
      label: "Plan passt",
    title: "Stabil – der nächste geplante Reiz bleibt sinnvoll",
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
  const todaySession = todaySessionGuidance(state, now);

  const evidence = uniqueEvidence([
    ...week.reasons,
    recoveryState.reviewed
      ? `Letzte Reviews: Beine ${recoveryState.legs}/10, Energie ${recoveryState.energy}/10, Belastung ${recoveryState.rpe}/10`
      : "Noch kein aktuelles Lauf-Review für die persönliche Erholungseinordnung",
    analytics.trend.text,
    analytics.specificity.text,
    mobility?.reason,
  ]);

  const signalLead = [
    analytics.trend?.text,
    recoveryState.reviewed
      ? `Erholung zuletzt: Beine ${recoveryState.legs}/10, Energie ${recoveryState.energy}/10, RPE ${recoveryState.rpe}/10.`
      : null,
    analytics.specificity?.text,
  ].filter(Boolean).slice(0, 2).join(" ");
  const recommendationText = status.level === "open"
    ? "Bestehende Einheiten bleiben wie geplant. Ergänze nach dem nächsten relevanten Lauf ein kurzes Review, damit dein Coach Belastung und Erholung persönlicher einordnen kann."
    : status.level === "ok"
      ? `${signalLead} Konsequenz: keine Planänderung nötig; der nächste geplante Reiz bleibt bestehen, solange das nächste Review keine neue Abweichung zeigt.`
      : `${signalLead} ${dashboard.recommendation}`;
  const action = status.level === "adjust"
    ? { key: "review-week", label: "Woche gezielt prüfen", href: "/planner" }
    : status.level === "watch"
      ? { key: "check-alternatives", label: "Coach-Alternativen prüfen", href: "/planner" }
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
    todaySession,
    protectionNote: "Dein Coach ändert keinen bestehenden Wochenplan automatisch. Vorschläge werden erst nach deiner ausdrücklichen Auswahl wirksam.",
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
