import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPitCrewShareUrl,
  pitCrewStorageKey,
  readPitCrewLocalSnapshot,
  rememberPitCrewShareToken,
  storedPitCrewShareToken,
  writePitCrewLocalSnapshot,
  normalizePitCrewSnapshot,
} from "../src/services/pitCrewShareCore.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test("crew share URL keeps the GitHub Pages base path and avoids the app hash router", () => {
  const url = buildPitCrewShareUrl("abc_123", {
    origin: "https://example.test",
    baseUrl: "/endurance-intelligence/",
  });
  const parsed = new URL(url);
  assert.equal(parsed.pathname, "/endurance-intelligence/");
  assert.equal(parsed.searchParams.get("crew"), "abc_123");
  assert.equal(parsed.hash, "");
});

test("crew share token is stored per race", () => {
  const storage = memoryStorage();
  rememberPitCrewShareToken("backyard-2026", "token-one", storage);
  rememberPitCrewShareToken("other-race", "token-two", storage);
  assert.equal(storedPitCrewShareToken("backyard-2026", storage), "token-one");
  assert.equal(storedPitCrewShareToken("other-race", storage), "token-two");
});

test("shared pit snapshot preserves only race-operation state", () => {
  const storage = memoryStorage();
  const race = { key: "backyard-2026", date: "2026-09-26" };
  const snapshot = {
    anchorAt: "2026-09-26T06:00:00.000Z",
    history: [{ round: 1, summary: { carbs: 55 } }],
    flags: ["thirsty"],
    incomingFlags: ["heavy-legs", "wants-salty"],
    incomingAt: "2026-09-26T09:48:00.000Z",
    incomingRound: 4,
    athleteFeedback: { round: 4, flags: ["thirsty"], at: "2026-09-26T09:49:00.000Z", source: "athlete" },
    weather: ["warm"],
    arrivalRound: 4,
    arrivalAt: "2026-09-26T09:52:15.000Z",
    stockIds: ["water", "isostar", "custom-pizza"],
    customProducts: [{ id: "custom-pizza", label: "Pizza", portions: [{ id: "1", carbs: 30 }] }],
    unrelated: "must-not-survive",
  };
  writePitCrewLocalSnapshot(race, snapshot, storage);
  assert.equal(pitCrewStorageKey(race), "endurance-pit-crew:backyard-2026:2026-09-26");
  assert.deepEqual(readPitCrewLocalSnapshot(race, storage), normalizePitCrewSnapshot(snapshot));
});

test("old crew snapshots without a stockroom keep stockIds unset so the UI can apply its defaults", () => {
  const storage = memoryStorage();
  const race = { key: "legacy", date: "2026-09-26" };
  storage.setItem(pitCrewStorageKey(race), JSON.stringify({ history: [] }));
  const snapshot = readPitCrewLocalSnapshot(race, storage);
  assert.equal(snapshot.stockIds, null);
  assert.deepEqual(snapshot.customProducts, []);
});


test("legacy malformed Pit Crew state is sanitized instead of crashing live view", () => {
  const normalized = normalizePitCrewSnapshot({
    history: [null, { round: 3, selection: [null, { productId: "isostar", portionId: 500 }], carrySelection: "bad" }],
    customProducts: [null, { id: "broken" }, { id: "ok", portions: [{ id: 1, carbs: 25 }] }],
    athleteFeedback: { round: "3", flags: "bad", source: "athlete" },
  });
  assert.equal(normalized.history.length, 1);
  assert.deepEqual(normalized.history[0].selection, [{ productId: "isostar", portionId: "500", quantity: 1 }]);
  assert.deepEqual(normalized.history[0].carrySelection, []);
  assert.equal(normalized.customProducts.length, 1);
  assert.equal(normalized.customProducts[0].id, "ok");
  assert.equal(normalized.customProducts[0].portions[0].id, "1");
  assert.deepEqual(normalized.athleteFeedback.flags, []);
});


test("shared Pit Crew snapshot preserves editable stock targets", () => {
  const snapshot = normalizePitCrewSnapshot({ stockTargets: { isostar: { quantity: 12, unit: "× 500 ml" }, broken: { quantity: -3 } } });
  assert.deepEqual(snapshot.stockTargets, { isostar: { quantity: 12, unit: "× 500 ml" } });
});
