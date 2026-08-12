import assert from "node:assert/strict";
import test from "node:test";
import { buildGarminRaceWorkout } from "../src/services/garminRaceWorkout.js";
import {
  buildIntervalsRaceWorkoutPublication,
  intervalsRaceWorkoutDescription,
  raceWorkoutPublicationFingerprint,
} from "../src/services/raceWorkoutSync.js";

function workout() {
  return buildGarminRaceWorkout({
    raceName: "Urland Lauf Oerlinghausen",
    paceToleranceSeconds: 10,
    routePlan: {
      targetDurationMinutes: 12.8,
      segments: [
        { distanceKm: 1, paceSecondsPerKm: 280 },
        { distanceKm: 1, paceSecondsPerKm: 290 },
        { distanceKm: 0.62, paceSecondsPerKm: 270 },
      ],
    },
  });
}

test("Intervals race description keeps every kilometre as a distance pace step", () => {
  const description = intervalsRaceWorkoutDescription(workout());
  assert.match(description, /KM 1\n- 1km 4:30-4:50\/km Pace intensity=active/);
  assert.match(description, /KM 2\n- 1km 4:40-5:00\/km Pace intensity=active/);
  assert.match(description, /KM 3 · 0\.62 km\n- 620mtr 4:20-4:40\/km Pace intensity=active/);
});

test("race publication payload is small, stable and server-safe", () => {
  const publication = buildIntervalsRaceWorkoutPublication({
    workout: workout(),
    raceKey: "event:urland 2026!",
    raceName: "Urland Lauf\nOerlinghausen",
    publishDate: "2026-08-12",
  });
  assert.equal(publication.raceKey, "event:urland-2026");
  assert.equal(publication.raceName, "Urland Lauf Oerlinghausen");
  assert.equal(publication.publishDate, "2026-08-12");
  assert.equal(publication.steps.length, 3);
  assert.deepEqual(publication.steps[2], { distanceM: 620, paceSecondsPerKm: 270 });
});

test("publication fingerprint changes for pace, corridor or sync day changes", () => {
  const source = workout();
  const base = raceWorkoutPublicationFingerprint(source, "2026-08-12");
  const changedPace = { ...source, steps: source.steps.map((step, index) => index === 0 ? { ...step, paceSecondsPerKm: 275 } : step) };
  const changedTolerance = { ...source, paceToleranceSeconds: 15 };
  assert.notEqual(base, raceWorkoutPublicationFingerprint(changedPace, "2026-08-12"));
  assert.notEqual(base, raceWorkoutPublicationFingerprint(changedTolerance, "2026-08-12"));
  assert.notEqual(base, raceWorkoutPublicationFingerprint(source, "2026-08-13"));
});
