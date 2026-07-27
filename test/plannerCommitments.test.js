import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCancelledCommitmentPlanEntry,
  buildCommitmentPlanEntry,
  findCommitmentReplacementCandidate,
  findCommitmentSlot,
} from "../src/services/plannerCommitments.js";

const commitment = {
  id: "orc-track-tuesday",
  weekday: "Dienstag",
  time: "19:00",
  name: "ORC Track",
  sport: "running",
  workoutType: "ORC Track",
  durationMinutes: 60,
  load: "high",
};

test("stored commitment resolves its explicit slot in the active week", () => {
  const slot = {
    id: "slot-1",
    date: "2026-07-28",
    title: "ORC Track sehr locker oder auslassen",
    type: "ORC Track",
    commitmentId: commitment.id,
  };
  assert.equal(findCommitmentSlot([slot], commitment, "2026-07-28"), slot);
});

test("missing ORC Track can target the planned run without touching mobility", () => {
  const mobility = {
    id: "mobility",
    date: "2026-07-28",
    title: "Stabi & Mobilität",
    type: "Mobility",
    source: "planner-engine",
  };
  const plannedRun = {
    id: "planned-run",
    date: "2026-07-28",
    title: "9 km locker",
    type: "Easy Run",
    source: "planner-engine",
  };
  assert.equal(
    findCommitmentReplacementCandidate([mobility, plannedRun], commitment, "2026-07-28"),
    plannedRun,
  );
  assert.equal(findCommitmentReplacementCandidate([mobility], commitment, "2026-07-28"), null);
});

test("a week-only commitment entry keeps the permanent commitment identity", () => {
  const entry = buildCommitmentPlanEntry(commitment, "2026-07-28", "new-slot");
  assert.equal(entry.id, "new-slot");
  assert.equal(entry.commitmentId, commitment.id);
  assert.equal(entry.title, "ORC Track");
  assert.equal(entry.fixed, true);
  assert.equal(entry.date, "2026-07-28");
});

test("week-only cancellation remains linked to the stored commitment", () => {
  const entry = buildCancelledCommitmentPlanEntry(
    commitment,
    "2026-07-28",
    "cancelled-slot",
    "2026-07-27T08:00:00.000Z",
  );
  assert.equal(entry.commitmentId, commitment.id);
  assert.equal(entry.plannedCancellation, true);
  assert.equal(entry.missedReason, "Bewusst ausgelassen");
  assert.equal(entry.cancelledAt, "2026-07-27T08:00:00.000Z");
});
