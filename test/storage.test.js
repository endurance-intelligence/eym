import test from "node:test";
import assert from "node:assert/strict";
import { createStateBackup, parseStateBackup } from "../src/services/storage.js";

const defaults = {
  activities: [], activityGroups: [], plan: [], equipment: [], fuel: [], fuelCatalogExclusions: [], reviews: {}, healthCheckins: [],
  mobilityCoach: { equipment: [], physioExerciseIds: [], focusAreaIds: [], knownExerciseIds: [], history: [] },
  appearance: {}, profile: {}, planner: { fixedAppointments: { football: false, orcRun: false, saturdayMode: "off" } },
  garmin: {}, intervals: {}, mission: { milestones: [] }, calendar: {},
};

test("backup roundtrip keeps relevant athlete data", () => {
  const original = { ...defaults, activities: [{ id: "activity-1", source: "intervals" }], profile: { displayName: "Athlet" } };
  const backup = createStateBackup(original);
  const restored = parseStateBackup(JSON.stringify(backup), defaults);
  assert.equal(restored.state.activities[0].id, "activity-1");
  assert.equal(restored.state.profile.displayName, "Athlet");
  assert.ok(restored.createdAt);
});

test("unrelated JSON is rejected as a backup", () => {
  assert.throws(() => parseStateBackup('{"hello":"world"}', defaults), /keine gültige EYM-Sicherung/);
});
