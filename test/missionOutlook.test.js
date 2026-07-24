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
