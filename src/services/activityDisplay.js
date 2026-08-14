import { hours, pace } from "../utils/format.js";
import { sportFamily } from "./activityUtils.js";
import { mappedRowingDistanceMeters } from "./rowingDistance.js";

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function kilometreLabel(distance) {
  return `${numeric(distance).toLocaleString("de-DE", { maximumFractionDigits: 2 })} km`;
}

function meterLabel(distanceMeters) {
  return `${Math.round(numeric(distanceMeters)).toLocaleString("de-DE")} m`;
}

function pulseLabel(activity) {
  return activity?.avgHr ? `Ø ${Math.round(numeric(activity.avgHr))} bpm` : "Kein Puls";
}

export function activityListMetrics(activity) {
  const family = sportFamily(activity);
  const distance = numeric(activity?.distance);
  const duration = numeric(activity?.duration);
  const durationLabel = hours(duration);
  const rowingMeters = family === "rowing" ? mappedRowingDistanceMeters(activity) : 0;

  let primary = kilometreLabel(distance);
  let detail = durationLabel;

  if (family === "strength") {
    primary = durationLabel;
    detail = null;
  } else if (family === "rowing") {
    primary = rowingMeters ? meterLabel(rowingMeters) : "Distanz offen";
  } else if (!distance) {
    primary = durationLabel;
    detail = null;
  } else if (["running", "walking"].includes(family)) {
    detail = `${durationLabel} · ${pace(distance, duration)}`;
  }

  const elevationRelevant = ["running", "walking", "cycling", "roadCycling"].includes(family);
  const secondaryPrimary = elevationRelevant
    ? `+${Math.round(numeric(activity?.elevation))} m`
    : pulseLabel(activity);
  const secondaryDetail = elevationRelevant ? pulseLabel(activity) : null;

  const primaryLabel = family === "strength" ? "Dauer" : "Distanz";
  const secondaryLabel = elevationRelevant ? "Höhenmeter" : "Puls";

  return {
    family,
    primaryLabel,
    secondaryLabel,
    primary,
    detail,
    secondaryPrimary,
    secondaryDetail,
    rowingMeters,
  };
}
