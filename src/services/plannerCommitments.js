function normalizedSport(value = "") {
  const text = String(value).toLowerCase();
  if (/football|soccer|fußball/.test(text)) return "football";
  if (/row|rud/.test(text)) return "rowing";
  if (/bike|cycl|rad/.test(text)) return "cycling";
  if (/swim|schwimm/.test(text)) return "swimming";
  if (/mobility|mobilität|yoga/.test(text)) return "mobility";
  if (/strength|stabi|kraft|workout/.test(text)) return "strength";
  if (/rest|ruhe|erholung/.test(text)) return "rest";
  if (/run|lauf|track|orc|interval|schwelle|backyard|treadmill/.test(text)) return "running";
  return text;
}

function commitmentWorkoutType(commitment = {}) {
  if (commitment.workoutType) return commitment.workoutType;
  return {
    running: "Easy Run",
    football: "Fußball",
    cycling: "Radfahren",
    rowing: "Rudern",
    mobility: "Mobility",
    swimming: "Schwimmen",
    strength: "Stabi",
  }[commitment.sport] || "Sonstiges";
}

export function findCommitmentSlot(plan = [], commitment = {}, date = "") {
  const commitmentId = String(commitment.id || "");
  const name = String(commitment.name || "").trim().toLowerCase();
  return plan.find((item) => {
    if (!item || item.date !== date) return false;
    if (commitmentId && String(item.commitmentId || "") === commitmentId) return true;
    if (!name) return false;
    return `${item.title || ""} ${item.type || ""}`.toLowerCase().includes(name);
  }) || null;
}

export function findCommitmentReplacementCandidate(plan = [], commitment = {}, date = "") {
  const commitmentSport = normalizedSport(`${commitment.sport || ""} ${commitment.workoutType || ""} ${commitment.name || ""}`);
  return plan.find((item) => {
    if (!item || item.date !== date) return false;
    if (item.source !== "planner-engine" || item.completed || item.fixed || item.commitmentId) return false;
    if (item.missedReason || item.plannedCancellation) return false;
    return normalizedSport(`${item.type || ""} ${item.title || ""}`) === commitmentSport;
  }) || null;
}

export function buildCommitmentPlanEntry(commitment = {}, date = "", id = "") {
  const type = commitmentWorkoutType(commitment);
  return {
    id,
    date,
    day: commitment.weekday || "",
    time: commitment.time || "18:00",
    title: commitment.name || type,
    type,
    distance: Number(commitment.distanceKm || 0),
    duration: Number(commitment.durationMinutes || 60),
    notes: "Nur für diese Woche aus dem gespeicherten Fixtermin übernommen. Andere Einheiten bleiben unverändert.",
    optional: false,
    completed: false,
    source: "planner-engine",
    archived: false,
    fixed: true,
    commitmentId: commitment.id || null,
    commitmentLoad: commitment.load || "medium",
    conflictMode: commitment.conflictMode || "combine",
    allowCombination: commitment.conflictMode !== "exclusive",
    intervalsPublishedAt: null,
  };
}

export function buildCancelledCommitmentPlanEntry(commitment = {}, date = "", id = "", cancelledAt = "") {
  return {
    ...buildCommitmentPlanEntry(commitment, date, id),
    missedReason: "Bewusst ausgelassen",
    missedNote: "",
    missedMeta: { plannedCancellation: true },
    plannedCancellation: true,
    cancelledAt,
  };
}
