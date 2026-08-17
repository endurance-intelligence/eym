import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPlanChangePreview,
  canUndoPlanChange,
  mergeGeneratedWeekPlan,
  planChangeFingerprint,
  planEntriesForWeek,
  restorePlanFromSnapshot,
} from "../src/services/plannerChangePreview.js";

const weekStart = "2026-08-03";
const weekEnd = "2026-08-09";

function workout(overrides = {}) {
  return {
    id: overrides.id || crypto.randomUUID(),
    date: "2026-08-06",
    title: "8 km locker",
    type: "Easy Run",
    distance: 8,
    duration: 50,
    source: "planner-engine",
    ...overrides,
  };
}

test("plan preview shows exact distance changes without treating them as new workouts", () => {
  const before = [workout({ id: "easy" }), workout({ id: "long", date: "2026-08-09", title: "Longrun", type: "Longrun", distance: 18 })];
  const after = [workout({ id: "new-easy", distance: 4, duration: 28 }), workout({ id: "new-long", date: "2026-08-09", title: "Longrun", type: "Longrun", distance: 18 })];
  const preview = buildPlanChangePreview(before, after);
  assert.equal(preview.changed.length, 1);
  assert.deepEqual(preview.changed[0].fields, ["distance", "duration"]);
  assert.equal(preview.added.length, 0);
  assert.equal(preview.removed.length, 0);
  assert.equal(preview.beforeRunningKm, 26);
  assert.equal(preview.afterRunningKm, 22);
  assert.equal(preview.deltaRunningKm, -4);
});

test("moved workouts are displayed as one change", () => {
  const before = [workout({ id: "one", date: "2026-08-06" })];
  const after = [workout({ id: "two", date: "2026-08-07" })];
  const preview = buildPlanChangePreview(before, after);
  assert.equal(preview.changed.length, 1);
  assert.deepEqual(preview.changed[0].fields, ["date"]);
  assert.equal(preview.added.length, 0);
  assert.equal(preview.removed.length, 0);
});

test("generated plans preserve manual, completed and past entries", () => {
  const current = [
    workout({ id: "replace", date: "2026-08-06" }),
    workout({ id: "manual", date: "2026-08-07", source: "manual" }),
    workout({ id: "completed", date: "2026-08-05", completed: true }),
    workout({ id: "past", date: "2026-08-04" }),
    workout({ id: "outside", date: "2026-08-10" }),
  ];
  const generated = [workout({ id: "generated", date: "2026-08-06", distance: 5 })];
  const merged = mergeGeneratedWeekPlan(current, generated, {
    weekStart,
    weekEnd,
    offsetWeeks: 0,
    todayKey: "2026-08-05",
  });
  assert.ok(merged.some((item) => item.id === "generated"));
  assert.ok(!merged.some((item) => item.id === "replace"));
  assert.ok(merged.some((item) => item.id === "manual"));
  assert.ok(merged.some((item) => item.id === "completed"));
  assert.ok(merged.some((item) => item.id === "past"));
  assert.ok(merged.some((item) => item.id === "outside"));
});

test("undo is only possible while the applied week is unchanged", () => {
  const beforeEntries = [workout({ id: "before", distance: 8 })];
  const afterEntries = [workout({ id: "after", distance: 4 })];
  const snapshot = {
    weekStart,
    weekEnd,
    beforeEntries,
    afterFingerprint: planChangeFingerprint(afterEntries),
  };
  assert.equal(canUndoPlanChange(afterEntries, snapshot), true);
  assert.equal(canUndoPlanChange([workout({ id: "edited", distance: 5 })], snapshot), false);
  assert.equal(canUndoPlanChange([workout({ id: "after-copy", distance: 4, notes: "Manuell bearbeitet" })], snapshot), false);

  const current = [...afterEntries, workout({ id: "outside", date: "2026-08-10" })];
  const restored = restorePlanFromSnapshot(current, snapshot);
  assert.equal(planEntriesForWeek(restored, weekStart, weekEnd)[0].distance, 8);
  assert.ok(restored.some((item) => item.id === "outside"));
});


test("planned race distance counts toward the weekly running volume preview", () => {
  const before = [workout({ id: "easy", distance: 8 })];
  const after = [
    workout({ id: "easy-after", distance: 8 }),
    workout({
      id: "race",
      date: "2026-08-07",
      title: "UrLand-Lauf Oerlinghausen",
      type: "Wettkampf",
      distance: 9.6,
      raceEvent: true,
      targetEventId: "urlaender",
    }),
  ];

  const preview = buildPlanChangePreview(before, after);
  assert.equal(preview.beforeRunningKm, 8);
  assert.equal(preview.afterRunningKm, 17.6);
  assert.equal(Number(preview.deltaRunningKm.toFixed(1)), 9.6);
});
