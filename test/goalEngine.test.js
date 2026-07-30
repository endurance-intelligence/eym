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

function run(id, date, distance, durationMinutes = distance * 6.5, extra = {}) {
  return {
    id,
    category: "running",
    type: "Run",
    startDateLocal: `${date}T08:00:00`,
    distance,
    durationSeconds: Math.round(durationMinutes * 60),
    ...extra,
  };
}

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

test("an experienced ultra runner receives backyard specialization instead of a false eight-week restart", () => {
  const activities = [
    run("ultra-1", "2025-11-22", 68.5, 590, { name: "Heartbeat Ultra" }),
    run("ultra-2", "2026-04-12", 50, 390, { name: "Frühlingsultra" }),
    run("may-1", "2026-05-03", 18, 125),
    run("may-2", "2026-05-10", 20, 140),
    run("may-3", "2026-05-17", 22, 150),
    run("may-4", "2026-05-24", 24, 165),
    run("may-5", "2026-05-31", 16, 110),
    run("july-1", "2026-07-02", 30, 215, { name: "Longrun" }),
    run("july-2", "2026-07-05", 12, 78),
    run("july-3", "2026-07-09", 28, 195, { name: "Longrun" }),
    run("july-4", "2026-07-12", 14, 90),
    run("july-5", "2026-07-16", 32, 225, { name: "Backyard Loopblock" }),
    run("july-6", "2026-07-19", 16, 105),
    run("july-7", "2026-07-23", 34, 245, { name: "Longrun" }),
    run("july-8", "2026-07-24", 10, 70),
    run("july-9", "2026-07-28", 44, 310, { name: "Backyard Rundenblock" }),
  ];
  const mission = {
    id: "heartbeat",
    name: "Heartbeat Ultra Fulda",
    date: "2026-11-22",
    targetKm: 112,
    preparationStartDate: "2026-04-28",
    milestones: [
      {
        id: "backyard",
        name: "Backyard Ultra 100 km",
        date: "2026-09-26",
        targetKm: 100,
        goalType: "finish",
        goalDiscipline: "backyard",
        priority: "B",
        courseType: "loop",
        loopKm: 6.706,
      },
      {
        id: "heartbeat",
        name: "Heartbeat Ultra Fulda",
        date: "2026-11-22",
        targetKm: 112,
        goalType: "finish",
        goalDiscipline: "ultra",
        isMainTarget: true,
      },
    ],
  };
  const engine = buildGoalEngine({
    mission,
    activities,
    profile: { selfReportedRunsPerWeek: 5, selfReportedWeeklyKm: 45, selfReportedLongestRunKm: 34 },
    planner: { targetRunCount: 5 },
    referenceDate: new Date("2026-07-30T12:00:00"),
  });

  assert.equal(engine.target.id, "backyard");
  assert.equal(engine.experience.ultraDistanceCount, 2);
  assert.equal(engine.experience.longestDistanceKm, 68.5);
  assert.equal(engine.currentForm.status, "stable");
  assert.equal(engine.currentForm.monthlyBest, true);
  assert.equal(engine.preparation.declaredStartDate, "2026-04-28");
  assert.ok(engine.preparation.specificWeeksNeeded <= 8);
  assert.match(engine.preparation.summary, /Spezialisierungszeit/);
  assert.match(engine.preparation.summary, /Heartbeat Ultra Fulda/);
  assert.notEqual(engine.feasibility.status, "stretch");
  assert.doesNotMatch(engine.feasibility.reasons.join(" "), /statt ungefähr 18|gesamte Vorbereitung/i);
});

test("a regular 15 km long runner can transfer the existing base into a half marathon finish", () => {
  const activities = [
    run("w1-a", "2026-06-21", 15, 100),
    run("w1-b", "2026-06-18", 8, 52),
    run("w1-c", "2026-06-16", 7, 46),
    run("w2-a", "2026-06-28", 15, 100),
    run("w2-b", "2026-06-25", 8, 52),
    run("w2-c", "2026-06-23", 7, 46),
    run("w3-a", "2026-07-05", 15, 100),
    run("w3-b", "2026-07-02", 8, 52),
    run("w3-c", "2026-06-30", 7, 46),
    run("w4-a", "2026-07-12", 15, 100),
    run("w4-b", "2026-07-09", 8, 52),
    run("w4-c", "2026-07-07", 7, 46),
    run("w5-a", "2026-07-19", 15, 100),
    run("w5-b", "2026-07-16", 8, 52),
    run("w5-c", "2026-07-14", 7, 46),
    run("w6-a", "2026-07-26", 15, 100),
    run("w6-b", "2026-07-23", 8, 52),
    run("w6-c", "2026-07-21", 7, 46),
  ];
  const engine = buildGoalEngine({
    mission: {
      id: "hm-finish",
      name: "Erster Halbmarathon",
      date: "2026-09-12",
      targetKm: 21.0975,
      goalType: "finish",
      goalDiscipline: "half_marathon",
      isMainTarget: true,
    },
    activities,
    planner: { targetRunCount: 3 },
    referenceDate: new Date("2026-07-30T12:00:00"),
  });

  assert.equal(engine.currentForm.status, "stable");
  assert.ok(engine.preparation.specificWeeksNeeded <= 6);
  assert.notEqual(engine.feasibility.status, "stretch");
  assert.equal(engine.targetGap.distanceGapKm, 6.1);
  assert.match(engine.targetGap.summary, /progressiv/);
});

test("a half marathon time goal keeps the existing distance base but still exposes the pace gap", () => {
  const activities = [
    run("long-1", "2026-07-05", 15, 100),
    run("long-2", "2026-07-19", 15, 100),
    run("current-10k", "2026-07-26", 10, 60, { name: "10 km Trainingslauf" }),
    run("easy-1", "2026-07-09", 8, 52),
    run("easy-2", "2026-07-12", 7, 46),
    run("easy-3", "2026-07-16", 8, 52),
    run("easy-4", "2026-07-23", 7, 46),
  ];
  const engine = buildGoalEngine({
    mission: {
      id: "hm-time",
      name: "Halbmarathon in 1:56",
      date: "2026-10-18",
      targetKm: 21.0975,
      goalType: "time",
      targetTime: "01:56:03",
      goalDiscipline: "half_marathon",
      isMainTarget: true,
    },
    activities,
    profile: { selfReportedRunsPerWeek: 4, selfReportedWeeklyKm: 30, selfReportedLongestRunKm: 15 },
    planner: { targetRunCount: 4 },
    referenceDate: new Date("2026-07-30T12:00:00"),
  });

  assert.equal(engine.targetPaceLabel, "5:30 min/km");
  assert.ok(engine.targetGap.paceGapSeconds > 0);
  assert.ok(engine.workingPaceSeconds > engine.targetPaceSeconds);
  assert.equal(engine.feasibility.checkpointNeeded, true);
  assert.match(engine.targetGap.summary, /Zielpace/);
});

test("old ultra experience remains visible but cannot replace missing current form", () => {
  const engine = buildGoalEngine({
    mission: {
      id: "backyard-return",
      name: "Backyard 100 km",
      date: "2026-09-26",
      targetKm: 100,
      goalType: "finish",
      goalDiscipline: "backyard",
      isMainTarget: true,
    },
    activities: [run("old-ultra", "2023-05-20", 80, 720, { name: "Ultra vor drei Jahren" })],
    planner: { targetRunCount: 4 },
    referenceDate: new Date("2026-07-30T12:00:00"),
  });

  assert.equal(engine.experience.ultraDistanceCount, 1);
  assert.equal(engine.experience.longestDistanceKm, 80);
  assert.equal(engine.currentForm.status, "limited");
  assert.equal(engine.preparation.inheritedFoundation, false);
  assert.doesNotMatch(engine.preparation.summary, /Spezialisierungszeit/);
  assert.equal(engine.feasibility.status, "stretch");
});

test("explicit activity groups count as one historical ultra effort", () => {
  const activities = [
    run("part-1", "2025-10-04", 30, 240),
    run("part-2", "2025-10-04", 25, 220),
  ];
  const engine = buildGoalEngine({
    mission: {
      id: "ultra",
      name: "50 km Ultra",
      date: "2026-11-01",
      targetKm: 50,
      goalType: "finish",
      goalDiscipline: "ultra",
      isMainTarget: true,
    },
    activities,
    activityGroups: [{
      id: "combined-ultra",
      name: "Ultra Gesamteinheit",
      memberActivityIds: ["part-1", "part-2"],
    }],
    referenceDate: new Date("2026-07-30T12:00:00"),
  });

  assert.equal(engine.experience.ultraDistanceCount, 1);
  assert.equal(engine.experience.longestDistanceKm, 55);
});

test("an open backyard mission no longer invents a hidden 100 km target", () => {
  const engine = buildGoalEngine({
    mission: {
      id: "open-backyard",
      name: "Backyard Ultra",
      date: "2026-09-26",
      targetKm: 0,
      goalType: "distance",
      goalDiscipline: "backyard",
      isMainTarget: true,
    },
    profile: { selfReportedRunsPerWeek: 4, selfReportedWeeklyKm: 38, selfReportedLongestRunKm: 20 },
    planner: { targetRunCount: 4 },
    referenceDate: new Date("2026-07-30T12:00:00"),
  });

  assert.equal(engine.targetKm, 0);
  assert.equal(engine.openDistanceGoal, true);
  assert.equal(engine.observed, null);
  assert.equal(engine.feasibility.status, "progressive");
  assert.match(engine.targetGap.summary, /kein 100-km-Ziel/);
});

test("goal durations support ultra targets beyond 24 hours", () => {
  assert.equal(parseGoalDurationSeconds("30:15:00"), 108900);
  assert.equal(formatGoalDurationInput("30:15:00"), "30:15:00");
  assert.equal(parseGoalDurationSeconds("02:75:00"), 0);
});
