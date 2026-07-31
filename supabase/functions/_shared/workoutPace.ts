const MIN_PACE_SECONDS = 180;
const MAX_PACE_SECONDS = 900;

function clamp(value: number) {
  return Math.max(MIN_PACE_SECONDS, Math.min(MAX_PACE_SECONDS, value));
}

function roundToFive(value: number) {
  return Math.round(value / 5) * 5;
}

function paceSeconds(value: unknown) {
  const match = String(value || "").trim().replace(/[.,]/, ":").match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match) return null;
  const seconds = Number(match[1]) * 60 + Number(match[2]);
  return seconds >= MIN_PACE_SECONDS && seconds <= MAX_PACE_SECONDS ? seconds : null;
}

function formatPace(value: number) {
  const seconds = clamp(Math.round(value));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function workoutText(item: Record<string, unknown>) {
  return `${item.type || ""} ${item.title || ""}`.toLowerCase();
}

function supportsPaceGuidance(item: Record<string, unknown>) {
  const text = workoutText(item);
  if (/rudern|rowing|rad|ride|bike|cycling|schwimm|swim|fußball|football|soccer|stabi|mobility|mobilität|ruhetag|rest/.test(text)) return false;
  if (!/run|lauf|orc|treadmill|laufband|longrun|long run/.test(text)) return false;
  if (item.structuredWorkout || item.goalWorkout || item.raceEvent || item.calendarOnly || item.choicePending) return false;
  return !/track|intervall|interval|schwelle|threshold|tempo|sprint|backyard|loop|wettkampf|race/.test(text);
}

function paceBandSeconds(item: Record<string, unknown>) {
  const text = workoutText(item);
  if (/laufband|treadmill/.test(text)) return 10;
  if (/recovery|regeneration|erholung/.test(text)) return 25;
  if (/long run|longrun/.test(text)) return 20;
  return 15;
}

function isFixedGroupRun(item: Record<string, unknown>) {
  const text = workoutText(item);
  return Boolean(item.fixed || item.commitmentId) && /orc run|gruppenlauf|group run/.test(text);
}

function inferredRange(item: Record<string, unknown>) {
  if (!supportsPaceGuidance(item) || isFixedGroupRun(item)) return null;
  const distance = Number(item.distance || 0);
  const duration = Number(item.duration || 0);
  if (!(distance > 0) || !(duration > 0)) return null;
  const center = clamp((duration * 60) / distance);
  const halfBand = paceBandSeconds(item);
  const faster = formatPace(Math.min(roundToFive(center - halfBand), roundToFive(center + halfBand)));
  const slower = formatPace(Math.max(roundToFive(center - halfBand), roundToFive(center + halfBand)));
  return { faster, slower };
}

export function paceTargetForPlanItem(item: Record<string, unknown>) {
  if (!supportsPaceGuidance(item)) return "";
  const guidance = item.paceGuidance && typeof item.paceGuidance === "object"
    ? item.paceGuidance as Record<string, unknown>
    : null;
  if (guidance?.mode === "none") return "";

  let fasterSeconds = paceSeconds(guidance?.faster);
  let slowerSeconds = paceSeconds(guidance?.slower);
  if (fasterSeconds == null || slowerSeconds == null) {
    const inferred = inferredRange(item);
    fasterSeconds = paceSeconds(inferred?.faster);
    slowerSeconds = paceSeconds(inferred?.slower);
  }
  if (fasterSeconds == null || slowerSeconds == null) return "";

  const faster = formatPace(Math.min(fasterSeconds, slowerSeconds));
  const slower = formatPace(Math.max(fasterSeconds, slowerSeconds));
  // Intervals.icu documents absolute ranges from slower to faster, e.g. 7:15-7:00 Pace.
  return `${slower}-${faster}/km Pace`;
}
