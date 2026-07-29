import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEventWeek,
  eventCourseProfile,
  eventPolicy,
  missionEvents,
  selectStrategicTarget,
} from "../src/services/goalPlanning.js";

const mission = {
  id: "heartbeat",
  name: "Heartbeat Ultra Fulda",
  date: "2026-11-21",
  time: "06:00",
  targetKm: 112,
  milestones: [
    {
      id: "urlaender",
      name: "7. UrLand-Lauf Oerlinghausen",
      date: "2026-08-21",
      time: "18:00",
      targetKm: 9.6,
      priority: "C",
      goalType: "training",
    },
    {
      id: "backyard",
      name: "Backyard Ultra",
      date: "2026-09-26",
      time: "06:00",
      targetKm: 100,
      priority: "B",
      goalType: "finish",
    },
  ],
};

test("C events shape their week without replacing the next strategic A/B target", () => {
  const events = missionEvents(mission);
  assert.deepEqual(events.map((event) => event.priority), ["C", "B", "A"]);

  const strategic = selectStrategicTarget(mission, new Date("2026-08-17T12:00:00"));
  assert.equal(strategic.id, "backyard");
  assert.equal(strategic.priority, "B");

  const eventWeek = buildEventWeek(mission, new Date("2026-08-17T00:00:00"));
  assert.equal(eventWeek.primary.id, "urlaender");
  assert.equal(eventWeek.priority, "C");
  assert.equal(eventWeek.hardProtectionDays, 3);
  assert.equal(eventWeek.totalDistanceKm, 9.6);
});

test("B and A event weeks receive progressively stronger freshness protection", () => {
  const bWeek = buildEventWeek(mission, new Date("2026-09-21T00:00:00"));
  const aWeek = buildEventWeek(mission, new Date("2026-11-16T00:00:00"));

  assert.equal(bWeek.priority, "B");
  assert.equal(bWeek.hardProtectionDays, 4);
  assert.equal(aWeek.priority, "A");
  assert.equal(aWeek.hardProtectionDays, 5);
  assert.ok(eventPolicy("A").supplementalShare < eventPolicy("C").supplementalShare);
});

test("after the B milestone the later A goal becomes the strategic target", () => {
  const strategic = selectStrategicTarget(mission, new Date("2026-10-01T12:00:00"));
  assert.equal(strategic.id, "heartbeat");
  assert.equal(strategic.priority, "A");
});

test("course profiles keep explicit route and aid-station data while migrating known legacy loops", () => {
  assert.deepEqual(eventCourseProfile({
    name: "Backyard Ultra",
  }), {
    courseType: "loop",
    loopKm: 6.7,
    aidStationMode: "every_loop",
  });

  assert.deepEqual(eventCourseProfile({
    name: "Mein Rundenrennen",
    courseType: "loop",
    loopKm: 5,
    aidStationMode: "fixed_stations",
  }), {
    courseType: "loop",
    loopKm: 5,
    aidStationMode: "fixed_stations",
  });

  assert.deepEqual(eventCourseProfile({
    name: "Stadt zu Stadt",
    courseType: "point_to_point",
    loopKm: 8,
    aidStationMode: "self_supported",
  }), {
    courseType: "point_to_point",
    loopKm: 0,
    aidStationMode: "self_supported",
  });
});
