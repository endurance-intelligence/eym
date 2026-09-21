import test from "node:test";
import assert from "node:assert/strict";
import { plannerEventSyncStatus, reconcileEventContinuationEntries } from "../src/services/plannerEventSync.js";

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


test("multi-day event requires a continuation entry on the next active calendar day", () => {
  const backyard = {
    id: "backyard-owl",
    name: "1. Backyard OWL",
    date: "2026-09-26",
    time: "06:00",
    targetKm: 100,
    priority: "B",
    eventLimitMode: "open",
    planningHorizonHours: 36,
  };
  const race = {
    id: "plan-backyard",
    targetEventId: backyard.id,
    raceEvent: true,
    title: backyard.name,
    date: backyard.date,
    time: backyard.time,
    distance: backyard.targetKm,
    duration: 800,
    goalPriority: backyard.priority,
  };

  const result = plannerEventSyncStatus([backyard], [race]);
  assert.equal(result.upToDate, false);
  assert.equal(result.missingContinuations.length, 1);
  assert.equal(result.missingContinuations[0].date, "2026-09-27");
});

test("event continuation repair replaces generated post-event recovery on a day where the event can still run", () => {
  const backyard = {
    id: "backyard-owl",
    name: "1. Backyard OWL",
    date: "2026-09-26",
    time: "06:00",
    priority: "B",
    eventLimitMode: "open",
    planningHorizonHours: 36,
  };
  const plan = [{
    id: "race",
    targetEventId: backyard.id,
    raceEvent: true,
    title: backyard.name,
    date: backyard.date,
    type: "Wettkampf",
  }, {
    id: "old-recovery",
    date: "2026-09-27",
    title: "Erholung nach 1. Backyard OWL",
    type: "Ruhetag",
    notes: "Erholung nach 1. Backyard OWL: keine weitere intensive Belastung in dieser Eventwoche.",
    source: "planner-engine",
  }];

  const repaired = reconcileEventContinuationEntries([backyard], plan);
  assert.equal(repaired.changed, true);
  assert.equal(repaired.plan.some((item) => item.id === "old-recovery"), false);
  const continuation = repaired.plan.find((item) => item.eventContinuation);
  assert.equal(continuation?.date, "2026-09-27");
  assert.match(continuation?.title || "", /mögliche Fortsetzung/);

  const stable = reconcileEventContinuationEntries([backyard], repaired.plan);
  assert.equal(stable.changed, false);
});
