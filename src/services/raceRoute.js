const EARTH_RADIUS_M = 6371000;

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, digits = 0) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function radians(value) {
  return numeric(value) * Math.PI / 180;
}

function haversineMeters(left, right) {
  const lat1 = radians(left.lat);
  const lat2 = radians(right.lat);
  const dLat = lat2 - lat1;
  const dLon = radians(right.lon) - radians(left.lon);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

function tagValue(body, tagName) {
  const match = String(body || "").match(new RegExp(`<(?:\\w+:)?${tagName}\\b[^>]*>([^<]+)<\\/(?:\\w+:)?${tagName}>`, "i"));
  return match ? match[1].trim() : "";
}

function pointMatches(xmlText, tagName) {
  const regex = new RegExp(`<(?:\\w+:)?${tagName}\\b([^>]*)>([\\s\\S]*?)<\\/(?:\\w+:)?${tagName}>`, "gi");
  return [...String(xmlText || "").matchAll(regex)].map((match) => {
    const attrs = match[1] || "";
    const latMatch = attrs.match(/\blat=["']([^"']+)["']/i);
    const lonMatch = attrs.match(/\blon=["']([^"']+)["']/i);
    if (!latMatch || !lonMatch) return null;
    const lat = Number(latMatch[1]);
    const lon = Number(lonMatch[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const eleText = tagValue(match[2], "ele");
    const ele = eleText === "" ? null : numeric(eleText);
    return { lat, lon, ele };
  }).filter(Boolean);
}

function smoothElevation(points) {
  return points.map((point, index) => {
    const values = [];
    for (let offset = -2; offset <= 2; offset += 1) {
      const candidate = points[index + offset]?.ele;
      if (Number.isFinite(candidate)) values.push(candidate);
    }
    return {
      ...point,
      smoothEle: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
    };
  });
}

function addDistance(points) {
  let distanceM = 0;
  return points.map((point, index) => {
    if (index > 0) distanceM += haversineMeters(points[index - 1], point);
    return { ...point, distanceM };
  });
}

function elevationTotals(points) {
  let ascentM = 0;
  let descentM = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1].smoothEle;
    const current = points[index].smoothEle;
    if (!Number.isFinite(previous) || !Number.isFinite(current)) continue;
    const delta = current - previous;
    if (Math.abs(delta) < 0.45) continue;
    if (delta > 0) ascentM += delta;
    else descentM += Math.abs(delta);
  }
  return { ascentM: Math.round(ascentM), descentM: Math.round(descentM) };
}

function compactRoutePoint(point) {
  return {
    distanceKm: round(point.distanceM / 1000, 3),
    elevationM: Number.isFinite(point.smoothEle) ? round(point.smoothEle, 1) : null,
    lat: round(point.lat, 6),
    lon: round(point.lon, 6),
  };
}

function downsample(points, maxPoints = 600) {
  if (points.length <= maxPoints) return points.map(compactRoutePoint);
  const step = (points.length - 1) / (maxPoints - 1);
  return Array.from({ length: maxPoints }, (_, index) => {
    const point = points[Math.min(points.length - 1, Math.round(index * step))];
    return compactRoutePoint(point);
  });
}

function interpolateElevation(points, distanceM) {
  if (!points.length) return null;
  if (distanceM <= 0) return points[0].smoothEle;
  if (distanceM >= points.at(-1).distanceM) return points.at(-1).smoothEle;
  let low = 0;
  let high = points.length - 1;
  while (low + 1 < high) {
    const mid = Math.floor((low + high) / 2);
    if (points[mid].distanceM < distanceM) low = mid;
    else high = mid;
  }
  const left = points[low];
  const right = points[high];
  if (!Number.isFinite(left.smoothEle) || !Number.isFinite(right.smoothEle)) return Number.isFinite(left.smoothEle) ? left.smoothEle : right.smoothEle;
  const span = Math.max(1, right.distanceM - left.distanceM);
  const fraction = clamp((distanceM - left.distanceM) / span, 0, 1);
  return left.smoothEle + (right.smoothEle - left.smoothEle) * fraction;
}

function segmentElevation(points, startM, endM) {
  let gain = 0;
  let loss = 0;
  const samples = [
    { distanceM: startM, elevation: interpolateElevation(points, startM) },
    ...points.filter((point) => point.distanceM > startM && point.distanceM < endM).map((point) => ({ distanceM: point.distanceM, elevation: point.smoothEle })),
    { distanceM: endM, elevation: interpolateElevation(points, endM) },
  ];
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1].elevation;
    const current = samples[index].elevation;
    if (!Number.isFinite(previous) || !Number.isFinite(current)) continue;
    const delta = current - previous;
    if (Math.abs(delta) < 0.45) continue;
    if (delta > 0) gain += delta;
    else loss += Math.abs(delta);
  }
  return {
    gainM: Math.round(gain),
    lossM: Math.round(loss),
    startElevationM: Number.isFinite(samples[0]?.elevation) ? round(samples[0].elevation, 1) : null,
    endElevationM: Number.isFinite(samples.at(-1)?.elevation) ? round(samples.at(-1).elevation, 1) : null,
  };
}

function routeSegments(points, totalDistanceM, stepKm = 1) {
  const segmentM = Math.max(250, numeric(stepKm) * 1000);
  const segments = [];
  for (let startM = 0, index = 0; startM < totalDistanceM - 1; startM += segmentM, index += 1) {
    const endM = Math.min(totalDistanceM, startM + segmentM);
    const distanceKm = (endM - startM) / 1000;
    const elevation = segmentElevation(points, startM, endM);
    const netDelta = Number.isFinite(elevation.startElevationM) && Number.isFinite(elevation.endElevationM)
      ? elevation.endElevationM - elevation.startElevationM
      : 0;
    const netGrade = distanceKm > 0 ? (netDelta / (distanceKm * 1000)) * 100 : 0;
    segments.push({
      index: index + 1,
      startKm: round(startM / 1000, 2),
      endKm: round(endM / 1000, 2),
      distanceKm: round(distanceKm, 3),
      ...elevation,
      netGradePercent: round(netGrade, 1),
    });
  }
  return segments;
}

export function parseGpxRoute(xmlText, { name = "GPX-Strecke", source = "gpx" } = {}) {
  const xml = String(xmlText || "").trim();
  if (!xml) throw new Error("Die GPX-Datei ist leer.");
  const routeName = tagValue(xml, "name") || name;
  let rawPoints = pointMatches(xml, "trkpt");
  if (rawPoints.length < 2) rawPoints = pointMatches(xml, "rtept");
  if (rawPoints.length < 2) throw new Error("In der GPX-Datei wurden keine verwertbaren Trackpunkte gefunden.");

  const points = addDistance(smoothElevation(rawPoints));
  const totalDistanceM = points.at(-1).distanceM;
  if (!(totalDistanceM > 50)) throw new Error("Die GPX-Strecke ist zu kurz oder enthält keine gültigen Koordinaten.");
  const totals = elevationTotals(points);
  const elevations = points.map((point) => point.smoothEle).filter(Number.isFinite);
  const segments = routeSegments(points, totalDistanceM, 1);

  return {
    name: routeName,
    source,
    importedAt: new Date().toISOString(),
    distanceKm: round(totalDistanceM / 1000, 2),
    ascentM: totals.ascentM,
    descentM: totals.descentM,
    minElevationM: elevations.length ? Math.round(Math.min(...elevations)) : null,
    maxElevationM: elevations.length ? Math.round(Math.max(...elevations)) : null,
    pointCount: rawPoints.length,
    profilePoints: downsample(points),
    segments,
  };
}

function terrainClass(segment) {
  const perKmGain = numeric(segment.gainM) / Math.max(0.1, numeric(segment.distanceKm));
  const perKmLoss = numeric(segment.lossM) / Math.max(0.1, numeric(segment.distanceKm));
  const grade = numeric(segment.netGradePercent);
  if (perKmGain >= 90 || grade >= 5) return "steep-up";
  if (perKmGain >= 45 || grade >= 2.5) return "up";
  if (perKmLoss >= 70 || grade <= -3.5) return "down";
  if (perKmGain + perKmLoss >= 55) return "rolling";
  return "flat";
}

function terrainFactor(segment) {
  const distanceKm = Math.max(0.1, numeric(segment.distanceKm));
  const gainPerKm = numeric(segment.gainM) / distanceKm;
  const lossPerKm = numeric(segment.lossM) / distanceKm;
  const totalVerticalPerKm = gainPerKm + lossPerKm;
  let factor = 1 + Math.max(0, gainPerKm - 4) * 0.0032 - Math.min(lossPerKm, 90) * 0.00105;
  if (totalVerticalPerKm >= 70 && gainPerKm >= 20 && lossPerKm >= 20) factor += 0.04;
  if (lossPerKm >= 130) factor += 0.035;
  return clamp(factor, 0.86, 1.68);
}

function terrainCopy(kind) {
  if (kind === "steep-up") return { label: "steiler Anstieg", cue: "Effort deckeln · Pace nicht erzwingen · oben wieder in den Rhythmus finden." };
  if (kind === "up") return { label: "Anstieg", cue: "Nach Belastung laufen · keine Sekunden am Berg erzwingen." };
  if (kind === "down") return { label: "Gefälle", cue: "Gefälle nutzen, aber Schritt und Bremskräfte kontrolliert halten." };
  if (kind === "rolling") return { label: "wellig", cue: "Pace schwanken lassen · Belastung über die Wellen konstant halten." };
  return { label: "flach", cue: "Rhythmus stabilisieren und den geplanten Split sauber einsammeln." };
}

function fuelMinute(row) {
  if (Number(row?.minute) > 0) return Number(row.minute);
  const direct = String(row?.secondary || "").match(/(?:Min|Minute)\s*(\d+(?:[.,]\d+)?)/i);
  if (direct) return numeric(direct[1].replace(",", "."));
  return 0;
}

function targetSegmentForMinute(segments, minute) {
  if (!(minute > 0) || !segments.length) return -1;
  const index = segments.findIndex((segment) => numeric(segment.cumulativeMinutes) >= minute);
  return index >= 0 ? index : segments.length - 1;
}

function chooseFuelSegment(segments, minute) {
  const targetIndex = targetSegmentForMinute(segments, minute);
  if (targetIndex < 0) return -1;
  const candidates = [targetIndex - 1, targetIndex, targetIndex + 1].filter((index) => index >= 0 && index < segments.length);
  return candidates.sort((leftIndex, rightIndex) => {
    const left = segments[leftIndex];
    const right = segments[rightIndex];
    const leftTerrain = ["steep-up", "up"].includes(left.terrain) ? 8 : left.terrain === "rolling" ? 3 : 0;
    const rightTerrain = ["steep-up", "up"].includes(right.terrain) ? 8 : right.terrain === "rolling" ? 3 : 0;
    const leftTiming = Math.abs((numeric(left.cumulativeMinutes) - numeric(left.segmentMinutes) / 2) - minute) * 0.7;
    const rightTiming = Math.abs((numeric(right.cumulativeMinutes) - numeric(right.segmentMinutes) / 2) - minute) * 0.7;
    return (leftTerrain + leftTiming) - (rightTerrain + rightTiming);
  })[0];
}

function normalizedPaceOverrides(paceOverrides, segmentCount) {
  if (!paceOverrides || typeof paceOverrides !== "object") return {};
  return Object.fromEntries(
    Object.entries(paceOverrides)
      .map(([key, value]) => [Number(key), numeric(value)])
      .filter(([index, pace]) => Number.isInteger(index) && index >= 0 && index < segmentCount && pace >= 120 && pace <= 3600)
      .map(([index, pace]) => [String(index), Math.round(pace)]),
  );
}

export function buildRoutePacingPlan({ route, targetDurationMinutes, fuelStrategy = null, paceOverrides = null } = {}) {
  if (!route?.segments?.length) return null;
  const durationMinutes = numeric(targetDurationMinutes);
  if (!(durationMinutes > 0)) return null;

  const targetSeconds = durationMinutes * 60;
  const overrides = normalizedPaceOverrides(paceOverrides, route.segments.length);
  const prepared = route.segments.map((segment, index) => ({
    segment,
    distanceKm: Math.max(0, numeric(segment.distanceKm)),
    factor: terrainFactor(segment),
    overridePace: numeric(overrides[String(index)]),
  }));
  const lockedSeconds = prepared.reduce(
    (sum, item) => sum + (item.overridePace > 0 ? item.distanceKm * item.overridePace : 0),
    0,
  );
  const unlockedWeightedDistance = prepared.reduce(
    (sum, item) => sum + (item.overridePace > 0 ? 0 : item.distanceKm * item.factor),
    0,
  );
  const remainingSeconds = targetSeconds - lockedSeconds;
  const overridesUsable = Object.keys(overrides).length > 0
    && unlockedWeightedDistance > 0
    && remainingSeconds > 0;
  const weightedDistance = prepared.reduce((sum, item) => sum + item.distanceKm * item.factor, 0);
  if (!(weightedDistance > 0)) return null;
  const secondsPerWeightedKm = overridesUsable
    ? remainingSeconds / unlockedWeightedDistance
    : targetSeconds / weightedDistance;

  let cumulativeSeconds = 0;
  const segments = prepared.map(({ segment, distanceKm, factor, overridePace }) => {
    const manualPace = overridesUsable && overridePace > 0;
    const paceSecondsPerKm = manualPace ? overridePace : factor * secondsPerWeightedKm;
    const segmentSeconds = distanceKm * paceSecondsPerKm;
    cumulativeSeconds += segmentSeconds;
    const terrain = terrainClass(segment);
    const copy = terrainCopy(terrain);
    return {
      ...segment,
      terrain,
      terrainLabel: copy.label,
      cue: copy.cue,
      paceSecondsPerKm,
      segmentMinutes: segmentSeconds / 60,
      cumulativeMinutes: cumulativeSeconds / 60,
      manualPace,
      requestedPaceSecondsPerKm: manualPace ? overridePace : 0,
      fuel: [],
      drinkMl: 0,
      drinkProduct: "",
    };
  });

  (Array.isArray(fuelStrategy?.rows) ? fuelStrategy.rows : []).forEach((row) => {
    const minute = fuelMinute(row);
    const index = chooseFuelSegment(segments, minute);
    if (index < 0) return;
    segments[index].drinkMl += Math.max(0, Math.round(numeric(row.drinkMl)));
    if (row.drinkProduct) segments[index].drinkProduct = row.drinkProduct;
    if (Array.isArray(row.fuel)) segments[index].fuel.push(...row.fuel.map((item) => ({ ...item, plannedMinute: minute })));
  });

  return {
    route,
    targetDurationMinutes: durationMinutes,
    averagePaceSecondsPerKm: route.distanceKm > 0 ? targetSeconds / route.distanceKm : 0,
    manualPaceCount: overridesUsable ? Object.keys(overrides).length : 0,
    paceOverridesApplied: overridesUsable,
    paceOverrideWarning: Object.keys(overrides).length > 0 && !overridesUsable
      ? "Die manuellen Paces konnten mit dieser Zielzeit nicht sinnvoll ausgeglichen werden und wurden deshalb ignoriert."
      : "",
    segments,
  };
}

export function routeDistanceWarning(route, expectedDistanceKm) {
  const routeDistance = numeric(route?.distanceKm);
  const expected = numeric(expectedDistanceKm);
  if (!(routeDistance > 0) || !(expected > 0)) return "";
  const delta = Math.abs(routeDistance - expected);
  if (delta <= Math.max(0.35, expected * 0.035)) return "";
  return `GPX ${routeDistance.toLocaleString("de-DE")} km · Rennziel ${expected.toLocaleString("de-DE")} km. Bitte prüfen, ob die richtige Strecke importiert wurde.`;
}
