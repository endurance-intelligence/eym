import { activityTimestamp, isRunningActivity } from "./activityUtils.js";
import {
  eventCourseProfile,
  missionEvents,
  selectStrategicTarget,
} from "./goalPlanning.js";

const DAY_MS = 86400000;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function startOfWeek(input) {
  const date = new Date(input);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  date.setHours(0, 0, 0, 0);
  return date;
}

function eventDate(event) {
  const date = event?.date ? new Date(`${event.date}T12:00:00`) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function daysUntil(event, now) {
  const date = eventDate(event);
  return date ? Math.max(0, Math.ceil((date - now) / DAY_MS)) : null;
}

function upcomingTargets(mission, now) {
  return missionEvents(mission).filter((entry) => (
    eventDate(entry) >= new Date(now.getFullYear(), now.getMonth(), now.getDate())
  ));
}

function targetRange(event) {
  const text = String(event?.name || "").toLowerCase();
  const courseProfile = eventCourseProfile(event);
  if (text.includes("backyard")) {
    return {
      min: Number(event.targetMinKm || 60),
      max: Number(event.targetMaxKm || 80),
      label: `${Number(event.targetMinKm || 60)}–${Number(event.targetMaxKm || 80)} km`,
      loopKm: courseProfile.loopKm,
      kind: "backyard",
      ...courseProfile,
    };
  }
  const km = Number(event?.targetKm || 0);
  return {
    min: km,
    max: km,
    label: km ? `${km} km` : "Distanz offen",
    loopKm: courseProfile.loopKm,
    kind: /heartbeat|fulda/.test(text) ? "heartbeat" : courseProfile.courseType === "loop" ? "loop" : "race",
    ...courseProfile,
  };
}

function recentRunWeeks(activities, now, count = 8) {
  const currentWeek = startOfWeek(now);
  return Array.from({ length: count }, (_, index) => {
    const start = new Date(currentWeek);
    start.setDate(start.getDate() - index * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const rows = activities.filter((activity) => {
      const date = activityTimestamp(activity);
      return isRunningActivity(activity) && date >= start && date < end;
    });
    return {
      start,
      km: rows.reduce((sum, activity) => sum + Number(activity.distance || 0), 0),
      runs: rows.length,
      elevation: rows.reduce((sum, activity) => sum + Number(activity.elevation || activity.elevationGain || 0), 0),
    };
  });
}

function isKeySession(activity) {
  const text = `${activity?.name || ""} ${activity?.type || ""}`.toLowerCase();
  return Number(activity?.distance || 0) >= 20
    || Number(activity?.elevation || activity?.elevationGain || 0) >= 350
    || /longrun|long run|backyard|intervall|interval|schwelle|threshold|orc track|wettkampf|race/.test(text);
}

function reviewSignal(activity, review) {
  const rpe = Number(review?.rpe || 0);
  const legs = Number(review?.legs ?? 10);
  const energy = Number(review?.energy ?? 10);
  const text = `${activity?.name || ""} ${activity?.type || ""}`.toLowerCase();
  const elevation = Number(activity?.elevation || activity?.elevationGain || 0);
  const distance = Number(activity?.distance || 0);
  const durationMinutes = Number(activity?.durationSeconds || 0) / 60 || Number(activity?.duration || 0);
  const objectivelyHard = isKeySession(activity)
    || elevation >= 300
    || durationMinutes >= 90
    || /intervall|sprint|schwelle|orc track/.test(text);
  const poorlyRecovered = legs <= 4 || energy <= 4;
  return {
    expectedHard: rpe >= 8 && objectivelyHard && !poorlyRecovered,
    warning: poorlyRecovered || (rpe >= 8 && !objectivelyHard) || (rpe >= 9 && distance < 10 && elevation < 150 && durationMinutes < 75),
  };
}

function nextLoopPrescription(target, daysLeft, metrics) {
  const range = targetRange(target);
  if (!range.loopKm || daysLeft == null || daysLeft <= 14) {
    return {
      title: daysLeft != null && daysLeft <= 14 ? "Taper statt Loop-Block" : "Noch kein Loop-Block geplant",
      text: daysLeft != null && daysLeft <= 14
        ? "In den letzten zwei Wochen wird der Umfang reduziert. Keine lange Generalprobe mehr."
        : "Die nächste spezifische Einheit wird aus Trainingshistorie und Zieltyp abgeleitet.",
    };
  }
  const baseLoops = daysLeft > 56 ? 3 : daysLeft > 35 ? 4 : 5;
  const capabilityLoops = Math.max(2, Math.floor(Math.max(metrics.longestRun, 14) / range.loopKm));
  const loops = clamp(Math.min(baseLoops, capabilityLoops + 1), 2, range.kind === "backyard" ? 6 : 7);
  const km = Math.round(loops * range.loopKm * 10) / 10;
  const supplyRoutine = range.aidStationMode === "every_loop"
    ? "Rundenpause und Zugriff auf die Verpflegung nach jeder Runde realistisch testen."
    : range.aidStationMode === "fixed_stations"
      ? "Die Abstände der festen Verpflegungspunkte im Training nachbilden."
      : range.aidStationMode === "self_supported"
        ? "Material und vollständige Selbstversorgung wie im Event mitführen."
        : "Pace, Stopps und die geplante Verpflegungsroutine testen.";
  return {
    title: `${loops} × ${String(range.loopKm).replace(".", ",")} km · ${String(km).replace(".", ",")} km`,
    targetName: target?.name || "",
    priority: target?.priority || (target?.isMainTarget ? "A" : "B"),
    text: range.kind === "backyard"
      ? `Als kontrollierter Backyard-Block mit Geh- und Rundenroutine. ${supplyRoutine} Nicht die komplette Zielstrecke im Training erzwingen.`
      : `Als ${target?.name ? `${target.name}-spezifischer ` : ""}Loop-Block mit gleichmäßiger Pace und kurzen Stopps. ${supplyRoutine}`,
  };
}

export function buildMissionOutlook(activities = [], reviews = {}, mission = {}, now = new Date()) {
  const targets = upcomingTargets(mission, now);
  const nextTarget = targets[0] || null;
  const mainTarget = targets.find((target) => target.isMainTarget) || targets.at(-1) || null;
  const strategicTarget = selectStrategicTarget(mission, now);
  const weeks = recentRunWeeks(activities, now, 8);
  const averageKm = weeks.reduce((sum, week) => sum + week.km, 0) / Math.max(1, weeks.length);
  const peakKm = Math.max(0, ...weeks.map((week) => week.km));
  const activeWeeks = weeks.filter((week) => week.runs > 0).length;
  const recentCutoff = now.getTime() - 56 * DAY_MS;
  const recentRuns = activities.filter((activity) => isRunningActivity(activity) && activityTimestamp(activity).getTime() >= recentCutoff);
  const longestRun = Math.max(0, ...recentRuns.map((activity) => Number(activity.distance || 0)));
  const keySessions = recentRuns.filter(isKeySession).length;
  const reviewed = recentRuns.filter((activity) => reviews[activity.id]).map((activity) => ({ activity, review: reviews[activity.id] }));
  const signals = reviewed.map(({ activity, review }) => reviewSignal(activity, review));
  const recoveryWarnings = signals.filter((signal) => signal.warning).length;
  const expectedHard = signals.filter((signal) => signal.expectedHard).length;

  const nextDays = nextTarget ? daysUntil(nextTarget, now) : null;
  const mainDays = mainTarget ? daysUntil(mainTarget, now) : null;
  const strategicDays = strategicTarget ? daysUntil(strategicTarget, now) : null;

  const phase = strategicDays == null
    ? "base"
    : strategicDays <= 21
      ? "taper"
      : strategicDays <= 56
        ? "specific"
        : "base";
  const phaseLabel = phase === "taper" ? "Taper & Frische" : phase === "specific" ? "Spezifischer Aufbau" : "Grundlagenaufbau";
  const phaseVolumeFloor = phase === "specific" ? 32 : phase === "base" ? 22 : 18;
  const phaseLongRunFloor = phase === "specific" ? 20 : phase === "base" ? 14 : 16;

  const factors = [
    {
      id: "continuity",
      label: "Kontinuität",
      state: activeWeeks >= 7 ? "strong" : activeWeeks >= 5 ? "building" : "watch",
      value: activeWeeks >= 7 ? "Sehr stabil" : activeWeeks >= 5 ? "Im Aufbau" : "Beobachten",
      text: `${activeWeeks} von 8 Wochen enthalten absolvierte Läufe.`,
    },
    {
      id: "volume",
      label: "Wochenumfang",
      state: averageKm >= phaseVolumeFloor ? "appropriate" : averageKm >= phaseVolumeFloor * 0.75 ? "building" : "watch",
      value: averageKm >= phaseVolumeFloor ? "Passend zur Phase" : averageKm >= phaseVolumeFloor * 0.75 ? "Planmäßig im Aufbau" : "Beobachten",
      text: `${Math.round(averageKm * 10) / 10} km/Woche im 8-Wochen-Mittel. Kein starres 50-km-Soll.`,
    },
    {
      id: "longrun",
      label: "Longrun-Robustheit",
      state: longestRun >= phaseLongRunFloor ? "appropriate" : longestRun >= phaseLongRunFloor * 0.75 ? "building" : "watch",
      value: longestRun >= phaseLongRunFloor ? "Passend zur Phase" : longestRun >= phaseLongRunFloor * 0.75 ? "Im planmäßigen Aufbau" : "Beobachten",
      text: `Längster absolvierter Lauf der letzten 8 Wochen: ${Math.round(longestRun * 10) / 10} km.`,
    },
    {
      id: "specificity",
      label: "Zielspezifische Reize",
      state: keySessions >= 4 ? "strong" : keySessions >= 2 ? "appropriate" : keySessions ? "building" : "watch",
      value: keySessions >= 4 ? "Stark" : keySessions >= 2 ? "Passend" : keySessions ? "Im Aufbau" : "Noch offen",
      text: `${keySessions} absolvierte Schlüsselreize wurden erkannt.`,
    },
    {
      id: "recovery",
      label: "Erholung",
      state: recoveryWarnings === 0 ? "strong" : recoveryWarnings <= 1 ? "watch" : "action",
      value: recoveryWarnings === 0 ? "Unauffällig" : recoveryWarnings === 1 ? "1 Signal beobachten" : `${recoveryWarnings} Signale beachten`,
      text: recoveryWarnings === 0
        ? "In den vorhandenen Reviews liegt kein kritisches Erholungssignal vor."
        : "Erholungssignale bremsen den Aufbau automatisch; sie sind kein Trainingsversagen.",
    },
  ];

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
        text: `Dein absolvierter Trainingsstand passt zum ${phaseLabel.toLowerCase()}. Es besteht kein Anlass, künstlich Kilometer nachzuholen.`,
      };
  const range = targetRange(nextTarget);
  const strategicRange = targetRange(strategicTarget);
  const loop = nextLoopPrescription(strategicTarget, strategicDays, { averageKm, peakKm, activeWeeks, longestRun, keySessions });

  const roadmap = [];
  if (strategicTarget && (strategicRange.kind === "backyard" || Number(strategicTarget.targetKm || 0) >= 50)) {
    const currentPhase = strategicDays <= 21 ? "taper" : strategicDays <= 56 ? "specific" : "base";
    roadmap.push({
      label: currentPhase === "base" ? "Aktuelle Phase" : "Grundlage",
      title: "Basis stabilisieren",
      text: "Wochenumfang kontrolliert entwickeln, Qualitätseinheiten verarbeiten und den Longrun nicht jede Woche maximal ausreizen.",
      current: currentPhase === "base",
    });
    roadmap.push({
      label: currentPhase === "specific" ? "Aktuelle Phase" : "In den nächsten Wochen",
      title: strategicRange.loopKm ? `${strategicTarget.name}-spezifische Loops` : `${strategicTarget.name}-spezifischer Aufbau`,
      text: strategicRange.loopKm
        ? "Alle 1–2 Belastungswochen ein Loop-Block mit Pace-, Pausen-, Geh- und Fuel-Routine. Der Umfang wächst nur bei stabilen Reviews."
        : "Lange Einheiten, mögliche Back-to-Back-Blöcke und die Wettkampfverpflegung werden schrittweise spezifischer. Der Umfang wächst nur bei stabilen Reviews.",
      current: currentPhase === "specific",
    });
    roadmap.push({
      label: currentPhase === "taper" ? "Aktuelle Phase" : "Letzte 14–21 Tage",
      title: "Taper & Frische",
      text: "Umfang deutlich reduzieren, Rhythmus behalten und keine 60–80-km-Generalprobe mehr erzwingen.",
      current: currentPhase === "taper",
    });
  }
  if (mainTarget && (!strategicTarget || mainTarget.id !== strategicTarget.id)) {
    roadmap.push({
      label: `Nach ${strategicTarget?.name || "dem Zwischenziel"}`,
      title: `Übergang zu ${mainTarget.name}`,
      text: `${strategicTarget?.name || "Das Zwischenziel"} ist ein wichtiger Trainingsreiz. Danach folgen reviewgesteuerte Erholung und anschließend ein spezifischer Aufbau für ${mainTarget.name}.`,
      current: false,
    });
  }

  return {
    nextTarget,
    mainTarget,
    strategicTarget,
    nextDays,
    mainDays,
    strategicDays,
    targetRange: range,
    strategicTargetRange: strategicRange,
    readiness,
    phase,
    phaseLabel,
    factors,
    dataScope: "Nur absolvierte Einheiten und vorhandene Reviews; geplante Workouts verändern diesen Status nicht.",
    averageKm: Math.round(averageKm * 10) / 10,
    peakKm: Math.round(peakKm * 10) / 10,
    activeWeeks,
    longestRun: Math.round(longestRun * 10) / 10,
    keySessions,
    recoveryWarnings,
    expectedHard,
    loop,
    roadmap,
  };
}
