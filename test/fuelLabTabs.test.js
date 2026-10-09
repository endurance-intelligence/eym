import test from "node:test";
import assert from "node:assert/strict";
import { FUEL_LAB_TABS, fuelLabTabSearchParams, resolveFuelLabTab } from "../src/services/fuelLabTabs.js";

test("Fuel Lab opens directly on the product laboratory", () => {
  assert.equal(resolveFuelLabTab(null), "products");
  assert.equal(resolveFuelLabTab("unknown"), "products");
  assert.deepEqual(FUEL_LAB_TABS, [["products", "Produkte"]]);
});

test("legacy Fuel Partner and Race Prep routes collapse into products", () => {
  assert.equal(resolveFuelLabTab("partner"), "products");
  assert.equal(resolveFuelLabTab("race-prep"), "products");
  assert.equal(resolveFuelLabTab("products"), "products");
});

test("Fuel Lab tab normalization preserves the selected workout parameter", () => {
  const next = fuelLabTabSearchParams(new URLSearchParams("workout=orc-track-1"), "partner");

  assert.equal(next.get("tab"), "products");
  assert.equal(next.get("workout"), "orc-track-1");
});
