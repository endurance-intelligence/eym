import assert from "node:assert/strict";
import test from "node:test";
import { readableErrorText } from "../src/services/errorText.js";
import {
  intervalsStorageMessage,
  intervalsStorageProblem,
  readableIntervalsError,
} from "../supabase/functions/_shared/intervalsErrors.ts";

test("structured function errors never surface as object Object", () => {
  const nested = { message: { error: { message: "Die sichere Ablage fehlt." } } };
  assert.equal(readableErrorText(nested), "Die sichere Ablage fehlt.");
  assert.doesNotMatch(readableErrorText(nested), /object Object/);
});

test("PostgREST table errors become an actionable migration message", () => {
  const error = {
    code: "PGRST205",
    message: "Could not find the table 'public.intervals_connections' in the schema cache",
  };
  assert.equal(intervalsStorageProblem(error), "missing");
  assert.match(intervalsStorageMessage(error, "save"), /Datenbankmigration/);
  assert.doesNotMatch(intervalsStorageMessage(error, "save"), /object Object/);
});

test("unknown structured server errors retain their useful message", () => {
  const error = { code: "XX000", details: { message: "Temporärer Datenbankfehler." } };
  assert.equal(readableIntervalsError(error), "Temporärer Datenbankfehler.");
  assert.match(intervalsStorageMessage(error, "read"), /Temporärer Datenbankfehler/);
});
