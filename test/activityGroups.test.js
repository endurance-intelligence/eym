import test from "node:test";
import assert from "node:assert/strict";
import { activitiesWithGroups, suggestedGroupName } from "../src/services/activityGroups.js";

const activities = [
  { id: "warmup", name: "ORC Track - warm up", type: "Run", startDateLocal: "2026-07-21T19:04:00", distance: 3, duration: 20, elevation: 10 },
  { id: "intervals", name: "ORC Track - Intervalle", type: "Run", startDateLocal: "2026-07-21T19:30:00", distance: 7.2, duration: 38, elevation: 20 },
  { id: "cooldown", name: "ORC Track - cool down", type: "Run", startDateLocal: "2026-07-21T20:21:00", distance: 1, duration: 8, elevation: 5 },
];

test("stored ORC group replaces its raw member activities everywhere", () => {
  const group = {
    id: "activity-group-orc-track",
    name: "ORC Track – Gesamteinheit",
    memberActivityIds: activities.map((activity) => activity.id),
  };
  const result = activitiesWithGroups(activities, [group]);

  assert.equal(result.length, 1);
  assert.equal(result[0].id, group.id);
  assert.equal(result[0].memberCount, 3);
  assert.deepEqual(result[0].memberActivityIds, ["warmup", "intervals", "cooldown"]);
  assert.equal(result[0].distance, 11.2);
  assert.equal(result[0].duration, 66);
});

test("ORC track parts receive the expected group name regardless of the main set label", () => {
  assert.equal(suggestedGroupName(activities), "ORC Track – Gesamteinheit");
  assert.equal(suggestedGroupName(activities.map((activity) => ({ ...activity, name: activity.name.replace("Intervalle", "Sprints") }))), "ORC Track – Gesamteinheit");
});
