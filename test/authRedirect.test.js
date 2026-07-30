import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildAuthRedirectUrl } from "../src/services/authRedirect.js";

test("authentication callbacks keep the GitHub Pages project path", () => {
  assert.equal(
    buildAuthRedirectUrl("https://endurance-intelligence.github.io", "/eym/"),
    "https://endurance-intelligence.github.io/eym/",
  );
  assert.equal(
    buildAuthRedirectUrl("http://localhost:5173/", "/eym/"),
    "http://localhost:5173/eym/",
  );
});

test("signup and password reset both use the shared project-aware callback", async () => {
  const source = await readFile(new URL("../src/services/supabase.js", import.meta.url), "utf8");
  assert.match(source, /options:\s*\{\s*emailRedirectTo\s*\}/);
  assert.match(source, /resetPasswordForEmail\(email,\s*\{\s*redirectTo\s*\}\)/);
  assert.equal((source.match(/buildAuthRedirectUrl\(window\.location\.origin,\s*import\.meta\.env\.BASE_URL\)/g) || []).length, 2);
});
