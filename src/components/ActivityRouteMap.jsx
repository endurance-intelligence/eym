import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { fetchIntervalsActivityRoute } from "../services/intervals";
import ActivityElevationPaceChart from "./ActivityElevationPaceChart";
import "./ActivityRouteMap.css";

const routeCache = new Map();

function routeAvailable(activity = {}) {
  if (!activity.intervalsId) return false;
  const type = `${activity.type || ""} ${activity.sportType || ""} ${activity.subType || ""} ${activity.name || ""}`.toLowerCase();
  if (/virtual|treadmill|laufband|indoor/.test(type)) return false;
  if (Array.isArray(activity.streamTypes) && activity.streamTypes.length > 0) {
    return activity.streamTypes.includes("latlng");
  }
  if (activity.hasGpsRoute === false) return false;
  // Older imports may not contain stream metadata yet. Ask Intervals once and
  // hide this section if the activity has no latitude/longitude stream.
  return true;
}

function ActivityRouteMapContent({ activity }) {
  const mapElement = useRef(null);
  const mapInstance = useRef(null);
  const focusMarker = useRef(null);
  const progressLine = useRef(null);
  const cacheKey = String(activity?.intervalsId || "");
  const available = routeAvailable(activity);
  const [route, setRoute] = useState(() => routeCache.get(cacheKey) || null);
  const [status, setStatus] = useState(() => !available ? "hidden" : routeCache.has(cacheKey) ? "ready" : "loading");
  const [message, setMessage] = useState("");
  const [activeRouteIndex, setActiveRouteIndex] = useState(null);
  const coordinates = useMemo(
    () => (route || []).map((point) => [Number(point.lat), Number(point.lon)]),
    [route],
  );

  useEffect(() => {
    if (!available || routeCache.has(cacheKey)) return undefined;

    let cancelled = false;
    fetchIntervalsActivityRoute(cacheKey)
      .then((result) => {
        if (cancelled) return;
        const points = Array.isArray(result.points) ? result.points : [];
        if (points.length < 2) {
          setStatus("hidden");
          return;
        }
        routeCache.set(cacheKey, points);
        setRoute(points);
        setStatus("ready");
      })
      .catch((error) => {
        if (cancelled) return;
        setMessage(error instanceof Error ? error.message : String(error));
        setStatus("error");
      });
    return () => { cancelled = true; };
  }, [available, cacheKey]);

  useEffect(() => {
    if (status !== "ready" || !mapElement.current || !route?.length) return undefined;
    mapInstance.current?.remove();

    const map = L.map(mapElement.current, {
      zoomControl: true,
      scrollWheelZoom: false,
    });
    mapInstance.current = map;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap-Mitwirkende",
      maxZoom: 19,
    }).addTo(map);
    const line = L.polyline(coordinates, {
      color: "#a66cff",
      opacity: 0.82,
      weight: 5,
    }).addTo(map);
    progressLine.current = L.polyline([], {
      color: "#5ee494",
      opacity: 1,
      weight: 6,
      lineCap: "round",
      lineJoin: "round",
    }).addTo(map);
    L.circleMarker(coordinates[0], {
      radius: 6,
      color: "#0a3320",
      fillColor: "#4ade80",
      fillOpacity: 1,
      weight: 2,
    }).bindTooltip("Start").addTo(map);
    L.circleMarker(coordinates.at(-1), {
      radius: 6,
      color: "#32103e",
      fillColor: "#f06cff",
      fillOpacity: 1,
      weight: 2,
    }).bindTooltip("Ziel").addTo(map);
    focusMarker.current = L.circleMarker(coordinates[0], {
      radius: 8,
      color: "#eff8f2",
      fillColor: "#5ee494",
      fillOpacity: 0,
      opacity: 0,
      weight: 3,
    }).addTo(map);
    map.fitBounds(line.getBounds(), { padding: [22, 22], maxZoom: 16 });
    window.setTimeout(() => map.invalidateSize(), 0);

    return () => {
      map.remove();
      focusMarker.current = null;
      progressLine.current = null;
      if (mapInstance.current === map) mapInstance.current = null;
    };
  }, [coordinates, route, status]);

  useEffect(() => {
    if (status !== "ready" || !route?.length || !focusMarker.current || !progressLine.current) return;
    if (activeRouteIndex == null) {
      focusMarker.current.setStyle({ opacity: 0, fillOpacity: 0 });
      progressLine.current.setLatLngs([]);
      return;
    }
    const index = Math.max(0, Math.min(route.length - 1, Number(activeRouteIndex)));
    focusMarker.current
      .setLatLng(coordinates[index])
      .setStyle({ opacity: 1, fillOpacity: 1 })
      .bringToFront();
    progressLine.current.setLatLngs(coordinates.slice(0, index + 1)).bringToFront();
    focusMarker.current.bringToFront();
  }, [activeRouteIndex, coordinates, route, status]);

  if (status === "hidden") return null;

  return (
    <section className={`activity-route-card ${status}`}>
      <div className="activity-route-heading">
        <div>
          <small>GPS-Strecke</small>
          <strong>Deine Route</strong>
        </div>
        {status === "ready" && <span>Interaktiv · Start ● · Ziel ●</span>}
      </div>
      {status === "loading" && <div className="activity-route-placeholder">Route, Höhe und Tempo werden aus Intervals.icu geladen …</div>}
      {status === "error" && (
        <div className="activity-route-error">
          <strong>Route derzeit nicht verfügbar</strong>
          <span>{message}</span>
        </div>
      )}
      {status === "ready" && <div className="activity-route-map" ref={mapElement} aria-label={`GPS-Route von ${activity.name || "der Aktivität"}`} />}
      {status === "ready" && (
        <ActivityElevationPaceChart
          activity={activity}
          points={route}
          activeRouteIndex={activeRouteIndex}
          onActiveRouteIndexChange={setActiveRouteIndex}
        />
      )}
    </section>
  );
}

export default function ActivityRouteMap({ activity }) {
  const activityKey = String(activity?.intervalsId || activity?.id || "activity");
  return <ActivityRouteMapContent activity={activity} key={activityKey} />;
}
