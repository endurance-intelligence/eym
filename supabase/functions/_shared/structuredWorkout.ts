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


function lapPlaceholderToken(step: Record<string, unknown>) {
  const meters = safeInteger(step.value, 20, 5000, step.kind === "recovery" ? 200 : 400);
  const target = paceSeconds(step.targetPace);
  const pacePerKm = target ?? (step.kind === "recovery" ? 450 : 330);
  const seconds = Math.max(10, Math.min(3600, Math.round((meters / 1000) * pacePerKm)));
  return `${seconds}s`;
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
      const unit = step.unit === "time" ? "time" : "distance";
      const value = safeInteger(step.value, unit === "time" ? 5 : 20, unit === "time" ? 3600 : 5000, recovery ? 200 : 400);
      const targetPace = paceSeconds(step.targetPace);
      const cue = recovery
        ? (unit === "distance" ? `${value}er Trab` : "Trabpause")
        : unit === "distance"
          ? `${value}er${targetPace == null ? " Belastung" : ` @ ${formatPace(targetPace)}/km`}`
          : targetPace == null ? "Belastung" : `Belastung @ ${formatPace(targetPace)}/km`;
      return {
        kind: recovery ? "recovery" : "work",
        unit,
        value,
        targetPace: step.targetPace,
        paceToleranceSeconds: step.paceToleranceSeconds ?? step.toleranceSeconds,
        token: stepToken(unit, value, recovery ? 200 : 400),
        target: recovery ? "" : paceTarget(step),
        cue,
      };
    });
  }
  const workUnit = input.workUnit === "time" ? "time" : "distance";
  const recoveryUnit = input.recoveryUnit === "time" ? "time" : "distance";
  const workValue = safeInteger(input.workValue, workUnit === "time" ? 5 : 20, workUnit === "time" ? 3600 : 5000, 400);
  const recoveryValue = safeInteger(input.recoveryValue, recoveryUnit === "time" ? 5 : 20, recoveryUnit === "time" ? 3600 : 5000, 200);
  return [
    { kind: "work", unit: workUnit, value: workValue, token: stepToken(workUnit, workValue, 400), target: "Z5 Pace", cue: workUnit === "distance" ? `${workValue}er Belastung` : "Belastung" },
    { kind: "recovery", unit: recoveryUnit, value: recoveryValue, token: stepToken(recoveryUnit, recoveryValue, 200), target: "", cue: recoveryUnit === "distance" ? `${recoveryValue}er Trab` : "Trabpause" },
  ];
}

function structuredTrackDescription(input: Record<string, unknown>) {
  const rounds = safeInteger(input.rounds ?? input.repeats, 1, 30, 8);
  const steps = structuredSteps(input);
  const warmupMinutes = safeInteger(input.warmupMinutes, 1, 90, 15);
  const cooldownMinutes = safeInteger(input.cooldownMinutes, 1, 60, 10);
  const warmupStep = input.warmupMode === "time"
    ? `- ${warmupMinutes}m intensity=warmup`
    : `- Press lap ${warmupMinutes}m intensity=warmup`;
  const cooldownStep = input.cooldownMode === "time"
    ? `- ${cooldownMinutes}m intensity=cooldown`
    : `- Press lap ${cooldownMinutes}m intensity=cooldown`;
  const lines = [
    "Warm-up",
    warmupStep,
    "",
    `${input.kind === "sprints" ? "Sprints" : "Hauptteil"} ${rounds}x`,
    ...steps.map((step) => {
      const manualDistance = input.mainControlMode === "manual_lap" && step.unit === "distance";
      const token = manualDistance
        ? `Press lap ${lapPlaceholderToken(step as Record<string, unknown>)}`
        : step.token;
      return step.kind === "recovery"
        ? `- ${step.cue} ${token} intensity=recovery`
        : `- ${step.cue} ${token} ${step.target} intensity=interval`;
    }),
    "",
    "Cool-down",
    cooldownStep,
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
    lines.push(`- Intervall ${workToken} ${target} intensity=interval`);
    if (recoveryMinutes > 0 && repeats > 1) lines.push(`- Trabpause ${recoveryMinutes}m intensity=recovery`);
    lines.push("");
  });
  lines.push("Cool-down", `- ${cooldownMinutes}m intensity=cooldown`);
  return lines.join("\n");
}

function loopPaceTarget(input: Record<string, unknown>) {
  const mode = String(input.paceMode || "none");
  if (mode === "none") return "";
  const fasterValue = mode === "coach" ? input.coachFaster : input.faster;
  const slowerValue = mode === "coach" ? input.coachSlower : input.slower;
  const fasterSeconds = paceSeconds(fasterValue);
  const slowerSeconds = paceSeconds(slowerValue);
  if (fasterSeconds == null || slowerSeconds == null) return "";
  const faster = formatPace(Math.min(fasterSeconds, slowerSeconds));
  const slower = formatPace(Math.max(fasterSeconds, slowerSeconds));
  return `${slower}-${faster}/km Pace`;
}

function loopWorkoutDescription(item: Record<string, unknown>) {
  const raw = item.loopTraining && typeof item.loopTraining === "object"
    ? item.loopTraining as Record<string, unknown>
    : {};
  const loops = safeInteger(raw.loops, 1, 30, 2);
  const loopKm = Math.max(0.1, Math.min(100, Number(raw.loopKm || Number(item.distance || 0) / loops || 6.7)));
  const controlMode = raw.controlMode === "automatic_distance" ? "automatic_distance" : "manual_lap";
  const target = loopPaceTarget(raw);
  const runMinutes = safeMinutes(raw.estimatedRunMinutesPerLoop, Math.max(20, Math.round(loopKm * 7.5)));
  const intervalMinutes = safeMinutes(raw.intervalMinutes, 60);
  const plannedStopMinutes = safeMinutes(raw.plannedStopMinutes, 3);
  const pauseMinutes = String(raw.mode || "") === "fixed_interval"
    ? Math.max(1, intervalMinutes - runMinutes)
    : plannedStopMinutes;
  const lines: string[] = [];

  for (let index = 0; index < loops; index += 1) {
    lines.push(`Runde ${index + 1}`);
    lines.push(controlMode === "manual_lap"
      ? `- Press lap ${runMinutes}m${target ? ` ${target}` : ""} intensity=active`
      : `- ${Number(loopKm.toFixed(1))}km${target ? ` ${target}` : ""} intensity=active`);
    if (index < loops - 1) {
      lines.push("");
      lines.push(`Boxenstopp ${index + 1}`);
      lines.push(`- Press lap ${pauseMinutes}m intensity=recovery`);
      lines.push("");
    }
  }
  return lines.join("\n");
}

export function isProvisionalTrackPlanItem(item: Record<string, unknown>) {
  const text = `${item.type || ""} ${item.title || ""}`.toLowerCase();
  const structuredWorkout = item.structuredWorkout;
  return /orc\s*track|intervall|interval|sprint|stride|steiger/.test(text)
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

  if (item.loopTraining && typeof item.loopTraining === "object") {
    return loopWorkoutDescription(item);
  }

  if (goalWorkout && typeof goalWorkout === "object") {
    return goalWorkoutDescription(goalWorkout as Record<string, unknown>);
  }

  if (structuredWorkout && typeof structuredWorkout === "object" && /orc\s*track|intervall|interval|sprint|stride|steiger/.test(text)) {
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
      `- Intervall ${meters}mtr Z5 Pace intensity=interval`,
      `- Trabpause ${meters}mtr intensity=recovery`,
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
      "- Intervall 2m Z5 Pace intensity=interval",
      "- Trabpause 2m intensity=recovery",
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
      `- Tempo ${main}m Z4 Pace intensity=interval`,
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
