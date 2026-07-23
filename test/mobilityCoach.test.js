import test from "node:test";
import assert from "node:assert/strict";
import {
  activeMobilityOverride,
  mobilityCoachSuggestion,
  mobilityOverrideExpiry,
} from "../src/services/mobilityCoach.js";

const run = (id, date, distance = 8) => ({
  id,
  type: "Run",
  startDateLocal: `${date}T18:00:00`,
  distance,
});

test("coach suggests active recovery after recent back-to-back running", () => {
  const suggestion = mobilityCoachSuggestion([
    run("r1", "2026-07-20"),
    run("r2", "2026-07-21"),
    run("r3", "2026-07-23"),
  ], {}, new Date("2026-07-23T20:00:00"));

  assert.equal(suggestion.id.startsWith("back-to-back-"), true);
  assert.deepEqual(suggestion.focusAreaIds, ["mobility", "hips", "ankle"]);
  assert.equal(suggestion.condition, "tired");
});

test("coach prioritizes recovery warnings over the general run-frequency signal", () => {
  const activities = [
    run("r1", "2026-07-18"),
    run("r2", "2026-07-20"),
    run("r3", "2026-07-22"),
    run("r4", "2026-07-23"),
  ];
  const suggestion = mobilityCoachSuggestion(activities, {
    r1: { legs: 4, energy: 6 },
    r3: { legs: 6, energy: 5 },
  }, new Date("2026-07-23T20:00:00"));

  assert.equal(suggestion.id.startsWith("recovery-"), true);
  assert.match(suggestion.reason, /müde Beine|niedrige Energie/);
});

test("weekly override expires on Sunday and is ignored afterwards", () => {
  const now = new Date("2026-07-23T12:00:00");
  const expiresOn = mobilityOverrideExpiry(now);
  const override = {
    id: "back-to-back-2026-07-23",
    focusAreaIds: ["mobility", "hips", "ankle"],
    expiresOn,
  };

  assert.equal(expiresOn, "2026-07-26");
  assert.equal(activeMobilityOverride(override, new Date("2026-07-26T18:00:00"))?.id, override.id);
  assert.equal(activeMobilityOverride(override, new Date("2026-07-27T08:00:00")), null);
});
