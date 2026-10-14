import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const fuelPageSource = readFileSync(new URL("../src/pages/Fuel.jsx", import.meta.url), "utf8");
const racePageSource = readFileSync(new URL("../src/pages/Race.jsx", import.meta.url), "utf8");
const racePrepSource = readFileSync(new URL("../src/components/RacePrepPlanner.jsx", import.meta.url), "utf8");
const fuelCss = readFileSync(new URL("../src/components/FuelPartner.css", import.meta.url), "utf8");

test("Fuel Lab is a product and tolerance laboratory, not a second race planner", () => {
  assert.doesNotMatch(fuelPageSource, /import FuelPartner/);
  assert.doesNotMatch(fuelPageSource, /<FuelPartner/);
  assert.doesNotMatch(fuelPageSource, /<RacePrepPlanner/);
  assert.match(fuelPageSource, /activeTab === "products"/);
});

test("Race owns setup, strategy and compact nutrition planning surfaces", () => {
  assert.match(racePageSource, /<RacePrepPlanner setupOnly \/>/);
  assert.match(racePageSource, /Eigene Gel-Basis/);
  assert.match(racePageSource, /Rundenlogik/);
  assert.match(racePageSource, /Verpflegung & VP/);
  assert.doesNotMatch(racePageSource, /\["weather", "Wetter"\]/);
});

test("Race Setup hides duplicate nutrition planning while keeping the shared editor", () => {
  assert.match(racePrepSource, /setupOnly = false/);
  assert.match(racePrepSource, /Setup speichern/);
  assert.match(racePrepSource, /Offizielle Runden/);
  assert.match(fuelCss, /\.race-prep-planner\.setup-only \.race-prep-fuel-decision/);
  assert.match(fuelCss, /\.race-prep-planner\.setup-only \.race-prep-schedule/);
});
