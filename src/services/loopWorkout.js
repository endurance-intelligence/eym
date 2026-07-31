const MIN_PACE_SECONDS = 180;
const MAX_PACE_SECONDS = 1200;

export const LOOP_MODES = {
  FIXED_INTERVAL: "fixed_interval",
  TIME_LIMIT: "time_limit",
  FREE: "free",
};

export const LOOP_CONTROL_MODES = {
  MANUAL_LAP: "manual_lap",
  AUTOMATIC_DISTANCE: "automatic_distance",
};

export const LOOP_PACE_MODES = {
  NONE: "none",
  COACH: "coach",
  CUSTOM: "custom",
};

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function positiveNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function positiveInteger(value, fallback = 1) {
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function paceSeconds(value) {
  const match = String(value || "").trim().replace(/[.,]/, ":").match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match) return null;
  const seconds = Number(match[1]) * 60 + Number(match[2]);
  return seconds >= MIN_PACE_SECONDS && seconds <= MAX_PACE_SECONDS ? seconds : null;
}

function formatPace(value) {
  const seconds = clamp(Math.round(Number(value || 0)), MIN_PACE_SECONDS, MAX_PACE_SECONDS);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function roundToFive(value) {
  return Math.round(Number(value || 0) / 5) * 5;
}

export function parseLoopDurationMinutes(value) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, value);
  const text = String(value || "").trim();
  if (!text) return 0;
  if (/^\d+(?:[.,]\d+)?$/.test(text)) return Math.max(0, Number(text.replace(",", ".")));
  const match = text.match(/^(\d{1,3}):([0-5]\d)(?::([0-5]\d))?$/);
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]) + Number(match[3] || 0) / 60;
}

export function formatLoopDuration(minutes, { compact = false } = {}) {
  const totalSeconds = Math.max(0, Math.round(Number(minutes || 0) * 60));
  const hours = Math.floor(totalSeconds / 3600);
  const remainderSeconds = totalSeconds % 3600;
  const wholeMinutes = Math.floor(remainderSeconds / 60);
  const seconds = remainderSeconds % 60;
  if (!hours) return seconds
    ? `${wholeMinutes}:${String(seconds).padStart(2, "0")} min`
    : `${wholeMinutes} min`;
  if (compact) {
    if (seconds) return `${hours} h ${wholeMinutes}:${String(seconds).padStart(2, "0")} min`;
    return wholeMinutes ? `${hours} h ${wholeMinutes} min` : `${hours} h`;
  }
  return seconds
    ? `${String(hours).padStart(2, "0")}:${String(wholeMinutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")} h`
    : `${String(hours).padStart(2, "0")}:${String(wholeMinutes).padStart(2, "0")} h`;
}

export function loopModeLabel(value) {
  return {
    [LOOP_MODES.FIXED_INTERVAL]: "Fester Starttakt",
    [LOOP_MODES.TIME_LIMIT]: "Gesamtzeitlimit",
    [LOOP_MODES.FREE]: "Freier Rundkurs",
  }[value] || "Freier Rundkurs";
}

export function loopControlLabel(value) {
  return value === LOOP_CONTROL_MODES.AUTOMATIC_DISTANCE
    ? "Automatisch nach Distanz"
    : "Manuell am Rundenpunkt per LAP";
}

export function inferLoopMode(input = {}) {
  if (Object.values(LOOP_MODES).includes(input.loopMode)) return input.loopMode;
  const text = String(input.name || input.title || input.type || "").toLowerCase();
  if (/backyard|last\s*(person|man)\s*standing/.test(text)) return LOOP_MODES.FIXED_INTERVAL;
  if (input.eventTimeLimit || input.eventTimeLimitMinutes || /heartbeat|fulda|stundenlauf|hour\s*race/.test(text)) return LOOP_MODES.TIME_LIMIT;
  return LOOP_MODES.FREE;
}

export function loopMatchPlan(input = {}) {
  const loopKm = positiveNumber(input.loopKm);
  const targetKm = positiveNumber(input.targetKm);
  const timeLimitMinutes = positiveNumber(input.eventTimeLimitMinutes)
    || parseLoopDurationMinutes(input.eventTimeLimit);
  const plannedStopMinutes = Math.max(0, Number(input.plannedStopMinutes ?? 3));
  if (!(loopKm > 0) || !(targetKm > 0) || !(timeLimitMinutes > 0)) return null;

  // A real loop event is completed in official laps, not in a synthetic GPS
  // remainder. Use the nearest whole-lap match plan and show the resulting
  // planned distance transparently instead of inventing a 0.4 km finish leg.
  const targetLoops = Math.max(1, Math.round(targetKm / loopKm));
  const plannedDistanceKm = round(targetLoops * loopKm, 1);
  const distanceDeltaKm = round(plannedDistanceKm - targetKm, 1);
  const averageLoopBudgetMinutes = timeLimitMinutes / targetLoops;
  const runBudgetMinutes = Math.max(1, averageLoopBudgetMinutes - plannedStopMinutes);
  const requiredPaceSeconds = (runBudgetMinutes * 60) / loopKm;

  return {
    loopKm,
    targetKm,
    timeLimitMinutes,
    plannedStopMinutes,
    targetLoops,
    fullLoops: targetLoops,
    plannedDistanceKm,
    distanceDeltaKm,
    finalSegmentKm: 0,
    averageLoopBudgetMinutes,
    runBudgetMinutes,
    requiredPaceSeconds,
    requiredPace: formatPace(requiredPaceSeconds),
  };
}

export function isLoopWorkout(item = {}) {
  if (item.loopTraining && typeof item.loopTraining === "object") return true;
  return /backyard|loop-training|loop training|runden(block|training)|rundenkurs/i.test(`${item.type || ""} ${item.title || ""}`);
}

function titleLoopValues(item = {}) {
  const match = String(item.title || "").match(/(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*km/i);
  if (!match) return { loops: 0, loopKm: 0 };
  return { loops: Number(match[1]), loopKm: Number(match[2].replace(",", ".")) };
}

function normalizedPaceRange(fasterValue, slowerValue) {
  const fasterSeconds = paceSeconds(fasterValue);
  const slowerSeconds = paceSeconds(slowerValue);
  if (fasterSeconds == null || slowerSeconds == null) return null;
  return {
    faster: formatPace(Math.min(fasterSeconds, slowerSeconds)),
    slower: formatPace(Math.max(fasterSeconds, slowerSeconds)),
  };
}

export function loopCoachPaceGuidance(item = {}) {
  const source = item.loopTraining && typeof item.loopTraining === "object" ? item.loopTraining : item;
  const loopKm = positiveNumber(source.loopKm);
  if (!(loopKm > 0)) return null;
  const mode = inferLoopMode(source);
  const intervalMinutes = positiveNumber(source.intervalMinutes, 60);
  const plannedStopMinutes = Math.max(0, Number(source.plannedStopMinutes ?? (mode === LOOP_MODES.TIME_LIMIT ? 3 : 8)));
  const matchPlan = loopMatchPlan(source);
  let center = positiveNumber(source.coachPaceSeconds, 450);

  if (mode === LOOP_MODES.FIXED_INTERVAL) {
    const latestSustainable = ((Math.max(1, intervalMinutes - Math.max(4, plannedStopMinutes))) * 60) / loopKm;
    center = Math.min(center, latestSustainable - 20);
  }
  if (mode === LOOP_MODES.TIME_LIMIT && matchPlan) {
    center = Math.min(center, matchPlan.requiredPaceSeconds - 20);
  }

  center = clamp(roundToFive(center), MIN_PACE_SECONDS, MAX_PACE_SECONDS);
  return {
    faster: formatPace(center - 20),
    slower: formatPace(center + 20),
    centerSeconds: center,
    source: "coach",
  };
}

export function loopPaceGuidance(item = {}) {
  const source = item.loopTraining && typeof item.loopTraining === "object" ? item.loopTraining : item;
  const mode = Object.values(LOOP_PACE_MODES).includes(source.paceMode) ? source.paceMode : LOOP_PACE_MODES.NONE;
  if (mode === LOOP_PACE_MODES.NONE) return { mode, source: "manual" };
  const coach = loopCoachPaceGuidance(item);
  if (mode === LOOP_PACE_MODES.COACH) return coach ? { ...coach, mode } : { mode: LOOP_PACE_MODES.NONE, source: "coach" };
  const custom = normalizedPaceRange(source.faster, source.slower);
  return custom ? { ...custom, mode, source: "manual" } : coach ? { ...coach, mode: LOOP_PACE_MODES.CUSTOM, source: "manual" } : { mode: LOOP_PACE_MODES.NONE, source: "manual" };
}

function estimatedRunMinutes(loopKm, guidance, fallbackPaceSeconds) {
  const faster = paceSeconds(guidance?.faster);
  const slower = paceSeconds(guidance?.slower);
  const center = faster != null && slower != null ? (faster + slower) / 2 : positiveNumber(fallbackPaceSeconds, 450);
  return Math.max(1, (loopKm * center) / 60);
}

export function normalizeLoopWorkoutItem(item = {}) {
  if (!isLoopWorkout(item)) return item;
  const raw = item.loopTraining && typeof item.loopTraining === "object" ? item.loopTraining : {};
  const titleValues = titleLoopValues(item);
  const loops = clamp(positiveInteger(raw.loops, titleValues.loops || 2), 1, 30);
  const loopKm = round(positiveNumber(raw.loopKm, titleValues.loopKm || (Number(item.distance || 0) / loops) || 6.7), 1);
  const mode = inferLoopMode({ ...item, ...raw });
  const intervalMinutes = clamp(positiveInteger(raw.intervalMinutes, 60), 10, 240);
  const eventTimeLimitMinutes = positiveNumber(raw.eventTimeLimitMinutes)
    || parseLoopDurationMinutes(raw.eventTimeLimit);
  const targetKm = positiveNumber(raw.targetKm);
  const plannedStopMinutes = clamp(Number(raw.plannedStopMinutes ?? (mode === LOOP_MODES.TIME_LIMIT ? 3 : 8)), 0, 60);
  const controlMode = Object.values(LOOP_CONTROL_MODES).includes(raw.controlMode)
    ? raw.controlMode
    : LOOP_CONTROL_MODES.MANUAL_LAP;
  const paceMode = Object.values(LOOP_PACE_MODES).includes(raw.paceMode)
    ? raw.paceMode
    : LOOP_PACE_MODES.NONE;
  const distance = round(loops * loopKm, 1);
  const partial = {
    ...raw,
    loops,
    loopKm,
    distance,
    mode,
    intervalMinutes,
    eventTimeLimitMinutes,
    eventTimeLimit: raw.eventTimeLimit || (eventTimeLimitMinutes ? `${String(Math.floor(eventTimeLimitMinutes / 60)).padStart(2, "0")}:${String(Math.round(eventTimeLimitMinutes % 60)).padStart(2, "0")}:00` : ""),
    targetKm,
    plannedStopMinutes,
    controlMode,
    paceMode,
    coachPaceSeconds: positiveNumber(raw.coachPaceSeconds, 450),
  };
  const matchPlan = loopMatchPlan(partial);
  const coachGuidance = loopCoachPaceGuidance({ ...item, loopTraining: partial });
  const activeGuidance = loopPaceGuidance({ ...item, loopTraining: partial });
  const runMinutesPerLoop = estimatedRunMinutes(loopKm, activeGuidance?.mode === LOOP_PACE_MODES.NONE ? coachGuidance : activeGuidance, partial.coachPaceSeconds);
  const blockMinutes = mode === LOOP_MODES.FIXED_INTERVAL
    ? loops * intervalMinutes
    : mode === LOOP_MODES.TIME_LIMIT && matchPlan
      ? Math.round(loops * matchPlan.averageLoopBudgetMinutes)
      : Math.max(1, Math.round(Number(raw.blockMinutes || item.duration || (loops * (runMinutesPerLoop + plannedStopMinutes)))));

  const loopTraining = {
    ...partial,
    blockMinutes,
    estimatedRunMinutesPerLoop: Math.max(1, Math.round(runMinutesPerLoop)),
    coachFaster: coachGuidance?.faster || "",
    coachSlower: coachGuidance?.slower || "",
    faster: activeGuidance?.mode === LOOP_PACE_MODES.CUSTOM ? activeGuidance.faster : raw.faster || "",
    slower: activeGuidance?.mode === LOOP_PACE_MODES.CUSTOM ? activeGuidance.slower : raw.slower || "",
    matchPlan,
  };

  const normalizedTitle = /^\s*\d+\s*[x×]\s*\d+(?:[.,]\d+)?\s*km/i.test(String(item.title || ""))
    ? String(item.title).replace(/^\s*\d+\s*[x×]\s*\d+(?:[.,]\d+)?\s*km/i, `${loops} × ${String(loopKm).replace(".", ",")} km`)
    : item.title;

  return {
    ...item,
    title: normalizedTitle,
    distance,
    duration: blockMinutes,
    paceGuidance: null,
    loopTraining,
  };
}

export function loopWorkoutPaceLabel(item = {}, { includeNone = false } = {}) {
  if (!isLoopWorkout(item)) return "";
  const guidance = loopPaceGuidance(normalizeLoopWorkoutItem(item));
  if (!guidance || guidance.mode === LOOP_PACE_MODES.NONE) return includeNone ? "Ohne Pace-Ziel" : "";
  return `${guidance.mode === LOOP_PACE_MODES.COACH ? "Coach-Pace " : "Eigene Pace "}${guidance.faster}–${guidance.slower}/km`;
}

export function loopWorkoutCompactLabel(item = {}) {
  if (!isLoopWorkout(item)) return "";
  const normalized = normalizeLoopWorkoutItem(item);
  const loop = normalized.loopTraining;
  return `${loop.loops} Runden · ${String(loop.loopKm).replace(".", ",")} km planerisch · ${loopControlLabel(loop.controlMode)}`;
}
