import test from "node:test";
import assert from "node:assert/strict";
import {
  isMainNavigationActive,
  MAIN_NAV_ITEMS,
  resolveSettingsSection,
  SETTINGS_SECTIONS,
  settingsSectionSearchParams,
  TRAINING_SECTIONS,
} from "../src/services/navigation.js";

test("main navigation is reduced to five clear areas", () => {
  assert.deepEqual(MAIN_NAV_ITEMS.map((item) => item.label), [
    "Briefing",
    "Training",
    "Coach",
    "Fuel Lab",
    "Settings",
  ]);
});

test("all former training pages belong to the Training area", () => {
  const training = MAIN_NAV_ITEMS.find((item) => item.key === "training");
  ["/planner", "/training", "/mission", "/analytics"].forEach((pathname) => {
    assert.equal(isMainNavigationActive(pathname, training), true);
  });
  assert.deepEqual(TRAINING_SECTIONS.map((item) => item.label), ["Woche", "Einheiten", "Ziele", "Analyse"]);
});

test("equipment is a Settings section and old route stays grouped with Settings", () => {
  const settings = MAIN_NAV_ITEMS.find((item) => item.key === "settings");
  assert.equal(isMainNavigationActive("/equipment", settings), true);
  assert.equal(SETTINGS_SECTIONS.some(([key]) => key === "equipment"), true);
  assert.equal(resolveSettingsSection("equipment"), "equipment");
});

test("settings section links preserve unrelated parameters and keep overview clean", () => {
  const equipment = settingsSectionSearchParams(new URLSearchParams("source=briefing"), "equipment");
  assert.equal(equipment.get("source"), "briefing");
  assert.equal(equipment.get("section"), "equipment");

  const overview = settingsSectionSearchParams(equipment, "overview");
  assert.equal(overview.get("source"), "briefing");
  assert.equal(overview.has("section"), false);
  assert.equal(resolveSettingsSection("unknown"), "overview");
});
