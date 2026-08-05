import test from "node:test";
import assert from "node:assert/strict";
import { buildMissionOutlook } from "../src/services/missionOutlook.js";

const mission = {
  milestones: [
    { id: "backyard", name: "Backyard Ultra", date: "2026-09-26", targetMinKm: 60, targetMaxKm: 80 },
    { id: "heartbeat", name: "Heartbeat Ultra Fulda", date: "2026-11-22", targetKm: 112, isMainTarget: true },
  ],
};

test("mission roadmap marks exactly one current backyard phase", () => {
  const cases = [
    ["2026-07-23T12:00:00", "Basis stabilisieren"],
    ["2026-08-20T12:00:00", "Backyard Ultra-spezifische Loops"],
    ["2026-09-10T12:00:00", "Taper & Frische"],
  ];

  cases.forEach(([date, expectedTitle]) => {
    const outlook = buildMissionOutlook([], {}, mission, new Date(date));
    const current = outlook.roadmap.filter((step) => step.current);
    assert.equal(current.length, 1);
    assert.equal(current[0].title, expectedTitle);
    assert.equal(current[0].label, "Aktuelle Phase");
  });
});

test("a nearer C event stays visible without removing the B-goal loop block", () => {
  const outlook = buildMissionOutlook([], {}, {
    milestones: [
      { id: "c-run", name: "Vorbereitungslauf", date: "2026-08-21", targetKm: 9.6, priority: "C", goalType: "training" },
      { id: "backyard", name: "Backyard Ultra", date: "2026-09-26", targetMinKm: 60, targetMaxKm: 80, priority: "B" },
      { id: "heartbeat", name: "Heartbeat Ultra Fulda", date: "2026-11-22", targetKm: 112, priority: "A", isMainTarget: true },
    ],
  }, new Date("2026-07-29T12:00:00"));

  assert.equal(outlook.nextTarget.id, "c-run");
  assert.equal(outlook.strategicTarget.id, "backyard");
  assert.equal(outlook.loop.title, "3 × 6,7 km · 20,1 km");
  assert.equal(outlook.loop.targetName, "Backyard Ultra");
  assert.equal(outlook.loop.priority, "B");
  assert.match(outlook.loop.text, /Verpflegung nach jeder Runde|Zugriff auf die Verpflegung/);
  assert.ok(outlook.roadmap.some((step) => /Backyard Ultra-spezifische Loops/.test(step.title)));
  assert.ok(outlook.roadmap.some((step) => /Übergang zu Heartbeat Ultra Fulda/.test(step.title)));
});

test("an explicitly configured loop goal works without a special event name", () => {
  const outlook = buildMissionOutlook([], {}, {
    milestones: [{
      id: "custom-loop",
      name: "Mein Herbst-Ultra",
      date: "2026-09-20",
      targetKm: 60,
      priority: "B",
      courseType: "loop",
      loopKm: 5,
      aidStationMode: "fixed_stations",
    }],
  }, new Date("2026-07-29T12:00:00"));

  assert.equal(outlook.loop.title, "3 × 5 km · 15 km");
  assert.match(outlook.loop.text, /Abstände der festen Verpflegungspunkte/);
});

test("mission status is phase-aware and does not expose a completion percentage", () => {
  const now = new Date("2026-08-05T12:00:00");
  const activities = Array.from({ length: 8 }, (_, index) => ({
    id: `run-${index}`,
    type: "Run",
    name: index === 0 ? "24 km Longrun" : "Easy Run",
    date: new Date(now.getTime() - index * 7 * 86400000).toISOString(),
    distance: index === 0 ? 24 : 42,
    duration: index === 0 ? 160 : 260,
  }));
  const outlook = buildMissionOutlook(activities, {}, mission, now);

  assert.equal(outlook.phase, "specific");
  assert.equal(outlook.readiness.label, "Auf Kurs");
  assert.equal(Object.hasOwn(outlook, "score"), false);
  assert.match(outlook.dataScope, /Nur absolvierte Einheiten/);
  assert.equal(outlook.factors.find((factor) => factor.id === "volume")?.value, "Passend zur Phase");
  assert.equal(outlook.factors.find((factor) => factor.id === "longrun")?.value, "Passend zur Phase");
});
