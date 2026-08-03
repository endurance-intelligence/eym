export const WEEK_APPROVAL_STATES = Object.freeze({
  PENDING: "pending",
  ACCEPTED: "accepted",
  CHANGED: "changed",
});

export function weekPlanApprovalStatus(approvals = {}, weekKey = "", fingerprint = "") {
  const record = approvals?.[weekKey];
  if (!record?.fingerprint || !fingerprint) return WEEK_APPROVAL_STATES.PENDING;
  return record.fingerprint === fingerprint
    ? WEEK_APPROVAL_STATES.ACCEPTED
    : WEEK_APPROVAL_STATES.CHANGED;
}

export function acceptWeekPlan(approvals = {}, weekKey = "", fingerprint = "", acceptedAt = new Date().toISOString()) {
  if (!weekKey || !fingerprint) return { ...(approvals || {}) };
  return {
    ...(approvals || {}),
    [weekKey]: {
      fingerprint,
      acceptedAt,
    },
  };
}

export function invalidateWeekPlanApproval(approvals = {}, weekKey = "") {
  if (!weekKey || !approvals?.[weekKey]) return { ...(approvals || {}) };
  const next = { ...(approvals || {}) };
  delete next[weekKey];
  return next;
}
