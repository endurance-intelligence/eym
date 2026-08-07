import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("router disables React transitions so lazy routes can leave Briefing immediately", () => {
  const appSource = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(appSource, /<HashRouter\s+useTransitions=\{false\}>/);
});

test("startup no longer forces the application back to Briefing", () => {
  const mainSource = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(mainSource, /resetStartupLocationToBriefing|briefingStartupUrl|shouldResetToBriefing/);
});
