import test from "node:test";
import assert from "node:assert/strict";
import { buildGoalPath, forecastAvailableFromLabel, weatherGlyph } from "../src/services/goalTimeline.js";

test("goal path is chronological, future-only and ends at the main target", () => {
  const main = { id: "main", name: "Heartbeat", date: "2026-11-21", isMainTarget: true };
  const values = [
    main,
    { id: "late", name: "After", date: "2026-12-01" },
    { id: "backyard", name: "Backyard", date: "2026-09-26", priority: "B" },
    { id: "past", name: "Past", date: "2026-08-01" },
    { id: "ten", name: "10k", date: "2026-09-01", priority: "C" },
  ];

  assert.deepEqual(
    buildGoalPath(values, main, new Date("2026-08-11T12:00:00")).map((item) => item.id),
    ["ten", "backyard", "main"],
  );
});

test("forecast availability is shown sixteen days before the event", () => {
  assert.equal(forecastAvailableFromLabel("2026-11-21"), "05.11.");
});

test("weather glyph stays compact and condition-aware", () => {
  assert.equal(weatherGlyph("Regenschauer"), "🌧️");
  assert.equal(weatherGlyph("Klar"), "☀️");
});
