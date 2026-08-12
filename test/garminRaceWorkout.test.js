import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGarminRaceWorkout,
  encodeGarminRaceWorkoutFit,
  fitCrc16,
  garminRaceWorkoutFilename,
} from "../src/services/garminRaceWorkout.js";

function sampleRoutePlan(segmentCount = 3) {
  const segments = Array.from({ length: segmentCount }, (_, index) => ({
    distanceKm: index === segmentCount - 1 ? 0.62 : 1,
    paceSecondsPerKm: 280 + index * 5,
    terrain: index === 1 ? "up" : "flat",
    terrainLabel: index === 1 ? "Anstieg" : "flach",
    gainM: index === 1 ? 24 : 4,
    lossM: index === 1 ? 2 : 6,
  }));
  return {
    targetDurationMinutes: 13.4,
    averagePaceSecondsPerKm: 285,
    segments,
  };
}

function u16(bytes, offset) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(offset, true);
}

function u32(bytes, offset) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
}

test("buildGarminRaceWorkout turns race splits into distance steps with pace corridor", () => {
  const workout = buildGarminRaceWorkout({
    routePlan: sampleRoutePlan(),
    raceName: "7. Urland-Lauf Oerlinghausen",
    paceToleranceSeconds: 5,
  });

  assert.equal(workout.compatible, true);
  assert.equal(workout.steps.length, 3);
  assert.equal(workout.steps[0].distanceM, 1000);
  assert.equal(workout.steps[2].distanceM, 620);
  assert.equal(workout.steps[0].paceFastSecondsPerKm, 275);
  assert.equal(workout.steps[0].paceSlowSecondsPerKm, 285);
  assert.ok(workout.steps[0].speedLowMps < workout.steps[0].speedHighMps);
  assert.match(workout.steps[0].name, /KM 1/);
  assert.match(workout.steps[2].name, /0\.62km/);
  assert.match(workout.name, /^EI /);
  assert.equal(workout.paceToleranceSeconds, 5);
});

test("buildGarminRaceWorkout protects Garmin's 50 step workout limit", () => {
  const workout = buildGarminRaceWorkout({ routePlan: sampleRoutePlan(51) });
  assert.equal(workout.compatible, false);
  assert.match(workout.compatibilityMessage, /maximal 50 Schritte/);
});

test("FIT encoder writes a valid FIT header, CRC and workout step definition", () => {
  const workout = buildGarminRaceWorkout({ routePlan: sampleRoutePlan(), raceName: "Race Test" });
  const bytes = encodeGarminRaceWorkoutFit(workout, { createdAt: new Date("2026-08-12T08:00:00Z") });

  assert.equal(bytes[0], 14);
  assert.equal(bytes[1], 2);
  assert.equal(u16(bytes, 2), 21212);
  assert.equal(String.fromCharCode(...bytes.slice(8, 12)), ".FIT");
  assert.equal(u16(bytes, 12), fitCrc16(bytes, 0, 12));

  const dataSize = u32(bytes, 4);
  assert.equal(bytes.length, 14 + dataSize + 2);
  assert.equal(u16(bytes, 14 + dataSize), fitCrc16(bytes, 0, 14 + dataSize));

  // After File ID definition/data and Workout definition/data, local message 2 defines workout_step (global 27).
  let offset = 14;
  assert.equal(bytes[offset] & 0x40, 0x40);
  const fileIdFieldCount = bytes[offset + 5];
  offset += 6 + fileIdFieldCount * 3;
  offset += 1 + 1 + 2 + 4;

  assert.equal(bytes[offset] & 0x40, 0x40);
  const workoutFieldCount = bytes[offset + 5];
  offset += 6 + workoutFieldCount * 3;
  offset += 1 + 1 + 4 + 2 + 32 + 96;

  assert.equal(bytes[offset] & 0x40, 0x40);
  assert.equal(u16(bytes, offset + 3), 27);
  const stepFieldCount = bytes[offset + 5];
  assert.equal(stepFieldCount, 10);
  offset += 6 + stepFieldCount * 3;

  assert.equal(bytes[offset], 2);
  const firstStep = offset + 1;
  assert.equal(u16(bytes, firstStep), 0);
  const durationTypeOffset = firstStep + 2 + 32;
  assert.equal(bytes[durationTypeOffset], 1); // distance
  assert.equal(u32(bytes, durationTypeOffset + 1), 100000); // 1000 m * FIT distance scale 100
  const targetTypeOffset = durationTypeOffset + 1 + 4;
  assert.equal(bytes[targetTypeOffset], 0); // speed
  assert.equal(u32(bytes, targetTypeOffset + 1), 0); // custom speed zone
  const speedLowRaw = u32(bytes, targetTypeOffset + 1 + 4);
  const speedHighRaw = u32(bytes, targetTypeOffset + 1 + 4 + 4);
  assert.ok(speedLowRaw > 3000 && speedLowRaw < speedHighRaw);
});

test("garminRaceWorkoutFilename creates a portable fit filename", () => {
  const workout = buildGarminRaceWorkout({ routePlan: sampleRoutePlan(), raceName: "Urland Lauf Örlinghausen" });
  const filename = garminRaceWorkoutFilename(workout);
  assert.match(filename, /^[a-z0-9-]+\.fit$/);
  assert.ok(filename.length < 60);
});
