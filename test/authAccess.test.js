import test from "node:test";
import assert from "node:assert/strict";
import { signupEnabled } from "../src/services/authAccess.js";

test("fresh-account registration is available by default and can be closed explicitly", () => {
  assert.equal(signupEnabled(undefined), true);
  assert.equal(signupEnabled("true"), true);
  assert.equal(signupEnabled("false"), false);
  assert.equal(signupEnabled("0"), false);
  assert.equal(signupEnabled("off"), false);
});
