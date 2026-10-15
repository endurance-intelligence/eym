import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const coachSource = fs.readFileSync(new URL("../src/pages/Coach.jsx", import.meta.url), "utf8");
const briefingSource = fs.readFileSync(new URL("../src/pages/Briefing.jsx", import.meta.url), "utf8");
const plannerSource = fs.readFileSync(new URL("../src/pages/Planner.jsx", import.meta.url), "utf8");

test("Coach Today keeps concrete guidance and replaces status noise with contextual feedback", () => {
  assert.match(coachSource, /Heute konkret/);
  assert.match(coachSource, /Coach-Feedback/);
  assert.match(coachSource, /Diese Woche zählt/);
  assert.doesNotMatch(coachSource, /Coach-Entscheidung heute/);
  assert.doesNotMatch(coachSource, /Warum entscheidet der Coach so\?/);
  assert.doesNotMatch(coachSource, /Daten hinter der Entscheidung/);
});

test("Briefing links a contextual coach note directly to the Coach page", () => {
  assert.match(briefingSource, /Coach-Anmerkung/);
  assert.match(briefingSource, /to="\/coach"/);
  assert.match(briefingSource, /Coach öffnen →/);
  assert.doesNotMatch(briefingSource, /Coach-Check/);
});

test("today workout detail reuses the Coach Today guidance", () => {
  assert.match(plannerSource, /detailTodayGuidance/);
  assert.match(plannerSource, /planner-workout-detail-today/);
  assert.match(plannerSource, />Heute konkret</);
  assert.match(plannerSource, /Coach beobachtet/);
  assert.match(plannerSource, /Wenn etwas kippt/);
});
