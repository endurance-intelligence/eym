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


test("verified fallback events are hidden for unrelated searches", () => {
  assert.deepEqual(
    searchRunningEvents("Oerlinghausen", { referenceDate: new Date("2026-08-06T07:00:00Z") }),
    [],
  );
});

test("provider priority never creates a result without a textual match", async () => {
  const { rankRunningEventSuggestions } = await import("../src/services/eventCatalog.js");
  const results = rankRunningEventSuggestions([{
    id: "rr-kassel",
    provider: "raceresult",
    name: "Kassel Marathon 2026",
    disciplineName: "Halbmarathon",
    date: "2026-09-20",
    location: "Kassel",
    targetKm: 21.097,
    status: "provider",
  }], "Oerlinghausen", { referenceDate: new Date("2026-08-06T07:00:00Z") });

  assert.deepEqual(results, []);
});

test("published provider events are ranked by name, discipline and location", async () => {
  const { rankRunningEventSuggestions } = await import("../src/services/eventCatalog.js");
  const events = rankRunningEventSuggestions([
    {
      id: "rr-kassel",
      provider: "raceresult",
      name: "Kassel Marathon 2026",
      disciplineName: "Halbmarathon",
      date: "2026-09-20",
      location: "Kassel",
      targetKm: 21.097,
      status: "provider",
    },
    {
      id: "davengo-kiel",
      provider: "davengo",
      name: "Kiel.Lauf 2026",
      disciplineName: "Halbmarathon",
      date: "2026-09-13",
      location: "Kiel",
      targetKm: 21.097,
      status: "provider",
    },
  ], "Kassel", { referenceDate: new Date("2026-08-06T07:00:00Z") });

  assert.equal(events.length, 1);
  assert.equal(events[0].id, "rr-kassel");
});

test("an official event remains authoritative when a provider returns the same race", async () => {
  const { mergeRunningEventSuggestions, searchRunningEvents } = await import("../src/services/eventCatalog.js");
  const [official] = searchRunningEvents("Hermann", { referenceDate: new Date("2026-08-06T07:00:00Z") });
  const [merged] = mergeRunningEventSuggestions(official, {
    id: "davengo-hermann",
    provider: "davengo",
    name: "55. Hermannslauf 2027",
    disciplineName: "31,1 km",
    date: "2027-04-25",
    location: "Detmold",
    targetKm: 31.1,
    sourceName: "Davengo",
    status: "provider",
  });

  assert.equal(merged.provider, "official");
  assert.equal(merged.status, "verified");
  assert.deepEqual(merged.sourceAlternatives, ["Davengo"]);
});

test("multi-word provider search requires every meaningful token to match", async () => {
  const { rankRunningEventSuggestions } = await import("../src/services/eventCatalog.js");
  const events = rankRunningEventSuggestions([
    {
      id: "rr-urland",
      provider: "raceresult",
      name: "7. UrLand-Lauf Oerlinghausen",
      date: "2026-08-21",
      location: "Oerlinghausen",
      status: "provider",
    },
    {
      id: "rr-other",
      provider: "raceresult",
      name: "Sommer Lauf Bielefeld",
      date: "2026-08-22",
      location: "Bielefeld",
      status: "provider",
    },
  ], "Lauf Oerlinghausen", { referenceDate: new Date("2026-08-11T07:00:00Z") });

  assert.deepEqual(events.map((event) => event.id), ["rr-urland"]);
});
