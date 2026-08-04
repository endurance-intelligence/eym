function positiveNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function normalizedNumber(value) {
  return Number(String(value || "").replace(/\s/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", "."));
}

export function parseRowingDistanceMeters(text) {
  const value = String(text || "").toLowerCase();
  if (!value) return 0;

  const repeatedMeters = value.match(/(\d{1,2})\s*[x×]\s*(\d{3,5})\s*(?:m|meter|mtr)\b/i);
  if (repeatedMeters) {
    const total = Number(repeatedMeters[1]) * Number(repeatedMeters[2]);
    if (total >= 500 && total <= 200000) return total;
  }

  const kilometres = value.match(/(\d+(?:[.,]\d+)?)\s*km\b/i);
  if (kilometres) {
    const total = normalizedNumber(kilometres[1]) * 1000;
    if (Number.isFinite(total) && total >= 500 && total <= 200000) return Math.round(total);
  }

  const metres = [...value.matchAll(/(\d{1,3}(?:[.\s]\d{3})+|\d{3,6})\s*(?:m|meter|mtr)\b/gi)]
    .map((match) => normalizedNumber(match[1]))
    .filter((number) => Number.isFinite(number) && number >= 500 && number <= 200000);
  if (metres.length) return Math.max(...metres);

  const compactFiveK = value.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*k(?:\s|$)/i);
  if (compactFiveK) {
    const total = normalizedNumber(compactFiveK[1]) * 1000;
    if (Number.isFinite(total) && total >= 500 && total <= 200000) return Math.round(total);
  }

  return 0;
}

function looksLikeRowing(activity) {
  const text = `${activity?.type || ""} ${activity?.sport_type || ""} ${activity?.sportType || ""} ${activity?.sub_type || ""} ${activity?.name || ""}`.toLowerCase();
  return /rowing|rowerg|indoor row|rudern|rudergerät/.test(text);
}

export function rawIntervalsDistanceMeters(activity) {
  const standardDistance = positiveNumber(activity?.distance);
  if (standardDistance) return standardDistance;

  const explicitMeters = [
    activity?.distance_m,
    activity?.distance_meters,
    activity?.total_distance,
    activity?.total_distance_m,
    activity?.total_distance_meters,
    activity?.icu_distance,
    activity?.rowing_distance,
    activity?.rowing_distance_m,
    activity?.rowing_distance_meters,
    activity?.erg_distance,
  ].map(positiveNumber).find(Boolean);
  if (explicitMeters) return explicitMeters;

  const explicitKm = [
    activity?.distance_km,
    activity?.total_distance_km,
    activity?.rowing_distance_km,
  ].map(positiveNumber).find(Boolean);
  if (explicitKm) return explicitKm * 1000;

  if (!looksLikeRowing(activity)) return 0;
  return parseRowingDistanceMeters(`${activity?.name || ""} ${activity?.description || ""}`);
}

export function mappedRowingDistanceMeters(activity) {
  const explicit = positiveNumber(activity?.distanceMeters ?? activity?.rowingDistanceMeters);
  if (explicit) return Math.round(explicit);

  const kilometres = positiveNumber(activity?.distance);
  if (kilometres) return Math.round(kilometres * 1000);

  return parseRowingDistanceMeters(`${activity?.name || ""} ${activity?.sourceName || ""} ${activity?.description || ""}`);
}
