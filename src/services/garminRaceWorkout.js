const FIT_EPOCH_MS = Date.UTC(1989, 11, 31, 0, 0, 0);
const FIT_PROFILE_VERSION = 21_212;
const FIT_PROTOCOL_VERSION = 2;
const FIT_WORKOUT_CAPABILITIES = 0x00000001 | 0x00000002 | 0x00000080 | 0x00000200;
const GARMIN_MAX_WORKOUT_STEPS = 50;

const BASE_TYPE = {
  enum: 0x02,
  uint16: 0x84,
  uint32: 0x86,
  uint32z: 0x8c,
  string: 0x07,
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function numeric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function paceLabel(secondsPerKm) {
  const total = Math.max(0, Math.round(numeric(secondsPerKm)));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}/km`;
}

function durationLabel(minutes) {
  const totalSeconds = Math.max(0, Math.round(numeric(minutes) * 60));
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}:${String(mins).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `${mins}:${String(seconds).padStart(2, "0")}`;
}

function asciiText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function limitedText(value, maxLength) {
  return asciiText(value).slice(0, maxLength).trim();
}

function workoutName(name, targetDurationMinutes) {
  const raceName = limitedText(name || "Race Strategy", 22) || "Race Strategy";
  const target = durationLabel(targetDurationMinutes);
  return limitedText(`EI ${raceName} ${target}`, 31);
}

function stepNotes(segment) {
  const terrain = limitedText(segment?.terrainLabel || "", 22);
  const gain = Math.max(0, Math.round(numeric(segment?.gainM)));
  const loss = Math.max(0, Math.round(numeric(segment?.lossM)));
  const pieces = [paceLabel(segment?.paceSecondsPerKm)];
  if (terrain) pieces.push(terrain);
  if (gain || loss) pieces.push(`+${gain}/-${loss}m`);
  return limitedText(pieces.join(" | "), 94);
}

export function buildGarminRaceWorkout({
  routePlan,
  raceName = "Race Strategy",
  paceToleranceSeconds = 10,
} = {}) {
  const sourceSegments = Array.isArray(routePlan?.segments) ? routePlan.segments : [];
  const tolerance = clamp(Math.round(numeric(paceToleranceSeconds) || 10), 1, 30);
  const steps = sourceSegments
    .map((segment, index) => {
      const distanceM = Math.max(1, Math.round(numeric(segment?.distanceKm) * 1000));
      const paceSecondsPerKm = Math.max(120, Math.round(numeric(segment?.paceSecondsPerKm)));
      if (!(distanceM > 0) || !(paceSecondsPerKm > 0)) return null;
      const fasterPace = Math.max(90, paceSecondsPerKm - tolerance);
      const slowerPace = paceSecondsPerKm + tolerance;
      const speedLowMps = 1000 / slowerPace;
      const speedHighMps = 1000 / fasterPace;
      const partial = Math.abs(distanceM - 1000) > 20;
      const label = partial
        ? `KM ${index + 1} ${Math.round(distanceM / 10) / 100}km`
        : `KM ${index + 1}`;
      return {
        index,
        name: limitedText(`${label} ${paceLabel(paceSecondsPerKm)}`, 31),
        distanceM,
        paceSecondsPerKm,
        paceFastSecondsPerKm: fasterPace,
        paceSlowSecondsPerKm: slowerPace,
        speedLowMps,
        speedHighMps,
        notes: stepNotes(segment),
        terrain: segment?.terrain || "flat",
      };
    })
    .filter(Boolean);

  const totalDistanceM = steps.reduce((sum, step) => sum + step.distanceM, 0);
  const targetDurationMinutes = numeric(routePlan?.targetDurationMinutes);
  const compatible = steps.length > 0 && steps.length <= GARMIN_MAX_WORKOUT_STEPS;

  return {
    name: workoutName(raceName, targetDurationMinutes),
    description: limitedText(
      `Endurance Intelligence Race Strategy - ${Math.round(totalDistanceM / 10) / 100} km in ${durationLabel(targetDurationMinutes)}`,
      94,
    ),
    sport: "running",
    targetDurationMinutes,
    totalDistanceM,
    paceToleranceSeconds: tolerance,
    steps,
    maxSteps: GARMIN_MAX_WORKOUT_STEPS,
    compatible,
    compatibilityMessage: compatible
      ? ""
      : steps.length > GARMIN_MAX_WORKOUT_STEPS
        ? `Garmin erlaubt maximal ${GARMIN_MAX_WORKOUT_STEPS} Schritte pro Workout. Dieser Plan hat ${steps.length}.`
        : "Für den Garmin-Export fehlen gültige Kilometer-Splits.",
  };
}

function uint16(value) {
  const buffer = new Uint8Array(2);
  new DataView(buffer.buffer).setUint16(0, value & 0xffff, true);
  return buffer;
}

function uint32(value) {
  const buffer = new Uint8Array(4);
  new DataView(buffer.buffer).setUint32(0, Math.max(0, Math.round(value)) >>> 0, true);
  return buffer;
}

function concatBytes(...chunks) {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  chunks.forEach((chunk) => {
    result.set(chunk, offset);
    offset += chunk.length;
  });
  return result;
}

function fitString(value, size) {
  const result = new Uint8Array(size);
  const encoded = new TextEncoder().encode(asciiText(value));
  result.set(encoded.slice(0, Math.max(0, size - 1)), 0);
  return result;
}

function definition(localMessageNumber, globalMessageNumber, fields) {
  const fieldBytes = fields.flatMap((field) => [field.number, field.size, BASE_TYPE[field.type]]);
  return Uint8Array.from([
    0x40 | (localMessageNumber & 0x0f),
    0x00,
    0x00,
    globalMessageNumber & 0xff,
    (globalMessageNumber >> 8) & 0xff,
    fields.length,
    ...fieldBytes,
  ]);
}

function dataMessage(localMessageNumber, values) {
  return concatBytes(Uint8Array.of(localMessageNumber & 0x0f), ...values);
}

function fitDateTime(date) {
  const timestamp = date instanceof Date && !Number.isNaN(date.getTime()) ? date.getTime() : Date.now();
  return Math.max(0, Math.floor((timestamp - FIT_EPOCH_MS) / 1000));
}

export function fitCrc16(bytes, start = 0, end = bytes.length) {
  let crc = 0;
  for (let index = start; index < end; index += 1) {
    crc ^= bytes[index];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) ? ((crc >>> 1) ^ 0xa001) : (crc >>> 1);
    }
  }
  return crc & 0xffff;
}

export function encodeGarminRaceWorkoutFit(workout, { createdAt = new Date() } = {}) {
  if (!workout?.compatible || !Array.isArray(workout.steps) || workout.steps.length === 0) {
    throw new Error(workout?.compatibilityMessage || "Garmin-Workout ist nicht exportierbar.");
  }

  const fileIdFields = [
    { number: 0, size: 1, type: "enum" },
    { number: 1, size: 2, type: "uint16" },
    { number: 4, size: 4, type: "uint32" },
  ];
  const workoutFields = [
    { number: 4, size: 1, type: "enum" },
    { number: 5, size: 4, type: "uint32z" },
    { number: 6, size: 2, type: "uint16" },
    { number: 8, size: 32, type: "string" },
    { number: 17, size: 96, type: "string" },
  ];
  const stepFields = [
    { number: 254, size: 2, type: "uint16" },
    { number: 0, size: 32, type: "string" },
    { number: 1, size: 1, type: "enum" },
    { number: 2, size: 4, type: "uint32" },
    { number: 3, size: 1, type: "enum" },
    { number: 4, size: 4, type: "uint32" },
    { number: 5, size: 4, type: "uint32" },
    { number: 6, size: 4, type: "uint32" },
    { number: 7, size: 1, type: "enum" },
    { number: 8, size: 96, type: "string" },
  ];

  const records = [
    definition(0, 0, fileIdFields),
    dataMessage(0, [
      Uint8Array.of(5),
      uint16(255),
      uint32(fitDateTime(createdAt)),
    ]),
    definition(1, 26, workoutFields),
    dataMessage(1, [
      Uint8Array.of(1),
      uint32(FIT_WORKOUT_CAPABILITIES),
      uint16(workout.steps.length),
      fitString(workout.name, 32),
      fitString(workout.description, 96),
    ]),
    definition(2, 27, stepFields),
    ...workout.steps.map((step, index) => dataMessage(2, [
      uint16(index),
      fitString(step.name, 32),
      Uint8Array.of(1),
      uint32(step.distanceM * 100),
      Uint8Array.of(0),
      uint32(0),
      uint32(step.speedLowMps * 1000),
      uint32(step.speedHighMps * 1000),
      Uint8Array.of(0),
      fitString(step.notes, 96),
    ])),
  ];

  const data = concatBytes(...records);
  const header = new Uint8Array(14);
  const view = new DataView(header.buffer);
  view.setUint8(0, 14);
  view.setUint8(1, FIT_PROTOCOL_VERSION);
  view.setUint16(2, FIT_PROFILE_VERSION, true);
  view.setUint32(4, data.length, true);
  header.set([0x2e, 0x46, 0x49, 0x54], 8);
  view.setUint16(12, fitCrc16(header, 0, 12), true);

  const withoutFileCrc = concatBytes(header, data);
  const fileCrc = uint16(fitCrc16(withoutFileCrc));
  return concatBytes(withoutFileCrc, fileCrc);
}

export function garminRaceWorkoutFilename(workout) {
  const slug = asciiText(workout?.name || "ei-race-strategy")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "ei-race-strategy";
  return `${slug}.fit`;
}

export const GARMIN_WORKOUT_STEP_LIMIT = GARMIN_MAX_WORKOUT_STEPS;
