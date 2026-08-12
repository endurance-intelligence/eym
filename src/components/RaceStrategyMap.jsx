import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const TERRAIN_COLORS = {
  flat: "#5ee494",
  rolling: "#b985ff",
  up: "#f0bf5b",
  "steep-up": "#ff7777",
  down: "#6fd7ff",
};

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function paceLabel(secondsPerKm) {
  if (!(Number(secondsPerKm) > 0)) return "–";
  const total = Math.round(Number(secondsPerKm));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}/km`;
}

function usablePoints(route) {
  return (Array.isArray(route?.profilePoints) ? route.profilePoints : [])
    .map((point) => ({
      distanceKm: numeric(point.distanceKm),
      lat: Number(point.lat),
      lon: Number(point.lon),
    }))
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon))
    .sort((left, right) => left.distanceKm - right.distanceKm);
}

function coordinateAtDistance(points, distanceKm) {
  if (!points.length) return null;
  const target = Math.max(0, Number(distanceKm || 0));
  if (target <= points[0].distanceKm) return [points[0].lat, points[0].lon];
  if (target >= points.at(-1).distanceKm) return [points.at(-1).lat, points.at(-1).lon];

  let low = 0;
  let high = points.length - 1;
  while (low + 1 < high) {
    const mid = Math.floor((low + high) / 2);
    if (points[mid].distanceKm < target) low = mid;
    else high = mid;
  }

  const left = points[low];
  const right = points[high];
  const span = Math.max(0.000001, right.distanceKm - left.distanceKm);
  const fraction = Math.min(1, Math.max(0, (target - left.distanceKm) / span));
  return [
    left.lat + (right.lat - left.lat) * fraction,
    left.lon + (right.lon - left.lon) * fraction,
  ];
}

function coordinatesForSegment(points, segment) {
  const startKm = numeric(segment.startKm);
  const endKm = numeric(segment.endKm);
  const start = coordinateAtDistance(points, startKm);
  const end = coordinateAtDistance(points, endKm);
  if (!start || !end) return [];
  return [
    start,
    ...points
      .filter((point) => point.distanceKm > startKm && point.distanceKm < endKm)
      .map((point) => [point.lat, point.lon]),
    end,
  ];
}

function kilometreLabel(segment, index, totalSegments) {
  const fullKm = Math.abs(numeric(segment.distanceKm) - 1) < 0.02;
  if (fullKm) return `KM ${index + 1}`;
  if (index === totalSegments - 1) return `KM ${index + 1} · ${numeric(segment.distanceKm).toLocaleString("de-DE", { maximumFractionDigits: 2 })} km`;
  return `${numeric(segment.startKm).toLocaleString("de-DE", { maximumFractionDigits: 1 })}–${numeric(segment.endKm).toLocaleString("de-DE", { maximumFractionDigits: 1 })} km`;
}

export default function RaceStrategyMap({ route, segments = [], activeSegmentIndex = null, onSegmentSelect }) {
  const mapElement = useRef(null);
  const mapInstance = useRef(null);
  const segmentLines = useRef([]);
  const points = useMemo(() => usablePoints(route), [route]);
  const coordinates = useMemo(() => points.map((point) => [point.lat, point.lon]), [points]);
  const available = coordinates.length >= 2;

  useEffect(() => {
    if (!available || !mapElement.current) return undefined;
    mapInstance.current?.remove();
    segmentLines.current = [];

    const map = L.map(mapElement.current, {
      zoomControl: true,
      scrollWheelZoom: false,
    });
    mapInstance.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap-Mitwirkende",
      maxZoom: 19,
    }).addTo(map);

    const baseLine = L.polyline(coordinates, {
      color: "#7f69a9",
      opacity: 0.5,
      weight: 7,
      lineCap: "round",
      lineJoin: "round",
    }).addTo(map);

    segmentLines.current = segments.map((segment, index) => {
      const lineCoordinates = coordinatesForSegment(points, segment);
      if (lineCoordinates.length < 2) return null;
      const line = L.polyline(lineCoordinates, {
        color: TERRAIN_COLORS[segment.terrain] || TERRAIN_COLORS.flat,
        opacity: 0.92,
        weight: 5,
        lineCap: "round",
        lineJoin: "round",
      }).addTo(map);
      line.bindTooltip(`${kilometreLabel(segment, index, segments.length)} · ${paceLabel(segment.paceSecondsPerKm)}`, { sticky: true });
      line.on("click", () => onSegmentSelect?.(index));
      return line;
    });

    L.circleMarker(coordinates[0], {
      radius: 6,
      color: "#0a3320",
      fillColor: "#4ade80",
      fillOpacity: 1,
      weight: 2,
    }).bindTooltip("Start").addTo(map);

    const wholeKm = Math.floor(numeric(route?.distanceKm));
    for (let km = 1; km <= wholeKm; km += 1) {
      if (km >= numeric(route?.distanceKm) - 0.05) break;
      const coordinate = coordinateAtDistance(points, km);
      if (!coordinate) continue;
      const marker = L.circleMarker(coordinate, {
        radius: 10,
        color: "#241435",
        fillColor: "#efe5ff",
        fillOpacity: 0.96,
        weight: 2,
      }).addTo(map);
      marker.bindTooltip(String(km), {
        permanent: true,
        direction: "center",
        className: "race-strategy-km-label",
      });
      marker.on("click", () => onSegmentSelect?.(Math.min(km, segments.length) - 1));
    }

    L.circleMarker(coordinates.at(-1), {
      radius: 7,
      color: "#32103e",
      fillColor: "#f06cff",
      fillOpacity: 1,
      weight: 2,
    }).bindTooltip("Ziel").addTo(map);

    map.fitBounds(baseLine.getBounds(), { padding: [24, 24], maxZoom: 16 });
    window.setTimeout(() => map.invalidateSize(), 0);

    return () => {
      map.remove();
      segmentLines.current = [];
      if (mapInstance.current === map) mapInstance.current = null;
    };
  }, [available, coordinates, onSegmentSelect, points, route?.distanceKm, segments]);

  useEffect(() => {
    if (!segmentLines.current.length) return;
    segmentLines.current.forEach((line, index) => {
      if (!line) return;
      const active = index === activeSegmentIndex;
      line.setStyle({
        opacity: active ? 1 : 0.9,
        weight: active ? 9 : 5,
      });
      if (active) line.bringToFront();
    });
  }, [activeSegmentIndex]);

  if (!available) {
    return (
      <div className="race-strategy-map-missing">
        <strong>Karte braucht einmal neue GPX-Koordinaten</strong>
        <span>Diese Strecke wurde noch mit der älteren GPX-Version gespeichert. GPX bitte einmal neu importieren; danach bleibt die Kartenansicht erhalten.</span>
      </div>
    );
  }

  return <div className="race-strategy-map" ref={mapElement} aria-label={`Kartenansicht der Rennstrecke ${route?.name || ""}`} />;
}
