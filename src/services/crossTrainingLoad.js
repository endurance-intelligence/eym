import { activityTimestamp, isRoadCyclingActivity, sportFamily } from "./activityUtils.js";

export const ROAD_CYCLING_RUN_EQUIVALENT_RATIO = 3;
export const MAX_CROSS_TRAINING_TARGET_SHARE = 0.35;

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function activityText(activity = {}) {
  return `${activity.type || ""} ${activity.sportType || ""} ${activity.subType || ""} ${activity.name || ""}`.toLowerCase();
}

export function isEBikeActivity(activity = {}) {
  return /e[-\s]?bike|ebike|electric\s*bike|pedelec|electrically assisted/.test(activityText(activity));
}

export function crossTrainingCreditForActivity(activity = {}) {
  const family = sportFamily(activity);
  const distanceKm = Math.max(0, numeric(activity.distance));

  if (family === "soccer") {
    if (distanceKm <= 0) return null;
    return {
      kind: "football",
      label: "Fußball",
      activityId: activity.id || null,
      activityAt: activityTimestamp(activity).toISOString(),
      sourceDistanceKm: distanceKm,
      equivalentKm: distanceKm,
      explanation: "Tatsächlich aufgezeichnete Fußballkilometer zählen als zusätzliche Lauf- und Beinbelastung.",
    };
  }

  if (isRoadCyclingActivity(activity) && !isEBikeActivity(activity)) {
    if (distanceKm <= 0) return null;
    return {
      kind: "roadCycling",
      label: "Rennrad",
      activityId: activity.id || null,
      activityAt: activityTimestamp(activity).toISOString(),
      sourceDistanceKm: distanceKm,
      equivalentKm: distanceKm / ROAD_CYCLING_RUN_EQUIVALENT_RATIO,
      explanation: `Rennrad wird als grobes ${ROAD_CYCLING_RUN_EQUIVALENT_RATIO}:1-Ausdaueräquivalent berücksichtigt.`,
    };
  }

  return null;
}

export function summarizeCrossTrainingCredits(activities = [], options = {}) {
  const details = activities
    .map(crossTrainingCreditForActivity)
    .filter(Boolean);
  const rawEquivalentKm = details.reduce((sum, detail) => sum + detail.equivalentKm, 0);
  const targetKm = Math.max(0, numeric(options.targetKm));
  const maxShare = Math.max(0, numeric(options.maxShare) || MAX_CROSS_TRAINING_TARGET_SHARE);
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

  return {
    details,
    rawEquivalentKm,
    creditedEquivalentKm,
    footballEquivalentKm,
    roadCyclingEquivalentKm,
    rawFootballEquivalentKm,
    rawRoadCyclingEquivalentKm,
    latestActivityAt,
    capKm,
    capped: creditedEquivalentKm + 1e-9 < rawEquivalentKm,
  };
}

export function formatCrossTrainingCredit(summary = {}) {
  const parts = [];
  if (numeric(summary.footballEquivalentKm) > 0) {
    parts.push(`${numeric(summary.footballEquivalentKm).toFixed(1).replace(".0", "")} km Fußball`);
  }
  if (numeric(summary.roadCyclingEquivalentKm) > 0) {
    parts.push(`${numeric(summary.roadCyclingEquivalentKm).toFixed(1).replace(".0", "")} km Rennradäquivalent`);
  }
  return parts.join(" · ");
}
