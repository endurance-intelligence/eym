import test from "node:test";
import assert from "node:assert/strict";
import { isIntervalsOwner } from "../supabase/functions/_shared/intervalsAccess.ts";

test("private Intervals credentials are available only to their Supabase owner", () => {
  assert.equal(isIntervalsOwner("owner-user", "owner-user"), true);
  assert.equal(isIntervalsOwner("second-user", "owner-user"), false);
  assert.equal(isIntervalsOwner("owner-user", ""), false);
});
