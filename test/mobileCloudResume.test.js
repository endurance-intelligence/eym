import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/context/AppContext.jsx", import.meta.url), "utf8");

test("mobile cloud sync invalidates stale writes when the app is backgrounded", () => {
  assert.match(source, /cloudSaveGeneration/);
  assert.match(source, /document\.visibilityState === "hidden"/);
  assert.match(source, /cloudSaveGeneration\.current \+= 1/);
  assert.match(source, /generation !== cloudSaveGeneration\.current/);
  assert.match(source, /document\.visibilityState !== "visible"/);
});

test("mobile resume reads cloud before writing and only raises a conflict for concurrent edits", () => {
  assert.match(source, /reconcileAfterResume/);
  assert.match(source, /window\.addEventListener\("pageshow"/);
  assert.match(source, /window\.addEventListener\("online"/);
  assert.match(source, /const remoteChanged/);
  assert.match(source, /const localDirty/);
  assert.match(source, /remoteChanged && localDirty && !samePayload/);
  assert.match(source, /remoteChanged && !localDirty/);
  assert.match(source, /stableCloudSignature/);
});

test("offline mobile changes remain explicitly local-pending instead of pretending to be synced", () => {
  assert.match(source, /setCloudStatus\("pending"\)/);
  assert.match(source, /Offline · Änderungen sind lokal gesichert/);
  assert.match(source, /setCloudStatus\("reconciling"\)/);
});
