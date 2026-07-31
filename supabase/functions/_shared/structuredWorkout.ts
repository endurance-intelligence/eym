import { paceTargetForPlanItem } from "./workoutPace.ts";

function safeMinutes(value: unknown, fallback = 60) {
  const parsed = Math.round(Number(value || fallback));
  return Math.max(1, Math.min(24 * 60, Number.isFinite(parsed) ? parsed : fallback));
}

function workoutType(item: Record<string, unknown>) {
  const value = `${item.type || ""} ${item.title || ""}`.toLowerCase();
  if (/rad|ride|bike|cycling/.test(value)) return "Ride";
  return "Run";
}

function safeInteger(value: unknown, minimum: number, maximum: number, fallback: number) {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function stepToken(unit: unknown, value: unknown, fallback: number) {
  const timeBased = unit === "time";
  const amount = safeInteger(value, timeBased ? 5 : 20, timeBased ? 3600 : 5000, fallback);
  return `${amount}${timeBased ? "s" : "mtr"}`;
}

function paceSeconds(value: unknown) {
  const match = String(value || "").trim().replace(/[.,]/, ":").match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match) return null;
  const seconds = Number(match[1]) * 60 + Number(match[2]);
  return seconds >= 120 && seconds <= 1200 ? seconds : null;
}

function formatPace(value: number) {
  const seconds = Math.max(0, Math.round(value));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function paceTarget(step: Record<string, unknown>) {
  const targetSeconds = paceSeconds(step.targetPace);
  if (targetSeconds == null) return "Z5 Pace";
  const tolerance = safeInteger(step.paceToleranceSeconds ?? step.toleranceSeconds, 1, 60, 5);
  const faster = formatPace(Math.max(120, targetSeconds - tolerance));
  const slower = formatPace(targetSeconds + tolerance);
  return `${faster}-${slower}/km Pace`;
}

function structuredSteps(input: Record<string, unknown>) {
  const supplied = Array.isArray(input.steps) ? input.steps.slice(0, 16) : [];
  if (supplied.length) {
    return supplied.map((raw) => {
      const step = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
      const recovery = step.kind === "recovery";
      return {
        kind: recovery ? "recovery" : "work",
        token: stepToken(step.unit, step.value, recovery ? 200 : 400),
        target: recovery ? "" : paceTarget(step),
      };
    });
  }
  return [
    { kind: "work", token: stepToken(input.workUnit, input.workValue, 400), target: "Z5 Pace" },
    { kind: "recovery", token: stepToken(input.recoveryUnit, input.recoveryValue, 200), target: "" },
  ];
}

function structuredTrackDescription(input: Record<string, unknown>) {
  const rounds = safeInteger(input.rounds ?? input.repeats, 1, 30, 8);
  const steps = structuredSteps(input);
  const lines = [
    "Warm-up",
    "- Press lap 15m intensity=warmup",
    "",
    `${input.kind === "sprints" ? "Sprints" : "Hauptteil"} ${rounds}x`,
    ...steps.map((step) => step.kind === "recovery"
      ? `- Pause ${step.token} intensity=recovery`
      : `- Belastung ${step.token} ${step.target} intensity=interval`),
    "",
    "Cool-down",
    "- Press lap 10m intensity=cooldown",
  ];
  return lines.join("\n");
}

function safeLabel(value: unknown, fallback: string) {
  const cleaned = String(value || "").replace(/[\r\n]+/g, " ").trim().slice(0, 80);
  return cleaned || fallback;
}

function safeEffort(value: unknown) {
  const match = String(value || "").trim().match(/^Z([1-5])\s+(HR|Pace)$/i);
  return match ? `Z${match[1]} ${match[2].toUpperCase() === "HR" ? "HR" : "Pace"}` : "Z3 HR";
}

function goalWorkoutDescription(input: Record<string, unknown>) {
  const warmupMinutes = safeInteger(input.warmupMinutes, 0, 60, 15);
  const cooldownMinutes = safeInteger(input.cooldownMinutes, 0, 60, 10);
  const blocks = (Array.isArray(input.blocks) ? input.blocks : [])
    .slice(0, 6)
    .map((raw) => raw && typeof raw === "object" ? raw as Record<string, unknown> : {});
  const lines = [
    "Warm-up",
    `- ${warmupMinutes}m intensity=warmup`,
    "",
  ];
  blocks.forEach((block, index) => {
    const repeats = safeInteger(block.repeats, 1, 30, 1);
    const workMeters = safeInteger(block.workMeters, 0, 10000, 0);
    const workMinutes = safeInteger(block.workMinutes, 0, 180, 0);
    const recoveryMinutes = safeInteger(block.recoveryMinutes, 0, 60, 0);
    const workToken = workMeters > 0 ? `${workMeters}mtr` : `${Math.max(1, workMinutes)}m`;
    const target = paceSeconds(block.targetPace) != null ? paceTarget(block) : safeEffort(block.effort);
    const label = safeLabel(block.label, `Hauptteil ${index + 1}`);
    lines.push(repeats > 1 ? `${label} ${repeats}x` : label);
    lines.push(`- ${workToken} ${target} intensity=interval`);
    if (recoveryMinutes > 0 && repeats > 1) lines.push(`- ${recoveryMinutes}m intensity=recovery`);
    lines.push("");
  });
  lines.push("Cool-down", `- ${cooldownMinutes}m intensity=cooldown`);
  return lines.join("\n");
}

export function isProvisionalTrackPlanItem(item: Record<string, unknown>) {
  const text = `${item.type || ""} ${item.title || ""}`.toLowerCase();
  const structuredWorkout = item.structuredWorkout;
  return /orc\s*track|intervall|interval|sprint/.test(text)
    && Boolean(structuredWorkout && typeof structuredWorkout === "object"
      && (structuredWorkout as Record<string, unknown>).planningStatus === "draft");
}

export function isGuidedPlanItem(item: Record<string, unknown>) {
  const value = `${item.type || ""} ${item.title || ""}`.toLowerCase();
  if (item.calendarOnly || item.raceEvent || item.choicePending || /samstagsoption/.test(value)) return false;
  return /run|lauf|orc|interval|schwelle|backyard|laufband|treadmill|rad|ride|bike|cycling/.test(value)
    && !/fußball|football|soccer|stabi|mobility|mobilität|rudern|row|ruhetag|rest/.test(value);
}

export function intervalDescription(item: Record<string, unknown>) {
  const title = String(item.title || "");
  const type = String(item.type || "");
  const text = `${type} ${title}`.toLowerCase();
  const duration = safeMinutes(item.duration, Math.max(30, Math.round(Number(item.distance || 0) * 6.3)));
  const distance = Math.max(0, Number(item.distance || 0));
  const structuredWorkout = item.structuredWorkout;
  const goalWorkout = item.goalWorkout;

  if (goalWorkout && typeof goalWorkout === "object") {
    return goalWorkoutDescription(goalWorkout as Record<string, unknown>);
  }

  if (structuredWorkout && typeof structuredWorkout === "object" && /orc\s*track|intervall|interval|sprint/.test(text)) {
    return structuredTrackDescription(structuredWorkout as Record<string, unknown>);
  }

  const repeatMatch = title.match(/(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(?:m|meter)/i);
  if (/intervall/.test(text) && repeatMatch) {
    const repeats = Math.max(1, Math.min(40, Number(repeatMatch[1])));
    const meters = Math.max(50, Math.min(5000, Math.round(Number(repeatMatch[2].replace(",", ".")))));
    return [
      "Warm-up",
      "- 15m intensity=warmup",
      "",
      `${repeats}x`,
      `- ${meters}mtr Z5 Pace intensity=interval`,
      `- ${meters}mtr intensity=recovery`,
      "",
      "Cool-down",
      "- 10m intensity=cooldown",
    ].join("\n");
  }

  if (/intervall/.test(text)) {
    return [
      "Warm-up",
      "- 15m intensity=warmup",
      "",
      "6x",
      "- 2m Z5 Pace intensity=interval",
      "- 2m intensity=recovery",
      "",
      "Cool-down",
      "- 10m intensity=cooldown",
    ].join("\n");
  }

  if (/schwelle|threshold|tempo/.test(text)) {
    const main = Math.max(8, duration - 25);
    return [
      "Warm-up",
      "- 15m intensity=warmup",
      "",
      "Schwelle",
      `- ${main}m Z4 Pace intensity=interval`,
      "",
      "Cool-down",
      "- 10m intensity=cooldown",
    ].join("\n");
  }

  if (workoutType(item) === "Ride") {
    return `- ${duration}m Z2 HR`;
  }

  const paceTarget = paceTargetForPlanItem(item);
  if (distance > 0) {
    const roundedDistance = Number(distance.toFixed(1));
    return `- ${roundedDistance}km${paceTarget ? ` ${paceTarget}` : ""}`;
  }
  return `- ${duration}m${paceTarget ? ` ${paceTarget}` : ""}`;
}
