import test from "node:test";
import assert from "node:assert/strict";
import {
  generateWeekPlan,
  reviewGuidance,
  suggestRoadCyclingAlternative,
} from "../src/services/plannerEngine.js";
import { weeklyContextException } from "../src/services/plannerAvailability.js";

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

test("coach recommends the best Friday-to-Sunday road-bike window only as an alternative", () => {
  const plan = [
    {
      id: "friday-easy",
      day: "Freitag",
      date: "2026-07-31",
      title: "8 km locker",
      type: "Easy Run",
      duration: 52,
      fixed: false,
      weatherForecast: { date: "2026-07-31", weatherCode: 2, maxTemp: 20, maxGust: 29, rainChance: 20 },
    },
    {
      id: "saturday-easy",
      day: "Samstag",
      date: "2026-08-01",
      title: "7 km locker",
      type: "Easy Run",
      duration: 45,
      fixed: false,
      weatherForecast: { date: "2026-08-01", weatherCode: 1, maxTemp: 19, maxGust: 18, rainChance: 5 },
    },
    {
      id: "sunday-long",
      day: "Sonntag",
      date: "2026-08-02",
      title: "18 km Longrun",
      type: "Long Run",
      duration: 120,
      fixed: false,
      keySession: true,
      weatherForecast: { date: "2026-08-02", weatherCode: 0, maxTemp: 18, maxGust: 10, rainChance: 0 },
    },
  ];

  const result = suggestRoadCyclingAlternative(plan, {
    replacementSports: ["running", "cycling"],
    maxOutdoorTemperature: 29,
    maxWindGust: 55,
    checkin: { illness: "healthy" },
  }, { readiness: { hardAllowed: true }, eventWeek: null });

  assert.equal(result.find((item) => item.id === "friday-easy").coachAlternative, undefined);
  const recommendation = result.find((item) => item.id === "saturday-easy").coachAlternative;
  assert.ok(recommendation);
  assert.equal(recommendation.key, "sport:cycling");
  assert.equal(recommendation.source, "weather-cycling");
  assert.match(recommendation.title, /Rennrad locker/);
  assert.match(recommendation.reason, /Samstag/);
  assert.match(recommendation.reason, /bleibt stehen.*bestätigst/i);
  assert.equal(result.find((item) => item.id === "sunday-long").coachAlternative, undefined);
  assert.equal(result.find((item) => item.id === "saturday-easy").type, "Easy Run");
});

test("road-bike weather advice needs an enabled sport, safe weather and an unprotected easy run", () => {
  const base = [{
    id: "weekend-easy",
    day: "Samstag",
    date: "2026-08-01",
    title: "8 km locker",
    type: "Easy Run",
    duration: 50,
    fixed: false,
    weatherForecast: { date: "2026-08-01", weatherCode: 63, maxTemp: 18, maxGust: 16, rainChance: 75 },
  }];
  const withoutCycling = suggestRoadCyclingAlternative(base, {
    replacementSports: ["running"],
  }, { readiness: { hardAllowed: true } });
  assert.equal(withoutCycling[0].coachAlternative, undefined);

  const badWeather = suggestRoadCyclingAlternative(base, {
    replacementSports: ["running", "cycling"],
    checkin: { illness: "healthy" },
  }, { readiness: { hardAllowed: true } });
  assert.equal(badWeather[0].coachAlternative, undefined);

  const protectedRun = suggestRoadCyclingAlternative([{
    ...base[0],
    weatherForecast: { date: "2026-08-01", weatherCode: 1, maxTemp: 19, maxGust: 18, rainChance: 5 },
    eventProtection: true,
  }], {
    replacementSports: ["cycling"],
    checkin: { illness: "healthy" },
  }, { readiness: { hardAllowed: true }, eventWeek: null });
  assert.equal(protectedRun[0].coachAlternative, undefined);
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

function travelEventInput(overrides = {}) {
  const mission = overrides.mission || {
    ...goalAwareMission,
    milestones: goalAwareMission.milestones.map((event) => event.id === "urlaender"
      ? { ...event, targetTime: "00:45:00" }
      : { ...event }),
  };
  const config = {
    recurringCommitments: [{
      id: "football-monday",
      name: "Fußballtraining",
      sport: "football",
      workoutType: "Fußball",
      weekday: "Montag",
      time: "19:00",
      durationMinutes: 90,
      load: "high",
      conflictMode: "exclusive",
      enabled: true,
    }],
    fixedAppointments: { football: false, orcRun: false, saturdayMode: "off" },
    targetRunCount: 5,
    stabiCount: 1,
    stabiDays: ["Dienstag"],
    rowingCount: 0,
    runDays: ["Dienstag", "Mittwoch", "Donnerstag", "Samstag", "Sonntag"],
    doubleTrainingDays: ["Dienstag", "Donnerstag"],
    maxLongRun: 32,
    checkin: {
      energy: 8,
      fatigue: "none",
      illness: "healthy",
      pain: "none",
      painLevel: 0,
      notes: "Dienstag 7–8 Stunden Autofahrt, Training zeitlich nicht möglich. Donnerstag 7–8 Stunden Autofahrt, maximal 15–20 Minuten sehr lockere Aktivierung möglich.",
    },
    ...(overrides.config || {}),
  };
  return {
    mission,
    profile: {
      selfReportedRunsPerWeek: 5,
      selfReportedWeeklyKm: 50,
      selfReportedLongestRunKm: 24,
      ...(overrides.profile || {}),
    },
    activities: overrides.activities || [],
    config,
    raceCoachSessions: overrides.raceCoachSessions || {},
    today: new Date("2026-08-17T12:00:00"),
  };
}

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

  assert.notEqual(result.phase.key, "event");
  assert.equal(result.recoveryWeek, false);
  assert.ok(result.plan.some((item) => ["Long Run", "Loop-Training", "Backyard Training"].includes(item.type)));
  assert.equal(result.plan.some((item) => ["Schwellenlauf", "Intervalle", "ORC Track"].includes(item.type)), false);
  const protectedTrack = result.plan.find((item) => item.commitmentId === "track");
  assert.equal(protectedTrack.type, "Easy Run");
  assert.equal(protectedTrack.eventProtection, true);
  assert.match(protectedTrack.notes, /keine Intervalle/i);
  const protectedGroupRun = result.plan.find((item) => item.commitmentId === "group-run");
  assert.match(protectedGroupRun.title, /ORC Run/);
  assert.equal(protectedGroupRun.type, "Easy Run");

  const dayBefore = result.plan.filter((item) => item.date === "2026-08-20");
  assert.ok(dayBefore.every((item) => item.preRaceActivation || item.type === "Mobility" || item.type === "Ruhetag" || item.optional));
});

test("planning note unavailability overrides an enabled Tuesday run day and double-session setup", () => {
  const result = generateWeekPlan(travelEventInput());
  const tuesday = result.plan.filter((item) => item.date === "2026-08-18");

  assert.equal(tuesday.length, 1);
  assert.equal(tuesday[0].type, "Ruhetag");
  assert.equal(tuesday[0].distance, 0);
  assert.equal(tuesday[0].duration, 0);
  assert.match(tuesday[0].notes, /Training ist an diesem Tag nicht möglich/i);
  assert.equal(result.planningConstraints.find((entry) => entry.date === "2026-08-18")?.status, "blocked");
});

test("structured weekly context constrains the planner without relying on free-text parsing", () => {
  const result = generateWeekPlan(travelEventInput({
    config: {
      checkin: { energy: 8, fatigue: "none", illness: "healthy", pain: "none", painLevel: 0, notes: "" },
      availabilityExceptions: [
        weeklyContextException({ date: "2026-08-18", contextKey: "travel", restriction: "blocked" }),
        weeklyContextException({ date: "2026-08-20", contextKey: "travel", restriction: "recovery", maxDurationMinutes: 20 }),
      ],
    },
  }));
  const tuesday = result.plan.filter((item) => item.date === "2026-08-18");
  const thursday = result.plan.filter((item) => item.date === "2026-08-20");

  assert.equal(tuesday.some((item) => Number(item.distance || 0) > 0), false);
  assert.ok(tuesday.every((item) => item.type === "Ruhetag"));
  assert.equal(thursday.some((item) => Number(item.distance || 0) > 0), false);
  assert.ok(thursday.every((item) => Number(item.duration || 0) <= 20));
  assert.equal(result.plan.find((item) => item.preRaceActivation)?.date, "2026-08-19");
  assert.ok(result.planningConstraints.some((entry) => entry.date === "2026-08-20" && entry.recoveryOnly));
  assert.deepEqual(result.planningConstraintViolations, []);
});

test("a maximum twenty minute travel constraint caps Thursday at recovery activation", () => {
  const result = generateWeekPlan(travelEventInput());
  const thursday = result.plan.filter((item) => item.date === "2026-08-20");

  assert.equal(thursday.length, 1);
  assert.equal(thursday[0].type, "Mobility");
  assert.ok(Number(thursday[0].duration) <= 20);
  assert.equal(Number(thursday[0].distance || 0), 0);
  assert.equal(thursday[0].optional, true);
  assert.doesNotMatch(`${thursday[0].title} ${thursday[0].notes}`, /Intervall|Schwelle|Tempo|ORC Track/i);
});

test("travel immediately before the Friday event moves the pre-race stimulus to Wednesday", () => {
  const result = generateWeekPlan(travelEventInput());
  const activation = result.plan.find((item) => item.preRaceActivation);

  assert.ok(activation);
  assert.equal(activation.date, "2026-08-19");
  assert.equal(activation.type, "Easy Run");
  assert.ok(activation.distance >= 4 && activation.distance <= 8);
  assert.match(activation.notes, /neuromuskuläre Spannung/i);
  assert.match(activation.notes, /RPE 7\/10/i);
  assert.equal(result.plan.some((item) => item.date === "2026-08-20" && /Intervall|Schwelle|Tempo|Track/i.test(`${item.type} ${item.title}`)), false);
});

test("pre-race shake-out stores strides and recovery inside the same structured workout", () => {
  const result = generateWeekPlan(travelEventInput());
  const activation = result.plan.find((item) => item.preRaceActivation);

  assert.ok(activation?.structuredWorkout);
  assert.equal(activation.structuredWorkout.kind, "sprints");
  assert.ok([4, 5, 6].includes(activation.structuredWorkout.rounds));
  assert.deepEqual(activation.structuredWorkout.steps.map((step) => step.kind), ["work", "recovery"]);
  const [stride, recovery] = activation.structuredWorkout.steps;
  assert.equal(stride.unit, "time");
  assert.ok(stride.value >= 15 && stride.value <= 20);
  assert.match(stride.targetPace, /^\d{1,2}:\d{2}$/);
  assert.ok(stride.paceToleranceSeconds >= 15);
  assert.equal(recovery.unit, "time");
  assert.ok(recovery.value >= 60 && recovery.value <= 90);
  assert.match(activation.title, /Strides @ .*\/km/i);
});

test("stride pace is derived from athlete performance when the C event has no target time", () => {
  const mission = {
    ...goalAwareMission,
    milestones: goalAwareMission.milestones.map((event) => ({ ...event, targetTime: "" })),
  };
  const fast = generateWeekPlan(travelEventInput({
    mission,
    activities: [{ id: "fast-5k", date: "2026-08-10", type: "Run", name: "5 km Benchmark", distance: 5, duration: 20, perceivedExertion: 8 }],
  }));
  const slower = generateWeekPlan(travelEventInput({
    mission,
    activities: [{ id: "steady-5k", date: "2026-08-10", type: "Run", name: "5 km Benchmark", distance: 5, duration: 30, perceivedExertion: 8 }],
  }));
  const fastPace = fast.plan.find((item) => item.preRaceActivation)?.structuredWorkout?.steps?.[0]?.targetPace;
  const slowerPace = slower.plan.find((item) => item.preRaceActivation)?.structuredWorkout?.steps?.[0]?.targetPace;

  assert.match(fastPace || "", /^\d{1,2}:\d{2}$/);
  assert.match(slowerPace || "", /^\d{1,2}:\d{2}$/);
  assert.notEqual(fastPace, slowerPace);
});



test("shared travel shorthand cannot leave Tuesday training or the Thursday shake-out behind", () => {
  const result = generateWeekPlan(travelEventInput({
    config: {
      checkin: {
        energy: 8,
        fatigue: "none",
        illness: "healthy",
        pain: "none",
        painLevel: 0,
        notes: "Dienstag und Donnerstag Reisestress",
      },
    },
  }));
  const tuesday = result.plan.filter((item) => item.date === "2026-08-18");
  const thursday = result.plan.filter((item) => item.date === "2026-08-20");
  const activation = result.plan.find((item) => item.preRaceActivation);

  assert.equal(tuesday.some((item) => Number(item.distance || 0) > 0 || /run|lauf|track|intervall|schwelle|tempo/i.test(`${item.type} ${item.title}`)), false);
  assert.ok(tuesday.length <= 1);
  assert.equal(activation?.date, "2026-08-19");
  assert.equal(thursday.some((item) => Number(item.distance || 0) > 0), false);
  assert.ok(thursday.every((item) => Number(item.duration || 0) <= 20));
});

test("Race Strategy target time drives the shake-out stride pace when the mission event has no target time", () => {
  const mission = {
    ...goalAwareMission,
    milestones: goalAwareMission.milestones.map((event) => event.id === "urlaender" ? { ...event, targetTime: "" } : { ...event }),
  };
  const result = generateWeekPlan(travelEventInput({
    mission,
    raceCoachSessions: {
      "event:urlaender": { setup: { targetDurationMinutes: 45 } },
    },
    activities: [
      { id: "track-summary", date: "2026-08-11", type: "Run", name: "ORC Track 8 x 200", distance: 12.7, duration: 77, perceivedExertion: 8 },
    ],
  }));
  const activation = result.plan.find((item) => item.preRaceActivation);
  const stride = activation?.structuredWorkout?.steps?.find((step) => step.kind === "work");

  assert.equal(activation?.date, "2026-08-19");
  assert.equal(stride?.targetPace, "3:57");
  assert.match(activation?.title || "", /3:49–4:05\/km/);
});

test("aggregate track pace is not mistaken for a performance pace when deriving strides", () => {
  const mission = {
    ...goalAwareMission,
    milestones: goalAwareMission.milestones.map((event) => event.id === "urlaender" ? { ...event, targetTime: "" } : { ...event }),
  };
  const result = generateWeekPlan(travelEventInput({
    mission,
    activities: [
      { id: "track-summary", date: "2026-08-11", type: "Run", name: "ORC Track 8 x 200", distance: 12.7, duration: 77, perceivedExertion: 9 },
      { id: "five-k-pb", date: "2026-06-18", type: "Run", name: "5 km PB", distance: 5, duration: 22.5833, perceivedExertion: 9 },
    ],
  }));
  const stride = result.plan.find((item) => item.preRaceActivation)?.structuredWorkout?.steps?.find((step) => step.kind === "work");

  assert.equal(stride?.targetPace, "4:13");
});

test("race day protocol replaces a separate strength or mobility plan item on the race day", () => {
  const result = generateWeekPlan(travelEventInput({
    config: {
      stabiCount: 1,
      stabiDays: ["Freitag"],
    },
  }));
  const friday = result.plan.filter((item) => item.date === "2026-08-21");

  assert.ok(friday.some((item) => item.raceEvent));
  assert.equal(friday.some((item) => /stabi|mobility|mobilität|aktivierung/i.test(`${item.type} ${item.title}`) && !item.raceEvent), false);
});

test("a recovery-only weekly context on race day keeps the fixed race but blocks extra training", () => {
  const result = generateWeekPlan(travelEventInput({
    config: {
      checkin: { energy: 8, fatigue: "none", illness: "healthy", pain: "none", painLevel: 0, notes: "" },
      availabilityExceptions: [
        weeklyContextException({
          date: "2026-08-21",
          contextKey: "travel",
          restriction: "recovery",
          maxDurationMinutes: 20,
        }),
      ],
      stabiCount: 1,
      stabiDays: ["Freitag"],
    },
  }));
  const friday = result.plan.filter((item) => item.date === "2026-08-21");

  assert.equal(friday.filter((item) => item.raceEvent).length, 1);
  assert.equal(friday.some((item) => !item.raceEvent && item.type !== "Ruhetag"), false);
  assert.deepEqual(result.planningConstraintViolations, []);
});

test("C event preserves the Backyard mission and a conditional post-event aerobic block", () => {
  const result = generateWeekPlan(travelEventInput());
  const sunday = result.plan.find((item) => item.date === "2026-08-23" && ["Long Run", "Loop-Training", "Backyard Training"].includes(item.type));

  assert.equal(result.planningTarget.id, "backyard");
  assert.equal(result.eventWeek.priority, "C");
  assert.notEqual(result.phase.key, "event");
  assert.ok(sunday);
  assert.equal(sunday.optional, true);
  assert.match(sunday.notes, /missionsbezogenen Aufbau|Event-Review|Beinen|Energie/i);
});

test("the travel-and-C-event acceptance week counts the race and keeps the actual plan transparent", () => {
  const result = generateWeekPlan(travelEventInput());
  const runningKm = result.plan
    .filter((item) => item.raceEvent || /run|lauf|loop|backyard|wettkampf|race/i.test(`${item.type} ${item.title}`))
    .reduce((sum, item) => sum + Number(item.distance || 0), 0);

  assert.equal(Number(runningKm.toFixed(1)), 30);
  assert.equal(result.weekPrescription.projectedRunningKm, 30);
  assert.equal(result.plan.find((item) => item.raceEvent)?.distance, 9.6);
  assert.match(result.weekPrescription.deliveryNote, /keine Kilometerschuld/i);
});

test("an irrelevant planning note leaves an otherwise normal week unchanged", () => {
  const input = {
    mission: { id: "goal", name: "50 km Lauf", date: "2026-11-21", targetKm: 50, milestones: [] },
    profile: { selfReportedRunsPerWeek: 4, selfReportedWeeklyKm: 40, selfReportedLongestRunKm: 22 },
    offsetWeeks: 1,
    today: new Date("2026-07-24T12:00:00"),
    config: {
      recurringCommitments: [],
      fixedAppointments: { football: false, orcRun: false, saturdayMode: "off" },
      targetRunCount: 4,
      stabiCount: 1,
      rowingCount: 0,
      runDays: ["Dienstag", "Donnerstag", "Samstag", "Sonntag"],
      maxLongRun: 30,
    },
  };
  const clean = generateWeekPlan(input);
  const withNote = generateWeekPlan({ ...input, config: { ...input.config, checkin: { notes: "Diese Woche fühlt sich normal an." } } });
  const comparable = (plan) => plan.map((item) => { const copy = { ...item }; delete copy.id; return copy; });

  assert.deepEqual(comparable(withNote.plan), comparable(clean.plan));
  assert.deepEqual(withNote.planningConstraints, []);
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

test("generated Backyard blocks preserve exact decimal loop distance and the full start interval", () => {
  const result = generateWeekPlan({
    mission: goalAwareMission,
    profile: {
      selfReportedRunsPerWeek: 5,
      selfReportedWeeklyKm: 50,
      selfReportedLongestRunKm: 24,
    },
    config: goalAwareConfig,
    today: new Date("2026-08-10T12:00:00"),
  });

  const loop = result.plan.find((item) => item.type === "Loop-Training");
  assert.ok(loop);
  assert.equal(loop.loopTraining.mode, "fixed_interval");
  assert.equal(loop.loopTraining.controlMode, "manual_lap");
  assert.equal(loop.loopTraining.paceMode, "none");
  assert.equal(loop.distance, Number((loop.loopTraining.loops * 6.7).toFixed(1)));
  assert.equal(loop.duration, loop.loopTraining.loops * 60);
  assert.match(loop.title, new RegExp(`^${loop.loopTraining.loops} × 6,7 km`));
});

test("an explicit B-priority loop course creates a loop workout without relying on its name", () => {
  const result = generateWeekPlan({
    mission: {
      id: "main",
      name: "Späteres Hauptziel",
      date: "2026-11-21",
      targetKm: 80,
      milestones: [
        {
          id: "custom-loop",
          name: "Herbst-Challenge",
          date: "2026-09-20",
          targetKm: 60,
          priority: "B",
          courseType: "loop",
          loopKm: 5,
          aidStationMode: "fixed_stations",
        },
        {
          id: "main",
          name: "Späteres Hauptziel",
          date: "2026-11-21",
          targetKm: 80,
          priority: "A",
          isMainTarget: true,
        },
      ],
    },
    profile: {
      selfReportedRunsPerWeek: 5,
      selfReportedWeeklyKm: 50,
      selfReportedLongestRunKm: 24,
    },
    config: goalAwareConfig,
    today: new Date("2026-08-10T12:00:00"),
  });

  const loop = result.plan.find((item) => item.type === "Loop-Training");
  assert.ok(loop);
  assert.equal(result.planningTarget.id, "custom-loop");
  assert.equal(result.planningTarget.courseType, "loop");
  assert.equal(result.planningTarget.loopKm, 5);
  assert.equal(loop.loopTraining.loopKm, 5);
  assert.match(loop.title, /^\d+ × 5 km · Herbst-Challenge$/);
  assert.match(loop.notes, /Abstände der Verpflegungspunkte/);
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

test("fatigue keeps the football title unchanged and offers recovery separately", () => {
  const result = generateWeekPlan({
    mission: { id: "goal", name: "50 km Lauf", date: "2026-11-21", targetKm: 50, milestones: [] },
    profile: { selfReportedRunsPerWeek: 4, selfReportedWeeklyKm: 42, selfReportedLongestRunKm: 24 },
    offsetWeeks: 1,
    today: new Date("2026-07-27T12:00:00"),
    config: {
      checkin: { energy: 2, fatigue: "worse", illness: "healthy", pain: "none", painLevel: 0 },
      recurringCommitments: [{
        id: "football-monday",
        name: "Fußball",
        sport: "football",
        weekday: "Montag",
        time: "19:00",
        durationMinutes: 90,
        load: "high",
        conflictMode: "exclusive",
        enabled: true,
      }],
      fixedAppointments: { football: false, orcRun: false, saturdayMode: "off" },
      targetRunCount: 4,
      stabiCount: 0,
      rowingCount: 0,
      runDays: ["Dienstag", "Donnerstag", "Sonntag"],
      maxLongRun: 30,
    },
  });

  const football = result.plan.find((item) => item.commitmentId === "football-monday");
  assert.ok(football);
  assert.equal(football.title, "Fußball");
  assert.equal(football.optional, true);
  assert.equal(football.readinessRestricted, true);
  assert.doesNotMatch(football.title, /nur bei guten Beinen/i);
  assert.match(football.notes, /Ruhetag/);
});

test("double-training permission does not add an easy run to a hard ORC Track day", () => {
  const result = generateWeekPlan({
    mission: { id: "backyard", name: "Backyard Ultra", date: "2026-09-26", targetKm: 100, priority: "B", goalType: "finish", milestones: [] },
    profile: { selfReportedRunsPerWeek: 5, selfReportedWeeklyKm: 46, selfReportedLongestRunKm: 30 },
    offsetWeeks: 1,
    today: new Date("2026-07-27T12:00:00"),
    config: {
      checkin: { energy: 4, fatigue: "better", illness: "healthy", pain: "none", painLevel: 0 },
      recurringCommitments: [{
        id: "orc-track-tuesday",
        name: "ORC Track",
        sport: "running",
        workoutType: "ORC Track",
        weekday: "Dienstag",
        time: "19:00",
        distanceKm: 8,
        durationMinutes: 60,
        load: "high",
        conflictMode: "exclusive",
        enabled: true,
      }],
      fixedAppointments: { football: false, orcRun: false, saturdayMode: "off" },
      targetRunCount: 5,
      stabiCount: 1,
      stabiDays: ["Dienstag"],
      rowingCount: 0,
      runDays: ["Dienstag", "Donnerstag", "Freitag", "Sonntag"],
      doubleTrainingDays: ["Dienstag"],
      maxLongRun: 32,
    },
  });

  const tuesdayRuns = result.plan.filter((item) => item.day === "Dienstag" && /run|lauf|track|intervall|schwelle|tempo|backyard/i.test(`${item.type} ${item.title}`));
  assert.equal(tuesdayRuns.length, 1);
  assert.equal(tuesdayRuns[0].commitmentId, "orc-track-tuesday");
  assert.equal(result.plan.some((item) => item.day === "Dienstag" && item.type === "Easy Run"), false);
  assert.ok(result.plan.some((item) => ["Donnerstag", "Freitag"].includes(item.day) && item.type === "Easy Run"));
});

test("planner stores a readable reason for the current loop-training decision", () => {
  const result = generateWeekPlan({
    mission: { id: "backyard", name: "Backyard Ultra", date: "2026-09-26", targetKm: 100, priority: "B", goalType: "finish", loopKm: 6.7, loopMode: "clocked_loop", milestones: [] },
    profile: { selfReportedRunsPerWeek: 5, selfReportedWeeklyKm: 46, selfReportedLongestRunKm: 30 },
    offsetWeeks: 1,
    today: new Date("2026-07-27T12:00:00"),
    config: {
      recurringCommitments: [],
      fixedAppointments: { football: false, orcRun: false, saturdayMode: "off" },
      targetRunCount: 5,
      stabiCount: 0,
      rowingCount: 0,
      runDays: ["Dienstag", "Donnerstag", "Freitag", "Sonntag"],
      maxLongRun: 32,
    },
  });

  assert.equal(typeof result.loopDecision.reason, "string");
  assert.ok(result.loopDecision.reason.length > 20);
  assert.equal(typeof result.loopDecision.scheduled, "boolean");
});

test("a deliberately blocked family day stays free during replanning", () => {
  const result = generateWeekPlan({
    mission: { id: "goal", name: "50 km Lauf", date: "2026-11-21", targetKm: 50, milestones: [] },
    profile: { selfReportedRunsPerWeek: 4, selfReportedWeeklyKm: 40, selfReportedLongestRunKm: 24 },
    offsetWeeks: 0,
    today: new Date("2026-08-05T12:00:00"),
    planHistory: [{
      id: "cancelled-saturday",
      date: "2026-08-08",
      title: "8 km locker",
      type: "Easy Run",
      plannedCancellation: true,
      missedReason: "Keine Zeit",
      missedNote: "Familienausflug",
      missedMeta: { plannedCancellation: true, blockDay: true },
    }],
    config: {
      recurringCommitments: [],
      fixedAppointments: { football: false, orcRun: false, saturdayMode: "off" },
      targetRunCount: 4,
      stabiCount: 0,
      rowingCount: 0,
      runDays: ["Donnerstag", "Samstag", "Sonntag"],
      maxLongRun: 30,
      checkin: { energy: 7, fatigue: "none", illness: "healthy", pain: "none", painLevel: 0 },
    },
  });

  assert.deepEqual(result.blockedDates, ["2026-08-08"]);
  assert.equal(result.plan.some((item) => item.date === "2026-08-08"), false);
  assert.ok(result.plan.some((item) => item.date === "2026-08-09"));
});

test("planner keeps one-time unavailable dates free without creating kilometer debt", () => {
  const result = generateWeekPlan({
    mission: { id: "goal", name: "50 km Lauf", date: "2026-11-21", targetKm: 50, milestones: [] },
    offsetWeeks: 1,
    today: new Date("2026-07-24T12:00:00"),
    config: {
      recurringCommitments: [{
        id: "orc-track",
        name: "ORC Track",
        sport: "running",
        workoutType: "ORC Track",
        weekday: "Samstag",
        time: "09:00",
        durationMinutes: 60,
        load: "high",
        conflictMode: "replace",
        enabled: true,
      }],
      availabilityExceptions: [{
        id: "family-day",
        date: "2026-08-01",
        status: "blocked",
        reason: "Familie",
      }],
      fixedAppointments: { football: false, orcRun: false, saturdayMode: "off" },
      targetRunCount: 3,
      stabiCount: 1,
      stabiDays: ["Samstag"],
      rowingCount: 1,
      rowingDays: ["Samstag"],
      runDays: ["Dienstag", "Donnerstag", "Samstag", "Sonntag"],
      maxLongRun: 30,
    },
  });

  assert.equal(result.plan.some((item) => item.date === "2026-08-01"), false);
  assert.deepEqual(result.availabilityBlockedDates, ["2026-08-01"]);
  assert.equal(result.blockedDates.includes("2026-08-01"), true);
  assert.equal(result.plan.some((item) => item.type === "Long Run" && item.day === "Sonntag"), true);
});

test("natural long-car-travel wording cannot leave an easy run, strength session or Thursday shake-out", () => {
  const result = generateWeekPlan(travelEventInput({
    config: {
      checkin: {
        energy: 8,
        fatigue: "none",
        illness: "healthy",
        pain: "none",
        painLevel: 0,
        notes: "Dienstag und Donnerstag 7–8 Stunden Auto fahren, da ich beruflich in die Schweiz muss.",
      },
    },
  }));
  const tuesday = result.plan.filter((item) => item.date === "2026-08-18");
  const thursday = result.plan.filter((item) => item.date === "2026-08-20");
  const activation = result.plan.find((item) => item.preRaceActivation);

  assert.equal(tuesday.some((item) => Number(item.distance || 0) > 0 || /run|lauf|track|intervall|schwelle|tempo/i.test(`${item.type} ${item.title}`)), false);
  assert.ok(tuesday.length <= 1);
  assert.equal(activation?.date, "2026-08-19");
  assert.equal(thursday.some((item) => Number(item.distance || 0) > 0), false);
  assert.ok(thursday.every((item) => Number(item.duration || 0) <= 20));
  assert.deepEqual(result.planningConstraintViolations, []);
});
