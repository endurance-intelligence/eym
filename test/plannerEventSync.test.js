import test from "node:test";
import assert from "node:assert/strict";
import { plannerEventSyncStatus } from "../src/services/plannerEventSync.js";

const asg = {
  id: "asg-bahn-2026",
  name: "ASG Bahn-Meeting 2026",
  date: "2026-09-04",
  time: "18:30",
  targetKm: 5,
  priority: "C",
  targetTime: "00:22:00",
};

function planned(overrides = {}) {
  return {
    id: "plan-asg",
    targetEventId: asg.id,
    raceEvent: true,
    title: asg.name,
    date: asg.date,
    time: asg.time,
    distance: asg.targetKm,
    duration: 22,
    goalPriority: asg.priority,
    ...overrides,
  };
}

test("a live mission event missing from an already generated week requires a refresh", () => {
  const result = plannerEventSyncStatus([asg], [
    { id: "easy", title: "8 km locker", date: "2026-09-02", type: "Easy Run", distance: 8 },
  ]);
  assert.equal(result.upToDate, false);
  assert.equal(result.missingEvents.length, 1);
  assert.equal(result.missingEvents[0].name, "ASG Bahn-Meeting 2026");
});

test("a matching race entry keeps the event week current", () => {
  const result = plannerEventSyncStatus([asg], [planned()]);
  assert.equal(result.upToDate, true);
  assert.equal(result.missingEvents.length, 0);
  assert.equal(result.changedEvents.length, 0);
});

test("editing a mission event makes the existing weekly race entry stale", () => {
  const result = plannerEventSyncStatus([{ ...asg, time: "19:00", targetKm: 5.2 }], [planned()]);
  assert.equal(result.upToDate, false);
  assert.deepEqual(result.changedEvents[0].fields.sort(), ["distance", "time"]);
});

test("removing an event from the mission flags the old race entry", () => {
  const result = plannerEventSyncStatus([], [planned()]);
  assert.equal(result.upToDate, false);
  assert.equal(result.orphanedEntries.length, 1);
});
