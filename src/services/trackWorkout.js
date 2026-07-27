export const DEFAULT_TRACK_WORKOUT = Object.freeze({
  kind: "intervals",
  rounds: 8,
  steps: Object.freeze([
    Object.freeze({ kind: "work", unit: "distance", value: 400 }),
    Object.freeze({ kind: "recovery", unit: "distance", value: 200 }),
  ]),
  warmupMode: "lap",
  cooldownMode: "lap",
});

function clamp(value, minimum, maximum, fallback) {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

export function isTrackWorkout(item = {}) {
  return /orc\s*track|intervall|interval|sprint/i.test(`${item.type || ""} ${item.title || ""}`);
}

function normalizeStep(input = {}, fallbackKind = "work") {
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
    normalizeStep({
      kind: "work",
      unit: input.workUnit,
      value: input.workValue,
    }),
    normalizeStep({
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
    .map((step, index) => normalizeStep(step, index % 2 ? "recovery" : "work"));
  return {
    kind,
    rounds: clamp(input.rounds ?? input.repeats, 1, 30, DEFAULT_TRACK_WORKOUT.rounds),
    steps,
    warmupMode: "lap",
    cooldownMode: "lap",
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
