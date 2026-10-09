import test from "node:test";
import assert from "node:assert/strict";
import { buildTrainingArchiveSnapshot } from "../src/services/trainingArchive.js";

const run = (distance, duration = 60) => ({ distance, duration });

test("training archive exposes chronological week bars, peak and longest session", () => {
  const snapshot = buildTrainingArchiveSnapshot({
    activities: [run(102.2, 700), run(11), run(20), run(35)],
    weeks: [
      ["2026-09-21", [run(102.2), run(11)]],
      ["2026-09-07", [run(35)]],
      ["2026-09-14", [run(20)]],
    ],
    sportSummary: [{ key: "running", label: "Laufen", count: 4, distance: 168.2 }],
  });

  assert.deepEqual(snapshot.weeks.map((week) => week.key), ["2026-09-07", "2026-09-14", "2026-09-21"]);
  assert.equal(snapshot.peakKm, 113.2);
  assert.equal(snapshot.longestKm, 102.2);
  assert.equal(snapshot.weeks.at(-1).share, 1);
  assert.equal(snapshot.profile.label, "Ultra-Fokus");
});

test("training archive reduces the sport cloud to two primary sports plus a remainder", () => {
  const snapshot = buildTrainingArchiveSnapshot({
    activities: [run(10)],
    weeks: [["2026-08-03", [run(10)]]],
    sportSummary: [
      { key: "running", label: "Laufen", count: 10, distance: 120 },
      { key: "strength", label: "Kraft & Mobility", count: 5, distance: 0 },
      { key: "soccer", label: "Fußball", count: 3, distance: 18 },
      { key: "rowing", label: "Rudern", count: 2, distance: 10 },
    ],
  });

  assert.deepEqual(snapshot.primarySports.map((sport) => sport.label), ["Laufen", "Kraft & Mobility"]);
  assert.equal(snapshot.remainingSportCount, 2);
});
