import test from "node:test";
import assert from "node:assert/strict";
import { fuelLabTabSearchParams, resolveFuelLabTab } from "../src/services/fuelLabTabs.js";

test("Fuel Lab opens the Fuel Partner by default", () => {
  assert.equal(resolveFuelLabTab(null), "partner");
  assert.equal(resolveFuelLabTab("unknown"), "partner");
});

test("Fuel Lab keeps both tab destinations explicit", () => {
  assert.equal(resolveFuelLabTab("partner"), "partner");
  assert.equal(resolveFuelLabTab("products"), "products");
});

test("switching Fuel Lab tabs preserves the selected workout", () => {
  const next = fuelLabTabSearchParams(new URLSearchParams("workout=orc-track-1"), "products");

  assert.equal(next.get("tab"), "products");
  assert.equal(next.get("workout"), "orc-track-1");
});
