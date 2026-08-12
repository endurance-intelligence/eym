function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function cleanText(value, fallback = "") {
  const text = String(value || "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  return text || fallback;
}

function safeRaceKey(value) {
  const key = cleanText(value, "race-strategy")
    .replace(/[^a-zA-Z0-9._:-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
  return key || "race-strategy";
}

function clampInteger(value, min, max, fallback) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function paceText(seconds) {
  const total = Math.max(0, Math.round(Number(seconds || 0)));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function distanceToken(distanceM) {
  const meters = Math.max(1, Math.round(Number(distanceM || 0)));
  if (Math.abs(meters - 1000) <= 10) return "1km";
  if (meters >= 1000 && meters % 1000 === 0) return `${meters / 1000}km`;
  return `${meters}mtr`;
}

export function intervalsRaceWorkoutDescription(workout) {
  const tolerance = clampInteger(workout?.paceToleranceSeconds, 1, 30, 10);
  const steps = Array.isArray(workout?.steps) ? workout.steps : [];
  const lines = ["Race Strategy"];

  steps.forEach((step, index) => {
    const target = clampInteger(step?.paceSecondsPerKm, 120, 1200, 360);
    const fast = Math.max(120, target - tolerance);
    const slow = Math.min(1200, target + tolerance);
    const meters = clampInteger(step?.distanceM, 20, 100000, 1000);
    const partial = Math.abs(meters - 1000) > 20;
    const label = partial ? `KM ${index + 1} · ${(meters / 1000).toFixed(2)} km` : `KM ${index + 1}`;
    lines.push("", label, `- ${distanceToken(meters)} ${paceText(fast)}-${paceText(slow)}/km Pace intensity=active`);
  });

  return lines.join("\n");
}

export function raceWorkoutPublicationFingerprint(workout, publishDate = "") {
  if (!workout) return "";
  const payload = {
    publishDate: String(publishDate || ""),
    name: cleanText(workout.name, ""),
    tolerance: clampInteger(workout.paceToleranceSeconds, 1, 30, 10),
    steps: (Array.isArray(workout.steps) ? workout.steps : []).map((step) => [
      clampInteger(step?.distanceM, 1, 100000, 0),
      clampInteger(step?.paceSecondsPerKm, 120, 1200, 0),
    ]),
  };
  return JSON.stringify(payload);
}

export function buildIntervalsRaceWorkoutPublication({
  workout,
  raceKey,
  raceName,
  publishDate,
} = {}) {
  if (!workout?.compatible || !Array.isArray(workout?.steps) || workout.steps.length === 0) {
    throw new Error(workout?.compatibilityMessage || "Die Rennstrategie ist noch nicht Garmin-kompatibel.");
  }
  if (!validDate(publishDate)) {
    throw new Error("Bitte einen gültigen Garmin-Sync-Tag wählen.");
  }

  const steps = workout.steps.map((step) => ({
    distanceM: clampInteger(step?.distanceM, 20, 100000, 1000),
    paceSecondsPerKm: clampInteger(step?.paceSecondsPerKm, 120, 1200, 360),
  }));
  if (steps.length > Number(workout.maxSteps || 50)) {
    throw new Error(workout.compatibilityMessage || "Die Rennstrategie hat zu viele Garmin-Schritte.");
  }

  return {
    raceKey: safeRaceKey(raceKey),
    raceName: cleanText(raceName, "EI Race Strategy").slice(0, 120),
    publishDate,
    targetDurationMinutes: Math.max(0.1, Number(workout.targetDurationMinutes || 0)),
    paceToleranceSeconds: clampInteger(workout.paceToleranceSeconds, 1, 30, 10),
    steps,
  };
}
