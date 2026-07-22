import { reviewKind } from "./activityUtils.js";

const DAY_NAMES = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const DAY_INDEX = { Montag: 0, Dienstag: 1, Mittwoch: 2, Donnerstag: 3, Freitag: 4, Samstag: 5, Sonntag: 6 };
const DAY_MS = 86400000;

export const workoutTypes = [
  "Easy Run",
  "Long Run",
  "Schwellenlauf",
  "Intervalle",
  "Backyard Training",
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

function recentLongestRun(activities, weekStart) {
  const start = new Date(weekStart);
  start.setDate(start.getDate() - 56);
  return activities.reduce((max, activity) => {
    const date = new Date(`${activityDate(activity)}T12:00:00`);
    if (!isRun(activity) || date < start || date >= weekStart) return max;
    return Math.max(max, Number(activity.distance || 0));
  }, 0);
}

function daysToMission(mission, weekStart) {
  if (!mission?.date) return 999;
  return Math.ceil((new Date(`${mission.date}T12:00:00`) - weekStart) / DAY_MS);
}

function planningTarget(mission, weekStart) {
  const milestones = Array.isArray(mission?.milestones) ? mission.milestones : [];
  const candidates = milestones
    .filter((entry) => entry?.date && !entry.archived && new Date(`${entry.date}T12:00:00`) >= weekStart)
    .sort((left, right) => String(left.date).localeCompare(String(right.date)));
  const selected = candidates[0] || (mission?.date ? mission : null);
  if (!selected) return mission || {};
  const text = String(selected.name || "").toLowerCase();
  if (text.includes("backyard")) {
    return {
      ...selected,
      targetKm: Number(selected.targetKm || ((Number(selected.targetMinKm || 60) + Number(selected.targetMaxKm || 80)) / 2)),
      targetMinKm: Number(selected.targetMinKm || 60),
      targetMaxKm: Number(selected.targetMaxKm || 80),
      loopKm: 6.7,
      goalKind: "backyard",
    };
  }
  if (/heartbeat|fulda/.test(text)) return { ...selected, loopKm: 6, goalKind: "heartbeat" };
  return { ...selected, goalKind: "race" };
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
  return {
    loops,
    loopKm,
    distance,
    title: goal.goalKind === "backyard"
      ? `${loops} × 6,7 km Backyard-Loops`
      : `${loops} × 6 km Fulda-Loops`,
    notes: goal.goalKind === "backyard"
      ? "Spezifischer Loop-Block: jede Runde kontrolliert, Pausen-, Geh- und Fuel-Routine testen. Keine komplette 60–80-km-Generalprobe im Training erzwingen."
      : "Fulda-spezifischer Loop-Block: gleichmäßige Pace, kurze Stopps und vollständigen Fuel-/Materialablauf testen.",
  };
}

function trainingPhase(daysLeft) {
  if (daysLeft <= 14) return { key: "taper", label: "Taper", factor: 0.62, longShare: 0.24 };
  if (daysLeft <= 35) return { key: "peak", label: "Peak & Absicherung", factor: 0.94, longShare: 0.31 };
  if (daysLeft <= 84) return { key: "specific", label: "Ultra-spezifisch", factor: 1.03, longShare: 0.36 };
  if (daysLeft <= 140) return { key: "build", label: "Aufbau", factor: 1.02, longShare: 0.33 };
  return { key: "base", label: "Grundlage", factor: 1, longShare: 0.3 };
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
  const highHr = endurance.filter((activity) => {
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

function item(weekStart, dayIndex, values) {
  const date = dateForDay(weekStart, dayIndex);
  return {
    id: crypto.randomUUID(),
    date: isoDate(date),
    day: DAY_NAMES[date.getDay()],
    duration: 60,
    completed: false,
    source: "planner-engine",
    archived: false,
    ...values,
  };
}

function addStrengthSessions(plan, weekStart, config, readiness) {
  const trueDoubleDays = new Set(config.doubleTrainingDays || []);
  const strengthFactor = Number(readiness.strengthFactor || 1);
  const stabiDays = (config.stabiDays?.length ? config.stabiDays : ["Dienstag", "Donnerstag"]).slice(0, Number(config.stabiCount ?? 2));
  const rowingDays = (config.rowingDays?.length ? config.rowingDays : ["Freitag"]).slice(0, Number(config.rowingCount ?? 1));

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
    plan.push(item(weekStart, DAY_INDEX[day], {
      time: finalDouble ? "07:00" : "18:30",
      title: strengthFactor < 0.8 ? "Rudern sehr locker" : "Rudern locker",
      type: "Rudern",
      distance: 0,
      duration: Math.max(15, Math.round(Number(config.rowingDuration || 40) * strengthFactor)),
      notes: strengthFactor < 0.8 ? "Review-Anpassung: niedriger Widerstand, kein Druck auf Rücken und Schultern." : "Ruhige Grundlageneinheit ohne zusätzliche Stoßbelastung.",
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
  const replaceableTypes = new Set(["Easy Run", "Schwellenlauf", "Intervalle", "Laufband", "Backyard Training", "Long Run"]);
  const candidates = plan
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.date === date && replaceableTypes.has(entry.type))
    .sort((left, right) => {
      const priority = (entry) => ["Easy Run", "Schwellenlauf", "Intervalle", "Laufband", "Backyard Training", "Long Run"].indexOf(entry.type);
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

function distributeEasyKilometers(plan, weekStart, target, fixedKm, config, phase, readiness, cycle) {
  const allowed = new Set(config.runDays?.length ? config.runDays : ["Dienstag", "Mittwoch", "Freitag", "Samstag", "Sonntag"]);
  const hasRecurringCommitments = Array.isArray(config.recurringCommitments) && config.recurringCommitments.length > 0;
  const fixedAppointments = hasRecurringCommitments ? { football: false, orcRun: false } : (config.fixedAppointments || {});
  const trueDoubleDays = new Set(config.doubleTrainingDays || []);

  function hasEnduranceSession(day) {
    const date = isoDate(dateForDay(weekStart, DAY_INDEX[day]));
    return plan.some((entry) => entry.date === date && !["Stabi", "Ruhetag"].includes(entry.type));
  }

  const candidates = [
    "Dienstag",
    "Freitag",
    "Donnerstag",
    ...(!fixedAppointments.orcRun ? ["Mittwoch"] : []),
    ...(!fixedAppointments.football || trueDoubleDays.has("Montag") ? ["Montag"] : []),
  ].filter((day) => allowed.has(day) && (!hasEnduranceSession(day) || trueDoubleDays.has(day)));

  const remaining = Math.max(0, target - fixedKm);
  const defaultDesiredSessions = target >= 75 ? 3 : remaining > 12 ? 2 : 1;
  const existingRunSessions = plan.filter((entry) => /run|lauf|track|intervall|schwelle|tempo|backyard/i.test(`${entry.type || ""} ${entry.title || ""}`)).length;
  const acceptedTargetRunCount = Math.max(0, Math.min(7, Number(config.targetRunCount || 0)));
  const progressionSessions = acceptedTargetRunCount > 0 ? Math.max(0, acceptedTargetRunCount - existingRunSessions) : 0;
  const desiredSessions = acceptedTargetRunCount > 0 ? progressionSessions : defaultDesiredSessions;
  const maxSessionsByKilometers = remaining >= 4 ? Math.floor(remaining / 4) : remaining >= 3 ? 1 : 0;
  const sessionCount = Math.min(desiredSessions, candidates.length, maxSessionsByKilometers);
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
    const distance = Math.max(4, Math.round(remaining * weights[index]));
    const paired = hasEnduranceSession(day);
    const quality = day === "Freitag" && !paired && readiness.hardAllowed && ["build", "specific"].includes(phase.key) && cycle >= 2 && target >= 45;
    plan.push(item(weekStart, DAY_INDEX[day], {
      time: paired ? "07:00" : "18:00",
      title: quality ? `${distance} km mit Schwellenblock` : `${distance} km locker`,
      type: quality ? "Schwellenlauf" : "Easy Run",
      distance,
      duration: Math.round(distance * 6.4),
      notes: quality
        ? "Nur kontrolliert: Einlaufen, kurzer Schwellenblock und auslaufen."
        : paired
          ? "Echter Doppeltrainingstag: sehr locker laufen und ausreichend Abstand zur zweiten Einheit lassen."
          : "Locker laufen, keine Pace erzwingen.",
      optional: index === sessionCount - 1 && target >= 55,
      doubleSession: paired,
      comboSession: false,
    }));
  });
}

export function generateWeekPlan({
  activities = [],
  planHistory = [],
  mission,
  config = {},
  forecast = [],
  offsetWeeks = 0,
  completedRunningKm = 0,
  reviews = {},
  today = new Date(),
}) {
  const weekStart = startOfWeek(new Date(), offsetWeeks);
  const nextWeekStart = startOfWeek(today, 1);
  const historyCutoff = weekStart > nextWeekStart ? nextWeekStart : weekStart;
  const history = runningWeeks(activities, historyCutoff, 8);
  const recentAverage = weightedAverage(history.map((week) => week.km));
  const recentPeak = Math.max(...history.slice(0, 4).map((week) => week.km), recentAverage, 0);
  const lastWeek = history[0]?.km || recentAverage;
  const longestRecent = recentLongestRun(activities, historyCutoff);
  const goal = planningTarget(mission, weekStart);
  const daysLeft = daysToMission(goal, weekStart);
  const phase = trainingPhase(daysLeft);
  const cycle = cycleWeek(mission, weekStart);
  const scheduledRecoveryWeek = cycle === 4;
  const missedSignals = recentMissedSignals(planHistory, historyCutoff);
  const checkinReadiness = readinessDecision(config, missedSignals);
  const reviewReference = weekStart > today ? weekStart : new Date(today.getTime() + DAY_MS);
  const reviewReadiness = reviewGuidance(activities, reviews, reviewReference);
  const readiness = combineReadiness(checkinReadiness, reviewReadiness);
  const earlyRecoveryWeek = readiness.factor < 0.86 || !readiness.longRunAllowed || ["unchanged", "worse"].includes(config.checkin?.pain) || ["recovering", "symptoms"].includes(config.checkin?.illness);
  const recoveryWeek = scheduledRecoveryWeek || earlyRecoveryWeek;
  const recoveryReason = scheduledRecoveryWeek
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

  const base = recentAverage || Math.max(25, Math.min(45, Number(goal?.targetKm || mission?.targetKm || 50) * 0.4));
  const cycleFactor = recoveryWeek ? (scheduledRecoveryWeek ? 0.75 : 0.82) : [1, 1.04, 1.08][cycle - 1] || 1;
  let target = base * cycleFactor * phase.factor * readiness.factor;

  if (!recoveryWeek && phase.key !== "taper" && lastWeek > 0) target = Math.min(target, lastWeek * 1.1);
  if (recentPeak > 0 && !recoveryWeek && phase.key !== "taper") target = Math.min(target, recentPeak * 1.1);
  target = Math.max(readiness.longRunAllowed ? 22 : 12, Math.round(target));

  const allowedRuns = new Set(config.runDays?.length ? config.runDays : ["Dienstag", "Mittwoch", "Freitag", "Samstag", "Sonntag"]);
  (config.recurringCommitments || [])
    .filter((entry) => entry?.enabled !== false && entry.sport === "running" && DAY_INDEX[entry.weekday] !== undefined)
    .forEach((entry) => allowedRuns.add(entry.weekday));
  const wednesdayKm = fixedAppointments.orcRun ? Math.min(10, Math.max(6, Math.round(target * 0.18))) : 0;
  const saturdayKm = fixedAppointments.saturdayMode !== "off" && phase.key !== "taper" && readiness.longRunAllowed
    ? Math.min(10, Math.max(recoveryWeek ? 5 : 6, Math.round(target * 0.13)))
    : 0;
  const desiredLong = Math.round(target * phase.longShare * (recoveryWeek ? 0.82 : 1));
  const progressionCap = longestRecent > 0 ? Math.max(14, Math.round(longestRecent * 1.12)) : desiredLong;
  const longRun = readiness.longRunAllowed
    ? Math.max(12, Math.min(desiredLong, progressionCap, Number(config.maxLongRun || 38)))
    : 0;
  const loopPrescription = loopTrainingPrescription(goal, daysLeft, longRun, cycle, recoveryWeek);

  const fridayWeather = weatherDecision(weatherForDate(forecast, dateForDay(weekStart, 4)), config);
  const sundayWeather = weatherDecision(weatherForDate(forecast, dateForDay(weekStart, 6)), config);

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

  if (longRun > 0 && allowedRuns.has("Sonntag")) {
    const plannedLongDistance = loopPrescription?.distance || longRun;
    plan.push(item(weekStart, 6, {
      time: sundayWeather?.tooHot ? "07:00" : "09:00",
      title: loopPrescription?.title || `${longRun} km Longrun`,
      type: sundayWeather?.indoor ? "Laufband" : loopPrescription ? "Backyard Training" : phase.key === "specific" && saturdayKm > 0 ? "Backyard Training" : "Long Run",
      distance: plannedLongDistance,
      notes: sundayWeather?.indoor
        ? `Wetteranpassung: ${sundayWeather.tooHot ? "früh starten oder Laufband" : "bei Sturm/Gewitter nach innen wechseln"}. Fuel und Trinken testen.`
        : loopPrescription?.notes || "Ruhig und kontrolliert. Fuel, Trinken und Zeit auf den Beinen testen.",
      optional: false,
      weatherAdjusted: Boolean(sundayWeather?.indoor),
      loopTraining: loopPrescription || null,
      targetEventId: goal?.id || null,
    }));
  }

  applyRecurringCommitments(plan, weekStart, config, "running");
  const fixedKm = plan.reduce((sum, entry) => sum + Number(entry.distance || 0), 0);
  distributeEasyKilometers(plan, weekStart, target, fixedKm, config, phase, readiness, cycle);
  applyExtraOrcTrack(plan, weekStart, fixedAppointments.extraOrcTrackDay, config);
  applyRecurringCommitments(plan, weekStart, config, "non-running");
  addStrengthSessions(plan, weekStart, config, readiness);

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
      .filter((entry) => !["Fußball", "ORC Track", "Samstagsoption", "Backyard Training", "Long Run"].includes(entry.type))
      .map((entry) => {
        if (["ORC Run", "Easy Run", "Laufband", "Schwellenlauf"].includes(entry.type)) {
          const distance = Math.min(6, Math.max(3, Number(entry.distance || 4)));
          return {
            ...entry,
            type: "Easy Run",
            title: `${distance} km Wiedereinstieg`,
            distance,
            optional: true,
            notes: "Nur locker und nur, wenn du dich im Alltag wieder normal fühlst. Bei Verschlechterung abbrechen.",
          };
        }
        if (entry.type === "Rudern") return { ...entry, duration: Math.min(25, entry.duration || 25), optional: true, notes: "Sehr locker als Wiedereinstieg; kein Druck." };
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
    const runEntries = plan.filter((entry) => Number(entry.distance || 0) > 0 && entry.type !== "Fußball");
    const generatedRunKm = runEntries.reduce((sum, entry) => sum + Number(entry.distance || 0), 0);
    if (generatedRunKm > 0 && remainingTarget < generatedRunKm) {
      const factor = remainingTarget / generatedRunKm;
      plan = plan.map((entry) => {
        if (!runEntries.some((runEntry) => runEntry.id === entry.id)) return entry;
        const adjusted = Math.max(entry.optional ? 0 : 3, Math.round(Number(entry.distance || 0) * factor));
        return {
          ...entry,
          distance: adjusted,
          title: entry.title.replace(/^\d+(?:[.,]\d+)?\s*km/, `${adjusted} km`),
          notes: `${entry.notes} Bereits absolvierte Laufkilometer dieser Woche wurden berücksichtigt.`,
        };
      }).filter((entry) => Number(entry.distance || 0) > 0 || ["Fußball", "Stabi", "Rudern", "Ruhetag"].includes(entry.type));
    }
  }

  plan.sort((a, b) => `${a.date}${a.time || ""}`.localeCompare(`${b.date}${b.time || ""}`));

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
    planningTarget: goal ? { id: goal.id, name: goal.name, date: goal.date, targetKm: goal.targetKm, targetMinKm: goal.targetMinKm, targetMaxKm: goal.targetMaxKm, goalKind: goal.goalKind } : null,
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
