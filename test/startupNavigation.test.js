import test from "node:test";
import assert from "node:assert/strict";
import {
  briefingStartupUrl,
  isAuthCallbackLocation,
  resetStartupLocationToBriefing,
  shouldResetToBriefing,
} from "../src/services/startupNavigation.js";

test("startup URL preserves the app path and query but resets the hash to briefing", () => {
  assert.equal(briefingStartupUrl({ pathname: "/app/", search: "?demo=1", hash: "#/planner" }), "/app/?demo=1#/");
});

test("only non-briefing hashes need a startup reset", () => {
  assert.equal(shouldResetToBriefing("#/planner"), true);
  assert.equal(shouldResetToBriefing("#/"), false);
  assert.equal(shouldResetToBriefing(""), false);
});

test("authentication callbacks are preserved so Supabase can complete sign-in or recovery", () => {
  assert.equal(isAuthCallbackLocation({ search: "?code=pkce-code", hash: "" }), true);
  assert.equal(isAuthCallbackLocation({ search: "", hash: "#access_token=token&type=recovery" }), true);
  assert.equal(shouldResetToBriefing({ search: "?code=pkce-code", hash: "#/planner" }), false);
});

test("startup reset happens before the router renders and only for ordinary app routes", () => {
  const calls = [];
  const history = {
    state: { marker: true },
    replaceState: (...args) => calls.push(args),
  };
  assert.equal(resetStartupLocationToBriefing({ pathname: "/eym/", search: "", hash: "#/analytics" }, history), true);
  assert.deepEqual(calls, [[{ marker: true }, "", "/eym/#/"]]);
  assert.equal(resetStartupLocationToBriefing({ pathname: "/eym/", search: "", hash: "#/" }, history), false);
  assert.equal(resetStartupLocationToBriefing({ pathname: "/eym/", search: "?code=auth", hash: "#/planner" }, history), false);
  assert.equal(calls.length, 1);
});
