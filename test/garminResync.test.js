import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const plannerSource = fs.readFileSync(new URL("../src/pages/Planner.jsx", import.meta.url), "utf8");
const raceCoachSource = fs.readFileSync(new URL("../src/components/RaceCoach.jsx", import.meta.url), "utf8");
const intervalsServiceSource = fs.readFileSync(new URL("../src/services/intervals.js", import.meta.url), "utf8");
const intervalsFunctionSource = fs.readFileSync(new URL("../supabase/functions/intervals/index.ts", import.meta.url), "utf8");

test("Garmin resend requests a real downstream refresh instead of an unchanged Intervals upsert", () => {
  assert.match(plannerSource, /forceGarminRefresh:\s*Boolean\(publishedWeek\)/);
  assert.match(intervalsServiceSource, /forceGarminRefresh = false/);
  assert.match(intervalsServiceSource, /forceGarminRefresh \}/);
});

test("forced Garmin refresh deletes existing guided Intervals workouts before recreating them", () => {
  assert.match(intervalsFunctionSource, /const forceGarminRefresh = Boolean\(body\.forceGarminRefresh\)/);
  assert.match(intervalsFunctionSource, /const refreshExternalIds = new Set/);
  assert.match(intervalsFunctionSource, /\.filter\(\(item\) => isGuidedPlanItem\(item\)\)/);
  assert.match(intervalsFunctionSource, /refreshEvents\.map\(\(event\) => \(\{ id: event\.id, external_id: event\.external_id \}\)\)/);
  assert.match(intervalsFunctionSource, /refreshed,/);
});

test("Race Strategy resend also recreates its Intervals workout before Garmin export", () => {
  assert.match(raceCoachSource, /forceGarminRefresh:\s*Boolean\(setup\.garminPublishedAt\)/);
  assert.match(raceCoachSource, /existingEventId:\s*setup\.garminPublishedEventId/);
  assert.match(intervalsServiceSource, /publishIntervalsRaceWorkout\(workout, \{ forceGarminRefresh = false, existingEventId = null \} = \{\}\)/);
  assert.match(intervalsFunctionSource, /if \(forceGarminRefresh\) \{/);
  assert.match(intervalsFunctionSource, /body: JSON\.stringify\(\[\{ id: refreshEvent\.id, external_id: externalId \}\]\)/);
});

test("Garmin resend UI explains the seven-day window and fresh recreation behavior", () => {
  assert.match(plannerSource, /nächsten 7-Tage-Fenster/);
  assert.match(plannerSource, /gelöscht und frisch angelegt/);
  assert.match(plannerSource, /Garmin-Export erneut ausgelöst/);
});
