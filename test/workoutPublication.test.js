import test from "node:test";
import assert from "node:assert/strict";
import {
  TRACK_PUBLICATION_STATES,
  planPublicationFingerprint,
  trackPublicationStatus,
  workoutPublicationFingerprint,
} from "../src/services/workoutPublication.js";

function trackItem(overrides = {}) {
  return {
    id: "track-1",
    date: "2026-08-08",
    time: "09:00",
    spontaneous: false,
    title: "ORC Track",
    type: "Intervalle",
    distance: 8,
    duration: 75,
    optional: false,
    notes: "",
    structuredWorkout: {
      planningStatus: "final",
      kind: "intervals",
      rounds: 3,
      steps: [
        { kind: "work", unit: "distance", value: 2000, targetPace: "4:50", paceToleranceSeconds: 5 },
        { kind: "work", unit: "distance", value: 1000, targetPace: "5:10", paceToleranceSeconds: 5 },
      ],
      warmupMode: "lap",
      cooldownMode: "lap",
    },
    ...overrides,
  };
}

test("publication fingerprints change when a track definition changes", () => {
  const original = trackItem();
  const changed = trackItem({
    structuredWorkout: {
      ...original.structuredWorkout,
      rounds: 4,
    },
  });
  assert.notEqual(workoutPublicationFingerprint(original), workoutPublicationFingerprint(changed));
  assert.notEqual(planPublicationFingerprint([original]), planPublicationFingerprint([changed]));
});

test("draft track workouts are never shown as Garmin-ready", () => {
  const status = trackPublicationStatus({
    item: trackItem({ structuredWorkout: { ...trackItem().structuredWorkout, planningStatus: "draft" } }),
    approvalState: "accepted",
  });
  assert.equal(status.state, TRACK_PUBLICATION_STATES.DRAFT);
  assert.equal(status.action, "edit");
});

test("final track workout requires plan approval before publication", () => {
  const status = trackPublicationStatus({ item: trackItem(), approvalState: "changed" });
  assert.equal(status.state, TRACK_PUBLICATION_STATES.NEEDS_APPROVAL);
  assert.equal(status.actionLabel, "Erneut annehmen");
});

test("accepted final workout is marked not published until first sync", () => {
  const status = trackPublicationStatus({ item: trackItem(), approvalState: "accepted" });
  assert.equal(status.state, TRACK_PUBLICATION_STATES.NOT_PUBLISHED);
  assert.equal(status.actionLabel, "Für Garmin senden");
});


test("new final track in an already published week requests a Garmin update", () => {
  const status = trackPublicationStatus({
    item: trackItem(),
    approvalState: "accepted",
    weekWasPublished: true,
  });
  assert.equal(status.state, TRACK_PUBLICATION_STATES.NOT_PUBLISHED);
  assert.equal(status.actionLabel, "Für Garmin aktualisieren");
});

test("changed published workout shows update open", () => {
  const published = trackItem();
  const changed = trackItem({
    intervalsPublishedAt: "2026-08-05T08:00:00.000Z",
    intervalsPublishedFingerprint: workoutPublicationFingerprint(published),
    structuredWorkout: { ...published.structuredWorkout, rounds: 4 },
  });
  const status = trackPublicationStatus({ item: changed, approvalState: "accepted" });
  assert.equal(status.state, TRACK_PUBLICATION_STATES.UPDATE_OPEN);
  assert.equal(status.actionLabel, "Für Garmin aktualisieren");
});

test("matching Intervals fingerprint still requires an explicit watch check", () => {
  const item = trackItem();
  item.intervalsPublishedAt = "2026-08-05T08:00:00.000Z";
  item.intervalsPublishedFingerprint = workoutPublicationFingerprint(item);
  const status = trackPublicationStatus({ item, approvalState: "accepted" });
  assert.equal(status.state, TRACK_PUBLICATION_STATES.INTERVALS_CONFIRMED);
  assert.equal(status.action, "confirm-device");
  assert.equal(status.secondaryAction, "publish");
});

test("watch confirmation is tied to the exact workout fingerprint", () => {
  const item = trackItem();
  const fingerprint = workoutPublicationFingerprint(item);
  item.intervalsPublishedAt = "2026-08-05T08:00:00.000Z";
  item.intervalsPublishedFingerprint = fingerprint;
  item.garminConfirmedAt = "2026-08-05T08:05:00.000Z";
  item.garminConfirmedFingerprint = fingerprint;
  const current = trackPublicationStatus({ item, approvalState: "accepted" });
  assert.equal(current.state, TRACK_PUBLICATION_STATES.CURRENT);
  assert.equal(current.action, null);

  const changed = { ...item, structuredWorkout: { ...item.structuredWorkout, rounds: 4 } };
  const changedStatus = trackPublicationStatus({ item: changed, approvalState: "accepted" });
  assert.equal(changedStatus.state, TRACK_PUBLICATION_STATES.UPDATE_OPEN);
});
