import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/components/PitCrewLive.jsx", import.meta.url), "utf8");

test("Pit Crew keeps test controls out of the normal live flow", () => {
  assert.doesNotMatch(source, /pit-live-demo-panel/);
  assert.match(source, /WERKZEUGE/);
  assert.match(source, /Testmodus starten/);
});

test("Pit Crew counts planned loop intake immediately and asks only for deviations", () => {
  assert.match(source, /Aufnahme zählt bereits in den Live-Daten/);
  assert.match(source, /Abweichung melden/);
  assert.match(source, /wie geplant angenommen/);
  assert.doesNotMatch(source, /Was wurde wirklich genommen\?/);
});

test("Pit weather hides manual overrides and shows per-loop operational details", () => {
  assert.match(source, /Wetter vor Ort weicht deutlich ab/);
  assert.match(source, /gefühlt \{forecast\.feelsLike\}/);
  assert.match(source, /pit-live-weather-loop-actions/);
});


test("athlete pre-feedback suppresses duplicate crew check-in and stays visible as a status banner", () => {
  assert.match(source, /if \(incomingApplies\)/);
  assert.match(source, /setCheckInOpen\(false\)/);
  assert.match(source, /RÜCKMELDUNG ATHLET/);
  assert.match(source, /Keine Änderung am vorbereiteten Plan nötig/);
});

test("Pit Crew headline names the upcoming loop weather and actual intake bar uses recorded data", () => {
  assert.match(source, /WETTER FÜR LOOP/);
  assert.match(source, /KOMMENDER LOOP/);
  assert.match(source, /IST KH/);
  assert.match(source, /IST 💧/);
});


test("Athlet zurück combines status and loop intake in one return sheet", () => {
  assert.match(source, /VERPFLEGUNG AUF LOOP/);
  assert.match(source, /Alles wie geplant/);
  assert.match(source, /½ Teilweise/);
  assert.match(source, /○ Nichts/);
  assert.match(source, /RÜCKKEHR ÜBERNEHMEN/);
  assert.match(source, /Die Crew muss den Status nicht erneut eingeben/);
});


test("shared Pit Crew route is protected by the application error boundary and exposes the KH audit", () => {
  const appSource = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const pitSource = fs.readFileSync(new URL("../src/components/PitCrewLive.jsx", import.meta.url), "utf8");
  assert.match(appSource, /<ErrorBoundary><PitCrewSharedSession token=\{sharedPitCrewToken\} \/><\/ErrorBoundary>/);
  assert.match(pitSource, /KH-BILANZ/);
  assert.match(pitSource, /PIT_CARB_TARGET\.center/);
});


test("Pit Crew sanitizes legacy live state before rendering the KH audit", () => {
  assert.match(source, /normalizePitCrewSnapshot/);
  assert.match(source, /normalizedLiveSelection/);
  assert.doesNotMatch(source, /activeSelection\.map\(\(entry, index\) => \{/);
});
