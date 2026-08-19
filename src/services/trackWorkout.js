export const TRACK_MAIN_CONTROL_MODES = Object.freeze({
  AUTOMATIC: "automatic",
  MANUAL_LAP: "manual_lap",
});

export const DEFAULT_TRACK_WORKOUT = Object.freeze({
  kind: "intervals",
  rounds: 8,
  steps: Object.freeze([
    Object.freeze({ kind: "work", unit: "distance", value: 400 }),
    Object.freeze({ kind: "recovery", unit: "distance", value: 200 }),
  ]),
  warmupMode: "lap",
  cooldownMode: "lap",
  mainControlMode: TRACK_MAIN_CONTROL_MODES.AUTOMATIC,
  planningStatus: "final",
});

function clamp(value, minimum, maximum, fallback) {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function cleanText(value, maximum = 80) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maximum);
}

function paceSeconds(value) {
  const match = String(value || "").trim().replace(/[.,]/, ":").match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match) return null;
  const seconds = Number(match[1]) * 60 + Number(match[2]);
  return seconds >= 120 && seconds <= 1200 ? seconds : null;
}

export function formatTrackPaceInput(value) {
  const raw = String(value ?? "").trim().replace(/[.,]/g, ":").replace(/[^0-9:]/g, "");
  if (!raw) return "";
  if (raw.includes(":")) {
    const [minutes = "", seconds = ""] = raw.split(":", 2);
    return `${minutes.slice(0, 2)}:${seconds.slice(0, 2)}`;
  }
  if (raw.length < 3) return raw.slice(0, 2);
  const digits = raw.slice(0, 4);
  return `${digits.slice(0, -2)}:${digits.slice(-2)}`;
}

function formatPaceSeconds(value) {
  const seconds = Math.max(0, Math.round(Number(value) || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function normalizeTrackPace(value) {
  const seconds = paceSeconds(value);
  return seconds == null ? "" : formatPaceSeconds(seconds);
}

export function trackWorkoutTemplateLabel(input = {}) {
  const name = cleanText(input?.templateName);
  if (!name) return "";
  return name
    .replace(/\s+-\s+/g, " – ")
    .replace(/(\d)\s*[xX]\s*(?=\d)/g, "$1 × ")
    .replace(/\s*@\s*/g, " @ ")
    .replace(/\s*\/\s*/g, " / ");
}

export function normalizePaceTolerance(value) {
  return clamp(value, 1, 60, 5);
}

export function trackPaceRange(input = {}) {
  const targetPace = normalizeTrackPace(input.targetPace);
  const targetSeconds = paceSeconds(targetPace);
  if (targetSeconds == null) return null;
  const toleranceSeconds = normalizePaceTolerance(input.paceToleranceSeconds);
  return {
    targetPace,
    toleranceSeconds,
    fasterPace: formatPaceSeconds(Math.max(120, targetSeconds - toleranceSeconds)),
    slowerPace: formatPaceSeconds(targetSeconds + toleranceSeconds),
  };
}

export function trackStepGarminCue(input = {}) {
  const step = normalizeTrackStep(input, input?.kind === "recovery" ? "recovery" : "work");
  if (step.kind === "recovery") {
    return step.unit === "distance" ? `${step.value}er Trab` : "Trabpause";
  }
  const paceRange = trackPaceRange(step);
  if (step.unit === "distance") {
    return `${step.value}er${paceRange ? ` @ ${paceRange.targetPace}/km` : " Belastung"}`;
  }
  return paceRange ? `Belastung @ ${paceRange.targetPace}/km` : "Belastung";
}

export function isTrackWorkout(item = {}) {
  return /orc\s*track|intervall|interval|sprint|stride|steiger/i.test(`${item.type || ""} ${item.title || ""}`);
}

export function normalizeTrackRounds(value) {
  return clamp(value, 1, 30, DEFAULT_TRACK_WORKOUT.rounds);
}

export function normalizeTrackStep(input = {}, fallbackKind = "work") {
  const kind = input.kind === "recovery"
    ? "recovery"
    : input.kind === "work"
      ? "work"
      : fallbackKind === "recovery" ? "recovery" : "work";
  const unit = input.unit === "time" ? "time" : "distance";
  const paceRange = trackPaceRange(input);
  return {
    kind,
    unit,
    value: clamp(
      input.value,
      unit === "distance" ? 20 : 5,
      unit === "distance" ? 5000 : 3600,
      kind === "recovery" ? 200 : 400,
    ),
    ...(paceRange ? {
      targetPace: paceRange.targetPace,
      paceToleranceSeconds: paceRange.toleranceSeconds,
    } : {}),
  };
}

function legacySteps(input = {}) {
  return [
    normalizeTrackStep({
      kind: "work",
      unit: input.workUnit,
      value: input.workValue,
    }),
    normalizeTrackStep({
      kind: "recovery",
      unit: input.recoveryUnit,
      value: input.recoveryValue,
    }, "recovery"),
  ];
}

export function normalizeTrackWorkout(input = {}) {
  const kind = input.kind === "sprints" ? "sprints" : "intervals";
  const suppliedSteps = Array.isArray(input.steps) ? input.steps.slice(0, 16) : [];
  const steps = (suppliedSteps.length ? suppliedSteps : legacySteps(input))
    .map((step, index) => normalizeTrackStep(step, index % 2 ? "recovery" : "work"));
  const templateId = cleanText(input.templateId, 120);
  const templateName = String(input.templateName || "").slice(0, 80);
  return {
    kind,
    rounds: normalizeTrackRounds(input.rounds ?? input.repeats),
    steps,
    warmupMode: input.warmupMode === "time" ? "time" : "lap",
    cooldownMode: input.cooldownMode === "time" ? "time" : "lap",
    mainControlMode: input.mainControlMode === TRACK_MAIN_CONTROL_MODES.MANUAL_LAP
      ? TRACK_MAIN_CONTROL_MODES.MANUAL_LAP
      : TRACK_MAIN_CONTROL_MODES.AUTOMATIC,
    ...(input.warmupMinutes ? { warmupMinutes: clamp(input.warmupMinutes, 1, 90, 15) } : {}),
    ...(input.cooldownMinutes ? { cooldownMinutes: clamp(input.cooldownMinutes, 1, 60, 10) } : {}),
    planningStatus: input.planningStatus === "draft" ? "draft" : "final",
    ...(templateId ? { templateId } : {}),
    ...(templateName ? { templateName } : {}),
  };
}

export function trackWorkoutForEditing(input) {
  return {
    ...normalizeTrackWorkout(input || {}),
    planningStatus: input && typeof input === "object" ? (input.planningStatus === "draft" ? "draft" : "final") : "draft",
  };
}

export function updateTrackWorkoutDraft(input, field, value) {
  return {
    ...(input || trackWorkoutForEditing()),
    [field]: value,
  };
}

export function updateTrackStepDraft(input, index, field, value) {
  const workout = input || trackWorkoutForEditing();
  return {
    ...workout,
    steps: workout.steps.map((step, stepIndex) => (
      stepIndex === index ? { ...step, [field]: value } : step
    )),
  };
}

export function isProvisionalTrackWorkout(item = {}) {
  return isTrackWorkout(item) && item.structuredWorkout?.planningStatus === "draft";
}

export function buildTrackWorkoutTemplate({ id, name, workout, createdAt, updatedAt }) {
  const normalized = normalizeTrackWorkout(workout);
  return {
    id: cleanText(id, 120),
    name: cleanText(name),
    kind: normalized.kind,
    rounds: normalized.rounds,
    steps: normalized.steps,
    warmupMode: "lap",
    cooldownMode: "lap",
    mainControlMode: normalized.mainControlMode,
    createdAt: String(createdAt || updatedAt || ""),
    updatedAt: String(updatedAt || createdAt || ""),
  };
}

export function normalizeTrackWorkoutTemplates(input = []) {
  const seen = new Set();
  return (Array.isArray(input) ? input : []).map((template) => (
    buildTrackWorkoutTemplate({
      id: template?.id,
      name: template?.name,
      workout: template,
      createdAt: template?.createdAt,
      updatedAt: template?.updatedAt,
    })
  )).filter((template) => {
    if (!template.id || !template.name || seen.has(template.id)) return false;
    seen.add(template.id);
    return true;
  });
}

export function workoutFromTrackTemplate(input = {}) {
  const template = buildTrackWorkoutTemplate({
    id: input.id,
    name: input.name,
    workout: input,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  });
  return {
    ...normalizeTrackWorkout(template),
    templateId: template.id,
    templateName: template.name,
  };
}

function unitLabel(unit, value) {
  return unit === "distance" ? `${value} m` : `${value} s`;
}

export function trackWorkoutSummary(input = {}) {
  const workout = normalizeTrackWorkout(input);
  const lapControlled = workout.mainControlMode === TRACK_MAIN_CONTROL_MODES.MANUAL_LAP;
  const sequence = workout.steps
    .map((step) => {
      const paceRange = trackPaceRange(step);
      const pace = paceRange ? ` @ ${paceRange.targetPace}/km (±${paceRange.toleranceSeconds} s)` : "";
      return `${unitLabel(step.unit, step.value)} ${step.kind === "recovery" ? "Pause" : "Belastung"}${pace}`;
    })
    .join(" → ");
  const mainControl = lapControlled
    ? "Bahn-LAP: Distanzschritte per LAP, Zeitabschnitte automatisch"
    : "Hauptteil automatisch";
  return `Warm-up bis LAP · ${workout.rounds} ${workout.rounds === 1 ? "Durchgang" : "Durchgänge"}: ${sequence} · ${mainControl} · Cool-down bis LAP`;
}

function roundedKm(meters) {
  return Number((meters / 1000).toFixed(2));
}

export function trackWorkoutDistance(input = {}) {
  const workout = normalizeTrackWorkout(input);
  const totals = workout.steps.reduce((result, step) => {
    if (step.unit === "time") {
      result.timedSeconds += step.value * workout.rounds;
    } else if (step.kind === "recovery") {
      result.recoveryMeters += step.value * workout.rounds;
    } else {
      result.workMeters += step.value * workout.rounds;
    }
    return result;
  }, { workMeters: 0, recoveryMeters: 0, timedSeconds: 0 });
  const mainDistanceKm = roundedKm(totals.workMeters + totals.recoveryMeters);
  return {
    workDistanceKm: roundedKm(totals.workMeters),
    recoveryDistanceKm: roundedKm(totals.recoveryMeters),
    mainDistanceKm,
    timedSeconds: totals.timedSeconds,
    hasTimedSteps: totals.timedSeconds > 0,
    estimatedTotalMinKm: Number((mainDistanceKm + 4).toFixed(2)),
    estimatedTotalMaxKm: Number((mainDistanceKm + 6).toFixed(2)),
  };
}
