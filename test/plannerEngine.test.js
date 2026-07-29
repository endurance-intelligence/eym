import test from "node:test";
import assert from "node:assert/strict";
import { generateWeekPlan, reviewGuidance } from "../src/services/plannerEngine.js";

test("planner respects a generic stored commitment without personal defaults", () => {
  const future = new Date();
  future.setDate(future.getDate() + 180);
  const result = generateWeekPlan({
    mission: { id: "generic-goal", name: "Ausdauerziel", date: future.toISOString().slice(0, 10), targetKm: 50 },
    offsetWeeks: 1,
    config: {
      recurringCommitments: [{
        id: "personal-club-session",
        name: "Vereinstraining",
        sport: "cycling",
        weekday: "Donnerstag",
        time: "18:30",
        durationMinutes: 75,
        load: "medium",
        conflictMode: "exclusive",
        enabled: true,
      }],
      fixedAppointments: { football: false, orcRun: false, saturdayMode: "off" },
      stabiCount: 0,
      rowingCount: 0,
      runDays: ["Dienstag", "Donnerstag", "Sonntag"],
      maxLongRun: 30,
    },
  });

  const commitment = result.plan.find((item) => item.commitmentId === "personal-club-session");
  assert.ok(commitment);
  assert.equal(commitment.title, "Vereinstraining");
  assert.equal(commitment.fixed, true);
  assert.equal(commitment.conflictMode, "exclusive");
  assert.equal(result.plan.some((item) => ["Fußball", "ORC Run", "ORC Track"].includes(item.title)), false);
});

test("planner uses the supplied reference date and produces stable training content", () => {
  const today = new Date("2026-07-24T12:00:00");
  const input = {
    mission: { id: "generic-goal", name: "50 km Lauf", date: "2026-11-21", targetKm: 50, milestones: [] },
    offsetWeeks: 1,
    today,
    config: {
      recurringCommitments: [],
      fixedAppointments: { football: false, orcRun: false, saturdayMode: "off" },
      stabiCount: 1,
      rowingCount: 0,
      runDays: ["Dienstag", "Donnerstag", "Sonntag"],
      maxLongRun: 30,
    },
  };
  const normalize = (result) => result.plan.map((item) => {
    const comparable = { ...item };
    delete comparable.id;
    return comparable;
  });
  const first = generateWeekPlan(input);
  const second = generateWeekPlan(input);
  assert.equal(first.weekStart, "2026-07-27");
  assert.deepEqual(normalize(first), normalize(second));
  assert.equal(first.plan.some((item) => /ORC|Fußball/.test(`${item.title} ${item.type}`)), false);
  assert.ok(first.plan.length > 0);
  first.plan.forEach((item) => {
    if (item.fixed) {
      assert.equal(item.spontaneous, false);
      assert.match(item.time, /^\d{2}:\d{2}$/);
    } else {
      assert.equal(item.spontaneous, true);
      assert.equal(item.time, "");
    }
  });
});

test("planner creates the configurable 5000 m easy rowing baseline without SPM intervals", () => {
  const result = generateWeekPlan({
    mission: { id: "generic-goal", name: "50 km Lauf", date: "2026-11-21", targetKm: 50, milestones: [] },
    offsetWeeks: 1,
    today: new Date("2026-07-24T12:00:00"),
    config: {
      recurringCommitments: [],
      fixedAppointments: { football: false, orcRun: false, saturdayMode: "off" },
      stabiCount: 0,
      rowingCount: 1,
      rowingDays: ["Freitag"],
      rowingDistanceKm: 5,
      rowingDuration: 35,
      rowingSpmMin: 24,
      rowingSpmMax: 26,
      runDays: ["Dienstag", "Donnerstag", "Sonntag"],
      maxLongRun: 30,
    },
  });

  const rowing = result.plan.find((item) => item.type === "Rudern");
  assert.ok(rowing);
  assert.equal(rowing.distance, 5);
  assert.equal(rowing.duration, 35);
  assert.equal(rowing.rowingTarget.distanceMeters, 5000);
  assert.deepEqual([rowing.rowingTarget.spmMin, rowing.rowingTarget.spmMax], [24, 26]);
  assert.match(rowing.notes, /keine? Pace-Druck|kein Pace-Druck/i);
  assert.doesNotMatch(rowing.notes, /Intervall/i);
});

test("first plan uses the onboarding baseline instead of a generic 25 km minimum", () => {
  const result = generateWeekPlan({
    mission: { id: "", name: "", date: "", targetKm: 0, milestones: [] },
    profile: {
      experienceLevel: "beginner",
      selfReportedRunsPerWeek: 0,
      selfReportedWeeklyKm: 0,
      selfReportedLongestRunKm: 0,
    },
    offsetWeeks: 1,
    today: new Date("2026-07-24T12:00:00"),
    config: {
      targetRunCount: 2,
      recurringCommitments: [],
      fixedAppointments: { football: false, orcRun: false, saturdayMode: "off" },
      stabiCount: 0,
      rowingCount: 0,
      runDays: ["Mittwoch", "Sonntag"],
      maxLongRun: 20,
    },
  });

  const runningKm = result.plan
    .filter((item) => /run|lauf/i.test(`${item.type} ${item.title}`))
    .reduce((sum, item) => sum + Number(item.distance || 0), 0);
  assert.equal(result.target, 8);
  assert.equal(runningKm, 8);
  assert.ok(Math.max(...result.plan.map((item) => Number(item.distance || 0))) <= 4);
});

test("planner uses the weekdays selected during onboarding, including a weekend-only frame", () => {
  const result = generateWeekPlan({
    mission: { id: "", name: "", date: "", targetKm: 0, milestones: [] },
    profile: {
      experienceLevel: "advanced",
      selfReportedRunsPerWeek: 2,
      selfReportedWeeklyKm: 18,
      selfReportedLongestRunKm: 10,
    },
    offsetWeeks: 1,
    today: new Date("2026-07-24T12:00:00"),
    config: {
      targetRunCount: 2,
      recurringCommitments: [],
      fixedAppointments: { football: false, orcRun: false, saturdayMode: "off" },
      stabiCount: 0,
      rowingCount: 0,
      runDays: ["Samstag", "Sonntag"],
      doubleTrainingDays: [],
      maxLongRun: 20,
    },
  });

  const runDays = result.plan
    .filter((item) => /run|lauf/i.test(`${item.type} ${item.title}`))
    .map((item) => item.day)
    .sort();
  assert.deepEqual(runDays, ["Samstag", "Sonntag"]);
});

test("planned runs keep the matching weather snapshot for Fuel Partner guidance", () => {
  const forecast = Array.from({ length: 7 }, (_, index) => {
    const date = new Date("2026-07-27T12:00:00");
    date.setDate(date.getDate() + index);
    return {
      date: date.toISOString().slice(0, 10),
      weatherCode: 1,
      maxTemp: 20 + index,
      minTemp: 12 + index,
      maxGust: 25,
      rainChance: 10,
    };
  });
  const result = generateWeekPlan({
    mission: { id: "goal", name: "50 km Lauf", date: "2026-11-21", targetKm: 50, milestones: [] },
    offsetWeeks: 1,
    today: new Date("2026-07-24T12:00:00"),
    forecast,
    config: {
      recurringCommitments: [],
      fixedAppointments: { football: false, orcRun: false, saturdayMode: "off" },
      stabiCount: 0,
      rowingCount: 0,
      runDays: ["Dienstag", "Donnerstag", "Sonntag"],
      maxLongRun: 30,
    },
  });

  const plannedRun = result.plan.find((item) => /run|lauf/i.test(`${item.type} ${item.title}`));
  assert.ok(plannedRun);
  assert.equal(plannedRun.weatherForecast.date, plannedRun.date);
  assert.equal(
    plannedRun.weatherForecast.maxTemp,
    forecast.find((day) => day.date === plannedRun.date).maxTemp,
  );
});

const goalAwareMission = {
  id: "heartbeat",
  name: "Heartbeat Ultra Fulda",
  date: "2026-11-21",
  time: "06:00",
  targetKm: 112,
  milestones: [
    {
      id: "urlaender",
      name: "7. UrLand-Lauf Oerlinghausen",
      date: "2026-08-21",
      time: "18:00",
      targetKm: 9.6,
      priority: "C",
      goalType: "training",
      elevationGain: 140,
      surface: "mixed",
    },
    {
      id: "backyard",
      name: "Backyard Ultra",
      date: "2026-09-26",
      time: "06:00",
      targetKm: 100,
      priority: "B",
      goalType: "finish",
    },
  ],
};

const goalAwareConfig = {
  recurringCommitments: [
    {
      id: "track",
      name: "ORC Track",
      sport: "running",
      workoutType: "ORC Track",
      weekday: "Dienstag",
      time: "18:30",
      distanceKm: 12,
      durationMinutes: 80,
      load: "high",
      conflictMode: "exclusive",
      enabled: true,
    },
    {
      id: "group-run",
      name: "ORC Run",
      sport: "running",
      workoutType: "ORC Run",
      weekday: "Mittwoch",
      time: "19:00",
      distanceKm: 10,
      durationMinutes: 62,
      load: "low",
      conflictMode: "exclusive",
      enabled: true,
    },
  ],
  fixedAppointments: { football: false, orcRun: false, saturdayMode: "off" },
  targetRunCount: 5,
  stabiCount: 1,
  stabiDays: ["Donnerstag"],
  rowingCount: 0,
  runDays: ["Montag", "Dienstag", "Mittwoch", "Freitag", "Sonntag"],
  maxLongRun: 32,
};

test("a C event is fixed into its week, protects freshness and keeps B as the strategic focus", () => {
  const result = generateWeekPlan({
    mission: goalAwareMission,
    profile: {
      selfReportedRunsPerWeek: 5,
      selfReportedWeeklyKm: 50,
      selfReportedLongestRunKm: 24,
    },
    config: goalAwareConfig,
    today: new Date("2026-08-17T12:00:00"),
  });

  assert.equal(result.planningTarget.id, "backyard");
  assert.equal(result.planningTarget.priority, "B");
  assert.equal(result.eventWeek.priority, "C");
  assert.equal(result.eventWeek.hardProtectionDays, 3);

  const event = result.plan.find((item) => item.raceEvent);
  assert.ok(event);
  assert.equal(event.targetEventId, "urlaender");
  assert.equal(event.date, "2026-08-21");
  assert.equal(event.time, "18:00");
  assert.equal(event.distance, 9.6);
  assert.equal(event.fixed, true);
  assert.equal(event.calendarOnly, true);

  assert.equal(result.plan.some((item) => ["Long Run", "Loop-Training", "Backyard Training"].includes(item.type)), false);
  assert.equal(result.plan.some((item) => ["Schwellenlauf", "Intervalle", "ORC Track"].includes(item.type)), false);
  const protectedTrack = result.plan.find((item) => item.commitmentId === "track");
  assert.equal(protectedTrack.type, "Easy Run");
  assert.equal(protectedTrack.eventProtection, true);
  assert.match(protectedTrack.notes, /keine Intervalle/i);
  const protectedGroupRun = result.plan.find((item) => item.commitmentId === "group-run");
  assert.match(protectedGroupRun.title, /ORC Run/);
  assert.equal(protectedGroupRun.type, "Easy Run");

  const dayBefore = result.plan.filter((item) => item.date === "2026-08-20");
  assert.ok(dayBefore.every((item) => item.type === "Mobility" || item.type === "Ruhetag" || item.optional));
});

test("outside the C event week the planner keeps training toward B without an early C taper", () => {
  const result = generateWeekPlan({
    mission: goalAwareMission,
    profile: {
      selfReportedRunsPerWeek: 5,
      selfReportedWeeklyKm: 50,
      selfReportedLongestRunKm: 24,
    },
    config: goalAwareConfig,
    today: new Date("2026-08-03T12:00:00"),
  });

  assert.equal(result.planningTarget.id, "backyard");
  assert.equal(result.eventWeek, null);
  assert.notEqual(result.phase.key, "taper");
  assert.ok(result.plan.some((item) => item.type === "Long Run" || item.type === "Loop-Training"));
});

test("a B event replaces the long run and is never shrunk below its goal distance", () => {
  const result = generateWeekPlan({
    mission: goalAwareMission,
    profile: {
      selfReportedRunsPerWeek: 5,
      selfReportedWeeklyKm: 50,
      selfReportedLongestRunKm: 30,
    },
    config: goalAwareConfig,
    today: new Date("2026-09-21T12:00:00"),
  });

  const event = result.plan.find((item) => item.targetEventId === "backyard");
  assert.ok(event);
  assert.equal(event.goalPriority, "B");
  assert.equal(event.distance, 100);
  assert.ok(result.target >= 100);
  assert.equal(result.plan.some((item) => ["Long Run", "Loop-Training", "Backyard Training"].includes(item.type)), false);
});

test("a training-like C event does not force a recovery week, while a depleted event does", () => {
  const activity = {
    id: "c-event",
    type: "Run",
    name: "7. UrLand-Lauf Oerlinghausen",
    date: "2026-08-21",
    distance: 9.6,
    duration: 52,
    heartRateZones: { zones: [{ zone: 4, percentage: 45 }] },
  };
  const stable = reviewGuidance([activity], {
    "c-event": {
      isEvent: true,
      eventPriority: "C",
      eventPlanningImpact: "training",
      rpe: 9,
      legs: 8,
      energy: 8,
      overallFeeling: 8,
    },
  }, new Date("2026-08-24T00:00:00"));
  assert.equal(stable.factor, 1);
  assert.equal(stable.hardAllowed, true);
  assert.equal(stable.longRunAllowed, true);
  assert.equal(stable.notes.some((note) => /Event-Review meldet deutliche Erschöpfung/.test(note)), false);

  const depleted = reviewGuidance([activity], {
    "c-event": {
      isEvent: true,
      eventPriority: "C",
      eventPlanningImpact: "depleted",
      rpe: 9,
      legs: 7,
      energy: 7,
      overallFeeling: 6,
    },
  }, new Date("2026-08-24T00:00:00"));
  assert.ok(depleted.factor < 1);
  assert.equal(depleted.hardAllowed, false);
  assert.match(depleted.notes.join(" "), /Event-Review meldet deutliche Erschöpfung/);
});
