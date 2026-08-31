import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRaceCoachPlan,
  emptyRaceCoachStatus,
  evaluateRaceCoach,
  formatRaceDurationInput,
  parseRaceDurationInput,
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


test("race coach target time input supports long ultra durations", () => {
  assert.equal(parseRaceDurationInput("0:55:30"), 55.5);
  assert.equal(parseRaceDurationInput("30:00"), 1800);
  assert.equal(formatRaceDurationInput(1800), "30:00");
});

test("race coach exposes route pacing when a GPX profile is available", () => {
  const routeProfile = {
    distanceKm: 2,
    segments: [
      { startKm: 0, endKm: 1, distanceKm: 1, gainM: 80, lossM: 0, netGradePercent: 4 },
      { startKm: 1, endKm: 2, distanceKm: 1, gainM: 0, lossM: 80, netGradePercent: -4 },
    ],
  };
  const plan = buildRaceCoachPlan({ name: "2k", format: "distance", distanceKm: 2, durationMinutes: 12 }, { routeProfile });

  assert.ok(plan.routePlan);
  assert.equal(plan.routePlan.segments.length, 2);
  assert.ok(plan.routePlan.segments[0].paceSecondsPerKm > plan.routePlan.segments[1].paceSecondsPerKm);
  assert.ok(Math.abs(plan.routePlan.segments.at(-1).cumulativeMinutes - 12) < 0.01);
});

test("race coach forwards manual kilometre paces into the route strategy", () => {
  const routeProfile = {
    distanceKm: 3,
    segments: [
      { startKm: 0, endKm: 1, distanceKm: 1, gainM: 0, lossM: 0, netGradePercent: 0 },
      { startKm: 1, endKm: 2, distanceKm: 1, gainM: 20, lossM: 0, netGradePercent: 2 },
      { startKm: 2, endKm: 3, distanceKm: 1, gainM: 0, lossM: 20, netGradePercent: -2 },
    ],
  };
  const plan = buildRaceCoachPlan(
    { name: "3k", format: "distance", distanceKm: 3, durationMinutes: 15 },
    { routeProfile, paceOverrides: { 1: 315 } },
  );

  assert.equal(plan.routePlan.manualPaceCount, 1);
  assert.equal(Math.round(plan.routePlan.segments[1].paceSecondsPerKm), 315);
  assert.ok(Math.abs(plan.routePlan.segments.at(-1).cumulativeMinutes - 15) < 0.01);
});

test("5000 m track race stays a distance race and exposes 200/400 m splits", () => {
  const profilePoints = [];
  const corners = [
    [52.0, 8.0],
    [52.0, 8.00146],
    [52.0009, 8.00146],
    [52.0009, 8.0],
  ];
  for (let lap = 0; lap <= 12; lap += 1) {
    corners.forEach(([lat, lon], corner) => profilePoints.push({
      lat,
      lon,
      distanceKm: Math.min(4.99, lap * 0.4 + corner * 0.1),
    }));
  }
  profilePoints.push({ lat: 52.0, lon: 8.0, distanceKm: 4.99 });
  const routeProfile = {
    name: "Sportpark am Oelbach - 5000 m Bahn 1",
    distanceKm: 4.99,
    ascentM: 0,
    descentM: 0,
    profilePoints,
    segments: [
      { startKm: 0, endKm: 1, distanceKm: 1, gainM: 0, lossM: 0, netGradePercent: 0 },
      { startKm: 1, endKm: 2, distanceKm: 1, gainM: 0, lossM: 0, netGradePercent: 0 },
      { startKm: 2, endKm: 3, distanceKm: 1, gainM: 0, lossM: 0, netGradePercent: 0 },
      { startKm: 3, endKm: 4, distanceKm: 1, gainM: 0, lossM: 0, netGradePercent: 0 },
      { startKm: 4, endKm: 4.99, distanceKm: 0.99, gainM: 0, lossM: 0, netGradePercent: 0 },
    ],
  };
  const plan = buildRaceCoachPlan({
    name: "ASG Bahn-Meeting 2026",
    format: "loop",
    loopKm: 0.4,
    loopIntervalMinutes: 60,
    rounds: 13,
    durationMinutes: 20,
    eventDistanceKm: 5,
    courseType: "loop",
    loopMode: "free",
  }, { routeProfile });

  assert.equal(plan.profile.format, "distance");
  assert.equal(plan.profile.distanceKm, 5);
  assert.equal(Math.round(plan.targetPaceSeconds), 240);
  assert.equal(plan.trackPlan.lapDistanceM, 400);
  assert.equal(plan.trackPlan.lapsLabel, "12,5");
  assert.equal(Math.round(plan.trackPlan.split200Seconds), 48);
  assert.equal(Math.round(plan.trackPlan.lapSplitSeconds), 96);
  assert.equal(plan.summary.loopInterval, "");
  assert.equal(plan.routePlan.distanceNormalized, true);
  assert.equal(plan.routePlan.segments.length, 5);
  assert.match(plan.phases[0].range, /Runde 1/);
  assert.match(plan.phases.at(-1).range, /2,5 Runden/);
});
