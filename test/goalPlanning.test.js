import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEventWeek,
  eventActiveOnDate,
  eventCourseProfile,
  eventPlanningWindowMinutes,
  eventPolicy,
  missionEvents,
  selectStrategicTarget,
  eventRelation,
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
    loopMode: "fixed_interval",
    loopIntervalMinutes: 60,
    eventLimitMode: "open",
    planningHorizonHours: 0,
    eventTimeLimit: "",
    eventTimeLimitMinutes: 0,
    plannedStopMinutes: 0,
  });

  assert.deepEqual(eventCourseProfile({
    name: "Heartbeat Ultra Fulda",
    courseType: "loop",
    loopKm: 6,
  }), {
    courseType: "loop",
    loopKm: 6.2,
    aidStationMode: "every_loop",
    loopMode: "time_limit",
    loopIntervalMinutes: 0,
    eventLimitMode: "limited",
    planningHorizonHours: 0,
    eventTimeLimit: "14:00:00",
    eventTimeLimitMinutes: 840,
    plannedStopMinutes: 3,
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
    loopMode: "free",
    loopIntervalMinutes: 0,
    eventLimitMode: "",
    planningHorizonHours: 0,
    eventTimeLimit: "",
    eventTimeLimitMinutes: 0,
    plannedStopMinutes: 0,
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
    loopMode: "free",
    loopIntervalMinutes: 0,
    eventLimitMode: "",
    planningHorizonHours: 0,
    eventTimeLimit: "",
    eventTimeLimitMinutes: 0,
    plannedStopMinutes: 0,
  });
});


test("Backyard course profile separates open-end planning horizon from a true event limit", () => {
  const open = eventCourseProfile({ name: "1. Backyard OWL", courseType: "loop", loopKm: 6.7, loopMode: "fixed_interval", loopIntervalMinutes: 60, eventLimitMode: "open", planningHorizonHours: 36, targetKm: 100 });
  assert.equal(open.eventLimitMode, "open");
  assert.equal(open.planningHorizonHours, 36);
  assert.equal(open.eventTimeLimitMinutes, 0);

  const limited = eventCourseProfile({ name: "36h Backyard", courseType: "loop", loopKm: 6.7, loopMode: "fixed_interval", loopIntervalMinutes: 60, eventLimitMode: "limited", eventTimeLimit: "36:00:00" });
  assert.equal(limited.eventLimitMode, "limited");
  assert.equal(limited.planningHorizonHours, 0);
  assert.equal(limited.eventTimeLimitMinutes, 2160);
});

test("36 h open Backyard planning window remains active on the following calendar day", () => {
  const event = {
    id: "backyard-36h",
    name: "1. Backyard OWL",
    date: "2026-09-26",
    time: "06:00",
    courseType: "loop",
    loopMode: "fixed_interval",
    eventLimitMode: "open",
    planningHorizonHours: 36,
  };
  assert.equal(eventPlanningWindowMinutes(event), 2160);
  assert.equal(eventActiveOnDate(event, "2026-09-26"), true);
  assert.equal(eventActiveOnDate(event, "2026-09-27"), true);
  assert.equal(eventActiveOnDate(event, "2026-09-28"), false);

  const relation = eventRelation("2026-09-27", { events: [event] });
  assert.equal(relation.active, true);
  assert.equal(relation.days, 0);
  assert.equal(relation.continuesFromPreviousDay, true);
});
