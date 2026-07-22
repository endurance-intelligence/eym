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
