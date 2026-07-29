import {
  activitiesLikelySame,
  activityDate,
  reviewKind,
} from "./activityUtils.js";

export const LEGACY_REVIEW_TRACKING_START = "2026-07-01";

function localDateKey(date) {
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return "";
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function validDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function hasEstablishedReviewHistory(state = {}) {
  return (state.activities || []).length > 0
    || Object.keys(state.reviews || {}).length > 0
    || (state.plan || []).length > 0
    || state.onboarding?.migratedFromExistingData;
}

function directReviewExists(reviews = {}, id) {
  return Boolean(id != null && reviews?.[id]);
}

function reviewEntriesForTarget(activity, reviews = {}, allActivities = []) {
  const entries = [];
  const seenIds = new Set();
  const add = (id) => {
    const key = String(id ?? "");
    if (!key || seenIds.has(key) || !directReviewExists(reviews, id)) return;
    seenIds.add(key);
    entries.push(reviews[id]);
  };
  add(activity?.id);
  (allActivities || []).forEach((candidate) => {
    if (candidate && activitiesLikelySame(activity, candidate)) add(candidate.id);
  });
  return entries;
}

function aliasReviewExists(activity, reviews = {}, allActivities = []) {
  return (allActivities || []).some((candidate) => (
    candidate
    && String(candidate.id) !== String(activity?.id)
    && directReviewExists(reviews, candidate.id)
    && activitiesLikelySame(activity, candidate)
  ));
}

export function requiresWeeklyReview(activity) {
  const kind = reviewKind(activity);
  if (kind === "endurance") return true;
  if (kind === "strength") return Number(activity?.duration || 0) >= 20;
  return false;
}

export function hasReviewCoverage(activity, reviews = {}, allActivities = []) {
  if (!activity) return false;
  if (directReviewExists(reviews, activity.id)) return true;

  const memberIds = Array.isArray(activity.memberActivityIds) ? activity.memberActivityIds : [];
  if (activity.isActivityGroup && memberIds.length > 0) {
    const byId = new Map((allActivities || []).map((candidate) => [String(candidate.id), candidate]));
    return memberIds.every((memberId) => {
      if (directReviewExists(reviews, memberId)) return true;
      const member = byId.get(String(memberId));
      return Boolean(member && aliasReviewExists(member, reviews, allActivities));
    });
  }

  return aliasReviewExists(activity, reviews, allActivities);
}

export function reviewEntriesForActivity(activity, reviews = {}, allActivities = []) {
  if (!activity) return [];
  if (directReviewExists(reviews, activity.id)) return [reviews[activity.id]];

  const memberIds = Array.isArray(activity.memberActivityIds) ? activity.memberActivityIds : [];
  if (!activity.isActivityGroup || memberIds.length === 0) {
    return reviewEntriesForTarget(activity, reviews, allActivities);
  }

  const byId = new Map((allActivities || []).map((candidate) => [String(candidate.id), candidate]));
  return memberIds.flatMap((memberId) => {
    const member = byId.get(String(memberId));
    if (member) return reviewEntriesForTarget(member, reviews, allActivities);
    return directReviewExists(reviews, memberId) ? [reviews[memberId]] : [];
  });
}

export function reviewTrackingStartDate(state = {}, now = new Date()) {
  const configured = state.profile?.reviewTrackingStartDate;
  if (validDateKey(configured)) return configured;

  const completedAt = String(state.onboarding?.completedAt || "").slice(0, 10);
  if (validDateKey(completedAt) && state.onboarding?.migratedFromExistingData === false) {
    return completedAt;
  }

  return hasEstablishedReviewHistory(state) ? LEGACY_REVIEW_TRACKING_START : localDateKey(now);
}

export function accountReviewTrackingStartDate(state = {}, accountCreatedAt = "", now = new Date()) {
  const configured = state.profile?.reviewTrackingStartDate;
  if (validDateKey(configured)) return configured;
  if (hasEstablishedReviewHistory(state)) return LEGACY_REVIEW_TRACKING_START;

  const registrationDate = localDateKey(accountCreatedAt);
  if (validDateKey(registrationDate)) return registrationDate;
  return localDateKey(now);
}

export function reviewCoverageSummary(
  state = {},
  activities = [],
  { allActivities = activities, now = new Date(), fromDate = "" } = {},
) {
  const trackingStart = reviewTrackingStartDate(state, now);
  const effectiveStart = validDateKey(fromDate) && fromDate > trackingStart ? fromDate : trackingStart;
  const today = localDateKey(now);
  const eligible = (activities || [])
    .filter((activity) => {
      const date = activityDate(activity);
      return requiresWeeklyReview(activity)
        && validDateKey(date)
        && date >= effectiveStart
        && (!today || date <= today);
    })
    .sort((left, right) => activityDate(right).localeCompare(activityDate(left)));
  const reviewed = eligible.filter((activity) => hasReviewCoverage(
    activity,
    state.reviews || {},
    allActivities || [],
  ));
  const missing = eligible.filter((activity) => !hasReviewCoverage(
    activity,
    state.reviews || {},
    allActivities || [],
  ));

  return {
    trackingStart,
    effectiveStart,
    eligible,
    reviewed,
    missing,
    complete: missing.length === 0,
    ratio: eligible.length ? reviewed.length / eligible.length : null,
  };
}

export function planningClosureOffset(offsetWeeks, hasPlan) {
  if (hasPlan || offsetWeeks < 0 || offsetWeeks > 1) return null;
  return offsetWeeks - 1;
}
