import { activityDate, activityTimestamp, isRunningActivity, preferredActivities, sportFamily } from "./activityUtils.js";
import { activityLoad, goalRequirements } from "./scienceCoach.js";
import { athleteProfileAssessment } from "./athleteProfile.js";

const DAY = 86400000;
const PERSONAL_CONTEXT_WINDOW_DAYS = 140;

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

function robustMedian(values) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function durationMinutes(activity) {
  return numeric(activity?.durationSeconds) / 60 || numeric(activity?.duration);
}

function paceSecondsPerKm(activity) {
  const distance = numeric(activity?.distance);
  const seconds = numeric(activity?.durationSeconds) || numeric(activity?.duration) * 60;
  return distance > 0 && seconds > 0 ? seconds / distance : 0;
}

function elevationDensity(activity) {
  const distance = numeric(activity?.distance);
  const elevation = numeric(activity?.elevation || activity?.elevationGain || activity?.totalElevationGain);
  return distance > 0 ? elevation / distance : 0;
}

function reviewForActivity(state, activity) {
  return state?.reviews?.[activity?.id] || {};
}

function weatherForActivity(state, activity, explicitReview = null) {
  const review = explicitReview || reviewForActivity(state, activity);
  return review?.weather || activity?.weather || (activity?.temperature != null ? { temperature: Number(activity.temperature) } : null) || {};
}

function highZoneShare(activity) {
  return (activity?.heartRateZones?.zones || [])
    .filter((zone) => numeric(zone.zone) >= 4)
    .reduce((sum, zone) => sum + numeric(zone.percentage), 0);
}

function intensityText(activity) {
  return `${activity?.name || ""} ${activity?.type || ""} ${activity?.sportType || ""}`.toLowerCase();
}

function sessionClass(activity, review = {}) {
  const text = intensityText(activity);
  const rpe = numeric(review.rpe || activity?.perceivedExertion);
  if (/race|wettkampf|intervall|interval|schwelle|threshold|tempo|track|vo2|max effort/.test(text) || highZoneShare(activity) >= 20 || rpe >= 8) return "quality";
  if (/long|backyard|ultra/.test(text) || durationMinutes(activity) >= 95 || numeric(activity.distance) >= 18) return "long";
  if (/easy|locker|ruhig|recovery|regeneration/.test(text) || (rpe > 0 && rpe <= 6)) return "easy";
  return "general";
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
  const actualDuration = durationMinutes(activity);
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
  const feelsLike = weather.feelsLike;
  const humidity = weather.humidity;
  const wind = weather.windSpeed;
  const factors = [];
  let score = 0;
  const rawTemperature = temperature != null ? Number(temperature) : null;
  const rawFeelsLike = feelsLike != null ? Number(feelsLike) : null;
  const thermal = Math.max(Number.isFinite(rawTemperature) ? rawTemperature : -99, Number.isFinite(rawFeelsLike) ? rawFeelsLike : -99);
  const cold = thermal <= 5 && thermal > -50;
  if (cold) { score += thermal <= 0 ? 2 : 1; factors.push(`${Math.round(rawTemperature ?? thermal)} °C Kälte`); }
  if (thermal >= 32) { score += 3; factors.push(`${Math.round(numeric(temperature || thermal))} °C`); }
  else if (thermal >= 28) { score += 2; factors.push(`${Math.round(numeric(temperature || thermal))} °C`); }
  else if (thermal >= 23) { score += 1; factors.push(`${Math.round(numeric(temperature || thermal))} °C`); }
  if (humidity != null && numeric(humidity) >= 75 && thermal >= 23) { score += 1; factors.push(`${Math.round(numeric(humidity))} % Luftfeuchte`); }
  if (wind != null && numeric(wind) >= 30) { score += 1; factors.push(`${Math.round(numeric(wind))} km/h Wind`); }
  if (!factors.length) return { value: "Unauffällig", tone: "neutral", text: temperature != null ? `${Math.round(numeric(temperature))} °C ohne klaren Zusatzfaktor.` : "Keine ausreichenden Umgebungsdaten verfügbar.", score: 0, thermal, cold: false };
  return {
    value: score >= 3 ? "Deutlich erschwert" : "Erschwert",
    tone: score >= 3 ? "watch" : "neutral",
    text: `${factors.join(" · ")} erhöhen die äußere Belastung.`,
    score,
    thermal,
    cold,
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
  else if (!typical && (durationMinutes(activity) >= 90 || numeric(activity.distance) >= 18)) { value = "Hoch"; tone = "watch"; }
  const external = numeric(activity.trainingLoad);
  const text = typical > 0
    ? `${current} interner Belastungswert · typisch ${Math.round(typical)} für vergleichbare Einheiten${external ? ` · Intervals Load ${Math.round(external)}` : ""}`
    : `${current} interner Belastungswert${external ? ` · Intervals Load ${Math.round(external)}` : ""}`;
  return { value, tone, text, current, typical, ratio };
}

function stableEventReview(review = {}) {
  const legSymptoms = Array.isArray(review.legSymptoms) ? review.legSymptoms : [];
  return numeric(review.legs) >= 6
    && numeric(review.energy) >= 6
    && numeric(review.overallFeeling) >= 6
    && !legSymptoms.includes("Schmerzen");
}

function recoveryAssessment(load, environment, elevation, activity, review) {
  if (review?.isEvent && review.eventPlanningImpact === "depleted") {
    return {
      value: "48 h+ prüfen",
      tone: "watch",
      text: "Du meldest deutliche Erschöpfung. Die Folgetage werden nach deinem Zustand geplant, nicht nach einer pauschalen Eventpause.",
    };
  }
  if (review?.isEvent && review.eventPlanningImpact === "training" && stableEventReview(review)) {
    return {
      value: "Normal weiter",
      tone: "good",
      text: "Als normaler Trainingsreiz verarbeitet; der Eventstatus löst keine zusätzliche Erholungspause aus.",
    };
  }
  let points = load.value === "Sehr hoch" ? 4 : load.value === "Hoch" ? 3 : load.value === "Moderat" ? 2 : 1;
  points += environment.score >= 2 ? 1 : 0;
  points += elevation.density >= 15 ? 1 : 0;
  points += durationMinutes(activity) >= 150 ? 1 : 0;
  points += numeric(review.rpe) >= 8 || numeric(review.legs) <= 4 || numeric(review.energy) <= 4 ? 1 : 0;
  if (points >= 6) return { value: "36–48 h", tone: "watch", text: "Hohe Gesamtbelastung; die folgenden Einheiten sollten besonders aufmerksam bewertet werden." };
  if (points >= 4) return { value: "24–36 h", tone: "neutral", text: "Ein klarer Trainingsreiz mit normalem bis erhöhtem Erholungsbedarf." };
  return { value: "12–24 h", tone: "good", text: "Voraussichtlich gut in eine normale Trainingswoche integrierbar." };
}

function goalRelevance(state, activity, elevation) {
  const goal = goalRequirements(state);
  const text = intensityText(activity);
  const duration = durationMinutes(activity);
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

function similarRunScore(reference, candidate, referenceReview = {}, candidateReview = {}) {
  const referencePace = paceSecondsPerKm(reference);
  const candidatePace = paceSecondsPerKm(candidate);
  const paceDelta = referencePace > 0 && candidatePace > 0 ? Math.abs(candidatePace - referencePace) / referencePace : 0.2;
  const referenceDuration = durationMinutes(reference);
  const candidateDuration = durationMinutes(candidate);
  const durationDelta = referenceDuration > 0 && candidateDuration > 0 ? Math.abs(candidateDuration - referenceDuration) / referenceDuration : 0.3;
  const elevationDelta = Math.abs(elevationDensity(reference) - elevationDensity(candidate));
  const classPenalty = sessionClass(reference, referenceReview) === sessionClass(candidate, candidateReview) ? 0 : 0.9;
  return paceDelta * 6 + durationDelta * 1.5 + Math.min(1.2, elevationDelta / 12) + classPenalty;
}

function matchedMildRun(hotEntry, mildEntries) {
  const ranked = mildEntries
    .map((entry) => ({ ...entry, score: similarRunScore(hotEntry.activity, entry.activity, hotEntry.review, entry.review) }))
    .filter((entry) => {
      const hotPace = paceSecondsPerKm(hotEntry.activity);
      const mildPace = paceSecondsPerKm(entry.activity);
      const paceDelta = hotPace > 0 && mildPace > 0 ? Math.abs(hotPace - mildPace) / hotPace : 1;
      return paceDelta <= 0.1 && Math.abs(elevationDensity(hotEntry.activity) - elevationDensity(entry.activity)) <= 12;
    })
    .sort((left, right) => left.score - right.score);
  return ranked[0] || null;
}

function personalHeatContext(state, activity, review, weatherOverride) {
  const weather = weatherOverride || weatherForActivity(state, activity, review);
  const temperature = Number(weather?.temperature ?? activity?.temperature);
  const feelsLike = Number(weather?.feelsLike);
  const humidity = Number(weather?.humidity);
  const thermal = Math.max(Number.isFinite(temperature) ? temperature : -99, Number.isFinite(feelsLike) ? feelsLike : -99);
  const currentHr = numeric(activity?.avgHr);
  const hotNow = thermal >= 28;
  const warmNow = thermal >= 23;

  const base = {
    active: isRunningActivity(activity) && warmNow,
    hot: isRunningActivity(activity) && hotNow,
    temperature: Number.isFinite(temperature) ? temperature : null,
    feelsLike: Number.isFinite(feelsLike) ? feelsLike : null,
    humidity: Number.isFinite(humidity) ? humidity : null,
    baselineHr: null,
    observedDelta: null,
    expectedHeatDelta: null,
    baselineSamples: 0,
    heatPairs: 0,
    confidence: "low",
    confidenceLabel: "Erste Tendenz",
    status: warmNow ? "context_only" : "not_relevant",
    value: warmNow ? "Wärme berücksichtigen" : "Kein Hitzesignal",
    tone: "neutral",
    text: warmNow ? "Wärme wird als Kontext berücksichtigt, aber nicht mit einer pauschalen bpm-Regel verrechnet." : "Kein relevanter thermischer Zusatzfaktor erkannt.",
    protectAerobicInterpretation: hotNow,
  };
  if (!base.active || !currentHr) return base;

  const currentTime = activityTimestamp(activity).getTime();
  const cutoff = currentTime - PERSONAL_CONTEXT_WINDOW_DAYS * DAY;
  const currentClass = sessionClass(activity, review);
  const entries = preferredActivities(state.activities || [])
    .filter((candidate) => candidate.id !== activity.id && isRunningActivity(candidate))
    .filter((candidate) => activityTimestamp(candidate).getTime() > 0 && activityTimestamp(candidate).getTime() < currentTime && activityTimestamp(candidate).getTime() >= cutoff)
    .map((candidate) => {
      const candidateReview = reviewForActivity(state, candidate);
      const candidateWeather = weatherForActivity(state, candidate, candidateReview);
      return {
        activity: candidate,
        review: candidateReview,
        temperature: Number(candidateWeather?.temperature ?? candidate?.temperature),
        feelsLike: Number(candidateWeather?.feelsLike),
        hr: numeric(candidate.avgHr),
        score: similarRunScore(activity, candidate, review, candidateReview),
        kind: sessionClass(candidate, candidateReview),
      };
    })
    .filter((entry) => entry.hr > 0 && paceSecondsPerKm(entry.activity) > 0 && Number.isFinite(entry.temperature));

  const classEntries = entries.filter((entry) => entry.kind === currentClass || currentClass === "general");
  const pool = classEntries.length >= 4 ? classEntries : entries;
  const mild = pool
    .filter((entry) => entry.temperature >= 5 && entry.temperature <= 22)
    .filter((entry) => entry.score <= 2.2)
    .sort((left, right) => left.score - right.score)
    .slice(0, 8);
  const baselineHr = robustMedian(mild.map((entry) => entry.hr));
  const observedDelta = baselineHr != null ? currentHr - baselineHr : null;

  const currentHeatBandLow = hotNow ? Math.max(27, thermal - 6) : 23;
  let historicalHeat = pool.filter((entry) => entry.temperature >= currentHeatBandLow && entry.temperature <= thermal + 4 && entry.score <= 2.4);
  if (historicalHeat.length < 3) historicalHeat = pool.filter((entry) => entry.temperature >= 27 && entry.score <= 2.4);
  const pairedDeltas = historicalHeat
    .map((hotEntry) => {
      const mildMatch = matchedMildRun(hotEntry, mild);
      return mildMatch ? hotEntry.hr - mildMatch.hr : null;
    })
    .filter(Number.isFinite);
  const expectedHeatDelta = pairedDeltas.length >= 3 ? robustMedian(pairedDeltas) : null;

  const baselineSamples = mild.length;
  const heatPairs = pairedDeltas.length;
  const confidence = heatPairs >= 5 && baselineSamples >= 5 ? "high" : heatPairs >= 3 && baselineSamples >= 3 ? "medium" : "low";
  const confidenceLabel = confidence === "high" ? "Gut belegt" : confidence === "medium" ? "Persönliche Tendenz" : "Erste Tendenz";

  let status = "context_only";
  let value = hotNow ? "Hitze einordnen" : "Wärme einordnen";
  let tone = "neutral";
  let text = `Bei ${Math.round(temperature)} °C wird die Herzfrequenz nicht gegen eine starre Norm bewertet.`;

  if (baselineHr != null && baselineSamples >= 3) {
    const deltaRounded = Math.round(observedDelta);
    if (expectedHeatDelta != null) {
      const expectedRounded = Math.round(expectedHeatDelta);
      const excess = observedDelta - expectedHeatDelta;
      if (observedDelta <= 2) {
        status = "stable_despite_heat";
        value = "HF trotz Hitze stabil";
        tone = "good";
      } else if (excess <= 5) {
        status = "heat_explains";
        value = "HF-Anstieg plausibel";
        tone = "good";
      } else {
        status = "above_heat_expectation";
        value = "HF über Wärme-Erwartung";
        tone = "watch";
      }
      text = `Ø ${Math.round(currentHr)} bpm · ${deltaRounded >= 0 ? "+" : ""}${deltaRounded} bpm gegenüber ${baselineSamples} ähnlichen milden Läufen. Deine persönliche Heat Response liegt bisher bei etwa ${expectedRounded >= 0 ? "+" : ""}${expectedRounded} bpm aus ${heatPairs} passenden Warm/Kühl-Vergleichen.`;
    } else {
      status = "personal_baseline_only";
      value = `${deltaRounded >= 0 ? "+" : ""}${deltaRounded} bpm zur milden Basis`;
      text = `Ø ${Math.round(currentHr)} bpm liegen ${deltaRounded >= 0 ? "+" : ""}${deltaRounded} bpm über ${baselineSamples} ähnlich gelaufenen Einheiten bei milden Bedingungen. Für eine belastbare persönliche Heat Response fehlen noch ausreichend passende warme Vergleichsläufe.`;
    }
  } else if (hotNow) {
    value = "Hitze klar relevant";
    text = `${Math.round(temperature)} °C${Number.isFinite(humidity) ? ` · ${Math.round(humidity)} % Luftfeuchte` : ""}: Die Herzfrequenz wird als hitzebeeinflusst markiert. Noch zu wenig ähnliche Läufe für eine persönliche bpm-Korrektur.`;
  }

  return {
    ...base,
    baselineHr,
    observedDelta,
    expectedHeatDelta,
    baselineSamples,
    heatPairs,
    confidence,
    confidenceLabel,
    status,
    value,
    tone,
    text,
  };
}

function reviewState(review = {}) {
  const legSymptoms = Array.isArray(review.legSymptoms) ? review.legSymptoms : [];
  const hasPain = legSymptoms.includes("Schmerzen");
  const legs = numeric(review.legs);
  const energy = numeric(review.energy);
  const overall = numeric(review.overallFeeling);
  const rpe = numeric(review.rpe);
  const scores = [legs, energy, overall].filter((value) => value > 0);
  const averageScore = scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null;
  const poor = hasPain || scores.some((value) => value <= 4);
  const strong = scores.length >= 2 && scores.every((value) => value >= 7);
  const stable = scores.length >= 2 && scores.every((value) => value >= 6);
  return { hasPain, legs, energy, overall, rpe, averageScore, poor, strong, stable, hasReview: scores.length > 0 || rpe > 0 };
}

function subjectiveComparison(load, review, heat) {
  const subjective = reviewState(review);
  let eventText = "";
  if (review?.isEvent && review.eventPlanningImpact === "training") {
    eventText = stableEventReview(review)
      ? "Du hast das Event wie eine normale Trainingseinheit verarbeitet; der Eventstatus allein bremst die Folgewoche nicht."
      : "Du hast das Event als trainingsähnlich eingeordnet; auffällige Review-Signale haben trotzdem Vorrang.";
  } else if (review?.isEvent && review.eventPlanningImpact === "hard") {
    eventText = "Du hast das Event als spürbar härter als Training eingeordnet; die Folgewoche richtet sich nach deinen tatsächlichen Signalen.";
  } else if (review?.isEvent && review.eventPlanningImpact === "depleted") {
    eventText = "Du meldest deutliche Erschöpfung; deshalb wird die Folgewoche zunächst vorsichtiger geplant.";
  }
  const withEventText = (text) => [eventText, text].filter(Boolean).join(" ");
  if (!subjective.hasReview) return withEventText("Noch kein subjektives Signal hinterlegt; die Einordnung bleibt deshalb bewusst vorsichtig.");
  const hasFuelingFeedback = review?.usedNutrition === true
    || (review?.usedNutrition == null && Array.isArray(review?.nutritionItems) && review.nutritionItems.length > 0);
  const stomachSymptoms = hasFuelingFeedback
    ? (Array.isArray(review.stomachSymptoms) ? review.stomachSymptoms : [])
      .filter((symptom) => !String(symptom).startsWith("Keine"))
    : [];
  if (stomachSymptoms.length > 0) {
    return withEventText(`Magenauffälligkeiten (${stomachSymptoms.join(", ")}) sind relevanter als eine ansonsten unauffällige Belastungszahl. Bei ähnlichen Einheiten Gel-Timing, Trinkmenge und Produktkombination prüfen.`);
  }
  if (subjective.hasPain) return withEventText("Du meldest Schmerzen. Dieses Signal hat Vorrang vor Pace, Herzfrequenz und Belastungswert; die nächste Belastung sollte erst nach erneuter Einordnung erfolgen.");

  const scoreBits = [
    subjective.legs > 0 ? `Beine ${subjective.legs}/10` : "",
    subjective.energy > 0 ? `Energie ${subjective.energy}/10` : "",
    subjective.overall > 0 ? `Gesamtgefühl ${subjective.overall}/10` : "",
    subjective.rpe > 0 ? `RPE ${subjective.rpe}/10` : "",
  ].filter(Boolean);
  const objectivelyHard = ["Hoch", "Sehr hoch"].includes(load.value);
  if (heat?.status === "above_heat_expectation" && !subjective.strong) {
    return withEventText(`${scoreBits.join(" · ")}. Die Herzfrequenz liegt zusätzlich über deiner bisherigen Wärme-Erwartung; das ist ein echtes Beobachtungssignal und nicht nur „heißes Wetter“.`);
  }
  if (subjective.strong && objectivelyHard) return withEventText(`${scoreBits.join(" · ")}. Der Reiz war objektiv hoch, wurde subjektiv aber stabil verarbeitet.`);
  if (subjective.strong) return withEventText(`${scoreBits.join(" · ")}. Die subjektiven Signale sprechen für eine stabile Verarbeitung.`);
  if (subjective.poor) return withEventText(`${scoreBits.join(" · ")}. Dein Gefühl fällt schwächer aus als die reine Belastungszahl; für die weitere Planung hat dieses Signal Vorrang.`);
  return withEventText(`${scoreBits.join(" · ")}. Die Werte sind weder klar auffällig noch außergewöhnlich gut und werden zusammen mit dem persönlichen Verlauf bewertet.`);
}

function signalAssessment(load, review, heat) {
  const subjective = reviewState(review);
  if (subjective.hasPain) return { value: "Beschwerden gemeldet", tone: "watch", text: "Schmerzen haben Vorrang vor allen objektiven Kennzahlen." };
  if (subjective.poor) return { value: "Erholung auffällig", tone: "watch", text: "Mindestens ein subjektiver Erholungswert liegt im auffälligen Bereich." };
  if (heat?.status === "above_heat_expectation") return { value: "HF über Erwartung", tone: "watch", text: heat.text };
  if (["heat_explains", "stable_despite_heat"].includes(heat?.status) && subjective.stable) return { value: "Hitze gut verarbeitet", tone: "good", text: heat.text };
  if (subjective.strong) return { value: "Gut verarbeitet", tone: "good", text: "Beine, Energie und Gesamtgefühl sind stabil." };
  if (!subjective.hasReview) return { value: "Noch ohne Review", tone: "neutral", text: "Subjektive Rückmeldung fehlt noch." };
  if (["Hoch", "Sehr hoch"].includes(load.value) && subjective.stable) return { value: "Stabil verarbeitet", tone: "good", text: "Der hohe Trainingsreiz wird durch stabile Review-Signale relativiert." };
  return { value: "Unauffällig", tone: "neutral", text: "Kein einzelnes Signal sticht deutlich heraus." };
}

function followUpAssessment(load, execution, recovery, review, heat) {
  const subjective = reviewState(review);
  if (review?.isEvent && review.eventPlanningImpact === "depleted") {
    return { value: "Erholung beobachten", tone: "watch", text: "Du meldest deutliche Erschöpfung; dieses Signal sollte vor dem nächsten harten Reiz erneut geprüft werden." };
  }
  if (review?.isEvent && review.eventPlanningImpact === "training" && stableEventReview(review)) {
    return { value: "Wie Training verarbeitet", tone: "good", text: "Der Wettkampfstatus allein ist kein negatives Signal; entscheidend bleibt deine tatsächliche Verarbeitung." };
  }
  if (subjective.hasPain) return { value: "Beschwerden zuerst", tone: "watch", text: "Schmerzen haben Vorrang vor Pace, Herzfrequenz und Belastungswert." };
  if (subjective.poor) return { value: "Tagesform beobachten", tone: "watch", text: "Beine und Energie waren auffällig und sollten vor dem nächsten harten Reiz erneut eingeordnet werden." };
  if (heat?.status === "above_heat_expectation" && (subjective.rpe >= 7 || !subjective.strong)) {
    return { value: "HF beobachten", tone: "watch", text: "Die heutige HF lag über deiner bisherigen Wärme-Erwartung; relevant ist, ob das bei einer vergleichbaren Einheit erneut passiert." };
  }
  if (execution.value === "Mehr als geplant" && ["Hoch", "Sehr hoch"].includes(load.value)) {
    return { value: "Zusatzumfang unnötig", tone: "neutral", text: "Die Einheit war bereits größer als vorgesehen; zusätzliche Kilometer würden den Reiz nicht sinnvoller machen." };
  }
  if (recovery.value === "36–48 h") return { value: "Großer Reiz", tone: "neutral", text: "Die Einheit war belastend; die tatsächliche Erholung ist das nächste relevante Signal." };
  return { value: "Kein Zusatzsignal", tone: "good", text: heat?.hot ? "Die Hitze ist in der Einordnung bereits berücksichtigt." : "Aus der Einheit ergibt sich kein zusätzlicher Warnhinweis." };
}

function contextSummary(activity, load, execution, environment, review, heat, followUp) {
  const sentences = [];
  const temperature = heat?.temperature;
  if (heat?.hot && temperature != null) {
    const humidityText = heat.humidity != null && heat.humidity >= 65 ? ` bei ${Math.round(heat.humidity)} % Luftfeuchte` : "";
    sentences.push(`${Math.round(temperature)} °C${humidityText} haben die Einheit thermisch deutlich erschwert.`);
    if (heat.baselineSamples >= 3 && heat.observedDelta != null) {
      sentences.push(`Deine Ø-HF von ${Math.round(numeric(activity.avgHr))} bpm lag ${Math.round(heat.observedDelta) >= 0 ? "+" : ""}${Math.round(heat.observedDelta)} bpm über ${heat.baselineSamples} ähnlich gelaufenen Einheiten bei milden Bedingungen.`);
      if (heat.expectedHeatDelta != null) {
        if (heat.status === "above_heat_expectation") {
          sentences.push(`Deine bisherige persönliche Heat Response liegt bei etwa ${Math.round(heat.expectedHeatDelta) >= 0 ? "+" : ""}${Math.round(heat.expectedHeatDelta)} bpm; heute lag die HF darüber.`);
        } else {
          sentences.push(`Deine bisherige persönliche Heat Response liegt bei etwa ${Math.round(heat.expectedHeatDelta) >= 0 ? "+" : ""}${Math.round(heat.expectedHeatDelta)} bpm – die heutige Abweichung ist damit weitgehend erklärbar.`);
        }
      } else {
        sentences.push("Noch fehlen genug passende warme Vergleichsläufe, um daraus eine belastbare persönliche bpm-Korrektur abzuleiten.");
      }
    } else {
      sentences.push("Für eine persönliche HF-Korrektur fehlen noch genügend vergleichbare Läufe; die Hitze wird deshalb als Kontext markiert, nicht pauschal in bpm umgerechnet.");
    }
  } else if (environment.score > 0) {
    sentences.push(environment.text.replace(/ erhöhen die äußere Belastung\.?$/, " haben die Einheit zusätzlich erschwert."));
  }

  if (!sentences.length) {
    if (execution.value === "Im Planrahmen") sentences.push(`Die Einheit lag im geplanten Rahmen und erzeugte einen ${load.value.toLocaleLowerCase("de-DE")}en Trainingsreiz.`);
    else sentences.push(`${execution.text} Der Trainingsreiz wird im persönlichen Verlauf als ${load.value.toLocaleLowerCase("de-DE")} eingeordnet.`);
  }

  const subjective = reviewState(review);
  if (subjective.hasReview) {
    const bits = [
      subjective.legs > 0 ? `Beine ${subjective.legs}/10` : "",
      subjective.energy > 0 ? `Energie ${subjective.energy}/10` : "",
      subjective.rpe > 0 ? `RPE ${subjective.rpe}/10` : "",
    ].filter(Boolean);
    if (bits.length) sentences.push(`${bits.join(" · ")} ${subjective.strong ? "sprechen für eine stabile Verarbeitung." : subjective.poor ? "geben dem Coach ein Erholungssignal." : "werden ohne pauschale Wertung in den Verlauf eingeordnet."}`);
  }

  if (followUp.tone === "watch") sentences.push(`${followUp.value}: ${followUp.text}`);
  if (heat?.protectAerobicInterpretation && heat.status !== "above_heat_expectation") sentences.push("Dieser Hitzelauf wird nicht isoliert als aerober Formverlust gewertet.");
  return sentences.join(" ");
}


function runKindForNarrative(activity) {
  const text = `${activity?.name || ""} ${activity?.type || ""} ${activity?.sportType || ""}`.toLowerCase();
  if (/race|wettkampf|laufveranstaltung/.test(text)) return "race";
  if (/intervall|interval|track|tempo|schwelle|threshold|vo2/.test(text)) return "quality";
  if (/long|lang|backyard|ultra|loop/.test(text) || numeric(activity?.distance) >= 20) return "long";
  return "easy";
}

function paceSecondsForNarrative(activity) {
  const distance = numeric(activity?.distance);
  const seconds = numeric(activity?.durationSeconds) || numeric(activity?.duration) * 60;
  return distance > 0 && seconds > 0 ? seconds / distance : 0;
}

function medianForNarrative(values = []) {
  const safe = values.map(Number).filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (!safe.length) return 0;
  const middle = Math.floor(safe.length / 2);
  return safe.length % 2 ? safe[middle] : (safe[middle - 1] + safe[middle]) / 2;
}

function specificRunNarrative(state, activity, review, load, execution, heat) {
  if (!isRunningActivity(activity)) {
    return {
      summary: null,
      good: [],
      watch: [],
      nextAction: "Keine lauf-spezifische Detailbewertung nötig.",
    };
  }

  const kind = runKindForNarrative(activity);
  const timestamp = activityTimestamp(activity);
  const history = preferredActivities(state?.activities || [], { hideStrava: Boolean(state?.intervals?.connected) })
    .filter((candidate) => isRunningActivity(candidate) && activityTimestamp(candidate) < timestamp)
    .filter((candidate) => runKindForNarrative(candidate) === kind)
    .sort((left, right) => activityTimestamp(right) - activityTimestamp(left))
    .slice(0, 8);

  const currentHr = numeric(activity?.avgHr || activity?.averageHeartRate);
  const currentPace = paceSecondsForNarrative(activity);
  const medianHr = medianForNarrative(history.map((candidate) => numeric(candidate?.avgHr || candidate?.averageHeartRate)));
  const medianPace = medianForNarrative(history.map(paceSecondsForNarrative));
  const good = [];
  const watch = [];

  if (execution?.value === "Im Planrahmen") {
    good.push("Umfang und Dauer lagen im geplanten Rahmen");
  }

  if (heat?.hot) {
    if (heat.status === "above_heat_expectation") {
      watch.push("die HF lag heute über deiner bisher gelernten persönlichen Heat Response");
    } else if (["heat_explains", "stable_despite_heat"].includes(heat.status)) {
      good.push("Pace/HF blieben unter Hitze im Rahmen deiner persönlichen Heat Response");
    } else {
      watch.push("Hitze erschwert den HF-Vergleich; für eine belastbare persönliche Heat Response fehlen noch Vergleichsläufe");
    }
  } else if (currentHr > 0 && medianHr > 0 && currentPace > 0 && medianPace > 0) {
    const paceRatio = currentPace / medianPace;
    const hrDelta = currentHr - medianHr;
    if (paceRatio <= 1.03 && hrDelta <= 2) {
      good.push(`Pace/HF waren gegenüber vergleichbaren ${kind === "easy" ? "lockeren Läufen" : "Einheiten"} effizient`);
    } else if (paceRatio >= 0.98 && hrDelta >= 6) {
      watch.push(`Ø-HF lag trotz ähnlicher Pace etwa ${Math.round(hrDelta)} bpm über deinem Vergleichsbereich`);
    }
  }

  const legs = numeric(review?.legs);
  const energy = numeric(review?.energy);
  const feeling = numeric(review?.overallFeeling);
  if ((legs && legs <= 4) || (energy && energy <= 4) || (feeling && feeling <= 4)) {
    watch.push("das subjektive Review zeigt noch keine stabile Erholung");
  } else if ((legs >= 7 && energy >= 7) || feeling >= 8) {
    good.push("dein Review bestätigt eine gute Belastungsverträglichkeit");
  }

  const symptoms = [
    ...(Array.isArray(review?.painAreas) ? review.painAreas : []),
    ...(Array.isArray(review?.stomachSymptoms) ? review.stomachSymptoms : []),
  ].filter((item) => item && item !== "Keine Beschwerden" && item !== "Keine");
  if (symptoms.length) watch.push(`Review-Hinweis: ${symptoms.slice(0, 2).join(", ")}`);

  if (kind === "quality" && load?.tone === "bad") {
    watch.push("der Qualitätsreiz war bereits hoch – zusätzliche Intensität bringt heute keinen Bonus");
  }
  if (kind === "long" && numeric(activity?.distance) >= 30 && !watch.length) {
    good.push("der lange Reiz wurde ohne auffälliges Warnsignal abgeschlossen");
  }

  const goodText = good.length ? good.slice(0, 2).join("; ") : "keine einzelne Kennzahl sticht positiv heraus, die Einheit liegt aber im persönlichen Rahmen";
  const watchText = watch.length ? watch.slice(0, 2).join("; ") : "keine relevante Abweichung in den verfügbaren Signalen";
  const nextAction = watch.length
    ? "Beim nächsten lockeren Lauf dieselben Signale erneut prüfen und Umfang oder Intensität nicht vorschnell erhöhen."
    : kind === "quality"
      ? "Reiz abhaken; die Anpassung entsteht in der Erholung, nicht durch spontanes Draufpacken."
      : kind === "long"
        ? "Belastung jetzt verarbeiten; der nächste spezifische Schritt bleibt nur dann bestehen, wenn das Folge-Review stabil bleibt."
        : "Kein Änderungsbedarf aus dieser Einheit; Plan kontrolliert fortsetzen.";

  return {
    summary: `Gut: ${goodText}. Auffällig: ${watchText}. Konsequenz: ${nextAction}`,
    good,
    watch,
    nextAction,
  };
}


function segmentAverage(points, startSecond, endSecond) {
  const rows = points.filter((point) => (
    Number.isFinite(point.elapsedSeconds)
    && point.elapsedSeconds >= startSecond
    && point.elapsedSeconds <= endSecond
    && Number.isFinite(point.heartRate)
    && point.heartRate >= 50
    && point.heartRate <= 230
    && Number.isFinite(point.speedMps)
    && point.speedMps >= 1.1
  ));
  if (rows.length < 3) return null;
  const average = (key) => rows.reduce((sum, point) => sum + Number(point[key] || 0), 0) / rows.length;
  const first = rows[0];
  const last = rows.at(-1);
  const distanceMeters = Math.max(1, (Number(last.distanceKm || 0) - Number(first.distanceKm || 0)) * 1000);
  const altitudes = rows.map((point) => Number(point.altitude)).filter(Number.isFinite);
  const altitudeChange = Number.isFinite(first.altitude) && Number.isFinite(last.altitude) ? Number(last.altitude) - Number(first.altitude) : 0;
  let elevationGain = 0;
  for (let index = 1; index < rows.length; index += 1) {
    const previous = Number(rows[index - 1].altitude);
    const current = Number(rows[index].altitude);
    if (Number.isFinite(previous) && Number.isFinite(current) && current > previous) elevationGain += current - previous;
  }
  return {
    heartRate: average("heartRate"),
    speedMps: average("speedMps"),
    altitudeChange,
    altitudeRange: altitudes.length ? Math.max(...altitudes) - Math.min(...altitudes) : 0,
    elevationGainPerKm: elevationGain / Math.max(0.001, distanceMeters / 1000),
    grade: altitudeChange / distanceMeters,
    first,
    last,
    count: rows.length,
  };
}

function routeAnchorLabel(point = {}) {
  const distance = Number(point.distanceKm);
  const seconds = Number(point.elapsedSeconds);
  const parts = [];
  if (Number.isFinite(distance) && distance > 0) parts.push(`km ${distance.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`);
  if (Number.isFinite(seconds) && seconds > 0) {
    const minutes = Math.round(seconds / 60);
    parts.push(minutes >= 60 ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")} h` : `${minutes} min`);
  }
  return parts.join(" / ");
}

export function cardiacDriftAssessment(points = [], activity = {}, weather = {}) {
  const kind = runKindForNarrative(activity);
  if (!isRunningActivity(activity) || ["quality", "race"].includes(kind)) {
    return { available: false, relevant: false, status: "not-applicable", text: "Cardiac Drift ist für diese Einheit nicht das primäre Bewertungskriterium." };
  }

  const rows = (Array.isArray(points) ? points : [])
    .map((point) => ({
      ...point,
      elapsedSeconds: Number(point.elapsedSeconds),
      heartRate: Number(point.heartRate),
      speedMps: Number(point.speedMps),
      distanceKm: Number(point.distanceKm),
      altitude: Number(point.altitude),
    }))
    .filter((point) => Number.isFinite(point.elapsedSeconds) && Number.isFinite(point.heartRate) && Number.isFinite(point.speedMps))
    .filter((point) => point.heartRate >= 50 && point.heartRate <= 230 && point.speedMps >= 1.1)
    .sort((left, right) => left.elapsedSeconds - right.elapsedSeconds);

  if (rows.length < 20) return { available: false, relevant: true, status: "missing", text: "Für Cardiac Drift fehlen ausreichend synchronisierte HF-/Tempo-Daten." };
  const totalSeconds = rows.at(-1).elapsedSeconds - rows[0].elapsedSeconds;
  if (totalSeconds < 35 * 60) return { available: false, relevant: true, status: "short", text: "Die Einheit ist für eine belastbare Drift-Einordnung zu kurz." };

  const start = rows[0].elapsedSeconds;
  const baseline = segmentAverage(rows, start + totalSeconds * 0.18, start + totalSeconds * 0.43);
  const late = segmentAverage(rows, start + totalSeconds * 0.62, start + totalSeconds * 0.9);
  if (!baseline || !late || !(baseline.heartRate > 0) || !(late.heartRate > 0)) {
    return { available: false, relevant: true, status: "missing", text: "Für Cardiac Drift fehlen ausreichend stabile Laufabschnitte." };
  }

  const firstEfficiency = baseline.speedMps / baseline.heartRate;
  const lateEfficiency = late.speedMps / late.heartRate;
  const driftPercent = firstEfficiency > 0 ? ((firstEfficiency - lateEfficiency) / firstEfficiency) * 100 : 0;
  const thermal = Math.max(Number(weather?.temperature ?? activity?.temperature ?? -99), Number(weather?.feelsLike ?? -99));
  const wind = Number(weather?.windSpeed || 0);
  const contextThreshold = thermal >= 28 ? 8 : thermal >= 23 ? 6 : thermal <= 5 ? 6 : 5;
  const speedTolerance = wind >= 25 ? 0.07 : 0.055;
  const windowSeconds = 8 * 60;
  const stepSeconds = 2 * 60;
  let onset = null;

  for (let second = start + totalSeconds * 0.42; second + windowSeconds <= start + totalSeconds * 0.94; second += stepSeconds) {
    const window = segmentAverage(rows, second, second + windowSeconds);
    if (!window) continue;
    const hrDelta = window.heartRate - baseline.heartRate;
    const speedDelta = (window.speedMps - baseline.speedMps) / baseline.speedMps;
    const terrainComparable = Math.abs(window.grade - baseline.grade) <= 0.012
      && Math.abs(window.elevationGainPerKm - baseline.elevationGainPerKm) <= 10
      && window.altitudeRange <= Math.max(20, baseline.altitudeRange + 10);
    const similarOutput = Math.abs(speedDelta) <= speedTolerance;
    if (hrDelta >= contextThreshold && terrainComparable && similarOutput) {
      onset = { ...window, hrDelta, speedDelta, point: window.first };
      break;
    }
  }

  const clear = Boolean(onset && driftPercent >= 3.5);
  const mild = !clear && driftPercent >= 3 && late.heartRate - baseline.heartRate >= 3;
  const heatContext = thermal >= 23;
  const status = clear ? "clear" : mild ? "mild" : "stable";
  const anchor = onset?.point ? {
    distanceKm: Number.isFinite(onset.point.distanceKm) ? onset.point.distanceKm : null,
    elapsedSeconds: Number.isFinite(onset.point.elapsedSeconds) ? onset.point.elapsedSeconds : null,
    label: routeAnchorLabel(onset.point),
  } : null;
  const hrDelta = onset ? Math.round(onset.hrDelta) : Math.round(late.heartRate - baseline.heartRate);
  const speedChangePercent = onset ? Math.round(onset.speedDelta * 100) : Math.round(((late.speedMps - baseline.speedMps) / baseline.speedMps) * 100);

  let text = `Pace/HF blieben über die auswertbaren Abschnitte stabil; aerobe Entkopplung etwa ${Math.max(0, driftPercent).toFixed(1).replace(".", ",")} %.`;
  if (clear) {
    text = `Ab ${anchor?.label || "dem letzten Drittel"} stieg die HF über mehrere Minuten um etwa ${hrDelta} bpm, obwohl das Tempo nahezu gleich blieb. Aerobe Entkopplung etwa ${driftPercent.toFixed(1).replace(".", ",")} %.`;
    if (heatContext) text += ` ${Math.round(thermal)} °C wurden dabei bereits als Wärmekontext berücksichtigt.`;
  } else if (mild) {
    text = `Im letzten Teil zeigt sich eine leichte aerobe Entkopplung von etwa ${driftPercent.toFixed(1).replace(".", ",")} %. Das ist ein Beobachtungssignal, noch kein klarer Knick.`;
  } else if (heatContext && late.heartRate > baseline.heartRate + 2) {
    text = `Die HF stieg im Verlauf leicht an, bleibt unter ${Math.round(thermal)} °C aber ohne klaren, pace-bereinigten Drift-Knick.`;
  }

  return {
    available: true,
    relevant: true,
    status,
    driftPercent: Number(driftPercent.toFixed(1)),
    hrDelta,
    speedChangePercent,
    onset: anchor,
    heatContext,
    thermal: Number.isFinite(thermal) && thermal > -50 ? thermal : null,
    text,
  };
}

function coachPurpose(state, activity, relevance) {
  const kind = runKindForNarrative(activity);
  const goal = goalRequirements(state);
  if (kind === "quality") return { title: "Guter Qualitätsreiz.", purpose: "Tempo und Belastungskontrolle" };
  if (kind === "long") return { title: "Wichtiger Ausdauerreiz.", purpose: goal.discipline === "ultra" ? "Ermüdungsresistenz und Zeit auf den Beinen" : "Ausdauerrobustheit" };
  if (kind === "race") return { title: "Starker Wettkampfreiz.", purpose: "Wettkampfspezifische Belastung" };
  return { title: "Gute Einheit für deine aerobe Basis.", purpose: relevance?.text || "ruhige aerobe Entwicklung" };
}

function compactCoachMessage(state, activity, review, { load, execution, relevance, heat, drift, environment }) {
  const kind = runKindForNarrative(activity);
  const subjective = reviewState(review);
  const purpose = coachPurpose(state, activity, relevance);
  const goal = goalRequirements(state);
  const goalSentence = goal.discipline === "ultra"
    ? "Das zahlt direkt auf deinen Ultra-Aufbau ein."
    : relevance?.tone === "good" ? relevance.text : "Der Reiz passt in den aktuellen Aufbau.";

  if (subjective.hasPain) {
    return {
      tone: "watch",
      title: "Die Beschwerden sind heute das wichtigste Signal.",
      text: "Pace, Herzfrequenz und Belastungswert treten hinter deiner Rückmeldung zurück.",
      tip: "Beobachte die betroffene Stelle vor der nächsten belastenden Laufeinheit erneut.",
      anchor: null,
    };
  }

  if (drift?.status === "clear" && ["easy", "long"].includes(kind)) {
    const anchor = drift.onset?.label || "dem letzten Drittel";
    const currentPace = paceSecondsPerKm(activity);
    const paceStep = Math.max(5, Math.round((currentPace * 0.025) / 5) * 5);
    return {
      tone: "watch",
      title: kind === "easy" ? "Heute etwas zu teuer für einen lockeren Lauf." : "Der lange Lauf wurde hinten deutlich teurer.",
      text: `Bis etwa ${anchor} war die Belastung sauber kontrolliert. Danach stieg deine HF bei nahezu gleicher Pace und vergleichbarem Höhenprofil nachhaltig an${drift.heatContext ? " – trotz bereits berücksichtigtem Wärmekontext" : ""}.${subjective.poor ? " Deine schwächere Tagesform passt zu diesem Knick." : ""}`,
      tip: `Heute wäre ab etwa ${anchor} der richtige Moment gewesen, ungefähr ${paceStep}–${paceStep + 5} s/km herauszunehmen und die HF wieder zu beruhigen.${kind === "long" ? " Bei einem Longrun dort zusätzlich Fueling und Flüssigkeit kurz gegenprüfen." : ""} Beim nächsten vergleichbaren Lauf auf genau dieses Signal reagieren.`,
      anchor: drift.onset,
    };
  }

  if (heat?.hot && ["heat_explains", "stable_despite_heat"].includes(heat.status)) {
    return {
      tone: "good",
      title: "Unter den Bedingungen sauber kontrolliert.",
      text: `${heat.text} ${goalSentence}`,
      tip: null,
      anchor: null,
    };
  }

  if (subjective.poor) {
    const bits = [subjective.legs ? `Beine ${subjective.legs}/10` : "", subjective.energy ? `Energie ${subjective.energy}/10` : "", subjective.rpe ? `RPE ${subjective.rpe}/10` : ""].filter(Boolean).join(" · ");
    return {
      tone: "watch",
      title: "Der Reiz passt, die Tagesform war aber nicht ganz stabil.",
      text: `${bits}. Das subjektive Signal ist heute wichtiger als ein unauffälliger Durchschnittswert.`,
      tip: "Beim nächsten lockeren Lauf früh auf Beine, Energie und HF reagieren statt eine Pace zu erzwingen.",
      anchor: null,
    };
  }

  const stableDrift = drift?.status === "stable" && drift.available;
  const executionText = execution?.value === "Im Planrahmen" ? "Umfang und Dauer lagen im vorgesehenen Rahmen." : execution?.text;
  const internalText = stableDrift
    ? "Herzfrequenz und Pace blieben über den auswertbaren Verlauf stabil."
    : numeric(activity?.avgHr) > 0 ? "Herzfrequenz und Belastung lagen ohne klares Warnsignal im persönlichen Rahmen." : "Die verfügbaren Belastungssignale liegen im persönlichen Rahmen.";
  const coldText = environment?.cold ? " Die Kälte wurde bei der Einordnung berücksichtigt." : "";
  return {
    tone: load?.tone === "watch" ? "neutral" : "good",
    title: purpose.title,
    text: `${executionText} ${internalText}${coldText} ${goalSentence}`.replace(/\s+/g, " ").trim(),
    tip: drift?.status === "mild" ? "Im letzten Teil war eine leichte Entkopplung sichtbar. Beim nächsten ähnlichen Lauf darauf achten, ob sie früher oder stärker einsetzt." : null,
    anchor: null,
  };
}

function dataConfidence(activity, weather, heat) {
  const checks = [
    numeric(activity.durationSeconds || numeric(activity.duration) * 60) > 0,
    numeric(activity.distance) > 0,
    numeric(activity.avgHr) > 0 || Boolean(activity.heartRateZones?.zones?.length),
    numeric(activity.elevation || activity.elevationGain) > 0,
    weather?.temperature != null,
    numeric(activity.trainingLoad) > 0 || numeric(activity.trimp) > 0,
  ];
  const count = checks.filter(Boolean).length;
  const personalText = heat?.active
    ? ` Persönlicher Wärmekontext: ${heat.confidenceLabel}${heat.heatPairs ? ` aus ${heat.heatPairs} Warm/Kühl-Vergleichen` : ""}.`
    : "";
  if (count >= 5) return { value: "Hoch", tone: "good", text: `${count} von 6 relevanten Datenbereichen vorhanden.${personalText}` };
  if (count >= 3) return { value: "Mittel", tone: "neutral", text: `${count} von 6 relevanten Datenbereichen vorhanden.${personalText}` };
  return { value: "Eingeschränkt", tone: "watch", text: `Die Einschätzung basiert überwiegend auf Dauer, Distanz und Aktivitätstyp.${personalText}` };
}

export function activityCoachAssessment(state, activity, review = {}, weatherOverride = null, routePoints = []) {
  const weather = weatherOverride || activity.weather || null;
  const load = loadAssessment(state, activity);
  const execution = executionAssessment(state, activity);
  const environment = weatherAssessment(activity, weather);
  const elevation = elevationAssessment(activity);
  const recovery = recoveryAssessment(load, environment, elevation, activity, review);
  const relevance = goalRelevance(state, activity, elevation);
  const heat = personalHeatContext(state, activity, review, weather);
  const signal = signalAssessment(load, review, heat);
  const followUp = followUpAssessment(load, execution, recovery, review, heat);
  const stimulus = {
    value: load.value,
    tone: load.tone,
    text: `${load.text}${environment.score > 0 ? ` · ${environment.value}` : ""}`,
  };
  const confidence = dataConfidence(activity, weather, heat);
  const drift = cardiacDriftAssessment(routePoints, activity, weather || {});
  const athlete = athleteProfileAssessment(state, activityTimestamp(activity));
  const factors = [
    `${numeric(activity.distance).toFixed(1)} km · ${Math.round(durationMinutes(activity))} min`,
    elevation.text,
  ];
  if (numeric(activity.avgHr) > 0) factors.push(`Ø ${Math.round(numeric(activity.avgHr))} bpm`);
  if (highZoneShare(activity) > 0) factors.push(`${Math.round(highZoneShare(activity))} % in HF-Zone 4–5`);
  if (weather?.temperature != null) factors.push(`${Math.round(numeric(weather.temperature))} °C${weather?.humidity != null ? ` · ${Math.round(numeric(weather.humidity))} % Feuchte` : ""}`);
  if (heat.baselineSamples) factors.push(`${heat.baselineSamples} ähnliche milde Läufe`);
  if (heat.heatPairs) factors.push(`Heat Response ${Math.round(heat.expectedHeatDelta) >= 0 ? "+" : ""}${Math.round(heat.expectedHeatDelta)} bpm · ${heat.heatPairs} Vergleichspaare`);
  if (drift.available) factors.push(`Aerobe Entkopplung ${drift.driftPercent.toLocaleString("de-DE")} %${drift.onset?.label ? ` · Knick ab ${drift.onset.label}` : ""}`);
  factors.push(`Vergleich mit ${athlete.metrics.activeWeeks} aktiven Wochen`);
  const narrative = specificRunNarrative(state, activity, review, load, execution, heat);
  const coachMessage = compactCoachMessage(state, activity, review, { load, execution, relevance, heat, drift, environment });
  return {
    generatedAt: new Date().toISOString(),
    load,
    execution,
    environment,
    elevation,
    recovery,
    relevance,
    heat,
    drift,
    coachMessage,
    stimulus,
    signal,
    followUp,
    confidence,
    summary: [
      contextSummary(activity, load, execution, environment, review, heat, followUp),
      narrative.summary,
    ].filter(Boolean).join(" "),
    coachNarrative: narrative.summary || "",
    good: narrative.good,
    watch: narrative.watch,
    nextAction: narrative.nextAction,
    comparison: subjectiveComparison(load, review, heat),
    factors,
  };
}
