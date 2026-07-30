import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCoachState,
  recommendationFeedbackEntry,
  recommendationOutcome,
} from "../src/services/coachState.js";

function run(id, date, extras = {}) {
  return {
    id,
    date,
    startDateLocal: `${date}T08:00:00`,
    type: "Run",
    name: "Easy Run",
    distance: 8,
    duration: 50,
    ...extras,
  };
}

function stateWithRuns() {
  return {
    activities: [
      run("recent", "2026-07-23"),
      run("previous", "2026-07-21"),
      run("older", "2026-07-18"),
    ],
    activityGroups: [],
    plan: [],
    reviews: {
      recent: { legs: 3, energy: 3, rpe: 8, overallFeeling: 4 },
      previous: { legs: 4, energy: 4, rpe: 7, overallFeeling: 4 },
      older: { legs: 7, energy: 7, rpe: 5, overallFeeling: 7 },
    },
    mission: {
      id: "goal",
      name: "Ausdauerziel",
      date: "2026-11-21",
      targetKm: 50,
      milestones: [{ id: "goal", name: "Ausdauerziel", date: "2026-11-21", targetKm: 50, isMainTarget: true }],
    },
    profile: {},
    intervals: {},
    mobilityCoach: {},
  };
}

test("unified coach gives recovery warnings precedence over a neutral week", () => {
  const result = buildCoachState(stateWithRuns(), new Date("2026-07-24T12:00:00"));
  assert.equal(result.level, "adjust");
  assert.equal(result.recovery.tone, "bad");
  assert.match(result.protectionNote, /keinen bestehenden Wochenplan automatisch/);
  assert.ok(result.recommendation.evidence.length >= 2);
});

test("watch state offers an explicit optional plan adjustment instead of vague pressure wording", () => {
  const state = stateWithRuns();
  state.reviews = {
    recent: { legs: 6, energy: 6, rpe: 5, overallFeeling: 6 },
    previous: { legs: 6, energy: 6, rpe: 5, overallFeeling: 6 },
    older: { legs: 6, energy: 6, rpe: 5, overallFeeling: 6 },
  };

  const result = buildCoachState(state, new Date("2026-08-10T12:00:00"));

  assert.equal(result.level, "watch");
  assert.equal(result.title, "Plan beibehalten oder eine Einheit anpassen?");
  assert.equal(result.recommendation.action.label, "Coach-Alternativen prüfen");
  assert.match(result.recovery.text, /konkrete Alternative/);
  assert.match(result.recovery.text, /übernehmen oder ändern/);
  assert.doesNotMatch(`${result.title} ${result.recovery.text}`, /Druck|Tempodruck/);
});

test("recommendation feedback is stable and can be linked to the next reviewed run", () => {
  const recommendation = buildCoachState(stateWithRuns(), new Date("2026-07-24T12:00:00")).recommendation;
  const entry = recommendationFeedbackEntry(recommendation, "helpful", new Date("2026-07-24T13:00:00"));
  const next = run("next", "2026-07-25");
  const outcome = recommendationOutcome(entry, [next], { next: { legs: 7, energy: 8 } });
  assert.equal(entry.recommendationId, recommendation.id);
  assert.equal(outcome.status, "stable");
  assert.equal(outcome.activityId, "next");
});
