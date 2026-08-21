import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { buildGarminRaceWorkout } from "../src/services/garminRaceWorkout.js";
import {
  buildIntervalsRaceWorkoutPublication,
  intervalsRaceWorkoutDescription,
  raceWorkoutPublicationFingerprint,
  raceWorkoutSyncTime,
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
    publishTime: "18:30",
  });
  assert.equal(publication.raceKey, "event:urland-2026");
  assert.equal(publication.raceName, "Urland Lauf Oerlinghausen");
  assert.equal(publication.publishDate, "2026-08-12");
  assert.equal(publication.publishTime, "18:30");
  assert.equal(publication.steps.length, 3);
  assert.deepEqual(publication.steps[2], { distanceM: 620, paceSecondsPerKm: 270 });
});

test("publication fingerprint changes for pace, corridor or sync day changes", () => {
  const source = workout();
  const base = raceWorkoutPublicationFingerprint(source, "2026-08-12");
  const changedPace = { ...source, steps: source.steps.map((step, index) => index === 0 ? { ...step, paceSecondsPerKm: 275 } : step) };
  const changedTolerance = { ...source, paceToleranceSeconds: 15 };
  const changedName = { ...source, name: "EI Race · anderer Name · 12:48" };
  assert.notEqual(base, raceWorkoutPublicationFingerprint(changedPace, "2026-08-12"));
  assert.notEqual(base, raceWorkoutPublicationFingerprint(changedTolerance, "2026-08-12"));
  assert.notEqual(base, raceWorkoutPublicationFingerprint(changedName, "2026-08-12"));
  assert.notEqual(base, raceWorkoutPublicationFingerprint(source, "2026-08-13"));
});

test("same-day race sync never schedules a fresh workout at midnight in the past", () => {
  const now = new Date(2026, 7, 21, 13, 42, 0);
  assert.equal(raceWorkoutSyncTime("2026-08-21", "", now), "13:52");
  assert.equal(raceWorkoutSyncTime("2026-08-21", "18:30", now), "18:30");
  assert.equal(raceWorkoutSyncTime("2026-08-21", "09:00", now), "13:52");
  assert.equal(raceWorkoutSyncTime("2026-08-22", "", now), "12:00");
});

test("race workout edge function verifies the WORKOUT after upload", () => {
  const source = fs.readFileSync(new URL("../supabase/functions/intervals/index.ts", import.meta.url), "utf8");
  assert.match(source, /verifyPublishedRaceWorkout/);
  assert.match(source, /category !== "WORKOUT"/);
  assert.match(source, /type\.toLowerCase\(\) !== "run"/);
  assert.match(source, /start_date_local: `\$\{workout\.publishDate\}T\$\{workout\.publishTime\}:00`/);
  assert.match(source, /verified: true/);
});
