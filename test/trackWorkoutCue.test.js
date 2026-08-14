import test from "node:test";
import assert from "node:assert/strict";
import { trackStepGarminCue } from "../src/services/trackWorkout.js";

test("distance interval cues stay readable on Garmin without looking like Intervals duration tokens", () => {
  assert.equal(
    trackStepGarminCue({ kind: "work", unit: "distance", value: 600, targetPace: "4:30" }),
    "600er @ 4:30/km",
  );
  assert.equal(
    trackStepGarminCue({ kind: "recovery", unit: "distance", value: 200 }),
    "200er Trab",
  );
});

test("time-based steps use compact Garmin cues", () => {
  assert.equal(
    trackStepGarminCue({ kind: "work", unit: "time", value: 90, targetPace: "4:10" }),
    "Belastung @ 4:10/km",
  );
  assert.equal(
    trackStepGarminCue({ kind: "recovery", unit: "time", value: 60 }),
    "Trabpause",
  );
});
