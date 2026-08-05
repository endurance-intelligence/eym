import test from "node:test";
import assert from "node:assert/strict";
import {
  customExerciseCoachMatch,
  mergeExerciseLibrary,
  normalizeCustomExercise,
  parseExerciseSourceUrl,
  validateCustomExerciseDraft,
} from "../src/services/mobilityExerciseSources.js";
import { buildMobilityWorkout } from "../src/services/mobilityWorkouts.js";

const source = {
  provider: "instagram",
  providerLabel: "Instagram",
  canonicalUrl: "https://www.instagram.com/reel/ABC_123/",
  embedUrl: "https://www.instagram.com/reel/ABC_123/embed/captioned/",
  authorName: "sirb_active",
};

function customExercise(overrides = {}) {
  const id = overrides.id || "custom-dynamic-lunge";
  return normalizeCustomExercise({
    id,
    source,
    name: "Dynamischer Lunge-to-Knee-Drive",
    purpose: "Aktiviert Hüfte, Gesäß, Core und Balance.",
    quickStart: "Aus dem Ausfallschritt kontrolliert in den einbeinigen Kniestand aufrichten.",
    focusAreas: ["hips", "core", "balance"],
    equipment: [],
    seconds: 60,
    intensity: "medium",
    coachUse: "activation",
    coachApproved: true,
    ...overrides,
  }, id);
}

test("Instagram reel links are normalized without copying the media", () => {
  const parsed = parseExerciseSourceUrl("https://www.instagram.com/reel/ABC_123/?utm_source=test");

  assert.equal(parsed.valid, true);
  assert.equal(parsed.provider, "instagram");
  assert.equal(parsed.canonicalUrl, "https://www.instagram.com/reel/ABC_123/");
  assert.equal(parsed.embedUrl, "https://www.instagram.com/reel/ABC_123/embed/captioned/");
});

test("unsupported or incomplete source links are rejected", () => {
  assert.equal(parseExerciseSourceUrl("not a url").valid, false);
  assert.equal(parseExerciseSourceUrl("https://example.com/video").valid, false);
  assert.equal(parseExerciseSourceUrl("https://www.instagram.com/sirb_active/").valid, false);
});

test("custom exercise drafts require source, name, focus and instructions", () => {
  assert.match(validateCustomExerciseDraft({}), /Namen/);
  assert.match(validateCustomExerciseDraft({ name: "Test" }), /Link/);
  assert.match(validateCustomExerciseDraft({ name: "Test", source, focusAreas: [] }), /schwerpunkt/i);
  assert.equal(validateCustomExerciseDraft({ name: "Test", source, focusAreas: ["hips"], quickStart: "Sauber bewegen" }), "");
});

test("personal exercises are merged with the built-in library", () => {
  const merged = mergeExerciseLibrary([{ id: "dead-bug", name: "Dead Bug" }], [customExercise()]);
  assert.deepEqual(merged.map((item) => item.id), ["dead-bug", "custom-dynamic-lunge"]);
  assert.equal(merged[1].custom, true);
});

test("activation exercises match before track but not after track", () => {
  const exercise = customExercise();
  assert.equal(customExerciseCoachMatch(exercise, {
    condition: "normal",
    safetyMode: false,
    context: { kind: "track", timing: "before" },
  }), true);
  assert.equal(customExerciseCoachMatch(exercise, {
    condition: "normal",
    safetyMode: false,
    context: { kind: "track", timing: "after" },
  }), false);
});

test("only coach-approved personal exercises can enter generated workouts", () => {
  const approved = customExercise();
  const disabled = customExercise({ id: "custom-disabled", name: "Nicht freigegeben", coachApproved: false });
  const adaptiveProfile = {
    id: "adaptive-test",
    condition: "normal",
    safetyMode: false,
    focusAreaIds: ["hips", "core"],
    preferredExerciseIds: [],
    excludedExerciseIds: [],
    context: { kind: "track", timing: "before" },
  };
  const workout = buildMobilityWorkout({
    durationMinutes: 10,
    equipment: ["mat"],
    focusAreaIds: ["hips", "core"],
    customExercises: [approved, disabled],
    preferredExerciseIds: [approved.id, disabled.id],
    adaptiveProfile,
  });
  const ids = workout.items.map((item) => item.id);

  assert.equal(ids.includes(approved.id), true);
  assert.equal(ids.includes(disabled.id), false);
});
