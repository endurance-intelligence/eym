import test from "node:test";
import assert from "node:assert/strict";
import { activityCoachAssessment, cardiacDriftAssessment } from "../src/services/activityCoach.js";

function run(id, date, { distance = 10, duration = 62, avgHr = 122, temperature = 18, name = "10 km locker", elevation = 40 } = {}) {
  return {
    id,
    type: "Run",
    name,
    date,
    distance,
    duration,
    avgHr,
    elevation,
    weather: { temperature },
  };
}

test("activity coach leads with contextual evidence instead of a generic recovery template", () => {
  const activity = {
    id: "long",
    type: "Run",
    name: "Long Run",
    date: "2026-07-26",
    distance: 22,
    duration: 140,
    temperature: 28,
  };
  const state = {
    activities: [
      activity,
      { id: "easy", type: "Run", name: "Easy Run", date: "2026-07-20", distance: 7, duration: 42 },
    ],
    reviews: {},
    plan: [{ id: "planned", date: "2026-07-26", title: "22 km Long Run", type: "Long Run", distance: 22, duration: 140 }],
    profile: {},
    mission: {},
  };

  const result = activityCoachAssessment(state, activity, {
    legs: 8,
    energy: 8,
    overallFeeling: 8,
    rpe: 7,
  }, { temperature: 28 });

  assert.match(result.summary, /28 °C/);
  assert.match(result.summary, /Beine 8\/10/);
  assert.doesNotMatch(result.summary, /Plan bleibt bestehen/);
  assert.match(result.coachMessage.title, /Ausdauerreiz/);
  assert.doesNotMatch(result.comparison, /bestätigt die objektive Einordnung weitgehend/i);
  assert.equal(result.signal.value, "Gut verarbeitet");
  assert.equal(result.followUp.value, "Kein Zusatzsignal");
});

test("activity coach calls out selected stomach symptoms instead of claiming good tolerance", () => {
  const activity = {
    id: "track",
    type: "Run",
    name: "ORC Track",
    date: "2026-07-28",
    distance: 13.3,
    duration: 75,
    avgHr: 150,
  };
  const state = {
    activities: [activity],
    reviews: {},
    plan: [{ id: "planned-track", date: "2026-07-28", title: "ORC Track", type: "Schwellenlauf", distance: 14, duration: 90 }],
    profile: {},
    mission: {},
  };

  const result = activityCoachAssessment(state, activity, {
    legs: 8,
    energy: 8,
    overallFeeling: 8,
    rpe: 9,
    usedNutrition: true,
    stomachSymptoms: ["Aufstoßen", "Blähungen"],
  });

  assert.match(result.comparison, /Aufstoßen, Blähungen/);
  assert.match(result.comparison, /Gel-Timing/);
  assert.doesNotMatch(result.comparison, /gut vertragen/);
});

test("training-like C event does not create an automatic event recovery pause", () => {
  const activity = {
    id: "c-event",
    type: "Run",
    name: "7. UrLand-Lauf Oerlinghausen",
    date: "2026-08-21",
    distance: 9.6,
    duration: 52,
    avgHr: 164,
  };
  const state = {
    activities: [activity],
    reviews: {},
    plan: [{
      id: "planned-event",
      date: "2026-08-21",
      title: "7. UrLand-Lauf Oerlinghausen",
      type: "Wettkampf",
      distance: 9.6,
      duration: 52,
      raceEvent: true,
      goalPriority: "C",
    }],
    profile: {},
    mission: {},
  };

  const result = activityCoachAssessment(state, activity, {
    isEvent: true,
    eventPlanningImpact: "training",
    legs: 8,
    energy: 8,
    overallFeeling: 8,
    rpe: 9,
  });

  assert.equal(result.recovery.value, "Normal weiter");
  assert.equal(result.followUp.value, "Wie Training verarbeitet");
  assert.match(result.comparison, /Eventstatus allein bremst die Folgewoche nicht/);
});

test("depleted event review overrides a generic recovery estimate without imposing a fixed five-day pause", () => {
  const activity = {
    id: "hard-event",
    type: "Run",
    name: "Backyard Ultra",
    date: "2026-09-26",
    distance: 100,
    duration: 780,
  };
  const state = {
    activities: [activity],
    reviews: {},
    plan: [{
      id: "planned-event",
      date: "2026-09-26",
      title: "Backyard Ultra",
      type: "Wettkampf",
      distance: 100,
      duration: 780,
      raceEvent: true,
      goalPriority: "B",
    }],
    profile: {},
    mission: {},
  };

  const result = activityCoachAssessment(state, activity, {
    isEvent: true,
    eventPlanningImpact: "depleted",
    legs: 7,
    energy: 7,
    overallFeeling: 6,
    rpe: 9,
  });

  assert.equal(result.recovery.value, "48 h+ prüfen");
  assert.equal(result.followUp.value, "Erholung beobachten");
  assert.match(result.recovery.text, /nicht nach einer pauschalen Eventpause/i);
  assert.doesNotMatch(result.summary, /5 Tage/i);
});

test("34 degree easy run is compared with the athlete's own matched mild and hot runs", () => {
  const mildRuns = [
    run("m1", "2026-06-01", { avgHr: 121, temperature: 15, duration: 62 }),
    run("m2", "2026-06-08", { avgHr: 122, temperature: 17, duration: 63 }),
    run("m3", "2026-06-15", { avgHr: 123, temperature: 19, duration: 61 }),
    run("m4", "2026-06-22", { avgHr: 122, temperature: 20, duration: 64 }),
    run("m5", "2026-06-29", { avgHr: 121, temperature: 18, duration: 62 }),
  ];
  const hotRuns = [
    run("h1", "2026-07-01", { avgHr: 131, temperature: 29, duration: 63 }),
    run("h2", "2026-07-08", { avgHr: 132, temperature: 31, duration: 64 }),
    run("h3", "2026-07-15", { avgHr: 133, temperature: 33, duration: 64 }),
    run("h4", "2026-07-22", { avgHr: 132, temperature: 34, duration: 63 }),
    run("h5", "2026-07-29", { avgHr: 131, temperature: 30, duration: 62 }),
  ];
  const current = run("current", "2026-08-13", { avgHr: 133, temperature: 34, duration: 64 });
  current.weather = { temperature: 34, humidity: 55 };
  const reviews = Object.fromEntries([...mildRuns, ...hotRuns].map((activity) => [activity.id, { rpe: 5, legs: 7, energy: 7, overallFeeling: 7 }]));
  const state = {
    activities: [current, ...hotRuns, ...mildRuns],
    reviews,
    plan: [{ id: "planned", date: "2026-08-13", title: "10 km locker", type: "Easy Run", distance: 10, duration: 64 }],
    profile: {},
    mission: {},
  };

  const result = activityCoachAssessment(state, current, { rpe: 6, legs: 7, energy: 8, overallFeeling: 7 }, current.weather);

  assert.ok(result.heat.baselineSamples >= 3);
  assert.ok(result.heat.heatPairs >= 3);
  assert.equal(result.heat.status, "heat_explains");
  assert.equal(result.signal.value, "Hitze gut verarbeitet");
  assert.match(result.summary, /persönliche Heat Response/i);
  assert.match(result.summary, /nicht isoliert als aerober Formverlust/i);
  assert.match(result.factors.join(" "), /Heat Response/);
});

test("coach escalates when heart rate is materially above the athlete's learned heat response", () => {
  const mildRuns = [
    run("m1", "2026-06-01", { avgHr: 121, temperature: 15 }),
    run("m2", "2026-06-08", { avgHr: 122, temperature: 17 }),
    run("m3", "2026-06-15", { avgHr: 123, temperature: 19 }),
    run("m4", "2026-06-22", { avgHr: 122, temperature: 20 }),
  ];
  const hotRuns = [
    run("h1", "2026-07-01", { avgHr: 130, temperature: 29 }),
    run("h2", "2026-07-08", { avgHr: 131, temperature: 31 }),
    run("h3", "2026-07-15", { avgHr: 132, temperature: 33 }),
    run("h4", "2026-07-22", { avgHr: 131, temperature: 34 }),
  ];
  const current = run("current", "2026-08-13", { avgHr: 143, temperature: 34, duration: 64 });
  const reviews = Object.fromEntries([...mildRuns, ...hotRuns].map((activity) => [activity.id, { rpe: 5, legs: 7, energy: 7, overallFeeling: 7 }]));
  const state = {
    activities: [current, ...hotRuns, ...mildRuns],
    reviews,
    plan: [{ id: "planned", date: "2026-08-13", title: "10 km locker", type: "Easy Run", distance: 10, duration: 64 }],
    profile: {},
    mission: {},
  };

  const result = activityCoachAssessment(state, current, { rpe: 7, legs: 6, energy: 5, overallFeeling: 6 }, { temperature: 34 });

  assert.equal(result.heat.status, "above_heat_expectation");
  assert.equal(result.signal.value, "HF über Erwartung");
  assert.equal(result.followUp.value, "HF beobachten");
  assert.match(result.summary, /heute lag die HF darüber/i);
});

test("coach does not invent a fixed bpm heat correction when personal comparison data is sparse", () => {
  const current = run("current", "2026-08-13", { avgHr: 138, temperature: 34, duration: 64 });
  const state = {
    activities: [current, run("only-one", "2026-08-01", { avgHr: 124, temperature: 18, duration: 63 })],
    reviews: {},
    plan: [],
    profile: {},
    mission: {},
  };

  const result = activityCoachAssessment(state, current, { rpe: 6, legs: 7, energy: 7, overallFeeling: 7 }, { temperature: 34 });

  assert.equal(result.heat.expectedHeatDelta, null);
  assert.equal(result.heat.confidenceLabel, "Erste Tendenz");
  assert.match(result.summary, /fehlen noch genügend vergleichbare Läufe/i);
  assert.doesNotMatch(result.summary, /\+10 bpm|\+15 bpm/);
});


test("activity coach ignores legacy stomach fields when no fueling was used", () => {
  const state = { activities: [], reviews: {}, plan: [], profile: {} };
  const activity = { id: "no-fuel", type: "Run", distance: 8, duration: 48, avgHr: 140, date: "2026-09-01" };
  const review = { legs: 7, energy: 7, overallFeeling: 7, rpe: 5, usedNutrition: false, stomach: 3, stomachSymptoms: ["Übelkeit"] };
  const result = activityCoachAssessment(state, activity, review, null);
  assert.doesNotMatch(result.comparison, /Magenauffälligkeiten|Gel-Timing|Produktkombination/);
});

function steadyRoute({ minutes = 70, driftStartMinute = null, hillStartMinute = null } = {}) {
  let distanceKm = 0;
  let altitude = 100;
  return Array.from({ length: minutes + 1 }, (_, minute) => {
    const speedMps = 2.78;
    if (minute > 0) distanceKm += speedMps * 60 / 1000;
    const inHill = hillStartMinute != null && minute >= hillStartMinute && minute < hillStartMinute + 10;
    altitude += inHill ? 8 : 0;
    const heartRate = driftStartMinute != null && minute >= driftStartMinute ? 150 : inHill ? 151 : 140;
    return {
      elapsedSeconds: minute * 60,
      distanceKm,
      speedMps,
      heartRate,
      altitude,
    };
  });
}

test("cardiac drift locates a sustained flat-run turning point instead of reacting to one spike", () => {
  const activity = { id: "drift", type: "Run", name: "Easy Run", distance: 11.7, duration: 70, avgHr: 144, elevation: 20 };
  const result = cardiacDriftAssessment(steadyRoute({ driftStartMinute: 48 }), activity, { temperature: 18 }, { legs: 7, energy: 7, rpe: 5 });
  assert.equal(result.available, true);
  assert.equal(result.status, "clear");
  assert.ok(result.onset?.distanceKm > 5);
  assert.match(result.onset?.label || "", /km .* \/ .*min/);
  assert.match(result.text, /nahezu gleich blieb/);
});

test("a heart-rate rise on a climb is not mislabeled as cardiac drift", () => {
  const activity = { id: "hill", type: "Run", name: "Easy Run", distance: 11.7, duration: 70, avgHr: 143, elevation: 500 };
  const result = cardiacDriftAssessment(steadyRoute({ hillStartMinute: 45 }), activity, { temperature: 18 }, { legs: 7, energy: 7, rpe: 5 });
  assert.notEqual(result.status, "clear");
});

test("quality sessions do not use cardiac drift as their primary judgement", () => {
  const activity = { id: "track-drift", type: "Run", name: "ORC Track Intervalle", distance: 12, duration: 75, avgHr: 155 };
  const result = cardiacDriftAssessment(steadyRoute({ driftStartMinute: 45 }), activity, { temperature: 18 }, {});
  assert.equal(result.status, "not-applicable");
  assert.equal(result.relevant, false);
});

test("compact coach turns a real drift into one localized coaching tip", () => {
  const activity = { id: "drift-coach", type: "Run", name: "10 km locker", date: "2026-10-08", distance: 11.7, duration: 70, avgHr: 144, elevation: 20 };
  const state = {
    activities: [activity],
    reviews: {},
    plan: [{ id: "easy-plan", date: "2026-10-08", title: "Easy Run", type: "Easy Run", distance: 11.7, duration: 70 }],
    profile: {},
    mission: { type: "ultra", name: "Heartbeat Ultra" },
  };
  const result = activityCoachAssessment(state, activity, { legs: 7, energy: 7, overallFeeling: 7, rpe: 5 }, { temperature: 18 }, steadyRoute({ driftStartMinute: 48 }));
  assert.match(result.coachMessage.title, /zu teuer/);
  assert.match(result.coachMessage.text, /Bis etwa km/);
  assert.match(result.coachMessage.tip, /Heute wäre ab etwa km/);
  assert.equal(Boolean(result.coachMessage.anchor?.label), true);
});
