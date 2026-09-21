import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const planner = fs.readFileSync(new URL("../src/pages/Planner.jsx", import.meta.url), "utf8");

test("empty planner days render as explicit recovery instead of + frei", () => {
  assert.match(planner, /Ruhetag \/ Erholung/);
  assert.match(planner, /planner-rest-placeholder/);
  assert.doesNotMatch(planner, />\+ frei<\/button>/);
});

test("passive recovery detail offers deliberate training add instead of opening the generic add form immediately", () => {
  assert.match(planner, /openPassiveRestDay/);
  assert.match(planner, /addTrainingOnRestDay/);
  assert.match(planner, /Training hinzufügen/);
});
