import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/components/PitCrewLive.jsx", import.meta.url), "utf8");

test("Pit Crew keeps test controls out of the normal live flow", () => {
  assert.doesNotMatch(source, /pit-live-demo-panel/);
  assert.match(source, /WERKZEUGE/);
  assert.match(source, /Testmodus starten/);
});

test("Pit Crew defaults loop intake to planned and asks only for deviations", () => {
  assert.match(source, /Keine Bestätigung nötig/);
  assert.match(source, /Abweichung melden/);
  assert.doesNotMatch(source, /Was wurde wirklich genommen\?/);
});

test("Pit weather hides manual overrides and shows per-loop operational details", () => {
  assert.match(source, /Wetter vor Ort weicht deutlich ab/);
  assert.match(source, /gefühlt \{forecast\.feelsLike\}/);
  assert.match(source, /pit-live-weather-loop-actions/);
});
