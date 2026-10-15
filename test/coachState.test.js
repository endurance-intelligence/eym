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

test("watch state does not invent alternatives without a concrete affected workout", () => {
  const state = stateWithRuns();
  state.reviews = {
    recent: { legs: 6, energy: 6, rpe: 5, overallFeeling: 6 },
    previous: { legs: 6, energy: 6, rpe: 5, overallFeeling: 6 },
    older: { legs: 6, energy: 6, rpe: 5, overallFeeling: 6 },
  };

  const result = buildCoachState(state, new Date("2026-08-10T12:00:00"));

  assert.equal(result.level, "watch");
  assert.equal(result.title, "Erholung beobachten – Plan nicht vorschnell ändern");
  assert.equal(result.recommendation.action.label, "Plan ansehen");
  assert.equal(result.recommendation.targetWorkoutId, null);
  assert.match(result.recovery.text, /erst vorgeschlagen/);
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

test("Coach Today starts from the actual planned session and names what to watch", () => {
  const state = stateWithRuns();
  state.plan = [{ id: "today-easy", date: "2026-07-24", title: "10 km locker", type: "Easy Run", distance: 10, duration: 62 }];
  const result = buildCoachState(state, new Date("2026-07-24T12:00:00"));
  assert.equal(result.todaySession.planned, true);
  assert.match(result.todaySession.title, /10 km locker/);
  assert.match(result.todaySession.purpose, /Aerobe Arbeit|locker/i);
  assert.ok(result.todaySession.watch.some((item) => /HF/i.test(item)));
  assert.match(result.todaySession.adjust, /verkürzen|Tempo/i);
});

test("coach feedback can criticise an easy run that was faster and more expensive than planned", () => {
  const state = stateWithRuns();
  state.activities = [
    run("latest-fast", "2026-07-23", { duration: 43, avgHr: 136 }),
    run("cmp-1", "2026-07-20", { avgHr: 122 }),
    run("cmp-2", "2026-07-17", { avgHr: 121 }),
    run("cmp-3", "2026-07-14", { avgHr: 123 }),
  ];
  state.plan = [
    { id: "easy-plan", date: "2026-07-23", title: "8 km locker", type: "Easy Run", distance: 8, duration: 52, matchedActivityId: "latest-fast" },
    { id: "next-key", date: "2026-07-26", title: "Langer spezifischer Reiz", type: "Long Run", distance: 20, keySession: true },
  ];
  state.reviews = { "latest-fast": { legs: 7, energy: 7, rpe: 7, overallFeeling: 7 } };

  const result = buildCoachState(state, new Date("2026-07-24T12:00:00"));
  assert.equal(result.feedback.tone, "watch");
  assert.match(result.feedback.title, /unnötig teuer/i);
  assert.match(result.feedback.text, /statt des vorgesehenen lockeren Korridors/i);
  assert.match(result.feedback.text, /HF rund .* bpm über/i);
  assert.equal(result.feedback.briefing.show, true);
});

test("Today concrete explicitly evaluates heart rate on comparable terrain", () => {
  const state = stateWithRuns();
  state.plan = [{ id: "today-easy-terrain", date: "2026-07-24", title: "10 km locker", type: "Easy Run", distance: 10, duration: 62 }];
  const result = buildCoachState(state, new Date("2026-07-24T12:00:00"));
  assert.ok(result.todaySession.watch.some((item) => /Anstiege|Gefälle/i.test(item)));
  assert.match(result.todaySession.adjust, /vergleichbaren Streckenabschnitten/i);
});
