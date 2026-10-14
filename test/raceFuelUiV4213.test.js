import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const raceSource = readFileSync(new URL("../src/pages/Race.jsx", import.meta.url), "utf8");
const missionSource = readFileSync(new URL("../src/pages/Mission.jsx", import.meta.url), "utf8");

test("race fuel UI lets the athlete exclude gels and keeps phases inside round details", () => {
  assert.match(raceSource, /toggleGelActive/);
  assert.match(raceSource, /Reserve · nicht eingeplant/);
  assert.match(raceSource, /Rundenplan & Fuel-Phasen anzeigen/);
  assert.doesNotMatch(raceSource, /<div><p className="eyebrow">Fuel-Blöcke<\/p><h2>Vier Phasen statt jede Runde einzeln\.<\/h2><\/div>/);
});

test("every-loop events do not expose manual VP editing by default", () => {
  assert.match(raceSource, /const manualVp = aidMode === "fixed_stations"/);
  assert.match(raceSource, /\{manualVp && <Card className="wide">/);
  assert.match(raceSource, /Keine manuellen VP-Einträge nötig/);
});

test("goals uses the mission hero and compact roadmap instead of the old metric grid", () => {
  assert.match(missionSource, /mission-main-hero-v2/);
  assert.match(missionSource, /mission-focus-grid/);
  assert.match(missionSource, /mission-roadmap-flow/);
  assert.match(missionSource, /mission-race-setup-details/);
  assert.doesNotMatch(missionSource, /<Metric label="Countdown"/);
});
