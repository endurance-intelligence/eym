import test from "node:test";
import assert from "node:assert/strict";
import { coachAlternativeFor } from "../src/services/scienceCoach.js";

test("coach recommends a Zone-2 run instead of a hard track session", () => {
  const alternative = coachAlternativeFor(
    { title: "ORC Track", type: "ORC Track" },
    {
      availableKeys: new Set(["preset:easy-run", "sport:cycling", "preset:rest"]),
      level: "watch",
      ratio: 1.05,
      lowReviews: 0,
      index: 0,
    },
  );

  assert.equal(alternative.key, "preset:easy-run");
  assert.equal(alternative.label, "Lockerer Zone-2-Lauf");
});

test("coach recommends rest when the primary candidate sits in an overloaded week", () => {
  const alternative = coachAlternativeFor(
    { title: "12 km locker", type: "Easy Run" },
    {
      availableKeys: new Set(["preset:easy-run", "sport:cycling", "preset:rest"]),
      level: "adjust",
      ratio: 1.55,
      lowReviews: 0,
      index: 0,
    },
  );

  assert.equal(alternative.key, "preset:rest");
  assert.match(alternative.reason, /deutlich über deinem jüngsten Rahmen/);
});

test("coach only uses replacement sports the athlete has enabled", () => {
  const alternative = coachAlternativeFor(
    { title: "10 km locker", type: "Easy Run" },
    {
      availableKeys: new Set(["sport:mobility", "preset:rest"]),
      level: "watch",
      ratio: 1.05,
      lowReviews: 0,
      index: 1,
    },
  );

  assert.equal(alternative.key, "sport:mobility");
});
