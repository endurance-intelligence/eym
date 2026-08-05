import {
  activityDate,
  activityTimestamp,
  isRunningActivity,
  preferredActivities,
  sportFamily,
} from "./activityUtils.js";
import { summarizeCrossTrainingCredits } from "./crossTrainingLoad.js";
import { buildMissionOutlook } from "./missionOutlook.js";
import { reviewEntriesForActivity } from "./reviewCoverage.js";
import { runningIntensity } from "./trainingAnalytics.js";

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round((numeric(value) + Number.EPSILON) * factor) / factor;
}

function average(values = []) {
  const usable = values.map(Number).filter(Number.isFinite);
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : 0;
}

function durationMinutes(activity = {}) {
  const seconds = numeric(activity.durationSeconds);
  return seconds > 0 ? seconds / 60 : numeric(activity.duration);
}

function paceSeconds(activity = {}) {
  const distance = numeric(activity.distance);
  const seconds = numeric(activity.durationSeconds) || numeric(activity.duration) * 60;
  return distance > 0 && seconds > 0 ? seconds / distance : 0;
}

function formatPace(seconds) {
  const rounded = Math.round(numeric(seconds));
  if (!rounded) return "–";
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")} /km`;
}

function inRange(activity, range) {
  const timestamp = activityTimestamp(activity);
  const from = new Date(`${range.from}T00:00:00`);
  const to = new Date(`${range.to}T00:00:00`);
  return timestamp >= from && timestamp < to;
}

function toneForFactor(state) {
  if (state === "strong" || state === "appropriate") return "good";
  if (state === "action") return "bad";
  if (state === "watch") return "warn";
  return "neutral";
}

function longRunDevelopment(analytics) {
  const completed = analytics.weeks.filter((week) => !week.current);
  const recent = completed.slice(-3);
  const previous = completed.slice(-6, -3);
  const recentLongest = Math.max(0, ...recent.map((week) => numeric(week.longest)));
  const previousLongest = Math.max(0, ...previous.map((week) => numeric(week.longest)));
  const longRuns = analytics.runs.filter((activity) => runningIntensity(activity) === "long");
  const totalMinutes = Math.round(longRuns.reduce((sum, activity) => sum + durationMinutes(activity), 0));
  const latest = [...longRuns].sort((left, right) => activityTimestamp(right) - activityTimestamp(left))[0] || null;

  let status = "Noch offen";
  let tone = "neutral";
  let text = "Sobald mehrere lange Läufe vorhanden sind, zeigt der Coach Entwicklung statt nur den Einzelrekord.";
  if (longRuns.length) {
    if (previous.length && recentLongest >= previousLongest + 2) {
      status = "Kontrolliert aufgebaut";
      tone = "good";
      text = `Der längste Lauf der jüngsten drei abgeschlossenen Wochen liegt ${round(recentLongest - previousLongest)} km über der Vorperiode.`;
    } else if (recentLongest > 0 && previousLongest > 0 && recentLongest < previousLongest - 2) {
      status = "Bewusst entlastet";
      tone = "neutral";
      text = "Die jüngsten Longruns liegen unter der Vorperiode. Das kann zu einer Entlastungs- oder Übergangsphase passen und ist kein automatisches Defizit.";
    } else {
      status = "Stabile Basis";
      tone = "good";
      text = "Die Longrun-Distanz bleibt im persönlichen Bereich. Der nächste Schritt sollte aus dem Plan kommen, nicht aus Kilometerschulden.";
    }
  }

  return {
    status,
    tone,
    text,
    totalMinutes,
    count: longRuns.length,
    longest: round(Math.max(0, ...longRuns.map((activity) => numeric(activity.distance)))),
    latest: latest ? {
      id: latest.id,
      name: latest.name || "Longrun",
      date: activityDate(latest),
      distance: round(latest.distance),
      durationMinutes: Math.round(durationMinutes(latest)),
    } : null,
    weeks: analytics.weeks.map((week) => ({
      key: week.key,
      start: week.start,
      current: week.current,
      distance: round(week.longest),
    })),
  };
}

function aerobicEfficiency(analytics) {
  const rows = analytics.runs
    .filter((activity) => ["easy", "steady"].includes(runningIntensity(activity)))
    .map((activity) => ({
      activity,
      pace: paceSeconds(activity),
      heartRate: numeric(activity.avgHr),
    }))
    .filter((entry) => entry.pace >= 240 && entry.pace <= 720 && entry.heartRate >= 80)
    .sort((left, right) => activityTimestamp(left.activity) - activityTimestamp(right.activity));

  if (rows.length < 4) {
    return {
      status: "Mehr Vergleichsläufe nötig",
      tone: "neutral",
      text: `${rows.length} geeignete lockere Läufe mit Pace und Herzfrequenz. Für einen Trend werden mindestens vier benötigt.`,
      sampleSize: rows.length,
      pace: rows.length ? formatPace(average(rows.map((entry) => entry.pace))) : "–",
      heartRate: rows.length ? Math.round(average(rows.map((entry) => entry.heartRate))) : 0,
      changePercent: null,
    };
  }

  const split = Math.max(2, Math.floor(rows.length / 2));
  const previous = rows.slice(0, split);
  const recent = rows.slice(split);
  const efficiency = (entries) => average(entries.map((entry) => (1000 / entry.pace) / entry.heartRate));
  const previousEfficiency = efficiency(previous);
  const recentEfficiency = efficiency(recent);
  const changePercent = previousEfficiency > 0 ? ((recentEfficiency / previousEfficiency) - 1) * 100 : 0;
  const recentPace = average(recent.map((entry) => entry.pace));
  const recentHr = average(recent.map((entry) => entry.heartRate));

  const status = changePercent >= 2
    ? "Aerobe Effizienz steigt"
    : changePercent <= -2
      ? "Aktuell etwas schwerer"
      : "Aerob stabil";
  const tone = changePercent >= 2 ? "good" : changePercent <= -2 ? "warn" : "neutral";
  const text = changePercent >= 2
    ? `Bei lockeren Läufen bewegst du dich relativ zur Herzfrequenz rund ${round(changePercent)} % effizienter als in der ersten Hälfte des Zeitraums.`
    : changePercent <= -2
      ? `Die lockeren Läufe waren relativ zur Herzfrequenz rund ${round(Math.abs(changePercent))} % weniger effizient. Wärme, Ermüdung und Profil können das erklären.`
      : "Pace und Herzfrequenz bleiben bei den vergleichbaren lockeren Läufen in einem stabilen persönlichen Bereich.";

  return {
    status,
    tone,
    text,
    sampleSize: rows.length,
    pace: formatPace(recentPace),
    heartRate: Math.round(recentHr),
    changePercent: round(changePercent),
  };
}

function crossTrainingDevelopment(state, analytics) {
  const activities = preferredActivities(state.activities || [], { hideStrava: Boolean(state.intervals?.connected) })
    .filter((activity) => inRange(activity, analytics.range) && !isRunningActivity(activity));
  const credit = summarizeCrossTrainingCredits(activities, {
    allActivities: preferredActivities(state.activities || []),
    reviews: state.reviews || {},
  });
  const supported = new Set(["soccer", "roadCycling", "rowing", "strength", "cycling", "swimming", "walking"]);
  const groups = new Map();
  activities.forEach((activity) => {
    const family = sportFamily(activity);
    if (!supported.has(family)) return;
    const current = groups.get(family) || { key: family, count: 0, minutes: 0, distance: 0 };
    current.count += 1;
    current.minutes += durationMinutes(activity);
    current.distance += numeric(activity.distance);
    groups.set(family, current);
  });
  const labels = {
    soccer: "Fußball",
    roadCycling: "Rennrad",
    rowing: "Rudern",
    strength: "Stabi & Mobility",
    cycling: "Radfahren",
    swimming: "Schwimmen",
    walking: "Wandern & Gehen",
  };
  const rows = [...groups.values()]
    .map((group) => ({
      ...group,
      label: labels[group.key] || group.key,
      minutes: Math.round(group.minutes),
      distance: round(group.distance),
    }))
    .sort((left, right) => right.minutes - left.minutes);
  const totalMinutes = rows.reduce((sum, row) => sum + row.minutes, 0);

  return {
    rows,
    totalMinutes,
    coachLoad: Math.round(credit.coachLoad),
    footballKm: round(credit.rawFootballEquivalentKm),
    roadCyclingAerobicMinutes: Math.round(credit.rawAerobicMinutes),
    roadCyclingEquivalentKm: round(credit.rawRoadCyclingEquivalentKm),
    text: rows.length
      ? "Cross-Training wird als zusätzliche Belastung sichtbar, bleibt aber getrennt von echten Laufkilometern."
      : "Im gewählten Zeitraum wurde noch kein Cross-Training erkannt.",
  };
}

function reviewLearning(state, analytics) {
  const allActivities = preferredActivities(state.activities || []);
  const reviewed = analytics.runs.map((activity) => ({
    activity,
    reviews: reviewEntriesForActivity(activity, state.reviews || {}, allActivities),
  })).filter((entry) => entry.reviews.length > 0);
  const reviewRows = reviewed.flatMap(({ activity, reviews }) => reviews.map((review) => ({ activity, review })));

  const patterns = [];
  const fuelRows = reviewRows.filter(({ activity }) => durationMinutes(activity) >= 90);
  const goodFuel = fuelRows.filter(({ review }) => review.carbohydrateStatus === "good" && numeric(review.rpe) > 0);
  const lowFuel = fuelRows.filter(({ review }) => review.carbohydrateStatus === "low" && numeric(review.rpe) > 0);
  if (goodFuel.length >= 2 && lowFuel.length >= 2) {
    const goodRpe = average(goodFuel.map(({ review }) => numeric(review.rpe)));
    const lowRpe = average(lowFuel.map(({ review }) => numeric(review.rpe)));
    const delta = round(lowRpe - goodRpe);
    patterns.push({
      id: "fuel-rpe",
      tone: delta >= 0.8 ? "good" : "neutral",
      title: delta >= 0.8 ? "Fuel macht einen messbaren Unterschied" : "Fueling wird vergleichbar",
      value: delta >= 0 ? `${delta > 0 ? "+" : ""}${delta} RPE ohne Zielbereich` : `${Math.abs(delta)} RPE niedriger`,
      text: `Lange Läufe mit Fuel im Zielbereich wurden im Mittel mit RPE ${round(goodRpe)} bewertet, Läufe unter dem Zielbereich mit RPE ${round(lowRpe)}.`,
      sample: `${goodFuel.length + lowFuel.length} lange Läufe`,
    });
  }

  const easyWeather = analytics.runs
    .filter((activity) => runningIntensity(activity) === "easy" && numeric(activity.avgHr) > 0)
    .map((activity) => ({
      activity,
      temperature: numeric(activity.weather?.temperature ?? activity.temperature),
      heartRate: numeric(activity.avgHr),
    }))
    .filter((entry) => entry.temperature > -30);
  const warm = easyWeather.filter((entry) => entry.temperature >= 23);
  const mild = easyWeather.filter((entry) => entry.temperature > 0 && entry.temperature < 20);
  if (warm.length >= 2 && mild.length >= 2) {
    const difference = Math.round(average(warm.map((entry) => entry.heartRate)) - average(mild.map((entry) => entry.heartRate)));
    patterns.push({
      id: "heat-hr",
      tone: difference >= 6 ? "warn" : "neutral",
      title: difference >= 6 ? "Wärme erhöht deine Herzfrequenz" : "Wärme bisher gut verarbeitet",
      value: `${difference >= 0 ? "+" : ""}${difference} bpm`,
      text: "Verglichen werden lockere Läufe ab 23 °C mit lockeren Läufen unter 20 °C.",
      sample: `${warm.length + mild.length} Vergleichsläufe`,
    });
  }

  const energyRows = reviewRows.filter(({ review }) => numeric(review.energy) > 0 && numeric(review.legs) > 0);
  if (energyRows.length >= 3) {
    const energy = average(energyRows.map(({ review }) => numeric(review.energy)));
    const legs = average(energyRows.map(({ review }) => numeric(review.legs)));
    patterns.push({
      id: "recovery",
      tone: energy >= 6 && legs >= 6 ? "good" : "warn",
      title: energy >= 6 && legs >= 6 ? "Erholung überwiegend stabil" : "Erholung bewusst beobachten",
      value: `Energie ${round(energy)} · Beine ${round(legs)}`,
      text: energy >= 6 && legs >= 6
        ? "Die vorhandenen Reviews zeigen im Mittel belastbare Energie- und Beinwerte."
        : "Die vorhandenen Reviews liegen im Mittel unter dem stabilen Bereich. Der Coach sollte Belastungsschritte konservativ setzen.",
      sample: `${energyRows.length} Reviews`,
    });
  }

  if (!patterns.length) {
    patterns.push({
      id: "learning-open",
      tone: "neutral",
      title: "Persönliche Muster entstehen",
      value: `${reviewRows.length} ausgewertete Reviews`,
      text: "Mit weiteren Reviews kann der Coach Zusammenhänge zwischen Fueling, Wetter, Energie und Belastungsgefühl belastbarer erkennen.",
      sample: "Noch keine stabile Korrelation",
    });
  }

  return patterns.slice(0, 3);
}

function qualityDevelopment(analytics) {
  const quality = analytics.runs
    .filter((activity) => runningIntensity(activity) === "quality")
    .sort((left, right) => activityTimestamp(right) - activityTimestamp(left));
  const latest = quality[0] || null;
  const loadValues = quality.map((activity) => numeric(activity.trainingLoad || activity.trimp)).filter((value) => value > 0);
  return {
    count: quality.length,
    latest: latest ? {
      id: latest.id,
      name: latest.name || "Qualitätseinheit",
      date: activityDate(latest),
      distance: round(latest.distance),
      durationMinutes: Math.round(durationMinutes(latest)),
      averagePace: formatPace(paceSeconds(latest)),
    } : null,
    averageLoad: loadValues.length ? Math.round(average(loadValues)) : null,
    text: quality.length
      ? "Die Gesamtpace enthält Warm-up, Erholungen und Cool-down. Eine echte Intervall-Trefferquote braucht zusätzlich strukturierte Lap-Daten."
      : "Im gewählten Zeitraum wurde keine Track-, Schwellen- oder Tempoeinheit erkannt.",
  };
}


function phaseAwareOutlook(rawOutlook, analytics, longRun) {
  const completedWeeks = analytics.weeks.filter((week) => !week.current);
  const activeWeeks = completedWeeks.filter((week) => week.runs > 0).length;
  const averageKm = average(completedWeeks.map((week) => numeric(week.km)));
  const phaseVolumeFloor = rawOutlook.phase === "specific" ? 32 : rawOutlook.phase === "base" ? 22 : 18;
  const phaseLongRunFloor = rawOutlook.phase === "specific" ? 20 : rawOutlook.phase === "base" ? 14 : 16;
  const factors = rawOutlook.factors.map((factor) => {
    if (factor.id === "continuity") {
      const state = activeWeeks >= Math.max(1, completedWeeks.length - 1)
        ? "strong"
        : activeWeeks >= Math.max(1, completedWeeks.length - 3)
          ? "building"
          : "watch";
      return {
        ...factor,
        state,
        value: state === "strong" ? "Sehr stabil" : state === "building" ? "Im Aufbau" : "Beobachten",
        text: `${activeWeeks} von ${completedWeeks.length} abgeschlossenen Wochen enthalten absolvierte Läufe.`,
      };
    }
    if (factor.id === "volume") {
      const state = averageKm >= phaseVolumeFloor
        ? "appropriate"
        : averageKm >= phaseVolumeFloor * 0.75
          ? "building"
          : "watch";
      return {
        ...factor,
        state,
        value: state === "appropriate" ? "Passend zur Phase" : state === "building" ? "Planmäßig im Aufbau" : "Beobachten",
        text: `${round(averageKm)} km/Woche im Mittel der abgeschlossenen Wochen. Die laufende Woche wird nicht als Defizit gewertet.`,
      };
    }
    if (factor.id === "longrun") {
      const state = longRun.longest >= phaseLongRunFloor
        ? "appropriate"
        : longRun.longest >= phaseLongRunFloor * 0.75
          ? "building"
          : "watch";
      return {
        ...factor,
        state,
        value: state === "appropriate" ? "Passend zur Phase" : state === "building" ? "Im planmäßigen Aufbau" : "Beobachten",
        text: `Längster absolvierter Lauf im Analysezeitraum: ${round(longRun.longest)} km.`,
      };
    }
    return factor;
  });
  const actionFactors = factors.filter((factor) => factor.state === "action").length;
  const watchFactors = factors.filter((factor) => factor.state === "watch").length;
  const readiness = actionFactors > 0
    ? {
      label: "Anpassen",
      tone: "warn",
      text: "Der Coach reduziert oder verschiebt den nächsten Belastungsschritt, bis die Erholung wieder stabil ist.",
    }
    : watchFactors >= 3
      ? {
        label: "Beobachten",
        tone: "neutral",
        text: "Die Vorbereitung bleibt steuerbar. Einzelne Bereiche brauchen Zeit und werden schrittweise weiterentwickelt.",
      }
      : {
        label: "Auf Kurs",
        tone: "good",
        text: `Dein absolvierter Trainingsstand passt zum ${rawOutlook.phaseLabel.toLowerCase()}. Es besteht kein Anlass, künstlich Kilometer nachzuholen.`,
      };
  return {
    ...rawOutlook,
    activeWeeks,
    completedWeekCount: completedWeeks.length,
    averageKm: round(averageKm),
    factors: factors.map((factor) => ({ ...factor, tone: toneForFactor(factor.state) })),
    readiness,
    dataScope: "Nur absolvierte Einheiten, vorhandene Reviews und abgeschlossene Wochen; geplante Workouts verändern diesen Status nicht.",
  };
}

function coachInsights({ analytics, outlook, longRun, efficiency, crossTraining, learning }) {
  const insights = [];
  const trend = analytics.trend;
  insights.push({
    id: "volume",
    kicker: "Aufbau",
    tone: trend.direction === "up" ? "watch" : "good",
    title: trend.direction === "up" ? "Umfang steigt kontrolliert" : trend.direction === "down" ? "Umfang wurde entlastet" : "Wochenumfang ist stabil",
    text: trend.text,
  });

  insights.push({
    id: "longrun",
    kicker: "Robustheit",
    tone: longRun.tone,
    title: longRun.status,
    text: longRun.text,
  });

  const watchLearning = learning.find((item) => item.tone === "warn");
  if (watchLearning) {
    insights.push({
      id: "next",
      kicker: "Beobachten",
      tone: "warn",
      title: watchLearning.title,
      text: watchLearning.text,
    });
  } else if (efficiency.changePercent != null) {
    insights.push({
      id: "next",
      kicker: "Aerob",
      tone: efficiency.tone,
      title: efficiency.status,
      text: efficiency.text,
    });
  } else if (crossTraining.totalMinutes > 0) {
    insights.push({
      id: "next",
      kicker: "Zusatzbelastung",
      tone: "neutral",
      title: `${Math.round(crossTraining.totalMinutes / 60 * 10) / 10} h Cross-Training`,
      text: crossTraining.text,
    });
  } else {
    insights.push({
      id: "next",
      kicker: "Nächster Schritt",
      tone: outlook.readiness.tone,
      title: outlook.readiness.label,
      text: outlook.readiness.text,
    });
  }

  return insights.slice(0, 3);
}

export function buildAnalyticsIntelligence(state = {}, analytics, now = new Date()) {
  const canonical = preferredActivities(state.activities || [], { hideStrava: Boolean(state.intervals?.connected) });
  const rawOutlook = buildMissionOutlook(canonical, state.reviews || {}, state.mission || {}, now);
  const longRun = longRunDevelopment(analytics);
  const outlook = phaseAwareOutlook(rawOutlook, analytics, longRun);
  const efficiency = aerobicEfficiency(analytics);
  const crossTraining = crossTrainingDevelopment(state, analytics);
  const learning = reviewLearning(state, analytics);
  const quality = qualityDevelopment(analytics);

  return {
    outlook,
    longRun,
    efficiency,
    crossTraining,
    learning,
    quality,
    insights: coachInsights({ analytics, outlook, longRun, efficiency, crossTraining, learning }),
  };
}
