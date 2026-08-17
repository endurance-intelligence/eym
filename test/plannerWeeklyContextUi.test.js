import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const plannerSource = fs.readFileSync(new URL("../src/pages/Planner.jsx", import.meta.url), "utf8");

test("weekly planning separates normal availability from temporary life context in plain language", () => {
  assert.match(plannerSource, /Deine normale Trainingswoche/);
  assert.match(plannerSource, /Diese Woche anders als sonst\?/);
  assert.match(plannerSource, /Reise, Krankheit oder wenig Zeit überstimmen deine normale Tagesverfügbarkeit/);
  assert.match(plannerSource, /So berücksichtigt der Coach deine Woche/);
  assert.match(plannerSource, /Auswirkung auf den Plan/);
  assert.doesNotMatch(plannerSource, /Als Tagesconstraint erkannt/);
  assert.doesNotMatch(plannerSource, /Tagesconstraint/);
});

test("race cards expose Auto, Race Protocol and Nur Wettkampf instead of forcing full support", () => {
  assert.match(plannerSource, />Auto<\/button>/);
  assert.match(plannerSource, />Race Protocol<\/button>/);
  assert.match(plannerSource, />Nur Wettkampf<\/button>/);
  assert.match(plannerSource, /Pre-Race Fueling/);
  assert.match(plannerSource, /Trink-Reminder/);
  assert.match(plannerSource, /Race-Day Activation/);
  assert.match(plannerSource, /Kalender-Erinnerungen/);
});
