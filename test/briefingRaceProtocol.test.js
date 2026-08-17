import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/pages/Briefing.jsx", import.meta.url), "utf8");

test("race-day hub surfaces the next active Race Protocol checkpoint", () => {
  assert.match(source, /function raceProtocolTodayNote/);
  assert.match(source, /Race Protocol · als Nächstes/);
  assert.match(source, /raceProtocolTodayNote\(item\.raceProtocol\)/);
});
