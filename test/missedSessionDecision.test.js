import test from "node:test";
import assert from "node:assert/strict";
import {
  applyOptionalLongRunExtension,
  blockedTrainingDates,
  buildMissedSessionDecision,
  missedWorkoutPurpose,
} from "../src/services/missedSessionDecision.js";

const today = new Date("2026-08-05T12:00:00");
const establishedActivities = [
  { id: "run-1", type: "Run", name: "28 km Longrun", date: "2026-07-19", distance: 28, duration: 190 },
  { id: "run-2", type: "Run", name: "24 km Longrun", date: "2026-07-26", distance: 24, duration: 165 },
];
const healthyPlanner = {
  lastRecoveryWeek: false,
  lastReadiness: { factor: 1, hardAllowed: true, longRunAllowed: true },
  checkin: { energy: 7, fatigue: "none", pain: "none", painLevel: 0, illness: "healthy" },
};

function longRun() {
  return {
    id: "long",
    date: "2026-08-09",
    title: "24 km Longrun",
    type: "Long Run",
    distance: 24,
    duration: 156,
    keySession: true,
  };
}

test("quality work is not converted into extra long-run kilometres", () => {
  const decision = buildMissedSessionDecision({
    today,
    activities: establishedActivities,
    planner: healthyPlanner,
    plan: [
      {
        id: "track",
        date: "2026-08-08",
        title: "ORC Track",
        type: "ORC Track",
        distance: 10,
        keySession: true,
        plannedCancellation: true,
        missedReason: "Keine Zeit",
      },
      longRun(),
    ],
  });

  assert.equal(missedWorkoutPurpose({ title: "ORC Track", type: "ORC Track", keySession: true }), "quality");
  assert.equal(decision.action, "keep");
  assert.equal(decision.canApply, false);
  assert.match(decision.reason, /Tempo- oder Trackreiz/);
});

test("a missed easy run may allow only a small optional long-run extension", () => {
  const decision = buildMissedSessionDecision({
    today,
    activities: establishedActivities,
    planner: healthyPlanner,
    plan: [
      {
        id: "easy",
        date: "2026-08-08",
        title: "8 km locker",
        type: "Easy Run",
        distance: 8,
        duration: 52,
        plannedCancellation: true,
        missedReason: "Keine Zeit",
        missedNote: "Familienausflug",
      },
      longRun(),
    ],
  });

  assert.equal(decision.action, "optional-extension");
  assert.equal(decision.canApply, true);
  assert.equal(decision.extraMinutes, 10);
  assert.ok(decision.extraKm > 0 && decision.extraKm <= 2);
  assert.ok(decision.finalDistanceKm <= 28);
});

test("recovery signals keep the long run unchanged even after a missed easy run", () => {
  const decision = buildMissedSessionDecision({
    today,
    activities: establishedActivities,
    planner: { ...healthyPlanner, lastRecoveryWeek: true },
    plan: [
      {
        id: "easy",
        date: "2026-08-08",
        title: "8 km locker",
        type: "Easy Run",
        distance: 8,
        plannedCancellation: true,
        missedReason: "Keine Zeit",
      },
      longRun(),
    ],
  });

  assert.equal(decision.canApply, false);
  assert.match(decision.reason, /Entlastungswoche/);
});

test("optional extension is applied once and retains the no-debt explanation", () => {
  const decision = buildMissedSessionDecision({
    today,
    activities: establishedActivities,
    planner: healthyPlanner,
    plan: [
      {
        id: "easy",
        date: "2026-08-08",
        title: "8 km locker",
        type: "Easy Run",
        distance: 8,
        plannedCancellation: true,
        missedReason: "Keine Zeit",
      },
      longRun(),
    ],
  });
  const adjusted = applyOptionalLongRunExtension(longRun(), decision);
  const after = buildMissedSessionDecision({
    today,
    activities: establishedActivities,
    planner: healthyPlanner,
    plan: [
      {
        id: "easy",
        date: "2026-08-08",
        title: "8 km locker",
        type: "Easy Run",
        distance: 8,
        plannedCancellation: true,
        missedReason: "Keine Zeit",
      },
      adjusted,
    ],
  });

  assert.equal(adjusted.duration, 166);
  assert.match(adjusted.notes, /kein vollständiges Nachholen/i);
  assert.equal(after.canApply, false);
  assert.equal(after.tone, "applied");
});

test("blocked dates are carried into replanning", () => {
  const blocked = blockedTrainingDates([
    {
      date: "2026-08-08",
      plannedCancellation: true,
      missedMeta: { blockDay: true },
    },
    {
      date: "2026-08-09",
      plannedCancellation: true,
      missedMeta: { blockDay: false },
    },
  ], "2026-08-03", "2026-08-09");

  assert.deepEqual([...blocked], ["2026-08-08"]);
});

test("Saturday cancellation still informs the coach on Sunday before the long run", () => {
  const decision = buildMissedSessionDecision({
    today: new Date("2026-08-09T07:00:00"),
    activities: establishedActivities,
    planner: healthyPlanner,
    plan: [
      {
        id: "easy",
        date: "2026-08-08",
        title: "8 km locker",
        type: "Easy Run",
        distance: 8,
        plannedCancellation: true,
        missedReason: "Keine Zeit",
      },
      longRun(),
    ],
  });

  assert.ok(decision);
  assert.equal(decision.cancellationId, "easy");
  assert.equal(decision.longRunId, "long");
});
