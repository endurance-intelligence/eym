import {
  activityDate,
  activityTimestamp,
  isRunningActivity,
} from "./activityUtils.js";

const DAY_MS = 86400000;

function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dayNumber(dateKey) {
  const parsed = Date.parse(`${dateKey}T12:00:00Z`);
  return Number.isFinite(parsed) ? Math.floor(parsed / DAY_MS) : null;
}

function recentRunningDays(activities, now, days = 8) {
  const cutoff = now.getTime() - Math.max(1, days) * DAY_MS;
  return [...new Set(
    (Array.isArray(activities) ? activities : [])
      .filter(isRunningActivity)
      .filter((activity) => activityTimestamp(activity).getTime() >= cutoff)
      .map(activityDate)
      .filter(Boolean),
  )].sort();
}

function consecutivePairs(dateKeys) {
  const days = dateKeys.map(dayNumber).filter(Number.isFinite);
  let pairs = 0;
  for (let index = 1; index < days.length; index += 1) {
    if (days[index] - days[index - 1] === 1) pairs += 1;
  }
  return pairs;
}

function recentRecoveryWarnings(activities, reviews, now) {
  const cutoff = now.getTime() - 14 * DAY_MS;
  return (Array.isArray(activities) ? activities : []).filter((activity) => {
    if (!isRunningActivity(activity) || activityTimestamp(activity).getTime() < cutoff) return false;
    const review = reviews?.[activity.id];
    if (!review) return false;
    const legs = Number(review.legs || 0);
    const energy = Number(review.energy || 0);
    return (legs > 0 && legs <= 5) || (energy > 0 && energy <= 5);
  }).length;
}

export function mobilityCoachSuggestion(activities = [], reviews = {}, now = new Date()) {
  const runningDays = recentRunningDays(activities, now);
  const backToBackPairs = consecutivePairs(runningDays);
  const recoveryWarnings = recentRecoveryWarnings(activities, reviews, now);
  const common = {
    focusAreaIds: ["mobility", "hips", "ankle"],
    condition: "tired",
  };

  if (recoveryWarnings >= 2) {
    return {
      ...common,
      id: `recovery-${localDateKey(now)}`,
      title: "Beweglichkeit & aktive Erholung priorisieren?",
      reason: "Mehrere aktuelle Lauf-Reviews melden müde Beine oder niedrige Energie.",
      detail: "EYM schlägt für dieses Workout ruhige Hüft-, Sprunggelenk- und Wirbelsäulenmobilität statt zusätzlicher Kraftbelastung vor.",
    };
  }

  if (backToBackPairs >= 1 && runningDays.length >= 3) {
    return {
      ...common,
      id: `back-to-back-${localDateKey(now)}`,
      title: "Nach den Back-to-back-Läufen beweglich bleiben?",
      reason: backToBackPairs === 1
        ? `${runningDays.length} Lauftage mit einem direkt aufeinanderfolgenden Laufpaar wurden zuletzt erkannt.`
        : `${runningDays.length} Lauftage mit ${backToBackPairs} direkt aufeinanderfolgenden Laufpaaren wurden zuletzt erkannt.`,
      detail: "Ein regenerativer Mobility-Schwerpunkt für Hüfte, Adduktoren, Wade und Sprunggelenk kann die aktive Erholung sinnvoll ergänzen.",
    };
  }

  if (runningDays.length >= 4) {
    return {
      ...common,
      id: `run-frequency-${localDateKey(now)}`,
      title: "Diese Woche einen Mobility-Schwerpunkt setzen?",
      reason: `${runningDays.length} Lauftage in kurzer Folge erhöhen den Bedarf an kontrollierter Beweglichkeit und aktiver Erholung.`,
      detail: "Der Vorschlag ergänzt dein Lauftraining, ohne deine dauerhaft gespeicherten Schwerpunkte zu verändern.",
    };
  }

  return null;
}

export function mobilityOverrideExpiry(now = new Date()) {
  const expiry = new Date(now);
  const daysToSunday = (7 - expiry.getDay()) % 7;
  expiry.setDate(expiry.getDate() + daysToSunday);
  return localDateKey(expiry);
}

export function activeMobilityOverride(override, today = new Date()) {
  if (!override?.id || !Array.isArray(override.focusAreaIds)) return null;
  return String(override.expiresOn || "") >= localDateKey(today) ? override : null;
}
