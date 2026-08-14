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
  const thermal = Math.max(numeric(temperature), numeric(feelsLike));
  if (thermal >= 32) { score += 3; factors.push(`${Math.round(numeric(temperature || thermal))} °C`); }
  else if (thermal >= 28) { score += 2; factors.push(`${Math.round(numeric(temperature || thermal))} °C`); }
  else if (thermal >= 23) { score += 1; factors.push(`${Math.round(numeric(temperature || thermal))} °C`); }
  if (humidity != null && numeric(humidity) >= 75 && thermal >= 23) { score += 1; factors.push(`${Math.round(numeric(humidity))} % Luftfeuchte`); }
  if (wind != null && numeric(wind) >= 30) { score += 1; factors.push(`${Math.round(numeric(wind))} km/h Wind`); }
  if (!factors.length) return { value: "Unauffällig", tone: "neutral", text: temperature != null ? `${Math.round(numeric(temperature))} °C ohne klaren Zusatzfaktor.` : "Keine ausreichenden Umgebungsdaten verfügbar.", score: 0, thermal };
  return {
    value: score >= 3 ? "Deutlich erschwert" : "Erschwert",
    tone: score >= 3 ? "watch" : "neutral",
    text: `${factors.join(" · ")} erhöhen die äußere Belastung.`,
    score,
    thermal,
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
  const stomachSymptoms = (Array.isArray(review.stomachSymptoms) ? review.stomachSymptoms : [])
    .filter((symptom) => !String(symptom).startsWith("Keine"));
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
    return { value: "Folgetage neu prüfen", tone: "watch", text: "Kein starrer Pausenblock: Die nächste Belastung folgt erst bei stabiler Erholung." };
  }
  if (review?.isEvent && review.eventPlanningImpact === "training" && stableEventReview(review)) {
    return { value: "Plan bleibt bestehen", tone: "good", text: "Der Eventstatus allein verändert die Folgeplanung nicht." };
  }
  if (subjective.hasPain) return { value: "Belastung aussetzen", tone: "watch", text: "Schmerzen zuerst klären; kein automatisches Weiterziehen des Plans." };
  if (subjective.poor) return { value: "Nächste Belastung prüfen", tone: "watch", text: "Vor der nächsten intensiven Einheit Beine und Energie erneut bewerten." };
  if (heat?.status === "above_heat_expectation" && (subjective.rpe >= 7 || !subjective.strong)) {
    return { value: "Schlüsselreiz prüfen", tone: "watch", text: "Die heutige HF liegt über deiner bisherigen Wärme-Erwartung; erst den nächsten lockeren Verlauf abwarten." };
  }
  if (execution.value === "Mehr als geplant" && ["Hoch", "Sehr hoch"].includes(load.value)) {
    return { value: "Keinen Umfang nachholen", tone: "neutral", text: "Die Einheit war bereits größer als vorgesehen; zusätzliche Kilometer bringen aktuell keinen Vorteil." };
  }
  if (recovery.value === "36–48 h") return { value: "Regeneration priorisieren", tone: "neutral", text: "Der Reiz war groß; die nächsten Einheiten nur bei stabilen Signalen wie geplant absolvieren." };
  return { value: "Plan bleibt bestehen", tone: "good", text: heat?.hot ? "Die Hitze wird als Kontext verbucht und löst allein keine Planänderung aus." : "Kein belastbares Signal verlangt aktuell eine Planänderung." };
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

  sentences.push(followUp.value === "Plan bleibt bestehen" ? "Der Plan bleibt bestehen." : `${followUp.value}: ${followUp.text}`);
  if (heat?.protectAerobicInterpretation && heat.status !== "above_heat_expectation") sentences.push("Dieser Hitzelauf wird nicht isoliert als aerober Formverlust gewertet.");
  return sentences.join(" ");
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

export function activityCoachAssessment(state, activity, review = {}, weatherOverride = null) {
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
  factors.push(`Vergleich mit ${athlete.metrics.activeWeeks} aktiven Wochen`);
  return {
    generatedAt: new Date().toISOString(),
    load,
    execution,
    environment,
    elevation,
    recovery,
    relevance,
    heat,
    stimulus,
    signal,
    followUp,
    confidence,
    summary: contextSummary(activity, load, execution, environment, review, heat, followUp),
    comparison: subjectiveComparison(load, review, heat),
    factors,
  };
}
