const DEFAULT_WEEK_TYPE = {
  key: "base",
  label: "Grundlagenwoche",
  tone: "neutral",
  summary: "Regelmäßigkeit und lockere Ausdauer stehen im Vordergrund.",
};

const WEEK_TYPES = {
  event: {
    key: "event",
    label: "Eventwoche",
    tone: "event",
    summary: "Das Event ist der zentrale Reiz. Der übrige Plan schützt die Frische.",
  },
  taper: {
    key: "taper",
    label: "Taperwoche",
    tone: "taper",
    summary: "Der Umfang sinkt bewusst, während Rhythmus und ausgewählte Intensität erhalten bleiben.",
  },
  recovery: {
    key: "recovery",
    label: "Entlastungswoche",
    tone: "recovery",
    summary: "Die reduzierte Belastung verarbeitet den vorherigen Trainingsreiz und ist kein Rückschritt.",
  },
  peak: {
    key: "peak",
    label: "Peak- & Absicherungswoche",
    tone: "peak",
    summary: "Die wichtigsten Fähigkeiten werden wettkampfnah abgesichert, ohne neue Müdigkeit zu erzwingen.",
  },
  specific_load: {
    key: "specific_load",
    label: "Zielspezifische Belastungswoche",
    tone: "load",
    summary: "Ein klarer Zielreiz wird auf einer bereits belastbaren Grundlage gesetzt.",
  },
  specific: {
    key: "specific",
    label: "Zielspezifische Woche",
    tone: "specific",
    summary: "Die Woche übersetzt deine Grundlage in die konkreten Anforderungen des Wettkampfs.",
  },
  load: {
    key: "load",
    label: "Belastungswoche",
    tone: "load",
    summary: "Der Trainingsreiz wird kontrolliert erhöht und anschließend wieder verarbeitet.",
  },
  build: {
    key: "build",
    label: "Aufbauwoche",
    tone: "build",
    summary: "Umfang und Schlüsselreize entwickeln sich schrittweise aus deiner etablierten Basis.",
  },
  base: DEFAULT_WEEK_TYPE,
};

const DISCIPLINE_FOCUS = {
  general: {
    base: "Regelmäßigkeit, lockere Ausdauer und belastbare Routinen entwickeln.",
    quality: "Einen passenden Entwicklungsreiz setzen, ohne unnötige Härte zu sammeln.",
  },
  "5k": {
    base: "Laufverträglichkeit und Laufökonomie festigen.",
    quality: "5-km-Tempo, Laufökonomie und kurze kontrollierte Qualitätsreize entwickeln.",
  },
  "10k": {
    base: "Aerobe Basis und gleichmäßige Laufverträglichkeit stabilisieren.",
    quality: "Schwelle, 10-km-spezifisches Tempo und Tempohärte gezielt entwickeln.",
  },
  half_marathon: {
    base: "Aerobe Ausdauer und progressive Longrun-Verträglichkeit aufbauen.",
    quality: "Schwelle, Halbmarathon-Arbeits-Pace und längere kontrollierte Belastungen verbinden.",
  },
  marathon: {
    base: "Muskuläre Ausdauer, ruhigen Umfang und Fueling-Routine aufbauen.",
    quality: "Lange Läufe, Marathon-Arbeits-Pace und Fueling unter Ermüdung entwickeln.",
  },
  ultra: {
    base: "Zeit auf den Beinen, muskuläre Robustheit und Fueling-Routine aufbauen.",
    quality: "Lange zielspezifische Belastungen, Streckenprofil und Ermüdungsresistenz entwickeln.",
  },
  backyard: {
    base: "Ruhigen Umfang, Zeit auf den Beinen und wiederholbares Anlaufen aufbauen.",
    quality: "Rundenrhythmus, Pausenroutine, Fueling und Laufen mit Vorermüdung trainieren.",
  },
};

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, numeric(value)));
}

function rounded(value, digits = 0) {
  const factor = 10 ** digits;
  return Math.round(numeric(value) * factor) / factor;
}

function median(values = []) {
  const ordered = values.map(Number).filter(Number.isFinite).sort((left, right) => left - right);
  if (!ordered.length) return 0;
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

function quantile(values = [], percentile = 0.5) {
  const ordered = values.map(Number).filter(Number.isFinite).sort((left, right) => left - right);
  if (!ordered.length) return 0;
  if (ordered.length === 1) return ordered[0];
  const index = clamp(percentile, 0, 1) * (ordered.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return ordered[lower];
  const fraction = index - lower;
  return ordered[lower] + (ordered[upper] - ordered[lower]) * fraction;
}

function average(values = []) {
  const valid = values.map(Number).filter(Number.isFinite);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : 0;
}

function compactKm(value) {
  return `${rounded(value, 1).toFixed(1).replace(".0", "").replace(".", ",")} km`;
}

export function deriveAthleteCapacity(history = [], fallbackWeeklyKm = 0) {
  const completedWeeks = (Array.isArray(history) ? history : [])
    .map((week) => ({ ...week, km: Math.max(0, numeric(week?.km)) }))
    .filter((week) => week.km > 0.5);
  const values = completedWeeks.map((week) => week.km);
  const fallback = Math.max(6, numeric(fallbackWeeklyKm, 8));

  if (!values.length) {
    return {
      source: "fallback",
      confidence: "low",
      completedWeekCount: 0,
      baseKm: rounded(fallback, 1),
      normalLowKm: rounded(fallback * 0.9, 1),
      normalHighKm: rounded(fallback * 1.05, 1),
      peakKm: rounded(fallback, 1),
      lastWeekKm: 0,
      lastWeekClass: "unknown",
      recentThreeKm: rounded(fallback, 1),
      summary: `Noch fehlen mehrere abgeschlossene Trainingswochen. Der Coach startet konservativ bei etwa ${compactKm(fallback)} und lernt aus jeder real absolvierten Woche.`,
    };
  }

  const typicalMedian = median(values);
  const recentThree = average(values.slice(0, 3));
  const recentFour = average(values.slice(0, 4));
  const establishedBase = values.length >= 3
    ? typicalMedian * 0.58 + recentThree * 0.42
    : average(values);
  const baseKm = Math.max(6, establishedBase || fallback);
  const normalLowKm = Math.max(6, Math.min(baseKm * 0.92, quantile(values, 0.42) || baseKm));
  const normalHighKm = Math.max(baseKm, Math.max(baseKm * 1.05, quantile(values, 0.72) || baseKm));
  const peakKm = Math.max(...values);
  const lastWeekKm = values[0] || 0;
  const lastWeekClass = lastWeekKm >= Math.max(baseKm * 1.13, normalHighKm * 1.05)
    ? "peak"
    : lastWeekKm <= baseKm * 0.82
      ? "recovery"
      : "normal";
  const confidence = values.length >= 6 ? "high" : values.length >= 3 ? "medium" : "low";
  const rangeLabel = `${rounded(normalLowKm, 1).toFixed(1).replace(".0", "").replace(".", ",")}–${compactKm(normalHighKm)}`;

  return {
    source: "activities",
    confidence,
    completedWeekCount: values.length,
    baseKm: rounded(baseKm, 1),
    normalLowKm: rounded(normalLowKm, 1),
    normalHighKm: rounded(normalHighKm, 1),
    peakKm: rounded(peakKm, 1),
    lastWeekKm: rounded(lastWeekKm, 1),
    lastWeekClass,
    recentThreeKm: rounded(recentThree || recentFour || baseKm, 1),
    summary: `${values.length} abgeschlossene Wochen ergeben eine belastbare normale Basis von ungefähr ${rangeLabel}. Die bisherige Umfangsspitze liegt bei ${compactKm(peakKm)}.`,
  };
}

function selectWeekType({ eventWeek, phaseKey, recoveryWeek, cycleWeek }) {
  if (eventWeek) return WEEK_TYPES.event;
  if (phaseKey === "taper") return WEEK_TYPES.taper;
  if (recoveryWeek) return WEEK_TYPES.recovery;
  if (phaseKey === "peak") return WEEK_TYPES.peak;
  if (phaseKey === "specific" && cycleWeek === 3) return WEEK_TYPES.specific_load;
  if (phaseKey === "specific") return WEEK_TYPES.specific;
  if (phaseKey === "build" && cycleWeek >= 2) return WEEK_TYPES.load;
  if (phaseKey === "build") return WEEK_TYPES.build;
  return WEEK_TYPES.base;
}

function prescriptionFactors({ weekTypeKey, phaseFactor, readinessFactor, earlyRecoveryWeek }) {
  if (weekTypeKey === "event") return { low: 1, high: 1, position: 0.5 };
  if (weekTypeKey === "taper") {
    const factor = clamp(phaseFactor || 0.65, 0.45, 0.82);
    return { low: factor * 0.92, high: factor * 1.06, position: 0.55 };
  }
  if (weekTypeKey === "recovery") {
    if (earlyRecoveryWeek) {
      const factor = clamp(readinessFactor || 0.75, 0.45, 0.86);
      return { low: factor * 0.92, high: factor * 1.04, position: 0.55 };
    }
    return { low: 0.74, high: 0.86, position: 0.62 };
  }

  const readiness = clamp(readinessFactor || 1, 0.82, 1.04);
  const base = {
    base: { low: 0.94, high: 1.02, position: 0.55 },
    build: { low: 0.98, high: 1.05, position: 0.58 },
    load: { low: 1.02, high: 1.08, position: 0.72 },
    specific: { low: 0.99, high: 1.06, position: 0.62 },
    specific_load: { low: 1.03, high: 1.1, position: 0.76 },
    peak: { low: 0.96, high: 1.05, position: 0.66 },
  }[weekTypeKey] || { low: 0.94, high: 1.02, position: 0.55 };
  return {
    low: base.low * readiness,
    high: base.high * readiness,
    position: base.position,
  };
}

function goalFocus(goalEngine, weekTypeKey) {
  const discipline = goalEngine?.discipline || "general";
  const focus = DISCIPLINE_FOCUS[discipline] || DISCIPLINE_FOCUS.general;
  if (["recovery", "taper"].includes(weekTypeKey)) {
    return weekTypeKey === "taper"
      ? "Frische aufbauen, Bewegungsrhythmus erhalten und nichts mehr nachholen."
      : "Vorherige Belastung verarbeiten, Bewegungsqualität erhalten und ohne Kilometerschulden erholen.";
  }
  if (weekTypeKey === "event") return "Das Event kontrolliert umsetzen; alle weiteren Einheiten dienen der Frische und Erholung.";
  return ["load", "specific", "specific_load", "peak"].includes(weekTypeKey) ? focus.quality : focus.base;
}

function goalDemandReason(goalEngine, weekType) {
  const targetName = goalEngine?.target?.name || goalEngine?.disciplineLabel || "dein Ziel";
  const phaseLabel = goalEngine?.phase?.label || "aktuelle Trainingsphase";
  if (weekType.key === "recovery") return `Die Entlastung ist Teil des langfristigen Aufbaus für ${targetName}; sie wird nicht als neue, niedrigere Basis gespeichert.`;
  if (weekType.key === "taper") return `${targetName} rückt näher. Der Coach reduziert den Umfang bewusst und erhält nur die nötigen zielnahen Reize.`;
  if (weekType.key === "event") return `${targetName} liegt in dieser Woche und ersetzt zusätzliche harte Schlüsseleinheiten.`;
  return `${phaseLabel} für ${targetName}: Der Umfang unterstützt die benötigten Fähigkeiten, bestimmt sie aber nicht allein.`;
}

function phaseCeiling(capacity, weekTypeKey) {
  if (["recovery", "taper"].includes(weekTypeKey)) return capacity.peakKm || capacity.normalHighKm;
  return Math.max(
    capacity.normalHighKm,
    (capacity.peakKm || capacity.normalHighKm) * 1.06,
    capacity.baseKm * 1.12,
  );
}

export function buildWeekPrescription({
  history = [],
  fallbackWeeklyKm = 0,
  goalEngine = {},
  cycleWeek = 1,
  recoveryWeek = false,
  scheduledRecoveryWeek = false,
  earlyRecoveryWeek = false,
  recoveryReason = "",
  readiness = {},
  eventWeek = null,
  protectedEventTarget = null,
  previousWeekKm = 0,
  maxWeeklyKm = 0,
  weekStart = "",
} = {}) {
  const capacity = deriveAthleteCapacity(history, fallbackWeeklyKm);
  const phaseKey = eventWeek ? "event" : goalEngine?.phase?.key || "base";
  const weekType = selectWeekType({ eventWeek, phaseKey, recoveryWeek, cycleWeek });
  const factors = prescriptionFactors({
    weekTypeKey: weekType.key,
    phaseFactor: goalEngine?.phase?.factor,
    readinessFactor: readiness?.factor,
    earlyRecoveryWeek,
  });

  let lowKm = capacity.baseKm * factors.low;
  let highKm = capacity.baseKm * factors.high;

  if (weekType.key === "event" && protectedEventTarget != null) {
    lowKm = numeric(protectedEventTarget);
    highKm = numeric(protectedEventTarget);
  }

  const ceiling = phaseCeiling(capacity, weekType.key);
  if (!["event", "recovery", "taper"].includes(weekType.key)) {
    highKm = Math.min(highKm, ceiling);
    if (numeric(previousWeekKm) > 0 && capacity.lastWeekClass !== "recovery") {
      highKm = Math.min(highKm, numeric(previousWeekKm) * 1.1);
    }
  }
  if (numeric(maxWeeklyKm) > 0) highKm = Math.min(highKm, numeric(maxWeeklyKm));
  lowKm = Math.min(lowKm, highKm);
  lowKm = Math.max(4, lowKm);
  highKm = Math.max(lowKm, highKm);

  const lowRounded = Math.max(4, Math.round(lowKm));
  const highRounded = Math.max(lowRounded, Math.round(highKm));
  const targetKm = Math.round(lowRounded + (highRounded - lowRounded) * factors.position);
  const why = [capacity.summary, goalDemandReason(goalEngine, weekType)];

  if (weekType.key === "recovery") {
    why.push(recoveryReason || (scheduledRecoveryWeek
      ? "Die Belastungswelle sieht nach mehreren Aufbauwochen eine bewusste Verarbeitung vor."
      : "Reviews oder Check-in begrenzen den nächsten Reiz, bevor der Aufbau fortgesetzt wird."));
  } else if (readiness?.notes?.length) {
    why.push(readiness.notes[0]);
  } else {
    why.push("Die aktuellen Reviews enthalten kein kritisches Signal, das den vorgesehenen Entwicklungsschritt blockiert.");
  }

  const corridorLabel = lowRounded === highRounded
    ? `${lowRounded} km`
    : `${lowRounded}–${highRounded} km`;
  const nextStep = weekType.key === "recovery"
    ? "Nach der Entlastung bewertet der Coach die Verarbeitung und kehrt bei stabilen Reviews zur etablierten Basis oder zum nächsten Zielreiz zurück."
    : weekType.key === "taper"
      ? "Die nächste Entscheidung richtet sich nach Frische und Eventnähe, nicht nach fehlenden Kilometern."
      : `Der nächste Wochenblock wird erst nach den Reviews neu festgelegt. ${weekType.key.includes("specific") ? "Zielspezifität hat Vorrang vor blindem Mehrumfang." : "Ein weiterer Aufbau erfolgt nur, wenn die Belastung tatsächlich vertragen wurde."}`;

  return {
    version: 1,
    weekStart,
    weekType,
    targetKm,
    corridor: {
      lowKm: lowRounded,
      highKm: highRounded,
      label: corridorLabel,
    },
    focus: goalFocus(goalEngine, weekType.key),
    why,
    nextStep,
    confidenceText: "Kilometer sind das Ergebnis aus Ziel, Trainingsphase, nachgewiesener Belastbarkeit, Verfügbarkeit und Erholung – keine Zahl, die du selbst erfüllen oder nachholen musst.",
    noDebtText: "Nicht absolvierte Kilometer werden nicht als Schuld auf spätere Einheiten oder den Longrun verschoben.",
    completedHistoryOnly: true,
    capacity,
    goal: {
      id: goalEngine?.target?.id || null,
      name: goalEngine?.target?.name || "",
      discipline: goalEngine?.discipline || "general",
      disciplineLabel: goalEngine?.disciplineLabel || "Allgemeine Ausdauer",
      phaseKey,
      phaseLabel: goalEngine?.phase?.label || "Grundlage",
      daysLeft: numeric(goalEngine?.daysLeft, 9999),
    },
  };
}
