import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/context/AppContext.jsx", import.meta.url), "utf8");

test("backgrounding keeps an in-flight successful cloud save valid", () => {
  assert.match(source, /cloudSaveGeneration/);
  assert.match(source, /document\.visibilityState === "hidden"/);
  const hiddenBlock = source.slice(source.indexOf('document.visibilityState === "hidden"'), source.indexOf('document.visibilityState === "hidden"') + 1200);
  assert.doesNotMatch(hiddenBlock, /cloudSaveGeneration\.current \+= 1/);
  assert.match(source, /generation !== cloudSaveGeneration\.current/);
  assert.match(source, /document\.visibilityState !== "visible"/);
});

test("mobile resume performs a three-way merge before raising a real conflict", () => {
  assert.match(source, /mergeCloudStates/);
  assert.match(source, /cloudBaseSnapshot/);
  assert.match(source, /reconcileAfterResume/);
  assert.match(source, /window\.addEventListener\("pageshow"/);
  assert.match(source, /window\.addEventListener\("online"/);
  assert.match(source, /const remoteChanged/);
  assert.match(source, /const localDirty/);
  assert.match(source, /mergeCloudStates\(baseSnapshot, localSnapshot, remoteSnapshot\)/);
  assert.match(source, /if \(merged\.clean\)/);
  assert.match(source, /Dasselbe Objekt wurde auf zwei Geräten unterschiedlich geändert/);
});

test("offline mobile changes remain explicitly local-pending instead of pretending to be synced", () => {
  assert.match(source, /setCloudStatus\("pending"\)/);
  assert.match(source, /Offline · Änderungen sind lokal gesichert/);
  assert.match(source, /setCloudStatus\("reconciling"\)/);
});
