import test from "node:test";
import assert from "node:assert/strict";
import {
  hasReviewCoverage,
  planningClosureOffset,
  requiresWeeklyReview,
} from "../src/services/reviewCoverage.js";

test("weekly gate only requires reviews the training UI can actually collect", () => {
  assert.equal(requiresWeeklyReview({ type: "Run", duration: 45 }), true);
  assert.equal(requiresWeeklyReview({ type: "WeightTraining", duration: 25 }), true);
  assert.equal(requiresWeeklyReview({ type: "Soccer", name: "Fußball", duration: 90 }), false);
  assert.equal(requiresWeeklyReview({ type: "Ride", duration: 90 }), false);
});

test("review on an equivalent provider activity covers the canonical import", () => {
  const garmin = {
    id: "garmin-1",
    source: "garmin",
    type: "Run",
    date: "2026-07-25",
    distance: 10,
    duration: 60,
  };
  const intervals = {
    id: "intervals-1",
    source: "intervals",
    type: "Run",
    date: "2026-07-25",
    distance: 10.1,
    duration: 61,
  };
  assert.equal(hasReviewCoverage(intervals, { [garmin.id]: { legs: 8 } }, [garmin, intervals]), true);
});

test("reviewed members cover a grouped ORC activity", () => {
  const members = [
    { id: "warmup", type: "Run", date: "2026-07-25", distance: 2, duration: 14 },
    { id: "main", type: "Run", date: "2026-07-25", distance: 6, duration: 35 },
    { id: "cooldown", type: "Run", date: "2026-07-25", distance: 1, duration: 7 },
  ];
  const group = {
    id: "orc-group",
    isActivityGroup: true,
    memberActivityIds: members.map((item) => item.id),
  };
  const reviews = Object.fromEntries(members.map((item) => [item.id, { legs: 7 }]));
  assert.equal(hasReviewCoverage(group, reviews, members), true);
  assert.equal(hasReviewCoverage(group, { warmup: { legs: 7 } }, members), false);
});

test("Sunday preview and Monday catch-up use the same closure rule", () => {
  assert.equal(planningClosureOffset(1, false), 0);
  assert.equal(planningClosureOffset(0, false), -1);
  assert.equal(planningClosureOffset(0, true), null);
});
