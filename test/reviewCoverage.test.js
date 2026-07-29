import test from "node:test";
import assert from "node:assert/strict";
import {
  accountReviewTrackingStartDate,
  hasReviewCoverage,
  planningClosureOffset,
  reviewCoverageSummary,
  reviewEntriesForActivity,
  reviewTrackingStartDate,
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
  assert.deepEqual(reviewEntriesForActivity(intervals, { [garmin.id]: { legs: 8 } }, [garmin, intervals]), [{ legs: 8 }]);
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
  assert.equal(reviewEntriesForActivity(group, reviews, members).length, 3);
});

test("Sunday preview and Monday catch-up use the same closure rule", () => {
  assert.equal(planningClosureOffset(1, false), 0);
  assert.equal(planningClosureOffset(0, false), -1);
  assert.equal(planningClosureOffset(0, true), null);
});

test("legacy review coverage starts in July and reports only genuinely missing reviews", () => {
  const june = { id: "june", type: "Run", date: "2026-06-30", distance: 8, duration: 48 };
  const reviewed = { id: "reviewed", type: "Run", date: "2026-07-02", distance: 10, duration: 60 };
  const alias = { id: "alias", source: "garmin", type: "Run", date: "2026-07-02", distance: 10.1, duration: 61 };
  const missing = { id: "missing", type: "Run", date: "2026-07-08", distance: 12, duration: 72 };
  const state = {
    activities: [june, reviewed, alias, missing],
    reviews: { reviewed: { legs: 8 } },
    profile: {},
    onboarding: { migratedFromExistingData: true },
  };

  const summary = reviewCoverageSummary(state, [june, alias, missing], {
    allActivities: state.activities,
    now: new Date("2026-07-29T12:00:00"),
  });

  assert.equal(summary.trackingStart, "2026-07-01");
  assert.equal(summary.eligible.length, 2);
  assert.equal(summary.reviewed.length, 1);
  assert.deepEqual(summary.missing.map((activity) => activity.id), ["missing"]);
});

test("new athletes start review tracking when onboarding is completed", () => {
  const state = {
    profile: {},
    activities: [],
    reviews: {},
    plan: [],
    onboarding: {
      completedAt: "2026-08-04T08:30:00.000Z",
      migratedFromExistingData: false,
    },
  };
  assert.equal(reviewTrackingStartDate(state, new Date("2026-08-05T12:00:00")), "2026-08-04");
});

test("new accounts use their registration day while existing app users keep the July migration boundary", () => {
  const registration = "2026-09-12T07:45:00.000Z";
  assert.equal(accountReviewTrackingStartDate({
    profile: {},
    activities: [],
    reviews: {},
    plan: [],
    onboarding: { status: "pending" },
  }, registration), "2026-09-12");

  assert.equal(accountReviewTrackingStartDate({
    profile: {},
    activities: [{ id: "legacy-run" }],
    reviews: {},
    plan: [],
  }, registration), "2026-07-01");
});
