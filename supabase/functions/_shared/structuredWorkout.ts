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

function structuredTrackDescription(input: Record<string, unknown>) {
  const repeats = safeInteger(input.repeats, 1, 50, 8);
  const warmup = safeInteger(input.warmupMinutes, 0, 90, 15);
  const cooldown = safeInteger(input.cooldownMinutes, 0, 90, 10);
  const work = stepToken(input.workUnit, input.workValue, 400);
  const recovery = stepToken(input.recoveryUnit, input.recoveryValue, 200);
  const lines = [];

  if (warmup > 0) {
    lines.push("Warm-up", `- ${warmup}m Z1-Z2 Pace intensity=warmup`, "");
  }
  lines.push(
    input.kind === "sprints" ? "Sprints" : "Intervalle",
    `${repeats}x`,
    `- ${work} Z5 Pace intensity=interval`,
    `- ${recovery} Z1 Pace intensity=recovery`,
  );
  if (cooldown > 0) {
    lines.push("", "Cool-down", `- ${cooldown}m Z1 Pace intensity=cooldown`);
  }
  return lines.join("\n");
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
