import { activityTimestamp, isRunningActivity } from "./activityUtils.js";

const DAY = 86400000;

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round((numeric(value) + Number.EPSILON) * factor) / factor;
}

function text(item = {}) {
  return `${item.type || ""} ${item.title || ""}`.toLowerCase();
}

function isRunningPlanEntry(item = {}) {
  const value = text(item);
  if (/fußball|football|soccer|rad|ride|bike|cycling|rudern|rowing|stabi|mobility|mobilität|schwimm|swim/.test(value)) return false;
  return numeric(item.distance) > 0 || /run|lauf|track|intervall|schwelle|threshold|backyard|loop|wettkampf|race/.test(value);
}

export function missedWorkoutPurpose(item = {}) {
  const value = text(item);
  if (/long\s*run|longrun|backyard|loop-training|ultra/.test(value)) return "long";
  if (item.raceEvent || /wettkampf|race|marathon/.test(value)) return "race";
  if (item.keySession || /orc\s*track|track|intervall|interval|schwelle|threshold|tempo|sprint/.test(value)) return "quality";
  if (/fußball|football|soccer/.test(value)) return "football";
  if (isRunningPlanEntry(item) && /easy|locker|recovery|regeneration|laufband|orc\s*run/.test(value)) return "easy";
  if (isRunningPlanEntry(item)) return "steady";
  return "other";
}

export function blockedTrainingDates(plan = [], weekStart = "", weekEnd = "") {
  return new Set(plan
    .filter((item) => item?.plannedCancellation && item?.missedMeta?.blockDay)
    .filter((item) => !weekStart || String(item.date || "") >= weekStart)
    .filter((item) => !weekEnd || String(item.date || "") <= weekEnd)
    .map((item) => String(item.date || ""))
    .filter(Boolean));
}

export function establishedLongRunDistance(activities = [], referenceDate = new Date(), days = 56) {
  const reference = new Date(referenceDate);
  const start = new Date(reference.getTime() - days * DAY);
  return activities.reduce((maximum, activity) => {
    const timestamp = activityTimestamp(activity);
    if (!isRunningActivity(activity) || timestamp < start || timestamp >= reference) return maximum;
    const durationMinutes = numeric(activity.durationSeconds) / 60 || numeric(activity.duration);
    const distance = numeric(activity.distance);
    if (distance < 10 && durationMinutes < 75) return maximum;
    return Math.max(maximum, distance);
  }, 0);
}

function readinessAllowsSmallExtension(planner = {}) {
  const readiness = planner.lastReadiness || {};
  const checkin = planner.checkin || {};
  if (readiness.longRunAllowed === false || readiness.hardAllowed === false) return false;
  if (numeric(readiness.factor) > 0 && numeric(readiness.factor) < 0.92) return false;
  if (["recovering", "symptoms"].includes(checkin.illness)) return false;
  if (["unchanged", "worse"].includes(checkin.pain) || numeric(checkin.painLevel) >= 4) return false;
  if (["unchanged", "worse"].includes(checkin.fatigue)) return false;
  if (numeric(checkin.energy) > 0 && numeric(checkin.energy) <= 3) return false;
  return true;
}

function cancellationCandidates(plan = []) {
  return plan
    .filter((item) => item?.plannedCancellation && item?.missedReason)
    .sort((left, right) => String(right.date || "").localeCompare(String(left.date || "")));
}

function activeLongRuns(plan = [], today = new Date()) {
  const todayKey = new Date(today).toISOString().slice(0, 10);
  return plan
    .filter((item) => !item.archived && !item.completed && !item.missedReason && !item.plannedCancellation)
    .filter((item) => String(item.date || "") >= todayKey)
    .filter((item) => missedWorkoutPurpose(item) === "long")
    .sort((left, right) => String(left.date || "").localeCompare(String(right.date || "")));
}

export function buildMissedSessionDecision({ plan = [], activities = [], planner = {}, today = new Date() } = {}) {
  const longRuns = activeLongRuns(plan, today);
  if (!longRuns.length) return null;

  const cancellation = cancellationCandidates(plan)
    .find((item) => longRuns.some((longRun) => String(longRun.date || "") > String(item.date || "")));
  if (!cancellation) return null;

  const longRun = longRuns.find((item) => String(item.date || "") > String(cancellation.date || ""));
  if (!longRun) return null;

  const purpose = missedWorkoutPurpose(cancellation);
  const dayGap = Math.round((new Date(`${longRun.date}T12:00:00`) - new Date(`${cancellation.date}T12:00:00`)) / DAY);
  const alreadyApplied = longRun.missedSessionAdjustment?.sourceCancellationId === cancellation.id;
  const base = {
    cancellationId: cancellation.id,
    cancellationTitle: cancellation.title,
    cancellationDate: cancellation.date,
    cancellationReason: cancellation.missedReason,
    cancellationNote: cancellation.missedNote || "",
    longRunId: longRun.id,
    longRunTitle: longRun.title,
    longRunDate: longRun.date,
    purpose,
    dayGap,
    action: "keep",
    tone: "protected",
    title: "Longrun nicht künstlich verlängern",
    recommendation: `${longRun.title} bleibt wie geplant. Die ausgefallene Einheit wird nicht als Kilometerschuld auf den Sonntag verschoben.`,
    reason: "Ausgefallene Kilometer werden nicht automatisch nachgeholt. Entscheidend sind Trainingszweck, Gesamtbelastung und die etablierte Longrun-Basis.",
    extraMinutes: 0,
    extraKm: 0,
    finalDistanceKm: numeric(longRun.distance),
    canApply: false,
  };

  if (alreadyApplied) {
    return {
      ...base,
      tone: "applied",
      title: "Optionale Verlängerung ist eingeplant",
      recommendation: `${longRun.title} enthält bereits die kleine Coach-Ergänzung. Weitere ausgefallene Kilometer werden nicht aufgeschlagen.`,
      reason: `${numeric(longRun.missedSessionAdjustment?.addedMinutes)} ruhige Minuten wurden einmalig ergänzt.`,
    };
  }

  if (["quality", "football", "long", "race"].includes(purpose)) {
    const purposeReason = purpose === "quality"
      ? "Ein Tempo- oder Trackreiz lässt sich nicht durch zusätzliche ruhige Longrun-Kilometer ersetzen."
      : purpose === "football"
        ? "Fußball ist eine intensive Beinbelastung und kein Kilometerblock, der auf den Longrun übertragen wird."
        : purpose === "long"
          ? "Ein ausgefallener Longrun wird nicht direkt am Folgetag überkompensiert."
          : "Ein Wettkampf oder Event wird nicht durch Zusatzkilometer in einer anderen Einheit ersetzt.";
    return { ...base, reason: purposeReason };
  }

  if (purpose !== "easy" || dayGap > 2) {
    return {
      ...base,
      reason: purpose === "steady"
        ? "Die ausgefallene Einheit war nicht eindeutig locker. Deshalb bleibt der Longrun unverändert."
        : "Die ausgefallene Einheit beeinflusst den Longrun nicht direkt.",
    };
  }

  const recoveryWeek = Boolean(planner.lastRecoveryWeek);
  const eventProtected = Boolean(longRun.eventProtection || longRun.raceEvent);
  const readinessOk = readinessAllowsSmallExtension(planner);
  const established = establishedLongRunDistance(activities, new Date(`${longRun.date}T12:00:00`));
  const plannedDistance = numeric(longRun.distance);
  const belowEstablished = established > 0 && plannedDistance + 0.5 < established;

  if (recoveryWeek || eventProtected || !readinessOk || !belowEstablished) {
    const blockers = [];
    if (recoveryWeek) blockers.push("Entlastungswoche");
    if (eventProtected) blockers.push("Eventschutz");
    if (!readinessOk) blockers.push("Erholungssignale");
    if (!belowEstablished) blockers.push("Longrun liegt nicht klar unter deiner etablierten Distanz");
    return {
      ...base,
      reason: `Der ausgefallene lockere Lauf wird nicht nachgeholt. ${blockers.join(" · ") || "Die Sicherheitsbedingungen für eine Verlängerung sind nicht erfüllt"}.`,
    };
  }

  const paceMinutesPerKm = plannedDistance > 0 && numeric(longRun.duration) > 0
    ? numeric(longRun.duration) / plannedDistance
    : 6.5;
  const extraMinutes = 10;
  const possibleKm = extraMinutes / Math.max(4.5, paceMinutesPerKm);
  const distanceRoom = Math.max(0, established - plannedDistance);
  const extraKm = round(Math.min(2, possibleKm, distanceRoom), 1);
  if (extraKm < 0.5) return base;

  return {
    ...base,
    action: "optional-extension",
    tone: "optional",
    title: "Kleine Verlängerung ist optional möglich",
    recommendation: `${longRun.title} kann optional um ${extraMinutes} ruhige Minuten ergänzt werden – nicht um die komplette ausgefallene Distanz.`,
    reason: `Der ausgefallene Lauf war locker, die Longrun-Distanz liegt unter deiner etablierten Basis von ${round(established, 1).toFixed(1).replace(".0", "")} km und es liegen keine kritischen Erholungssignale vor.`,
    extraMinutes,
    extraKm,
    finalDistanceKm: round(plannedDistance + extraKm, 1),
    canApply: true,
  };
}

export function applyOptionalLongRunExtension(item = {}, decision = {}) {
  if (!decision?.canApply || decision.longRunId !== item.id) return item;
  const finalDistanceKm = round(decision.finalDistanceKm, 1);
  const finalDuration = Math.round(numeric(item.duration) + numeric(decision.extraMinutes));
  const distanceLabel = String(finalDistanceKm).replace(".", ",");
  return {
    ...item,
    distance: finalDistanceKm,
    duration: finalDuration,
    title: String(item.title || `${finalDistanceKm} km Longrun`).replace(/^\d+(?:[.,]\d+)?\s*km/, `${distanceLabel} km`),
    notes: `${item.notes || ""} Optional um ${decision.extraMinutes} ruhige Minuten ergänzt, weil am Vortag ein lockerer Lauf ausfiel. Keine Tempoanteile und kein vollständiges Nachholen der ausgefallenen Kilometer.`.trim(),
    missedSessionAdjustment: {
      sourceCancellationId: decision.cancellationId,
      addedMinutes: decision.extraMinutes,
      addedKm: decision.extraKm,
      appliedAt: new Date().toISOString(),
    },
  };
}
