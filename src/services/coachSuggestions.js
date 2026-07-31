const MAX_DECISIONS = 80;

function text(value) {
  return String(value || "").trim();
}

export function coachSuggestionDecisionKey({ weekKey = "", recommendationId = "", candidate = {} } = {}) {
  return [text(weekKey), text(recommendationId), text(candidate.id)].join(":");
}

export function coachSuggestionDecision(decisions = {}, key = "") {
  const entry = decisions?.[key];
  if (!entry || !["accepted", "rejected"].includes(entry.status)) return null;
  return entry;
}

export function visibleCoachSuggestions(candidates = [], decisions = {}, context = {}) {
  return (Array.isArray(candidates) ? candidates : []).filter((candidate) => {
    const key = coachSuggestionDecisionKey({ ...context, candidate });
    return !coachSuggestionDecision(decisions, key);
  });
}

export function updateCoachSuggestionDecisions(decisions = {}, key, status, now = new Date()) {
  if (!key || !["accepted", "rejected"].includes(status)) return decisions || {};
  const next = {
    ...(decisions || {}),
    [key]: {
      status,
      decidedAt: new Date(now).toISOString(),
    },
  };
  const ordered = Object.entries(next)
    .sort((left, right) => String(right[1]?.decidedAt || "").localeCompare(String(left[1]?.decidedAt || "")))
    .slice(0, MAX_DECISIONS);
  return Object.fromEntries(ordered);
}

export function clearCoachSuggestionDecision(decisions = {}, key = "") {
  if (!key || !decisions?.[key]) return decisions || {};
  const next = { ...(decisions || {}) };
  delete next[key];
  return next;
}
