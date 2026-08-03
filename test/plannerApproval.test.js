import test from "node:test";
import assert from "node:assert/strict";
import {
  WEEK_APPROVAL_STATES,
  acceptWeekPlan,
  invalidateWeekPlanApproval,
  weekPlanApprovalStatus,
} from "../src/services/plannerApproval.js";

test("a week without a decision is pending", () => {
  assert.equal(
    weekPlanApprovalStatus({}, "2026-08-03", "fingerprint-a"),
    WEEK_APPROVAL_STATES.PENDING,
  );
});

test("an accepted fingerprint marks the week as accepted", () => {
  const approvals = acceptWeekPlan({}, "2026-08-03", "fingerprint-a", "2026-08-03T08:00:00.000Z");
  assert.equal(
    weekPlanApprovalStatus(approvals, "2026-08-03", "fingerprint-a"),
    WEEK_APPROVAL_STATES.ACCEPTED,
  );
  assert.equal(approvals["2026-08-03"].acceptedAt, "2026-08-03T08:00:00.000Z");
});

test("a changed fingerprint requires a new acceptance", () => {
  const approvals = acceptWeekPlan({}, "2026-08-03", "fingerprint-a");
  assert.equal(
    weekPlanApprovalStatus(approvals, "2026-08-03", "fingerprint-b"),
    WEEK_APPROVAL_STATES.CHANGED,
  );
});

test("replanning invalidates only the selected week", () => {
  const approvals = {
    "2026-08-03": { fingerprint: "a", acceptedAt: "one" },
    "2026-08-10": { fingerprint: "b", acceptedAt: "two" },
  };
  const next = invalidateWeekPlanApproval(approvals, "2026-08-03");
  assert.deepEqual(next, {
    "2026-08-10": { fingerprint: "b", acceptedAt: "two" },
  });
  assert.notEqual(next, approvals);
});
