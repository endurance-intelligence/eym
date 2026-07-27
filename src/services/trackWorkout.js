export const DEFAULT_TRACK_WORKOUT = Object.freeze({
  kind: "intervals",
  workUnit: "distance",
  workValue: 400,
  repeats: 8,
  recoveryUnit: "distance",
  recoveryValue: 200,
  warmupMinutes: 15,
  cooldownMinutes: 10,
});

function clamp(value, minimum, maximum, fallback) {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

export function isTrackWorkout(item = {}) {
  return /orc\s*track|intervall|interval|sprint/i.test(`${item.type || ""} ${item.title || ""}`);
}

export function normalizeTrackWorkout(input = {}) {
  const kind = input.kind === "sprints" ? "sprints" : "intervals";
  const workUnit = input.workUnit === "time" ? "time" : "distance";
  const recoveryUnit = input.recoveryUnit === "time" ? "time" : "distance";
  return {
    kind,
    workUnit,
    workValue: clamp(
      input.workValue,
      workUnit === "distance" ? 20 : 5,
      workUnit === "distance" ? 5000 : 3600,
      DEFAULT_TRACK_WORKOUT.workValue,
    ),
    repeats: clamp(input.repeats, 1, 50, DEFAULT_TRACK_WORKOUT.repeats),
    recoveryUnit,
    recoveryValue: clamp(
      input.recoveryValue,
      recoveryUnit === "distance" ? 20 : 5,
      recoveryUnit === "distance" ? 5000 : 3600,
      DEFAULT_TRACK_WORKOUT.recoveryValue,
    ),
    warmupMinutes: clamp(input.warmupMinutes, 0, 90, DEFAULT_TRACK_WORKOUT.warmupMinutes),
    cooldownMinutes: clamp(input.cooldownMinutes, 0, 90, DEFAULT_TRACK_WORKOUT.cooldownMinutes),
  };
}

function unitLabel(unit, value) {
  return unit === "distance" ? `${value} m` : `${value} s`;
}

export function trackWorkoutSummary(input = {}) {
  const workout = normalizeTrackWorkout(input);
  return [
    workout.warmupMinutes ? `${workout.warmupMinutes} min Warm-up` : "",
    `${workout.repeats} × ${unitLabel(workout.workUnit, workout.workValue)} mit ${unitLabel(workout.recoveryUnit, workout.recoveryValue)} Pause`,
    workout.cooldownMinutes ? `${workout.cooldownMinutes} min Cool-down` : "",
  ].filter(Boolean).join(" · ");
}
