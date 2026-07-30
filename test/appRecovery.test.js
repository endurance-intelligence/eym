import test from "node:test";
import assert from "node:assert/strict";
import {
  clearApplicationRuntime,
  isDeploymentChunkError,
  recoverApplication,
  removeRecoveryMarker,
} from "../src/services/appRecovery.js";

test("application recovery removes stale app caches and only its own service worker", async () => {
  const removedScopes = [];
  const deletedCaches = [];
  const navigatorAdapter = {
    serviceWorker: {
      getRegistrations: async () => [
        { scope: "https://example.test/eym/", unregister: async () => removedScopes.push("/eym/") },
        { scope: "https://example.test/other/", unregister: async () => removedScopes.push("/other/") },
      ],
    },
  };
  const cachesAdapter = {
    keys: async () => ["eym-shell-v3.8.6", "unrelated-cache"],
    delete: async (key) => deletedCaches.push(key),
  };

  await clearApplicationRuntime({
    navigatorAdapter,
    cachesAdapter,
    baseUrl: "https://example.test/eym/",
  });

  assert.deepEqual(removedScopes, ["/eym/"]);
  assert.deepEqual(deletedCaches, ["eym-shell-v3.8.6"]);
});

test("hard recovery bypasses the stale document and can return to Training", async () => {
  let replacement = "";
  const windowAdapter = {
    location: {
      href: "https://example.test/eym/?keep=1#/planner",
      replace: (value) => {
        replacement = value;
      },
    },
  };

  await recoverApplication({
    windowAdapter,
    navigatorAdapter: {},
    cachesAdapter: {},
    baseUrl: "https://example.test/eym/",
    destinationHash: "#/planner",
  });

  const recovered = new URL(replacement);
  assert.equal(recovered.pathname, "/eym/");
  assert.equal(recovered.searchParams.get("keep"), "1");
  assert.ok(recovered.searchParams.get("ei-refresh"));
  assert.equal(recovered.hash, "#/planner");
});

test("successful startup removes the one-time recovery marker", () => {
  let replacement = "";
  const windowAdapter = {
    location: { href: "https://example.test/eym/?ei-refresh=abc&keep=1#/planner" },
    history: {
      state: { route: "planner" },
      replaceState: (_state, _title, value) => {
        replacement = value;
      },
    },
  };

  removeRecoveryMarker(windowAdapter);

  const cleaned = new URL(replacement);
  assert.equal(cleaned.searchParams.has("ei-refresh"), false);
  assert.equal(cleaned.searchParams.get("keep"), "1");
  assert.equal(cleaned.hash, "#/planner");
});

test("deployment chunk errors are recognized without hiding unrelated runtime errors", () => {
  assert.equal(isDeploymentChunkError(new Error("Failed to fetch dynamically imported module")), true);
  assert.equal(isDeploymentChunkError(new Error("ChunkLoadError: Loading chunk 7 failed")), true);
  assert.equal(isDeploymentChunkError(new Error("Cannot read properties of undefined")), false);
});
