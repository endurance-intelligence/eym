import { normalizeRacePrepProfile } from "./racePrepPlanner.js";

const DISTANCE_CHECKPOINTS = [0.1, 0.25, 0.5, 0.75, 0.9, 1];
const TIME_CHECKPOINTS = [0.1, 0.25, 0.5, 0.75, 0.9, 1];

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, digits = 0) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function durationLabel(minutes) {
  const total = Math.max(0, Math.round(numeric(minutes)));
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (!hours) return `${mins} min`;
  return `${hours}:${String(mins).padStart(2, "0")} h`;
}

function paceLabel(secondsPerKm) {
  if (!(Number(secondsPerKm) > 0)) return "–";
  const total = Math.max(0, Math.round(secondsPerKm));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")} /km`;
}

function signedDuration(minutes) {
  const totalSeconds = Math.round(Math.abs(Number(minutes || 0)) * 60);
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const value = hours > 0
    ? `${hours}:${String(mins).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${mins}:${String(seconds).padStart(2, "0")}`;
  return `${Number(minutes || 0) < 0 ? "−" : "+"}${value}`;
}

function phaseForProgress(progress) {
  const value = clamp(numeric(progress), 0, 1);
  if (value < 0.1) return "opening";
  if (value < 0.7) return "work";
  if (value < 0.9) return "late";
  return "finish";
}

function phaseBlueprint(profile, targetPaceSeconds) {
  const isLoop = profile.format === "loop";
  const isTime = profile.format === "time";
  const pace = paceLabel(targetPaceSeconds);
  return [
    {
      key: "opening",
      range: "0–10 %",
      title: "Kontrolliert eröffnen",
      detail: isLoop
        ? "Rundenrhythmus setzen, nicht auf frühe Minutenjagd gehen und die Box-Routine sauber etablieren."
        : isTime
          ? "Bewusst unter Rennstress starten. Die ersten Minuten dienen der Rhythmusfindung, nicht dem Positionskampf."
          : `Nicht schneller als der geplante Gesamt-Schnitt ${pace} anlaufen. Frühe Sekunden werden nicht gejagt.`,
    },
    {
      key: "work",
      range: "10–70 %",
      title: "Arbeitsphase stabilisieren",
      detail: isLoop
        ? "Runde für Runde denselben Ablauf reproduzieren: laufen, ankommen, versorgen, neu starten."
        : isTime
          ? "Belastung reproduzierbar halten. Tempo nur so hoch, dass Fueling, Trinken und Technik weiter funktionieren."
          : `Im geplanten Korridor um ${pace} bleiben. Kleine Abweichungen werden geglättet, nicht sofort zurückgeholt.`,
    },
    {
      key: "late",
      range: "70–90 %",
      title: "Späte Phase schützen",
      detail: "Entscheidungen werden jetzt nach RPE, Beinen, Magen und Fueling getroffen. Kein aggressives Nachholen von Zeit oder Ernährung.",
    },
    {
      key: "finish",
      range: "90–100 %",
      title: "Finale Entscheidung",
      detail: "Erst jetzt freigeben: Wenn Körpergefühl und Versorgung stabil sind, darf die Intensität kontrolliert steigen. Sonst Plan bis ins Ziel halten.",
    },
  ];
}

function distanceCheckpoints(profile) {
  return DISTANCE_CHECKPOINTS.map((fraction, index) => {
    const distanceKm = profile.distanceKm * fraction;
    const elapsedMinutes = profile.durationMinutes * fraction;
    return {
      key: `distance-${index}`,
      fraction,
      marker: `${round(distanceKm, distanceKm < 10 ? 1 : 0).toLocaleString("de-DE")} km`,
      target: durationLabel(elapsedMinutes),
      distanceKm: round(distanceKm, 2),
      elapsedMinutes: round(elapsedMinutes, 1),
    };
  });
}

function timeCheckpoints(profile) {
  return TIME_CHECKPOINTS.map((fraction, index) => {
    const elapsedMinutes = profile.durationMinutes * fraction;
    return {
      key: `time-${index}`,
      fraction,
      marker: `${Math.round(fraction * 100)} %`,
      target: durationLabel(elapsedMinutes),
      elapsedMinutes: round(elapsedMinutes, 1),
    };
  });
}

function loopCheckpoints(profile) {
  const totalRounds = Math.max(1, Math.round(numeric(profile.rounds)));
  const interval = Math.max(1, numeric(profile.loopIntervalMinutes));
  const rawRounds = totalRounds <= 20
    ? Array.from({ length: totalRounds }, (_, index) => index + 1)
    : [...new Set([
      1, 2, 3, 4, 5,
      Math.round(totalRounds * 0.25),
      Math.round(totalRounds * 0.5),
      Math.round(totalRounds * 0.75),
      Math.max(1, totalRounds - 2),
      Math.max(1, totalRounds - 1),
      totalRounds,
    ])].sort((left, right) => left - right);
  return rawRounds.map((roundNumber) => ({
    key: `loop-${roundNumber}`,
    fraction: roundNumber / totalRounds,
    marker: `Runde ${roundNumber}`,
    target: `Start + ${durationLabel((roundNumber - 1) * interval)}`,
    round: roundNumber,
    elapsedMinutes: (roundNumber - 1) * interval,
  }));
}

export function emptyRaceCoachStatus() {
  return {
    elapsedMinutes: 0,
    distanceKm: 0,
    currentRound: 1,
    lastLoopMinutes: 0,
    rpe: 5,
    legs: "okay",
    stomach: "okay",
    fueling: "on-plan",
  };
}

export function normalizeRaceCoachStatus(input = {}, profile = {}) {
  return {
    ...emptyRaceCoachStatus(),
    ...input,
    elapsedMinutes: numeric(input.elapsedMinutes),
    distanceKm: numeric(input.distanceKm),
    currentRound: Math.max(1, Math.round(numeric(input.currentRound) || 1)),
    lastLoopMinutes: numeric(input.lastLoopMinutes),
    rpe: clamp(numeric(input.rpe) || 5, 1, 10),
    legs: ["fresh", "okay", "heavy"].includes(input.legs) ? input.legs : "okay",
    stomach: ["okay", "notable", "problem"].includes(input.stomach) ? input.stomach : "okay",
    fueling: ["on-plan", "behind", "problem"].includes(input.fueling) ? input.fueling : "on-plan",
    profileFormat: profile.format || input.profileFormat || "distance",
  };
}

export function buildRaceCoachPlan(inputProfile = {}) {
  const profile = normalizeRacePrepProfile(inputProfile);
  if (!(profile.durationMinutes > 0)) {
    return { valid: false, profile, error: "Für den Race Coach fehlt eine erwartete Renndauer." };
  }
  if (profile.format === "distance" && !(profile.distanceKm > 0)) {
    return { valid: false, profile, error: "Für das Distanzrennen fehlt die Distanz." };
  }

  const targetPaceSeconds = profile.format === "distance" && profile.distanceKm > 0
    ? profile.durationMinutes * 60 / profile.distanceKm
    : 0;
  const checkpoints = profile.format === "loop"
    ? loopCheckpoints(profile)
    : profile.format === "time"
      ? timeCheckpoints(profile)
      : distanceCheckpoints(profile);

  return {
    valid: true,
    profile,
    targetPaceSeconds,
    phases: phaseBlueprint(profile, targetPaceSeconds),
    checkpoints,
    summary: {
      duration: durationLabel(profile.durationMinutes),
      distance: profile.distanceKm > 0 ? `${round(profile.distanceKm, 1).toLocaleString("de-DE")} km` : "offene Distanz",
      pace: targetPaceSeconds > 0 ? paceLabel(targetPaceSeconds) : "nach Belastung",
      loopInterval: profile.format === "loop" ? `${Math.round(profile.loopIntervalMinutes)} min` : "",
    },
  };
}

function statusProgress(plan, status) {
  const profile = plan.profile;
  if (profile.format === "loop") {
    return clamp((status.currentRound - 1) / Math.max(1, profile.rounds), 0, 1);
  }
  if (profile.format === "distance" && status.distanceKm > 0) {
    return clamp(status.distanceKm / profile.distanceKm, 0, 1);
  }
  return clamp(status.elapsedMinutes / profile.durationMinutes, 0, 1);
}

function nextCheckpoint(plan, progress, status) {
  if (plan.profile.format === "loop") {
    return plan.checkpoints.find((item) => Number(item.round || 0) > status.currentRound) || plan.checkpoints.at(-1) || null;
  }
  return plan.checkpoints.find((item) => item.fraction > progress + 0.001) || plan.checkpoints.at(-1) || null;
}

export function evaluateRaceCoach({ plan, status: inputStatus } = {}) {
  if (!plan?.valid) return { valid: false, error: plan?.error || "Race Coach ist noch nicht berechenbar." };
  const status = normalizeRaceCoachStatus(inputStatus, plan.profile);
  const profile = plan.profile;
  const progress = statusProgress(plan, status);
  const phase = phaseForProgress(progress);
  const actions = [];
  let tone = "hold";
  let headline = "Plan halten";
  let position = `${Math.round(progress * 100)} % des Rennplans`;
  let scheduleDeltaMinutes = null;

  if (profile.format === "distance" && status.distanceKm > 0 && status.elapsedMinutes > 0) {
    const targetElapsed = profile.durationMinutes * clamp(status.distanceKm / profile.distanceKm, 0, 1);
    scheduleDeltaMinutes = status.elapsedMinutes - targetElapsed;
    const relativeDelta = targetElapsed > 0 ? scheduleDeltaMinutes / targetElapsed : 0;
    position = scheduleDeltaMinutes < 0
      ? `${signedDuration(scheduleDeltaMinutes)} vor Zielplan`
      : scheduleDeltaMinutes > 0
        ? `${signedDuration(scheduleDeltaMinutes)} hinter Zielplan`
        : "exakt im Zielplan";

    if (relativeDelta < -0.03 && progress < 0.8) {
      tone = "caution";
      headline = "Nicht weiter Zeit bunkern";
      actions.push("Tempo leicht zurück in den geplanten Korridor nehmen. Der frühe Vorsprung wird nicht verteidigt.");
    } else if (relativeDelta > 0.05 && progress < 0.9) {
      tone = "adjust";
      headline = status.rpe <= 6 && status.legs !== "heavy" ? "Kleine Korrektur möglich" : "Zeit nicht erzwingen";
      actions.push(status.rpe <= 6 && status.legs !== "heavy"
        ? "Nur schrittweise korrigieren. Nicht versuchen, den gesamten Rückstand im nächsten Abschnitt zurückzuholen."
        : "Aktuelle Belastung stabilisieren. Rückstand akzeptieren, solange RPE oder Beine gegen eine Beschleunigung sprechen.");
    }
  }

  if (profile.format === "loop") {
    const interval = numeric(profile.loopIntervalMinutes);
    position = `Runde ${Math.min(status.currentRound, profile.rounds)} von ${profile.rounds}`;
    if (status.lastLoopMinutes > 0 && interval > 0) {
      const buffer = interval - status.lastLoopMinutes;
      position += ` · ${Math.max(0, round(buffer, 1)).toLocaleString("de-DE")} min Puffer`;
      if (buffer < 0) {
        tone = "adjust";
        headline = "Starttakt gerissen";
        actions.push("Nicht mit einem Sprint reagieren. Prüfe zuerst, ob der geplante Rundenrhythmus noch realistisch und sicher ausführbar ist.");
      } else if (buffer < 5) {
        tone = "caution";
        headline = "Puffer wird knapp";
        actions.push("Keine zusätzlichen Minuten jagen. Box-Ablauf vereinfachen und den nächsten Start sauber absichern.");
      }
    }
  }

  if (profile.format === "time") {
    position = `${Math.round(progress * 100)} % der geplanten Rennzeit`;
  }

  if (status.rpe >= 9 && progress < 0.85) {
    tone = "caution";
    headline = "Belastung ist zu früh sehr hoch";
    actions.unshift("Intensität reduzieren, bis Atmung und Bewegungsgefühl wieder kontrollierbar sind. Noch ist nicht die finale Rennphase.");
  } else if (status.rpe >= 8 && progress < 0.55 && tone === "hold") {
    tone = "caution";
    headline = "Frühe Belastung begrenzen";
    actions.unshift("RPE liegt für diese Rennphase hoch. Tempo nicht verschärfen und den nächsten Abschnitt bewusst kontrollieren.");
  }

  if (status.legs === "heavy" && progress < 0.6) {
    if (tone === "hold") tone = "caution";
    if (headline === "Plan halten") headline = "Beine früh schützen";
    actions.push("Schwere Beine früh im Rennen sind kein Signal zum Gegendrücken. Schrittfrequenz und Technik sauber halten, Intensität nicht erhöhen.");
  }

  if (status.stomach === "problem") {
    tone = "adjust";
    headline = "Magen zuerst stabilisieren";
    actions.push("Keine aggressive Tempo- oder Fuel-Korrektur. Auf bewährte, kleinere Aufnahmen zurückgehen und neue Produkte vermeiden.");
  } else if (status.stomach === "notable") {
    if (tone === "hold") tone = "caution";
    actions.push("Magen beobachten und die nächste Aufnahme bewusst klein und vertraut halten.");
  }

  if (status.fueling === "behind") {
    if (tone === "hold") tone = "caution";
    actions.push("Fuel-Rückstand nicht auf einmal nachholen. Über die nächsten geplanten Slots kontrolliert zurück in den Plan kommen.");
  } else if (status.fueling === "problem") {
    tone = "adjust";
    headline = status.stomach === "problem" ? headline : "Versorgung vereinfachen";
    actions.push("Fueling auf gut getestete Optionen reduzieren. Keine große Einzelportion erzwingen, nur um einen Sollwert zu treffen.");
  }

  if (!actions.length) {
    actions.push(phase === "opening"
      ? "Rhythmus weiter kontrolliert setzen. Noch keine Entscheidung über das Endergebnis erzwingen."
      : phase === "finish"
        ? "Wenn RPE, Beine, Magen und Fueling stabil sind, darfst du jetzt kontrolliert freigeben."
        : "Aktuellen Rhythmus halten. Kleine Schwankungen akzeptieren und den nächsten Checkpoint sauber erreichen.");
  }

  const phaseData = plan.phases.find((item) => item.key === phase) || plan.phases[0];
  return {
    valid: true,
    tone,
    headline,
    position,
    progress,
    phase,
    phaseData,
    scheduleDeltaMinutes,
    nextCheckpoint: nextCheckpoint(plan, progress, status),
    actions: [...new Set(actions)].slice(0, 4),
    status,
  };
}
