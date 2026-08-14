import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const fuelPartnerSource = readFileSync(new URL("../src/components/FuelPartner.jsx", import.meta.url), "utf8");
const racePrepSource = readFileSync(new URL("../src/components/RacePrepPlanner.jsx", import.meta.url), "utf8");
const fuelCss = readFileSync(new URL("../src/components/FuelPartner.css", import.meta.url), "utf8");

test("Fuel Partner keeps recommendation modes compact and exposes orientation metrics", () => {
  assert.match(fuelPartnerSource, /Fuel für deinen nächsten Lauf/);
  assert.match(fuelPartnerSource, /aria-pressed=\{mode === entry\.key\}/);
  assert.match(fuelPartnerSource, /Trinkorientierung/);
  assert.match(fuelPartnerSource, /fuel-metric hydration/);
});

test("Race Prep presents setup and summary before product selection", () => {
  const setupIndex = racePrepSource.indexOf('className="race-prep-editor-heading"');
  const summaryIndex = racePrepSource.indexOf('className="race-prep-summary race-prep-summary-primary"');
  const builderIndex = racePrepSource.indexOf('className="race-prep-fuel-builder"');

  assert.ok(setupIndex >= 0);
  assert.ok(summaryIndex > setupIndex);
  assert.ok(builderIndex > summaryIndex);
  assert.match(racePrepSource, /Deine Auswahl/);
  assert.match(racePrepSource, /selectedSourceCount/);
});

test("Fuel Lab polish styles compact tabs, semantic metrics and race-prep setup", () => {
  assert.match(fuelCss, /v3\.9\.84 – Fuel Lab information hierarchy and visual cleanup/);
  assert.match(fuelCss, /\.fuel-tabs \{/);
  assert.match(fuelCss, /\.fuel-partner-metrics > \.fuel-metric/);
  assert.match(fuelCss, /\.race-prep-editor-heading/);
  assert.match(fuelCss, /\.race-prep-summary-primary/);
});
