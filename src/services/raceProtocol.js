export const RACE_PROTOCOL_MODES = Object.freeze({
  AUTO: "auto",
  ON: "on",
  OFF: "off",
});

export const RACE_PROTOCOL_COMPONENTS = Object.freeze({
  fueling: true,
  hydration: true,
  activation: true,
  warmup: true,
  strides: true,
  calendarReminders: false,
});

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parseClock(value = "") {
  const match = String(value || "").trim().match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match) return null;
  const hours = Number(match[1]);
  if (hours < 0 || hours > 23) return null;
  return hours * 60 + Number(match[2]);
}

function clockFromMinutes(totalMinutes) {
  const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

function beforeStart(startMinutes, leadMinutes) {
  if (startMinutes == null) return "";
  return clockFromMinutes(startMinutes - leadMinutes);
}

function normalizeComponents(input = {}) {
  return Object.fromEntries(Object.entries(RACE_PROTOCOL_COMPONENTS).map(([key, fallback]) => [
    key,
    typeof input?.[key] === "boolean" ? input[key] : fallback,
  ]));
}

export function normalizeRaceProtocolSettings(input = {}) {
  const mode = Object.values(RACE_PROTOCOL_MODES).includes(input?.mode) ? input.mode : RACE_PROTOCOL_MODES.AUTO;
  return {
    mode,
    components: normalizeComponents(input?.components),
  };
}

export function raceProtocolSessionKey(event = {}) {
  const id = String(event?.id || event?.targetEventId || "").trim();
  return id ? `event:${id}` : "";
}

export function raceProtocolSettingsFromSessions(sessions = {}, event = {}) {
  const key = raceProtocolSessionKey(event);
  return normalizeRaceProtocolSettings(key ? sessions?.[key]?.setup?.raceProtocol : null);
}

function protocolRecommendation(event = {}, durationMinutes = 0) {
  const distanceKm = numeric(event.targetKm || event.distance);
  const priority = String(event.priority || event.goalPriority || "B").toUpperCase();
  if (priority === "A" || priority === "B") {
    return {
      variant: "full",
      label: "Race Protocol empfohlen",
      reason: `Priorität ${priority}: Ablauf, Fueling und Warm-up bewusst vorbereiten statt den Renntag dem Zufall zu überlassen.`,
    };
  }
  if (priority === "C" && distanceKm > 0 && distanceKm <= 5.5 && !(durationMinutes >= 45)) {
    return {
      variant: "none",
      label: "Race Protocol nicht nötig",
      reason: "Kurzer C-Wettkampf: im Auto-Modus bleibt der Renntag bewusst schlank. Wenn du mehr Unterstützung möchtest, kannst du Race Protocol jederzeit aktivieren.",
    };
  }
  if (distanceKm >= 8 || durationMinutes >= 45) {
    return {
      variant: "full",
      label: "Race Protocol sinnvoll",
      reason: "Der Wettkampf ist lang bzw. intensiv genug, dass ein geplanter Ablauf vor dem Start zusätzlichen Nutzen bringt.",
    };
  }
  if (distanceKm > 0 || durationMinutes > 0) {
    return {
      variant: "compact",
      label: "Kompaktes Race-Protokoll reicht",
      reason: "Kurzer Wettkampf: kein großer Fueling-Fahrplan nötig. Ein sauberes Warm-up mit kurzen Strides reicht in der Regel aus.",
    };
  }
  return {
    variant: "compact",
    label: "Startdaten noch unvollständig",
    reason: "Ohne Distanz bzw. erwartete Dauer bleibt das Protokoll bewusst kompakt.",
  };
}

function activationDecision({ startMinutes, distanceKm, durationMinutes, variant, dayContext = null }) {
  if (variant !== "full") {
    return { recommended: false, reason: "Für ein kompaktes Kurzrennen ist keine separate Aktivierung Stunden vorher nötig." };
  }
  if (startMinutes == null) {
    return { recommended: false, reason: "Startzeit fehlt – deshalb keine separate Race-Day-Aktivierung einplanen." };
  }
  if (dayContext && (dayContext.status === "blocked" || dayContext.recoveryOnly || dayContext.noRunning || (Number(dayContext.maxDurationMinutes || 0) > 0 && Number(dayContext.maxDurationMinutes) < 30))) {
    return {
      recommended: false,
      reason: `${dayContext.reason || "Der Renntag"} schränkt den Tag bereits ein. Keine separate Aktivierung zusätzlich zur Anreise und zum normalen Warm-up.`,
    };
  }
  if (startMinutes < 11 * 60) {
    return { recommended: false, reason: "Früher Start: keine zusätzliche Morgenaktivierung. Das normale Warm-up vor Ort reicht." };
  }
  if (distanceKm > 15 || durationMinutes > 100) {
    return { recommended: false, reason: "Bei längeren Rennen hat Frische Vorrang; eine zusätzliche Laufeinheit am selben Tag ist nicht nötig." };
  }
  if (startMinutes >= 14 * 60) {
    return { recommended: true, reason: "Später Start und kurzer/intensiver Wettkampf: eine sehr kurze Aktivierung kann optional helfen, ohne Trainingsreiz zu erzeugen." };
  }
  return { recommended: false, reason: "Der Abstand zum Start ist zu klein für einen sinnvollen separaten Priming-Block." };
}

function hydrationReminderMl(profile = {}) {
  const weight = numeric(profile.weightKg);
  if (!(weight > 0)) return 200;
  return clamp(Math.round((weight * 2.5) / 50) * 50, 150, 300);
}

function warmupPrescription(distanceKm, durationMinutes) {
  if ((distanceKm > 0 && distanceKm <= 10.5) || (durationMinutes > 0 && durationMinutes <= 70)) {
    return {
      leadMinutes: 40,
      detail: "12–15 min locker, kurze Mobilität/Lauf-ABC; danach in den Stride-Block übergehen.",
      strideCount: 4,
      strideSeconds: "15–20",
    };
  }
  if ((distanceKm > 0 && distanceKm <= 25) || (durationMinutes > 0 && durationMinutes <= 150)) {
    return {
      leadMinutes: 35,
      detail: "10–12 min locker und mobilisieren; keine Ermüdung erzeugen.",
      strideCount: 3,
      strideSeconds: "15–20",
    };
  }
  return {
    leadMinutes: 25,
    detail: "5–10 min sehr locker bewegen und mobilisieren. Frische hat Vorrang vor zusätzlicher Intensität.",
    strideCount: 0,
    strideSeconds: "",
  };
}

function raceDurationMinutes(event = {}, racePrepPlan = null) {
  const fromPrep = numeric(racePrepPlan?.profile?.durationMinutes);
  if (fromPrep > 0) return fromPrep;
  const direct = numeric(event.duration);
  return direct > 0 ? direct : 0;
}

function calendarItemsFromTimeline(timeline = [], enabled = false) {
  if (!enabled) return [];
  const fueling = timeline.find((item) => item.key === "meal") || timeline.find((item) => item.key === "hydration");
  const warmup = timeline.find((item) => item.key === "warmup");
  return [
    fueling?.time ? {
      key: "fueling",
      time: fueling.time,
      title: "🥣 Pre-Race Fueling starten",
      detail: timeline.filter((item) => ["meal", "hydration"].includes(item.key)).map((item) => `${item.label}: ${item.detail}`).join(" · "),
    } : null,
    warmup?.time ? {
      key: "prep",
      time: warmup.time,
      title: "🏁 Race Prep starten",
      detail: timeline.filter((item) => ["warmup", "strides"].includes(item.key)).map((item) => `${item.label}: ${item.detail}`).join(" · "),
    } : null,
  ].filter(Boolean).slice(0, 2);
}

export function buildRaceProtocol({ event = {}, settings: inputSettings = {}, athleteProfile = {}, racePrepPlan = null, dayContext = null } = {}) {
  const settings = normalizeRaceProtocolSettings(inputSettings);
  const durationMinutes = raceDurationMinutes(event, racePrepPlan);
  const distanceKm = numeric(event.targetKm || event.distance || racePrepPlan?.profile?.distanceKm);
  const startMinutes = parseClock(event.time);
  const recommendation = protocolRecommendation(event, durationMinutes);
  const variant = settings.mode === RACE_PROTOCOL_MODES.OFF
    ? "none"
    : settings.mode === RACE_PROTOCOL_MODES.ON
      ? "full"
      : recommendation.variant;
  const enabled = variant !== "none";
  const components = settings.components;
  const activation = activationDecision({ startMinutes, distanceKm, durationMinutes, variant, dayContext });
  const warmup = warmupPrescription(distanceKm, durationMinutes);
  const drinkMl = hydrationReminderMl(athleteProfile);
  const hydrationProduct = racePrepPlan?.recommendation?.hydrationProduct?.product || "vertrautes Getränk";
  const timeline = [];

  if (enabled && variant === "full" && components.fueling) {
    timeline.push({
      key: "meal",
      label: "Pre-Race Meal",
      time: beforeStart(startMinutes, startMinutes != null && startMinutes >= 14 * 60 ? 210 : 180),
      relative: startMinutes == null ? "ca. 3 h vor Start" : "",
      detail: "Vertraute, gut verträgliche und eher kohlenhydratbetonte Mahlzeit. Keine Experimente am Renntag.",
      optional: false,
    });
  }
  if (enabled && variant === "full" && components.hydration) {
    timeline.push({
      key: "hydration",
      label: "Trink-Reminder",
      time: beforeStart(startMinutes, 90),
      relative: startMinutes == null ? "ca. 90 min vor Start" : "",
      detail: `Ca. ${drinkMl} ml ${hydrationProduct}, sofern du bis dahin normal getrunken hast. Reminder, keine Trinkpflicht.`,
      optional: false,
    });
  }
  if (enabled && components.activation && activation.recommended) {
    timeline.push({
      key: "activation",
      label: "Race-Day Activation",
      time: beforeStart(startMinutes, 180),
      relative: startMinutes == null ? "ca. 3 h vor Start" : "",
      detail: "Optional 8–12 min sehr locker + Mobilität + 2–3 × 10–15 s lockere Strides. Nur wenn du dich danach frischer fühlst.",
      optional: true,
    });
  }
  if (enabled && components.warmup) {
    timeline.push({
      key: "warmup",
      label: "Pre-Race Warm-up",
      time: beforeStart(startMinutes, warmup.leadMinutes),
      relative: startMinutes == null ? `ca. ${warmup.leadMinutes} min vor Start` : "",
      detail: warmup.detail,
      optional: false,
    });
  }
  if (enabled && components.strides && warmup.strideCount > 0) {
    timeline.push({
      key: "strides",
      label: "Strides",
      time: beforeStart(startMinutes, 15),
      relative: startMinutes == null ? "kurz vor dem Start" : "",
      detail: `${warmup.strideCount} × ${warmup.strideSeconds} s kontrolliert zügig, kein Sprint; dazwischen locker zurück in den Rhythmus.`,
      optional: false,
    });
  }
  if (enabled) {
    timeline.push({
      key: "start",
      label: "Start",
      time: event.time || "",
      relative: event.time ? "" : "Startzeit offen",
      detail: event.name || event.title || "Wettkampf",
      optional: false,
    });
  }

  const calendarReminders = Boolean(enabled && components.calendarReminders && startMinutes != null);
  return {
    version: 1,
    settings,
    enabled,
    variant,
    recommendation,
    activationDecision: activation,
    timeline,
    calendarReminders,
    calendarItems: calendarItemsFromTimeline(timeline, calendarReminders),
    hydrationReminderMl: drinkMl,
    startTimeKnown: startMinutes != null,
  };
}
