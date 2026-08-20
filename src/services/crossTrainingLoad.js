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

const IMPACT_RANK = { none: 0, watch: 1, review: 2, adjust: 3 };

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

function reviewSignal(review = {}) {
  const rpe = numeric(review.rpe);
  const legs = numeric(review.legs);
  const energy = numeric(review.energy);
  const overall = numeric(review.overallFeeling);
  const hasReview = rpe > 0 || legs > 0 || energy > 0 || overall > 0;
  if (!hasReview) return { key: "missing", label: "Review offen" };
  const strained = (legs > 0 && legs <= 5)
    || (energy > 0 && energy <= 5)
    || (overall > 0 && overall <= 5)
    || rpe >= 8;
  if (strained) return { key: "strained", label: "Erholung auffällig" };
  const stable = (!legs || legs >= 6)
    && (!energy || energy >= 6)
    && (!overall || overall >= 6)
    && (!rpe || rpe <= 7);
  return stable
    ? { key: "stable", label: "Review stabil" }
    : { key: "neutral", label: "Review unauffällig" };
}

function plannedActivitySet(value) {
  if (value instanceof Set) return value;
  return new Set(Array.isArray(value) ? value.map(String) : []);
}

function historicalPeers(activity = {}, allActivities = []) {
  const family = sportFamily(activity);
  const currentAt = activityTimestamp(activity);
  const currentTime = currentAt.getTime();
  const currentWeekday = currentAt.getDay();
  const currentId = String(activity.id || "");
  const recent = (allActivities || [])
    .filter((candidate) => sportFamily(candidate) === family)
    .filter((candidate) => String(candidate.id || "") !== currentId)
    .filter((candidate) => {
      const timestamp = activityTimestamp(candidate).getTime();
      return timestamp > 0 && timestamp < currentTime && currentTime - timestamp <= 180 * 86400000;
    });
  if (family !== "soccer") return recent;
  const sameWeekday = recent.filter((candidate) => activityTimestamp(candidate).getDay() === currentWeekday);
  return sameWeekday.length >= 3 ? sameWeekday : recent;
}

function baselineForActivity(activity = {}, allActivities = []) {
  const peers = historicalPeers(activity, allActivities);
  const family = sportFamily(activity);
  const peerLoads = peers.map((candidate) => crossTrainingCreditForActivity(candidate)).filter(Boolean);
  return {
    sampleSize: peerLoads.length,
    distanceKm: round(median(peerLoads.map((detail) => detail.sourceDistanceKm).filter((value) => value > 0)), 1),
    durationMinutes: round(median(peerLoads.map((detail) => detail.durationMinutes).filter((value) => value > 0)), 0),
    coachLoad: round(median(peerLoads.map((detail) => detail.coachLoad).filter((value) => value > 0)), 0),
    family,
  };
}

function ratio(actual, baseline) {
  const reference = numeric(baseline);
  return reference > 0 ? numeric(actual) / reference : 0;
}

function impactForDetail(detail = {}, activity = {}, options = {}) {
  const review = options.reviews?.[activity.id] || {};
  const reviewState = reviewSignal(review);
  const baseline = baselineForActivity(activity, options.allActivities || []);
  const plannedIds = plannedActivitySet(options.plannedActivityIds);
  const planned = plannedIds.has(String(activity.id || ""));
  const durationRatio = ratio(detail.durationMinutes, baseline.durationMinutes);
  const loadRatio = ratio(detail.coachLoad, baseline.coachLoad);
  const distanceRatio = detail.kind === "football" ? ratio(detail.sourceDistanceKm, baseline.distanceKm) : 0;
  const deviationRatio = Math.max(durationRatio, loadRatio, distanceRatio);
  const baselineReliable = baseline.sampleSize >= 3;
  const highByHistory = baselineReliable && deviationRatio >= 1.35;
  const veryHighByHistory = baselineReliable && deviationRatio >= 1.7;
  const highWithoutHistory = !baselineReliable && (
    (detail.kind === "roadCycling" && detail.durationMinutes >= 150)
    || (detail.kind === "football" && detail.durationMinutes >= 120)
    || detail.coachLoad >= 150
  );
  const unusual = highByHistory || highWithoutHistory;
  const veryUnusual = veryHighByHistory || (!baselineReliable && detail.durationMinutes >= 240);

  let impact = "none";
  if (reviewState.key === "strained") impact = "adjust";
  else if (unusual && reviewState.key === "missing") impact = "review";
  else if (unusual) impact = "watch";

  const comparison = baselineReliable
    ? `${baseline.sampleSize} ähnliche ${detail.label}-Einheiten: typisch ca. ${baseline.durationMinutes || "–"} min${baseline.distanceKm ? ` · ${String(baseline.distanceKm).replace(".", ",")} km` : ""}.`
    : `Noch keine belastbare persönliche ${detail.label}-Baseline (${baseline.sampleSize} Vergleichseinheiten).`;
  const explanation = planned && !unusual && reviewState.key !== "strained"
    ? `${detail.label} war im Wochenplan vorgesehen und liegt im persönlichen Erwartungsbereich. Keine Laufkilometer werden automatisch gekürzt.`
    : impact === "review"
      ? `${detail.label} war deutlich umfangreicher als dein persönlicher Vergleich. Vor einer Planänderung wartet der Coach auf dein Review.`
      : impact === "adjust"
        ? `${detail.label} plus Review zeigen eine steuerungsrelevante Belastung. Nur flexible Folgeeinheiten dürfen angepasst werden; es gibt keine 1:1-Kilometerverrechnung.`
        : unusual
          ? `${detail.label} war auffällig umfangreich, dein Review ist aber unauffällig. Der Laufumfang bleibt zunächst bestehen.`
          : planned
            ? `${detail.label} war wie geplant und wird als Gesamtbelastung berücksichtigt, nicht als Laufkilometer.`
            : `${detail.label} wird als zusätzliche Gesamtbelastung dokumentiert. Ohne auffällige Reaktion entsteht daraus keine automatische Laufkürzung.`;

  return {
    planned,
    baseline,
    baselineReliable,
    deviationRatio: round(deviationRatio, 2),
    unusual,
    veryUnusual,
    reviewState: reviewState.key,
    reviewLabel: reviewState.label,
    impact,
    comparison,
    impactExplanation: explanation,
  };
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
      explanation: "Fußball zählt als zusätzliche Bein- und Gesamtbelastung, bleibt aber getrennt von echten Laufkilometern.",
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
      explanation: `${round(minutes, 0)} Minuten Rennrad werden als Gesamtbelastung über ${intensity.label} (${intensity.source}) eingeordnet. Die Strecke wird nicht in Laufkilometer umgerechnet.`,
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
      const base = crossTrainingCreditForActivity({
        ...activity,
        reviewRpe: activity.reviewRpe ?? review.rpe,
      }, { easyPaceSeconds });
      if (!base) return null;
      return {
        ...base,
        ...impactForDetail(base, activity, options),
      };
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
  const actionable = details.filter((detail) => ["review", "adjust"].includes(detail.impact));
  const latestActionableActivityAt = actionable.reduce((latest, detail) => {
    const timestamp = Date.parse(detail.activityAt || "");
    return Number.isFinite(timestamp) ? Math.max(latest, timestamp) : latest;
  }, 0);
  const impactLevel = details.reduce((current, detail) => (
    IMPACT_RANK[detail.impact] > IMPACT_RANK[current] ? detail.impact : current
  ), "none");
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
    latestActionableActivityAt,
    impactLevel,
    actionable,
    plannedNormalCount: details.filter((detail) => detail.planned && detail.impact === "none").length,
    reviewRequiredCount: details.filter((detail) => detail.impact === "review").length,
    adjustmentRequiredCount: details.filter((detail) => detail.impact === "adjust").length,
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
  if (numeric(summary.rawFootballEquivalentKm) > 0) {
    parts.push(`${compact(summary.rawFootballEquivalentKm)} km Fußball`);
  }
  if (numeric(summary.rawRoadCyclingEquivalentKm) > 0) {
    const minutes = Math.round(numeric(summary.rawAerobicMinutes));
    parts.push(`${minutes} aerobe Rennrad-Minuten`);
  }
  return parts.join(" · ");
}

export function formatCrossTrainingContext(summary = {}) {
  if (!summary?.details?.length) return "Keine zusätzliche sportübergreifende Belastung erkannt";
  if (summary.impactLevel === "adjust") return "Review zeigt steuerungsrelevante Zusatzbelastung";
  if (summary.impactLevel === "review") return "Ungewöhnliche Zusatzbelastung · Review abwarten";
  if (summary.impactLevel === "watch") return "Zusatzbelastung auffällig, aktuell aber stabil verarbeitet";
  if (summary.plannedNormalCount > 0) return "Geplante Zusatzbelastung im persönlichen Bereich";
  return "Zusatzbelastung dokumentiert · keine automatische Laufkürzung";
}
