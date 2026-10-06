function parseDate(value) {
  const date = value ? new Date(`${String(value).slice(0, 10)}T12:00:00`) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function clampDate(date, low, high) {
  if (date < low) return new Date(low);
  if (date > high) return new Date(high);
  return date;
}

function isLoopGoal(goal = {}) {
  return goal.courseType === "loop" || Number(goal.loopKm || goal.loopDistanceKm || 0) > 0 || /backyard|heartbeat|runde|loop/i.test(String(goal.name || ""));
}

export function buildPreparationRoadmap({ goal = {}, intermediateEvents = [], now = new Date() } = {}) {
  const target = parseDate(goal.date);
  if (!target) return [];
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  const daysLeft = Math.ceil((target - today) / 86400000);
  if (daysLeft <= 7) return [];
  const realIntermediates = (intermediateEvents || []).filter((item) => item && !item.isMainTarget && parseDate(item.date) && parseDate(item.date) > today && parseDate(item.date) < target);
  if (realIntermediates.length) return [];

  const loop = isLoopGoal(goal);
  const earliest = addDays(today, 4);
  const latestSpecific = addDays(target, -7);
  const candidates = [
    {
      id: `training-specific-${goal.id || "goal"}`,
      date: clampDate(addDays(target, -35), earliest, latestSpecific),
      label: "Spezifischer Aufbau",
      title: loop ? "Race-spezifischer Loop-Block" : "Zielspezifischer Schlüsselblock",
      text: loop ? "Pace, kurze Stopps und Fueling im späteren Rennrhythmus gemeinsam testen." : "Zieltempo, Streckenanforderung und Versorgung in einem kontrollierten Schlüsselreiz verbinden.",
      tone: "build",
    },
    {
      id: `training-long-${goal.id || "goal"}`,
      date: clampDate(addDays(target, -24), addDays(earliest, 5), latestSpecific),
      label: "Robustheit",
      title: "Langer spezifischer Reiz",
      text: "Zeit auf den Beinen, Ermüdungsresistenz und die geplante Versorgung unter realer Belastung prüfen.",
      tone: "specific",
    },
    {
      id: `training-rehearsal-${goal.id || "goal"}`,
      date: clampDate(addDays(target, -14), addDays(earliest, 10), latestSpecific),
      label: "Generalprobe",
      title: "Race Setup einmal komplett durchspielen",
      text: "Ausrüstung, Pace-Regeln, Fueling und organisatorische Abläufe testen – ohne die volle Renndistanz erzwingen zu müssen.",
      tone: "rehearsal",
    },
    {
      id: `training-taper-${goal.id || "goal"}`,
      date: clampDate(addDays(target, -7), addDays(earliest, 14), addDays(target, -5)),
      label: "Taper",
      title: "Frische sichern",
      text: "Umfang deutlich reduzieren, Rhythmus behalten und keine neue Fitness mehr erzwingen.",
      tone: "taper",
    },
  ];

  const seen = new Set();
  return candidates
    .filter((item) => item.date > today && item.date < target)
    .map((item) => ({ ...item, date: dateKey(item.date) }))
    .filter((item) => {
      if (seen.has(item.date)) return false;
      seen.add(item.date);
      return true;
    });
}
