import test from "node:test";
import assert from "node:assert/strict";
import {
  answerCoachQuestion,
  buildGroundedCoachContext,
  COACH_QUESTION_OPTIONS,
} from "../src/services/coachExplainer.js";

const coach = {
  generatedAt: "2026-07-24T12:00:00.000Z",
  label: "Aufmerksam steuern",
  protectionNote: "Kein Plan wird automatisch geändert.",
  recommendation: {
    id: "coach-test",
    title: "Training kontrolliert fortsetzen",
    text: "Die Reviews zeigen gemischte Erholungswerte.",
  },
  recovery: { label: "Mit Vorsicht", reviewed: 2, legs: "5", energy: "6", rpe: "7" },
  week: { projected: 420, average: 380 },
  goal: { target: { name: "Mein Ultra" }, focus: ["Zeit auf den Beinen", "Fueling"] },
  analytics: {
    trend: { label: "+5 %", text: "Die letzten Wochen blieben im stabilen Umfangsrahmen." },
    specificity: { score: 70, label: "Basis mit Spezifität", text: "Zwei lange Läufe wurden erkannt." },
    confidence: { score: 82, label: "Hohe Datentiefe", text: "Reviews und Herzfrequenz sind überwiegend vorhanden." },
    metrics: {
      runs: 16,
      reviewedRuns: 12,
      stableReviews: 9,
      warningReviews: 3,
      fuelRuns: 4,
      fuelTracked: 3,
      fuelInRange: 2,
      activeWeeks: 7,
      weekCount: 8,
      averageKm: 42.5,
      longestRun: 28,
    },
  },
};

test("coach questions answer only from the supplied fact packet", () => {
  const answer = answerCoachQuestion(coach, "trend");
  assert.match(answer.answer, /42\.5 km pro Woche/);
  assert.match(answer.answer, /28\.0 km/);
  assert.ok(answer.evidence.every((item) => item.source));
  assert.equal(answer.protection, coach.protectionNote);
});

test("grounded coach context forbids invented metrics and autonomous plan changes", () => {
  const context = buildGroundedCoachContext(coach);
  assert.match(context.instruction, /Erfinde keine Messwerte/);
  assert.match(context.instruction, /ändere keinen Trainingsplan/);
  assert.equal(context.recommendationId, "coach-test");
  assert.deepEqual(COACH_QUESTION_OPTIONS.map((option) => option.key), ["why", "trend", "goal", "data"]);
});
