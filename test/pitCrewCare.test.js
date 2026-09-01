import test from "node:test";
import assert from "node:assert/strict";
import { athleteCareHints } from "../src/services/pitCrewCare.js";

test("athlete care stays quiet early when athlete and weather are stable", () => {
  const care = athleteCareHints({ round: 2, elapsedMinutes: 90, minutesToStart: 12, mode: "normal" });
  assert.equal(care.hints.length, 0);
  assert.match(care.summary, /nichts Besonderes/);
});

test("rain produces dry sock and clothing memory aids without completion tracking", () => {
  const care = athleteCareHints({ round: 5, elapsedMinutes: 260, minutesToStart: 13, mode: "normal", weather: ["rain"] });
  assert.ok(care.hints.some((item) => /Socken/.test(item.text)));
  assert.ok(care.hints.some((item) => /Oberteil|Shirt/.test(item.text)));
  assert.equal(care.urgent, true);
});

test("heavy legs suggest optional short unloading rather than mandatory treatment", () => {
  const care = athleteCareHints({ round: 7, elapsedMinutes: 380, minutesToStart: 11, mode: "normal", flags: ["heavy-legs"] });
  const legs = care.hints.find((item) => item.key === "legs-up");
  assert.ok(legs);
  assert.match(legs.text, /Wenn genug Pit-Zeit/);
  assert.match(legs.text, /leichte/);
});

test("long race periodically reminds crew about feet and tested foot care", () => {
  const care = athleteCareHints({ round: 6, elapsedMinutes: 330, minutesToStart: 10, mode: "normal" });
  const feet = care.hints.find((item) => item.key === "foot-check");
  assert.ok(feet);
  assert.match(feet.text, /Fußcreme\/Anti-Chafe/);
  assert.match(feet.text, /Training getestet/);
});

test("cold and wind prioritize warm dry layer and wind protection", () => {
  const care = athleteCareHints({
    round: 9,
    elapsedMinutes: 500,
    minutesToStart: 12,
    mode: "normal",
    weather: ["cold", "wind"],
    observation: { temperature: 8 },
  });
  assert.ok(care.hints.some((item) => item.key === "warmer-layer"));
  assert.ok(care.hints.some((item) => item.key === "wind-layer"));
});

test("go mode suppresses long care tasks and protects the next start", () => {
  const care = athleteCareHints({
    round: 12,
    elapsedMinutes: 690,
    minutesToStart: 2.2,
    mode: "go",
    flags: ["heavy-legs"],
    weather: ["rain"],
  });
  assert.ok(care.hints.some((item) => item.key === "start-first"));
  assert.equal(care.hints.some((item) => item.key === "legs-up"), false);
  assert.ok(care.hints.length <= 2);
});

test("quick mode keeps care deliberately short", () => {
  const care = athleteCareHints({ round: 10, elapsedMinutes: 570, minutesToStart: 4.2, mode: "quick", flags: ["heavy-legs", "tired"] });
  assert.ok(care.hints.some((item) => item.key === "quick-care"));
  assert.ok(care.hints.length <= 2);
});
