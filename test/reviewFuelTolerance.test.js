import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const reviewSource = fs.readFileSync(new URL("../src/components/ReviewModal.jsx", import.meta.url), "utf8");

test("Fuel Lab entries expose timing and intake-specific GI feedback", () => {
  assert.match(reviewSource, /selectedFuel \|\| item\.mode === "manual"/);
  assert.match(reviewSource, /Magenverträglichkeit dieser Aufnahme/);
  assert.match(reviewSource, /intakeSymptoms/);
  assert.match(reviewSource, /intakeReactionNote/);
});
