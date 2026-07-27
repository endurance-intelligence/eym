import { isFixedAppointment, isSpontaneousWorkout, validWorkoutTime } from "./plannerTime.js";
import { weatherLabel } from "./weather.js";

function dateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function workoutText(item = {}) {
  return `${item.title || ""} ${item.type || ""} ${item.sport || ""}`.toLowerCase();
}

export function isOutdoorWorkout(item) {
  if (!item || item.archived || item.completed || item.missedReason || item.plannedCancellation) return false;
  const text = workoutText(item);
  if (/ruhetag|rest|mobility|mobilität|stabi|kraft|strength|indoor|laufband|treadmill|ruder|row/.test(text)) return false;
  return /lauf|run|track|fußball|football|rad|rennrad|ride|bike|cycling|walk|wander|trail/.test(text);
}

export function weatherWorkoutSubject(item = {}) {
  const text = workoutText(item);
  if (/rennrad|radfahr|road bike|ride|bike|cycling/.test(text)) {
    return { kind: "cycling", label: "Tour", slotObject: "deine Tour" };
  }
  if (/lauf|run|track|trail|backyard|intervall|sprint/.test(text)) {
    return { kind: "running", label: "Lauf", slotObject: "deinen Lauf" };
  }
  return { kind: "outdoor", label: "Outdoor-Einheit", slotObject: "deine Outdoor-Einheit" };
}

function pointScore(point, kind = "outdoor") {
  let score = 0;
  if (point.temperature < 5) score += (5 - point.temperature) * 2;
  if (point.temperature > 20) score += (point.temperature - 20) * (kind === "running" ? 3.2 : 2.6);
  score += point.rainChance * (kind === "cycling" ? 0.6 : 0.45);
  score += point.precipitation * (kind === "cycling" ? 30 : 24);
  score += Math.max(0, point.windSpeed - (kind === "cycling" ? 14 : 18)) * (kind === "cycling" ? 2.4 : 1.8);
  score += Math.max(0, point.windGusts - (kind === "cycling" ? 26 : 30)) * (kind === "cycling" ? 1.7 : 1.2);
  score += Math.max(0, point.humidity - 82) * 0.4;
  if ([95, 96, 99].includes(point.weatherCode)) score += 150;
  if ([65, 67, 82, 86].includes(point.weatherCode)) score += 70;
  return score;
}

export function weatherAdvice(point, kind = "outdoor") {
  if (!point) return "Für dieses Zeitfenster fehlen noch stündliche Wetterdaten.";
  if ([95, 96, 99].includes(point.weatherCode)) return "Gewitterrisiko – Zeitfenster oder Indoor-Alternative prüfen.";
  if (point.rainChance >= 65 || point.precipitation >= 1.5) return "Deutliches Regenrisiko – Regenoption oder anderes Zeitfenster prüfen.";
  if (point.rainChance >= 35 || point.precipitation >= 0.2) return "Regen möglich – leichte Regenausrüstung einplanen.";
  if (point.temperature >= 25 || (point.temperature >= 21 && point.humidity >= 75)) return "Warm beziehungsweise schwül – Intensität freigeben und Trinken einplanen.";
  if (point.windSpeed >= (kind === "cycling" ? 22 : 26) || point.windGusts >= (kind === "cycling" ? 36 : 42)) {
    return kind === "cycling"
      ? "Windig – exponierte Abschnitte und Windrichtung bei der Route beachten."
      : "Windig – Pace nicht überbewerten und exponierte Strecken meiden.";
  }
  if (point.temperature <= 3) return "Kühl – ruhig starten und passende Schicht einplanen.";
  return "Gute Bedingungen für die geplante Einheit.";
}

function closestPoint(hourly, target) {
  const targetTime = target.getTime();
  return hourly.reduce((best, point) => {
    const difference = Math.abs(new Date(point.time).getTime() - targetTime);
    return !best || difference < best.difference ? { point, difference } : best;
  }, null)?.point || null;
}

export function bestWeatherWindow(hourly = [], now = new Date(), kind = "outdoor") {
  const today = dateKey(now);
  const earliestHour = Math.max(6, now.getHours() + (now.getMinutes() > 15 ? 1 : 0));
  const candidates = hourly.filter((point) => {
    const pointDate = new Date(point.time);
    return point.time.slice(0, 10) === today
      && pointDate.getHours() >= earliestHour
      && pointDate.getHours() <= 20;
  });

  let best = null;
  for (let index = 0; index < candidates.length - 1; index += 1) {
    const first = candidates[index];
    const second = candidates[index + 1];
    const start = new Date(first.time);
    const end = new Date(second.time);
    if (end.getTime() - start.getTime() > 75 * 60 * 1000) continue;
    const score = (pointScore(first, kind) + pointScore(second, kind)) / 2;
    if (!best || score < best.score) best = { first, second, score };
  }
  return best;
}

function generalWeatherInsight(weather) {
  return {
    mode: "general",
    eyebrow: weather.location ? `Wetter · ${weather.location}` : "Wetter am Standort",
    headline: `${weather.temperature}° · ${weather.condition}`,
    advice: weather.precipitation > 0 ? "Aktuell fällt Niederschlag." : "Aktuell keine auffälligen Bedingungen.",
    point: null,
  };
}

export function briefingWeatherInsight(weather, plannedEntries = [], now = new Date()) {
  if (!weather) return null;
  const outdoor = plannedEntries.filter(isOutdoorWorkout);
  const flexible = outdoor.find((entry) => isSpontaneousWorkout(entry));

  if (flexible) {
    const subject = weatherWorkoutSubject(flexible);
    const window = bestWeatherWindow(weather.hourly || [], now, subject.kind);
    if (window) {
      const startHour = String(new Date(window.first.time).getHours()).padStart(2, "0");
      const endHour = String(new Date(window.second.time).getHours() + 1).padStart(2, "0");
      return {
        mode: "flexible",
        title: flexible.title || flexible.type || subject.label,
        subject: subject.label,
        slotObject: subject.slotObject,
        windowLabel: `${startHour}:00–${endHour}:00 Uhr`,
        temperatureLabel: `${window.first.temperature}–${window.second.temperature}°`,
        condition: weatherLabel(window.first.weatherCode),
        eyebrow: `Bestes Zeitfenster · ${flexible.title || subject.label}`,
        headline: `${startHour}:00–${endHour}:00 Uhr · ${window.first.temperature}–${window.second.temperature}°`,
        advice: weatherAdvice(window.first, subject.kind),
        point: window.first,
      };
    }
  }

  const timed = outdoor.find((entry) => !isSpontaneousWorkout(entry) && validWorkoutTime(entry.time));
  if (timed) {
    const fixed = isFixedAppointment(timed);
    const [hour, minute] = timed.time.split(":").map(Number);
    const target = new Date(now);
    target.setHours(hour, minute, 0, 0);
    const point = closestPoint(weather.hourly || [], target);
    return {
      mode: fixed ? "fixed" : "timed",
      title: timed.title || timed.type || (fixed ? "Fixtermin" : "Training"),
      eyebrow: `${fixed ? "Wetter zum Fixtermin" : "Wetter zur geplanten Zeit"} · ${timed.title || timed.type || "Training"}`,
      headline: point ? `${timed.time} Uhr · ${point.temperature}° · ${weatherLabel(point.weatherCode)}` : `${timed.time} Uhr · Prognose lädt`,
      advice: weatherAdvice(point, weatherWorkoutSubject(timed).kind),
      point,
    };
  }

  return generalWeatherInsight(weather);
}

export function currentWeatherInsight(weather) {
  return weather ? generalWeatherInsight(weather) : null;
}
