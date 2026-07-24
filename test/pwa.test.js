import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("web app manifest and offline shell use the GitHub Pages relative scope", async () => {
  const manifest = JSON.parse(await readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));
  const worker = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
  assert.equal(manifest.start_url, "./#/");
  assert.equal(manifest.scope, "./");
  assert.equal(manifest.display, "standalone");
  assert.match(worker, /manifest\.webmanifest/);
  assert.match(worker, /request\.mode === "navigate"/);
});
