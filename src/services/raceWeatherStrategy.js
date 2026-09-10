const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";
const MAX_FORECAST_DAYS = 16;

function numeric(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, digits = 0) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function normalizeDegrees(value) {
  return ((Number(value || 0) % 360) + 360) % 360;
}

function shortestAngle(left, right) {
  const delta = Math.abs(normalizeDegrees(left) - normalizeDegrees(right));
  return Math.min(delta, 360 - delta);
}

function pseudoEpoch(date, time = "00:00") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) return null;
  const clock = /^\d{2}:\d{2}/.test(String(time || "")) ? String(time).slice(0, 5) : "00:00";
  const epoch = Date.parse(`${date}T${clock}:00Z`);
  return Number.isFinite(epoch) ? epoch : null;
}

function isoDateFromEpoch(epoch) {
  return new Date(epoch).toISOString().slice(0, 10);
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function raceWeekEvent(mission = {}, now = new Date()) {
  const weekStart = new Date(now);
  const weekday = weekStart.getDay() || 7;
  weekStart.setHours(12, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - weekday + 1);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const todayKey = localDateKey(now);
  const startKey = localDateKey(weekStart);
  const endKey = localDateKey(weekEnd);
  const milestones = Array.isArray(mission?.milestones) ? [...mission.milestones] : [];
  if (mission?.name && mission?.date && !milestones.some((item) => String(item.id || "") === String(mission.id || "") || item.isMainTarget)) {
    milestones.push({ ...mission, isMainTarget: true });
  }
  return milestones
    .filter((item) => !item.archived && item.date && item.date >= todayKey && item.date >= startKey && item.date <= endKey)
    .sort((left, right) => `${left.date}T${left.time || "23:59"}`.localeCompare(`${right.date}T${right.time || "23:59"}`))[0] || null;
}

export function raceForecastConfidence(raceDate, now = new Date()) {
  const raceEpoch = pseudoEpoch(raceDate, "12:00");
  if (raceEpoch == null) return { key: "missing", label: "Termin fehlt", detail: "Datum und Startzeit ergänzen." };
  const todayEpoch = pseudoEpoch(now.toISOString().slice(0, 10), "12:00");
  const days = Math.ceil((raceEpoch - todayEpoch) / 86400000);
  if (days > MAX_FORECAST_DAYS) {
    return { key: "too-early", label: "Noch zu früh", detail: `Stundenprognose wird ab etwa ${MAX_FORECAST_DAYS} Tagen vor dem Rennen aktiv.`, days };
  }
  if (days > 7) return { key: "early", label: "Frühe Prognose", detail: "Tendenz beobachten, noch keine Details festnageln.", days };
  if (days > 3) return { key: "trend", label: "Gute Tendenz", detail: "Wetterblöcke sind brauchbar, Timing kann sich noch verschieben.", days };
  if (days > 1) return { key: "strong", label: "Hohe Aussagekraft", detail: "Strategie konkretisieren und Veränderungen beobachten.", days };
  return { key: "final", label: "Finale Race-Prognose", detail: "Zeit- und Streckenfenster jetzt konkret in die Rennstrategie übernehmen.", days };
}

function durationInputMinutes(value) {
  const text = String(value || "").trim();
  if (!text) return 0;
  if (/^\d+(?:\.\d+)?$/.test(text)) return Math.max(0, Number(text));
  const parts = text.split(":").map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part))) return 0;
  if (parts.length === 2) return Math.max(0, parts[0] * 60 + parts[1]);
  if (parts.length === 3) return Math.max(0, parts[0] * 60 + parts[1] + parts[2] / 60);
  return 0;
}

function estimatedDurationFromDistance(distanceKm = 0) {
  const distance = Math.max(0, Number(distanceKm || 0));
  if (!(distance > 0)) return 0;
  const minutesPerKm = distance <= 10 ? 6
    : distance <= 21.2 ? 6.5
      : distance <= 42.3 ? 7
        : distance <= 60 ? 8
          : 9;
  return Math.max(30, Math.min(24 * 60, Math.round(distance * minutesPerKm)));
}

export function resolveRaceWeatherDuration({ race = {}, targetDurationMinutes = 0 } = {}) {
  const explicit = Number(targetDurationMinutes || 0);
  if (explicit > 0) return { minutes: explicit, estimated: false, source: "race-strategy", label: "Rennfenster" };

  const targetTime = durationInputMinutes(race?.targetTime);
  if (targetTime > 0) return { minutes: targetTime, estimated: false, source: "target-time", label: "Rennfenster aus Zielzeit" };

  const eventTimeLimit = durationInputMinutes(race?.eventTimeLimit);
  if (eventTimeLimit > 0) return { minutes: eventTimeLimit, estimated: false, source: "event-time-limit", label: "Rennfenster aus Zeitlimit" };

  const loopKm = Number(race?.loopKm || 0);
  const targetKm = Number(race?.targetKm || race?.distanceKm || 0);
  const intervalMinutes = Number(race?.loopIntervalMinutes || race?.intervalMinutes || 0);
  if (String(race?.loopMode || "").toLowerCase() === "fixed_interval" && loopKm > 0 && targetKm > 0 && intervalMinutes > 0) {
    return {
      minutes: Math.ceil(targetKm / loopKm) * intervalMinutes,
      estimated: false,
      source: "fixed-loop-plan",
      label: "Rennfenster aus Rundenplan",
    };
  }

  const estimated = estimatedDurationFromDistance(targetKm);
  if (estimated > 0) return { minutes: estimated, estimated: true, source: "distance-estimate", label: "Zeitfenster geschätzt" };

  return { minutes: 60, estimated: true, source: "start-window", label: "Startfenster geschätzt" };
}

function routePoints(routeProfile = {}) {
  return (Array.isArray(routeProfile?.profilePoints) ? routeProfile.profilePoints : [])
    .map((point, index) => ({
      lat: numeric(point?.lat ?? point?.latitude),
      lon: numeric(point?.lon ?? point?.lng ?? point?.longitude),
      distanceKm: numeric(point?.distanceKm, index === 0 ? 0 : null),
    }))
    .filter((point) => point.lat != null && point.lon != null && point.distanceKm != null)
    .sort((left, right) => left.distanceKm - right.distanceKm);
}

export function coordinateAtDistance(points = [], distanceKm = 0) {
  if (!Array.isArray(points) || !points.length) return null;
  const distance = Math.max(0, Number(distanceKm || 0));
  if (distance <= points[0].distanceKm) return { lat: points[0].lat, lon: points[0].lon };
  const last = points[points.length - 1];
  if (distance >= last.distanceKm) return { lat: last.lat, lon: last.lon };
  for (let index = 1; index < points.length; index += 1) {
    const right = points[index];
    if (right.distanceKm < distance) continue;
    const left = points[index - 1];
    const span = Math.max(0.000001, right.distanceKm - left.distanceKm);
    const ratio = clamp((distance - left.distanceKm) / span, 0, 1);
    return {
      lat: left.lat + (right.lat - left.lat) * ratio,
      lon: left.lon + (right.lon - left.lon) * ratio,
    };
  }
  return { lat: last.lat, lon: last.lon };
}

export function bearingDegrees(from, to) {
  if (!from || !to) return null;
  const lat1 = Number(from.lat) * Math.PI / 180;
  const lat2 = Number(to.lat) * Math.PI / 180;
  const deltaLon = (Number(to.lon) - Number(from.lon)) * Math.PI / 180;
  const y = Math.sin(deltaLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);
  return normalizeDegrees(Math.atan2(y, x) * 180 / Math.PI);
}

export function routeBearingAtDistance(routeProfile = {}, distanceKm = 0, windowKm = 0.08) {
  const points = routePoints(routeProfile);
  if (points.length < 2) return null;
  const routeDistance = numeric(routeProfile?.distanceKm, points[points.length - 1]?.distanceKm || 0) || 0;
  const half = Math.max(0.02, Number(windowKm || 0.08)) / 2;
  const from = coordinateAtDistance(points, clamp(distanceKm - half, 0, routeDistance));
  const to = coordinateAtDistance(points, clamp(distanceKm + half, 0, routeDistance));
  return bearingDegrees(from, to);
}

export function windImpactForBearing(runBearing, windFromDegrees, windSpeedKmh = 0) {
  if (runBearing == null || windFromDegrees == null) {
    return { headwindKmh: 0, crosswindKmh: 0, label: "Windrichtung offen", tone: "neutral" };
  }
  const speed = Math.max(0, Number(windSpeedKmh || 0));
  const delta = (normalizeDegrees(windFromDegrees) - normalizeDegrees(runBearing)) * Math.PI / 180;
  const headwindKmh = speed * Math.cos(delta);
  const crosswindKmh = Math.abs(speed * Math.sin(delta));
  let label;
  let tone;
  if (headwindKmh >= 18) { label = "starker Gegenwind"; tone = "hard"; }
  else if (headwindKmh >= 8) { label = "Gegenwind"; tone = "warn"; }
  else if (headwindKmh <= -18) { label = "starker Rückenwind"; tone = "good"; }
  else if (headwindKmh <= -8) { label = "Rückenwind"; tone = "good"; }
  else if (crosswindKmh >= 16) { label = "starker Seitenwind"; tone = "warn"; }
  else if (crosswindKmh >= 7) { label = "Seitenwind"; tone = "neutral"; }
  else { label = "wenig Windwirkung"; tone = "good"; }
  return { headwindKmh: round(headwindKmh, 1), crosswindKmh: round(crosswindKmh, 1), label, tone };
}

function eventCoordinates(race = {}) {
  const latitude = numeric(race?.place?.latitude ?? race?.latitude);
  const longitude = numeric(race?.place?.longitude ?? race?.longitude);
  return latitude != null && longitude != null ? { latitude, longitude, source: "event" } : null;
}

async function geocodeRaceLocation(race = {}) {
  const query = String(race?.location || "").trim();
  if (!query) return null;
  const params = new URLSearchParams({ name: query, count: "1", language: "de", format: "json" });
  const response = await fetch(`${GEOCODE_URL}?${params}`);
  if (!response.ok) return null;
  const data = await response.json();
  const first = Array.isArray(data?.results) ? data.results[0] : null;
  const latitude = numeric(first?.latitude);
  const longitude = numeric(first?.longitude);
  return latitude != null && longitude != null ? { latitude, longitude, source: "event-location" } : null;
}

function anchorCount(distanceKm) {
  const distance = Number(distanceKm || 0);
  if (distance >= 50) return 5;
  if (distance >= 15) return 3;
  return 1;
}

function routeAnchors(routeProfile = {}, raceDistanceKm = 0) {
  const points = routePoints(routeProfile);
  if (points.length < 2) return [];
  const routeDistance = Number(routeProfile?.distanceKm || points[points.length - 1]?.distanceKm || raceDistanceKm || 0);
  if (!(routeDistance > 0)) return [];
  const count = anchorCount(raceDistanceKm || routeDistance);
  const fractions = count === 1 ? [0.5] : Array.from({ length: count }, (_, index) => index / (count - 1));
  return fractions.map((fraction) => {
    const coordinate = coordinateAtDistance(points, routeDistance * fraction);
    return coordinate ? { ...coordinate, fraction, source: "route" } : null;
  }).filter(Boolean);
}

export async function resolveRaceWeatherAnchors(race = {}, routeProfile = {}, raceDistanceKm = 0) {
  const route = routeAnchors(routeProfile, raceDistanceKm);
  if (route.length) return route;
  const event = eventCoordinates(race) || await geocodeRaceLocation(race);
  return event ? [{ lat: event.latitude, lon: event.longitude, fraction: 0.5, source: event.source }] : [];
}

function hourlyRows(hourly = {}) {
  const times = Array.isArray(hourly?.time) ? hourly.time : [];
  return times.map((time, index) => ({
    time,
    epoch: pseudoEpoch(String(time).slice(0, 10), String(time).slice(11, 16)),
    temperature: numeric(hourly.temperature_2m?.[index], 0),
    feelsLike: numeric(hourly.apparent_temperature?.[index], 0),
    humidity: numeric(hourly.relative_humidity_2m?.[index], 0),
    precipitationProbability: numeric(hourly.precipitation_probability?.[index], 0),
    precipitation: numeric(hourly.precipitation?.[index], 0),
    weatherCode: numeric(hourly.weather_code?.[index], 0),
    cloudCover: numeric(hourly.cloud_cover?.[index], 0),
    windSpeed: numeric(hourly.wind_speed_10m?.[index], 0),
    windDirection: numeric(hourly.wind_direction_10m?.[index], 0),
    windGusts: numeric(hourly.wind_gusts_10m?.[index], 0),
    isDay: Number(String(time).slice(11, 13)) >= 6 && Number(String(time).slice(11, 13)) < 20,
  })).filter((row) => row.epoch != null);
}

async function fetchAnchorForecast(anchor, startDate, endDate) {
  const params = new URLSearchParams({
    latitude: String(anchor.lat),
    longitude: String(anchor.lon),
    hourly: [
      "temperature_2m",
      "apparent_temperature",
      "relative_humidity_2m",
      "precipitation_probability",
      "precipitation",
      "weather_code",
      "cloud_cover",
      "wind_speed_10m",
      "wind_direction_10m",
      "wind_gusts_10m",
    ].join(","),
    timezone: "auto",
    start_date: startDate,
    end_date: endDate,
  });
  const response = await fetch(`${FORECAST_URL}?${params}`);
  if (!response.ok) throw new Error("Race-Wetter konnte gerade nicht geladen werden.");
  const data = await response.json();
  if (!data?.hourly?.time?.length) throw new Error("Race-Wetterdaten sind unvollständig.");
  return {
    ...anchor,
    timezone: data.timezone || "",
    timezoneAbbreviation: data.timezone_abbreviation || "",
    rows: hourlyRows(data.hourly),
  };
}

export async function fetchRaceWeatherForecast({ race = {}, routeProfile = {}, raceDistanceKm = 0, targetDurationMinutes = 0, now = new Date() } = {}) {
  const confidence = raceForecastConfidence(race?.date, now);
  if (confidence.key === "missing" || confidence.key === "too-early") return { status: confidence.key, confidence, forecasts: [] };
  const startEpoch = pseudoEpoch(race?.date, race?.time || "00:00");
  if (startEpoch == null) return { status: "missing", confidence, forecasts: [] };
  const duration = Math.max(30, Number(targetDurationMinutes || 0));
  const endEpoch = startEpoch + duration * 60000;
  const anchors = await resolveRaceWeatherAnchors(race, routeProfile, raceDistanceKm);
  if (!anchors.length) throw new Error("Für das Rennen fehlt ein verwertbarer Wetterstandort bzw. eine GPX-Strecke.");
  const startDate = isoDateFromEpoch(startEpoch);
  const endDate = isoDateFromEpoch(endEpoch + 3600000);
  const forecasts = await Promise.all(anchors.map((anchor) => fetchAnchorForecast(anchor, startDate, endDate)));
  return { status: "ready", confidence, forecasts, startEpoch, endEpoch };
}

function nearestForecast(forecasts = [], fraction = 0.5) {
  if (!forecasts.length) return null;
  return [...forecasts].sort((left, right) => Math.abs(left.fraction - fraction) - Math.abs(right.fraction - fraction))[0];
}

function nearestHour(rows = [], epoch = 0) {
  if (!rows.length) return null;
  return rows.reduce((best, row) => Math.abs(row.epoch - epoch) < Math.abs(best.epoch - epoch) ? row : best, rows[0]);
}

function weatherAt(forecasts = [], fraction = 0.5, epoch = 0) {
  const forecast = nearestForecast(forecasts, fraction);
  const row = forecast ? nearestHour(forecast.rows, epoch) : null;
  return row ? { ...row, anchorFraction: forecast.fraction, timezone: forecast.timezone } : null;
}

function sectionCountForDuration(durationMinutes) {
  const duration = Number(durationMinutes || 0);
  if (duration <= 45) return 1;
  if (duration <= 360) return 3;
  if (duration <= 720) return 4;
  return 6;
}

function clockLabel(epoch) {
  const date = new Date(epoch);
  return `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
}

function rangeLabel(startKm, endKm, raceDistanceKm, index, count) {
  if (!(raceDistanceKm > 0)) return count === 1 ? "Rennen" : `Abschnitt ${index + 1}`;
  if (count === 3) return ["Erstes Drittel", "Zweites Drittel", "Letztes Drittel"][index];
  return `${round(startKm, raceDistanceKm < 20 ? 1 : 0)}–${round(endKm, raceDistanceKm < 20 ? 1 : 0)} km`;
}

export function weatherIcon(weatherCode = 0, isDay = true) {
  const code = Number(weatherCode || 0);
  if ([95, 96, 99].includes(code)) return "⛈️";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "❄️";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "🌧️";
  if ([45, 48].includes(code)) return "🌫️";
  if ([1, 2, 3].includes(code)) return isDay ? "⛅" : "☁️";
  return isDay ? "☀️" : "🌙";
}

function sectionAdvice(section, firstTemperature) {
  const advice = [];
  const rain = section.precipitationProbability >= 55 || section.precipitation >= 0.2;
  if (rain && section.windSpeed >= 18) advice.push("Regen + Wind: Windschatten suchen und Auskühlung nach nassen Passagen vermeiden.");
  else if (rain) advice.push("Nässe einplanen: Grip/Schuhe beachten und bis kurz vor dem Start trocken bleiben.");
  if (section.headwindKmh >= 8) advice.push("Gegenwind: Pace nicht erzwingen, Gruppe/Windschatten priorisieren.");
  else if (section.headwindKmh <= -8) advice.push("Rückenwind nutzen, aber nicht unbewusst überziehen.");
  if (section.temperature >= 22) advice.push("Wärme: Trinken und bewährte Kühlung/Sonnenschutz hoch priorisieren.");
  else if (section.temperature <= 9) advice.push("Kühl: bei längeren Rennen Auskühlung und nasse Kleidung aktiv mitdenken.");
  if (Number.isFinite(firstTemperature) && section.temperature - firstTemperature >= 4) advice.push("Temperatur steigt deutlich: Bekleidung und Flüssigkeit nicht nach dem kühlen Start festschreiben.");
  return advice.slice(0, 2);
}

function sampleSection({ forecasts, routeProfile, raceDistanceKm, startEpoch, targetDurationMinutes, startFraction, endFraction }) {
  const samples = [];
  for (let index = 0; index < 5; index += 1) {
    const ratio = index / 4;
    const fraction = startFraction + (endFraction - startFraction) * ratio;
    const epoch = startEpoch + targetDurationMinutes * 60000 * fraction;
    const weather = weatherAt(forecasts, fraction, epoch);
    if (!weather) continue;
    const bearing = routeBearingAtDistance(routeProfile, raceDistanceKm * fraction, Math.max(0.08, raceDistanceKm / 200));
    const impact = windImpactForBearing(bearing, weather.windDirection, weather.windSpeed);
    samples.push({ fraction, epoch, weather, bearing, impact });
  }
  if (!samples.length) return null;
  const midpoint = samples[Math.floor(samples.length / 2)];
  const temperatures = samples.map((sample) => sample.weather.temperature);
  const feelsLikeValues = samples.map((sample) => sample.weather.feelsLike);
  const humidities = samples.map((sample) => sample.weather.humidity);
  const precipitationProbabilities = samples.map((sample) => sample.weather.precipitationProbability);
  const precipitations = samples.map((sample) => sample.weather.precipitation);
  const winds = samples.map((sample) => sample.weather.windSpeed);
  const gusts = samples.map((sample) => sample.weather.windGusts);
  const headwinds = samples.map((sample) => sample.impact.headwindKmh);
  const crosses = samples.map((sample) => sample.impact.crosswindKmh);
  return {
    startFraction,
    endFraction,
    startKm: raceDistanceKm * startFraction,
    endKm: raceDistanceKm * endFraction,
    startEpoch: startEpoch + targetDurationMinutes * 60000 * startFraction,
    endEpoch: startEpoch + targetDurationMinutes * 60000 * endFraction,
    temperature: round(temperatures.reduce((sum, value) => sum + value, 0) / temperatures.length),
    feelsLike: round(feelsLikeValues.reduce((sum, value) => sum + value, 0) / feelsLikeValues.length),
    humidity: Math.round(humidities.reduce((sum, value) => sum + value, 0) / humidities.length),
    minTemperature: Math.round(Math.min(...temperatures)),
    maxTemperature: Math.round(Math.max(...temperatures)),
    precipitationProbability: Math.round(Math.max(...precipitationProbabilities)),
    precipitation: round(Math.max(...precipitations), 1),
    weatherCode: midpoint.weather.weatherCode,
    isDay: midpoint.weather.isDay,
    windSpeed: Math.round(Math.max(...winds)),
    windGusts: Math.round(Math.max(...gusts)),
    windDirection: Math.round(midpoint.weather.windDirection),
    headwindKmh: round(headwinds.reduce((sum, value) => sum + value, 0) / headwinds.length, 1),
    maxHeadwindKmh: round(Math.max(...headwinds), 1),
    crosswindKmh: round(Math.max(...crosses), 1),
  };
}

export function buildTrackWindPlan({ forecasts = [], routeProfile = {}, raceDistanceKm = 0, startEpoch = 0, targetDurationMinutes = 0, lapDistanceM = 400 } = {}) {
  const lapKm = Math.max(0.2, Number(lapDistanceM || 400) / 1000);
  const routeDistance = numeric(routeProfile?.distanceKm, raceDistanceKm) || raceDistanceKm;
  if (!(routeDistance >= lapKm) || !routePoints(routeProfile).length || !forecasts.length) return [];
  const lapStartKm = Math.max(0, routeDistance - lapKm);
  const labels = ["Kurve 1", "Gegengerade", "Kurve 2", "Zielgerade"];
  const weather = weatherAt(forecasts, 0.5, startEpoch + targetDurationMinutes * 30000);
  if (!weather) return [];
  return labels.map((label, index) => {
    const startKm = lapStartKm + lapKm * index / 4;
    const endKm = lapStartKm + lapKm * (index + 1) / 4;
    const from = coordinateAtDistance(routePoints(routeProfile), startKm);
    const to = coordinateAtDistance(routePoints(routeProfile), endKm);
    const bearing = bearingDegrees(from, to);
    const impact = windImpactForBearing(bearing, weather.windDirection, weather.windSpeed);
    return {
      key: label.toLowerCase().replace(/\s/g, "-"),
      label,
      bearing: bearing == null ? null : Math.round(bearing),
      windDirection: Math.round(weather.windDirection),
      windSpeed: Math.round(weather.windSpeed),
      windGusts: Math.round(weather.windGusts),
      headwindKmh: impact.headwindKmh,
      crosswindKmh: impact.crosswindKmh,
      windLabel: impact.label,
      tone: impact.tone,
    };
  });
}

function windHotspot({ forecasts, routeProfile, raceDistanceKm, startEpoch, targetDurationMinutes }) {
  if (!(raceDistanceKm > 0) || !routePoints(routeProfile).length) return null;
  let hottest = null;
  for (let index = 0; index <= 24; index += 1) {
    const fraction = index / 24;
    const weather = weatherAt(forecasts, fraction, startEpoch + targetDurationMinutes * 60000 * fraction);
    if (!weather) continue;
    const bearing = routeBearingAtDistance(routeProfile, raceDistanceKm * fraction, Math.max(0.06, raceDistanceKm / 250));
    const impact = windImpactForBearing(bearing, weather.windDirection, weather.windSpeed);
    if (!hottest || impact.headwindKmh > hottest.headwindKmh) {
      hottest = {
        fraction,
        km: raceDistanceKm * fraction,
        epoch: startEpoch + targetDurationMinutes * 60000 * fraction,
        bearing,
        windDirection: weather.windDirection,
        windSpeed: weather.windSpeed,
        windGusts: weather.windGusts,
        ...impact,
      };
    }
  }
  return hottest;
}

function overallHeadline(sections = []) {
  if (!sections.length) return "Race-Wetter noch nicht verfügbar";
  const rainSections = sections.filter((section) => section.precipitationProbability >= 55 || section.precipitation >= 0.2);
  const windySections = sections.filter((section) => section.windSpeed >= 20 || section.windGusts >= 35);
  const temperatures = sections.map((section) => section.temperature);
  const tempSwing = Math.max(...temperatures) - Math.min(...temperatures);
  if (rainSections.length && windySections.length) return "Wetter beeinflusst die Rennstrategie";
  if (tempSwing >= 5) return "Deutlich wechselnde Bedingungen im Rennverlauf";
  if (windySections.length) return "Wind wird zum taktischen Faktor";
  if (rainSections.length) return "Nässe im Rennverlauf einplanen";
  return "Bedingungen wirken insgesamt gut kontrollierbar";
}

export function buildRaceWeatherStrategy({ race = {}, routeProfile = {}, raceDistanceKm = 0, targetDurationMinutes = 0, forecasts = [], confidence = null } = {}) {
  const startEpoch = pseudoEpoch(race?.date, race?.time || "00:00");
  const duration = Math.max(1, Number(targetDurationMinutes || 0));
  const distance = Math.max(0, Number(raceDistanceKm || routeProfile?.distanceKm || 0));
  if (startEpoch == null || !forecasts.length || !(duration > 0)) return null;
  const count = sectionCountForDuration(duration);
  const sections = Array.from({ length: count }, (_, index) => sampleSection({
    forecasts,
    routeProfile,
    raceDistanceKm: distance,
    startEpoch,
    targetDurationMinutes: duration,
    startFraction: index / count,
    endFraction: (index + 1) / count,
  })).filter(Boolean);
  const firstTemperature = sections[0]?.temperature;
  sections.forEach((section, index) => {
    section.title = rangeLabel(section.startKm, section.endKm, distance, index, count);
    section.timeLabel = `${clockLabel(section.startEpoch)}–${clockLabel(section.endEpoch)}`;
    section.icon = weatherIcon(section.weatherCode, section.isDay);
    section.windImpact = windImpactForBearing(routeBearingAtDistance(routeProfile, distance * ((section.startFraction + section.endFraction) / 2)), section.windDirection, section.windSpeed);
    section.advice = sectionAdvice(section, firstTemperature);
  });
  const temperatures = sections.map((section) => section.temperature);
  const hotspot = windHotspot({ forecasts, routeProfile, raceDistanceKm: distance, startEpoch, targetDurationMinutes: duration });
  return {
    confidence,
    headline: overallHeadline(sections),
    sections,
    minTemperature: temperatures.length ? Math.min(...temperatures) : null,
    maxTemperature: temperatures.length ? Math.max(...temperatures) : null,
    maxRainProbability: sections.length ? Math.max(...sections.map((section) => section.precipitationProbability)) : 0,
    maxWindSpeed: sections.length ? Math.max(...sections.map((section) => section.windSpeed)) : 0,
    maxWindGusts: sections.length ? Math.max(...sections.map((section) => section.windGusts)) : 0,
    windHotspot: hotspot,
  };
}

export function raceWeatherSnapshot(strategy = null) {
  if (!strategy) return null;
  return {
    maxRainProbability: Math.round(strategy.maxRainProbability || 0),
    maxWindSpeed: Math.round(strategy.maxWindSpeed || 0),
    maxWindGusts: Math.round(strategy.maxWindGusts || 0),
    minTemperature: Math.round(strategy.minTemperature || 0),
    maxTemperature: Math.round(strategy.maxTemperature || 0),
    sections: (strategy.sections || []).map((section) => ({
      rain: Math.round(section.precipitationProbability || 0),
      wind: Math.round(section.windSpeed || 0),
      temp: Math.round(section.temperature || 0),
    })),
  };
}

export function compareRaceWeatherSnapshots(previous = null, current = null) {
  if (!previous || !current) return [];
  const changes = [];
  const rainDelta = Number(current.maxRainProbability || 0) - Number(previous.maxRainProbability || 0);
  const windDelta = Number(current.maxWindSpeed || 0) - Number(previous.maxWindSpeed || 0);
  const tempDelta = Number(current.maxTemperature || 0) - Number(previous.maxTemperature || 0);
  if (Math.abs(rainDelta) >= 20) changes.push(`Regenwahrscheinlichkeit ${rainDelta > 0 ? "+" : ""}${Math.round(rainDelta)} %-Pkt.`);
  if (Math.abs(windDelta) >= 6) changes.push(`Wind ${windDelta > 0 ? "+" : ""}${Math.round(windDelta)} km/h`);
  if (Math.abs(tempDelta) >= 3) changes.push(`Temperatur ${tempDelta > 0 ? "+" : ""}${Math.round(tempDelta)} °C`);
  const previousSections = Array.isArray(previous.sections) ? previous.sections : [];
  const currentSections = Array.isArray(current.sections) ? current.sections : [];
  const changedWindow = currentSections.findIndex((section, index) => {
    const before = previousSections[index];
    return before && Math.abs(Number(section.rain || 0) - Number(before.rain || 0)) >= 25;
  });
  if (changedWindow >= 0 && changes.length < 3) changes.push(`Wetterfenster in Abschnitt ${changedWindow + 1} verschoben`);
  return changes.slice(0, 3);
}

export function compassLabel(degrees) {
  const labels = ["N", "NO", "O", "SO", "S", "SW", "W", "NW"];
  return labels[Math.round(normalizeDegrees(degrees) / 45) % 8];
}

export function windDirectionChanged(previousDegrees, currentDegrees, threshold = 45) {
  return shortestAngle(previousDegrees, currentDegrees) >= threshold;
}
