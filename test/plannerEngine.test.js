import test from "node:test";
import assert from "node:assert/strict";
import { generateWeekPlan } from "../src/services/plannerEngine.js";

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
