import assert from "node:assert/strict";
import test from "node:test";
import {
  decryptIntervalsApiKey,
  encryptIntervalsApiKey,
} from "../supabase/functions/_shared/intervalsCredentials.ts";

test("Intervals API keys are encrypted and can be restored with the server secret", async () => {
  const apiKey = "private-intervals-key";
  const encrypted = await encryptIntervalsApiKey(
    apiKey,
    "server-side-credential-secret",
    new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
  );

  assert.match(encrypted, /^v1\./);
  assert.doesNotMatch(encrypted, /private-intervals-key/);
  assert.equal(
    await decryptIntervalsApiKey(encrypted, "server-side-credential-secret"),
    apiKey,
  );
  await assert.rejects(
    decryptIntervalsApiKey(encrypted, "wrong-secret"),
  );
});
