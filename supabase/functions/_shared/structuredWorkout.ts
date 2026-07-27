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

function structuredSteps(input: Record<string, unknown>) {
  const supplied = Array.isArray(input.steps) ? input.steps.slice(0, 16) : [];
  if (supplied.length) {
    return supplied.map((raw) => {
      const step = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
      const recovery = step.kind === "recovery";
      return {
        kind: recovery ? "recovery" : "work",
        token: stepToken(step.unit, step.value, recovery ? 200 : 400),
      };
    });
  }
  return [
    { kind: "work", token: stepToken(input.workUnit, input.workValue, 400) },
    { kind: "recovery", token: stepToken(input.recoveryUnit, input.recoveryValue, 200) },
  ];
}

function structuredTrackDescription(input: Record<string, unknown>) {
  const rounds = safeInteger(input.rounds ?? input.repeats, 1, 30, 8);
  const steps = structuredSteps(input);
  const lines = [
    "Warm-up",
    "- Warm-up locker 15m Z1-Z2 Pace press lap intensity=warmup",
    "",
    `${input.kind === "sprints" ? "Sprints" : "Hauptteil"} ${rounds}x`,
    ...steps.map((step) => step.kind === "recovery"
      ? `- Pause ${step.token} Z1 Pace intensity=recovery`
      : `- Belastung ${step.token} Z5 Pace intensity=interval`),
    "",
    "Cool-down",
    "- Cool-down locker 10m Z1 Pace press lap intensity=cooldown",
  ];
  return lines.join("\n");
}

export function isProvisionalTrackPlanItem(item: Record<string, unknown>) {
  const text = `${item.type || ""} ${item.title || ""}`.toLowerCase();
  const structuredWorkout = item.structuredWorkout;
  return /orc\s*track|intervall|interval|sprint/.test(text)
    && Boolean(structuredWorkout && typeof structuredWorkout === "object"
      && (structuredWorkout as Record<string, unknown>).planningStatus === "draft");
}

export function intervalDescription(item: Record<string, unknown>) {
  const title = String(item.title || "");
  const type = String(item.type || "");
  const text = `${type} ${title}`.toLowerCase();
  const duration = safeMinutes(item.duration, Math.max(30, Math.round(Number(item.distance || 0) * 6.3)));
  const distance = Math.max(0, Number(item.distance || 0));
  const structuredWorkout = item.structuredWorkout;

  if (structuredWorkout && typeof structuredWorkout === "object" && /orc\s*track|intervall|interval|sprint/.test(text)) {
    return structuredTrackDescription(structuredWorkout as Record<string, unknown>);
  }

  const repeatMatch = title.match(/(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(?:m|meter)/i);
  if (/intervall/.test(text) && repeatMatch) {
    const repeats = Math.max(1, Math.min(40, Number(repeatMatch[1])));
    const meters = Math.max(50, Math.min(5000, Math.round(Number(repeatMatch[2].replace(",", ".")))));
    return [
      "Warm-up",
      "- 15m Z1-Z2 Pace intensity=warmup",
      "",
      `${repeats}x`,
      `- ${meters}mtr Z5 Pace intensity=interval`,
      `- ${meters}mtr Z1 Pace intensity=recovery`,
      "",
      "Cool-down",
      "- 10m Z1 Pace intensity=cooldown",
    ].join("\n");
  }

  if (/intervall/.test(text)) {
    return [
      "Warm-up",
      "- 15m Z1-Z2 Pace intensity=warmup",
      "",
      "6x",
      "- 2m Z5 Pace intensity=interval",
      "- 2m Z1 Pace intensity=recovery",
      "",
      "Cool-down",
      "- 10m Z1 Pace intensity=cooldown",
    ].join("\n");
  }

  if (/schwelle|threshold|tempo/.test(text)) {
    const main = Math.max(8, duration - 25);
    return [
      "Warm-up",
      "- 15m Z1-Z2 Pace intensity=warmup",
      "",
      "Schwelle",
      `- ${main}m Z4 Pace intensity=interval`,
      "",
      "Cool-down",
      "- 10m Z1 Pace intensity=cooldown",
    ].join("\n");
  }

  if (workoutType(item) === "Ride") {
    return `- ${duration}m Z2 HR`;
  }

  if (distance > 0) {
    const roundedDistance = Number(distance.toFixed(1));
    return `- ${roundedDistance}km Z2 Pace`;
  }
  return `- ${duration}m Z2 Pace`;
}
