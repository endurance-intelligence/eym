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
});
