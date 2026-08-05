import {
  activityTimestamp,
  isRoadCyclingActivity,
  isRunningActivity,
  sportFamily,
} from "./activityUtils.js";

export const MAX_CROSS_TRAINING_TARGET_SHARE = 0.3;
export const RECOVERY_CROSS_TRAINING_TARGET_SHARE = 0.4;
export const SPECIFIC_CROSS_TRAINING_TARGET_SHARE = 0.2;
export const DEFAULT_EASY_PACE_SECONDS = 390;

const CYCLING_INTENSITY = {
  recovery: { key: "recovery", label: "sehr locker", factor: 0.3, loadFactor: 0.35 },
  easy: { key: "easy", label: "locker", factor: 0.4, loadFactor: 0.5 },
  zone2: { key: "zone2", label: "Zone 2", factor: 0.5, loadFactor: 0.65 },
  tempo: { key: "tempo", label: "zügige Ausdauer", factor: 0.6, loadFactor: 0.8 },
  threshold: { key: "threshold", label: "Schwelle / Intervalle", factor: 0.67, loadFactor: 1 },
};

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round((numeric(value) + Number.EPSILON) * factor) / factor;
}

function median(values = []) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function activityText(activity = {}) {
  return `${activity.type || ""} ${activity.sportType || ""} ${activity.subType || ""} ${activity.name || ""} ${activity.description || ""}`.toLowerCase();
}

function durationMinutes(activity = {}) {
  const seconds = numeric(activity.durationSeconds);
  return seconds > 0 ? seconds / 60 : Math.max(0, numeric(activity.duration));
}

function normalizedIntensity(value) {
  const raw = numeric(value);
  if (raw <= 0) return 0;
  return raw > 2 ? raw / 100 : raw;
}

function zonePercentage(activity, minimumZone, maximumZone = 9) {
  return (activity?.heartRateZones?.zones || [])
    .filter((zone) => numeric(zone.zone) >= minimumZone && numeric(zone.zone) <= maximumZone)
    .reduce((sum, zone) => sum + numeric(zone.percentage), 0);
}

function intensityFromRatio(ratio) {
  if (ratio >= 0.88) return CYCLING_INTENSITY.threshold;
  if (ratio >= 0.72) return CYCLING_INTENSITY.tempo;
  if (ratio >= 0.55) return CYCLING_INTENSITY.zone2;
  if (ratio >= 0.4) return CYCLING_INTENSITY.easy;
  return CYCLING_INTENSITY.recovery;
}

function activityRpe(activity = {}) {
  const raw = numeric(activity.perceivedExertion || activity.rpe || activity.reviewRpe);
  if (raw <= 0) return 0;
  return raw > 10 ? raw / 10 : raw;
}

export function isEBikeActivity(activity = {}) {
  return /e[-\s]?bike|ebike|electric\s*bike|pedelec|electrically assisted/.test(activityText(activity));
}

export function cyclingIntensityProfile(activity = {}) {
  const intensity = normalizedIntensity(activity.intensity || activity.intensityFactor);
  if (intensity > 0) {
    return { ...intensityFromRatio(intensity), source: "Intervals-Intensität", confidence: "high" };
  }

  const ftp = numeric(activity.ftp || activity.functionalThresholdPower || activity.thresholdPower);
  const power = numeric(activity.normalizedPower || activity.weightedAveragePower || activity.averagePower);
  if (ftp > 0 && power > 0) {
    return { ...intensityFromRatio(power / ftp), source: "Leistung relativ zur FTP", confidence: "high" };
  }

  const highShare = zonePercentage(activity, 4);
  const tempoShare = zonePercentage(activity, 3);
  const easyShare = zonePercentage(activity, 2);
  if (highShare + tempoShare + easyShare > 0) {
    if (highShare >= 18) return { ...CYCLING_INTENSITY.threshold, source: "Herzfrequenzzonen", confidence: "high" };
    if (highShare + tempoShare >= 42) return { ...CYCLING_INTENSITY.tempo, source: "Herzfrequenzzonen", confidence: "high" };
    if (easyShare + tempoShare >= 50) return { ...CYCLING_INTENSITY.zone2, source: "Herzfrequenzzonen", confidence: "high" };
    return { ...CYCLING_INTENSITY.easy, source: "Herzfrequenzzonen", confidence: "medium" };
  }

  const rpe = activityRpe(activity);
  if (rpe > 0) {
    if (rpe >= 8) return { ...CYCLING_INTENSITY.threshold, source: "RPE", confidence: "medium" };
    if (rpe >= 6) return { ...CYCLING_INTENSITY.tempo, source: "RPE", confidence: "medium" };
    if (rpe >= 4) return { ...CYCLING_INTENSITY.zone2, source: "RPE", confidence: "medium" };
    if (rpe >= 2) return { ...CYCLING_INTENSITY.easy, source: "RPE", confidence: "medium" };
    return { ...CYCLING_INTENSITY.recovery, source: "RPE", confidence: "medium" };
  }

  const text = activityText(activity);
  if (/intervall|interval|vo2|maximal|sprint|schwelle|threshold/.test(text)) {
    return { ...CYCLING_INTENSITY.threshold, source: "Aktivitätsbeschreibung", confidence: "low" };
  }
  if (/tempo|sweet\s*spot|zügig|hart|intensiv/.test(text)) {
    return { ...CYCLING_INTENSITY.tempo, source: "Aktivitätsbeschreibung", confidence: "low" };
  }
  if (/zone\s*2|z2|grundlage|ga1|endurance/.test(text)) {
    return { ...CYCLING_INTENSITY.zone2, source: "Aktivitätsbeschreibung", confidence: "low" };
  }
  if (/recovery|regeneration|sehr locker/.test(text)) {
    return { ...CYCLING_INTENSITY.recovery, source: "Aktivitätsbeschreibung", confidence: "low" };
  }
  return { ...CYCLING_INTENSITY.easy, source: "konservative Standardannahme", confidence: "low" };
}

export function estimateEasyRunPaceSeconds(activities = [], fallback = DEFAULT_EASY_PACE_SECONDS) {
  const now = Date.now();
  const recent = activities
    .filter(isRunningActivity)
    .filter((activity) => now - activityTimestamp(activity).getTime() <= 120 * 86400000)
    .map((activity) => {
      const distance = numeric(activity.distance);
      const seconds = numeric(activity.durationSeconds) || numeric(activity.duration) * 60;
      const text = activityText(activity);
      const pace = distance > 0 ? seconds / distance : 0;
      const quality = /intervall|interval|track|schwelle|threshold|tempo|sprint|race|wettkampf/.test(text);
      return { pace, quality, explicitEasy: /easy|locker|recovery|regeneration|grundlage|ga1|longrun|long run/.test(text) };
    })
    .filter((entry) => entry.pace >= 270 && entry.pace <= 660 && !entry.quality);

  const explicit = recent.filter((entry) => entry.explicitEasy).map((entry) => entry.pace);
  const pool = explicit.length >= 2 ? explicit : recent.map((entry) => entry.pace);
  const pace = median(pool);
  return Math.round(pace || numeric(fallback) || DEFAULT_EASY_PACE_SECONDS);
}

export function crossTrainingTargetShare({ phaseKey = "", phaseLabel = "", recoveryWeek = false } = {}) {
  if (recoveryWeek) return RECOVERY_CROSS_TRAINING_TARGET_SHARE;
  const phase = `${phaseKey} ${phaseLabel}`.toLowerCase();
  if (/specific|spezif|taper|wettkampf|event/.test(phase)) return SPECIFIC_CROSS_TRAINING_TARGET_SHARE;
  return MAX_CROSS_TRAINING_TARGET_SHARE;
}

export function crossTrainingCreditForActivity(activity = {}, options = {}) {
  const family = sportFamily(activity);
  const distanceKm = Math.max(0, numeric(activity.distance));
  const minutes = durationMinutes(activity);

  if (family === "soccer") {
    if (distanceKm <= 0) return null;
    return {
      kind: "football",
      label: "Fußball",
      activityId: activity.id || null,
      activityAt: activityTimestamp(activity).toISOString(),
      sourceDistanceKm: distanceKm,
      durationMinutes: minutes,
      equivalentKm: distanceKm,
      aerobicMinutes: 0,
      coachLoad: round(numeric(activity.trainingLoad) || minutes * 0.8, 0),
      explanation: "Tatsächlich aufgezeichnete Fußballkilometer zählen als zusätzliche Lauf- und Beinbelastung, ersetzen aber keinen Longrun oder Temporeiz.",
    };
  }

  if (isRoadCyclingActivity(activity) && !isEBikeActivity(activity)) {
    if (minutes <= 0) return null;
    const easyPaceSeconds = Math.max(240, numeric(options.easyPaceSeconds) || DEFAULT_EASY_PACE_SECONDS);
    const intensity = cyclingIntensityProfile(activity);
    const aerobicMinutes = minutes * intensity.factor;
    return {
      kind: "roadCycling",
      label: "Rennrad",
      activityId: activity.id || null,
      activityAt: activityTimestamp(activity).toISOString(),
      sourceDistanceKm: distanceKm,
      durationMinutes: round(minutes, 0),
      intensityKey: intensity.key,
      intensityLabel: intensity.label,
      intensityFactor: intensity.factor,
      intensitySource: intensity.source,
      intensityConfidence: intensity.confidence,
      easyPaceSeconds,
      aerobicMinutes: round(aerobicMinutes, 1),
      equivalentKm: round(aerobicMinutes / (easyPaceSeconds / 60), 2),
      coachLoad: round(numeric(activity.trainingLoad) || minutes * intensity.loadFactor, 0),
      explanation: `${round(minutes, 0)} Minuten Rennrad werden über ${intensity.label} (${intensity.source}) bewertet. Die Strecke selbst bestimmt den Laufersatz nicht.`,
    };
  }

  return null;
}

export function summarizeCrossTrainingCredits(activities = [], options = {}) {
  const easyPaceSeconds = Math.max(
    240,
    numeric(options.easyPaceSeconds)
      || estimateEasyRunPaceSeconds(options.allActivities || activities, options.fallbackEasyPaceSeconds),
  );
  const details = activities
    .map((activity) => {
      const review = options.reviews?.[activity.id] || {};
      return crossTrainingCreditForActivity({
        ...activity,
        reviewRpe: activity.reviewRpe ?? review.rpe,
      }, { easyPaceSeconds });
    })
    .filter(Boolean);
  const rawEquivalentKm = details.reduce((sum, detail) => sum + detail.equivalentKm, 0);
  const rawAerobicMinutes = details.reduce((sum, detail) => sum + numeric(detail.aerobicMinutes), 0);
  const coachLoad = details.reduce((sum, detail) => sum + numeric(detail.coachLoad), 0);
  const targetKm = Math.max(0, numeric(options.targetKm));
  const configuredShare = numeric(options.maxShare);
  const maxShare = configuredShare > 0
    ? configuredShare
    : crossTrainingTargetShare(options);
  const capKm = targetKm > 0 ? targetKm * maxShare : rawEquivalentKm;
  const creditedEquivalentKm = Math.min(rawEquivalentKm, capKm);
  const latestActivityAt = details.reduce((latest, detail) => {
    const timestamp = Date.parse(detail.activityAt || "");
    return Number.isFinite(timestamp) ? Math.max(latest, timestamp) : latest;
  }, 0);
  const rawFootballEquivalentKm = details
    .filter((detail) => detail.kind === "football")
    .reduce((sum, detail) => sum + detail.equivalentKm, 0);
  const rawRoadCyclingEquivalentKm = details
    .filter((detail) => detail.kind === "roadCycling")
    .reduce((sum, detail) => sum + detail.equivalentKm, 0);
  const footballEquivalentKm = Math.min(rawFootballEquivalentKm, creditedEquivalentKm);
  const roadCyclingEquivalentKm = Math.min(
    rawRoadCyclingEquivalentKm,
    Math.max(0, creditedEquivalentKm - footballEquivalentKm),
  );
  const creditedRoadCyclingAerobicMinutes = rawRoadCyclingEquivalentKm > 0
    ? rawAerobicMinutes * (roadCyclingEquivalentKm / rawRoadCyclingEquivalentKm)
    : 0;

  return {
    details,
    easyPaceSeconds,
    rawEquivalentKm,
    creditedEquivalentKm,
    footballEquivalentKm,
    roadCyclingEquivalentKm,
    rawFootballEquivalentKm,
    rawRoadCyclingEquivalentKm,
    rawAerobicMinutes,
    creditedRoadCyclingAerobicMinutes,
    coachLoad,
    latestActivityAt,
    capKm,
    maxShare,
    capped: creditedEquivalentKm + 1e-9 < rawEquivalentKm,
  };
}

function compact(value) {
  return numeric(value).toFixed(1).replace(".0", "").replace(".", ",");
}

export function formatCrossTrainingCredit(summary = {}) {
  const parts = [];
  if (numeric(summary.footballEquivalentKm) > 0) {
    parts.push(`${compact(summary.footballEquivalentKm)} km Fußball`);
  }
  if (numeric(summary.roadCyclingEquivalentKm) > 0) {
    const minutes = Math.round(numeric(summary.creditedRoadCyclingAerobicMinutes));
    parts.push(`${minutes} Laufmin Rennrad (ca. ${compact(summary.roadCyclingEquivalentKm)} km)`);
  }
  return parts.join(" · ");
}
