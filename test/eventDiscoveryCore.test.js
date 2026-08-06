import test from "node:test";
import assert from "node:assert/strict";
import {
  combineEventDiscoveryResults,
  normalizeDiscoveredEvent,
} from "../src/services/eventDiscoveryCore.js";

const referenceEvent = {
  provider: "raceresult",
  providerEventId: "390537",
  name: "Kassel Marathon 2026",
  disciplineName: "Halbmarathon",
  date: "2026-09-20T00:00:00Z",
  time: "09:15:00",
  location: "Kassel",
  countryCode: "de",
  targetKm: "21.097",
  sourceName: "Race Result",
  sourceUrl: "https://my.raceresult.com/390537/info",
};

test("discovered events are normalized without random identifiers", () => {
  const first = normalizeDiscoveredEvent(referenceEvent);
  const second = normalizeDiscoveredEvent(referenceEvent);

  assert.equal(first.id, second.id);
  assert.equal(first.id, "raceresult-390537");
  assert.equal(first.date, "2026-09-20");
  assert.equal(first.time, "09:15");
  assert.equal(first.countryCode, "DE");
  assert.equal(first.targetKm, 21.097);
});

test("local verified events and live provider results are combined and ranked", () => {
  const results = combineEventDiscoveryResults("Hermann", [{
    id: "hermannslauf-2027",
    provider: "official",
    providerEventId: "hermannslauf-2027",
    name: "Hermannslauf 2027",
    disciplineName: "Hermannslauf",
    date: "2027-04-25",
    targetKm: 31.1,
    status: "verified",
    sourceName: "Offizielle Hermannslauf-Website",
  }], [{
    id: "davengo-hermann",
    provider: "davengo",
    providerEventId: "55-hermannslauf-2027",
    name: "55. Hermannslauf 2027",
    disciplineName: "31,1 km",
    date: "2027-04-25",
    targetKm: 31.1,
    status: "provider",
    sourceName: "Davengo",
  }]);

  assert.equal(results.length, 1);
  assert.equal(results[0].provider, "official");
  assert.deepEqual(results[0].sourceAlternatives, ["Davengo"]);
});
