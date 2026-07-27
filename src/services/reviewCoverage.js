import { activitiesLikelySame, reviewKind } from "./activityUtils.js";

function directReviewExists(reviews = {}, id) {
  return Boolean(id != null && reviews?.[id]);
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

export function planningClosureOffset(offsetWeeks, hasPlan) {
  if (hasPlan || offsetWeeks < 0 || offsetWeeks > 1) return null;
  return offsetWeeks - 1;
}
