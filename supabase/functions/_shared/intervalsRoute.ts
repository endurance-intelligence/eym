export type RoutePoint = {
  lat: number;
  lon: number;
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

export function intervalsLatLngPoints(payload: unknown): RoutePoint[] {
  const latLngStream = streamList(payload).find((entry) => String(entry.type || "").toLowerCase() === "latlng");
  if (!latLngStream) return [];

  const data = Array.isArray(latLngStream.data) ? latLngStream.data : [];
  const longitudeData = Array.isArray(latLngStream.data2) ? latLngStream.data2 : [];
  const points: RoutePoint[] = [];

  if (longitudeData.length > 0) {
    const count = Math.min(data.length, longitudeData.length);
    for (let index = 0; index < count; index += 1) {
      const point = validPoint(data[index], longitudeData[index]);
      if (point) points.push(point);
    }
    return points;
  }

  data.forEach((entry) => {
    if (Array.isArray(entry) && entry.length >= 2) {
      const point = validPoint(entry[0], entry[1]);
      if (point) points.push(point);
      return;
    }
    if (entry && typeof entry === "object") {
      const object = entry as Record<string, unknown>;
      const point = validPoint(
        object.lat ?? object.latitude,
        object.lon ?? object.lng ?? object.longitude,
      );
      if (point) points.push(point);
    }
  });
  return points;
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
  const fullRoute = intervalsLatLngPoints(payload);
  return {
    points: downsampleRoute(fullRoute, maximumPoints),
    pointCount: fullRoute.length,
  };
}
