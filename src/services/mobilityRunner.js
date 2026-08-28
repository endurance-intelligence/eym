function normalizedSideIndex(value) {
  return Number(value) === 1 ? 1 : 0;
}

export function sideOrder(weakSide) {
  if (weakSide === "right") return ["Rechte Seite", "Linke Seite"];
  return ["Linke Seite", "Rechte Seite"];
}

export function sideWorkSeconds(item, sideIndex = 0) {
  const totalSeconds = Math.max(0, Number(item?.seconds || 0));
  if (!item?.sideSwitch) return totalSeconds;
  const firstSideSeconds = Math.ceil(totalSeconds / 2);
  return normalizedSideIndex(sideIndex) === 0
    ? firstSideSeconds
    : Math.max(0, totalSeconds - firstSideSeconds);
}

export function runnerPhaseSeconds(items, index, phase, sideIndex = 0) {
  const item = items?.[index];
  if (!item) return 0;
  if (phase === "transition") return Math.max(0, Number(item.transitionBeforeSeconds || 0));
  if (phase === "prepare") return Math.max(3, Number(item.preparationSeconds || 0));
  if (phase === "side-switch") return item.sideSwitch ? Math.max(3, Number(item.sideSwitchSeconds ?? 5)) : 0;
  if (phase === "work") return item.prescription?.mode === "reps" ? null : sideWorkSeconds(item, sideIndex);
  return 0;
}

function completedIdsWith(currentIds, exerciseId) {
  if (!exerciseId || currentIds.includes(exerciseId)) return currentIds;
  return [...currentIds, exerciseId];
}

export function advanceMobilityRunner(current) {
  if (!current || current.complete) return current;
  const items = current.items || [];
  let index = Number(current.index || 0);
  let phase = current.phase || "work";
  let sideIndex = normalizedSideIndex(current.sideIndex);
  let completedExerciseIds = Array.isArray(current.completedExerciseIds) ? current.completedExerciseIds : [];

  for (let guard = 0; guard < 8; guard += 1) {
    const item = items[index];
    if (!item) break;

    if (phase === "prepare") {
      phase = "work";
      sideIndex = 0;
    } else if (phase === "work") {
      if (item.sideSwitch && sideIndex === 0) {
        phase = "side-switch";
      } else {
        completedExerciseIds = completedIdsWith(completedExerciseIds, item.id);
        if (index >= items.length - 1) {
          return {
            ...current,
            completedExerciseIds,
            sideIndex,
            remaining: 0,
            running: false,
            complete: true,
          };
        }
        index += 1;
        phase = "transition";
        sideIndex = 0;
      }
    } else if (phase === "side-switch") {
      phase = "work";
      sideIndex = 1;
    } else {
      phase = "prepare";
      sideIndex = 0;
    }

    const remaining = runnerPhaseSeconds(items, index, phase, sideIndex);
    if (remaining === null || remaining > 0) {
      return {
        ...current,
        completedExerciseIds,
        index,
        phase,
        sideIndex,
        remaining,
        complete: false,
      };
    }
  }

  return {
    ...current,
    completedExerciseIds,
    remaining: 0,
    running: false,
    complete: true,
  };
}

export function activeRunnerSideLabel(exercise, phase, sideIndex, weakSide) {
  if (!exercise?.sideSwitch) return "";
  const sides = sideOrder(weakSide);
  if (phase === "side-switch") return `Als Nächstes: ${sides[1]}`;
  if (phase !== "work") return "";
  return sides[normalizedSideIndex(sideIndex)];
}

export function nextRunnerSideLabel(weakSide) {
  return sideOrder(weakSide)[1];
}
