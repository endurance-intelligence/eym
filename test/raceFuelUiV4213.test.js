import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const raceSource = readFileSync(new URL("../src/pages/Race.jsx", import.meta.url), "utf8");
const missionSource = readFileSync(new URL("../src/pages/Mission.jsx", import.meta.url), "utf8");

test("race fuel UI uses the Fuel Lab shelf and keeps phase guidance inside each round", () => {
  assert.match(raceSource, /toggleGelActive/);
  assert.match(raceSource, /Reserve · nicht eingeplant/);
  assert.match(raceSource, /Alle \{fuelRotation\.length\} Runden anzeigen/);
  assert.match(raceSource, /phaseForRound\(phases, row\.round\)/);
  assert.match(raceSource, /Alle nicht archivierten Gels aus deinem Fuel Lab/);
  assert.doesNotMatch(raceSource, /race-phase-grid compact/);
});

test("every-loop events do not expose manual VP editing by default", () => {
  assert.match(raceSource, /const manualVp = aidMode === "fixed_stations"/);
  assert.match(raceSource, /\{manualVp && <Card className="wide">/);
  assert.match(raceSource, /manuelle VP-Zeilen sind dafür nicht nötig/);
});

test("goals uses the mission hero and compact roadmap instead of the old metric grid", () => {
  assert.match(missionSource, /mission-main-hero-v2/);
  assert.match(missionSource, /mission-focus-grid/);
  assert.match(missionSource, /mission-roadmap-flow/);
  assert.match(missionSource, /mission-race-setup-details/);
  assert.doesNotMatch(missionSource, /<Metric label="Countdown"/);
});

test("race fuel UI configures drink source once and applies it to the round plan", () => {
  assert.match(raceSource, /Getränkebasis/);
  assert.match(raceSource, /Eigenes Getränk/);
  assert.match(raceSource, /Veranstalter · bekannt/);
  assert.match(raceSource, /Veranstalter · unbekannt/);
  assert.match(raceSource, /Getränke-KH zählen zum selben Kohlenhydratbudget wie Gels/);
  assert.match(raceSource, /6 g KH \/ 100 ml/);
});
