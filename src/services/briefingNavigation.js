function validId(value) {
  if (value == null) return "";
  return String(value).trim();
}

export function completedActivityDestination(activityId) {
  const validActivityId = validId(activityId);
  if (!validActivityId) return null;
  return {
    pathname: "/training",
    state: { activityId: validActivityId },
  };
}

export function briefingWorkoutDestination(item = {}) {
  const activityDestination = completedActivityDestination(item.activityId);
  if (activityDestination) return activityDestination;

  const workoutId = validId(item.planItemId);
  if (workoutId) {
    return {
      pathname: "/planner",
      state: { workoutId },
    };
  }

  return null;
}
