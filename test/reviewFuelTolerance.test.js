import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const reviewSource = fs.readFileSync(new URL("../src/components/ReviewModal.jsx", import.meta.url), "utf8");

test("Fueling review owns GI feedback and learns taste plus quantity fatigue", () => {
  const fuelSection = reviewSource.indexOf("Fueling Review");
  const stomachScore = reviewSource.indexOf('label="Magenverträglichkeit"');
  const generalScores = reviewSource.slice(reviewSource.indexOf('className="scores review-score-grid"'), fuelSection);

  assert.ok(fuelSection > 0);
  assert.ok(stomachScore > fuelSection);
  assert.doesNotMatch(generalScores, /label="Magenverträglichkeit"/);
  assert.match(reviewSource, /tasteRating/);
  assert.match(reviewSource, /tasteAfterAmount/);
  assert.match(reviewSource, /Nach insgesamt \{fuelAmountLabel\(review\.nutritionItems, index\)\} noch Lust darauf/);
  assert.match(reviewSource, /Produktreaktion/);
  assert.match(reviewSource, /fuel-review-timeline/);
});
