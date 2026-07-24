import test from "node:test";
import assert from "node:assert/strict";
import { releaseScreenWakeLock, requestScreenWakeLock } from "../src/services/wakeLock.js";

test("wake lock reports unsupported browsers without failing", async () => {
  const result = await requestScreenWakeLock({});
  assert.equal(result.supported, false);
  assert.equal(result.lock, null);
});

test("wake lock can be acquired and released through the browser adapter", async () => {
  let released = false;
  const lock = { release: async () => { released = true; } };
  const result = await requestScreenWakeLock({ wakeLock: { request: async (kind) => {
    assert.equal(kind, "screen");
    return lock;
  } } });
  assert.equal(result.supported, true);
  assert.equal(result.lock, lock);
  await releaseScreenWakeLock(result.lock);
  assert.equal(released, true);
});
