import test from "node:test";
import assert from "node:assert/strict";
import {
  davengoCandidateUrls,
  dedupeProviderEvents,
  extractDavengoLinks,
  parseDavengoEventPage,
  parseDistanceKm,
  parseJsonResponseText,
  parseProviderDateRange,
  parseRaceResultEventPage,
  parseRaceResultPayload,
} from "../supabase/functions/event-search/providers.js";

test("provider parser accepts JSON and JSONP responses", () => {
  assert.deepEqual(parseJsonResponseText('[{"id":1}]'), [{ id: 1 }]);
  assert.deepEqual(parseJsonResponseText('callback({"events":[{"id":2}]});'), { events: [{ id: 2 }] });
  assert.equal(parseJsonResponseText("not-json"), null);
});

test("distance and German date ranges are parsed without inventing values", () => {
  assert.equal(parseDistanceKm("Distanz: 42,195 km"), 42.195);
  assert.equal(parseDistanceKm("Bambinilauf ca. 600 m"), 0.6);
  assert.deepEqual(parseProviderDateRange("03. - 04. Oktober 2026"), {
    date: "2026-10-03",
    endDate: "2026-10-04",
  });
});

test("Race Result list payload is normalized and filtered by query", () => {
  const events = parseRaceResultPayload({ events: [
    {
      EventID: 390537,
      EventName: "Kassel Marathon 2026",
      DateFrom: "2026-09-20",
      City: "Kassel",
      CountryCode: "DE",
    },
    {
      EventID: 123,
      EventName: "Kiel Lauf 2026",
      DateFrom: "2026-09-13",
      City: "Kiel",
      CountryCode: "DE",
    },
  ] }, "Kassel", { referenceDate: "2026-08-06" });

  assert.equal(events.length, 1);
  assert.equal(events[0].providerEventId, "390537");
  assert.equal(events[0].name, "Kassel Marathon 2026");
  assert.equal(events[0].location, "Kassel, DE");
  assert.equal(events[0].sourceUrl, "https://my.raceresult.com/390537/info");
});

test("Race Result event JSON-LD enriches date, time and address", () => {
  const html = `
    <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Event","name":"Kassel Marathon 2026","startDate":"2026-09-20T09:00:00+02:00","endDate":"2026-09-20","location":{"@type":"Place","address":{"streetAddress":"Auestadion","addressLocality":"Kassel","addressCountry":"DE"}},"description":"Marathon 42,195 km"}
    </script>`;
  const event = parseRaceResultEventPage(html, {
    provider: "raceresult",
    name: "Kassel Marathon 2026",
    date: "2026-09-20",
    sourceUrl: "https://my.raceresult.com/390537/info",
  });

  assert.equal(event.time, "09:00");
  assert.equal(event.location, "Auestadion, Kassel, DE");
  assert.equal(event.countryCode, "DE");
  assert.equal(event.targetKm, 42.195);
});

test("Davengo links are restricted to Davengo event pages", () => {
  const html = `
    <a href="/event/overview/kiel-lauf-2026">Kiel.Lauf 2026</a>
    <a href="https://evil.example/event/overview/fake">Fake Event</a>
    <a href="/cms/HOME">Home</a>`;
  assert.deepEqual(extractDavengoLinks(html), [{
    name: "Kiel.Lauf 2026",
    url: "https://www.davengo.com/event/overview/kiel-lauf-2026",
  }]);
});

test("Davengo event pages produce one selectable entry per running discipline", () => {
  const html = `
    <h1>City-Lauf Lübeck 2026</h1>
    <div class="location">Lübeck</div>
    <div class="date">27. September 2026</div>
    <h2>Halbmarathon</h2>
    <div>Sportart Laufen Distanz 21,097 km Startzeit 27.09.2026, 09:00 Uhr</div>
    <h2>10 km Lauf</h2>
    <div>Sportart Laufen Distanz 10 km Startzeit 27.09.2026, 10:15 Uhr</div>
    <h2>5 km Walking</h2>
    <div>Sportart Walking Distanz 5 km Startzeit 27.09.2026, 11:00 Uhr</div>`;
  const events = parseDavengoEventPage(
    html,
    "https://www.davengo.com/event/overview/city-lauf-luebeck-2026",
    "Lübeck",
  );

  assert.equal(events.length, 2);
  assert.deepEqual(events.map((event) => event.targetKm), [21.097, 10]);
  assert.deepEqual(events.map((event) => event.time), ["09:00", "10:15"]);
  assert.ok(events.every((event) => event.location === "Lübeck"));
});

test("Davengo direct candidates include common compound Lauf slugs", () => {
  const urls = davengoCandidateUrls("Hermann", new Date("2026-08-06T07:00:00Z"));
  assert.ok(urls.includes("https://www.davengo.com/event/overview/hermannslauf-2027"));
  assert.ok(urls.includes("https://www.davengo.com/v3/event/register/hermannslauf-2027/overview"));
});

test("provider dedupe prefers Race Result for identical provider records", () => {
  const events = dedupeProviderEvents([
    { provider: "davengo", name: "Kassel Marathon 2026", date: "2026-09-20", disciplineName: "Marathon", targetKm: 42.195 },
    { provider: "raceresult", name: "Kassel Marathon 2026", date: "2026-09-20", disciplineName: "Marathon", targetKm: 42.195 },
  ]);
  assert.equal(events.length, 1);
  assert.equal(events[0].provider, "raceresult");
});

test("Race Result parser also finds event arrays inside nested response envelopes", () => {
  const events = parseRaceResultPayload({ response: { payload: { Results: [
    {
      EventId: 987654,
      EventName: "Oerlinghausen Stadtlauf 2026",
      EventDate: "2026-09-06",
      City: "Oerlinghausen",
      CountryCode: "DE",
    },
  ] } } }, "Oerlinghausen", { referenceDate: "2026-08-11" });

  assert.equal(events.length, 1);
  assert.equal(events[0].providerEventId, "987654");
  assert.equal(events[0].date, "2026-09-06");
});
