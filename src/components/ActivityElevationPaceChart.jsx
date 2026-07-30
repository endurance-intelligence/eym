import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  activityAverageEffort,
  activityProfileModel,
  formatProfileAxis,
  formatProfileEffort,
  formatProfileElapsed,
  formatProfilePace,
} from "../services/activityProfile.js";

const CHART_HEIGHT = 250;
const MARGIN = { top: 14, right: 58, bottom: 35, left: 50 };

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function rangeTicks(domain, count = 3) {
  if (!domain) return [];
  return Array.from(
    { length: count },
    (_entry, index) => domain.minimum + ((domain.maximum - domain.minimum) * index) / (count - 1),
  );
}

function pathSegments(points, valueKey, xScale, yScale) {
  const segments = [];
  let current = [];
  points.forEach((point) => {
    const value = point[valueKey];
    if (!Number.isFinite(point.axisValue) || !Number.isFinite(value)) {
      if (current.length) segments.push(current);
      current = [];
      return;
    }
    current.push([xScale(point.axisValue), yScale(value)]);
  });
  if (current.length) segments.push(current);
  return segments;
}

function linePath(segments) {
  return segments
    .filter((segment) => segment.length >= 2)
    .map((segment) => segment.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`).join(" "))
    .join(" ");
}

function areaPath(segments, baseline) {
  return segments
    .filter((segment) => segment.length >= 2)
    .map((segment) => {
      const first = segment[0];
      const last = segment.at(-1);
      const line = segment.map(([x, y]) => `L${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
      return `M${first[0].toFixed(2)},${baseline.toFixed(2)} ${line} L${last[0].toFixed(2)},${baseline.toFixed(2)} Z`;
    })
    .join(" ");
}

function useMeasuredWidth(reference) {
  const [width, setWidth] = useState(720);

  useEffect(() => {
    const element = reference.current;
    if (!element) return undefined;
    const update = () => setWidth(Math.max(280, Math.round(element.getBoundingClientRect().width || 720)));
    update();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(update);
      observer.observe(element);
      return () => observer.disconnect();
    }
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [reference]);

  return width;
}

function distanceLabel(distanceKm) {
  if (!Number.isFinite(distanceKm)) return "–";
  return `${distanceKm.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km`;
}

function altitudeLabel(altitude) {
  return Number.isFinite(altitude) ? `${Math.round(altitude)} m` : "–";
}

function averageDurationSeconds(activity) {
  const direct = Number(activity?.durationSeconds || 0);
  return direct > 0 ? direct : Number(activity?.duration || 0) * 60;
}

export default function ActivityElevationPaceChart({
  activity,
  points,
  activeRouteIndex,
  onActiveRouteIndexChange,
}) {
  const chartRef = useRef(null);
  const width = useMeasuredWidth(chartRef);
  const model = useMemo(() => activityProfileModel(points, activity), [activity, points]);
  const gradientId = `activity-profile-${useId().replaceAll(":", "")}`;
  const plotWidth = Math.max(1, width - MARGIN.left - MARGIN.right);
  const plotHeight = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;
  const plotBottom = MARGIN.top + plotHeight;
  const xScale = (value) => {
    const fraction = (value - model.axisDomain.minimum) / (model.axisDomain.maximum - model.axisDomain.minimum);
    return MARGIN.left + clamp(fraction, 0, 1) * plotWidth;
  };
  const altitudeScale = (value) => {
    if (!model.altitudeDomain) return plotBottom;
    const fraction = (value - model.altitudeDomain.minimum) / (model.altitudeDomain.maximum - model.altitudeDomain.minimum);
    return plotBottom - clamp(fraction, 0, 1) * plotHeight;
  };
  const effortScale = (value) => {
    if (!model.effortDomain) return plotBottom;
    const fraction = (value - model.effortDomain.minimum) / (model.effortDomain.maximum - model.effortDomain.minimum);
    return model.kind === "pace"
      ? MARGIN.top + clamp(fraction, 0, 1) * plotHeight
      : plotBottom - clamp(fraction, 0, 1) * plotHeight;
  };
  const altitudeSegments = pathSegments(model.points, "altitude", xScale, altitudeScale);
  const effortSegments = pathSegments(model.points, "effort", xScale, effortScale);
  const altitudePath = linePath(altitudeSegments);
  const profileAreaPath = areaPath(altitudeSegments, plotBottom);
  const effortPath = linePath(effortSegments);
  const activePoint = model.points.find((point) => point.routeIndex === activeRouteIndex) || null;
  const interactivePoints = model.points.filter((point) => Number.isFinite(point.axisValue));
  const averageEffort = activityAverageEffort(activity, model.kind);
  const durationSeconds = averageDurationSeconds(activity);
  const activeX = activePoint && Number.isFinite(activePoint.axisValue) ? xScale(activePoint.axisValue) : null;
  const xTicks = Array.from(
    { length: 5 },
    (_entry, index) => model.axisDomain.minimum
      + ((model.axisDomain.maximum - model.axisDomain.minimum) * index) / 4,
  );
  const altitudeTicks = rangeTicks(model.altitudeDomain);
  const effortTicks = rangeTicks(model.effortDomain);
  const defaultAltitude = model.altitudeRange
    ? `${Math.round(model.altitudeRange.minimum)}–${Math.round(model.altitudeRange.maximum)} m`
    : "Keine Messwerte";
  const summaryDistance = Number(activity?.distance || 0) > 0
    ? distanceLabel(Number(activity.distance))
    : "–";
  const activePosition = activePoint
    ? Number.isFinite(activePoint.distanceKm)
      ? distanceLabel(activePoint.distanceKm)
      : Number.isFinite(activePoint.elapsedSeconds)
        ? formatProfileElapsed(activePoint.elapsedSeconds)
        : formatProfileAxis(activePoint.axisValue, model.axisMode, model.axisDomain.maximum)
    : summaryDistance;
  const activePositionLabel = activePoint
    ? Number.isFinite(activePoint.distanceKm)
      ? "Position"
      : model.axisMode === "time"
        ? "Zeitpunkt"
        : "Streckenpunkt"
    : "Strecke";

  if (!model.hasAltitude && !model.hasEffort) return null;

  function selectAtClientX(clientX) {
    const bounds = chartRef.current?.getBoundingClientRect();
    if (!bounds || !interactivePoints.length) return;
    const localX = (clientX - bounds.left) * (width / bounds.width);
    const chartX = clamp(localX, MARGIN.left, width - MARGIN.right);
    const nearest = interactivePoints.reduce((best, point) => (
      Math.abs(xScale(point.axisValue) - chartX) < Math.abs(xScale(best.axisValue) - chartX) ? point : best
    ));
    onActiveRouteIndexChange(nearest.routeIndex);
  }

  function moveSelection(direction) {
    if (!interactivePoints.length) return;
    const current = interactivePoints.findIndex((point) => point.routeIndex === activeRouteIndex);
    const fallback = direction > 0 ? 0 : interactivePoints.length - 1;
    const next = current < 0 ? fallback : clamp(current + direction, 0, interactivePoints.length - 1);
    onActiveRouteIndexChange(interactivePoints[next].routeIndex);
  }

  return (
    <section className="activity-profile-panel">
      <div className="activity-profile-heading">
        <div>
          <small>Streckenanalyse</small>
          <strong>Höhe &amp; Tempo</strong>
        </div>
        <div className="activity-profile-legend" aria-label="Legende">
          {model.hasAltitude && <span><i className="altitude" />Höhe</span>}
          {model.hasEffort && <span><i className="effort" />{model.kind === "pace" ? "Pace" : "Geschwindigkeit"}</span>}
        </div>
      </div>

      <div className={`activity-profile-readout ${activePoint ? "active" : ""}`} aria-live="polite">
        <article>
          <small>{activePositionLabel}</small>
          <strong>{activePosition}</strong>
        </article>
        <article>
          <small>{activePoint ? "Höhe" : "Höhenlage"}</small>
          <strong>{activePoint ? altitudeLabel(activePoint.altitude) : defaultAltitude}</strong>
        </article>
        <article>
          <small>{activePoint ? (model.kind === "pace" ? "Pace" : "Tempo") : (model.kind === "pace" ? "Ø Pace" : "Ø Tempo")}</small>
          <strong>{formatProfileEffort(activePoint ? activePoint.effort : averageEffort, model.kind)}</strong>
        </article>
        <article>
          <small>{activePoint ? "Laufzeit" : "Dauer"}</small>
          <strong>{formatProfileElapsed(activePoint ? activePoint.elapsedSeconds : durationSeconds)}</strong>
        </article>
      </div>

      <div className="activity-profile-chart" ref={chartRef}>
        <svg
          width={width}
          height={CHART_HEIGHT}
          viewBox={`0 0 ${width} ${CHART_HEIGHT}`}
          role="img"
          aria-label={`Interaktiver Verlauf von Höhe und ${model.kind === "pace" ? "Pace" : "Geschwindigkeit"}`}
          tabIndex="0"
          onPointerDown={(event) => selectAtClientX(event.clientX)}
          onPointerMove={(event) => selectAtClientX(event.clientX)}
          onPointerLeave={(event) => {
            if (event.pointerType !== "touch") onActiveRouteIndexChange(null);
          }}
          onBlur={() => onActiveRouteIndexChange(null)}
          onFocus={() => {
            if (activeRouteIndex == null && interactivePoints.length) {
              onActiveRouteIndexChange(interactivePoints[Math.floor(interactivePoints.length / 2)].routeIndex);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              moveSelection(-1);
            }
            if (event.key === "ArrowRight") {
              event.preventDefault();
              moveSelection(1);
            }
          }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#5ee494" stopOpacity=".34" />
              <stop offset="100%" stopColor="#5ee494" stopOpacity=".025" />
            </linearGradient>
          </defs>

          <rect className="activity-profile-plot-bg" x={MARGIN.left} y={MARGIN.top} width={plotWidth} height={plotHeight} rx="12" />
          {[0, 0.5, 1].map((fraction) => {
            const y = MARGIN.top + fraction * plotHeight;
            return <line className="activity-profile-grid" x1={MARGIN.left} x2={width - MARGIN.right} y1={y} y2={y} key={fraction} />;
          })}
          {xTicks.map((value) => {
            const x = xScale(value);
            return (
              <g key={value}>
                <line className="activity-profile-grid vertical" x1={x} x2={x} y1={MARGIN.top} y2={plotBottom} />
                <text className="activity-profile-axis x" x={x} y={CHART_HEIGHT - 10} textAnchor="middle">
                  {formatProfileAxis(value, model.axisMode, model.axisDomain.maximum)}
                </text>
              </g>
            );
          })}

          {profileAreaPath && <path d={profileAreaPath} fill={`url(#${gradientId})`} />}
          {altitudePath && <path className="activity-profile-altitude-line" d={altitudePath} />}
          {effortPath && <path className="activity-profile-effort-line" d={effortPath} />}

          {altitudeTicks.map((value) => (
            <text className="activity-profile-axis y altitude" x={MARGIN.left - 8} y={altitudeScale(value) + 3} textAnchor="end" key={value}>
              {Math.round(value)} m
            </text>
          ))}
          {effortTicks.map((value) => (
            <text className="activity-profile-axis y effort" x={width - MARGIN.right + 8} y={effortScale(value) + 3} textAnchor="start" key={value}>
              {model.kind === "pace" ? formatProfilePace(value).replace(" /km", "") : Math.round(value)}
            </text>
          ))}

          {activeX != null && (
            <>
              <line className="activity-profile-crosshair" x1={activeX} x2={activeX} y1={MARGIN.top} y2={plotBottom} />
              {Number.isFinite(activePoint.altitude) && <circle className="activity-profile-dot altitude" cx={activeX} cy={altitudeScale(activePoint.altitude)} r="5" />}
              {Number.isFinite(activePoint.effort) && <circle className="activity-profile-dot effort" cx={activeX} cy={effortScale(activePoint.effort)} r="5" />}
            </>
          )}
          <rect className="activity-profile-hit-area" x={MARGIN.left} y={MARGIN.top} width={plotWidth} height={plotHeight} />
        </svg>
      </div>

      <p className="activity-profile-note">
        <span>↔</span>
        Mit Maus, Finger oder Pfeiltasten durch die Strecke fahren. Der Marker folgt auf der Karte.
        <small>Originalmesswerte aus Intervals.icu · keine geschätzten Höhen.</small>
      </p>
    </section>
  );
}
