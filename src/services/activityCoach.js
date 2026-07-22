import { activityDate, activityTimestamp, isRunningActivity, preferredActivities, sportFamily } from "./activityUtils";
import { activityLoad, goalRequirements } from "./scienceCoach";
import { athleteProfileAssessment } from "./athleteProfile";

const DAY = 86400000;

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function median(values) {
  const sorted = values.filter((value) => Number.isFinite(value) && value > 0).sort((left, right) => left - right);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function highZoneShare(activity) {
  return (activity?.heartRateZones?.zones || [])
    .filter((zone) => numeric(zone.zone) >= 4)
    .reduce((sum, zone) => sum + numeric(zone.percentage), 0);
}

function intensityText(activity) {
  return `${activity?.name || ""} ${activity?.type || ""} ${activity?.sportType || ""}`.toLowerCase();
}

function plannedMatch(state, activity) {
  const day = activityDate(activity);
  const direct = (state.plan || []).find((item) => item.matchedActivityId === activity.id);
  if (direct) return direct;
  const candidates = (state.plan || []).filter((item) => item.date === day && !item.archived);
  if (!candidates.length) return null;
  const text = intensityText(activity);
  return candidates.find((item) => {
    const planned = `${item.title || ""} ${item.type || ""}`.toLowerCase();
    if (isRunningActivity(activity)) return /run|lauf|track|intervall|schwelle|tempo|backyard/.test(planned);
    return planned.split(/\s+/).some((part) => part.length > 4 && text.includes(part));
  }) || candidates[0];
}

function executionAssessment(state, activity) {
  const planned = plannedMatch(state, activity);
  if (!planned) return { value: "Frei absolviert", tone: "neutral", text: "Keine eindeutig passende geplante Einheit gefunden." };
  const actualDistance = numeric(activity.distance);
  const plannedDistance = numeric(planned.distance);
  const actualDuration = numeric(activity.durationSeconds) / 60 || numeric(activity.duration);
  const plannedDuration = numeric(planned.duration);
  const distanceRatio = plannedDistance > 0 ? actualDistance / plannedDistance : null;
  const durationRatio = plannedDuration > 0 ? actualDuration / plannedDuration : null;
  const ratio = distanceRatio || durationRatio;
  if (ratio != null && ratio >= 1.2) return { value: "Mehr als geplant", tone: "watch", text: `${planned.title} wurde deutlich umfangreicher absolviert.` };
  if (ratio != null && ratio <= 0.75) return { value: "Kürzer als geplant", tone: "neutral", text: `${planned.title} wurde bewusst oder ungeplant verkürzt.` };
  return { value: "Im Planrahmen", tone: "good", text: `${planned.title} wurde in einem passenden Umfang umgesetzt.` };
}

function weatherAssessment(activity, weatherOverride) {
  const weather = weatherOverride || activity.weather || {};
  const temperature = weather.temperature ?? activity.temperature;
  const humidity = weather.humidity;
  const wind = weather.windSpeed;
  const factors = [];
  let score = 0;
  if (temperature != null && numeric(temperature) >= 28) { score += 2; factors.push(`${Math.round(numeric(temperature))} °C`); }
  else if (temperature != null && numeric(temperature) >= 23) { score += 1; factors.push(`${Math.round(numeric(temperature))} °C`); }
  if (humidity != null && numeric(humidity) >= 75) { score += 1; factors.push(`${Math.round(numeric(humidity))} % Luftfeuchte`); }
  if (wind != null && numeric(wind) >= 30) { score += 1; factors.push(`${Math.round(numeric(wind))} km/h Wind`); }
  if (!factors.length) return { value: "Unauffällig", tone: "neutral", text: temperature != null ? `${Math.round(numeric(temperature))} °C ohne klaren Zusatzfaktor.` : "Keine ausreichenden Umgebungsdaten verfügbar.", score: 0 };
  return {
    value: score >= 3 ? "Deutlich erschwert" : "Erschwert",
    tone: score >= 3 ? "watch" : "neutral",
    text: `${factors.join(" · ")} erhöhen die äußere Belastung.` ,
    score,
  };
}

function elevationAssessment(activity) {
  const elevation = numeric(activity.elevation || activity.elevationGain || activity.totalElevationGain);
  const distance = numeric(activity.distance);
  if (!elevation) return { value: "Flach / offen", tone: "neutral", text: "Keine relevanten Höhenmeter erfasst.", density: 0 };
  const density = distance > 0 ? elevation / distance : 0;
  if (density >= 30 || elevation >= 700) return { value: "Sehr profiliert", tone: "watch", text: `${Math.round(elevation)} hm · ${Math.round(density)} hm/km`, density };
  if (density >= 15 || elevation >= 300) return { value: "Profilierter Reiz", tone: "neutral", text: `${Math.round(elevation)} hm · ${Math.round(density)} hm/km`, density };
  if (density >= 6 || elevation >= 100) return { value: "Spürbare Höhenmeter", tone: "neutral", text: `${Math.round(elevation)} hm · ${Math.round(density)} hm/km`, density };
  return { value: "Leicht profiliert", tone: "neutral", text: `${Math.round(elevation)} hm`, density };
}

function loadAssessment(state, activity) {
  const family = sportFamily(activity);
  const cutoff = new Date(activityTimestamp(activity).getTime() - 84 * DAY);
  const comparable = preferredActivities(state.activities || [])
    .filter((candidate) => candidate.id !== activity.id && sportFamily(candidate) === family && activityTimestamp(candidate) >= cutoff)
    .map((candidate) => activityLoad(candidate, state.reviews?.[candidate.id] || {}));
  const current = activityLoad(activity, {});
  const typical = median(comparable);
  const ratio = typical > 0 ? current / typical : null;
  let value = "Moderat";
  let tone = "neutral";
  if (ratio != null && ratio >= 1.65) { value = "Sehr hoch"; tone = "watch"; }
  else if (ratio != null && ratio >= 1.2) { value = "Hoch"; tone = "watch"; }
  else if (ratio != null && ratio <= 0.7) value = "Locker";
  else if (!typical && (numeric(activity.duration) >= 90 || numeric(activity.distance) >= 18)) { value = "Hoch"; tone = "watch"; }
  const external = numeric(activity.trainingLoad);
  const text = typical > 0
    ? `${current} EYM-Load · typisch ${Math.round(typical)} für vergleichbare Einheiten${external ? ` · Intervals Load ${Math.round(external)}` : ""}`
    : `${current} EYM-Load${external ? ` · Intervals Load ${Math.round(external)}` : ""}`;
  return { value, tone, text, current, typical, ratio };
}

function recoveryAssessment(load, environment, elevation, activity, review) {
  let points = load.value === "Sehr hoch" ? 4 : load.value === "Hoch" ? 3 : load.value === "Moderat" ? 2 : 1;
  points += environment.score >= 2 ? 1 : 0;
  points += elevation.density >= 15 ? 1 : 0;
  points += numeric(activity.duration) >= 150 ? 1 : 0;
  points += numeric(review.rpe) >= 8 || numeric(review.legs) <= 4 || numeric(review.energy) <= 4 ? 1 : 0;
  if (points >= 6) return { value: "36–48 h", tone: "watch", text: "Hohe Gesamtbelastung; die folgenden Einheiten sollten besonders aufmerksam bewertet werden." };
  if (points >= 4) return { value: "24–36 h", tone: "neutral", text: "Ein klarer Trainingsreiz mit normalem bis erhöhtem Erholungsbedarf." };
  return { value: "12–24 h", tone: "good", text: "Voraussichtlich gut in eine normale Trainingswoche integrierbar." };
}

function goalRelevance(state, activity, elevation) {
  const goal = goalRequirements(state);
  const text = intensityText(activity);
  const duration = numeric(activity.durationSeconds) / 60 || numeric(activity.duration);
  if (goal.discipline === "ultra") {
    if (duration >= 120 || /long|backyard|ultra/.test(text)) return { value: "Sehr hoch", tone: "good", text: "Zeit auf den Beinen und Ermüdungsresistenz zahlen direkt auf das Ultra-Ziel ein." };
    if (/easy|locker|recovery|run|lauf/.test(text)) return { value: "Hoch", tone: "good", text: "Aerober Umfang und robuste Laufhäufigkeit unterstützen den Ultra-Aufbau." };
  }
  if (goal.discipline === "hilly") {
    if (elevation.density >= 15 || numeric(activity.elevation) >= 250) return { value: "Sehr hoch", tone: "good", text: "Die Höhenmeter sind spezifisch für das profilierte Ziel." };
    return { value: "Mittel", tone: "neutral", text: "Für das Ziel wären regelmäßig zusätzliche profilierte Reize sinnvoll." };
  }
  if (["5k", "10k"].includes(goal.discipline)) {
    if (/track|intervall|schwelle|tempo|race|wettkampf/.test(text) || highZoneShare(activity) >= 20) return { value: "Sehr hoch", tone: "good", text: "Tempo, Schwelle oder VO₂max sind klar zielrelevant." };
    return { value: "Mittel", tone: "neutral", text: "Die Einheit stärkt die Basis; die Zielzeit benötigt zusätzlich spezifische Qualität." };
  }
  if (goal.discipline === "marathon") {
    if (duration >= 90 || /long|marathon|tempo|schwelle/.test(text)) return { value: "Hoch", tone: "good", text: "Ausdauer und spezifische Tempoverträglichkeit werden trainiert." };
  }
  return { value: "Solide", tone: "neutral", text: `Die Einheit unterstützt das Zielprofil ${goal.focus.slice(0, 2).join(" · ")}.` };
}

function subjectiveComparison(load, review) {
  const hasReview = numeric(review.rpe) > 0 || numeric(review.legs) > 0 || numeric(review.energy) > 0;
  if (!hasReview) return "Deine subjektive Rückmeldung ergänzt diese Datenanalyse.";
  const feelsGood = numeric(review.legs) >= 7 && numeric(review.energy) >= 7 && numeric(review.overallFeeling) >= 7;
  const feelsPoor = numeric(review.legs) <= 4 || numeric(review.energy) <= 4 || numeric(review.overallFeeling) <= 4 || (Array.isArray(review.legSymptoms) && review.legSymptoms.includes("Schmerzen"));
  const objectivelyHard = ["Hoch", "Sehr hoch"].includes(load.value);
  if (objectivelyHard && feelsGood) return "Objektiv anspruchsvoll, von dir aber gut verarbeitet. Das spricht für eine stabile Belastungsverträglichkeit.";
  if (!objectivelyHard && feelsPoor) return "Die Messdaten wirken nicht außergewöhnlich, dein Gefühl fällt aber deutlich schwächer aus. Für die weitere Planung hat dein Review Vorrang.";
  if (objectivelyHard && feelsPoor) return "Daten und Gefühl zeigen beide eine hohe Belastung. Die Folgetage sollten bewusst beobachtet werden.";
  return "Dein Gefühl und die objektive Einordnung passen weitgehend zusammen.";
}

function dataConfidence(activity, weather) {
  const checks = [
    numeric(activity.durationSeconds || numeric(activity.duration) * 60) > 0,
    numeric(activity.distance) > 0,
    numeric(activity.avgHr) > 0 || Boolean(activity.heartRateZones?.zones?.length),
    numeric(activity.elevation || activity.elevationGain) > 0,
    weather?.temperature != null,
    numeric(activity.trainingLoad) > 0 || numeric(activity.trimp) > 0,
  ];
  const count = checks.filter(Boolean).length;
  if (count >= 5) return { value: "Hoch", tone: "good", text: `${count} von 6 relevanten Datenbereichen vorhanden.` };
  if (count >= 3) return { value: "Mittel", tone: "neutral", text: `${count} von 6 relevanten Datenbereichen vorhanden.` };
  return { value: "Eingeschränkt", tone: "watch", text: "Die Einschätzung basiert überwiegend auf Dauer, Distanz und Aktivitätstyp." };
}

export function activityCoachAssessment(state, activity, review = {}, weatherOverride = null) {
  const weather = weatherOverride || activity.weather || null;
  const load = loadAssessment(state, activity);
  const execution = executionAssessment(state, activity);
  const environment = weatherAssessment(activity, weather);
  const elevation = elevationAssessment(activity);
  const recovery = recoveryAssessment(load, environment, elevation, activity, review);
  const relevance = goalRelevance(state, activity, elevation);
  const confidence = dataConfidence(activity, weather);
  const athlete = athleteProfileAssessment(state, activityTimestamp(activity));
  const factors = [
    `${numeric(activity.distance).toFixed(1)} km · ${Math.round(numeric(activity.durationSeconds) / 60 || numeric(activity.duration))} min`,
    elevation.text,
  ];
  if (numeric(activity.avgHr) > 0) factors.push(`Ø ${Math.round(numeric(activity.avgHr))} bpm`);
  if (highZoneShare(activity) > 0) factors.push(`${Math.round(highZoneShare(activity))} % in HF-Zone 4–5`);
  if (weather?.temperature != null) factors.push(`${Math.round(numeric(weather.temperature))} °C`);
  factors.push(`Vergleich mit ${athlete.metrics.activeWeeks} aktiven Wochen`);
  return {
    generatedAt: new Date().toISOString(),
    load,
    execution,
    environment,
    elevation,
    recovery,
    relevance,
    confidence,
    comparison: subjectiveComparison(load, review),
    factors,
  };
}
