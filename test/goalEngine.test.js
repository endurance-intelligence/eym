import test from "node:test";
import assert from "node:assert/strict";
import {
  buildGoalEngine,
  formatGoalDurationInput,
  goalSpecificSession,
  inferGoalDiscipline,
  isBeginnerFiveKGoal,
  parseGoalDurationSeconds,
} from "../src/services/goalEngine.js";
import { generateWeekPlan } from "../src/services/plannerEngine.js";

const baseConfig = {
  targetRunCount: 4,
  recurringCommitments: [],
  fixedAppointments: { football: false, orcRun: false, saturdayMode: "off" },
  stabiCount: 0,
  rowingCount: 0,
  runDays: ["Dienstag", "Donnerstag", "Samstag", "Sonntag"],
  maxLongRun: 30,
};

test("a two-hour half marathon drives pace, abilities, feasibility and phase", () => {
  const engine = buildGoalEngine({
    mission: {
      id: "hm-200",
      name: "Halbmarathon in zwei Stunden",
      date: "2026-11-15",
      targetKm: 21.0975,
      goalType: "time",
      targetTime: "02:00:00",
      goalDiscipline: "half_marathon",
      isMainTarget: true,
    },
    profile: {
      selfReportedRunsPerWeek: 4,
      selfReportedWeeklyKm: 35,
      selfReportedLongestRunKm: 14,
    },
    planner: { targetRunCount: 4 },
    referenceDate: new Date("2026-07-27T12:00:00"),
  });

  assert.equal(engine.discipline, "half_marathon");
  assert.equal(engine.targetPaceLabel, "5:41 min/km");
  assert.equal(engine.phase.key, "build");
  assert.equal(engine.requiredRuns, 4);
  assert.ok(engine.abilities.includes("Halbmarathon-Tempo"));
  assert.equal(engine.feasibility.status, "needs_benchmark");
  assert.equal(engine.workingPaceLabel, "");
});

test("current running performance prevents a blind promise for an unrealistic time target", () => {
  const engine = buildGoalEngine({
    mission: {
      id: "hm-stretch",
      name: "Halbmarathon",
      date: "2026-11-15",
      targetKm: 21.0975,
      goalType: "time",
      targetTime: "02:00:00",
      goalDiscipline: "half_marathon",
      isMainTarget: true,
    },
    activities: [{
      id: "current-10k",
      category: "running",
      type: "Run",
      startDateLocal: "2026-07-20T08:00:00",
      distance: 10,
      durationSeconds: 5100,
    }],
    profile: {
      selfReportedRunsPerWeek: 4,
      selfReportedWeeklyKm: 35,
      selfReportedLongestRunKm: 14,
    },
    planner: { targetRunCount: 4 },
    referenceDate: new Date("2026-07-27T12:00:00"),
  });

  assert.equal(engine.feasibility.status, "stretch");
  assert.equal(engine.feasibility.checkpointNeeded, true);
  assert.ok(engine.workingPaceSeconds > engine.targetPaceSeconds);
  assert.match(engine.feasibility.reasons.join(" "), /Hochrechnung/);
});

test("a first 5k finish uses progressive run-walk instead of speed training", () => {
  const engine = buildGoalEngine({
    mission: {
      id: "first-5k",
      name: "Meine ersten 5 km",
      date: "2026-10-25",
      targetKm: 5,
      goalType: "finish",
      goalDiscipline: "5k",
      isMainTarget: true,
    },
    profile: {
      experienceLevel: "beginner",
      selfReportedRunsPerWeek: 0,
      selfReportedWeeklyKm: 0,
      selfReportedLongestRunKm: 0,
    },
    planner: { targetRunCount: 3 },
    referenceDate: new Date("2026-07-27T12:00:00"),
  });
  const workout = goalSpecificSession(engine, {
    cycle: 2,
    weeklyTarget: 12,
    recoveryWeek: false,
  });

  assert.equal(isBeginnerFiveKGoal(engine), true);
  assert.equal(workout.goalSessionRole, "run_walk_progression");
  assert.match(workout.title, /Run-Walk/);
  assert.doesNotMatch(workout.title, /Intervall|Schwelle/i);
  assert.ok(engine.abilities.includes("Run-Walk-Verträglichkeit"));
  assert.equal(engine.abilities.includes("Schwelle"), false);
});

test("planner makes every beginner 5k run walk-friendly", () => {
  const result = generateWeekPlan({
    mission: {
      id: "first-5k",
      name: "Meine ersten 5 km",
      date: "2026-10-25",
      targetKm: 5,
      goalType: "finish",
      goalDiscipline: "5k",
      preparationStartDate: "2026-07-27",
      isMainTarget: true,
    },
    profile: {
      experienceLevel: "beginner",
      selfReportedRunsPerWeek: 0,
      selfReportedWeeklyKm: 0,
      selfReportedLongestRunKm: 0,
    },
    config: {
      ...baseConfig,
      targetRunCount: 3,
      runDays: ["Dienstag", "Donnerstag", "Sonntag"],
      maxLongRun: 8,
    },
    today: new Date("2026-07-24T12:00:00"),
    offsetWeeks: 1,
  });
  const runs = result.plan.filter((entry) => /run|lauf/i.test(`${entry.type} ${entry.title}`));

  assert.equal(runs.length, 3);
  assert.ok(runs.every((entry) => /run-walk|durchgehend locker/i.test(`${entry.title} ${entry.notes}`)));
  assert.equal(runs.some((entry) => /intervall|schwelle/i.test(`${entry.type} ${entry.title}`)), false);
});

test("half marathon planning adds a checkpoint and a correctly timed long run", () => {
  const result = generateWeekPlan({
    mission: {
      id: "hm-200",
      name: "Halbmarathon in zwei Stunden",
      date: "2026-11-15",
      targetKm: 21.0975,
      goalType: "time",
      targetTime: "02:00:00",
      goalDiscipline: "half_marathon",
      preparationStartDate: "2026-07-27",
      isMainTarget: true,
    },
    profile: {
      experienceLevel: "advanced",
      selfReportedRunsPerWeek: 4,
      selfReportedWeeklyKm: 35,
      selfReportedLongestRunKm: 14,
    },
    config: baseConfig,
    today: new Date("2026-07-24T12:00:00"),
    offsetWeeks: 1,
  });
  const benchmark = result.plan.find((entry) => entry.goalSessionRole === "benchmark");
  const longRun = result.plan.find((entry) => entry.goalSessionRole === "long_run");

  assert.equal(result.goalProfile.targetPaceLabel, "5:41 min/km");
  assert.ok(benchmark);
  assert.ok(longRun);
  assert.notEqual(longRun.duration, 60);
  assert.equal(longRun.duration, 89);
});

test("a 100 km backyard target builds loop and pause abilities without a random speed session", () => {
  const mission = {
    id: "backyard-100",
    name: "Backyard 100 km",
    date: "2026-10-03",
    targetKm: 100,
    goalType: "finish",
    goalDiscipline: "auto",
    courseType: "loop",
    loopKm: 6.706,
    aidStationMode: "every_loop",
    preparationStartDate: "2026-06-01",
    isMainTarget: true,
  };
  const engine = buildGoalEngine({
    mission,
    profile: {
      selfReportedRunsPerWeek: 4,
      selfReportedWeeklyKm: 45,
      selfReportedLongestRunKm: 25,
    },
    planner: { targetRunCount: 4 },
    referenceDate: new Date("2026-07-27T12:00:00"),
  });
  const result = generateWeekPlan({
    mission,
    profile: {
      selfReportedRunsPerWeek: 4,
      selfReportedWeeklyKm: 45,
      selfReportedLongestRunKm: 25,
    },
    config: { ...baseConfig, maxLongRun: 38 },
    today: new Date("2026-07-24T12:00:00"),
    offsetWeeks: 1,
  });

  assert.equal(inferGoalDiscipline(mission), "backyard");
  assert.ok(engine.abilities.includes("wiederholte Runden"));
  assert.ok(engine.abilities.includes("Pausenroutine"));
  assert.equal(result.plan.some((entry) => /intervall|schwelle/i.test(`${entry.type} ${entry.title}`)), false);
  assert.ok(result.plan.some((entry) => ["course_specific_long_run", "long_run"].includes(entry.goalSessionRole)));
});

test("goal durations support ultra targets beyond 24 hours", () => {
  assert.equal(parseGoalDurationSeconds("30:15:00"), 108900);
  assert.equal(formatGoalDurationInput("30:15:00"), "30:15:00");
  assert.equal(parseGoalDurationSeconds("02:75:00"), 0);
});
