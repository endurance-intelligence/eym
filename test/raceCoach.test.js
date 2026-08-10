import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRaceCoachPlan,
  emptyRaceCoachStatus,
  evaluateRaceCoach,
} from "../src/services/raceCoach.js";

function halfMarathonProfile() {
  return {
    name: "Halbmarathon",
    format: "distance",
    distanceKm: 21.1,
    durationMinutes: 120,
  };
}

test("distance race coach builds pace and checkpoint schedule from target duration", () => {
  const plan = buildRaceCoachPlan(halfMarathonProfile());

  assert.equal(plan.valid, true);
  assert.equal(Math.round(plan.targetPaceSeconds), 341);
  assert.equal(plan.checkpoints.length, 6);
  assert.equal(plan.checkpoints[2].distanceKm, 10.55);
  assert.equal(plan.checkpoints[2].elapsedMinutes, 60);
  assert.equal(plan.phases.length, 4);
});

test("race coach warns against banking time early in a distance race", () => {
  const plan = buildRaceCoachPlan(halfMarathonProfile());
  const result = evaluateRaceCoach({
    plan,
    status: {
      ...emptyRaceCoachStatus(),
      elapsedMinutes: 24,
      distanceKm: 5,
      rpe: 6,
    },
  });

  assert.equal(result.tone, "caution");
  assert.equal(result.headline, "Nicht weiter Zeit bunkern");
  assert.match(result.actions.join(" "), /nicht verteidigt/i);
});

test("race coach allows only a gradual correction when behind and still controlled", () => {
  const plan = buildRaceCoachPlan(halfMarathonProfile());
  const result = evaluateRaceCoach({
    plan,
    status: {
      ...emptyRaceCoachStatus(),
      elapsedMinutes: 65,
      distanceKm: 10,
      rpe: 5,
      legs: "okay",
    },
  });

  assert.equal(result.tone, "adjust");
  assert.equal(result.headline, "Kleine Korrektur möglich");
  assert.match(result.actions.join(" "), /nicht versuchen, den gesamten Rückstand/i);
});

test("fuel deficit is never prescribed as a one-shot catch-up", () => {
  const plan = buildRaceCoachPlan(halfMarathonProfile());
  const result = evaluateRaceCoach({
    plan,
    status: {
      ...emptyRaceCoachStatus(),
      elapsedMinutes: 60,
      distanceKm: 10.55,
      fueling: "behind",
    },
  });

  assert.equal(result.tone, "caution");
  assert.match(result.actions.join(" "), /nicht auf einmal nachholen/i);
});

test("loop race coach uses round cadence instead of a fake average running pace", () => {
  const plan = buildRaceCoachPlan({
    name: "Backyard Ultra",
    format: "loop",
    loopKm: 6.7,
    loopIntervalMinutes: 60,
    rounds: 15,
    durationMinutes: 900,
  });
  const result = evaluateRaceCoach({
    plan,
    status: {
      ...emptyRaceCoachStatus(),
      currentRound: 5,
      lastLoopMinutes: 57,
      elapsedMinutes: 240,
    },
  });

  assert.equal(plan.targetPaceSeconds, 0);
  assert.equal(plan.summary.loopInterval, "60 min");
  assert.equal(result.tone, "caution");
  assert.equal(result.headline, "Puffer wird knapp");
  assert.match(result.position, /Runde 5 von 15/);
});

test("time race coach remains effort-led without inventing a distance pace", () => {
  const plan = buildRaceCoachPlan({
    name: "24-Stunden-Lauf",
    format: "time",
    durationMinutes: 1440,
  });
  const result = evaluateRaceCoach({
    plan,
    status: {
      ...emptyRaceCoachStatus(),
      elapsedMinutes: 720,
      rpe: 6,
    },
  });

  assert.equal(plan.targetPaceSeconds, 0);
  assert.equal(plan.summary.pace, "nach Belastung");
  assert.match(result.position, /50 % der geplanten Rennzeit/);
});
