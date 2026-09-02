import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPitCrewShareUrl,
  pitCrewStorageKey,
  readPitCrewLocalSnapshot,
  rememberPitCrewShareToken,
  storedPitCrewShareToken,
  writePitCrewLocalSnapshot,
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
    weather: ["warm"],
    arrivalRound: 4,
    arrivalAt: "2026-09-26T09:52:15.000Z",
    unrelated: "must-not-survive",
  };
  writePitCrewLocalSnapshot(race, snapshot, storage);
  assert.equal(pitCrewStorageKey(race), "endurance-pit-crew:backyard-2026:2026-09-26");
  assert.deepEqual(readPitCrewLocalSnapshot(race, storage), {
    anchorAt: snapshot.anchorAt,
    history: snapshot.history,
    flags: snapshot.flags,
    weather: snapshot.weather,
    arrivalRound: snapshot.arrivalRound,
    arrivalAt: snapshot.arrivalAt,
  });
});
