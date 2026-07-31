import { LOOP_MODES, inferLoopMode, parseLoopDurationMinutes } from "./loopWorkout.js";

const DAY_MS = 86400000;

const COURSE_TYPE_LABELS = {
  unspecified: "Noch offen",
  loop: "Rundenkurs",
  out_and_back: "Hin und zurück",
  point_to_point: "A nach B",
};

const LOOP_MODE_LABELS = {
  [LOOP_MODES.FIXED_INTERVAL]: "Fester Starttakt",
  [LOOP_MODES.TIME_LIMIT]: "Gesamtzeitlimit",
  [LOOP_MODES.FREE]: "Freier Rundkurs",
};

const AID_STATION_LABELS = {
  unspecified: "Versorgung noch offen",
  every_loop: "Verpflegung nach jeder Runde",
  fixed_stations: "Feste Verpflegungspunkte",
  self_supported: "Selbstversorgung",
};

const EVENT_POLICIES = {
  A: {
    priority: "A",
    label: "Hauptziel",
    phaseLabel: "Eventwoche · Priorität A",
    hardProtectionDays: 5,
    supplementalShare: 0.18,
    maxSupplementalKm: 10,
    easyRunCapKm: 5,
    maxGeneratedRuns: 1,
  },
  B: {
    priority: "B",
    label: "Wichtiges Zwischenziel",
    phaseLabel: "Eventwoche · Priorität B",
    hardProtectionDays: 4,
    supplementalShare: 0.28,
    maxSupplementalKm: 14,
    easyRunCapKm: 6,
    maxGeneratedRuns: 1,
  },
  C: {
    priority: "C",
    label: "Trainings-/Vorbereitungsevent",
    phaseLabel: "Eventwoche · Priorität C",
    hardProtectionDays: 3,
    supplementalShare: 0.4,
    maxSupplementalKm: 18,
    easyRunCapKm: 8,
    maxGeneratedRuns: 2,
  },
};

function dateAtNoon(value) {
  const date = new Date(`${String(value || "").slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function eventKey(event) {
  return String(event?.id || `${event?.date || ""}:${event?.name || ""}`);
}

export function eventCourseProfile(event = {}) {
  const input = event || {};
  const text = String(input.name || "").toLowerCase();
  const storedLoopKm = Math.max(0, Number(input.loopKm || 0));
  const legacyBackyard = text.includes("backyard");
  const legacyHeartbeat = /heartbeat|fulda/.test(text);
  const explicitLoopKm = legacyHeartbeat && Math.abs(storedLoopKm - 6) < 0.01 ? 6.2 : storedLoopKm;
  const inferredLoopKm = legacyBackyard ? 6.7 : legacyHeartbeat ? 6.2 : 0;
  const storedCourseType = String(input.courseType || "");
  const courseType = COURSE_TYPE_LABELS[storedCourseType]
    ? storedCourseType
    : explicitLoopKm || inferredLoopKm
      ? "loop"
      : "unspecified";
  const storedAidStationMode = String(input.aidStationMode || "");
  const aidStationMode = AID_STATION_LABELS[storedAidStationMode]
    ? storedAidStationMode
    : courseType === "loop" && (legacyBackyard || legacyHeartbeat)
      ? "every_loop"
      : "unspecified";

  const loopMode = courseType === "loop"
    ? inferLoopMode({ ...input, loopMode: input.loopMode || (legacyBackyard ? LOOP_MODES.FIXED_INTERVAL : legacyHeartbeat ? LOOP_MODES.TIME_LIMIT : "") })
    : LOOP_MODES.FREE;
  const loopIntervalMinutes = loopMode === LOOP_MODES.FIXED_INTERVAL
    ? Math.max(10, Number(input.loopIntervalMinutes || 60))
    : 0;
  const eventTimeLimit = loopMode === LOOP_MODES.TIME_LIMIT
    ? String(input.eventTimeLimit || (legacyHeartbeat ? "14:00:00" : ""))
    : "";
  const eventTimeLimitMinutes = parseLoopDurationMinutes(eventTimeLimit);
  const plannedStopMinutes = loopMode === LOOP_MODES.TIME_LIMIT
    ? Math.max(0, Number(input.plannedStopMinutes ?? 3))
    : 0;

  return {
    courseType,
    loopKm: courseType === "loop" ? explicitLoopKm || inferredLoopKm : 0,
    aidStationMode,
    loopMode,
    loopIntervalMinutes,
    eventTimeLimit,
    eventTimeLimitMinutes,
    plannedStopMinutes,
  };
}

export function loopModeLabel(value) {
  return LOOP_MODE_LABELS[value] || LOOP_MODE_LABELS[LOOP_MODES.FREE];
}

export function courseTypeLabel(value) {
  return COURSE_TYPE_LABELS[value] || COURSE_TYPE_LABELS.unspecified;
}

export function aidStationLabel(value) {
  return AID_STATION_LABELS[value] || AID_STATION_LABELS.unspecified;
}

export function eventPriority(event = {}) {
  if (event.isMainTarget) return "A";
  const value = String(event.priority || "").toUpperCase();
  return EVENT_POLICIES[value] ? value : "B";
}

export function missionEvents(mission = {}) {
  const stored = Array.isArray(mission?.milestones) ? mission.milestones : [];
  const values = [...stored];
  if (mission?.name && mission?.date && !values.some((event) => eventKey(event) === eventKey(mission))) {
    values.push({
      ...mission,
      isMainTarget: true,
      priority: "A",
    });
  }

  const seen = new Set();
  return values
    .filter((event) => event?.date && !event.archived)
    .map((event) => {
      const courseProfile = eventCourseProfile(event);
      return {
        ...event,
        ...courseProfile,
        priority: eventPriority(event),
        goalType: event.goalType || (event.targetTime ? "time" : "finish"),
        targetKm: Math.max(0, Number(event.targetKm || 0)),
        time: event.time || "",
      };
    })
    .filter((event) => {
      const key = eventKey(event);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => `${left.date}${left.time || ""}`.localeCompare(`${right.date}${right.time || ""}`));
}

export function selectStrategicTarget(mission = {}, referenceDate = new Date()) {
  const reference = dateAtNoon(referenceDate instanceof Date
    ? `${referenceDate.getFullYear()}-${String(referenceDate.getMonth() + 1).padStart(2, "0")}-${String(referenceDate.getDate()).padStart(2, "0")}`
    : referenceDate);
  const upcoming = missionEvents(mission).filter((event) => {
    const date = dateAtNoon(event.date);
    return date && (!reference || date >= reference);
  });
  const strategic = upcoming.filter((event) => event.priority !== "C");
  return strategic[0] || upcoming[0] || null;
}

export function eventPolicy(priority) {
  return EVENT_POLICIES[eventPriority({ priority })];
}

export function buildEventWeek(mission = {}, weekStart = new Date()) {
  const start = new Date(weekStart);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  const events = missionEvents(mission).filter((event) => {
    const date = dateAtNoon(event.date);
    return date && date >= start && date <= end;
  });
  if (!events.length) return null;

  const primary = [...events].sort((left, right) => {
    const rank = { A: 0, B: 1, C: 2 };
    return rank[left.priority] - rank[right.priority]
      || `${left.date}${left.time || ""}`.localeCompare(`${right.date}${right.time || ""}`);
  })[0];
  const policy = eventPolicy(primary.priority);
  const totalDistanceKm = Number(events.reduce((sum, event) => sum + Number(event.targetKm || 0), 0).toFixed(1));

  return {
    ...policy,
    primary,
    events,
    totalDistanceKm,
    weekStart: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`,
    protectionText: `${policy.hardProtectionDays * 24} Stunden ohne harte Zusatzbelastung vor ${primary.name}`,
  };
}

export function eventDurationMinutes(event = {}) {
  const match = String(event.targetTime || "").match(/^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?$/);
  if (match) {
    const minutes = Number(match[1]) * 60 + Number(match[2]) + Number(match[3] || 0) / 60;
    return Math.max(1, Math.round(minutes));
  }
  const distance = Math.max(0, Number(event.targetKm || 0));
  return distance ? Math.max(20, Math.round(distance * (distance >= 50 ? 8 : 6.2))) : 60;
}

export function eventGoalLabel(event = {}) {
  return {
    finish: "Teilnehmen und schaffen",
    time: event.targetTime ? `Zielzeit ${event.targetTime}` : "Mit Zielzeit absolvieren",
    pb: event.targetTime ? `Bestzeit · Ziel ${event.targetTime}` : "Persönliche Bestzeit",
    distance: "Distanz / Zeit maximieren",
    training: "Vorbereitungs- und Trainingslauf",
  }[event.goalType] || "Event absolvieren";
}

export function eventRelation(date, eventWeek) {
  if (!eventWeek?.events?.length) return null;
  const input = dateAtNoon(date);
  if (!input) return null;
  return eventWeek.events
    .map((event) => {
      const eventDate = dateAtNoon(event.date);
      return {
        event,
        days: eventDate ? Math.round((eventDate - input) / DAY_MS) : 999,
      };
    })
    .sort((left, right) => Math.abs(left.days) - Math.abs(right.days)
      || String(left.event.date).localeCompare(String(right.event.date)))[0];
}
