import test from "node:test";
import assert from "node:assert/strict";
import { migrateConfiguration, normalizeCommitment, sortCommitments } from "../src/services/configuration.js";

test("fresh configuration does not create athlete-specific appointments", () => {
  const state = migrateConfiguration({
    planner: {
      fixedAppointments: { football: false, orcRun: false, saturdayMode: "off" },
      recurringCommitments: [],
    },
  });
  assert.deepEqual(state.planner.recurringCommitments, []);
});

test("arbitrary personal commitments are normalized and preserved", () => {
  const commitment = normalizeCommitment({
    id: "personal-club-session",
    name: "Vereinstraining",
    sport: "cycling",
    weekday: "Donnerstag",
    time: "18:30",
    durationMinutes: 75,
    load: "medium",
    conflictMode: "exclusive",
  });
  const state = migrateConfiguration({ planner: { legacyMigrationComplete: true, recurringCommitments: [commitment] } });
  assert.equal(state.planner.recurringCommitments[0].name, "Vereinstraining");
  assert.equal(state.planner.recurringCommitments[0].conflictMode, "exclusive");
});

test("commitments are ordered by weekday and time", () => {
  const sorted = sortCommitments([
    { id: "late", name: "Spät", weekday: "Freitag", time: "19:00" },
    { id: "early", name: "Früh", weekday: "Montag", time: "07:00" },
    { id: "mid", name: "Mitte", weekday: "Freitag", time: "08:00" },
  ]);
  assert.deepEqual(sorted.map((item) => item.id), ["early", "mid", "late"]);
});
