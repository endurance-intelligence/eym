import { isRoadCyclingActivity } from "./activityUtils.js";

function finiteNumber(value, minimum = Number.NEGATIVE_INFINITY) {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= minimum ? numeric : null;
}

function quantile(sortedValues, fraction) {
  if (!sortedValues.length) return 0;
  const position = Math.max(0, Math.min(sortedValues.length - 1, (sortedValues.length - 1) * fraction));
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sortedValues[lower];
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (position - lower);
}

function chartDomain(values, { minimumSpan = 1, robust = false, floor = null } = {}) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return null;
  let minimum = robust && sorted.length >= 25 ? quantile(sorted, 0.02) : sorted[0];
  let maximum = robust && sorted.length >= 25 ? quantile(sorted, 0.98) : sorted.at(-1);
  const center = (minimum + maximum) / 2;
  if (maximum - minimum < minimumSpan) {
    minimum = center - minimumSpan / 2;
    maximum = center + minimumSpan / 2;
  }
  const padding = Math.max((maximum - minimum) * 0.08, minimumSpan * 0.04);
  minimum -= padding;
  maximum += padding;
  if (floor != null) minimum = Math.max(floor, minimum);
  if (maximum <= minimum) maximum = minimum + minimumSpan;
  return { minimum, maximum };
}

function axisModeFor(points) {
  const distances = points.map((point) => point.distanceKm).filter(Number.isFinite);
  if (distances.length >= 2 && Math.max(...distances) - Math.min(...distances) >= 0.01) return "distance";
  const elapsed = points.map((point) => point.elapsedSeconds).filter(Number.isFinite);
  if (elapsed.length >= 2 && Math.max(...elapsed) - Math.min(...elapsed) >= 1) return "time";
  return "progress";
}

export function activityProfileModel(points = [], activity = {}) {
  const kind = isRoadCyclingActivity(activity) ? "speed" : "pace";
  const normalized = (Array.isArray(points) ? points : []).map((point, routeIndex) => {
    const distanceKm = finiteNumber(point?.distanceKm, 0);
    const altitude = finiteNumber(point?.altitude);
    const speedMps = finiteNumber(point?.speedMps, 0);
    const elapsedSeconds = finiteNumber(point?.elapsedSeconds, 0);
    const effort = speedMps != null && speedMps > 0.25
      ? kind === "speed"
        ? speedMps * 3.6
        : 1000 / speedMps
      : null;
    return {
      ...point,
      routeIndex,
      distanceKm,
      altitude,
      speedMps,
      elapsedSeconds,
      effort,
    };
  });
  const axisMode = axisModeFor(normalized);
  const withAxis = normalized.map((point, index) => ({
    ...point,
    axisValue: axisMode === "distance"
      ? point.distanceKm
      : axisMode === "time"
        ? point.elapsedSeconds
        : index,
  }));
  const axisValues = withAxis.map((point) => point.axisValue).filter(Number.isFinite);
  const altitudeValues = withAxis.map((point) => point.altitude).filter(Number.isFinite);
  const effortValues = withAxis.map((point) => point.effort).filter(Number.isFinite);
  const axisMinimum = axisValues.length ? Math.min(...axisValues) : 0;
  const axisMaximum = axisValues.length ? Math.max(...axisValues) : Math.max(1, withAxis.length - 1);

  return {
    kind,
    axisMode,
    points: withAxis,
    axisDomain: {
      minimum: axisMinimum,
      maximum: axisMaximum > axisMinimum ? axisMaximum : axisMinimum + 1,
    },
    altitudeDomain: chartDomain(altitudeValues, { minimumSpan: 8 }),
    effortDomain: chartDomain(effortValues, {
      minimumSpan: kind === "speed" ? 4 : 45,
      robust: true,
      floor: kind === "speed" ? 0 : 45,
    }),
    altitudeRange: altitudeValues.length
      ? { minimum: Math.min(...altitudeValues), maximum: Math.max(...altitudeValues) }
      : null,
    hasAltitude: altitudeValues.length >= 2,
    hasEffort: effortValues.length >= 2,
  };
}

export function formatProfilePace(paceSeconds) {
  const numeric = finiteNumber(paceSeconds, 0);
  if (numeric == null || numeric <= 0) return "–";
  const rounded = Math.round(numeric);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")} /km`;
}

export function formatProfileEffort(value, kind) {
  const numeric = finiteNumber(value, 0);
  if (numeric == null || numeric <= 0) return "–";
  if (kind === "speed") {
    return `${numeric.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km/h`;
  }
  return formatProfilePace(numeric);
}

export function formatProfileElapsed(seconds) {
  const numeric = finiteNumber(seconds, 0);
  if (numeric == null) return "–";
  const rounded = Math.round(numeric);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const rest = rounded % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`
    : `${minutes}:${String(rest).padStart(2, "0")}`;
}

export function formatProfileAxis(value, mode, maximum) {
  const numeric = finiteNumber(value, 0);
  if (numeric == null) return "";
  if (mode === "distance") {
    const digits = Number(maximum || 0) >= 20 ? 0 : 1;
    return `${numeric.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits })} km`;
  }
  if (mode === "time") {
    if (numeric >= 3600) {
      const hours = Math.floor(numeric / 3600);
      const minutes = Math.round((numeric % 3600) / 60);
      return `${hours}:${String(minutes).padStart(2, "0")} h`;
    }
    return `${Math.round(numeric / 60)} min`;
  }
  const denominator = Math.max(1, Number(maximum || 1));
  return `${Math.round((numeric / denominator) * 100)} %`;
}

export function activityAverageEffort(activity = {}, kind = "pace") {
  const distanceKm = finiteNumber(activity.distance, 0);
  const durationSeconds = finiteNumber(
    Number(activity.durationSeconds || 0) > 0
      ? activity.durationSeconds
      : Number(activity.duration || 0) * 60,
    0,
  );
  if (kind === "speed") {
    const sourceSpeed = finiteNumber(activity.averageSpeed, 0);
    if (sourceSpeed != null && sourceSpeed > 0) return sourceSpeed * 3.6;
    return distanceKm != null && distanceKm > 0 && durationSeconds != null && durationSeconds > 0
      ? distanceKm / (durationSeconds / 3600)
      : null;
  }
  return distanceKm != null && distanceKm > 0 && durationSeconds != null && durationSeconds > 0
    ? durationSeconds / distanceKm
    : null;
}
