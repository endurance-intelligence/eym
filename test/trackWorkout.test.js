import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTrackWorkoutTemplate,
  formatTrackPaceInput,
  isProvisionalTrackWorkout,
  isTrackWorkout,
  normalizeTrackPace,
  normalizeTrackRounds,
  normalizeTrackWorkout,
  normalizeTrackWorkoutTemplates,
  trackPaceRange,
  trackWorkoutDistance,
  trackWorkoutForEditing,
  trackWorkoutSummary,
  trackWorkoutTemplateLabel,
  trackStepGarminCue,
  TRACK_MAIN_CONTROL_MODES,
  updateTrackStepDraft,
  updateTrackWorkoutDraft,
  workoutFromTrackTemplate,
} from "../src/services/trackWorkout.js";
import {
  intervalDescription,
  intervalsWorkoutType,
  isGuidedPlanItem,
  isProvisionalTrackPlanItem,
} from "../supabase/functions/_shared/structuredWorkout.ts";

test("ORC Track receives a safe structured workout default", () => {
  assert.equal(isTrackWorkout({ type: "ORC Track" }), true);
  assert.deepEqual(normalizeTrackWorkout(), {
    kind: "intervals",
    rounds: 8,
    steps: [
      { kind: "work", unit: "distance", value: 400 },
      { kind: "recovery", unit: "distance", value: 200 },
    ],
    warmupMode: "lap",
    cooldownMode: "lap",
    mainControlMode: "automatic",
    planningStatus: "final",
  });
});

test("track summary supports an ordered mixed block", () => {
  const summary = trackWorkoutSummary({
    rounds: 3,
    steps: [
      { kind: "work", unit: "distance", value: 1200 },
      { kind: "recovery", unit: "distance", value: 400 },
      { kind: "work", unit: "distance", value: 800 },
      { kind: "recovery", unit: "distance", value: 400 },
    ],
  });
  assert.equal(summary, "Warm-up bis LAP · 3 Durchgänge: 1200 m Belastung → 400 m Pause → 800 m Belastung → 400 m Pause · Hauptteil automatisch · Cool-down bis LAP");
});

test("track main control supports automatic and manual LAP modes without changing old workouts", () => {
  assert.equal(normalizeTrackWorkout({}).mainControlMode, TRACK_MAIN_CONTROL_MODES.AUTOMATIC);
  const lap = normalizeTrackWorkout({ mainControlMode: TRACK_MAIN_CONTROL_MODES.MANUAL_LAP });
  assert.equal(lap.mainControlMode, TRACK_MAIN_CONTROL_MODES.MANUAL_LAP);
  assert.match(trackWorkoutSummary(lap), /Bahn-LAP: Distanzschritte per LAP, Zeitabschnitte automatisch/);
});

test("saved track template names get a compact readable planner label", () => {
  assert.equal(
    trackWorkoutTemplateLabel({ templateName: "Schwelle - 4 x 1200@4:40/800@4:30" }),
    "Schwelle – 4 × 1200 @ 4:40 / 800 @ 4:30",
  );
  assert.equal(trackWorkoutTemplateLabel({}), "");
  assert.equal(trackWorkoutTemplateLabel(null), "");
  assert.equal(trackWorkoutTemplateLabel(undefined), "");
  assert.equal(trackWorkoutTemplateLabel("legacy workout"), "");
});

test("track distance separates work, recovery and the estimated LAP-controlled edges", () => {
  const distance = trackWorkoutDistance({
    rounds: 3,
    steps: [
      { kind: "work", unit: "distance", value: 1200 },
      { kind: "recovery", unit: "distance", value: 400 },
      { kind: "work", unit: "distance", value: 800 },
      { kind: "recovery", unit: "distance", value: 400 },
    ],
  });
  assert.deepEqual(distance, {
    workDistanceKm: 6,
    recoveryDistanceKm: 2.4,
    mainDistanceKm: 8.4,
    timedSeconds: 0,
    hasTimedSteps: false,
    estimatedTotalMinKm: 12.4,
    estimatedTotalMaxKm: 14.4,
  });

  const timed = trackWorkoutDistance({
    rounds: 3,
    steps: [
      { kind: "work", unit: "distance", value: 800 },
      { kind: "recovery", unit: "time", value: 90 },
    ],
  });
  assert.equal(timed.mainDistanceKm, 2.4);
  assert.equal(timed.timedSeconds, 270);
  assert.equal(timed.hasTimedSteps, true);
});

test("old v3.5.2 track settings migrate into the new step model", () => {
  assert.deepEqual(normalizeTrackWorkout({
    repeats: 10,
    workUnit: "distance",
    workValue: 600,
    recoveryUnit: "time",
    recoveryValue: 90,
  }), {
    kind: "intervals",
    rounds: 10,
    steps: [
      { kind: "work", unit: "distance", value: 600 },
      { kind: "recovery", unit: "time", value: 90 },
    ],
    warmupMode: "lap",
    cooldownMode: "lap",
    mainControlMode: "automatic",
    planningStatus: "final",
  });
});

test("numeric track drafts stay empty while typing and normalize only when committed", () => {
  const initial = trackWorkoutForEditing();
  const emptyRounds = updateTrackWorkoutDraft(initial, "rounds", "");
  const typedRounds = updateTrackWorkoutDraft(emptyRounds, "rounds", "10");
  assert.equal(emptyRounds.rounds, "");
  assert.equal(typedRounds.rounds, "10");
  assert.equal(normalizeTrackRounds(typedRounds.rounds), 10);

  const emptyStep = updateTrackStepDraft(initial, 0, "value", "");
  const typedStep = updateTrackStepDraft(emptyStep, 0, "value", "1200");
  assert.equal(emptyStep.steps[0].value, "");
  assert.equal(typedStep.steps[0].value, "1200");
  assert.equal(normalizeTrackWorkout(typedStep).steps[0].value, 1200);
});

test("pace targets normalize into Garmin-friendly ranges", () => {
  assert.equal(normalizeTrackPace("4.40"), "4:40");
  assert.equal(normalizeTrackPace("4:75"), "");

  const workout = normalizeTrackWorkout({
    rounds: 4,
    steps: [
      { kind: "work", unit: "distance", value: 1200, targetPace: "4:40", paceToleranceSeconds: 5 },
      { kind: "recovery", unit: "distance", value: 200 },
      { kind: "work", unit: "distance", value: 800, targetPace: "4,30", paceToleranceSeconds: 10 },
    ],
  });
  assert.deepEqual(trackPaceRange(workout.steps[0]), {
    targetPace: "4:40",
    toleranceSeconds: 5,
    fasterPace: "4:35",
    slowerPace: "4:45",
  });
  assert.equal(workout.steps[2].targetPace, "4:30");
  assert.equal(workout.steps[2].paceToleranceSeconds, 10);
  assert.match(trackWorkoutSummary(workout), /1200 m Belastung @ 4:40\/km \(±5 s\)/);
});

test("Garmin cues stay human-readable without stealing Intervals duration tokens", () => {
  assert.equal(trackStepGarminCue({ kind: "work", unit: "distance", value: 600, targetPace: "4:30" }), "600er @ 4:30/km");
  assert.equal(trackStepGarminCue({ kind: "recovery", unit: "distance", value: 200 }), "200er Trab");
  assert.equal(trackStepGarminCue({ kind: "work", unit: "time", value: 90, targetPace: "4:10" }), "Belastung @ 4:10/km");
  assert.equal(trackStepGarminCue({ kind: "recovery", unit: "time", value: 60 }), "Trabpause");
});

test("new track definitions start provisional while legacy saved workouts remain final", () => {
  assert.equal(trackWorkoutForEditing().planningStatus, "draft");
  assert.equal(trackWorkoutForEditing({ rounds: 4 }).planningStatus, "final");
  assert.equal(isProvisionalTrackWorkout({
    type: "ORC Track",
    structuredWorkout: trackWorkoutForEditing(),
  }), true);
  assert.equal(isProvisionalTrackWorkout({
    type: "ORC Track",
    structuredWorkout: normalizeTrackWorkout({ rounds: 4 }),
  }), false);
  assert.equal(isProvisionalTrackPlanItem({
    type: "ORC Track",
    structuredWorkout: { planningStatus: "draft" },
  }), true);
  assert.equal(isProvisionalTrackPlanItem({
    type: "ORC Track",
    structuredWorkout: { planningStatus: "final" },
  }), false);
});

test("race events sync as calendar notes instead of synthetic guided Z2 workouts", () => {
  assert.equal(isGuidedPlanItem({
    type: "Wettkampf",
    title: "7. UrLand-Lauf Oerlinghausen",
    raceEvent: true,
    calendarOnly: true,
    distance: 9.6,
  }), false);
  assert.equal(isGuidedPlanItem({
    type: "Easy Run",
    title: "8 km locker",
    distance: 8,
  }), true);
});

test("Intervals description contains an ordered Garmin block and LAP-controlled edges", () => {
  const description = intervalDescription({
    type: "ORC Track",
    title: "ORC Track",
    structuredWorkout: {
      kind: "sprints",
      rounds: 2,
      steps: [
        { kind: "work", unit: "distance", value: 1200, targetPace: "4:40", paceToleranceSeconds: 5 },
        { kind: "recovery", unit: "distance", value: 400, targetPace: "6:30", paceToleranceSeconds: 30 },
        { kind: "work", unit: "distance", value: 800, targetPace: "4:30", paceToleranceSeconds: 5 },
        { kind: "recovery", unit: "time", value: 90 },
      ],
    },
  });
  assert.match(description, /Sprints 2x/);
  assert.match(description, /1200er @ 4:40\/km 1200mtr 4:35-4:45\/km Pace intensity=interval/);
  assert.match(description, /400er Trab 400mtr intensity=recovery/);
  assert.match(description, /800er @ 4:30\/km 800mtr 4:25-4:35\/km Pace intensity=interval/);
  assert.match(description, /Trabpause 90s intensity=recovery/);
  assert.match(description, /- Press lap 15m intensity=warmup/);
  assert.match(description, /- Press lap 10m intensity=cooldown/);
  assert.doesNotMatch(description, /(?:Press lap|Trabpause|er Trab)[^\n]*Pace/);
  assert.equal(description.match(/press lap/gi)?.length, 2);
  assert.match(description, /intensity=warmup/);
  assert.match(description, /intensity=cooldown/);
});

test("manual track mode leaves distance steps open for LAP but keeps timed strides automatic", () => {
  const description = intervalDescription({
    type: "ORC Track",
    title: "Bahntraining LAP",
    structuredWorkout: normalizeTrackWorkout({
      mainControlMode: TRACK_MAIN_CONTROL_MODES.MANUAL_LAP,
      rounds: 2,
      steps: [
        { kind: "work", unit: "distance", value: 600, targetPace: "4:30", paceToleranceSeconds: 5 },
        { kind: "recovery", unit: "distance", value: 200 },
        { kind: "work", unit: "time", value: 20, targetPace: "3:57", paceToleranceSeconds: 18 },
        { kind: "recovery", unit: "time", value: 80 },
      ],
    }),
  });

  assert.match(description, /600er @ 4:30\/km Press lap 162s 4:25-4:35\/km Pace intensity=interval/);
  assert.match(description, /200er Trab Press lap 90s intensity=recovery/);
  assert.match(description, /Belastung @ 3:57\/km 20s 3:39-4:15\/km Pace intensity=interval/);
  assert.match(description, /Trabpause 80s intensity=recovery/);
  assert.doesNotMatch(description, /600mtr/);
  assert.doesNotMatch(description, /200mtr/);
});

test("generated interval and threshold edges stay free of pace targets", () => {
  const intervals = intervalDescription({
    type: "Intervalle",
    title: "6 × 400 Meter",
    duration: 60,
  });
  assert.match(intervals, /- Intervall 400mtr Z5 Pace intensity=interval/);
  assert.match(intervals, /- Trabpause 400mtr intensity=recovery/);
  assert.doesNotMatch(intervals, /(?:warmup|recovery|cooldown)[^\n]*Pace/);

  const threshold = intervalDescription({
    type: "Schwellenlauf",
    title: "Schwelle",
    duration: 60,
  });
  assert.match(threshold, /- Tempo 35m Z4 Pace intensity=interval/);
  assert.doesNotMatch(threshold, /(?:warmup|cooldown)[^\n]*Pace/);
});

test("Goal Engine workouts keep pace targets inside their work blocks", () => {
  const description = intervalDescription({
    type: "Schwellenlauf",
    title: "HM-Arbeits-Pace",
    goalWorkout: {
      warmupMinutes: 15,
      cooldownMinutes: 10,
      blocks: [{
        label: "HM-Arbeits-Pace",
        repeats: 3,
        workMinutes: 12,
        recoveryMinutes: 3,
        targetPace: "5:41",
        toleranceSeconds: 12,
        effort: "Z3 HR",
      }],
    },
  });

  assert.match(description, /HM-Arbeits-Pace 3x/);
  assert.match(description, /- Intervall 12m 5:29-5:53\/km Pace intensity=interval/);
  assert.match(description, /- Trabpause 3m intensity=recovery/);
  assert.doesNotMatch(description, /(?:warmup|recovery|cooldown)[^\n]*Pace/);
});

test("run-walk prescriptions export planned recovery instead of synthetic pace", () => {
  const description = intervalDescription({
    type: "Easy Run",
    title: "Run-Walk",
    goalWorkout: {
      warmupMinutes: 5,
      cooldownMinutes: 5,
      blocks: [{
        label: "Run-Walk",
        repeats: 8,
        workMinutes: 2,
        recoveryMinutes: 2,
        effort: "Z2 HR",
      }],
    },
  });

  assert.match(description, /Run-Walk 8x/);
  assert.match(description, /- Intervall 2m Z2 HR intensity=interval/);
  assert.match(description, /- Trabpause 2m intensity=recovery/);
  assert.doesNotMatch(description, /Pace/);
});

test("named templates survive archive normalization and can be copied into a workout", () => {
  const template = buildTrackWorkoutTemplate({
    id: "mix-1200-800",
    name: "  1200/800   Mix  ",
    workout: {
      kind: "intervals",
      rounds: 3,
      steps: [
        { kind: "work", unit: "distance", value: 1200 },
        { kind: "recovery", unit: "distance", value: 400 },
        { kind: "work", unit: "distance", value: 800 },
        { kind: "recovery", unit: "distance", value: 400 },
      ],
    },
    createdAt: "2026-07-27T08:00:00.000Z",
    updatedAt: "2026-07-27T09:00:00.000Z",
  });
  const archive = normalizeTrackWorkoutTemplates([template, template, { id: "", name: "Ungültig" }]);
  assert.equal(archive.length, 1);
  assert.equal(archive[0].name, "1200/800 Mix");
  const workout = workoutFromTrackTemplate(archive[0]);
  assert.equal(workout.templateId, "mix-1200-800");
  assert.equal(workout.templateName, "1200/800 Mix");
  assert.equal(workout.steps[2].value, 800);
});

test("loop workouts default to LAP-controlled rounds and pauses without GPS distance endings", () => {
  const description = intervalDescription({
    type: "Loop-Training",
    title: "2 × 6,7 km · Backyard Ultra",
    distance: 13.4,
    duration: 120,
    loopTraining: {
      loops: 2,
      loopKm: 6.7,
      mode: "fixed_interval",
      intervalMinutes: 60,
      controlMode: "manual_lap",
      paceMode: "none",
      estimatedRunMinutesPerLoop: 50,
    },
  });

  assert.match(description, /Runde 1\n- Press lap 50m intensity=active/);
  assert.match(description, /Boxenstopp 1\n- Press lap 10m intensity=recovery/);
  assert.match(description, /Runde 2\n- Press lap 50m intensity=active/);
  assert.doesNotMatch(description, /- 6\.7km/);
  assert.equal(description.match(/Press lap/g)?.length, 3);
});

test("automatic distance remains an explicit opt-in for loop workouts", () => {
  const description = intervalDescription({
    type: "Loop-Training",
    title: "2 × 6,7 km",
    loopTraining: {
      loops: 2,
      loopKm: 6.7,
      mode: "fixed_interval",
      intervalMinutes: 60,
      controlMode: "automatic_distance",
      paceMode: "custom",
      faster: "7:10",
      slower: "7:50",
      estimatedRunMinutesPerLoop: 50,
    },
  });

  assert.match(description, /- 6\.7km 7:50-7:10\/km Pace intensity=active/);
  assert.equal(description.match(/- 6\.7km/g)?.length, 2);
  assert.match(description, /Boxenstopp 1\n- Press lap 10m intensity=recovery/);
});


test("pre-race strides keep their explicit run sport instead of matching ride inside the title", () => {
  const shakeout = {
    type: "Easy Run",
    title: "Shake-out / Pre-Race Activation · 5 × 20 s Strides",
  };
  assert.equal(intervalsWorkoutType(shakeout), "Run");
  assert.equal(intervalsWorkoutType({ type: "Radfahren", title: "90 min locker" }), "Ride");
  assert.equal(intervalsWorkoutType({ type: "Workout", title: "Rennrad Grundlagenrunde" }), "Ride");
});

test("pre-race strides export duration, broad pace target and recovery to Garmin via Intervals", () => {
  const shakeout = { type: "Easy Run", title: "Shake-out / Pre-Race Activation · 5 × 20 s Strides" };
  assert.equal(isTrackWorkout(shakeout), true);

  const workout = normalizeTrackWorkout({
    kind: "sprints",
    rounds: 5,
    steps: [
      { kind: "work", unit: "time", value: 20, targetPace: "3:57", paceToleranceSeconds: 18 },
      { kind: "recovery", unit: "time", value: 80 },
    ],
    warmupMode: "time",
    cooldownMode: "time",
    warmupMinutes: 26,
    cooldownMinutes: 11,
    planningStatus: "final",
  });

  const description = intervalDescription({
    type: "Easy Run",
    title: "Shake-out / Pre-Race Activation · 5 × 20 s Strides @ 3:49–4:05/km · 80 s locker",
    structuredWorkout: workout,
  });

  assert.match(description, /Warm-up\n- 26m intensity=warmup/);
  assert.match(description, /Sprints 5x/);
  assert.match(description, /Belastung @ 3:57\/km 20s 3:39-4:15\/km Pace intensity=interval/);
  assert.match(description, /Trabpause 80s intensity=recovery/);
  assert.match(description, /Cool-down\n- 11m intensity=cooldown/);
});

test("mobile pace input formats raw digits without requiring a colon", () => {
  assert.equal(formatTrackPaceInput("510"), "5:10");
  assert.equal(formatTrackPaceInput("1045"), "10:45");
  assert.equal(formatTrackPaceInput("4.50"), "4:50");
  assert.equal(formatTrackPaceInput("4:"), "4:");
});

test("track workouts keep consecutive paced work blocks without inserting recovery", () => {
  const workout = normalizeTrackWorkout({
    rounds: 3,
    steps: [
      { kind: "work", unit: "distance", value: 2000, targetPace: "4:50", paceToleranceSeconds: 5 },
      { kind: "work", unit: "distance", value: 1000, targetPace: "5:10", paceToleranceSeconds: 5 },
    ],
  });

  assert.deepEqual(workout.steps.map((step) => step.kind), ["work", "work"]);
  assert.match(trackWorkoutSummary(workout), /2000 m Belastung @ 4:50\/km/);
  assert.match(trackWorkoutSummary(workout), /1000 m Belastung @ 5:10\/km/);

  const description = intervalDescription({
    type: "ORC Track",
    title: "3 × 2000/1000 extensiv",
    structuredWorkout: workout,
  });
  assert.match(description, /Hauptteil 3x/);
  assert.match(description, /2000er @ 4:50\/km 2000mtr 4:45-4:55\/km Pace intensity=interval/);
  assert.match(description, /1000er @ 5:10\/km 1000mtr 5:05-5:15\/km Pace intensity=interval/);
  assert.doesNotMatch(description, /Pause/);
});
