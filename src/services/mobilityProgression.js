function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function exerciseCompleted(entry = {}, exerciseId = "") {
  return (Array.isArray(entry.exerciseIds) ? entry.exerciseIds : []).includes(exerciseId);
}

function successfulEntry(entry = {}, exerciseId = "") {
  const painExerciseIds = Array.isArray(entry.painExerciseIds) ? entry.painExerciseIds : [];
  if (painExerciseIds.length ? painExerciseIds.includes(exerciseId) : entry.painReported) return false;
  if (entry.zoneResponse === "worse") return false;
  const fitScore = number(entry.fitScore, 0);
  return fitScore === 0 || fitScore >= 6;
}

function poorEntry(entry = {}, exerciseId = "") {
  const painExerciseIds = Array.isArray(entry.painExerciseIds) ? entry.painExerciseIds : [];
  if (painExerciseIds.length ? painExerciseIds.includes(exerciseId) : entry.painReported) return true;
  if (entry.zoneResponse === "worse") return true;
  const fitScore = number(entry.fitScore, 0);
  return fitScore > 0 && fitScore <= 4;
}

export function mobilityProgressionHistory(history = [], exerciseId = "") {
  const matching = (Array.isArray(history) ? history : []).filter((entry) => exerciseCompleted(entry, exerciseId));
  const successful = matching.filter((entry) => successfulEntry(entry, exerciseId));
  const latest = matching[0] || null;
  let consecutiveGood = 0;
  for (const entry of matching) {
    if (!successfulEntry(entry, exerciseId)) break;
    consecutiveGood += 1;
  }
  return {
    completed: matching.length,
    successful: successful.length,
    consecutiveGood,
    recentPoor: latest ? poorEntry(latest, exerciseId) : false,
    latest,
  };
}

function repPrescription(exercise = {}, history = []) {
  const baseReps = Math.max(1, number(exercise.baseReps, 5));
  const step = Math.max(1, number(exercise.repsStep, 1));
  const maxSingleSetReps = Math.max(baseReps, number(exercise.maxSingleSetReps, 10));
  const progression = mobilityProgressionHistory(history, exercise.id);
  let level = Math.floor(progression.successful / 2);
  if (progression.recentPoor) level = Math.max(0, level - 1);

  let sets = 1;
  let reps = baseReps + level * step;
  if (reps > maxSingleSetReps) {
    sets = Math.min(3, 2 + Math.floor((reps - maxSingleSetReps - 1) / 5));
    reps = Math.min(maxSingleSetReps, Math.max(baseReps + 1, baseReps + (level - Math.ceil((maxSingleSetReps - baseReps) / step))));
  }

  const perSide = Boolean(exercise.repsPerSide);
  const totalReps = sets * reps * (perSide ? 2 : 1);
  const secondsPerRep = Math.max(2, number(exercise.secondsPerRep, 3));
  const estimatedSeconds = Math.max(20, Math.round(totalReps * secondsPerRep + Math.max(0, sets - 1) * 20));
  const label = sets > 1
    ? `${sets} × ${reps}${perSide ? "/Seite" : ""}`
    : `${reps}${perSide ? "/Seite" : ""} Wdh.`;

  let progressionReason = `Einstieg mit ${baseReps}${perSide ? "/Seite" : ""} sauberen Wiederholungen`;
  if (progression.completed > 0 && progression.recentPoor) progressionReason = "Letzte Rückmeldung war auffällig → Umfang bewusst reduziert";
  else if (level > 0) progressionReason = `${progression.successful} passende Abschlüsse → kontrolliert gesteigert`;
  else if (progression.completed > 0) progressionReason = "Noch einmal sauber bestätigen, bevor gesteigert wird";

  return {
    mode: "reps",
    reps,
    sets,
    perSide,
    label,
    estimatedSeconds,
    progressionReason,
    progression,
  };
}

export function mobilityExercisePrescription(exercise = {}, history = []) {
  if (exercise.doseMode === "reps") return repPrescription(exercise, history);
  const seconds = Math.max(15, number(exercise.seconds, 60));
  return {
    mode: "time",
    seconds,
    label: `${seconds} Sek.`,
    estimatedSeconds: seconds,
    progressionReason: "Zeitvorgabe für kontrollierte Bewegungsqualität",
    progression: mobilityProgressionHistory(history, exercise.id),
  };
}

export function mobilityPrescriptionLabel(item = {}) {
  return item.prescription?.label || (item.doseMode === "reps" ? `${item.baseReps || 5} Wdh.` : `${Math.max(15, number(item.seconds, 60))} Sek.`);
}

export function mobilityProgressionSummary(exercise = {}, history = []) {
  const prescription = mobilityExercisePrescription(exercise, history);
  return {
    id: exercise.id,
    name: exercise.name,
    label: prescription.label,
    reason: prescription.progressionReason,
    completed: prescription.progression.completed,
    successful: prescription.progression.successful,
  };
}
