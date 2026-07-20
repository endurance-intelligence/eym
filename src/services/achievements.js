import { activityDate, durationClock, isRunningActivity } from "./activityUtils";

const KNOWN_EVENTS = [
  { pattern: /baukastenlauf/i, title: "Baukastenlauf" },
  { pattern: /hermannslauf/i, title: "Hermannslauf" },
  { pattern: /isselhorster nacht/i, title: "Isselhorster Nacht" },
];


export function eventTitleFor(activity, review) {
  if (review?.eventTitle?.trim()) return review.eventTitle.trim();
  const name = String(activity?.name || "");
  const known = KNOWN_EVENTS.find((event) => event.pattern.test(name));
  return known?.title || name || "Offizieller Lauf";
}

export function isOfficialEvent(activity, review) {
  if (!isRunningActivity(activity)) return false;
  if (review?.isEvent) return true;
  if (Number(activity?.eventTypeId) === 1 || activity?.officialEvent) return true;
  return KNOWN_EVENTS.some((event) => event.pattern.test(String(activity?.name || "")));
}

export function deriveAchievements(activities = [], reviews = {}) {
  return activities
    .filter((activity) => isOfficialEvent(activity, reviews[activity.id]))
    .map((activity) => {
      const review = reviews[activity.id] || {};
      return {
        id: `achievement-${activity.id}`,
        activityId: activity.id,
        title: eventTitleFor(activity, review),
        originalTitle: activity.name,
        date: activityDate(activity),
        distance: Number(activity.distance || 0),
        duration: durationClock(activity),
        location: activity.location || "",
        category: review.eventCategory || "Offizieller Lauf",
        spontaneous: Boolean(review.isEvent && Number(activity?.eventTypeId) !== 1),
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}
