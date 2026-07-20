import {
  activityTimestamp,
  isRoadCyclingActivity,
  isRunningActivity,
} from "./activityUtils";

function durationHours(activity) {
  const seconds = Number(activity?.durationSeconds || 0);
  return seconds > 0 ? seconds / 3600 : Number(activity?.duration || 0) / 60;
}

function average(values = []) {
  const usable = values.map(Number).filter(Number.isFinite);
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : null;
}

function median(values = []) {
  const usable = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!usable.length) return null;
  const middle = Math.floor(usable.length / 2);
  return usable.length % 2 ? usable[middle] : (usable[middle - 1] + usable[middle]) / 2;
}

function reviewWeather(activity, review) {
  return review?.weather || activity?.weather || (activity?.temperature != null ? { temperature: Number(activity.temperature) } : null);
}

function sessionText(activity) {
  return `${activity?.name || ""} ${activity?.type || ""} ${activity?.sportType || ""}`.toLowerCase();
}

function isKeySession(activity) {
  const text = sessionText(activity);
  return Boolean(
    activity?.officialEvent
    || activity?.race
    || Number(activity?.distance || 0) >= 20
    || /longrun|long run|backyard|intervall|interval|schwelle|threshold|tempo|orc track|wettkampf|race/.test(text)
  );
}

function objectiveSessionCost(activity) {
  const durationMinutes = durationHours(activity) * 60;
  const elevation = Number(activity?.elevation || activity?.elevationGain || 0);
  const distance = Number(activity?.distance || 0);
  const text = sessionText(activity);
  return {
    demanding: isKeySession(activity)
      || durationMinutes >= 90
      || elevation >= 300
      || (distance >= 16 && elevation >= 200)
      || /sprint|intervall|interval|schwelle|threshold|orc track/.test(text),
    elevation,
    durationMinutes,
  };
}

function reviewCostSignal(activity, review) {
  const rpe = Number(review?.rpe || 0);
  const legs = Number(review?.legs ?? 10);
  const energy = Number(review?.energy ?? 10);
  const objective = objectiveSessionCost(activity);
  const recoveryProblem = legs <= 4 || energy <= 4;
  return {
    expectedHard: rpe >= 8 && objective.demanding && !recoveryProblem,
    warning: recoveryProblem || (rpe >= 8 && !objective.demanding),
    objective,
  };
}

function isEasySession(activity, review) {
  if (!isRunningActivity(activity)) return false;
  const text = sessionText(activity);
  if (/intervall|interval|schwelle|threshold|tempo|race|wettkampf|orc track|backyard/.test(text)) return false;
  return Number(review?.rpe || activity?.perceivedExertion || 5) <= 6;
}

function highZoneShare(activity) {
  return (activity?.heartRateZones?.zones || [])
    .filter((zone) => Number(zone.zone || 0) >= 4)
    .reduce((sum, zone) => sum + Number(zone.percentage || 0), 0);
}

export function hydration(activity, review) {
  if (!review) return null;
  const h = durationHours(activity);
  if (!h) return null;
  const drunk = Number(review.drinkMl || 0);
  let loss;
  if (review.weightBefore && review.weightAfter) {
    loss = (Number(review.weightBefore) - Number(review.weightAfter)) * 1000 + drunk - Number(review.urineMl || 0);
  } else {
    const temp = Number(reviewWeather(activity, review)?.temperature ?? 18);
    const effort = Number(review.rpe || 5);
    loss = h * (420 + Math.max(0, temp - 15) * 22 + effort * 28);
  }
  const rate = Math.max(0, loss / h);
  const deficit = loss - drunk;
  return {
    loss: Math.round(loss),
    rate: Math.round(rate),
    deficit: Math.round(deficit),
    recommendedLow: Math.round(rate * 0.75 / 50) * 50,
    recommendedHigh: Math.round(rate * 0.9 / 50) * 50,
  };
}

export function coachDashboard(activities = [], reviews = {}, now = new Date()) {
  const nowValue = now.getTime();
  const cutoff42 = nowValue - 42 * 86400000;
  const cutoff14 = nowValue - 14 * 86400000;
  const reviewedRows = activities
    .filter((activity) => reviews[activity.id] && activityTimestamp(activity).getTime() >= cutoff42)
    .map((activity) => ({ activity, review: reviews[activity.id] }))
    .sort((left, right) => activityTimestamp(right.activity) - activityTimestamp(left.activity));

  const recentRows = reviewedRows.filter(({ activity }) => activityTimestamp(activity).getTime() >= cutoff14);
  const recentEndurance = recentRows.filter(({ activity }) => isRunningActivity(activity) || isRoadCyclingActivity(activity));
  const tired = recentEndurance.filter(({ review }) => Number(review.legs ?? 10) <= 4 || Number(review.energy ?? 10) <= 4).length;
  const costSignals = recentEndurance.map(({ activity, review }) => reviewCostSignal(activity, review));
  const unexpectedHard = costSignals.filter((signal) => signal.warning).length;
  const expectedHard = costSignals.filter((signal) => signal.expectedHard).length;

  const easyRows = reviewedRows.filter(({ activity, review }) => isEasySession(activity, review) && Number(activity.avgHr || 0) > 0);
  const warmEasy = easyRows.filter(({ activity, review }) => Number(reviewWeather(activity, review)?.temperature) >= 23);
  const mildEasy = easyRows.filter(({ activity, review }) => {
    const temperature = Number(reviewWeather(activity, review)?.temperature);
    return Number.isFinite(temperature) && temperature < 20;
  });

  let hrWeather = {
    value: `${easyRows.length} Vergleichsläufe`,
    tone: "neutral",
    text: easyRows.length
      ? "Noch nicht genug vergleichbare lockere Läufe mit Wetterdaten, um einen stabilen Temperaturtrend zu erkennen."
      : "Noch keine bewerteten lockeren Läufe mit Herzfrequenz- und Wetterdaten.",
  };
  let hrAlert = false;
  if (warmEasy.length >= 2 && mildEasy.length >= 2) {
    const warmHr = average(warmEasy.map(({ activity }) => activity.avgHr));
    const mildHr = average(mildEasy.map(({ activity }) => activity.avgHr));
    const difference = Math.round((warmHr || 0) - (mildHr || 0));
    hrAlert = difference >= 6;
    hrWeather = {
      value: `${difference >= 0 ? "+" : ""}${difference} bpm bei Wärme`,
      tone: hrAlert ? "warn" : "good",
      text: hrAlert
        ? `Bei mindestens 23 °C liegt deine durchschnittliche Herzfrequenz bei vergleichbaren lockeren Läufen rund ${difference} bpm höher. Pace bei Wärme bewusst freigeben und stärker nach Gefühl steuern.`
        : "Deine Herzfrequenz bleibt bei den bisher vergleichbaren warmen und milden Läufen relativ stabil.",
    };
  } else if (easyRows.length >= 3) {
    const [latest, ...previous] = easyRows;
    const baseline = median(previous.slice(0, 6).map(({ activity }) => activity.avgHr));
    const difference = baseline == null ? 0 : Math.round(Number(latest.activity.avgHr) - baseline);
    const temperature = Number(reviewWeather(latest.activity, latest.review)?.temperature);
    const zonesHigh = highZoneShare(latest.activity);
    hrAlert = difference >= 7 || zonesHigh >= 25;
    hrWeather = {
      value: baseline == null ? `${latest.activity.avgHr} bpm` : `${difference >= 0 ? "+" : ""}${difference} bpm zum Median`,
      tone: hrAlert ? "warn" : "good",
      text: hrAlert
        ? `Der letzte lockere Lauf lag herzfrequenzseitig über deinem jüngsten persönlichen Muster${Number.isFinite(temperature) ? ` (${temperature.toFixed(0)} °C)` : ""}. Der Coach plant deshalb keine zusätzliche Qualität, bis sich der Wert normalisiert.`
        : "Der letzte lockere Lauf liegt herzfrequenzseitig im persönlichen Bereich der vergangenen Wochen.",
    };
  }

  const keyRows = reviewedRows.filter(({ activity }) => isRunningActivity(activity) && isKeySession(activity));
  const latestKey = keyRows[0] || null;
  let keySessions = {
    value: `${keyRows.length} bewertet`,
    tone: "neutral",
    text: "Noch keine bewertete Schlüsseleinheit in den letzten sechs Wochen.",
  };
  let keyAlert = false;
  if (latestKey) {
    const { activity, review } = latestKey;
    const name = activity.name || "Letzte Schlüsseleinheit";
    const costSignal = reviewCostSignal(activity, review);
    const strained = costSignal.warning;
    const lowFuel = durationHours(activity) >= 1.5 && review.carbohydrateStatus === "low";
    keyAlert = strained;
    keySessions = {
      value: `${keyRows.length} in 6 Wochen`,
      tone: strained ? "warn" : "good",
      text: strained
        ? `„${name}“ war nicht nur hart, sondern wurde auch schlecht verarbeitet. Die nächste Schlüsseleinheit folgt erst bei stabilen Beinen und normaler Energie.`
        : costSignal.expectedHard
          ? `„${name}“ war erwartbar hart${costSignal.objective.elevation >= 300 ? ` (${Math.round(costSignal.objective.elevation)} hm)` : ""}, wurde aber ohne klares Erholungssignal verarbeitet. Das zählt als sinnvoller Schlüsselreiz, nicht automatisch als Überlastung.`
          : lowFuel
            ? `„${name}“ wurde körperlich stabil bewertet, aber die Kohlenhydratzufuhr lag unter deinem Orientierungsbereich. Beim nächsten langen Schlüsselreiz Fuel früher starten.`
            : `„${name}“ wurde kontrolliert verarbeitet. Der nächste Schlüsselreiz kann planmäßig erfolgen, solange die lockeren Läufe stabil bleiben.`,
    };
  }

  const longFuelRows = reviewedRows.filter(({ activity, review }) => (
    isRunningActivity(activity)
    && durationHours(activity) >= 1.5
    && Number(review.carbohydratesPerHour || 0) > 0
  ));
  const goodFuel = longFuelRows.filter(({ review }) => review.carbohydrateStatus === "good").length;
  const lowFuel = longFuelRows.filter(({ review }) => review.carbohydrateStatus === "low").length;
  const hydrationRows = reviewedRows
    .map(({ activity, review }) => hydration(activity, review))
    .filter(Boolean);
  const sweatRate = average(hydrationRows.map((item) => item.rate));
  const fuel = {
    value: longFuelRows.length ? `${goodFuel}/${longFuelRows.length} im Zielbereich` : "Noch keine langen Fuel-Tests",
    tone: lowFuel ? "warn" : longFuelRows.length ? "good" : "neutral",
    text: longFuelRows.length
      ? `${lowFuel ? `${lowFuel} lange Einheit${lowFuel === 1 ? " lag" : "en lagen"} unter dem Kohlenhydrat-Zielbereich. ` : "Die erfassten langen Einheiten liegen beim Fuel im Zielbereich. "}${sweatRate ? `Ermittelte Schweißrate im Mittel: ${Math.round(sweatRate)} ml/h.` : ""}`
      : "Bei den nächsten Läufen ab etwa 90 Minuten Fuel und Trinkmenge erfassen, damit der Coach belastbare Muster lernt.",
  };

  let recommendation = "Deine letzten bewerteten Einheiten wirken stabil. Der Plan kann kontrolliert weiter aufgebaut werden, ohne den Umfang sprunghaft zu erhöhen.";
  if (tired >= 2) recommendation = "Beine oder Energie waren in den letzten zwei Wochen mehrfach niedrig. Umfang reduzieren, die nächste Qualitätseinheit verschieben und Erholung priorisieren.";
  else if (unexpectedHard >= 2) recommendation = "Mehrere Einheiten waren härter als ihr objektiver Trainingscharakter erwarten ließ oder wurden schlecht verarbeitet. Der nächste Trainingsreiz bleibt locker, bis Energie und Beine wieder normal sind.";
  else if (expectedHard >= 2) recommendation = "Die Woche enthielt mehrere bewusst harte Schlüsselreize. Das ist in Ordnung, solange Erholung, lockere Herzfrequenz und Beine in den Folgetagen stabil bleiben.";
  else if (hrAlert) recommendation = "Herzfrequenz und Wetter zeigen aktuell ein Belastungssignal. Lockere Läufe nach Gefühl steuern und vorerst keine zusätzliche Qualität einbauen.";
  else if (keyAlert) recommendation = "Die letzte Schlüsseleinheit war belastend. Der Coach schützt die nächsten Tage und baut erst danach wieder auf.";
  else if (lowFuel >= 1) recommendation = "Die körperliche Belastung ist grundsätzlich stabil, aber bei langen Läufen fehlt noch Energiezufuhr. Der nächste Longrun wird als Fuel-Test geplant.";

  return { recommendation, hrWeather, keySessions, fuel, reviewedRows };
}

export function coachInsight(activities, reviews) {
  return coachDashboard(activities, reviews).recommendation;
}

export function recovery(reviews, activities) {
  const vals = activities
    .slice(0, 6)
    .map((activity) => reviews[activity.id])
    .filter(Boolean)
    .slice(0, 3);

  if (!vals.length) {
    return {
      label: "Noch offen",
      tone: "neutral",
      text: "Bewerte mindestens einen Lauf. Danach kann EYM Beine, Energie und empfundene Belastung sinnvoll einordnen.",
      reviewed: 0,
      legs: "–",
      energy: "–",
      rpe: "–",
    };
  }

  const averageValue = (key, fallback) => vals.reduce((sum, review) => sum + Number(review[key] ?? fallback), 0) / vals.length;
  const legs = averageValue("legs", 5);
  const energy = averageValue("energy", 5);
  const rpe = averageValue("rpe", 5);
  const score = legs + energy - rpe;
  const metrics = {
    reviewed: vals.length,
    legs: legs.toFixed(1).replace(".0", ""),
    energy: energy.toFixed(1).replace(".0", ""),
    rpe: rpe.toFixed(1).replace(".0", ""),
  };

  if (score >= 8) {
    return {
      ...metrics,
      label: "Bereit",
      tone: "good",
      text: "Beine und Energie liegen im stabilen Bereich. Die geplante Einheit kann wie vorgesehen stattfinden.",
    };
  }

  if (score >= 4) {
    const reasons = [
      legs < 6 ? "müdere Beine" : "",
      energy < 6 ? "niedrigere Energie" : "",
      rpe >= 8 ? "eine hohe letzte Belastung" : "",
    ].filter(Boolean);
    return {
      ...metrics,
      label: "Mit Vorsicht",
      tone: "warn",
      text: `Die letzten Bewertungen zeigen ${reasons.length ? reasons.join(" und ") : "gemischte Erholungswerte"}. Die geplante Einheit ist möglich, aber ohne zusätzlichen Tempodruck.`,
    };
  }

  return {
    ...metrics,
    label: "Erholung priorisieren",
    tone: "bad",
    text: "Die letzten Bewertungen sprechen klar für Entlastung. Heute sehr locker trainieren, verkürzen oder pausieren.",
  };
}
