export const MOBILITY_EQUIPMENT = [
  { id: "mat", label: "Matte" },
  { id: "band", label: "Gummiband / Miniband" },
  { id: "dumbbells", label: "Gewichte / Kurzhanteln" },
  { id: "kettlebell", label: "Kettlebell" },
  { id: "step", label: "Bank / stabile Stufe" },
];

export const MOBILITY_EXERCISES = [
  {
    id: "cat-cow",
    name: "Katze-Kuh",
    group: "Mobilität",
    seconds: 60,
    equipment: [],
    physioDefault: true,
    instruction: "Im Vierfüßler langsam zwischen Rundrücken und sanfter Streckung wechseln. Nicht ins Endgefühl drücken.",
  },
  {
    id: "ankle-circles",
    name: "Fußkreisen",
    group: "Fuß & Sprunggelenk",
    seconds: 90,
    equipment: [],
    physioDefault: true,
    instruction: "Je Fuß kontrolliert in beide Richtungen kreisen. Das Knie möglichst ruhig halten.",
  },
  {
    id: "band-adduction",
    name: "Adduktoren mit Gummiband",
    group: "Physio",
    seconds: 120,
    equipment: ["band"],
    physioDefault: true,
    instruction: "In der vom Physio gezeigten Variante arbeiten. Becken stabil halten und jede Seite langsam ausführen.",
  },
  {
    id: "adductor-rockback",
    name: "Adduktoren-Rockback",
    group: "Mobilität",
    seconds: 75,
    equipment: ["mat"],
    instruction: "Im Vierfüßler ein Bein seitlich ausstrecken und das Becken kontrolliert nach hinten schieben.",
  },
  {
    id: "dead-bug",
    name: "Dead Bug",
    group: "Rumpf",
    seconds: 60,
    equipment: ["mat"],
    instruction: "Lendenwirbelsäule ruhig halten. Gegenüberliegenden Arm und Bein langsam absenken und zurückführen.",
  },
  {
    id: "bird-dog",
    name: "Bird Dog",
    group: "Rumpf",
    seconds: 60,
    equipment: ["mat"],
    instruction: "Gegenüberliegenden Arm und Bein strecken. Becken und Rumpf bleiben möglichst unbewegt.",
  },
  {
    id: "glute-bridge",
    name: "Glute Bridge",
    group: "Gesäß & Hüfte",
    seconds: 60,
    equipment: ["mat"],
    instruction: "Hüfte kontrolliert anheben, Gesäß anspannen und ohne Schwung absenken.",
  },
  {
    id: "forearm-plank",
    name: "Unterarmstütz",
    group: "Rumpf",
    seconds: 45,
    equipment: ["mat"],
    instruction: "Bauch und Gesäß aktiv halten. Bei nachlassender Form auf den Knien fortsetzen oder pausieren.",
  },
  {
    id: "side-plank",
    name: "Seitstütz",
    group: "Rumpf",
    seconds: 60,
    equipment: ["mat"],
    instruction: "Etwa zur Hälfte die Seite wechseln. Schulter aktiv wegdrücken und das Becken stabil halten.",
  },
  {
    id: "slow-mountain-climber",
    name: "Langsame Bergsteiger",
    group: "Rumpf dynamisch",
    seconds: 45,
    equipment: ["mat"],
    instruction: "Knie abwechselnd ruhig nach vorn führen. Kein Sprint: Rumpfspannung und saubere Bewegung zählen.",
  },
  {
    id: "calf-raise",
    name: "Wadenheben",
    group: "Fuß & Unterschenkel",
    seconds: 60,
    equipment: [],
    instruction: "Langsam hochdrücken, oben kurz halten und kontrolliert absenken. Bei Bedarf an einer Wand festhalten.",
  },
  {
    id: "hip-flexor-stretch",
    name: "Hüftbeuger-Stretch",
    group: "Mobilität",
    seconds: 90,
    equipment: ["mat"],
    instruction: "Je Seite ruhig halten. Becken leicht aufrichten, ohne ins Hohlkreuz auszuweichen.",
  },
  {
    id: "thoracic-rotation",
    name: "Brustwirbelsäulen-Rotation",
    group: "Mobilität",
    seconds: 75,
    equipment: ["mat"],
    instruction: "Aus dem Vierfüßler einen Arm öffnen und der Hand mit dem Blick folgen. Becken bleibt ruhig.",
  },
  {
    id: "goblet-squat",
    name: "Goblet Squat",
    group: "Kraft",
    seconds: 60,
    equipmentAny: ["dumbbells", "kettlebell"],
    instruction: "Gewicht nah vor dem Körper halten. Kontrolliert absenken, Knie stabil führen und sauber aufstehen.",
  },
  {
    id: "weighted-rdl",
    name: "Romanian Deadlift",
    group: "Kraft",
    seconds: 60,
    equipmentAny: ["dumbbells", "kettlebell"],
    instruction: "Hüfte nach hinten schieben, Rücken neutral halten und das Gewicht nah am Körper führen.",
  },
  {
    id: "suitcase-carry",
    name: "Suitcase Carry",
    group: "Rumpf & Haltung",
    seconds: 75,
    equipmentAny: ["dumbbells", "kettlebell"],
    instruction: "Gewicht einseitig tragen, aufrecht gehen und nach der Hälfte die Seite wechseln.",
  },
  {
    id: "step-up",
    name: "Kontrollierte Step-ups",
    group: "Beinachse",
    seconds: 75,
    equipment: ["step"],
    instruction: "Auf eine stabile Stufe steigen, Knie kontrolliert führen und langsam wieder absteigen.",
  },
  {
    id: "child-pose-breathing",
    name: "Kindhaltung & ruhige Atmung",
    group: "Abschluss",
    seconds: 90,
    equipment: ["mat"],
    instruction: "Ruhig atmen und Spannung lösen. Die Position nur so weit einnehmen, wie sie angenehm bleibt.",
  },
];

export const DEFAULT_PHYSIO_EXERCISES = MOBILITY_EXERCISES.filter((exercise) => exercise.physioDefault).map((exercise) => exercise.id);

function hasEquipment(exercise, selectedEquipment) {
  const selected = new Set(selectedEquipment || []);
  if (exercise.equipment?.some((item) => !selected.has(item))) return false;
  if (exercise.equipmentAny?.length && !exercise.equipmentAny.some((item) => selected.has(item))) return false;
  return true;
}

function uniqueExercises(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function exerciseById(id) {
  return MOBILITY_EXERCISES.find((exercise) => exercise.id === id);
}

export function buildMobilityWorkout({ durationMinutes = 25, condition = "normal", equipment = ["mat", "band"], physioExerciseIds = DEFAULT_PHYSIO_EXERCISES } = {}) {
  const targetSeconds = Math.max(10, Number(durationMinutes || 25)) * 60;
  const selectedPhysio = physioExerciseIds.map(exerciseById).filter(Boolean);
  const availablePhysio = selectedPhysio.filter((exercise) => hasEquipment(exercise, equipment));
  const missingPhysio = selectedPhysio.filter((exercise) => !hasEquipment(exercise, equipment));
  const available = MOBILITY_EXERCISES.filter((exercise) => hasEquipment(exercise, equipment));

  const mobility = available.filter((exercise) => ["Mobilität", "Fuß & Sprunggelenk", "Fuß & Unterschenkel"].includes(exercise.group));
  const stability = available.filter((exercise) => ["Rumpf", "Rumpf dynamisch", "Gesäß & Hüfte", "Beinachse"].includes(exercise.group));
  const strength = available.filter((exercise) => ["Kraft", "Rumpf & Haltung"].includes(exercise.group));
  const finishers = available.filter((exercise) => exercise.group === "Abschluss");

  const conditionPool = condition === "tired"
    ? [...mobility, ...stability.filter((exercise) => !["forearm-plank", "slow-mountain-climber"].includes(exercise.id))]
    : condition === "fresh"
      ? [...stability, ...strength, ...mobility]
      : [...stability, ...mobility, ...strength];

  const physioIds = new Set(availablePhysio.map((exercise) => exercise.id));
  const finisherIds = new Set(finishers.map((exercise) => exercise.id));
  const base = uniqueExercises(conditionPool.filter((exercise) => !physioIds.has(exercise.id) && !finisherIds.has(exercise.id)));

  const items = [];
  let usedSeconds = 0;
  const add = (exercise, round = 1) => {
    if (!exercise) return;
    const seconds = Number(exercise.seconds || 60);
    if (usedSeconds + seconds > targetSeconds + 45 && items.length >= 3) return;
    items.push({ ...exercise, stepId: `${exercise.id}-${round}-${items.length}`, round });
    usedSeconds += seconds;
  };

  availablePhysio.forEach((exercise) => add(exercise, 1));
  let round = 1;
  let index = 0;
  while (usedSeconds < targetSeconds - 90 && base.length) {
    const exercise = base[index % base.length];
    add(exercise, round);
    index += 1;
    if (index % base.length === 0) round += 1;
    if (round > 4) break;
  }

  if (finishers[0] && !items.some((item) => item.id === finishers[0].id) && usedSeconds + finishers[0].seconds <= targetSeconds + 60) {
    add(finishers[0], round);
  }

  return {
    id: `mobility-${durationMinutes}-${condition}-${equipment.join("-")}-${physioExerciseIds.join("-")}`,
    title: condition === "tired" ? "Regeneration & Bewegungsqualität" : condition === "fresh" ? "Läufer-Stabilität mit Kraft" : "Läufer-Basis: Mobility & Stabi",
    durationMinutes: Math.max(1, Math.round(usedSeconds / 60)),
    targetMinutes: Number(durationMinutes || 25),
    condition,
    equipment,
    items,
    missingPhysio,
  };
}

export function equipmentLabel(id) {
  return MOBILITY_EQUIPMENT.find((entry) => entry.id === id)?.label || id;
}
