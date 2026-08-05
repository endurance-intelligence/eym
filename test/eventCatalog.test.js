import test from "node:test";
import assert from "node:assert/strict";
import {
  eventSuggestionMissionPatch,
  eventSuggestionOnboardingPatch,
  searchRunningEvents,
} from "../src/services/eventCatalog.js";

test("typing Hermann finds the officially verified 2027 event", () => {
  const [event] = searchRunningEvents("Hermann", { referenceDate: new Date("2026-08-05T12:00:00Z") });

  assert.equal(event.id, "hermannslauf-2027");
  assert.equal(event.date, "2027-04-25");
  assert.equal(event.time, "11:00");
  assert.equal(event.targetKm, 31.1);
  assert.match(event.location, /Detmold/);
  assert.match(event.location, /Bielefeld/);
  assert.equal(event.status, "verified");
});

test("event suggestion fills the mission editor without inventing unavailable elevation", () => {
  const [event] = searchRunningEvents("55 hermann", { referenceDate: new Date("2026-08-05T12:00:00Z") });
  const patch = eventSuggestionMissionPatch(event);

  assert.equal(patch.name, "Hermannslauf 2027");
  assert.equal(patch.date, "2027-04-25");
  assert.equal(patch.time, "11:00");
  assert.equal(patch.courseType, "point_to_point");
  assert.equal(patch.surface, "mixed");
  assert.equal(patch.elevationGain, "");
  assert.equal(patch.eventDataStatus, "verified");
});

test("onboarding receives only the fields it can display safely", () => {
  const [event] = searchRunningEvents("Hermannslauf", { referenceDate: new Date("2026-08-05T12:00:00Z") });
  assert.deepEqual(eventSuggestionOnboardingPatch(event), {
    missionName: "Hermannslauf 2027",
    missionDate: "2027-04-25",
    missionDistanceKm: 31.1,
    missionGoalDiscipline: "auto",
  });
});

test("past verified events are hidden from normal future search", () => {
  assert.deepEqual(searchRunningEvents("Hermann", { referenceDate: new Date("2028-01-01T12:00:00Z") }), []);
});
