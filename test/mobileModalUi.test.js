import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const css = fs.readFileSync(new URL("../src/styles/neoUi.css", import.meta.url), "utf8");

test("mobile dialogs render above the fixed bottom navigation", () => {
  assert.match(css, /\.shell>aside\{[\s\S]*?z-index:1000/);
  assert.match(css, /\.modal-backdrop\{z-index:1600/);
});

test("mobile dialog actions remain reachable above the safe area", () => {
  assert.match(css, /\.review-summary-actions,[\s\S]*?\.planner-workout-detail-actions,[\s\S]*?\.modal-actions\{[\s\S]*?position:sticky;[\s\S]*?bottom:0;[\s\S]*?safe-area-inset-bottom/);
  assert.match(css, /\.review-modal>button\.primary:last-child,[\s\S]*?\.planner-modal>button\.primary:last-child\{[\s\S]*?position:sticky;[\s\S]*?bottom:0/);
});
