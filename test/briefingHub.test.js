import test from "node:test";
import assert from "node:assert/strict";
import {
  currentWeekPrescription,
  keySessionDateLabel,
  missionFocusTarget,
  nextKeySession,
  startOfWeekIso,
  weekHubSummary,
} from "../src/services/briefingHub.js";

test("briefing uses the prescription of the current local week", () => {
  const now = new Date("2026-08-06T12:00:00");
  assert.equal(startOfWeekIso(now), "2026-08-03");
  const prescription = { weekType: { label: "Entlastungswoche" } };
  assert.equal(currentWeekPrescription({ weekPrescriptions: { "2026-08-03": prescription } }, now), prescription);
});

test("week hub explains type, corridor and completed load without a fixed target chase", () => {
  const summary = weekHubSummary({
    planner: {
      weekPrescriptions: {
        "2026-08-03": {
          weekType: { label: "Entlastungswoche", tone: "recovery" },
          corridor: { label: "42–47 km" },
          focus: "Belastung verarbeiten und Bewegungsqualität erhalten.",
        },
      },
    },
    now: new Date("2026-08-06T12:00:00"),
    openItems: 5,
    completedKm: 23.9,
  });
  assert.equal(summary.typeLabel, "Entlastungswoche");
  assert.equal(summary.corridorLabel, "42–47 km");
  assert.equal(summary.tone, "recovery");
  assert.match(summary.meta, /23\.9 km absolviert/);
});

test("next key session is selected by date while ordinary quality is not promoted", () => {
  const result = nextKeySession({
    now: new Date("2026-08-06T12:00:00"),
    plan: [
      { id: "quality", date: "2026-08-07", title: "5 x 1000 m", type: "Laufen", notes: "Intervalle" },
      { id: "key", date: "2026-08-09", time: "08:00", title: "4 x 6,7 km Backyard", type: "Laufen", keySession: true },
      { id: "later", date: "2026-08-12", title: "Longrun", type: "Laufen", keySession: true },
    ],
  });
  assert.equal(result.item.id, "key");
  assert.equal(result.assessment.isKeySession, true);
  assert.match(result.assessment.markers.map((marker) => marker.key).join(","), /key/);
});

test("completed or missed key sessions are not presented as next stimulus", () => {
  const result = nextKeySession({
    now: new Date("2026-08-06T12:00:00"),
    plan: [
      { id: "done", date: "2026-08-07", title: "Track", keySession: true, completed: true },
      { id: "missed", date: "2026-08-08", title: "Longrun", keySession: true, missedReason: "Familie" },
    ],
  });
  assert.equal(result, null);
});

test("mission hub separates main mission from prescribed training focus", () => {
  const mission = {
    milestones: [
      { id: "heartbeat", name: "Heartbeat Ultra", date: "2026-11-21", isMainTarget: true },
      { id: "backyard", name: "Backyard Ultra", date: "2026-09-26" },
    ],
  };
  const result = missionFocusTarget(mission, { goal: { id: "backyard", name: "Backyard Ultra" } });
  assert.equal(result.mainTarget.id, "heartbeat");
  assert.equal(result.focusTarget.id, "backyard");
});

test("key session date labels remain explicit", () => {
  const now = new Date("2026-08-06T12:00:00");
  assert.equal(keySessionDateLabel("2026-08-06", now), "Heute");
  assert.equal(keySessionDateLabel("2026-08-07", now), "Morgen");
  assert.match(keySessionDateLabel("2026-08-09", now), /in 3 Tagen/);
});
