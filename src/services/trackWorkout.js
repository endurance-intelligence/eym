export const DEFAULT_TRACK_WORKOUT = Object.freeze({
  kind: "intervals",
  rounds: 8,
  steps: Object.freeze([
    Object.freeze({ kind: "work", unit: "distance", value: 400 }),
    Object.freeze({ kind: "recovery", unit: "distance", value: 200 }),
  ]),
  warmupMode: "lap",
  cooldownMode: "lap",
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

export function isTrackWorkout(item = {}) {
  return /orc\s*track|intervall|interval|sprint/i.test(`${item.type || ""} ${item.title || ""}`);
}

export function normalizeTrackRounds(value) {
  return clamp(value, 1, 30, DEFAULT_TRACK_WORKOUT.rounds);
}

export function normalizeTrackStep(input = {}, fallbackKind = "work") {
  const kind = input.kind === "recovery" ? "recovery" : fallbackKind === "recovery" ? "recovery" : "work";
  const unit = input.unit === "time" ? "time" : "distance";
  return {
    kind,
    unit,
    value: clamp(
      input.value,
      unit === "distance" ? 20 : 5,
      unit === "distance" ? 5000 : 3600,
      kind === "recovery" ? 200 : 400,
    ),
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
    warmupMode: "lap",
    cooldownMode: "lap",
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
  const sequence = workout.steps
    .map((step) => `${unitLabel(step.unit, step.value)} ${step.kind === "recovery" ? "Pause" : "Belastung"}`)
    .join(" → ");
  return `Warm-up bis LAP · ${workout.rounds} ${workout.rounds === 1 ? "Durchgang" : "Durchgänge"}: ${sequence} · Cool-down bis LAP`;
}
