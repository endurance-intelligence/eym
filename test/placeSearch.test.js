import test from "node:test";
import assert from "node:assert/strict";
import { placeSuggestionSubtitle, searchPlaces } from "../src/services/placeSearch.js";

test("place suggestions remove duplicate OSM street segments and keep the street only once", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => [1, 2, 3].map((id) => ({
      osm_type: "way",
      osm_id: id,
      name: "Rathausstraße",
      namedetails: { name: "Rathausstraße" },
      display_name: "Rathausstraße, Oerlinghausen, Kreis Lippe, Nordrhein-Westfalen, Deutschland",
      lat: "51.961",
      lon: "8.663",
      type: "residential",
      address: {
        road: "Rathausstraße",
        town: "Oerlinghausen",
        state: "Nordrhein-Westfalen",
        country: "Deutschland",
      },
    })),
  });

  try {
    const results = await searchPlaces("Rathausstrasse Oerlinghausen");
    assert.equal(results.length, 1);
    assert.equal(results[0].label, "Rathausstraße, Oerlinghausen, Nordrhein-Westfalen, Deutschland");
    assert.equal(placeSuggestionSubtitle(results[0]), "Oerlinghausen, Nordrhein-Westfalen, Deutschland");
  } finally {
    if (previousFetch === undefined) delete globalThis.fetch;
    else globalThis.fetch = previousFetch;
  }
});

test("place subtitle keeps a label whose first part is not the result name", () => {
  assert.equal(
    placeSuggestionSubtitle({ name: "Rathaus", label: "Rathausstraße 1, Oerlinghausen" }),
    "Rathausstraße 1, Oerlinghausen",
  );
});
