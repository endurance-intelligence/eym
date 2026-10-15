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
import { activityCoachAssessment } from "./activityCoach.js";
import { formatPaceSeconds, paceSeconds, workoutPaceGuidance } from "./workoutPace.js";

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

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function median(values = []) {
  const sorted = values.map(Number).filter((value) => Number.isFinite(value) && value > 0).sort((left, right) => left - right);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function activityPaceSeconds(activity = {}) {
  const distance = numeric(activity.distance);
  const seconds = numeric(activity.durationSeconds) || numeric(activity.duration) * 60;
  return distance > 0 && seconds > 0 ? seconds / distance : 0;
}

function elevationDensity(activity = {}) {
  const distance = numeric(activity.distance);
  const elevation = numeric(activity.elevation || activity.elevationGain || activity.totalElevationGain);
  return distance > 0 ? elevation / distance : 0;
}

function matchedPlanItem(state = {}, activity = {}) {
  const direct = (state.plan || []).find((item) => item?.matchedActivityId === activity.id);
  if (direct) return direct;
  const date = String(activity.startDateLocal || activity.date || "").slice(0, 10);
  if (!date) return null;
  return (state.plan || []).find((item) => {
    if (!item || item.archived || item.date !== date) return false;
    const text = `${item.title || ""} ${item.type || ""}`.toLowerCase();
    return /run|lauf|orc|track|intervall|schwelle|tempo|long|ultra|loop/.test(text);
  }) || null;
}

function runPurposeKind(item = {}, activity = {}) {
  const text = `${item?.title || ""} ${item?.type || ""} ${activity?.name || ""} ${activity?.type || ""}`.toLowerCase();
  if (/intervall|interval|track|tempo|schwelle|threshold|vo2|race|wettkampf/.test(text)) return "quality";
  if (/long|ultra|backyard|loop/.test(text) || numeric(item?.distance || activity?.distance) >= 18 || numeric(item?.duration || activity?.duration) >= 90) return "long";
  if (/easy|locker|ruhig|recovery|regeneration|orc run/.test(text)) return "easy";
  return "general";
}

function phaseFeedbackLabel(goal = {}) {
  return {
    base: "Grundlagenaufbau",
    build: "Aufbau",
    specific: "Zielspezifischer Aufbau",
    peak: "Peak & Absicherung",
    taper: "Taper & Frische",
  }[goal.phase?.key] || goal.phase?.label || "Aktuelle Vorbereitung";
}

function targetDaysLeft(goal = {}, now = new Date()) {
  if (!goal.target?.date) return null;
  const target = new Date(`${goal.target.date}T12:00:00`);
  const reference = new Date(now);
  reference.setHours(12, 0, 0, 0);
  return Number.isNaN(target.getTime()) ? null : Math.max(0, Math.ceil((target - reference) / 86400000));
}

function futureKeySession(state = {}, now = new Date()) {
  const today = localDateKey(now);
  return (state.plan || [])
    .filter((item) => item && !item.archived && !item.cancelled && !item.completedAt && !item.completed && item.date >= today)
    .filter((item) => {
      const text = `${item.title || ""} ${item.type || ""}`.toLowerCase();
      return item.keySession || item.isKeySession || /long|ultra|loop|track|intervall|schwelle|tempo/.test(text);
    })
    .sort((left, right) => `${left.date || ""}${left.time || ""}`.localeCompare(`${right.date || ""}${right.time || ""}`))[0] || null;
}

function comparableHeartRate(running = [], latest = {}) {
  const latestDistance = numeric(latest.distance);
  const latestDensity = elevationDensity(latest);
  const latestTime = activityTimestamp(latest).getTime();
  const values = running
    .filter((activity) => activity.id !== latest.id)
    .filter((activity) => latestTime - activityTimestamp(activity).getTime() >= 0 && latestTime - activityTimestamp(activity).getTime() <= 70 * 86400000)
    .filter((activity) => {
      const distance = numeric(activity.distance);
      if (latestDistance > 0 && distance > 0 && (distance < latestDistance * 0.55 || distance > latestDistance * 1.55)) return false;
      return Math.abs(elevationDensity(activity) - latestDensity) <= 10;
    })
    .map((activity) => numeric(activity.avgHr))
    .filter((value) => value > 0);
  return { median: median(values), count: values.length };
}

function buildCoachFeedback(state = {}, now = new Date(), { running = [], goal = {}, todaySession = {} } = {}) {
  const phase = phaseFeedbackLabel(goal);
  const daysLeft = targetDaysLeft(goal, now);
  const nextKey = futureKeySession(state, now);
  const latest = running[0] || null;
  const targetName = goal.target?.name || "deinem Ziel";
  const phaseMeta = daysLeft != null ? `${phase} · noch ${daysLeft} Tage` : phase;
  const nextKeyText = nextKey
    ? `${nextKey.title || nextKey.type || "nächsten Schlüsselreiz"}${nextKey.date ? ` am ${coachTargetDateLabel(nextKey.date)}` : ""}`
    : "den nächsten geplanten Schlüsselreiz";

  if (!latest) {
    return {
      relevant: Boolean(goal.target?.name),
      tone: "neutral",
      phaseLabel: phaseMeta,
      title: `${phase}: erst Daten sammeln, dann urteilen.`,
      text: `Für ${targetName} steht der Rahmen, aber für persönliches Wochenfeedback fehlen noch absolvierte Laufeinheiten.`,
      focus: todaySession?.planned ? `Heute ${todaySession.title} sauber nach Zweck absolvieren.` : "Den Plan umsetzen und nach relevanten Läufen kurz bewerten.",
      briefing: { show: Boolean(goal.target?.name), title: "Coach braucht noch echte Trainingsdaten", text: "Plan umsetzen; die persönliche Einordnung wird mit den nächsten Aktivitäten konkreter." },
    };
  }

  const review = state.reviews?.[latest.id] || {};
  const planned = matchedPlanItem(state, latest);
  const kind = runPurposeKind(planned, latest);
  const assessment = activityCoachAssessment(state, latest, review, latest.weather || null, []);
  const actualPace = activityPaceSeconds(latest);
  const paceGuidance = planned ? workoutPaceGuidance(planned) : null;
  const fasterLimit = paceGuidance?.mode === "range" ? paceSeconds(paceGuidance.faster) : null;
  const tooFast = ["easy", "long"].includes(kind) && fasterLimit != null && actualPace > 0 && actualPace < fasterLimit - 8;
  const hrContext = comparableHeartRate(running, latest);
  const hrDelta = hrContext.median > 0 && numeric(latest.avgHr) > 0 ? numeric(latest.avgHr) - hrContext.median : 0;
  const hrHigh = hrContext.count >= 3 && hrDelta >= 7;
  const rpe = numeric(review.rpe);
  const poorRecovery = (numeric(review.legs) > 0 && numeric(review.legs) <= 4) || (numeric(review.energy) > 0 && numeric(review.energy) <= 4);
  const latestLabel = latest.name || latest.type || "letzte Laufeinheit";
  const latestDistance = numeric(latest.distance);
  const paceComparison = tooFast && fasterLimit != null
    ? `${formatPaceSeconds(actualPace)}/km statt des vorgesehenen lockeren Korridors ${paceGuidance.faster}–${paceGuidance.slower}/km`
    : "";

  if (assessment.coachMessage?.title?.toLowerCase().includes("beschwerden") || assessment.signal?.value === "Beschwerden gemeldet") {
    return {
      relevant: true,
      tone: "watch",
      phaseLabel: phaseMeta,
      title: "Die Rückmeldung aus der letzten Einheit hat Vorrang.",
      text: `${latestLabel}: Beschwerden wurden gemeldet. Für die weitere Woche ist wichtiger, wie sich das entwickelt, als zusätzliche Kilometer zu sammeln.`,
      focus: `Vor ${nextKeyText} erneut prüfen, ob die Beschwerden wirklich abgeklungen sind.`,
      briefing: { show: true, title: "Coach-Anmerkung zur letzten Einheit", text: "Beschwerden wurden gemeldet; das ist für die weitere Wochensteuerung relevant." },
    };
  }

  if (tooFast && (hrHigh || rpe >= 7)) {
    const evidence = [
      paceComparison,
      hrHigh ? `Ø HF rund ${Math.round(hrDelta)} bpm über ${hrContext.count} vergleichbaren Läufen` : "",
      rpe >= 7 ? `RPE ${Math.round(rpe)}/10` : "",
    ].filter(Boolean).join(" · ");
    return {
      relevant: true,
      tone: "watch",
      phaseLabel: phaseMeta,
      title: "Der letzte lockere Lauf war unnötig teuer.",
      text: `${latestLabel}${latestDistance > 0 ? ` über ${latestDistance.toLocaleString("de-DE", { maximumFractionDigits: 1 })} km` : ""}: ${evidence}. Für den Zweck der Einheit war das mehr Intensität als nötig und kann die Qualität der Folgetage beeinflussen.`,
      focus: todaySession?.planned
        ? `Heute ${todaySession.title} wirklich nach Zweck steuern; ${nextKeyText} nicht durch unnötige Zusatzhärte gefährden.`
        : `${nextKeyText} schützen und bis dahin keine verlorene Pace „nachholen“.`,
      briefing: { show: true, title: "Letzte Einheit war härter als nötig", text: `Der Coach hat bei ${latestLabel} eine unnötig teure Steuerung erkannt.` },
    };
  }

  if (poorRecovery) {
    const bits = [numeric(review.legs) ? `Beine ${numeric(review.legs)}/10` : "", numeric(review.energy) ? `Energie ${numeric(review.energy)}/10` : ""].filter(Boolean).join(" · ");
    return {
      relevant: true,
      tone: "watch",
      phaseLabel: phaseMeta,
      title: "Die Tagesform aus der letzten Einheit gehört in die Wochensteuerung.",
      text: `${latestLabel}: ${bits}. Die Einheit selbst muss deshalb nicht „schlecht“ gewesen sein, aber die nächste Belastung sollte nicht blind gegen dieses Signal laufen.`,
      focus: `Bis ${nextKeyText} zählt Erholung mehr als Zusatzumfang.`,
      briefing: { show: true, title: "Coach-Anmerkung zur Erholung", text: `${bits} aus der letzten Einheit sind für die nächsten Tage relevant.` },
    };
  }

  if (assessment.execution?.value === "Mehr als geplant" && assessment.load?.tone === "watch") {
    return {
      relevant: true,
      tone: "neutral",
      phaseLabel: phaseMeta,
      title: "Der letzte Reiz war größer als vorgesehen.",
      text: `${latestLabel} wurde umfangreicher als geplant absolviert. Das ist nicht automatisch problematisch, aber der zusätzliche Reiz muss nicht in den nächsten Tagen noch einmal „bezahlt“ werden.`,
      focus: `${nextKeyText} qualitativ schützen; keine Kilometer-Schuld und kein Nachholen.`,
      briefing: { show: true, title: "Zusatzbelastung im Blick", text: "Die letzte Einheit war größer als geplant; die Folgetage sollen deshalb sauber gesteuert bleiben." },
    };
  }

  const stableDetail = `${latestLabel}${latestDistance > 0 ? ` · ${latestDistance.toLocaleString("de-DE", { maximumFractionDigits: 1 })} km` : ""}`;
  if (goal.phase?.key === "taper") {
    return {
      relevant: true, tone: "good", phaseLabel: phaseMeta,
      title: "Jetzt gewinnt Frische mehr als zusätzliche Fitness.",
      text: `${stableDetail} liefert kein Signal, das noch mehr Training rechtfertigt. Die Arbeit für ${targetName} ist im Wesentlichen getan; kurze Reize halten den Rhythmus, ohne neue Müdigkeit aufzubauen.`,
      focus: `${nextKeyText} kontrolliert absolvieren und mit Reserven beenden.`,
      briefing: { show: true, title: "Taper: Frische ist jetzt der Trainingsreiz", text: "Keine Fitness mehr erzwingen; die vorhandene Form soll am Renntag verfügbar sein." },
    };
  }

  if (["specific", "peak"].includes(goal.phase?.key)) {
    return {
      relevant: true, tone: "good", phaseLabel: phaseMeta,
      title: goal.phase?.key === "peak" ? "Spezifität absichern statt Umfang erzwingen." : "Jetzt zählt die Qualität der zielspezifischen Reize.",
      text: `${stableDetail} zeigt aktuell keinen Grund, den Aufbau hektischer zu machen. In dieser Phase geht es für ${targetName} weniger um irgendeine zusätzliche Kilometerzahl als darum, lange Belastung, Rennrhythmus und Versorgung kontrolliert zusammenzubringen.`,
      focus: `${nextKeyText} ist der nächste relevante Prüfstein; die Einheiten davor sollen ihn vorbereiten, nicht konkurrenzieren.`,
      briefing: { show: true, title: `${phase}: Fokus bleibt klar`, text: `${nextKeyText} ist aktuell wichtiger als zusätzliche, ungeplante Härte.` },
    };
  }

  return {
    relevant: true, tone: "good", phaseLabel: phaseMeta,
    title: phase === "Aufbau" ? "Der Aufbau braucht Kontinuität, keine Sprünge." : "Die Basis wird über Wiederholbarkeit aufgebaut.",
    text: `${stableDetail} passt aktuell in den Aufbau. Entscheidend ist, dass ähnliche Reize wiederholbar bleiben und nicht jede gute Einheit direkt verschärft wird.`,
    focus: nextKey ? `${nextKeyText} sauber erreichen; bis dahin den geplanten Rhythmus halten.` : "Den Wochenrhythmus stabil halten und den nächsten Belastungsschritt aus den Reviews ableiten.",
    briefing: { show: true, title: `${phase}: Kurs halten`, text: "Die letzte Einheit passt in den Aufbau; entscheidend bleibt die Wiederholbarkeit der nächsten Reize." },
  };
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
    watch = ["HF im Verhältnis zur gewohnten Easy-Belastung – Anstiege und Gefälle berücksichtigen", "Atemgefühl / subjektive Anstrengung", "Beine und Energie"];
    adjust = "Ist die HF auf vergleichbaren Streckenabschnitten ungewöhnlich hoch oder wirken die Beine klar schwerer, Tempo herausnehmen oder verkürzen.";
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

function coachTargetDateLabel(value) {
  if (!value) return "";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" }).format(date);
}

function statusFromSignals(recoveryState, week) {
  const target = week.candidates?.[0] || null;
  const targetLabel = target?.title || "";
  const dateLabel = coachTargetDateLabel(target?.date);
  const targetTitle = targetLabel ? `${targetLabel}${dateLabel ? ` · ${dateLabel}` : ""}` : "";

  if (week.acceptedPlan) {
    if (week.level === "adjust") {
      return {
        level: "adjust",
        tone: "bad",
        label: "Neue Evidenz",
        title: targetTitle ? `${targetTitle} gezielt prüfen` : "Seit der Planannahme hat sich etwas verändert",
      };
    }
    if (week.level === "watch") {
      return {
        level: "watch",
        tone: "warn",
        label: "Neue Evidenz",
        title: targetTitle ? `${targetTitle} im Blick behalten` : "Neue Belastungs- oder Erholungssignale beobachten",
      };
    }
    return {
      level: "ok",
      tone: "good",
      label: "Plan bestätigt",
      title: "Plan bleibt gültig",
    };
  }

  if (recoveryState.tone === "bad" || week.level === "adjust") {
    return {
      level: "adjust",
      tone: "bad",
      label: recoveryState.tone === "bad" ? "Erholung priorisieren" : "Woche prüfen",
      title: recoveryState.tone === "bad"
        ? "Heute bewusst entlasten"
        : targetTitle ? `${targetTitle} gezielt prüfen` : "Die Wochenbelastung verdient einen Blick",
    };
  }
  if (recoveryState.tone === "warn" || week.level === "watch") {
    return {
      level: "watch",
      tone: "warn",
      label: "Aufmerksam steuern",
      title: targetTitle ? `${targetTitle} im Blick behalten` : "Erholung beobachten – Plan nicht vorschnell ändern",
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
  const feedback = buildCoachFeedback(state, now, { running, goal, todaySession });

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
    recoveryState.reviewed && (!week.acceptedPlan || week.newReviewCount > 0)
      ? `Erholung zuletzt: Beine ${recoveryState.legs}/10, Energie ${recoveryState.energy}/10, RPE ${recoveryState.rpe}/10.`
      : null,
    analytics.specificity?.text,
  ].filter(Boolean).slice(0, 2).join(" ");
  const primaryCandidate = week.candidates?.[0] || null;
  const reasonText = week.reasons.length ? week.reasons.join(" · ") : "";
  const recommendationText = status.level === "open"
    ? "Bestehende Einheiten bleiben wie geplant. Ergänze nach dem nächsten relevanten Lauf ein kurzes Review, damit dein Coach Belastung und Erholung persönlicher einordnen kann."
    : week.acceptedPlan && status.level === "ok"
      ? week.hasNewEvidence
        ? "Seit der Planannahme sind neue Daten hinzugekommen, aber sie verändern die Trainingsentscheidung nicht. Konsequenz: Der bestätigte Wochenplan bleibt bestehen."
        : "Seit der Planannahme ist kein neues Belastungs- oder Erholungssignal hinzugekommen. Konsequenz: Der bestätigte Wochenplan bleibt unverändert."
      : week.acceptedPlan && ["watch", "adjust"].includes(status.level)
        ? `Seit der Planannahme neu: ${reasonText || "ein relevantes Signal"}.${primaryCandidate ? ` Betroffen ist zuerst ${primaryCandidate.title}${primaryCandidate.date ? ` am ${coachTargetDateLabel(primaryCandidate.date)}` : ""}.` : ""}`
        : status.level === "ok"
          ? `${signalLead} Konsequenz: keine Planänderung nötig; der nächste geplante Reiz bleibt bestehen, solange das nächste Review keine neue Abweichung zeigt.`
          : `${signalLead} ${reasonText || dashboard.recommendation}`;
  const actionable = ["adjust", "watch"].includes(status.level) && Boolean(primaryCandidate);
  const action = actionable
    ? {
      key: status.level === "adjust" ? "review-week" : "check-alternatives",
      label: `Optionen für ${primaryCandidate.title}`,
      href: "/planner",
      targetWorkoutId: primaryCandidate.id,
      targetDate: primaryCandidate.date,
    }
    : { key: "keep-plan", label: "Plan ansehen", href: "/planner" };
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
    targetWorkoutId: primaryCandidate?.id || null,
    targetWorkoutDate: primaryCandidate?.date || null,
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
    feedback,
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
