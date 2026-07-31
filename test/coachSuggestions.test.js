import test from "node:test";
import assert from "node:assert/strict";
import {
  clearCoachSuggestionDecision,
  coachSuggestionDecision,
  coachSuggestionDecisionKey,
  updateCoachSuggestionDecisions,
  visibleCoachSuggestions,
} from "../src/services/coachSuggestions.js";

const candidate = {
  id: "track-1",
  coachAlternative: { key: "preset:easy-run", label: "Lockerer Zone-2-Lauf" },
};

const context = { weekKey: "2026-07-27", recommendationId: "coach-review-load" };

test("coach suggestion keys stay scoped to week, recommendation and workout", () => {
  assert.equal(
    coachSuggestionDecisionKey({ ...context, candidate }),
    "2026-07-27:coach-review-load:track-1",
  );
});

test("accepted or rejected suggestions are hidden until the decision is cleared", () => {
  const key = coachSuggestionDecisionKey({ ...context, candidate });
  const decisions = updateCoachSuggestionDecisions({}, key, "rejected", new Date("2026-07-31T12:00:00Z"));
  assert.equal(coachSuggestionDecision(decisions, key)?.status, "rejected");
  assert.deepEqual(visibleCoachSuggestions([candidate], decisions, context), []);
  assert.deepEqual(visibleCoachSuggestions([candidate], clearCoachSuggestionDecision(decisions, key), context), [candidate]);
});
