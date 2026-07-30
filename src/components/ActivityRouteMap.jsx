import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { fetchIntervalsActivityRoute } from "../services/intervals";
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

export default function ActivityRouteMap({ activity }) {
  const mapElement = useRef(null);
  const mapInstance = useRef(null);
  const cacheKey = String(activity?.intervalsId || "");
  const available = routeAvailable(activity);
  const [route, setRoute] = useState(() => routeCache.get(cacheKey) || null);
  const [status, setStatus] = useState(() => !available ? "hidden" : routeCache.has(cacheKey) ? "ready" : "loading");
  const [message, setMessage] = useState("");

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
    const coordinates = route.map((point) => [Number(point.lat), Number(point.lon)]);
    const line = L.polyline(coordinates, {
      color: "#a66cff",
      opacity: 0.96,
      weight: 5,
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
    map.fitBounds(line.getBounds(), { padding: [22, 22], maxZoom: 16 });
    window.setTimeout(() => map.invalidateSize(), 0);

    return () => {
      map.remove();
      if (mapInstance.current === map) mapInstance.current = null;
    };
  }, [route, status]);

  if (status === "hidden") return null;

  return (
    <section className={`activity-route-card ${status}`}>
      <div className="activity-route-heading">
        <div>
          <small>GPS-Strecke</small>
          <strong>Deine Route</strong>
        </div>
        {status === "ready" && <span>Start ● · Ziel ●</span>}
      </div>
      {status === "loading" && <div className="activity-route-placeholder">Route wird aus Intervals.icu geladen …</div>}
      {status === "error" && (
        <div className="activity-route-error">
          <strong>Route derzeit nicht verfügbar</strong>
          <span>{message}</span>
        </div>
      )}
      {status === "ready" && <div className="activity-route-map" ref={mapElement} aria-label={`GPS-Route von ${activity.name || "der Aktivität"}`} />}
    </section>
  );
}
