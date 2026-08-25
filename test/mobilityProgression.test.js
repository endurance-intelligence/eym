import test from "node:test";
import assert from "node:assert/strict";
import {
  mobilityExercisePrescription,
  mobilityProgressionHistory,
} from "../src/services/mobilityProgression.js";

const pushUp = {
  id: "push-up",
  doseMode: "reps",
  baseReps: 5,
  repsStep: 1,
  maxSingleSetReps: 10,
  secondsPerRep: 3,
};

function goodHistory(count) {
  return Array.from({ length: count }, (_, index) => ({
    completedAt: `2026-08-${String(24 - index).padStart(2, "0")}T18:00:00.000Z`,
    exerciseIds: ["push-up"],
    fitScore: 8,
    painReported: false,
  }));
}

test("basic strength progression starts small and only increases after two good completions", () => {
  assert.equal(mobilityExercisePrescription(pushUp, []).label, "5 Wdh.");
  assert.equal(mobilityExercisePrescription(pushUp, goodHistory(1)).label, "5 Wdh.");
  assert.equal(mobilityExercisePrescription(pushUp, goodHistory(2)).label, "6 Wdh.");
  assert.equal(mobilityExercisePrescription(pushUp, goodHistory(4)).label, "7 Wdh.");
  assert.equal(mobilityExercisePrescription(pushUp, goodHistory(10)).label, "10 Wdh.");
  assert.equal(mobilityExercisePrescription(pushUp, goodHistory(12)).label, "2 × 6");
});

test("pain or a poor latest response prevents an automatic increase", () => {
  const history = [
    { completedAt: "2026-08-24T18:00:00.000Z", exerciseIds: ["push-up"], fitScore: 3, painReported: true, painExerciseIds: ["push-up"] },
    ...goodHistory(4),
  ];
  const prescription = mobilityExercisePrescription(pushUp, history);
  assert.equal(prescription.label, "6 Wdh.");
  assert.match(prescription.progressionReason, /reduziert/);
  assert.equal(mobilityProgressionHistory(history, "push-up").recentPoor, true);
});
