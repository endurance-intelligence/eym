import { reviewKind } from "./activityUtils.js";
import {
  buildEventWeek,
  eventDurationMinutes,
  eventGoalLabel,
  eventRelation,
} from "./goalPlanning.js";
import {
  applyGoalWeekendSpecificity,
  buildGoalEngine,
  goalLongRunBounds,
  goalSpecificSession,
  isBeginnerFiveKGoal,
  longRunGoalGuidance,
  publicGoalSummary,
} from "./goalEngine.js";

const DAY_NAMES = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const DAY_INDEX = { Montag: 0, Dienstag: 1, Mittwoch: 2, Donnerstag: 3, Freitag: 4, Samstag: 5, Sonntag: 6 };
const DAY_MS = 86400000;

export const workoutTypes = [
  "Easy Run",
  "Long Run",
  "Schwellenlauf",
  "Intervalle",
  "Backyard Training",
  "Loop-Training",
  "ORC Run",
  "ORC Track",
  "Samstagsoption",
  "Fußball",
  "Stabi",
  "Rudern",
  "Laufband",
  "Radfahren",
  "Schwimmen",
  "Mobility",
  "Wettkampf",
  "Sonstiges",
  "Ruhetag",
];

export function startOfWeek(input = new Date(), offsetWeeks = 0) {
  const date = new Date(input);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1 + offsetWeeks * 7);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function isoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dateForDay(weekStart, index) {
  const date = new Date(weekStart);
  date.setDate(date.getDate() + index);
  return date;
}

function activityDate(activity) {
  return String(activity?.startDateLocal || activity?.date || "").slice(0, 10);
}

function isRun(activity) {
  const value = `${activity?.type || ""} ${activity?.sportType || ""} ${activity?.name || ""}`.toLowerCase();
  return value.includes("run") || value.includes("lauf") || value.includes("treadmill");
}

function runningWeeks(activities, weekStart, count = 8) {
  return Array.from({ length: count }, (_, index) => {
    const end = new Date(weekStart);
    end.setDate(end.getDate() - index * 7);
    const start = new Date(end);
    start.setDate(start.getDate() - 7);
    const km = activities.reduce((sum, activity) => {
      const date = new Date(`${activityDate(activity)}T12:00:00`);
      return isRun(activity) && date >= start && date < end ? sum + Number(activity.distance || 0) : sum;
    }, 0);
    return { start, km };
  });
}

function weightedAverage(values) {
  const weights = [0.4, 0.3, 0.2, 0.1];
  const available = values.slice(0, 4);
  const weightSum = available.reduce((sum, _value, index) => sum + weights[index], 0);
  return weightSum ? available.reduce((sum, value, index) => sum + value * weights[index], 0) / weightSum : 0;
}

function boundedNumber(value, minimum, maximum, fallback) {
  if (value === "" || value == null) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function isRunningPlanEntry(entry) {
  const value = `${entry?.type || ""} ${entry?.title || ""}`.toLowerCase();
  if (/rudern|rowing|rad|ride|bike|cycling|schwimm|swim|fußball|football|soccer|stabi|mobility|mobilität/.test(value)) return false;
  return /run|lauf|orc|interval|schwelle|backyard|track|treadmill|wettkampf|race|marathon|ultra/.test(value);
}

function recentLongestRun(activities, weekStart) {
  const start = new Date(weekStart);
  start.setDate(start.getDate() - 56);
  return activities.reduce((max, activity) => {
    const date = new Date(`${activityDate(activity)}T12:00:00`);
    if (!isRun(activity) || date < start || date >= weekStart) return max;
    return Math.max(max, Number(activity.distance || 0));
  }, 0);
}

function loopTrainingPrescription(goal, daysLeft, longRun, cycle, recoveryWeek) {
  const loopKm = Number(goal?.loopKm || 0);
  if (!loopKm || recoveryWeek || daysLeft > 84 || daysLeft <= 14 || longRun < loopKm * 2) return null;
  const alternatingWeek = Math.floor(daysLeft / 7) % 2 === 0;
  const specificEnough = daysLeft <= 49 || alternatingWeek || cycle === 3;
  if (!specificEnough) return null;
  const desiredLoops = daysLeft > 56 ? 3 : daysLeft > 35 ? 4 : 5;
  const availableLoops = Math.max(2, Math.floor(longRun / loopKm));
  const loops = Math.max(2, Math.min(desiredLoops, availableLoops, goal.goalKind === "backyard" ? 6 : 7));
  const distance = Math.round(loops * loopKm * 10) / 10;
  const loopLabel = String(loopKm).replace(".", ",");
  const supplyRoutine = goal.aidStationMode === "every_loop"
    ? "Nach jeder Runde den geplanten kurzen Stopp und den Zugriff auf Getränke oder Fuel proben."
    : goal.aidStationMode === "fixed_stations"
      ? "Die Abstände der Verpflegungspunkte im Training realistisch simulieren."
      : goal.aidStationMode === "self_supported"
        ? "Die geplante Selbstversorgung und das komplette Material mitführen."
        : "Pausen- und Fuel-Routine passend zum Event testen.";
  return {
    loops,
    loopKm,
    distance,
    title: `${loops} × ${loopLabel} km${goal?.name ? ` · ${goal.name}` : " Loop-Training"}`,
    notes: goal.goalKind === "backyard"
      ? `Spezifischer Backyard-Block: jede Runde kontrolliert und die Geh-/Rundenroutine testen. ${supplyRoutine} Keine komplette 60–80-km-Generalprobe im Training erzwingen.`
      : `Spezifischer Loop-Block für ${goal?.name || "das Hauptziel"}: gleichmäßige Pace und kurze Stopps. ${supplyRoutine}`,
  };
}

function cycleWeek(mission, weekStart) {
  const raw = mission?.preparationStartDate || mission?.date;
  if (!raw) return 1;
  const start = startOfWeek(new Date(`${raw}T12:00:00`));
  const diffWeeks = Math.max(0, Math.floor((weekStart - start) / (7 * DAY_MS)));
  return (diffWeeks % 4) + 1;
}

function recentMissedSignals(planHistory, weekStart) {
  const since = new Date(weekStart);
  since.setDate(since.getDate() - 21);
  return planHistory.reduce((signals, item) => {
    const date = new Date(`${item.date || "1970-01-01"}T12:00:00`);
    if (date < since || date >= weekStart) return signals;
    const reason = String(item.missedReason || "").toLowerCase();
    if (reason.includes("müde")) signals.fatigue += 1;
    if (reason.includes("schmerz")) signals.pain += 1;
    if (reason.includes("krank")) signals.illness += 1;
    return signals;
  }, { fatigue: 0, pain: 0, illness: 0 });
}

function readinessDecision(config, missedSignals) {
  const checkin = config.checkin || {};
  let factor = 1;
  let hardAllowed = true;
  let longRunAllowed = true;
  const notes = [];

  const energy = Number(checkin.energy || 4);
  if (energy <= 2) {
    factor *= 0.78;
    hardAllowed = false;
    notes.push("Energie niedrig: Umfang reduziert und keine zusätzliche Qualitätseinheit.");
  }

  if (["unchanged", "worse"].includes(checkin.fatigue)) {
    factor *= checkin.fatigue === "worse" ? 0.72 : 0.84;
    hardAllowed = false;
    notes.push("Müdigkeit noch vorhanden: Belastung wird vorsichtig geplant.");
  } else if (missedSignals.fatigue >= 2 && checkin.fatigue !== "better") {
    factor *= 0.88;
    hardAllowed = false;
    notes.push("Mehrere Müdigkeits-Rückmeldungen aus den letzten Wochen berücksichtigt.");
  }

  const painLevel = Number(checkin.painLevel || 0);
  if (["unchanged", "worse"].includes(checkin.pain) || painLevel >= 4) {
    factor *= painLevel >= 7 || checkin.pain === "worse" ? 0.5 : 0.7;
    hardAllowed = false;
    longRunAllowed = painLevel < 7;
    notes.push("Schmerzen nicht vollständig abgeklungen: kein intensives Training, Longrun begrenzt.");
  } else if (missedSignals.pain > 0 && checkin.pain !== "better" && checkin.pain !== "none") {
    factor *= 0.82;
    hardAllowed = false;
  }

  if (checkin.illness === "symptoms") {
    factor *= 0.35;
    hardAllowed = false;
    longRunAllowed = false;
    notes.push("Noch Krankheitssymptome: nur sehr leichte Bewegung oder Pause einplanen.");
  } else if (checkin.illness === "recovering") {
    factor *= 0.62;
    hardAllowed = false;
    longRunAllowed = false;
    notes.push("Noch nicht bei 100 %: stufenweiser Wiedereinstieg ohne harte Einheit.");
  } else if (missedSignals.illness > 0 && checkin.illness !== "healthy") {
    factor *= 0.75;
    hardAllowed = false;
  }

  return { factor, hardAllowed, longRunAllowed, notes };
}

function highZoneShare(activity) {
  return (activity?.heartRateZones?.zones || [])
    .filter((zone) => Number(zone.zone) >= 4)
    .reduce((sum, zone) => sum + Number(zone.percentage || 0), 0);
}

function isExpectedHardSession(activity, review) {
  if (review?.isEvent && review?.eventPlanningImpact === "training") return false;
  const text = `${activity?.name || ""} ${activity?.type || ""} ${activity?.sportType || ""}`.toLowerCase();
  const durationMinutes = Number(activity?.durationSeconds || 0) / 60 || Number(activity?.duration || 0);
  const elevation = Number(activity?.elevation || activity?.elevationGain || 0);
  const distance = Number(activity?.distance || 0);
  const objectiveDemand = distance >= 20
    || durationMinutes >= 90
    || elevation >= 300
    || /longrun|long run|backyard|intervall|interval|schwelle|threshold|sprint|orc track|wettkampf|race/.test(text);
  const recoveryProblem = Number(review?.legs ?? 10) <= 4 || Number(review?.energy ?? 10) <= 4;
  return Number(review?.rpe || 0) >= 8 && objectiveDemand && !recoveryProblem;
}

function isUnexpectedHardSession(activity, review) {
  if (review?.isEvent && review?.eventPlanningImpact === "training") {
    return Number(review?.legs ?? 10) <= 4 || Number(review?.energy ?? 10) <= 4;
  }
  const rpe = Number(review?.rpe || 0);
  if (Number(review?.legs ?? 10) <= 4 || Number(review?.energy ?? 10) <= 4) return true;
  if (rpe < 8) return false;
  return !isExpectedHardSession(activity, review);
}

export function reviewGuidance(activities = [], reviews = {}, weekStart = new Date()) {
  const cutoff = new Date(weekStart);
  cutoff.setDate(cutoff.getDate() - 14);
  const recent = activities.filter((activity) => {
    const date = new Date(`${activityDate(activity)}T12:00:00`);
    return date >= cutoff && date < weekStart && reviews[activity.id];
  });

  let factor = 1;
  let hardAllowed = true;
  let longRunAllowed = true;
  let strengthFactor = 1;
  let avoidDoubleStrength = false;
  const notes = [];

  const endurance = recent.filter((activity) => reviewKind(activity) === "endurance");
  const strength = recent.filter((activity) => reviewKind(activity) === "strength");
  const tired = endurance.filter((activity) => {
    const review = reviews[activity.id];
    return Number(review.legs || 5) <= 4 || Number(review.energy || 5) <= 4;
  }).length;
  const unexpectedHard = endurance.filter((activity) => isUnexpectedHardSession(activity, reviews[activity.id])).length;
  const expectedHard = endurance.filter((activity) => isExpectedHardSession(activity, reviews[activity.id])).length;
  const depletedEvents = endurance.filter((activity) => reviews[activity.id]?.isEvent && reviews[activity.id]?.eventPlanningImpact === "depleted").length;
  const highHr = endurance.filter((activity) => {
    if (reviews[activity.id]?.isEvent) return false;
    const text = `${activity.name || ""} ${activity.type || ""}`.toLowerCase();
    const intendedEasy = /locker|easy|recovery|longrun|long run|orc run/.test(text) && !/intervall|schwelle|tempo|race|wettkampf/.test(text);
    return intendedEasy && highZoneShare(activity) >= 25 && Number(reviews[activity.id]?.rpe || 5) >= 6;
  }).length;
  const strong = endurance.filter((activity) => {
    const review = reviews[activity.id];
    return Number(review.legs || 0) >= 7 && Number(review.energy || 0) >= 7 && Number(review.rpe || 10) <= 5;
  }).length;
  const upperBodyLoad = strength.filter((activity) => {
    const review = reviews[activity.id];
    return Number(review.upperBodySoreness || 0) >= 6
      || Number(review.backSoreness || 0) >= 5
      || review.impactOnRunning === "deutlich";
  }).length;

  if (tired >= 2) {
    factor *= 0.86;
    hardAllowed = false;
    notes.push("Mehrere Reviews zeigen niedrige Beine oder Energie: Umfang und Intensität werden reduziert.");
  }
  if (unexpectedHard >= 2) {
    factor *= 0.9;
    hardAllowed = false;
    notes.push("Mehrere Einheiten waren härter als ihr Trainingscharakter erwarten ließ oder wurden schlecht verarbeitet: keine zusätzliche Qualitätseinheit.");
  } else if (expectedHard >= 2) {
    notes.push("Mehrere harte Schlüsselreize wurden als erwartbar erkannt. Sie zählen als Belastung, lösen ohne Erholungswarnung aber keine automatische Entlastung aus.");
  }
  if (depletedEvents >= 1) {
    factor *= 0.78;
    hardAllowed = false;
    notes.push("Dein Event-Review meldet deutliche Erschöpfung: Die nächste Woche wird entlastet und ohne harte Zusatzbelastung geplant.");
  }
  if (highHr >= 1) {
    factor *= highHr >= 2 ? 0.86 : 0.93;
    hardAllowed = false;
    notes.push("Herzfrequenz war bei einem lockeren Lauf auffällig hoch: zunächst ruhiger planen und Entwicklung beobachten.");
  }
  if (upperBodyLoad >= 1) {
    strengthFactor = upperBodyLoad >= 2 ? 0.55 : 0.7;
    avoidDoubleStrength = true;
    notes.push("Oberkörper/Rücken sind noch belastet: Rudern und Stabi werden verkürzt und nicht als hartes Doppeltraining gelegt.");
  }
  if (!tired && !unexpectedHard && !highHr && strong >= 3) {
    factor *= 1.03;
    notes.push("Mehrere stabile Reviews erlauben einen kleinen, kontrollierten Aufbau.");
  }

  if (factor < 0.7) longRunAllowed = false;
  return { factor, hardAllowed, longRunAllowed, strengthFactor, avoidDoubleStrength, notes, reviewed: recent.length };
}

function combineReadiness(checkinReadiness, reviewReadiness) {
  return {
    factor: checkinReadiness.factor * reviewReadiness.factor,
    hardAllowed: checkinReadiness.hardAllowed && reviewReadiness.hardAllowed,
    longRunAllowed: checkinReadiness.longRunAllowed && reviewReadiness.longRunAllowed,
    strengthFactor: reviewReadiness.strengthFactor,
    avoidDoubleStrength: reviewReadiness.avoidDoubleStrength,
    notes: [...checkinReadiness.notes, ...reviewReadiness.notes],
  };
}

function weatherForDate(forecast, date) {
  return forecast?.find((item) => item.date === isoDate(date)) || null;
}

function weatherDecision(weather, config) {
  if (!weather) return null;
  const tooHot = weather.maxTemp >= Number(config.maxOutdoorTemperature || 29);
  const tooWindy = weather.maxGust >= Number(config.maxWindGust || 55);
  const storm = weather.weatherCode >= 95;
  return { tooHot, tooWindy, storm, indoor: tooHot || tooWindy || storm };
}

function hasCyclingAlternative(config = {}) {
  return Array.isArray(config.replacementSports) && config.replacementSports.includes("cycling");
}

function cyclingWeatherCandidate(entry, config = {}) {
  const weather = entry?.weatherForecast;
  if (!weather) return null;
  const weatherCode = Number(weather.weatherCode);
  const rainChance = Number(weather.rainChance ?? 100);
  const maxGust = Number(weather.maxGust ?? 999);
  const maxTemp = Number(weather.maxTemp);
  const precipitation = (weatherCode >= 51 && weatherCode <= 67)
    || (weatherCode >= 80 && weatherCode <= 82)
    || weatherCode >= 95;
  const windLimit = Math.min(40, Number(config.maxWindGust || 55));
  const temperatureLimit = Number(config.maxOutdoorTemperature || 29);
  if (
    precipitation
    || rainChance > 30
    || maxGust > windLimit
    || !Number.isFinite(maxTemp)
    || maxTemp < 8
    || maxTemp > temperatureLimit
  ) return null;

  const dayPreference = { Samstag: 0, Sonntag: 2, Freitag: 4 }[entry.day] ?? 6;
  const temperaturePenalty = Math.abs(maxTemp - 18);
  return {
    entry,
    weather,
    score: rainChance * 2 + maxGust + temperaturePenalty + dayPreference,
  };
}

export function suggestRoadCyclingAlternative(plan = [], config = {}, context = {}) {
  if (!hasCyclingAlternative(config) || context.eventWeek) return plan;
  if (context.readiness?.hardAllowed === false) return plan;
  if (["recovering", "symptoms"].includes(config.checkin?.illness)) return plan;

  const eligible = plan
    .filter((entry) => (
      entry.type === "Easy Run"
      && ["Freitag", "Samstag", "Sonntag"].includes(entry.day)
      && !entry.fixed
      && !entry.commitmentId
      && !entry.eventProtection
      && !entry.raceEvent
      && !entry.keySession
      && !entry.loopTraining
      && !entry.completed
      && !entry.missedReason
    ))
    .map((entry) => cyclingWeatherCandidate(entry, config))
    .filter(Boolean)
    .sort((left, right) => left.score - right.score);

  const recommendation = eligible[0];
  if (!recommendation) return plan;

  const duration = Math.max(
    45,
    Math.min(120, Math.round((Number(recommendation.entry.duration || 45) * 1.3) / 5) * 5),
  );
  const weather = recommendation.weather;
  const day = recommendation.entry.day;
  const reason = `${day} bietet laut Vorhersage das passendste Rennradfenster: `
    + `${weather.maxTemp} °C · ${weather.rainChance} % Regenrisiko · Böen ${weather.maxGust} km/h. `
    + "Der lockere Lauf bleibt stehen, bis du den Tausch bestätigst.";

  return plan.map((entry) => entry.id === recommendation.entry.id ? {
    ...entry,
    coachAlternative: {
      source: "weather-cycling",
      key: "sport:cycling",
      label: "Lockere Rennradrunde",
      title: `${duration} min Rennrad locker`,
      duration,
      reason,
      weather: {
        date: weather.date,
        weatherCode: weather.weatherCode,
        maxTemp: weather.maxTemp,
        maxGust: weather.maxGust,
        rainChance: weather.rainChance,
      },
    },
  } : entry);
}

function item(weekStart, dayIndex, values) {
  const date = dateForDay(weekStart, dayIndex);
  const fixed = Boolean(values.fixed);
  const spontaneous = fixed ? false : values.spontaneous !== false;
  return {
    id: crypto.randomUUID(),
    date: isoDate(date),
    day: DAY_NAMES[date.getDay()],
    duration: 60,
    completed: false,
    source: "planner-engine",
    archived: false,
    ...values,
    fixed,
    spontaneous,
    time: spontaneous ? "" : values.time || "",
  };
}

function eventWeekTarget(base, readiness, eventWeek) {
  if (!eventWeek) return null;
  const readinessFactor = Math.max(0.35, Math.min(1, Number(readiness.factor || 1)));
  const supplementalKm = Math.round(Math.min(
    eventWeek.maxSupplementalKm,
    base * eventWeek.supplementalShare,
  ) * readinessFactor);
  return Math.max(
    Math.round(eventWeek.totalDistanceKm),
    Math.round(eventWeek.totalDistanceKm + supplementalKm),
  );
}

function weekDayIndex(weekStart, dateValue) {
  const date = new Date(`${dateValue}T12:00:00`);
  date.setHours(0, 0, 0, 0);
  return Math.round((date - weekStart) / DAY_MS);
}

function addMissionEvents(plan, weekStart, eventWeek) {
  if (!eventWeek) return;
  eventWeek.events.forEach((event) => {
    const dayIndex = weekDayIndex(weekStart, event.date);
    if (dayIndex < 0 || dayIndex > 6) return;
    const profile = [
      Number(event.elevationGain || 0) > 0 ? `${Number(event.elevationGain)} hm aufwärts` : "",
      event.surface ? `Untergrund ${event.surface}` : "",
    ].filter(Boolean).join(" · ");
    plan.push(item(weekStart, dayIndex, {
      time: event.time || "",
      title: event.name || "Event",
      type: "Wettkampf",
      distance: Number(event.targetKm || 0),
      duration: eventDurationMinutes(event),
      notes: [
        `Priorität ${event.priority} · ${eventGoalLabel(event)}.`,
        `Diese Einheit ersetzt die harte Schlüsseleinheit der Woche; der übrige Plan schützt deine Frische.`,
        event.role ? `Rolle im Aufbau: ${event.role}.` : "",
        profile,
      ].filter(Boolean).join(" "),
      optional: false,
      fixed: true,
      spontaneous: false,
      race: true,
      officialEvent: true,
      raceEvent: true,
      keySession: true,
      calendarOnly: true,
      targetEventId: event.id || null,
      goalPriority: event.priority,
      goalType: event.goalType,
      location: event.location || "",
      elevationGain: Number(event.elevationGain || 0),
      elevationLoss: Number(event.elevationLoss || 0),
      surface: event.surface || "",
      fuelMode: "race",
    }));
  });
}

function isHardEventWeekEntry(entry) {
  const text = `${entry?.type || ""} ${entry?.title || ""}`.toLowerCase();
  return entry?.commitmentLoad === "high"
    || /fußball|football|soccer|orc track|intervall|interval|schwelle|threshold|tempo|sprint|backyard|loop|long run|longrun/.test(text);
}

function isStrengthEntry(entry) {
  return /stabi|mobility|mobilität|kraft|strength|rudern|rowing/.test(`${entry?.type || ""} ${entry?.title || ""}`.toLowerCase());
}

function eventProtectedMobility(entry, eventName, afterEvent = false) {
  return {
    ...entry,
    title: afterEvent ? "Optionale Mobility zur Erholung" : "Kurze Mobility & Aktivierung",
    type: "Mobility",
    distance: 0,
    duration: Math.min(15, Number(entry.duration || 15)),
    optional: true,
    eventProtection: true,
    notes: afterEvent
      ? `Erholung nach ${eventName}: nur lockere Mobilität, kein Kraft- oder Ruderreiz.`
      : `Frische für ${eventName}: nur Mobilität und Aktivierung, keine ermüdende Kraftbelastung.`,
  };
}

function applyEventWeekProtection(plan, weekStart, eventWeek) {
  if (!eventWeek) return plan;
  const protectedPlan = plan.flatMap((entry) => {
    if (entry.raceEvent || entry.type === "Ruhetag") return [entry];
    const relation = eventRelation(entry.date, eventWeek);
    if (!relation) return [entry];
    const eventName = relation.event.name || "das Event";
    const running = isRunningPlanEntry(entry);
    const hard = isHardEventWeekEntry(entry);
    const strength = isStrengthEntry(entry);

    if (relation.days === 0) {
      if (strength) return [eventProtectedMobility(entry, eventName)];
      if (!entry.fixed && !entry.commitmentId) return [];
      return [{
        ...entry,
        title: `${entry.title} auslassen`,
        distance: 0,
        optional: true,
        eventProtection: true,
        notes: `${eventName} ist die Schlüsseleinheit des Tages. Dieser zusätzliche Fixtermin soll ausfallen.`,
      }];
    }

    if (relation.days === 1) {
      if (strength) return [eventProtectedMobility(entry, eventName)];
      if (!entry.fixed && !entry.commitmentId) return [];
      if (running && !hard) {
        const distance = Math.min(4, Math.max(3, Number(entry.distance || 4)));
        return [{
          ...entry,
          title: `${distance} km Shake-out optional`,
          type: "Easy Run",
          distance,
          duration: Math.round(distance * 6.8),
          optional: true,
          eventProtection: true,
          notes: `Nur wenn die Beine gut sind: sehr locker vor ${eventName}, keine Pace und keine Zusatzkilometer.`,
        }];
      }
      return [{
        ...entry,
        title: `${entry.title} auslassen`,
        distance: 0,
        optional: true,
        eventProtection: true,
        notes: `Ruhetag vor ${eventName}: keine zusätzliche Belastung.`,
      }];
    }

    if (relation.days > 1 && relation.days <= eventWeek.hardProtectionDays && hard) {
      if (running) {
        const distance = Math.min(5, Math.max(3, Number(entry.distance || 5)));
        return [{
          ...entry,
          title: `${entry.title} · nur locker`,
          type: "Easy Run",
          distance,
          duration: Math.round(distance * 6.6),
          optional: false,
          eventProtection: true,
          structuredWorkout: null,
          notes: `Frische für ${eventName}: keine Intervalle, keine Schwelle und kein Sprint. Nur locker mit höchstens vier kurzen Steigerungen.`,
        }];
      }
      return [{
        ...entry,
        title: `${entry.title} auslassen für ${eventName}`,
        distance: 0,
        optional: true,
        eventProtection: true,
        notes: `${eventWeek.protectionText}. Dieser intensive Termin ist deshalb nur als Auslass-Hinweis eingeplant.`,
      }];
    }

    if (relation.days > 0 && running && !hard) {
      const distance = Math.min(eventWeek.easyRunCapKm, Math.max(3, Number(entry.distance || 4)));
      return [{
        ...entry,
        title: entry.fixed || entry.commitmentId ? `${entry.title} · ${distance} km locker` : `${distance} km locker`,
        type: "Easy Run",
        distance,
        duration: Math.round(distance * 6.5),
        eventProtection: true,
        structuredWorkout: null,
        notes: `Locker im Frischerahmen für ${eventName}. Keine Zusatzkilometer und keine ungeplante Intensität.`,
      }];
    }

    if (relation.days < 0) {
      const daysAfter = Math.abs(relation.days);
      if (strength) return [eventProtectedMobility(entry, eventName, true)];
      if (daysAfter === 1 && !entry.fixed && !entry.commitmentId) return [];
      if (hard && !running) {
        return [{
          ...entry,
          title: `${entry.title} auslassen`,
          distance: 0,
          optional: true,
          eventProtection: true,
          notes: `Erholung nach ${eventName}: keine weitere intensive Belastung in dieser Eventwoche.`,
        }];
      }
      if (running) {
        const distance = Math.min(eventWeek.priority === "C" ? 5 : 4, Math.max(3, Number(entry.distance || 4)));
        return [{
          ...entry,
          title: `${distance} km Recovery optional`,
          type: "Easy Run",
          distance,
          duration: Math.round(distance * 7),
          optional: true,
          eventProtection: true,
          structuredWorkout: null,
          notes: `Nur zur lockeren Erholung nach ${eventName}. Bei schweren Beinen komplett auslassen.`,
        }];
      }
    }

    return [entry];
  });

  eventWeek.events.forEach((event) => {
    const eventIndex = weekDayIndex(weekStart, event.date);
    [
      { index: eventIndex - 1, title: `Ruhetag vor ${event.name}`, notes: `Bewusste Frische für das Event mit Priorität ${event.priority}.` },
      { index: eventIndex + 1, title: `Erholung nach ${event.name}`, notes: "Kein Nachholen ausgefallener Kilometer; Schlaf, Essen und lockere Bewegung haben Vorrang." },
    ].forEach((rest) => {
      if (rest.index < 0 || rest.index > 6) return;
      const date = isoDate(dateForDay(weekStart, rest.index));
      if (protectedPlan.some((entry) => entry.date === date)) return;
      protectedPlan.push(item(weekStart, rest.index, {
        title: rest.title,
        type: "Ruhetag",
        distance: 0,
        duration: 0,
        notes: rest.notes,
        optional: false,
        eventProtection: true,
      }));
    });
  });

  return protectedPlan;
}

function addStrengthSessions(plan, weekStart, config, readiness) {
  const trueDoubleDays = new Set(config.doubleTrainingDays || []);
  const strengthFactor = Number(readiness.strengthFactor || 1);
  const stabiDays = (Array.isArray(config.stabiDays) ? config.stabiDays : []).slice(0, Number(config.stabiCount ?? 0));
  const rowingDays = (Array.isArray(config.rowingDays) ? config.rowingDays : []).slice(0, Number(config.rowingCount ?? 0));
  const rowingDistanceKm = boundedNumber(config.rowingDistanceKm, 0.5, 50, 5);
  const rowingDuration = boundedNumber(config.rowingDuration, 5, 180, 35);
  const firstSpm = Math.round(boundedNumber(config.rowingSpmMin, 14, 40, 24));
  const secondSpm = Math.round(boundedNumber(config.rowingSpmMax, 14, 40, 26));
  const rowingSpmMin = Math.min(firstSpm, secondSpm);
  const rowingSpmMax = Math.max(firstSpm, secondSpm);

  function sessionsOnDay(day) {
    const dayIndex = DAY_INDEX[day];
    if (dayIndex === undefined) return [];
    const date = isoDate(dateForDay(weekStart, dayIndex));
    return plan.filter((entry) => entry.date === date && entry.type !== "Ruhetag");
  }

  stabiDays.forEach((day, index) => {
    if (DAY_INDEX[day] === undefined) return;
    const paired = sessionsOnDay(day).length > 0;
    plan.push(item(weekStart, DAY_INDEX[day], {
      time: paired ? "07:00" : "18:30",
      title: strengthFactor < 0.8 ? "Leichte Mobilität" : "Stabi & Mobilität",
      type: "Stabi",
      distance: 0,
      duration: Math.max(12, Math.round(Number(config.stabiDuration || 25) * strengthFactor)),
      notes: strengthFactor < 0.8 ? "Review-Anpassung: nur Mobilität, Aktivierung und saubere Bewegung." : "Fester Bestandteil: Rumpf, Rücken, Hüfte und Füße.",
      optional: strengthFactor < 0.65,
      comboSession: paired,
      doubleSession: false,
      sequence: index + 1,
    }));
  });

  rowingDays.forEach((day, index) => {
    if (DAY_INDEX[day] === undefined) return;
    const paired = sessionsOnDay(day).length > 0;
    const trueDouble = paired && trueDoubleDays.has(day) && !readiness.avoidDoubleStrength;
    if (paired && !trueDouble) {
      const fallback = ["Donnerstag", "Freitag", "Dienstag", "Sonntag", "Samstag"]
        .find((candidate) => DAY_INDEX[candidate] !== undefined && sessionsOnDay(candidate).length === 0);
      if (fallback) day = fallback;
    }
    const finalPaired = sessionsOnDay(day).length > 0;
    const finalDouble = finalPaired && trueDoubleDays.has(day) && !readiness.avoidDoubleStrength;
    const adjustedDistanceKm = Number((rowingDistanceKm * strengthFactor).toFixed(1));
    const adjustedMeters = Math.round(adjustedDistanceKm * 1000);
    const adjustedDuration = Math.max(15, Math.round(rowingDuration * strengthFactor));
    plan.push(item(weekStart, DAY_INDEX[day], {
      time: finalDouble ? "07:00" : "18:30",
      title: `${adjustedMeters.toLocaleString("de-DE")} m Rudern ${strengthFactor < 0.8 ? "sehr locker" : "locker"}`,
      type: "Rudern",
      distance: adjustedDistanceKm,
      duration: adjustedDuration,
      notes: strengthFactor < 0.8
        ? `Review-Anpassung: ${adjustedMeters.toLocaleString("de-DE")} m sehr locker, niedriger Widerstand, ${rowingSpmMin}–${rowingSpmMax} SPM und kein Druck auf Rücken oder Schultern.`
        : `${adjustedMeters.toLocaleString("de-DE")} m ruhige Grundlageneinheit in etwa ${adjustedDuration} min · gleichmäßig ${rowingSpmMin}–${rowingSpmMax} SPM · kein Pace-Druck.`,
      rowingTarget: {
        distanceMeters: adjustedMeters,
        durationMinutes: adjustedDuration,
        spmMin: rowingSpmMin,
        spmMax: rowingSpmMax,
        intensity: "easy",
      },
      optional: strengthFactor < 0.65,
      comboSession: false,
      doubleSession: finalDouble,
      sequence: index + 1,
    }));
  });
}

function applyExtraOrcTrack(plan, weekStart, dayName, config) {
  const dayIndex = DAY_INDEX[dayName];
  if (dayIndex === undefined) return;
  const date = isoDate(dateForDay(weekStart, dayIndex));
  const replaceableTypes = new Set(["Easy Run", "Schwellenlauf", "Intervalle", "Laufband", "Backyard Training", "Loop-Training", "Long Run"]);
  const candidates = plan
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.date === date && replaceableTypes.has(entry.type))
    .sort((left, right) => {
      const priority = (entry) => ["Easy Run", "Schwellenlauf", "Intervalle", "Laufband", "Backyard Training", "Loop-Training", "Long Run"].indexOf(entry.type);
      return priority(left.entry) - priority(right.entry);
    });
  const target = candidates[0];
  if (!target) return;

  const replaced = target.entry;
  plan[target.index] = {
    ...replaced,
    time: config.orcTrackTime || replaced.time || "19:00",
    title: "ORC Track",
    type: "ORC Track",
    fixed: true,
    spontaneous: false,
    fixedSlot: "extraOrcTrack",
    optional: false,
    choicePending: false,
    choiceOptions: null,
    selectedChoice: null,
    replacedWorkout: { title: replaced.title, type: replaced.type },
    notes: `Wochenanpassung: ${replaced.title} wurde durch ORC Track ersetzt. Umfang bleibt mit ${Number(replaced.distance || 0)} km im Wochenrahmen; Intensität kontrolliert halten.`,
  };
}


function commitmentWorkoutType(commitment) {
  if (commitment.workoutType) return commitment.workoutType;
  return {
    running: "Easy Run",
    football: "Fußball",
    cycling: "Radfahren",
    rowing: "Rudern",
    mobility: "Stabi",
    swimming: "Schwimmen",
    strength: "Stabi",
  }[commitment.sport] || "Sonstiges";
}

function isReplaceablePlanEntry(entry) {
  return entry.source === "planner-engine"
    && !entry.completed
    && !entry.fixed
    && !["Stabi", "Mobility", "Ruhetag"].includes(entry.type);
}

function applyRecurringCommitments(plan, weekStart, config, mode = "all") {
  const commitments = Array.isArray(config.recurringCommitments)
    ? config.recurringCommitments.filter((entry) => entry && entry.enabled !== false)
    : [];

  commitments.forEach((commitment) => {
    if (mode === "running" && commitment.sport !== "running") return;
    if (mode === "non-running" && commitment.sport === "running") return;
    const dayIndex = DAY_INDEX[commitment.weekday];
    if (dayIndex === undefined) return;
    const date = isoDate(dateForDay(weekStart, dayIndex));
    const type = commitmentWorkoutType(commitment);
    const sameDay = plan.map((entry, index) => ({ entry, index })).filter(({ entry }) => entry.date === date);
    const conflictMode = commitment.conflictMode
      || (commitment.replaceRunOnSameDay === true ? "replace" : commitment.allowCombination === false ? "exclusive" : "combine");
    const replaceable = conflictMode === "replace"
      ? sameDay.find(({ entry }) => isReplaceablePlanEntry(entry))
      : null;
    const distance = Number(commitment.distanceKm || replaceable?.entry?.distance || 0);
    const duration = Number(commitment.durationMinutes || replaceable?.entry?.duration || 60);
    const values = {
      time: commitment.time || replaceable?.entry?.time || "18:00",
      title: commitment.name || type,
      type,
      distance,
      duration,
      notes: `Konfigurierter Fixtermin (${commitment.weekday}). Belastung: ${commitment.load === "high" ? "hoch" : commitment.load === "low" ? "niedrig" : "mittel"}.`,
      optional: false,
      fixed: true,
      spontaneous: false,
      commitmentId: commitment.id,
      commitmentLoad: commitment.load || "medium",
      conflictMode,
      allowCombination: conflictMode !== "exclusive",
      replacedWorkout: replaceable ? { title: replaceable.entry.title, type: replaceable.entry.type } : null,
    };

    if (replaceable) {
      plan[replaceable.index] = { ...replaceable.entry, ...values };
      return;
    }

    if (conflictMode === "exclusive") {
      sameDay
        .filter(({ entry }) => !entry.completed && entry.source === "planner-engine")
        .map(({ index }) => index)
        .sort((left, right) => right - left)
        .forEach((index) => plan.splice(index, 1));
    }
    plan.push(item(weekStart, dayIndex, values));
  });
}

function addGoalSpecificWorkout(plan, weekStart, prescription, config, engine, longRunDay) {
  if (!prescription) return;
  const runningQuality = plan.filter((entry) => (
    /orc\s*track|intervall|schwelle|threshold|tempo/i.test(`${entry.type || ""} ${entry.title || ""}`)
    && isRunningPlanEntry(entry)
  ));
  const runLimit = Math.max(1, Math.min(7, Number(config.targetRunCount || 0) || 3));
  const existingRuns = plan.filter(isRunningPlanEntry).length;
  const canCarrySecondQuality = engine.mode === "time"
    && ["half_marathon", "marathon"].includes(engine.discipline)
    && engine.baseline.runDays >= 3.5
    && runLimit >= 5;

  if (runningQuality.length && !canCarrySecondQuality && prescription.goalSessionRole !== "run_walk_progression") {
    const existing = runningQuality[0];
    const index = plan.findIndex((entry) => entry.id === existing.id);
    if (index >= 0) {
      plan[index] = {
        ...existing,
        keySession: true,
        goalSessionRole: "existing_quality",
        goalTargetId: engine.target?.id || null,
        notes: `${existing.notes || ""} Zielbezug ${engine.disciplineLabel}: Diese Einheit übernimmt den Qualitätsreiz der Woche. ${engine.targetPaceLabel ? `Das Wettkampfziel entspricht ${engine.targetPaceLabel}; den Vereinsinhalt trotzdem nicht eigenmächtig verschärfen.` : ""}`.trim(),
      };
    }
    return;
  }

  const allowed = new Set(Array.isArray(config.runDays) ? config.runDays : []);
  (config.recurringCommitments || [])
    .filter((entry) => entry?.enabled !== false && entry.sport === "running")
    .forEach((entry) => allowed.add(entry.weekday));
  const doubleDays = new Set(config.doubleTrainingDays || []);
  const preferred = ["Dienstag", "Donnerstag", "Freitag", "Mittwoch", "Samstag", "Montag", "Sonntag"];
  const longIndex = DAY_INDEX[longRunDay];
  const candidates = preferred
    .filter((day) => allowed.has(day) && DAY_INDEX[day] !== longIndex)
    .map((day) => {
      const date = isoDate(dateForDay(weekStart, DAY_INDEX[day]));
      const entries = plan.filter((entry) => entry.date === date && !["Stabi", "Mobility", "Ruhetag"].includes(entry.type));
      const occupied = entries.length > 0;
      const distanceFromLongRun = longIndex == null ? 3 : Math.abs(DAY_INDEX[day] - longIndex);
      const adjacentPenalty = prescription.goalSessionRole === "run_walk_progression" ? 0 : distanceFromLongRun <= 1 ? 20 : 0;
      const loadPenalty = entries.some((entry) => entry.commitmentLoad === "high" || /fußball|track|intervall|schwelle/.test(`${entry.type} ${entry.title}`.toLowerCase())) ? 40 : 0;
      return {
        day,
        occupied,
        score: adjacentPenalty + loadPenalty + (occupied && !doubleDays.has(day) ? 100 : 0),
      };
    })
    .sort((left, right) => left.score - right.score);
  const selected = candidates.find((candidate) => candidate.score < 100);
  if (!selected) return;

  if (existingRuns >= runLimit) {
    const replaceableIndex = plan.findIndex((entry) => (
      entry.type === "Easy Run"
      && !entry.fixed
      && !entry.commitmentId
      && !entry.keySession
    ));
    if (replaceableIndex < 0) return;
    plan.splice(replaceableIndex, 1);
  }

  const paired = selected.occupied;
  plan.push(item(weekStart, DAY_INDEX[selected.day], {
    time: paired ? "07:00" : "18:00",
    ...prescription,
    optional: false,
    fixed: false,
    spontaneous: true,
    doubleSession: paired,
    comboSession: false,
    goalTargetId: engine.target?.id || null,
    goalDiscipline: engine.discipline,
    targetPaceLabel: engine.targetPaceLabel,
  }));
}

function applyBeginnerFiveKRunWalk(plan, engine) {
  if (!isBeginnerFiveKGoal(engine)) return plan;
  return plan.map((entry) => {
    if (
      entry.fixed
      || entry.raceEvent
      || entry.goalSessionRole === "run_walk_progression"
      || !["Easy Run", "Long Run", "Laufband"].includes(entry.type)
    ) return entry;
    const distance = Number(entry.distance || 0);
    return {
      ...entry,
      type: "Easy Run",
      title: `${distance} km Run-Walk locker`,
      duration: Math.max(Number(entry.duration || 0), Math.round(distance * 9)),
      goalSessionRole: entry.type === "Long Run" ? "run_walk_long" : "run_walk_easy",
      goalTargetId: engine.target?.id || null,
      goalDiscipline: engine.discipline,
      notes: `${entry.notes || ""} Gehpause früh und geplant nutzen; Ziel ist sichere Regelmäßigkeit, nicht Tempo oder Durchbeißen.`.trim(),
    };
  });
}

function distributeEasyKilometers(plan, weekStart, target, fixedKm, config, phase, readiness, cycle, eventWeek = null) {
  const allowed = new Set(Array.isArray(config.runDays) ? config.runDays : []);
  const trueDoubleDays = new Set(config.doubleTrainingDays || []);
  const existingQuality = plan.some((entry) => /orc\s*track|intervall|schwelle|threshold|tempo/i.test(`${entry.type || ""} ${entry.title || ""}`));

  function hasEnduranceSession(day) {
    const date = isoDate(dateForDay(weekStart, DAY_INDEX[day]));
    return plan.some((entry) => entry.date === date && !["Stabi", "Ruhetag"].includes(entry.type));
  }

  const candidates = [
    "Dienstag",
    "Donnerstag",
    "Freitag",
    "Mittwoch",
    "Samstag",
    "Sonntag",
    "Montag",
  ].filter((day) => {
    if (!allowed.has(day) || (hasEnduranceSession(day) && !trueDoubleDays.has(day))) return false;
    if (!eventWeek) return true;
    const date = isoDate(dateForDay(weekStart, DAY_INDEX[day]));
    const relation = eventRelation(date, eventWeek);
    return !relation || ![0, 1].includes(relation.days);
  });

  const remaining = Math.max(0, target - fixedKm);
  const defaultDesiredSessions = target >= 75 ? 3 : remaining > 12 ? 2 : 1;
  const existingRunSessions = plan.filter((entry) => /run|lauf|track|intervall|schwelle|tempo|backyard/i.test(`${entry.type || ""} ${entry.title || ""}`)).length;
  const acceptedTargetRunCount = Math.max(0, Math.min(7, Number(config.targetRunCount || 0)));
  const progressionSessions = acceptedTargetRunCount > 0 ? Math.max(0, acceptedTargetRunCount - existingRunSessions) : 0;
  const desiredSessions = acceptedTargetRunCount > 0 ? progressionSessions : defaultDesiredSessions;
  const maxSessionsByKilometers = remaining >= 4 ? Math.floor(remaining / 4) : remaining >= 3 ? 1 : 0;
  const sessionCount = Math.min(
    desiredSessions,
    candidates.length,
    maxSessionsByKilometers,
    eventWeek?.maxGeneratedRuns ?? Number.POSITIVE_INFINITY,
  );
  if (!sessionCount || remaining < 3) return;

  const weights = sessionCount === 1
    ? [1]
    : sessionCount === 2
      ? [0.55, 0.45]
      : sessionCount === 3
        ? [0.4, 0.34, 0.26]
        : (() => {
            const raw = Array.from({ length: sessionCount }, (_value, index) => Math.max(0.45, 1 - index * 0.1));
            const totalWeight = raw.reduce((sum, value) => sum + value, 0);
            return raw.map((value) => value / totalWeight);
          })();
  candidates.slice(0, sessionCount).forEach((day, index) => {
    const date = isoDate(dateForDay(weekStart, DAY_INDEX[day]));
    const relation = eventRelation(date, eventWeek);
    const afterEvent = Boolean(relation && relation.days < 0);
    const rawDistance = Math.max(eventWeek ? 3 : 4, Math.round(remaining * weights[index]));
    const distance = eventWeek ? Math.min(eventWeek.easyRunCapKm, rawDistance) : rawDistance;
    const paired = hasEnduranceSession(day);
    const quality = !existingQuality && !eventWeek && day === "Freitag" && !paired && readiness.hardAllowed && ["build", "specific"].includes(phase.key) && cycle >= 2 && target >= 45;
    plan.push(item(weekStart, DAY_INDEX[day], {
      time: paired ? "07:00" : "18:00",
      title: quality ? `${distance} km mit Schwellenblock` : afterEvent ? `${distance} km Recovery optional` : `${distance} km locker`,
      type: quality ? "Schwellenlauf" : "Easy Run",
      distance,
      duration: Math.round(distance * (afterEvent ? 7 : 6.4)),
      notes: quality
        ? "Nur kontrolliert: Einlaufen, kurzer Schwellenblock und auslaufen."
        : afterEvent
          ? `Nur zur lockeren Erholung nach ${relation.event.name}. Bei schweren Beinen komplett auslassen.`
        : paired
          ? "Echter Doppeltrainingstag: sehr locker laufen und ausreichend Abstand zur zweiten Einheit lassen."
          : eventWeek
            ? `Locker im Frischerahmen für ${eventWeek.primary.name}. Keine Zusatzkilometer und keine ungeplante Intensität.`
            : "Locker laufen, keine Pace erzwingen.",
      optional: afterEvent || (index === sessionCount - 1 && target >= 55),
      doubleSession: paired,
      comboSession: false,
      eventProtection: Boolean(eventWeek),
    }));
  });
}

export function generateWeekPlan({
  activities = [],
  planHistory = [],
  mission,
  profile = {},
  config = {},
  forecast = [],
  offsetWeeks = 0,
  completedRunningKm = 0,
  reviews = {},
  today = new Date(),
}) {
  const weekStart = startOfWeek(today, offsetWeeks);
  const nextWeekStart = startOfWeek(today, 1);
  const historyCutoff = weekStart > nextWeekStart ? nextWeekStart : weekStart;
  const history = runningWeeks(activities, historyCutoff, 8);
  const recentAverage = weightedAverage(history.map((week) => week.km));
  const recentPeak = Math.max(...history.slice(0, 4).map((week) => week.km), recentAverage, 0);
  const lastWeek = history[0]?.km || recentAverage;
  const reportedWeeklyKmAvailable = profile.selfReportedWeeklyKm !== "" && profile.selfReportedWeeklyKm !== null && profile.selfReportedWeeklyKm !== undefined;
  const reportedWeeklyKm = boundedNumber(profile.selfReportedWeeklyKm, 0, 300, 0);
  const reportedLongestRun = boundedNumber(profile.selfReportedLongestRunKm, 0, 250, 0);
  const longestRecent = recentLongestRun(activities, historyCutoff) || reportedLongestRun;
  const goalEngine = buildGoalEngine({
    mission,
    activities,
    profile,
    planner: config,
    referenceDate: weekStart,
  });
  const goal = goalEngine.target || {};
  const daysLeft = goalEngine.daysLeft;
  const eventWeek = buildEventWeek(mission, weekStart);
  const strategicPhase = goalEngine.phase;
  const phase = eventWeek
    ? { key: "event", label: eventWeek.phaseLabel, factor: 1, longShare: 0 }
    : strategicPhase;
  const cycle = cycleWeek(mission, weekStart);
  const scheduledRecoveryWeek = cycle === 4;
  const missedSignals = recentMissedSignals(planHistory, historyCutoff);
  const checkinReadiness = readinessDecision(config, missedSignals);
  const reviewReference = weekStart > today ? weekStart : new Date(today.getTime() + DAY_MS);
  const reviewReadiness = reviewGuidance(activities, reviews, reviewReference);
  const readiness = combineReadiness(checkinReadiness, reviewReadiness);
  const earlyRecoveryWeek = readiness.factor < 0.86 || !readiness.longRunAllowed || ["unchanged", "worse"].includes(config.checkin?.pain) || ["recovering", "symptoms"].includes(config.checkin?.illness);
  const recoveryWeek = scheduledRecoveryWeek || earlyRecoveryWeek;
  const recoveryReason = eventWeek
    ? `${eventWeek.protectionText}. Das Event ersetzt Longrun und harte Qualität; danach ist Erholung eingeplant.`
    : scheduledRecoveryWeek
      ? "Geplante Entlastung nach dem 3:1-Grundrhythmus."
      : earlyRecoveryWeek
        ? "Entlastung wurde wegen Befinden, Reviews oder ausgefallener Einheiten vorgezogen."
        : "Belastungswoche innerhalb des adaptiven Aufbauzyklus.";
  const hasRecurringCommitments = Array.isArray(config.recurringCommitments) && config.recurringCommitments.length > 0;
  const fixedAppointments = {
    football: hasRecurringCommitments ? false : config.fixedAppointments?.football !== false,
    orcRun: hasRecurringCommitments ? false : config.fixedAppointments?.orcRun !== false,
    saturdayMode: hasRecurringCommitments ? "off" : config.fixedAppointments?.saturdayMode || "open",
    extraOrcTrackDay: hasRecurringCommitments ? "" : config.fixedAppointments?.extraOrcTrackDay || "",
  };

  const startingRunCount = Math.max(1, Math.min(7, Number(config.targetRunCount || profile.selfReportedRunsPerWeek || 2)));
  const starterFallback = Math.max(6, Math.min(28, startingRunCount * 4));
  const goalFallback = Math.max(25, Math.min(45, Number(goal?.targetKm || mission?.targetKm || 50) * 0.4));
  const base = recentAverage || (reportedWeeklyKmAvailable ? (reportedWeeklyKm || starterFallback) : goalFallback);
  const cycleFactor = recoveryWeek ? (scheduledRecoveryWeek ? 0.75 : 0.82) : [1, 1.04, 1.08][cycle - 1] || 1;
  const protectedEventTarget = eventWeekTarget(base, readiness, eventWeek);
  let target = protectedEventTarget ?? (base * cycleFactor * phase.factor * readiness.factor);

  if (!eventWeek && !recoveryWeek && phase.key !== "taper" && lastWeek > 0) target = Math.min(target, lastWeek * 1.1);
  if (!eventWeek && recentPeak > 0 && !recoveryWeek && phase.key !== "taper") target = Math.min(target, recentPeak * 1.1);
  const minimumTarget = recentAverage || reportedWeeklyKmAvailable
    ? Math.max(6, Math.min(22, Math.round(base * (readiness.longRunAllowed ? 0.8 : 0.65))))
    : readiness.longRunAllowed ? 22 : 12;
  target = eventWeek
    ? Math.max(Math.round(eventWeek.totalDistanceKm), Math.round(target))
    : Math.max(minimumTarget, Math.round(target));

  const allowedRuns = new Set(Array.isArray(config.runDays) ? config.runDays : []);
  (config.recurringCommitments || [])
    .filter((entry) => entry?.enabled !== false && entry.sport === "running" && DAY_INDEX[entry.weekday] !== undefined)
    .forEach((entry) => allowedRuns.add(entry.weekday));
  const wednesdayKm = fixedAppointments.orcRun
    ? Math.min(eventWeek?.easyRunCapKm || 10, Math.max(eventWeek ? 4 : 6, Math.round(target * 0.18)))
    : 0;
  const saturdayKm = !eventWeek && fixedAppointments.saturdayMode !== "off" && phase.key !== "taper" && readiness.longRunAllowed
    ? Math.min(10, Math.max(recoveryWeek ? 5 : 6, Math.round(target * 0.13)))
    : 0;
  const goalLongRun = goalLongRunBounds(goalEngine, target);
  const desiredLong = eventWeek ? 0 : Math.round(target * goalLongRun.share * (recoveryWeek ? 0.82 : 1));
  const starterBaseline = !recentAverage && reportedWeeklyKmAvailable && reportedWeeklyKm < 20;
  const progressionCap = longestRecent > 0
    ? Math.max(4, Math.round(longestRecent * 1.15))
    : starterBaseline
      ? Math.max(4, Math.round(base * 0.45))
      : desiredLong;
  const longRun = !eventWeek && readiness.longRunAllowed
    ? Math.max(4, Math.min(
      Math.max(goalLongRun.minimum, desiredLong),
      progressionCap,
      goalLongRun.maximum,
      Number(config.maxLongRun || 38),
    ))
    : 0;
  const loopPrescription = loopTrainingPrescription(goal, daysLeft, longRun, cycle, recoveryWeek);

  const fridayWeather = weatherDecision(weatherForDate(forecast, dateForDay(weekStart, 4)), config);
  let plan = [];

  if (fixedAppointments.football) {
    plan.push(item(weekStart, 0, {
      time: config.footballTime || "19:00",
      title: "Fußball",
      type: "Fußball",
      distance: 0,
      notes: "Bestätigter Fixtermin. Wird als intensive Belastung berücksichtigt, aber nicht als Laufkilometer.",
      optional: false,
      fixed: true,
      fixedSlot: "football",
      baseDistance: 0,
    }));
  }

  if (wednesdayKm > 0) {
    plan.push(item(weekStart, 2, {
      time: config.orcTime || "19:00",
      title: "ORC Run",
      type: "ORC Run",
      distance: wednesdayKm,
      notes: fixedAppointments.football ? "Bestätigter Gruppenlauf. Intensität nach dem Fußball kontrolliert halten." : "Bestätigter Gruppenlauf. Locker und gruppengerecht laufen.",
      optional: false,
      fixed: true,
      fixedSlot: "orcRun",
      baseDistance: wednesdayKm,
    }));
  }

  if (saturdayKm > 0) {
    if (fixedAppointments.saturdayMode === "orc") {
      plan.push(item(weekStart, 5, {
        time: config.orcTrackTime || "09:00",
        title: "ORC Track",
        type: "ORC Track",
        distance: saturdayKm,
        notes: phase.key === "specific" ? "Bestätigter ORC Track als Vorbelastung vor dem Longrun." : "Bestätigter ORC Track. Intensität kontrolliert halten.",
        optional: false,
        fixed: true,
        saturdaySlot: true,
        fixedSlot: "saturday",
        saturdayMode: "orc",
        baseDistance: saturdayKm,
      }));
    } else if (fixedAppointments.saturdayMode === "alternative") {
      plan.push(item(weekStart, 5, {
        time: "09:00",
        title: `${saturdayKm} km locker`,
        type: "Easy Run",
        distance: saturdayKm,
        notes: "ORC Track findet für dich nicht statt. Stattdessen lockerer Alternativlauf.",
        optional: false,
        saturdaySlot: true,
        fixedSlot: "saturday",
        saturdayMode: "alternative",
        baseDistance: saturdayKm,
      }));
    } else {
      plan.push(item(weekStart, 5, {
        time: config.orcTrackTime || "09:00",
        title: `ORC Track oder ${saturdayKm} km locker`,
        type: "Samstagsoption",
        distance: saturdayKm,
        notes: "Entscheidung meist am Freitag: ORC Track wählen oder denselben Umfang locker als Alternativlauf absolvieren.",
        optional: false,
        saturdaySlot: true,
        fixedSlot: "saturday",
        saturdayMode: "open",
        baseDistance: saturdayKm,
        choicePending: true,
        choiceOptions: {
          orc: { title: "ORC Track", type: "ORC Track", fixed: true },
          alternative: { title: `${saturdayKm} km locker`, type: "Easy Run", fixed: false },
        },
      }));
    }
  }

  applyRecurringCommitments(plan, weekStart, config, "running");
  addMissionEvents(plan, weekStart, eventWeek);

  const trueDoubleDays = new Set(config.doubleTrainingDays || []);
  const longRunDay = ["Sonntag", "Samstag", "Freitag", "Donnerstag", "Mittwoch", "Dienstag", "Montag"]
    .find((day) => {
      if (!allowedRuns.has(day)) return false;
      const date = isoDate(dateForDay(weekStart, DAY_INDEX[day]));
      const occupied = plan.some((entry) => entry.date === date && !["Stabi", "Mobility", "Ruhetag"].includes(entry.type));
      return !occupied || trueDoubleDays.has(day);
    });

  const goalWorkout = goalSpecificSession(goalEngine, {
    cycle,
    recoveryWeek,
    eventWeek,
    hardAllowed: readiness.hardAllowed,
    weeklyTarget: target,
    targetRunCount: startingRunCount,
  });
  addGoalSpecificWorkout(plan, weekStart, goalWorkout, config, goalEngine, longRunDay);

  if (longRun > 0 && longRunDay) {
    const longRunDayIndex = DAY_INDEX[longRunDay];
    const longRunWeather = weatherDecision(weatherForDate(forecast, dateForDay(weekStart, longRunDayIndex)), config);
    const plannedLongDistance = loopPrescription?.distance || longRun;
    const longRunGuidance = longRunGoalGuidance(goalEngine, plannedLongDistance, cycle);
    plan.push(item(weekStart, longRunDayIndex, {
      time: longRunWeather?.tooHot ? "07:00" : "09:00",
      title: loopPrescription?.title || `${longRun} km Longrun`,
      type: longRunWeather?.indoor ? "Laufband" : loopPrescription ? "Loop-Training" : "Long Run",
      distance: plannedLongDistance,
      duration: longRunGuidance.duration,
      notes: longRunWeather?.indoor
        ? `Wetteranpassung: ${longRunWeather.tooHot ? "früh starten oder Laufband" : "bei Sturm/Gewitter nach innen wechseln"}. ${longRunGuidance.notes}`
        : `${loopPrescription?.notes || ""} ${longRunGuidance.notes}`.trim(),
      optional: false,
      weatherAdjusted: Boolean(longRunWeather?.indoor),
      loopTraining: loopPrescription || null,
      targetEventId: goal?.id || null,
      goalTargetId: goal?.id || null,
      goalDiscipline: goalEngine.discipline,
      goalSessionRole: loopPrescription ? "course_specific_long_run" : "long_run",
      keySession: true,
    }));
  }

  const fixedKm = plan.reduce((sum, entry) => sum + Number(entry.distance || 0), 0);
  distributeEasyKilometers(plan, weekStart, target, fixedKm, config, phase, readiness, cycle, eventWeek);
  plan = applyGoalWeekendSpecificity(plan, goalEngine, { cycle, recoveryWeek });
  plan = applyBeginnerFiveKRunWalk(plan, goalEngine);
  applyExtraOrcTrack(plan, weekStart, fixedAppointments.extraOrcTrackDay, config);
  applyRecurringCommitments(plan, weekStart, config, "non-running");
  addStrengthSessions(plan, weekStart, config, readiness);
  plan = applyEventWeekProtection(plan, weekStart, eventWeek);

  if (!readiness.hardAllowed) {
    const painLevel = Number(config.checkin?.painLevel || 0);
    plan = plan
      .filter((entry) => !(painLevel >= 4 && ["Fußball", "ORC Track"].includes(entry.type)))
      .map((entry) => {
        if (["Schwellenlauf", "Intervalle"].includes(entry.type)) {
          return { ...entry, type: "Easy Run", title: `${entry.distance} km locker`, notes: "Qualität wegen Check-in ausgesetzt. Nur locker laufen." };
        }
        if (entry.type === "Fußball") {
          return { ...entry, optional: true, title: "Fußball nur bei guten Beinen", notes: "Check-in zeigt eingeschränkte Bereitschaft. Nur teilnehmen, wenn du dich beim Aufwärmen normal und beschwerdefrei fühlst." };
        }
        if (entry.type === "ORC Track") {
          return { ...entry, optional: true, title: "ORC Track sehr locker oder auslassen", notes: "Keine harte Bahn-/Tempoeinheit in dieser Woche." };
        }
        if (entry.type === "Samstagsoption") {
          return { ...entry, type: "Easy Run", title: `${entry.distance} km locker`, choicePending: false, choiceOptions: null, notes: "Coach-Anpassung: kein ORC Track, nur lockerer Alternativlauf." };
        }
        return entry;
      });
  }

  if (config.checkin?.illness === "recovering") {
    plan = plan
      .filter((entry) => !["Fußball", "ORC Track", "Samstagsoption", "Backyard Training", "Loop-Training", "Long Run"].includes(entry.type))
      .map((entry) => {
        if (["ORC Run", "Easy Run", "Laufband", "Schwellenlauf"].includes(entry.type)) {
          const distance = Math.min(6, Math.max(3, Number(entry.distance || 4)));
          return {
            ...entry,
            type: "Easy Run",
            title: `${distance} km Wiedereinstieg`,
            distance,
            optional: true,
            fixed: false,
            spontaneous: true,
            time: "",
            fixedSlot: null,
            notes: "Nur locker und nur, wenn du dich im Alltag wieder normal fühlst. Bei Verschlechterung abbrechen.",
          };
        }
        if (entry.type === "Rudern") {
          const distance = Math.min(3.5, Number(entry.distance || 3.5));
          const distanceMeters = Math.round(distance * 1000);
          return {
            ...entry,
            title: `${distanceMeters.toLocaleString("de-DE")} m Rudern sehr locker`,
            distance,
            duration: Math.min(25, entry.duration || 25),
            optional: true,
            rowingTarget: {
              ...(entry.rowingTarget || {}),
              distanceMeters,
              durationMinutes: Math.min(25, entry.duration || 25),
              intensity: "recovery",
            },
            notes: "Sehr locker als Wiedereinstieg; niedriger Widerstand und kein Druck.",
          };
        }
        if (entry.type === "Stabi") return { ...entry, title: "Leichte Mobilität", duration: Math.min(20, entry.duration || 20), optional: true, notes: "Nur Mobilität und Aktivierung, kein anstrengendes Krafttraining." };
        return entry;
      });
  }

  if (config.checkin?.illness === "symptoms") {
    plan = plan.filter((entry) => entry.type === "Stabi").map((entry) => ({
      ...entry,
      title: "Optionale leichte Mobilität",
      duration: Math.min(15, entry.duration || 15),
      optional: true,
      notes: "Nur wenn du dich dabei gut fühlst. Kein Training gegen Krankheitssymptome erzwingen.",
    }));
    plan.push(item(weekStart, 1, {
      time: "18:00",
      title: "Erholen & neu bewerten",
      type: "Ruhetag",
      distance: 0,
      duration: 0,
      notes: "Bei Fieber, Brustschmerz, Atemnot oder deutlicher Verschlechterung nicht trainieren und medizinisch abklären.",
      optional: false,
    }));
  }

  const todayKey = isoDate(today);
  if (offsetWeeks === 0) {
    plan = plan.filter((entry) => entry.date >= todayKey);
    const remainingTarget = Math.max(0, target - Number(completedRunningKm || 0));
    const runEntries = plan.filter((entry) => Number(entry.distance || 0) > 0 && isRunningPlanEntry(entry));
    const protectedRaceKm = runEntries
      .filter((entry) => entry.raceEvent)
      .reduce((sum, entry) => sum + Number(entry.distance || 0), 0);
    const adjustableRunEntries = runEntries.filter((entry) => !entry.raceEvent);
    const generatedRunKm = adjustableRunEntries.reduce((sum, entry) => sum + Number(entry.distance || 0), 0);
    const adjustableTarget = Math.max(0, remainingTarget - protectedRaceKm);
    if (generatedRunKm > 0 && adjustableTarget < generatedRunKm) {
      const factor = adjustableTarget / generatedRunKm;
      plan = plan.map((entry) => {
        if (!adjustableRunEntries.some((runEntry) => runEntry.id === entry.id)) return entry;
        const adjusted = Math.max(entry.optional ? 0 : 3, Math.round(Number(entry.distance || 0) * factor));
        return {
          ...entry,
          distance: adjusted,
          title: entry.title.replace(/^\d+(?:[.,]\d+)?\s*km/, `${adjusted} km`),
          notes: `${entry.notes} Bereits absolvierte Laufkilometer dieser Woche wurden berücksichtigt.`,
        };
      }).filter((entry) => Number(entry.distance || 0) > 0 || ["Fußball", "Stabi", "Mobility", "Rudern", "Ruhetag", "Wettkampf"].includes(entry.type));
    }
  }

  plan = plan.map((entry) => {
    const weatherForecast = forecast.find((day) => day.date === entry.date);
    return weatherForecast ? {
      ...entry,
      weatherForecast: {
        date: weatherForecast.date,
        weatherCode: weatherForecast.weatherCode,
        maxTemp: weatherForecast.maxTemp,
        minTemp: weatherForecast.minTemp,
        maxGust: weatherForecast.maxGust,
        rainChance: weatherForecast.rainChance,
      },
    } : entry;
  });
  plan = suggestRoadCyclingAlternative(plan, config, { eventWeek, readiness });
  plan.sort((a, b) => `${a.date}${a.time || ""}`.localeCompare(`${b.date}${b.time || ""}`));
  if (eventWeek) {
    const plannedRunningKm = plan
      .filter((entry) => !entry.plannedCancellation && isRunningPlanEntry(entry))
      .reduce((sum, entry) => sum + Number(entry.distance || 0), 0);
    if (plannedRunningKm > 0) target = Math.round(plannedRunningKm);
  }

  return {
    plan,
    target,
    remainingTarget: Math.max(0, target - Number(completedRunningKm || 0)),
    recentAverage: Math.round(recentAverage),
    weekStart: isoDate(weekStart),
    phase,
    cycleWeek: cycle,
    recoveryWeek,
    scheduledRecoveryWeek,
    earlyRecoveryWeek,
    recoveryReason,
    readiness,
    daysLeft,
    planningTarget: goalEngine.target ? {
      id: goal.id,
      name: goal.name,
      date: goal.date,
      time: goal.time || "",
      targetKm: goal.targetKm,
      targetMinKm: goal.targetMinKm,
      targetMaxKm: goal.targetMaxKm,
      goalKind: goal.goalKind,
      courseType: goal.courseType,
      loopKm: goal.loopKm,
      aidStationMode: goal.aidStationMode,
      priority: goal.priority || (goal.isMainTarget ? "A" : "B"),
      goalType: goal.goalType || "finish",
      targetTime: goal.targetTime || "",
      goalDiscipline: goalEngine.discipline,
      disciplineLabel: goalEngine.disciplineLabel,
      targetPaceLabel: goalEngine.targetPaceLabel,
      feasibility: goalEngine.feasibility,
    } : null,
    goalProfile: publicGoalSummary(goalEngine),
    eventWeek: eventWeek ? {
      weekStart: eventWeek.weekStart,
      priority: eventWeek.priority,
      label: eventWeek.label,
      phaseLabel: eventWeek.phaseLabel,
      hardProtectionDays: eventWeek.hardProtectionDays,
      protectionText: eventWeek.protectionText,
      events: eventWeek.events.map((event) => ({
        id: event.id,
        name: event.name,
        date: event.date,
        time: event.time || "",
        targetKm: event.targetKm,
        priority: event.priority,
        goalType: event.goalType,
      })),
    } : null,
    loopStrategy: loopPrescription,
    history: history.map((week) => ({ start: isoDate(week.start), km: Math.round(week.km * 10) / 10 })),
    weatherNote: fridayWeather?.indoor ? "Freitag wetterbedingt angepasst." : "",
  };
}

export async function fetchWeeklyForecast(latitude, longitude, weekStart) {
  const start = isoDate(weekStart);
  const endDate = new Date(weekStart);
  endDate.setDate(endDate.getDate() + 6);
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    daily: "weather_code,temperature_2m_max,temperature_2m_min,wind_gusts_10m_max,precipitation_probability_max",
    timezone: "auto",
    start_date: start,
    end_date: isoDate(endDate),
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!response.ok) throw new Error("Wochenwetter konnte nicht geladen werden.");
  const data = await response.json();
  return (data.daily?.time || []).map((date, index) => ({
    date,
    weatherCode: data.daily.weather_code[index],
    maxTemp: Math.round(data.daily.temperature_2m_max[index]),
    minTemp: Math.round(data.daily.temperature_2m_min[index]),
    maxGust: Math.round(data.daily.wind_gusts_10m_max[index]),
    rainChance: Math.round(data.daily.precipitation_probability_max[index] || 0),
  }));
}
