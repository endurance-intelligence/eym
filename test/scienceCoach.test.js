import test from "node:test";
import assert from "node:assert/strict";
import { coachAlternativeFor, currentWeekAssessment, loadBandForRatio } from "../src/services/scienceCoach.js";

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
