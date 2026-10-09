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

test("Race owns the race setup and nutrition planning surfaces", () => {
  assert.match(racePageSource, /<RacePrepPlanner setupOnly \/>/);
  assert.match(racePageSource, /Persönliche Fuel-Prio/);
  assert.match(racePageSource, /Pit-Crew-Logik/);
  assert.match(racePageSource, /Verpflegung & VP/);
});

test("Race Rennbasis hides duplicate nutrition planning while keeping the shared editor", () => {
  assert.match(racePrepSource, /setupOnly = false/);
  assert.match(racePrepSource, /Rennbasis speichern/);
  assert.match(fuelCss, /\.race-prep-planner\.setup-only \.race-prep-fuel-decision/);
  assert.match(fuelCss, /\.race-prep-planner\.setup-only \.race-prep-schedule/);
});
