const MIN_PACE_SECONDS = 180;
const MAX_PACE_SECONDS = 900;

function clamp(value, minimum = MIN_PACE_SECONDS, maximum = MAX_PACE_SECONDS) {
  return Math.max(minimum, Math.min(maximum, value));
}

function roundToFive(value) {
  return Math.round(Number(value || 0) / 5) * 5;
}

export function paceSeconds(value) {
  const match = String(value || "").trim().replace(/[.,]/, ":").match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match) return null;
  const seconds = Number(match[1]) * 60 + Number(match[2]);
  return seconds >= MIN_PACE_SECONDS && seconds <= MAX_PACE_SECONDS ? seconds : null;
}

export function formatPaceSeconds(value) {
  const seconds = clamp(Math.round(Number(value || 0)));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function workoutText(item = {}) {
  return `${item.type || ""} ${item.title || ""}`.toLowerCase();
}

function runningWorkout(item = {}) {
  const text = workoutText(item);
  if (/rudern|rowing|rad|ride|bike|cycling|schwimm|swim|fußball|football|soccer|stabi|mobility|mobilität|ruhetag|rest/.test(text)) return false;
  return /run|lauf|orc|treadmill|laufband|longrun|long run/.test(text);
}

export function supportsWorkoutPaceGuidance(item = {}) {
  const text = workoutText(item);
  if (!runningWorkout(item)) return false;
  if (item.structuredWorkout || item.goalWorkout || item.raceEvent || item.calendarOnly || item.choicePending) return false;
  return !/track|intervall|interval|schwelle|threshold|tempo|sprint|backyard|loop|wettkampf|race/.test(text);
}

function paceBandSeconds(item = {}) {
  const text = workoutText(item);
  if (/laufband|treadmill/.test(text)) return 10;
  if (/recovery|regeneration|erholung/.test(text)) return 25;
  if (/long run|longrun/.test(text)) return 20;
  return 15;
}

function isFixedGroupRun(item = {}) {
  const text = workoutText(item);
  return Boolean(item.fixed || item.commitmentId) && /orc run|gruppenlauf|group run/.test(text);
}

export function coachPaceGuidance(item = {}) {
  if (!supportsWorkoutPaceGuidance(item)) return null;

  if (isFixedGroupRun(item)) {
    return {
      mode: "none",
      source: "coach",
      coachReason: "Beim festen Gruppenlauf soll die Uhr keine Pace erzwingen.",
    };
  }

  const distance = Number(item.distance || 0);
  const duration = Number(item.duration || 0);
  if (!(distance > 0) || !(duration > 0)) {
    return {
      mode: "none",
      source: "coach",
      coachReason: "Für eine Pace-Empfehlung fehlen Distanz oder geplante Dauer.",
    };
  }

  const center = clamp((duration * 60) / distance);
  const halfBand = paceBandSeconds(item);
  const fasterSeconds = clamp(roundToFive(center - halfBand));
  const slowerSeconds = clamp(roundToFive(center + halfBand));
  const faster = formatPaceSeconds(Math.min(fasterSeconds, slowerSeconds));
  const slower = formatPaceSeconds(Math.max(fasterSeconds, slowerSeconds));

  return {
    mode: "range",
    faster,
    slower,
    recommendedFaster: faster,
    recommendedSlower: slower,
    source: "coach",
    coachReason: "Aus Distanz, geplanter Dauer und Art der Einheit berechnet.",
  };
}

function normalizedRange(guidance = {}, fallback = null) {
  let fasterSeconds = paceSeconds(guidance.faster);
  let slowerSeconds = paceSeconds(guidance.slower);

  if (fasterSeconds == null || slowerSeconds == null) {
    fasterSeconds = paceSeconds(fallback?.faster);
    slowerSeconds = paceSeconds(fallback?.slower);
  }
  if (fasterSeconds == null || slowerSeconds == null) return null;

  const faster = formatPaceSeconds(Math.min(fasterSeconds, slowerSeconds));
  const slower = formatPaceSeconds(Math.max(fasterSeconds, slowerSeconds));
  const recommendedFaster = paceSeconds(guidance.recommendedFaster) != null
    ? formatPaceSeconds(paceSeconds(guidance.recommendedFaster))
    : fallback?.recommendedFaster || fallback?.faster || faster;
  const recommendedSlower = paceSeconds(guidance.recommendedSlower) != null
    ? formatPaceSeconds(paceSeconds(guidance.recommendedSlower))
    : fallback?.recommendedSlower || fallback?.slower || slower;

  return {
    mode: "range",
    faster,
    slower,
    recommendedFaster,
    recommendedSlower,
    source: guidance.source === "manual" ? "manual" : "coach",
    coachReason: guidance.coachReason || fallback?.coachReason || "",
  };
}

export function workoutPaceGuidance(item = {}) {
  if (!supportsWorkoutPaceGuidance(item)) return null;
  const coach = coachPaceGuidance(item);
  const guidance = item.paceGuidance;

  if (!guidance || typeof guidance !== "object") return coach;
  if (guidance.mode === "none") {
    return {
      mode: "none",
      source: guidance.source === "coach" ? "coach" : "manual",
      recommendedFaster: guidance.recommendedFaster || coach?.recommendedFaster || coach?.faster || "",
      recommendedSlower: guidance.recommendedSlower || coach?.recommendedSlower || coach?.slower || "",
      coachReason: guidance.coachReason || coach?.coachReason || "",
    };
  }

  return normalizedRange(guidance, coach);
}

export function prepareWorkoutPaceGuidance(item = {}) {
  const guidance = workoutPaceGuidance(item);
  return guidance ? { ...item, paceGuidance: guidance } : item;
}

export function normalizeWorkoutPaceGuidance(item = {}) {
  if (!supportsWorkoutPaceGuidance(item)) return null;
  return workoutPaceGuidance(item) || coachPaceGuidance(item);
}

export function workoutPaceLabel(item = {}, { includeSource = false, includeNone = false } = {}) {
  const guidance = workoutPaceGuidance(item);
  if (!guidance) return "";
  if (guidance.mode === "none") return includeNone ? "Ohne Pace-Ziel" : "";
  const prefix = includeSource && guidance.source === "coach" ? "Coach-Pace " : "Pace ";
  return `${prefix}${guidance.faster}–${guidance.slower}/km`;
}

export function paceRangeDurationMinutes(distance, guidance = {}) {
  const kilometers = Number(distance || 0);
  const faster = paceSeconds(guidance.faster);
  const slower = paceSeconds(guidance.slower);
  if (!(kilometers > 0) || faster == null || slower == null) return null;
  return Math.max(1, Math.round((kilometers * ((faster + slower) / 2)) / 60));
}

export function applyPlanPaceGuidance(plan = []) {
  return (Array.isArray(plan) ? plan : []).map((item) => {
    if (!supportsWorkoutPaceGuidance(item)) return item;
    const guidance = workoutPaceGuidance(item);
    return guidance ? { ...item, paceGuidance: guidance } : item;
  });
}
