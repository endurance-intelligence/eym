import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/styles/main.css", import.meta.url), "utf8");
const briefing = readFileSync(new URL("../src/pages/Briefing.jsx", import.meta.url), "utf8");
const planner = readFileSync(new URL("../src/pages/Planner.jsx", import.meta.url), "utf8");

test("desktop training role/action column stays fixed so badges do not shift the activity row", () => {
  assert.match(css, /grid-template-columns:minmax\(0,1fr\) 250px/);
  assert.match(css, /\.activity-row-tools\{[\s\S]*?width:250px/);
});

test("rest day pill uses explicit recovery wording and yoga marker", () => {
  assert.match(briefing, /Ruhetag \/ Erholung 🧘/);
  assert.doesNotMatch(briefing, /status: "Frei"/);
});


test("planner refuses materially different same-day activities as automatic completions", () => {
  assert.match(planner, /plannedActivityCompatibility\(activity, plan\)\.compatible/);
  assert.match(planner, /staleLinks/);
});
