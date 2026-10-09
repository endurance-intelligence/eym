import test from "node:test";
import assert from "node:assert/strict";
import { mergeCloudStates } from "../src/services/cloudMerge.js";

test("cloud merge combines independent object changes", () => {
  const base = { reviews: { a: { rpe: 4 } }, settings: { theme: "dark" } };
  const local = { reviews: { a: { rpe: 5 } }, settings: { theme: "dark" } };
  const remote = { reviews: { a: { rpe: 4 } }, settings: { theme: "light" } };
  const merged = mergeCloudStates(base, local, remote);
  assert.equal(merged.clean, true);
  assert.equal(merged.value.reviews.a.rpe, 5);
  assert.equal(merged.value.settings.theme, "light");
});

test("cloud merge combines changes to different entities in an array", () => {
  const base = { planned: [{ id: "a", status: "planned" }, { id: "b", status: "planned" }] };
  const local = { planned: [{ id: "a", status: "missed" }, { id: "b", status: "planned" }] };
  const remote = { planned: [{ id: "a", status: "planned" }, { id: "b", status: "completed" }] };
  const merged = mergeCloudStates(base, local, remote);
  assert.equal(merged.clean, true);
  assert.deepEqual(merged.value.planned, [{ id: "a", status: "missed" }, { id: "b", status: "completed" }]);
});

test("cloud merge reports a real conflict when the same value changes differently", () => {
  const base = { reviews: { a: { rpe: 4 } } };
  const local = { reviews: { a: { rpe: 5 } } };
  const remote = { reviews: { a: { rpe: 7 } } };
  const merged = mergeCloudStates(base, local, remote);
  assert.equal(merged.clean, false);
  assert.deepEqual(merged.conflicts, ["reviews.a.rpe"]);
});
