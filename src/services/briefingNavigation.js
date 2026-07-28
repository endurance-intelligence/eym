function validId(value) {
  if (value == null) return "";
  return String(value).trim();
}

export function briefingWorkoutDestination(item = {}) {
  const activityId = validId(item.activityId);
  if (activityId) {
    return {
      pathname: "/training",
      state: { activityId },
    };
  }

  const workoutId = validId(item.planItemId);
  if (workoutId) {
    return {
      pathname: "/planner",
      state: { workoutId },
    };
  }

  return null;
}
