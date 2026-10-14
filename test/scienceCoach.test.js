import test from "node:test";
import assert from "node:assert/strict";
import { coachAlternativeFor, currentWeekAssessment, loadBandForRatio } from "../src/services/scienceCoach.js";
import { planPublicationFingerprint } from "../src/services/workoutPublication.js";

test("coach recommends a Zone-2 run instead of a hard track session", () => {
  const alternative = coachAlternativeFor(
    { title: "ORC Track", type: "ORC Track" },
    {
      availableKeys: new Set(["preset:easy-run", "sport:cycling", "preset:rest"]),
      level: "watch",
      ratio: 1.05,
      lowReviews: 0,
      index: 0,
    },
  );

  assert.equal(alternative.key, "preset:easy-run");
  assert.equal(alternative.label, "Lockerer Zone-2-Lauf");
});

test("coach recommends rest when the primary candidate sits in an overloaded week", () => {
  const alternative = coachAlternativeFor(
    { title: "12 km locker", type: "Easy Run" },
    {
      availableKeys: new Set(["preset:easy-run", "sport:cycling", "preset:rest"]),
      level: "adjust",
      ratio: 1.55,
      lowReviews: 0,
      index: 0,
    },
  );

  assert.equal(alternative.key, "preset:rest");
  assert.match(alternative.reason, /deutlich über deinem jüngsten Rahmen/);
});

test("coach only uses replacement sports the athlete has enabled", () => {
  const alternative = coachAlternativeFor(
    { title: "10 km locker", type: "Easy Run" },
    {
      availableKeys: new Set(["sport:mobility", "preset:rest"]),
      level: "watch",
      ratio: 1.05,
      lowReviews: 0,
      index: 1,
    },
  );

  assert.equal(alternative.key, "sport:mobility");
});

test("load bands make the weekly load corridor explicit", () => {
  assert.equal(loadBandForRatio(1.05, true).key, "green");
  assert.equal(loadBandForRatio(1.22, true).key, "upper-green");
  assert.equal(loadBandForRatio(1.4, true).key, "high");
  assert.equal(loadBandForRatio(1.6, true).key, "too-high");
  assert.equal(loadBandForRatio(1, false).key, "open");
});

test("accepted future workload alone does not create coach changes before the week produces evidence", () => {
  const assessment = currentWeekAssessment({
    activities: [
      { id: "baseline-1", startDateLocal: "2026-07-21T18:00:00", name: "10 km locker", type: "Run", duration: 60, distance: 10 },
      { id: "baseline-2", startDateLocal: "2026-07-28T18:00:00", name: "10 km locker", type: "Run", duration: 60, distance: 10 },
    ],
    reviews: {},
    planner: { replacementSports: ["running", "cycling", "mobility"] },
    plan: [
      { id: "fixed-track", date: "2026-08-04", title: "ORC Track", type: "ORC Track", duration: 75, fixed: true, commitmentId: "track" },
      { id: "flex-easy", date: "2026-08-06", title: "8 km locker", type: "Easy Run", duration: 52, distance: 8, fixed: false },
      { id: "flex-stabi", date: "2026-08-07", title: "Stabi & Mobilität", type: "Stabi", duration: 25, fixed: false },
    ],
  }, new Date("2026-08-03T09:00:00"));

  assert.equal(assessment.observedCurrentWeek, false);
  assert.equal(assessment.level, "ok");
  assert.deepEqual(assessment.reasons, []);
  assert.deepEqual(assessment.candidates, []);
});

test("weekly coach adjustments use flexible days after real additional load appears", () => {
  const assessment = currentWeekAssessment({
    activities: [
      { id: "baseline-1", startDateLocal: "2026-07-21T18:00:00", name: "10 km locker", type: "Run", duration: 60, distance: 10 },
      { id: "baseline-2", startDateLocal: "2026-07-28T18:00:00", name: "10 km locker", type: "Run", duration: 60, distance: 10 },
      { id: "extra-football", startDateLocal: "2026-08-03T19:00:00", name: "Fußball", type: "Football", duration: 120, distance: 8 },
    ],
    reviews: {},
    planner: { replacementSports: ["running", "cycling", "mobility"] },
    plan: [
      { id: "fixed-track", date: "2026-08-04", title: "ORC Track", type: "ORC Track", duration: 75, fixed: true, commitmentId: "track" },
      { id: "flex-easy", date: "2026-08-06", title: "8 km locker", type: "Easy Run", duration: 52, distance: 8, fixed: false },
      { id: "flex-stabi", date: "2026-08-07", title: "Stabi & Mobilität", type: "Stabi", duration: 25, fixed: false },
    ],
  }, new Date("2026-08-03T21:00:00"));

  assert.equal(assessment.observedCurrentWeek, true);
  assert.equal(assessment.level, "adjust");
  assert.ok(assessment.planDeltaRatio >= 1.3);
  assert.match(assessment.reasons.join(" "), /reale Zusatzbelastung/);
  assert.equal(assessment.candidates.some((candidate) => candidate.fixed), false);
  assert.deepEqual(
    assessment.candidates.map((candidate) => candidate.id).sort(),
    ["flex-easy", "flex-stabi"].sort(),
  );
  assert.equal(assessment.candidates[0].coachAlternative.key, "preset:rest");
  assert.equal(assessment.candidates[1].coachAlternative.key, "preset:rest");
});


test("an accepted week treats pre-acceptance training and reviews as the baseline", () => {
  const plan = [
    { id: "track", date: "2026-10-13", time: "19:00", title: "ORC Track", type: "ORC Track", duration: 90, distance: 13.6, fixed: true, commitmentId: "track", completed: true },
    { id: "orc-run", date: "2026-10-14", time: "19:00", title: "ORC Run", type: "ORC Run", duration: 62, distance: 10, fixed: true, commitmentId: "orc" },
    { id: "stabi", date: "2026-10-14", title: "Stabi & Mobilität", type: "Stabi", duration: 25, spontaneous: true },
    { id: "long", date: "2026-10-15", title: "24 km locker", type: "Long Run", duration: 154, distance: 24, spontaneous: true },
    { id: "row", date: "2026-10-16", title: "2.500 m Rudern locker", type: "Rudern", duration: 40, spontaneous: true },
    { id: "loop", date: "2026-10-18", title: "3 × 6,3 km · Heartbeat Ultra Fulda", type: "Loop-Training", duration: 150, distance: 18.9, keySession: true, spontaneous: true },
  ];
  const fingerprint = planPublicationFingerprint(plan);
  const state = {
    activities: [
      { id: "baseline-1", startDateLocal: "2026-09-29T18:00:00", name: "10 km locker", type: "Run", duration: 60, distance: 10 },
      { id: "baseline-2", startDateLocal: "2026-10-06T18:00:00", name: "12 km locker", type: "Run", duration: 72, distance: 12 },
      { id: "track-actual", startDateLocal: "2026-10-13T19:00:00", name: "ORC Track", type: "Run", duration: 90, distance: 13.6 },
    ],
    reviews: {
      "track-actual": { legs: 5, energy: 5, rpe: 8, updatedAt: "2026-10-13T21:15:00.000Z" },
    },
    planner: {
      replacementSports: ["running", "cycling", "rowing", "mobility"],
      weekApprovals: {
        "2026-10-12": {
          fingerprint,
          acceptedAt: "2026-10-14T07:10:00.000Z",
        },
      },
    },
    plan,
  };

  const assessment = currentWeekAssessment(state, new Date("2026-10-14T12:00:00"));

  assert.equal(assessment.acceptedPlan, true);
  assert.equal(assessment.hasNewEvidence, false);
  assert.equal(assessment.newReviewCount, 0);
  assert.equal(assessment.level, "ok");
  assert.deepEqual(assessment.reasons, []);
  assert.deepEqual(assessment.candidates, []);
});

test("only a new post-acceptance review can reopen the accepted-week decision", () => {
  const plan = [
    { id: "track", date: "2026-10-13", time: "19:00", title: "ORC Track", type: "ORC Track", duration: 90, distance: 13.6, fixed: true, commitmentId: "track", completed: true },
    { id: "orc-run", date: "2026-10-14", time: "19:00", title: "ORC Run", type: "ORC Run", duration: 62, distance: 10, fixed: true, commitmentId: "orc" },
    { id: "stabi", date: "2026-10-14", title: "Stabi & Mobilität", type: "Stabi", duration: 25, spontaneous: true },
    { id: "long", date: "2026-10-15", title: "24 km locker", type: "Long Run", duration: 154, distance: 24, spontaneous: true },
  ];
  const fingerprint = planPublicationFingerprint(plan);
  const state = {
    activities: [
      { id: "baseline-1", startDateLocal: "2026-09-29T18:00:00", name: "10 km locker", type: "Run", duration: 60, distance: 10 },
      { id: "baseline-2", startDateLocal: "2026-10-06T18:00:00", name: "12 km locker", type: "Run", duration: 72, distance: 12 },
      { id: "track-actual", startDateLocal: "2026-10-13T19:00:00", name: "ORC Track", type: "Run", duration: 90, distance: 13.6 },
    ],
    reviews: {
      "track-actual": { legs: 5, energy: 5, rpe: 8, updatedAt: "2026-10-14T08:00:00.000Z" },
    },
    planner: {
      replacementSports: ["running", "cycling", "rowing", "mobility"],
      weekApprovals: {
        "2026-10-12": {
          fingerprint,
          acceptedAt: "2026-10-14T07:10:00.000Z",
        },
      },
    },
    plan,
  };

  const assessment = currentWeekAssessment(state, new Date("2026-10-14T12:00:00"));

  assert.equal(assessment.acceptedPlan, true);
  assert.equal(assessment.hasNewEvidence, true);
  assert.equal(assessment.newReviewCount, 1);
  assert.equal(assessment.level, "watch");
  assert.match(assessment.reasons.join(" "), /seit der Planannahme/);
  assert.ok(assessment.candidates.length > 0);
});
