import test from "node:test";
import assert from "node:assert/strict";
import {
  buildWeekPrescription,
  deriveAthleteCapacity,
} from "../src/services/trainingPeriodization.js";
import { generateWeekPlan } from "../src/services/plannerEngine.js";

const establishedHistory = [63.9, 56.6, 48.2, 51.2, 51.4, 36, 17]
  .map((km, index) => ({ start: `week-${index}`, km }));

test("capacity uses robust completed-week history instead of treating one weak week as the new baseline", () => {
  const capacity = deriveAthleteCapacity(establishedHistory, 38);

  assert.equal(capacity.source, "activities");
  assert.equal(capacity.confidence, "high");
  assert.ok(capacity.baseKm >= 52 && capacity.baseKm <= 55);
  assert.ok(capacity.normalLowKm >= 47);
  assert.ok(capacity.normalHighKm >= 55);
  assert.equal(capacity.peakKm, 63.9);
  assert.match(capacity.summary, /abgeschlossene Wochen/);
});

test("a recovery week is explicit, lower than the established base and never framed as kilometer debt", () => {
  const prescription = buildWeekPrescription({
    history: establishedHistory,
    fallbackWeeklyKm: 38,
    goalEngine: {
      discipline: "backyard",
      disciplineLabel: "Backyard Ultra",
      target: { id: "backyard", name: "Backyard Ultra" },
      phase: { key: "specific", label: "Zielspezifisch", factor: 1.03 },
      daysLeft: 51,
    },
    cycleWeek: 4,
    recoveryWeek: true,
    scheduledRecoveryWeek: true,
    readiness: { factor: 1, notes: [] },
    previousWeekKm: 63.9,
  });

  assert.equal(prescription.weekType.label, "Entlastungswoche");
  assert.ok(prescription.corridor.highKm < prescription.capacity.baseKm);
  assert.match(prescription.noDebtText, /nicht als Schuld/);
  assert.match(prescription.nextStep, /kehrt.*Basis|nächsten Zielreiz/);
});

test("the same periodization architecture changes its focus with the athlete goal", () => {
  const common = {
    history: establishedHistory,
    fallbackWeeklyKm: 50,
    cycleWeek: 3,
    readiness: { factor: 1, notes: [] },
    previousWeekKm: 56.6,
  };
  const tenK = buildWeekPrescription({
    ...common,
    goalEngine: {
      discipline: "10k",
      disciplineLabel: "10 km",
      target: { id: "ten", name: "10-km-Straßenlauf" },
      phase: { key: "specific", label: "Zielspezifisch", factor: 1.03 },
      daysLeft: 42,
    },
  });
  const backyard = buildWeekPrescription({
    ...common,
    goalEngine: {
      discipline: "backyard",
      disciplineLabel: "Backyard Ultra",
      target: { id: "backyard", name: "Backyard Ultra" },
      phase: { key: "specific", label: "Zielspezifisch", factor: 1.03 },
      daysLeft: 42,
    },
  });

  assert.match(tenK.focus, /10-km|Schwelle/);
  assert.doesNotMatch(tenK.focus, /Rundenrhythmus/);
  assert.match(backyard.focus, /Rundenrhythmus|Pausenroutine/);
});

test("next-week planning excludes the unfinished current week from the established capacity", () => {
  const activities = [
    { id: "current", type: "Run", date: "2026-08-05", distance: 5, duration: 32 },
    { id: "w1", type: "Run", date: "2026-07-30", distance: 63.9, duration: 400 },
    { id: "w2", type: "Run", date: "2026-07-23", distance: 56.6, duration: 360 },
    { id: "w3", type: "Run", date: "2026-07-16", distance: 48.2, duration: 310 },
    { id: "w4", type: "Run", date: "2026-07-09", distance: 51.2, duration: 330 },
    { id: "w5", type: "Run", date: "2026-07-02", distance: 51.4, duration: 332 },
  ];
  const result = generateWeekPlan({
    activities,
    mission: {
      id: "backyard",
      name: "Backyard Ultra",
      date: "2026-09-26",
      targetKm: 100,
      goalDiscipline: "backyard",
      priority: "A",
      milestones: [],
    },
    profile: {
      selfReportedRunsPerWeek: 5,
      selfReportedWeeklyKm: 38,
      selfReportedLongestRunKm: 30,
    },
    config: {
      targetRunCount: 5,
      recurringCommitments: [],
      fixedAppointments: { football: false, orcRun: false, saturdayMode: "off" },
      stabiCount: 0,
      rowingCount: 0,
      runDays: ["Montag", "Dienstag", "Donnerstag", "Freitag", "Sonntag"],
      maxLongRun: 38,
      weekPrescriptions: {
        "2026-08-03": { weekType: { key: "recovery", label: "Entlastungswoche" } },
      },
      checkin: { energy: 7, fatigue: "none", illness: "healthy", pain: "none", painLevel: 0 },
    },
    offsetWeeks: 1,
    today: new Date("2026-08-06T12:00:00"),
  });

  assert.equal(result.weekPrescription.completedHistoryOnly, true);
  assert.equal(result.weekPrescription.capacity.lastWeekKm, 63.9);
  assert.ok(result.weekPrescription.capacity.baseKm > 50);
  assert.ok(result.weekPrescription.corridor.lowKm >= 50);
  assert.match(result.weekPrescription.focus, /Rundenrhythmus|Pausenroutine/);
});
