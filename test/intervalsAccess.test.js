import test from "node:test";
import assert from "node:assert/strict";
import {
  canUseLegacyIntervalsConnection,
  isIntervalsOwner,
} from "../supabase/functions/_shared/intervalsAccess.ts";

test("private Intervals credentials are available only to their Supabase owner", () => {
  assert.equal(isIntervalsOwner("owner-user", "owner-user"), true);
  assert.equal(isIntervalsOwner("second-user", "owner-user"), false);
  assert.equal(isIntervalsOwner("owner-user", ""), false);
});

test("the existing owner can keep syncing while personal credential storage is repaired", () => {
  assert.equal(canUseLegacyIntervalsConnection("owner-user", "owner-user", "legacy-key"), true);
  assert.equal(canUseLegacyIntervalsConnection("second-user", "owner-user", "legacy-key"), false);
  assert.equal(canUseLegacyIntervalsConnection("owner-user", "owner-user", ""), false);
});
