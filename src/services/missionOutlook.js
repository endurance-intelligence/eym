import { activityTimestamp, isRunningActivity } from "./activityUtils.js";

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
  const entries = Array.isArray(mission?.milestones) ? mission.milestones : [];
  const fallback = mission?.date ? [{
    id: mission.id,
    name: mission.name,
    date: mission.date,
    targetKm: mission.targetKm,
    location: mission.location,
    isMainTarget: true,
  }] : [];
  const merged = [...entries, ...fallback].filter((entry, index, all) => (
    entry?.date
    && !entry.archived
    && eventDate(entry) >= new Date(now.getFullYear(), now.getMonth(), now.getDate())
    && all.findIndex((candidate) => candidate.id === entry.id || (candidate.name === entry.name && candidate.date === entry.date)) === index
  ));
  return merged.sort((left, right) => eventDate(left) - eventDate(right));
}

function targetRange(event) {
  const text = String(event?.name || "").toLowerCase();
  if (text.includes("backyard")) {
    return {
      min: Number(event.targetMinKm || 60),
      max: Number(event.targetMaxKm || 80),
      label: `${Number(event.targetMinKm || 60)}–${Number(event.targetMaxKm || 80)} km`,
      loopKm: 6.7,
      kind: "backyard",
    };
  }
  const km = Number(event?.targetKm || 0);
  return {
    min: km,
    max: km,
    label: km ? `${km} km` : "Distanz offen",
    loopKm: /heartbeat|fulda/.test(text) ? 6 : null,
    kind: /heartbeat|fulda/.test(text) ? "heartbeat" : "race",
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
  return {
    title: `${loops} × ${String(range.loopKm).replace(".", ",")} km · ${String(km).replace(".", ",")} km`,
    text: range.kind === "backyard"
      ? "Als kontrollierter Loop-Block mit Geh-/Verpflegungsroutine. Nicht die komplette Zielstrecke im Training erzwingen."
      : "Als Fulda-spezifischer Loop-Block mit gleichmäßiger Pace, kurzen Stopps und vollständigem Fuel-Test.",
  };
}

export function buildMissionOutlook(activities = [], reviews = {}, mission = {}, now = new Date()) {
  const targets = upcomingTargets(mission, now);
  const nextTarget = targets[0] || null;
  const mainTarget = targets.find((target) => target.isMainTarget) || targets.at(-1) || null;
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

  let score = 15;
  score += averageKm >= 50 ? 30 : averageKm >= 40 ? 24 : averageKm >= 30 ? 17 : averageKm >= 20 ? 10 : 4;
  score += longestRun >= 34 ? 25 : longestRun >= 28 ? 21 : longestRun >= 22 ? 15 : longestRun >= 16 ? 9 : 3;
  score += activeWeeks >= 7 ? 18 : activeWeeks >= 6 ? 14 : activeWeeks >= 4 ? 8 : 3;
  score += keySessions >= 4 ? 12 : keySessions >= 2 ? 8 : keySessions ? 4 : 0;
  score -= Math.min(20, recoveryWarnings * 5);
  score = clamp(Math.round(score), 0, 100);

  const readiness = score >= 78
    ? { label: "Auf Kurs", tone: "good", text: "Umfang, Kontinuität und lange Schlüsselreize bilden aktuell eine belastbare Basis." }
    : score >= 58
      ? { label: "Solider Aufbau", tone: "neutral", text: "Die Basis ist vorhanden. Die nächsten Wochen müssen jetzt spezifischer und konstant werden." }
      : { label: "Aufbau nötig", tone: "warn", text: "Das Ziel bleibt erreichbar, aber Umfang, lange Einheiten und Erholung müssen erst stabiler werden." };

  const nextDays = nextTarget ? daysUntil(nextTarget, now) : null;
  const mainDays = mainTarget ? daysUntil(mainTarget, now) : null;
  const range = targetRange(nextTarget);
  const loop = nextLoopPrescription(nextTarget, nextDays, { averageKm, peakKm, activeWeeks, longestRun, keySessions });

  const roadmap = [];
  if (nextTarget && range.kind === "backyard") {
    const currentPhase = nextDays <= 21 ? "taper" : nextDays <= 56 ? "specific" : "base";
    roadmap.push({
      label: currentPhase === "base" ? "Aktuelle Phase" : "Grundlage",
      title: "Basis stabilisieren",
      text: "Wochenumfang kontrolliert entwickeln, Höhenmeter und ORC-Qualität verarbeiten, Longrun nicht jede Woche maximal ausreizen.",
      current: currentPhase === "base",
    });
    roadmap.push({
      label: currentPhase === "specific" ? "Aktuelle Phase" : "In den nächsten Wochen",
      title: "Backyard-spezifische Loops",
      text: "Alle 1–2 Belastungswochen ein Loop-Block mit Pace-, Pausen-, Geh- und Fuel-Routine. Der Umfang wächst nur bei stabilen Reviews.",
      current: currentPhase === "specific",
    });
    roadmap.push({
      label: currentPhase === "taper" ? "Aktuelle Phase" : "Letzte 14–21 Tage",
      title: "Taper & Frische",
      text: "Umfang deutlich reduzieren, Rhythmus behalten und keine 60–80-km-Generalprobe mehr erzwingen.",
      current: currentPhase === "taper",
    });
  }
  if (mainTarget && (!nextTarget || mainTarget.id !== nextTarget.id)) {
    roadmap.push({
      label: "Nach dem Backyard",
      title: `Übergang zu ${mainTarget.name}`,
      text: "Der Backyard ist ein wichtiger Ultra-Reiz. Danach folgen reviewgesteuerte Erholung und anschließend Fulda-spezifische 6-km-Loop-Blöcke.",
      current: false,
    });
  }

  return {
    nextTarget,
    mainTarget,
    nextDays,
    mainDays,
    targetRange: range,
    readiness,
    score,
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
