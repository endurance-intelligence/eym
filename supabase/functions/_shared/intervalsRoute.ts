export type RoutePoint = {
  lat: number;
  lon: number;
  distanceKm?: number;
  altitude?: number;
  speedMps?: number;
  elapsedSeconds?: number;
};

function validPoint(latValue: unknown, lonValue: unknown): RoutePoint | null {
  if (latValue == null || lonValue == null || latValue === "" || lonValue === "") return null;
  const lat = Number(latValue);
  const lon = Number(lonValue);
  if (
    !Number.isFinite(lat)
    || !Number.isFinite(lon)
    || lat < -90
    || lat > 90
    || lon < -180
    || lon > 180
  ) return null;
  return { lat, lon };
}

function streamList(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter((entry) => entry && typeof entry === "object") as Record<string, unknown>[];
  if (payload && typeof payload === "object") {
    const object = payload as Record<string, unknown>;
    if (Array.isArray(object.streams)) {
      return object.streams.filter((entry) => entry && typeof entry === "object") as Record<string, unknown>[];
    }
  }
  return [];
}

function streamFor(payload: unknown, types: string[]) {
  return streamList(payload).find((entry) => types.includes(String(entry.type || "").toLowerCase()));
}

function streamData(payload: unknown, types: string[]) {
  const stream = streamFor(payload, types);
  return stream && Array.isArray(stream.data) ? stream.data : [];
}

function finiteNumber(value: unknown, minimum = Number.NEGATIVE_INFINITY) {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= minimum ? numeric : null;
}

function rounded(value: number, fractionDigits: number) {
  return Number(value.toFixed(fractionDigits));
}

function indexedLatLngPoints(payload: unknown): Array<RoutePoint | null> {
  const latLngStream = streamList(payload).find((entry) => String(entry.type || "").toLowerCase() === "latlng");
  if (!latLngStream) return [];

  const data = Array.isArray(latLngStream.data) ? latLngStream.data : [];
  const longitudeData = Array.isArray(latLngStream.data2) ? latLngStream.data2 : [];

  if (longitudeData.length > 0) {
    const count = Math.min(data.length, longitudeData.length);
    return Array.from(
      { length: count },
      (_entry, index) => validPoint(data[index], longitudeData[index]),
    );
  }

  return data.map((entry) => {
    if (Array.isArray(entry) && entry.length >= 2) {
      return validPoint(entry[0], entry[1]);
    }
    if (entry && typeof entry === "object") {
      const object = entry as Record<string, unknown>;
      return validPoint(
        object.lat ?? object.latitude,
        object.lon ?? object.lng ?? object.longitude,
      );
    }
    return null;
  });
}

export function intervalsLatLngPoints(payload: unknown): RoutePoint[] {
  return indexedLatLngPoints(payload).filter((point): point is RoutePoint => Boolean(point));
}

export function intervalsRouteSamples(payload: unknown): RoutePoint[] {
  const coordinates = indexedLatLngPoints(payload);
  const distance = streamData(payload, ["distance"]);
  const altitude = streamData(payload, ["altitude", "elevation"]);
  const speed = streamData(payload, ["velocity_smooth", "velocity", "speed"]);
  const elapsed = streamData(payload, ["time"]);

  return coordinates.flatMap((coordinate, index) => {
    if (!coordinate) return [];
    const distanceMeters = finiteNumber(distance[index], 0);
    const altitudeMeters = finiteNumber(altitude[index]);
    const speedMetersPerSecond = finiteNumber(speed[index], 0);
    const elapsedSeconds = finiteNumber(elapsed[index], 0);
    return [{
      ...coordinate,
      ...(distanceMeters == null ? {} : { distanceKm: rounded(distanceMeters / 1000, 4) }),
      ...(altitudeMeters == null ? {} : { altitude: rounded(altitudeMeters, 1) }),
      ...(speedMetersPerSecond == null ? {} : { speedMps: rounded(speedMetersPerSecond, 3) }),
      ...(elapsedSeconds == null ? {} : { elapsedSeconds: Math.round(elapsedSeconds) }),
    }];
  });
}

export function downsampleRoute(points: RoutePoint[], maximumPoints = 900): RoutePoint[] {
  const unique = points.filter((point, index) => {
    if (index === 0) return true;
    const previous = points[index - 1];
    return point.lat !== previous.lat || point.lon !== previous.lon;
  });
  const limit = Math.max(2, Math.round(Number(maximumPoints || 900)));
  if (unique.length <= limit) return unique;

  const lastIndex = unique.length - 1;
  return Array.from({ length: limit }, (_entry, index) => {
    const sourceIndex = Math.round((index * lastIndex) / (limit - 1));
    return unique[sourceIndex];
  });
}

export function intervalsRoutePayload(payload: unknown, maximumPoints = 900) {
  const fullRoute = intervalsRouteSamples(payload);
  return {
    points: downsampleRoute(fullRoute, maximumPoints),
    pointCount: fullRoute.length,
    streams: {
      distance: fullRoute.some((point) => point.distanceKm != null),
      altitude: fullRoute.some((point) => point.altitude != null),
      speed: fullRoute.some((point) => point.speedMps != null),
      time: fullRoute.some((point) => point.elapsedSeconds != null),
    },
  };
}
