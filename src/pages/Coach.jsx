import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { Card, PageTitle } from "../components/UI";
import {
  activityDate,
  preferredActivities,
  reviewKindLabel,
} from "../services/activityUtils";
import ReviewModal from "../components/ReviewModal";
import ExerciseGuide, { ExerciseGuideButton } from "../components/ExerciseGuide";
import RaceCoach from "../components/RaceCoach";
import { activitiesWithGroups } from "../services/activityGroups";
import { fmtDate } from "../utils/format";
import { playWorkoutAudioDemo, playWorkoutCue, primeWorkoutAudio, speakWorkoutCue, workoutAudioCapabilities } from "../services/workoutAudio";
import { releaseScreenWakeLock, requestScreenWakeLock } from "../services/wakeLock";
import {
  buildCoachState,
  recommendationFeedbackEntry,
} from "../services/coachState";
import { reviewCoverageSummary } from "../services/reviewCoverage";
import { buildGoalEngine } from "../services/goalEngine";
import {
  buildMobilityWorkout,
  equipmentLabel,
  focusAreaLabel,
  MOBILITY_EQUIPMENT,
  MOBILITY_FOCUS_AREAS,
  nextMobilityWorkoutRotation,
} from "../services/mobilityWorkouts";
import {
  activeMobilityOverride,
  mobilityCoachSuggestion,
  mobilityOverrideExpiry,
} from "../services/mobilityCoach";
import {
  buildAdaptiveMobilityProfile,
  mergeMobilityFocusAreas,
} from "../services/mobilityProgramming";
import {
  activeRunnerSideLabel,
  advanceMobilityRunner,
  nextRunnerSideLabel,
  runnerPhaseSeconds,
  sideOrder,
} from "../services/mobilityRunner";

const monthFormatter = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" });
const DEFAULT_MOBILITY_EQUIPMENT = ["mat", "band"];

const coachTabs = [
  ["today", "Heute"],
  ["development", "Entwicklung"],
  ["race", "Race"],
  ["mobility", "Stabi & Mobility"],
];

function SignalCard({ eyebrow, signal }) {
  return (
    <Card className={`coach-signal-card ${signal.tone || "neutral"}`}>
      <p className="eyebrow">{eyebrow}</p>
      <h2>{signal.value}</h2>
      <p className="muted">{signal.text}</p>
    </Card>
  );
}

function secondsLabel(seconds) {
  const minutes = Math.floor(Number(seconds || 0) / 60);
  const rest = Number(seconds || 0) % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function materialText(exercise) {
  const ids = exercise.equipment?.length ? exercise.equipment : exercise.equipmentAny || [];
  return ids.length ? ids.map(equipmentLabel).join(" / ") : "Ohne Material";
}

export default function Coach() {
  const { state, setState } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const activeTab = coachTabs.some(([key]) => key === requestedTab) ? requestedTab : "today";
  const [selected, setSelected] = useState(null);
  const [selectedGuide, setSelectedGuide] = useState(null);
  const [runner, setRunner] = useState(null);
  const [workoutShuffleOffset, setWorkoutShuffleOffset] = useState(0);
  const [focusEditorOpen, setFocusEditorOpen] = useState(false);
  const [sessionCoachOverride, setSessionCoachOverride] = useState(null);
  const [dismissedCoachSuggestionId, setDismissedCoachSuggestionId] = useState("");
  const [wakeLockStatus, setWakeLockStatus] = useState("idle");
  const [audioFeedback, setAudioFeedback] = useState({ tone: "idle", message: "Ton und Sprache vor dem Workout einmal testen." });
  const previousRunnerRef = useRef(null);
  const cueKeyRef = useRef("");
  const wakeLockRef = useRef(null);
  const now = useMemo(() => new Date(), []);
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const canonicalActivities = useMemo(() => preferredActivities(state.activities), [state.activities]);
  const reviewActivities = useMemo(() => activitiesWithGroups(canonicalActivities, state.activityGroups), [canonicalActivities, state.activityGroups]);
  const monthCoverage = useMemo(() => reviewCoverageSummary(state, reviewActivities, {
    allActivities: [...(state.activities || []), ...canonicalActivities, ...reviewActivities],
    now,
    fromDate: `${currentMonth}-01`,
  }), [canonicalActivities, currentMonth, now, reviewActivities, state]);
  const monthReviewable = monthCoverage.eligible.filter((activity) => activityDate(activity).startsWith(currentMonth));
  const openReviews = monthCoverage.missing.filter((activity) => activityDate(activity).startsWith(currentMonth));
  const reviewed = monthCoverage.reviewed.filter((activity) => activityDate(activity).startsWith(currentMonth));
  const unifiedCoach = useMemo(() => buildCoachState(state, now), [state, now]);
  const analysis = unifiedCoach.dashboard;
  const athleteAssessment = unifiedCoach.athlete;
  const outlook = unifiedCoach.outlook;
  const goalEngine = useMemo(() => buildGoalEngine({
    mission: state.mission,
    activities: state.activities,
    activityGroups: state.activityGroups,
    reviews: state.reviews,
    profile: state.profile,
    planner: state.planner,
    referenceDate: now,
  }), [state.mission, state.activities, state.activityGroups, state.reviews, state.profile, state.planner, now]);
  const recommendationHistory = Array.isArray(state.coachRecommendationHistory) ? state.coachRecommendationHistory : [];
  const currentRecommendationFeedback = recommendationHistory.find((entry) => entry.recommendationId === unifiedCoach.recommendation.id);

  const mobilitySettings = state.mobilityCoach || {};
  const durationMinutes = Number(mobilitySettings.durationMinutes || 25);
  const condition = mobilitySettings.condition || "normal";
  const equipment = Array.isArray(mobilitySettings.equipment) ? mobilitySettings.equipment : DEFAULT_MOBILITY_EQUIPMENT;
  const physioExerciseIds = useMemo(() => Array.isArray(mobilitySettings.physioExerciseIds) ? mobilitySettings.physioExerciseIds : [], [mobilitySettings.physioExerciseIds]);
  const focusAreaIds = useMemo(() => Array.isArray(mobilitySettings.focusAreaIds) ? mobilitySettings.focusAreaIds : [], [mobilitySettings.focusAreaIds]);
  const knownExerciseIds = useMemo(() => Array.isArray(mobilitySettings.knownExerciseIds) ? mobilitySettings.knownExerciseIds : [], [mobilitySettings.knownExerciseIds]);
  const preferredExerciseIds = useMemo(() => Array.isArray(mobilitySettings.preferredExerciseIds) ? mobilitySettings.preferredExerciseIds : [], [mobilitySettings.preferredExerciseIds]);
  const excludedExerciseIds = useMemo(() => Array.isArray(mobilitySettings.excludedExerciseIds) ? mobilitySettings.excludedExerciseIds : [], [mobilitySettings.excludedExerciseIds]);
  const customExercises = useMemo(() => Array.isArray(mobilitySettings.customExercises) ? mobilitySettings.customExercises : [], [mobilitySettings.customExercises]);
  const adaptiveProgrammingEnabled = mobilitySettings.adaptiveProgrammingEnabled !== false;
  const preparationSeconds = Number(mobilitySettings.preparationSeconds ?? 10);
  const unknownPreparationSeconds = Number(mobilitySettings.unknownPreparationSeconds ?? 20);
  const transitionSeconds = Number(mobilitySettings.transitionSeconds ?? 10);
  const materialTransitionSeconds = Number(mobilitySettings.materialTransitionSeconds ?? 20);
  const longerPreparationForUnknown = mobilitySettings.longerPreparationForUnknown !== false;
  const audioEnabled = mobilitySettings.audioEnabled !== false;
  const voiceCues = mobilitySettings.voiceCues !== false;
  const weakSide = ["left", "right"].includes(mobilitySettings.weakSide) ? mobilitySettings.weakSide : "none";
  const workoutHistory = useMemo(
    () => Array.isArray(mobilitySettings.history) ? mobilitySettings.history : [],
    [mobilitySettings.history],
  );
  const coachSuggestion = useMemo(
    () => mobilityCoachSuggestion(reviewActivities, state.reviews, now),
    [reviewActivities, state.reviews, now],
  );
  const adaptiveProfile = useMemo(() => buildAdaptiveMobilityProfile({
    activities: reviewActivities,
    reviews: state.reviews,
    plan: state.plan,
    history: workoutHistory,
    now,
  }), [reviewActivities, state.reviews, state.plan, workoutHistory, now]);
  const weeklyCoachOverride = activeMobilityOverride(mobilitySettings.coachFocusOverride, now);
  const coachOverride = sessionCoachOverride || weeklyCoachOverride;
  const effectiveFocusAreaIds = coachOverride?.focusAreaIds || (adaptiveProgrammingEnabled
    ? mergeMobilityFocusAreas(adaptiveProfile.focusAreaIds, focusAreaIds)
    : focusAreaIds);
  const effectiveCondition = coachOverride?.condition || (adaptiveProgrammingEnabled ? adaptiveProfile.condition : condition);
  const focusPickerOpen = focusEditorOpen || focusAreaIds.length === 0;
  const knownExerciseCount = useMemo(() => new Set([...knownExerciseIds, ...physioExerciseIds]).size, [knownExerciseIds, physioExerciseIds]);
  const workoutOptions = useMemo(() => ({
    durationMinutes,
    condition: effectiveCondition,
    equipment,
    physioExerciseIds,
    focusAreaIds: effectiveFocusAreaIds,
    knownExerciseIds,
    preparationSeconds,
    unknownPreparationSeconds,
    transitionSeconds,
    materialTransitionSeconds,
    longerPreparationForUnknown,
    exerciseHistory: workoutHistory,
    adaptiveProfile: adaptiveProgrammingEnabled && !coachOverride ? adaptiveProfile : null,
    preferredExerciseIds,
    excludedExerciseIds,
    customExercises,
  }), [durationMinutes, effectiveCondition, equipment, physioExerciseIds, effectiveFocusAreaIds, knownExerciseIds, preparationSeconds, unknownPreparationSeconds, transitionSeconds, materialTransitionSeconds, longerPreparationForUnknown, workoutHistory, adaptiveProgrammingEnabled, adaptiveProfile, coachOverride, preferredExerciseIds, excludedExerciseIds, customExercises]);
  const workoutRotationOffset = workoutHistory.length + workoutShuffleOffset;
  const workout = useMemo(() => buildMobilityWorkout({
    ...workoutOptions,
    rotationOffset: workoutRotationOffset,
  }), [workoutOptions, workoutRotationOffset]);
  const localToday = new Date();
  const todayKey = `${localToday.getFullYear()}-${String(localToday.getMonth() + 1).padStart(2, "0")}-${String(localToday.getDate()).padStart(2, "0")}`;
  const todayMobilityPlan = state.plan.find((item) => !item.archived && !item.completed && !item.missedReason && item.date === todayKey && /stabi|mobility|kraft/i.test(`${item.title || ""} ${item.type || ""}`));
  function selectCoachTab(key) {
    setSearchParams(key === "today" ? {} : { tab: key }, { replace: true });
  }

  function updateMobility(patch) {
    setState((current) => ({
      ...current,
      mobilityCoach: { ...current.mobilityCoach, ...patch },
    }));
  }

  function saveRecommendationFeedback(status) {
    const entry = recommendationFeedbackEntry(unifiedCoach.recommendation, status);
    if (!entry) return;
    setState((current) => {
      const history = Array.isArray(current.coachRecommendationHistory) ? current.coachRecommendationHistory : [];
      return {
        ...current,
        coachRecommendationHistory: [
          entry,
          ...history.filter((item) => item.recommendationId !== entry.recommendationId),
        ].slice(0, 50),
      };
    });
  }

  function isExerciseKnown(id) {
    return physioExerciseIds.includes(id) || knownExerciseIds.includes(id);
  }

  function toggleKnownExercise(id) {
    if (physioExerciseIds.includes(id)) return;
    const next = knownExerciseIds.includes(id)
      ? knownExerciseIds.filter((item) => item !== id)
      : [...knownExerciseIds, id];
    updateMobility({ knownExerciseIds: next });
  }

  function saveMobilityFeedback(patch) {
    const sessionId = runner?.sessionId;
    if (!sessionId) return;
    setRunner((current) => current ? { ...current, feedback: { ...(current.feedback || {}), ...patch } } : current);
    setState((current) => ({
      ...current,
      mobilityCoach: {
        ...current.mobilityCoach,
        history: (current.mobilityCoach?.history || []).map((entry) => entry.sessionId === sessionId
          ? { ...entry, ...patch }
          : entry),
      },
    }));
  }

  function toggleEquipment(id) {
    const next = equipment.includes(id) ? equipment.filter((item) => item !== id) : [...equipment, id];
    updateMobility({ equipment: next });
    setRunner(null);
  }

  function toggleFocus(id) {
    setFocusEditorOpen(true);
    if (focusAreaIds.includes(id)) {
      updateMobility({ focusAreaIds: focusAreaIds.filter((item) => item !== id) });
    } else if (focusAreaIds.length < 3) {
      updateMobility({ focusAreaIds: [...focusAreaIds, id] });
    }
    setRunner(null);
  }

  function useCoachSuggestionForSession() {
    if (!coachSuggestion) return;
    setSessionCoachOverride({
      ...coachSuggestion,
      scope: "session",
    });
    setWorkoutShuffleOffset(0);
    setRunner(null);
  }

  function useCoachSuggestionForWeek() {
    if (!coachSuggestion) return;
    updateMobility({
      coachFocusOverride: {
        ...coachSuggestion,
        scope: "week",
        acceptedAt: new Date().toISOString(),
        expiresOn: mobilityOverrideExpiry(new Date()),
      },
    });
    setSessionCoachOverride(null);
    setWorkoutShuffleOffset(0);
    setRunner(null);
  }

  function clearCoachOverride() {
    setSessionCoachOverride(null);
    if (weeklyCoachOverride) updateMobility({ coachFocusOverride: null });
    setWorkoutShuffleOffset(0);
    setRunner(null);
  }

  function shuffleWorkout() {
    if (runner || workout.items.length < 2) return;
    const nextRotationOffset = nextMobilityWorkoutRotation(workoutOptions, workoutRotationOffset);
    setWorkoutShuffleOffset(nextRotationOffset - workoutHistory.length);
  }

  async function activateWorkoutAudio({ demo = false, announce = "" } = {}) {
    if (!audioEnabled) {
      setAudioFeedback({ tone: "bad", message: "Signaltöne sind ausgeschaltet. Aktiviere sie unter Timer & Pausen." });
      return false;
    }

    setAudioFeedback({ tone: "testing", message: demo ? "Ton und Sprache werden getestet …" : "Audio wird aktiviert …" });
    const tonePromise = demo
      ? playWorkoutAudioDemo()
      : primeWorkoutAudio({ audible: true });
    // Trigger speech before the first await so strict mobile browsers still
    // treat it as part of the user's click/tap interaction.
    const speechReady = voiceCues && announce ? speakWorkoutCue(announce) : !voiceCues;
    const tonesReady = await tonePromise;
    const capabilities = workoutAudioCapabilities();

    if (!tonesReady) {
      setAudioFeedback({
        tone: "bad",
        message: capabilities.tonesSupported
          ? "Der Browser blockiert den Ton. Drücke erneut auf Ton aktivieren, prüfe die Medienlautstärke und verlasse den Lautlosmodus."
          : "Dieser Browser unterstützt die benötigte Audio-Ausgabe nicht.",
      });
      return false;
    }

    if (voiceCues && !speechReady) {
      setAudioFeedback({ tone: "warn", message: "Signaltöne sind aktiv, aber die Sprachausgabe wird vom Browser nicht unterstützt." });
      return true;
    }

    setAudioFeedback({
      tone: "good",
      message: voiceCues ? "Ton und deutsche Sprachausgabe sind aktiv." : "Signaltöne sind aktiv. Sprachausgabe ist ausgeschaltet.",
    });
    return true;
  }

  async function testWorkoutAudio() {
    const ready = await activateWorkoutAudio({ demo: true, announce: "Audio aktiviert. Du hörst jetzt die Signaltöne." });
    if (!ready) return;
    if (voiceCues) window.setTimeout(() => speakWorkoutCue("Drei, zwei, eins. Start. Seitenwechsel. Workout abgeschlossen."), 7600);
  }

  async function startWorkout() {
    if (!workout.items.length) return;
    const items = workout.items.map((item) => ({ ...item }));
    const firstPhase = items[0].preparationSeconds > 0 ? "prepare" : "work";
    if (audioEnabled) {
      await activateWorkoutAudio({
        announce: voiceCues
          ? `Workout startet. ${items[0].name}. ${firstPhase === "prepare" ? `Vorbereitung ${runnerPhaseSeconds(items, 0, firstPhase, 0)} Sekunden.` : "Start."}`
          : "",
      });
    }
    previousRunnerRef.current = null;
    cueKeyRef.current = "";
    setRunner({
      sessionId: crypto.randomUUID(),
      planItemId: todayMobilityPlan?.id || null,
      focusAreaIds: [...effectiveFocusAreaIds],
      items,
      title: workout.title,
      durationMinutes: workout.durationMinutes,
      completedExerciseIds: [],
      index: 0,
      phase: firstPhase,
      sideIndex: 0,
      remaining: runnerPhaseSeconds(items, 0, firstPhase, 0),
      running: true,
      complete: false,
      saved: false,
      feedback: { fitScore: 0, zoneResponse: "" },
    });
  }

  function closeFinishedWorkout() {
    if (!runner?.saved) return;
    setWorkoutShuffleOffset(0);
    if (sessionCoachOverride) setSessionCoachOverride(null);
    setRunner(null);
  }

  function openExerciseGuide(exercise) {
    setRunner((current) => current ? { ...current, running: false } : current);
    setSelectedGuide(exercise);
  }

  useEffect(() => {
    if (!runner?.running) return undefined;
    const timer = window.setInterval(() => {
      setRunner((current) => {
        if (!current?.running) return current;
        if (current.remaining > 1) return { ...current, remaining: current.remaining - 1 };
        return advanceMobilityRunner(current);
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [runner?.running]);

  useEffect(() => {
    const workoutActive = Boolean(runner?.running && !runner?.complete);
    if (!workoutActive) {
      const lock = wakeLockRef.current;
      wakeLockRef.current = null;
      releaseScreenWakeLock(lock);
      return undefined;
    }

    let cancelled = false;
    async function acquire() {
      if (cancelled || document.visibilityState !== "visible" || wakeLockRef.current) return;
      const result = await requestScreenWakeLock();
      if (cancelled) {
        await releaseScreenWakeLock(result.lock);
        return;
      }
      if (!result.supported) {
        setWakeLockStatus("unsupported");
        return;
      }
      if (!result.lock) {
        setWakeLockStatus("error");
        return;
      }
      wakeLockRef.current = result.lock;
      setWakeLockStatus("active");
      result.lock.addEventListener?.("release", () => {
        if (cancelled || wakeLockRef.current !== result.lock) return;
        wakeLockRef.current = null;
        setWakeLockStatus(document.visibilityState === "visible" ? "error" : "waiting");
      });
    }
    function handleVisibility() {
      if (document.visibilityState === "visible") acquire();
    }

    acquire();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibility);
      const lock = wakeLockRef.current;
      wakeLockRef.current = null;
      releaseScreenWakeLock(lock);
    };
  }, [runner?.running, runner?.complete]);

  const activeExercise = runner ? runner.items?.[runner.index] : null;

  useEffect(() => {
    if (!runner?.complete || runner.saved || !runner.sessionId) return undefined;
    const completedRunner = runner;
    const saveTimer = window.setTimeout(() => {
      const completedAt = new Date().toISOString();
      const completedItems = Array.isArray(completedRunner.items) ? completedRunner.items : [];
      const completedExerciseIds = Array.isArray(completedRunner.completedExerciseIds)
        ? completedRunner.completedExerciseIds
        : completedItems.map((item) => item.id);
      const historyEntry = {
        id: crypto.randomUUID(),
        sessionId: completedRunner.sessionId,
        completedAt,
        title: completedRunner.title,
        durationMinutes: completedRunner.durationMinutes,
        exerciseIds: [...new Set(completedExerciseIds)],
        focusAreaIds: Array.isArray(completedRunner.focusAreaIds) ? completedRunner.focusAreaIds : [],
        planItemId: completedRunner.planItemId || null,
        fitScore: Number(completedRunner.feedback?.fitScore || 0),
        zoneResponse: completedRunner.feedback?.zoneResponse || "",
        adaptiveProfileId: adaptiveProgrammingEnabled ? adaptiveProfile.id : "",
      };

      setState((current) => {
        const currentHistory = Array.isArray(current.mobilityCoach?.history) ? current.mobilityCoach.history : [];
        const history = currentHistory.some((item) => item.sessionId === completedRunner.sessionId)
          ? currentHistory
          : [historyEntry, ...currentHistory].slice(0, 30);
        return {
          ...current,
          mobilityCoach: { ...current.mobilityCoach, history },
          plan: current.plan.map((item) => item.id === completedRunner.planItemId ? {
            ...item,
            completed: true,
            completedAt,
            actualTitle: completedRunner.title || "Stabi & Mobility Coach",
            actualDuration: Number(completedRunner.durationMinutes || 0),
            actualSource: "Dein Coach",
            matchedMobilityWorkoutId: completedRunner.sessionId,
            missedReason: "",
          } : item),
        };
      });
      setRunner((current) => current?.sessionId === completedRunner.sessionId ? { ...current, saved: true, completedAt } : current);
    }, 0);
    return () => window.clearTimeout(saveTimer);
  }, [runner, setState, adaptiveProgrammingEnabled, adaptiveProfile.id]);

  useEffect(() => {
    const previous = previousRunnerRef.current;
    if (!runner) {
      previousRunnerRef.current = null;
      cueKeyRef.current = "";
      return;
    }
    if (!audioEnabled) {
      previousRunnerRef.current = runner;
      return;
    }

    const phaseChanged = !previous
      || previous.phase !== runner.phase
      || previous.index !== runner.index
      || Number(previous.sideIndex || 0) !== Number(runner.sideIndex || 0);
    if (runner.complete && !previous?.complete) {
      playWorkoutCue("complete");
      if (voiceCues) speakWorkoutCue("Workout abgeschlossen");
    } else if (phaseChanged) {
      if (runner.phase === "side-switch") {
        playWorkoutCue("switch");
        if (voiceCues) speakWorkoutCue(`${activeExercise?.switchCue || "Seite wechseln"}. ${nextRunnerSideLabel(weakSide)}. Start in ${runner.remaining} Sekunden`);
      } else {
        if (previous?.phase === "work") playWorkoutCue("end");
        if (runner.phase === "transition" && voiceCues) {
          speakWorkoutCue(`Übung beendet. Als Nächstes ${activeExercise?.name || "die nächste Übung"}. Wechselpause ${runner.remaining} Sekunden.`);
        }
        if (runner.phase === "work") {
          playWorkoutCue("start");
          const sideLabel = activeRunnerSideLabel(activeExercise, runner.phase, runner.sideIndex, weakSide);
          if (voiceCues) speakWorkoutCue(`Start ${activeExercise?.name || "Übung"}${sideLabel ? `. ${sideLabel}` : ""}`);
        }
      }
    }

    const countdownBeforeStart = runner.phase === "prepare"
      || runner.phase === "side-switch"
      || (runner.phase === "transition" && Number(activeExercise?.preparationSeconds || 0) <= 0);
    const countdownBeforeEnd = runner.phase === "work";
    if (
      runner.running
      && !runner.complete
      && runner.remaining > 0
      && runner.remaining <= 3
      && (countdownBeforeStart || countdownBeforeEnd)
    ) {
      const countdownKey = `${runner.index}-${runner.phase}-${runner.remaining}`;
      if (cueKeyRef.current !== countdownKey) {
        cueKeyRef.current = countdownKey;
        playWorkoutCue(`countdown${runner.remaining}`);
      }
    }


    previousRunnerRef.current = runner;
  }, [runner, activeExercise, audioEnabled, voiceCues, weakSide]);
  const runnerPhase = runner?.phase || "work";
  const runnerPhaseLabel = runnerPhase === "prepare"
    ? "Vorbereitung"
    : runnerPhase === "transition"
      ? "Wechselpause"
      : runnerPhase === "side-switch"
        ? "Seitenwechsel"
        : "Übung";
  const runnerPhaseAction = runnerPhase === "work"
    ? "Übung abschließen"
    : runnerPhase === "prepare"
      ? "Jetzt starten"
      : runnerPhase === "side-switch"
        ? "Zweite Seite starten"
        : "Vorbereitung starten";
  const runnerSideLabel = activeRunnerSideLabel(activeExercise, runnerPhase, runner?.sideIndex, weakSide);
  const switchMoment = runnerPhase === "side-switch";

  return (
    <>
      <PageTitle eyebrow="Coach Engine" title="Dein Coach">{activeTab === "mobility" && <Link className="button-link" to="/coach/exercises">Übungen verwalten</Link>}</PageTitle>
      <div className="section-tabs coach-tabs" role="tablist" aria-label="Coach-Bereiche">
        {coachTabs.map(([key, label]) => <button type="button" className={activeTab === key ? "selected" : ""} onClick={() => selectCoachTab(key)} key={key}>{label}</button>)}
      </div>

      {activeTab === "today" && (
        <div className="grid coach-dashboard-grid">
          <Card className={`wide insight coach-recommendation unified-${unifiedCoach.level}`}>
            <div className="coach-recommendation-heading">
              <div>
                <p className="eyebrow">Coach-Entscheidung heute</p>
                <h2>{unifiedCoach.recommendation.title}</h2>
              </div>
              <span className={unifiedCoach.tone}>{unifiedCoach.label}</span>
            </div>
            <p className="coach-recommendation-copy">{unifiedCoach.recommendation.text}</p>
            {unifiedCoach.level !== "ok" && <Link className="button-link coach-primary-action" to={unifiedCoach.recommendation.action.href}>{unifiedCoach.recommendation.action.label}</Link>}
            <details className="coach-evidence coach-decision-evidence">
              <summary>Warum entscheidet der Coach so?</summary>
              <ul>{unifiedCoach.recommendation.evidence.map((item) => <li key={item}>{item}.</li>)}</ul>
              <small>{unifiedCoach.protectionNote}</small>
            </details>
            <div className="coach-recommendation-actions">
              <div>
                <span>{currentRecommendationFeedback ? "Dein Feedback ist gespeichert:" : "War diese Einordnung hilfreich?"}</span>
                <button type="button" className={currentRecommendationFeedback?.status === "helpful" ? "selected" : ""} onClick={() => saveRecommendationFeedback("helpful")}>Hilfreich</button>
                <button type="button" className={currentRecommendationFeedback?.status === "not_helpful" ? "selected" : ""} onClick={() => saveRecommendationFeedback("not_helpful")}>Nicht passend</button>
              </div>
            </div>
          </Card>
          <details className="card wide coach-today-data">
            <summary>
              <div><p className="eyebrow">Daten hinter der Entscheidung</p><h2>{openReviews.length ? `${openReviews.length} Review${openReviews.length === 1 ? "" : "s"} offen` : "Keine offene Pflicht-Rückmeldung"}</h2></div>
              <span>{analysis.hrWeather.value}</span>
            </summary>
            <div className="coach-today-data-grid">
              <article><small>Reviews im Monat</small><strong>{reviewed.length}/{monthReviewable.length} bewertet</strong><p>{openReviews.length ? `${openReviews.length} relevante ${openReviews.length === 1 ? "Einheit ist" : "Einheiten sind"} noch offen.` : `Alle relevanten Einheiten aus ${monthFormatter.format(now)} sind bewertet.`}</p></article>
              <article><small>Herzfrequenz & Wetter</small><strong>{analysis.hrWeather.value}</strong><p>{analysis.hrWeather.text}</p></article>
            </div>
          </details>
          {openReviews.length > 0 && (
            <Card className="wide">
              <div className="card-heading-row"><div><p className="eyebrow">Review-Warteschlange</p><h2>{monthFormatter.format(now)}</h2></div><span>{openReviews.length}</span></div>
              <div className="coach-review-list">
                {openReviews.map((activity) => (
                  <button key={activity.id} onClick={() => setSelected(activity)}>
                    <div><strong>{activity.name}</strong><span>{fmtDate(activityDate(activity))} · {reviewKindLabel(activity)}{Number(activity.distance || 0) ? ` · ${Number(activity.distance).toFixed(1)} km` : ""}</span></div>
                    <em>Review öffnen →</em>
                  </button>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {activeTab === "development" && (
        <div className="grid coach-dashboard-grid">
          <Card className="wide coach-athlete-model">
            <div className="coach-athlete-model-heading"><div><p className="eyebrow">Athletenmodell</p><h2>{athleteAssessment.observedLabel} · Belastungsverträglichkeit {athleteAssessment.tolerance.label}</h2><p className="muted">Dein Coach lernt aus deiner tatsächlichen Routine. Eine höhere Einstufung oder zusätzliche Einheit wird nur vorgeschlagen, nie automatisch übernommen.</p></div><span>{athleteAssessment.specializationLabel}</span></div>
            <div className="coach-athlete-model-metrics"><div><small>Läufe/Woche</small><strong>{athleteAssessment.metrics.runsPerWeek.toFixed(1)}</strong></div><div><small>km/Woche</small><strong>{athleteAssessment.metrics.weeklyKm.toFixed(0)}</strong></div><div><small>Longrun</small><strong>{athleteAssessment.metrics.longestRun.toFixed(1)} km</strong></div><div><small>Höhenmeter</small><strong>{athleteAssessment.metrics.weeklyElevation.toFixed(0)} hm</strong></div></div>
            <p><b>Progressionsrichtung:</b> {athleteAssessment.progressionFocus}</p>
          </Card>
          <Card className="wide coach-mission-outlook">
            <div className="coach-outlook-heading">
              <div>
                <p className="eyebrow">Missionsausblick</p>
                <h2>{outlook.nextTarget ? `${outlook.nextTarget.name} in ${outlook.nextDays} Tagen` : "Kein nächstes Ziel hinterlegt"}</h2>
                <p className="muted">{outlook.nextTarget
                  ? `${outlook.nextTarget.id !== outlook.strategicTarget?.id ? `Nächster Termin: ${outlook.targetRange.label}. Strategischer Trainingsfokus: ${outlook.strategicTarget?.name || "noch offen"} · Priorität ${outlook.strategicTarget?.priority || "B"} · ${outlook.strategicDays ?? "?"} Tage. ` : `Zielkorridor: ${outlook.targetRange.label}. `}${outlook.phaseLabel}.`
                  : "Lege unter Training → Ziele einen Wettkampf oder Meilenstein an."}</p>
              </div>
              <div className={`coach-readiness-badge status-only ${outlook.readiness.tone}`}>
                <i aria-hidden="true" />
                <div>
                  <span>{outlook.phaseLabel}</span>
                  <strong>{outlook.readiness.label}</strong>
                </div>
              </div>
            </div>
            <p className="coach-readiness-copy coach-readiness-lead">{outlook.readiness.text}</p>
            <div className="coach-readiness-factors">
              {outlook.factors.map((factor) => (
                <article className={factor.state} key={factor.id}>
                  <div className="coach-readiness-factor-heading">
                    <span>{factor.label}</span>
                    <strong>{factor.value}</strong>
                  </div>
                  <p>{factor.text}</p>
                </article>
              ))}
            </div>
            <div className="coach-loop-preview">
              <div><p className="eyebrow">Nächster konkreter Schritt{outlook.loop.targetName ? ` · ${outlook.loop.targetName} (${outlook.loop.priority})` : ""}</p><h3>{outlook.loop.title}</h3><p>{outlook.loop.text}</p></div>
              <p className="coach-readiness-copy"><strong>Wichtig:</strong> „Im Aufbau“ ist kein Defizit. Der Coach steigert nur, wenn Phase und Erholung es erlauben.</p>
            </div>
            <details className="coach-outlook-data">
              <summary>Datengrundlage anzeigen</summary>
              <div className="coach-outlook-metrics">
                <div><span>Ø 8 Wochen</span><strong>{outlook.averageKm} km/Woche</strong></div>
                <div><span>Längster Lauf</span><strong>{outlook.longestRun} km</strong></div>
                <div><span>Aktive Wochen</span><strong>{outlook.activeWeeks}/8</strong></div>
                <div><span>Schlüsseleinheiten</span><strong>{outlook.keySessions}</strong></div>
              </div>
              <small>{outlook.dataScope}</small>
            </details>
            {outlook.roadmap.length > 0 && <div className="coach-roadmap">{outlook.roadmap.map((step) => <article className={step.current ? "current" : ""} key={`${step.label}-${step.title}`}><span>{step.label}</span><h3>{step.title}</h3><p>{step.text}</p></article>)}</div>}
            {outlook.mainTarget && outlook.strategicTarget && outlook.mainTarget.id !== outlook.strategicTarget.id && <p className="coach-main-target-note"><strong>Nach {outlook.strategicTarget.name}:</strong> {outlook.mainTarget.name} in {outlook.mainDays} Tagen.</p>}
          </Card>
          {goalEngine.target && (
            <details className={`card wide mission-goal-engine mission-goal-engine-compact coach-goal-assessment ${goalEngine.feasibility.status}`}>
              <summary className="mission-goal-engine-heading">
                <div>
                  <p className="eyebrow">Zielanalyse</p>
                  <h2>{goalEngine.feasibility.label} · {goalEngine.phase.label}</h2>
                  <p>{goalEngine.feasibility.summary}</p>
                </div>
                <span>Coach-Einschätzung öffnen →</span>
              </summary>
              <div className="mission-goal-engine-body">
                <div className="mission-goal-engine-metrics">
                  <div><small>Zielart</small><strong>{{ finish: "Finish", time: "Zielzeit", pb: "Bestzeit", distance: "Distanz / Runden", training: "Vorbereitung" }[goalEngine.goalType] || goalEngine.goalType}</strong></div>
                  <div><small>Zielpace</small><strong>{goalEngine.targetPaceLabel || "Nicht pacegesteuert"}</strong></div>
                  <div><small>Wochenrahmen</small><strong>mind. {goalEngine.requiredRuns} passende Läufe</strong></div>
                  <div><small>Noch verfügbar</small><strong>{goalEngine.preparation?.remainingWeeksLabel || `${Math.max(0, Math.ceil(goalEngine.weeksLeft))} Wochen`}</strong></div>
                </div>
                <div className="mission-goal-engine-evidence">
                  <div><small>Langzeiterfahrung</small><strong>{goalEngine.experience.label}</strong><p>{goalEngine.experience.summary}</p></div>
                  <div><small>Aktuelle Form</small><strong>{goalEngine.currentForm.label}</strong><p>{goalEngine.currentForm.summary}</p></div>
                  <div><small>Zielspezifischer Aufbau</small><strong>{goalEngine.targetGap.label}</strong><p>{goalEngine.targetGap.summary}</p></div>
                </div>
                {goalEngine.preparation?.summary && <p className="mission-goal-engine-preparation"><strong>Vorbereitungslogik:</strong> {goalEngine.preparation.summary}</p>}
                <div className="mission-goal-engine-abilities"><strong>Dafür trainiert der Coach:</strong><div>{goalEngine.abilities.map((ability) => <span key={ability}>{ability}</span>)}</div></div>
                {(goalEngine.feasibility.reasons.length > 0 || goalEngine.constraintWarnings.length > 0) && (
                  <div className="mission-goal-engine-warnings">
                    {[...goalEngine.feasibility.reasons, ...goalEngine.constraintWarnings].map((reason) => (
                      <span key={reason}><b aria-hidden="true">!</b><span>{reason}</span></span>
                    ))}
                  </div>
                )}
              </div>
            </details>
          )}
          <SignalCard eyebrow="Schlüsseleinheiten" signal={analysis.keySessions} />
        </div>
      )}

      {activeTab === "race" && (
        <div className="grid coach-race-grid">
          <Card className="wide coach-race-shell">
            <RaceCoach />
          </Card>
        </div>
      )}

      {activeTab === "mobility" && (
        <div className="grid mobility-coach-grid">
          <Card className={`wide mobility-adaptive-card ${adaptiveProfile.safetyMode ? "safety" : effectiveCondition}`}>
            <div className="mobility-adaptive-heading">
              <div>
                <p className="eyebrow">Heutiger Coach-Fokus</p>
                <h2>{adaptiveProgrammingEnabled ? adaptiveProfile.title : "Automatische Auswahl pausiert"}</h2>
                <p>{adaptiveProgrammingEnabled ? adaptiveProfile.reason : "Deine persönlichen Schwerpunkte und die manuell gewählte Tagesform bestimmen das Workout."}</p>
              </div>
              <label className="mobility-adaptive-toggle">
                <input type="checkbox" checked={adaptiveProgrammingEnabled} onChange={(event) => { updateMobility({ adaptiveProgrammingEnabled: event.target.checked }); setRunner(null); }} />
                <span><b>Coach programmiert automatisch</b><small>Reviews, heutiges Training und die nächste Schlüsseleinheit steuern die Auswahl.</small></span>
              </label>
            </div>
            {adaptiveProgrammingEnabled && <>
              <div className="mobility-adaptive-focuses">{adaptiveProfile.focusAreaIds.map((id) => <span key={id}>{focusAreaLabel(id)}</span>)}</div>
              {adaptiveProfile.factors.length > 0 && <div className="mobility-adaptive-factors">{adaptiveProfile.factors.map((factor) => <span key={factor}>{factor}</span>)}</div>}
              {adaptiveProfile.safetyMode && <p className="mobility-adaptive-safety"><strong>Schmerzsignal erkannt:</strong> Nur beschwerdefrei und kontrolliert arbeiten. Bei anhaltenden oder zunehmenden Beschwerden Einheit abbrechen.</p>}
            </>}
          </Card>

          <Card className="wide mobility-focus-card">
            <div className="settings-section-heading">
              <div>
                <p className="eyebrow">Persönliche Trainingsschwerpunkte</p>
                <h2>Woran möchtest du arbeiten?</h2>
              </div>
              <div className="mobility-focus-heading-actions">
                <span>{focusAreaIds.length}/3 gewählt</span>
                {focusAreaIds.length > 0 && (
                  <button type="button" onClick={() => setFocusEditorOpen((current) => !current)}>
                    {focusPickerOpen ? "Auswahl schließen" : "Ändern"}
                  </button>
                )}
              </div>
            </div>
            <p className="mobility-focus-summary"><b>Aktiv:</b> {focusAreaIds.length ? focusAreaIds.map(focusAreaLabel).join(" · ") : "Standard / ausgewogen"} <span>Die Auswahl wird in deiner Cloud-Konfiguration gespeichert.</span></p>
            {focusPickerOpen && (
              <div className="mobility-focus-editor">
                <p className="muted">Optional und für jeden Nutzer frei einstellbar. Ohne Auswahl entsteht ein ausgewogenes Standard-Workout. Mit Schwerpunkten kommen je nach verfügbarer Zeit ein bis zwei passende Übungen zusätzlich in den Ablauf.</p>
                <div className="mobility-focus-picker">
                  <button type="button" className={!focusAreaIds.length ? "selected standard" : "standard"} onClick={() => { setFocusEditorOpen(true); updateMobility({ focusAreaIds: [] }); setRunner(null); }}>
                    <strong>Standard / ausgewogen</strong>
                    <span>Keine individuelle Priorität</span>
                  </button>
                  {MOBILITY_FOCUS_AREAS.map((focus) => {
                    const selectedFocus = focusAreaIds.includes(focus.id);
                    const disabled = !selectedFocus && focusAreaIds.length >= 3;
                    return (
                      <button type="button" disabled={disabled} className={selectedFocus ? "selected" : ""} onClick={() => toggleFocus(focus.id)} key={focus.id}>
                        <strong>{focus.label}</strong>
                        <span>{focus.description}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>

          {coachOverride ? (
            <Card className="wide mobility-coach-suggestion active">
              <div>
                <p className="eyebrow">Coach-Fokus aktiv · {coachOverride.scope === "week" ? "diese Woche" : "dieses Workout"}</p>
                <h2>{coachOverride.title}</h2>
                <p>{coachOverride.reason}</p>
                <small>Temporär aktiv: {coachOverride.focusAreaIds.map(focusAreaLabel).join(" · ")}. Deine persönlichen Schwerpunkte bleiben unverändert.</small>
              </div>
              <button type="button" onClick={clearCoachOverride}>Coach-Fokus zurücksetzen</button>
            </Card>
          ) : !adaptiveProgrammingEnabled && coachSuggestion && dismissedCoachSuggestionId !== coachSuggestion.id ? (
            <Card className="wide mobility-coach-suggestion">
              <div>
                <p className="eyebrow">Vorschlag vom Coach</p>
                <h2>{coachSuggestion.title}</h2>
                <p>{coachSuggestion.reason}</p>
                <small>{coachSuggestion.detail}</small>
              </div>
              <div className="mobility-coach-suggestion-actions">
                <button type="button" className="primary" onClick={useCoachSuggestionForSession}>Für dieses Workout</button>
                <button type="button" onClick={useCoachSuggestionForWeek}>Diese Woche priorisieren</button>
                <button type="button" className="secondary" onClick={() => setDismissedCoachSuggestionId(coachSuggestion.id)}>Nicht jetzt</button>
              </div>
            </Card>
          ) : null}

          <Card className="wide mobility-workout-hero">
            <div className="mobility-workout-heading">
              <div>
                <p className="eyebrow">Stabi & Mobility Workout</p>
                <h2>{todayMobilityPlan ? `Heute geplant: ${todayMobilityPlan.title}` : workout.title}</h2>
                <p className="muted">Physio-Übungen haben Vorrang. Danach berücksichtigt dein Coach deine persönlichen Schwerpunkte, Tagesform, Zeit und vorhandenes Material.</p>
              </div>
            </div>
            <div className="mobility-workout-summary">
              <span><b>{workout.items.length}</b> Übungen</span>
              <span><b>{secondsLabel(workout.activeSeconds)}</b> Training</span>
              <span><b>{secondsLabel(workout.pauseSeconds)}</b> Vorbereitung & Wechsel</span>
              <span><b>{secondsLabel(workout.totalSeconds)}</b> Gesamtzeit</span>
              <span><b>{physioExerciseIds.length}</b> Physio-Prioritäten</span>
            </div>
            <div className="mobility-controls">
              <label>Reine Trainingszeit
                <select value={durationMinutes} onChange={(event) => { updateMobility({ durationMinutes: Number(event.target.value) }); setRunner(null); }}>
                  {[10, 15, 20, 25, 30].map((value) => <option value={value} key={value}>{value} Minuten Bewegung</option>)}
                </select>
              </label>
              <label>Tagesform
                <select value={effectiveCondition} disabled={adaptiveProgrammingEnabled && !coachOverride} onChange={(event) => { if (coachOverride) clearCoachOverride(); updateMobility({ condition: event.target.value }); setRunner(null); }}>
                  <option value="fresh">Erholt</option><option value="normal">Normal</option><option value="tired">Müde / Regeneration</option>
                </select>
              </label>
            </div>
            <div className="mobility-equipment-picker">
              <b>Vorhandenes Material</b>
              <div>{MOBILITY_EQUIPMENT.map((item) => <button type="button" className={equipment.includes(item.id) ? "selected" : ""} onClick={() => toggleEquipment(item.id)} key={item.id}>{item.label}</button>)}</div>
            </div>
            <details className="mobility-timer-settings">
              <summary><span><b>Timer & Pausen</b><small>{preparationSeconds ? `${preparationSeconds}s Vorbereitung` : "3–2–1 Start-Countdown"} · {transitionSeconds}s Übungswechsel · Seitenwechsel automatisch 3–5s</small></span><strong>{knownExerciseCount} bekannt</strong></summary>
              <div className="mobility-timer-grid">
                <label>Vorbereitung bekannte Übung
                  <select value={preparationSeconds} onChange={(event) => { updateMobility({ preparationSeconds: Number(event.target.value) }); setRunner(null); }}>
                    {[0, 5, 10, 15, 20].map((value) => <option value={value} key={value}>{value === 0 ? "Nur 3–2–1 Countdown" : `${value} Sekunden`}</option>)}
                  </select>
                </label>
                <label>Vorbereitung neue Übung
                  <select value={unknownPreparationSeconds} disabled={!longerPreparationForUnknown} onChange={(event) => { updateMobility({ unknownPreparationSeconds: Number(event.target.value) }); setRunner(null); }}>
                    {[10, 15, 20, 30, 45].map((value) => <option value={value} key={value}>{value} Sekunden</option>)}
                  </select>
                </label>
                <label>Normale Wechselpause
                  <select value={transitionSeconds} onChange={(event) => { updateMobility({ transitionSeconds: Number(event.target.value) }); setRunner(null); }}>
                    {[0, 5, 10, 15, 20].map((value) => <option value={value} key={value}>{value} Sekunden</option>)}
                  </select>
                </label>
                <label>Pause bei Materialwechsel
                  <select value={materialTransitionSeconds} onChange={(event) => { updateMobility({ materialTransitionSeconds: Number(event.target.value) }); setRunner(null); }}>
                    {[10, 15, 20, 30, 45].map((value) => <option value={value} key={value}>{value} Sekunden</option>)}
                  </select>
                </label>
                <label>Seite, mit der du beginnst
                  <select value={weakSide} onChange={(event) => updateMobility({ weakSide: event.target.value })}>
                    <option value="none">Standard: links beginnen</option>
                    <option value="left">Links zuerst · aktuell schwächer</option>
                    <option value="right">Rechts zuerst · aktuell schwächer</option>
                  </select>
                </label>
              </div>
              <label className="mobility-timer-toggle"><input type="checkbox" checked={longerPreparationForUnknown} onChange={(event) => { updateMobility({ longerPreparationForUnknown: event.target.checked }); setRunner(null); }} /><span><b>Unbekannte Übungen länger vorbereiten</b><small>Markierte Physio-Übungen gelten automatisch als bekannt. Weitere Übungen kannst du in der Anleitung als bekannt markieren.</small></span></label>
              <label className="mobility-timer-toggle"><input type="checkbox" checked={audioEnabled} onChange={(event) => updateMobility({ audioEnabled: event.target.checked })} /><span><b>Signaltöne im Workout</b><small>Deutlich hörbarer 3–2–1-Countdown vor Start und Ende sowie eigene Töne für Seitenwechsel und Workout-Abschluss.</small></span></label>
              <label className="mobility-timer-toggle"><input type="checkbox" checked={voiceCues} disabled={!audioEnabled} onChange={(event) => updateMobility({ voiceCues: event.target.checked })} /><span><b>Übungen und Seitenwechsel ansagen</b><small>Der Coach nennt Übungsstart, nächste Übung, Seitenwechsel und Workout-Abschluss auf Deutsch.</small></span></label>
              <div className={`mobility-audio-actions ${audioFeedback.tone}`}><button type="button" onClick={testWorkoutAudio}>Ton & Sprache aktivieren</button><span className="mobility-audio-status" role="status">{audioFeedback.message}</span></div>
              <p>Die gewählte Zeit ist reine Bewegungszeit. Vorbereitung, Übungswechsel und automatisch hinterlegte Seitenwechsel kommen zusätzlich hinzu. Bei Seitstütz, Bandübungen und einbeinigen Übungen pausiert der Timer 3–5 Sekunden; alternierende Übungen und Fußkreisen laufen ohne künstliche Unterbrechung weiter.</p>
            </details>
            {workout.missingPhysio.length > 0 && <div className="mobility-warning"><strong>Physioübung aktuell nicht im Workout:</strong> {workout.missingPhysio.map((item) => `${item.name} (${(item.equipment || item.equipmentAny || []).map(equipmentLabel).join(" oder ")})`).join(", ")}</div>}
            {workout.missingFocus.length > 0 && <div className="mobility-warning"><strong>Schwerpunkt ohne passende Übung:</strong> {workout.missingFocus.map(focusAreaLabel).join(", ")}. Prüfe das ausgewählte Material.</div>}
          </Card>

          <Card className="wide mobility-workout-plan">
            <div className="settings-section-heading">
              <div><p className="eyebrow">Heutiger Ablauf</p><h2>{workout.items.length} Übungsschritte</h2></div>
              {!runner && <div className="mobility-workout-actions">
                <button type="button" className="secondary" onClick={shuffleWorkout} disabled={workout.items.length < 2} title="Eine andere passende Auswahl und Reihenfolge erzeugen">↻ Neu mischen</button>
                <button type="button" className="primary compact-primary" onClick={startWorkout}>Workout starten</button>
              </div>}
            </div>
            {runner && (runner.complete || activeExercise) && (
              <div className={`mobility-runner phase-${runnerPhase} ${runner.complete ? "complete" : ""} ${switchMoment ? "switch-now" : ""}`}>
                {runner.complete ? <>
                  <p className="eyebrow">Geschafft</p>
                  <h2>Workout abgeschlossen</h2>
                  <p className="mobility-completion-note">{runner.saved ? (runner.planItemId ? "Die heutige Stabi-/Mobility-Einheit wurde automatisch als erledigt markiert." : "Das Workout wurde automatisch in deinem Verlauf gespeichert.") : "Workout wird gespeichert …"}</p>
                  <div className="mobility-completion-feedback">
                    <div><span>Wie passend war die heutige Auswahl?</span><div className="mobility-score-buttons">{Array.from({ length: 10 }, (_, index) => index + 1).map((score) => <button type="button" className={Number(runner.feedback?.fitScore) === score ? "selected" : ""} onClick={() => saveMobilityFeedback({ fitScore: score })} key={score}>{score}</button>)}</div></div>
                    <div><span>Wie fühlen sich die belasteten Bereiche jetzt an?</span><div className="mobility-response-buttons">{[["better", "Besser"], ["same", "Unverändert"], ["worse", "Schlechter"]].map(([value, label]) => <button type="button" className={runner.feedback?.zoneResponse === value ? "selected" : ""} onClick={() => saveMobilityFeedback({ zoneResponse: value })} key={value}>{label}</button>)}</div></div>
                    <small>Dein Coach nutzt dieses Feedback bei der nächsten Übungsauswahl. Es ist optional.</small>
                  </div>
                  <button type="button" className="primary compact-primary" onClick={closeFinishedWorkout} disabled={!runner.saved}>Workout schließen</button>
                </> : <>
                  <div className="mobility-runner-topline"><span>{runnerPhaseLabel} · Schritt {runner.index + 1} von {runner.items.length}</span><small>{isExerciseKnown(activeExercise.id) ? "Bekannte Übung" : "Neue Übung"}</small></div>
                  {runner.running && wakeLockStatus === "active" && <span className="mobility-wake-status">Bildschirm bleibt während des Workouts aktiv</span>}
                  {audioEnabled && ["bad", "warn"].includes(audioFeedback.tone) && <div className={`mobility-audio-live ${audioFeedback.tone}`}><span>{audioFeedback.message}</span><button type="button" onClick={() => activateWorkoutAudio({ announce: voiceCues ? `Audio aktiv. ${activeExercise?.name || "Workout"}.` : "" })}>Ton aktivieren</button></div>}
                  <h2>{runnerPhase === "transition"
                    ? `Als Nächstes: ${activeExercise.name}`
                    : runnerPhase === "side-switch"
                      ? `Seitenwechsel: ${activeExercise.name}`
                      : activeExercise.name}</h2>
                  {activeExercise.subtitle && <small className="mobility-exercise-subtitle">{activeExercise.subtitle}</small>}
                  <strong>{secondsLabel(runner.remaining)}</strong>
                  {runnerSideLabel && <span className="mobility-side-status">{runnerSideLabel}{weakSide !== "none" && runnerSideLabel === sideOrder(weakSide)[0] ? " · zuerst trainiert" : ""}</span>}
                  <p>{runnerPhase === "transition"
                    ? `${activeExercise.materialChangeBefore ? "Material wechseln und " : "Position einnehmen und "}${materialText(activeExercise)} bereitlegen.`
                    : runnerPhase === "prepare"
                      ? activeExercise.quickStart || activeExercise.instruction
                      : runnerPhase === "side-switch"
                        ? `Wechsle kontrolliert auf ${nextRunnerSideLabel(weakSide).toLocaleLowerCase("de-DE")}. Die Belastungszeit ist pausiert und startet nach dem 3–2–1-Countdown neu.`
                        : activeExercise.instruction}</p>
                  {runnerPhase !== "work" && activeExercise.cues?.length > 0 && <div className="mobility-runner-cues">{activeExercise.cues.slice(0, 3).map((cue) => <span key={cue}>{cue}</span>)}</div>}
                  <div className="mobility-runner-tags"><small className="mobility-selection-reason">{activeExercise.selectionReason}</small>{activeExercise.coachReason && <small className="mobility-coach-reason">{activeExercise.coachReason}</small>}{!isExerciseKnown(activeExercise.id) && <small className="mobility-new-exercise">Mehr Zeit, weil noch nicht als bekannt markiert</small>}</div>
                  <div className="button-row">
                    <button type="button" onClick={() => setRunner({ ...runner, running: !runner.running })}>{runner.running ? "Pause" : "Weiter"}</button>
                    <button type="button" className="secondary" onClick={() => openExerciseGuide(activeExercise)}>Anleitung</button>
                    {!physioExerciseIds.includes(activeExercise.id) && <button type="button" className={`secondary ${isExerciseKnown(activeExercise.id) ? "selected" : ""}`} onClick={() => toggleKnownExercise(activeExercise.id)}>{isExerciseKnown(activeExercise.id) ? "✓ Kenne ich" : "Als bekannt markieren"}</button>}
                    <button type="button" className="secondary" onClick={() => setRunner((current) => advanceMobilityRunner(current))}>{runnerPhaseAction}</button>
                    <button type="button" className="secondary" onClick={() => setRunner(null)}>Beenden</button>
                  </div>
                </>}
              </div>
            )}
            <div className="mobility-exercise-list">
              {workout.items.map((exercise, index) => (
                <article className={runner?.index === index ? "active" : ""} key={exercise.stepId}>
                  <span>{index + 1}</span>
                  <div>
                    <div className="mobility-exercise-heading"><div><strong>{exercise.name}</strong>{exercise.subtitle && <small className="mobility-exercise-subtitle">{exercise.subtitle}</small>}</div><ExerciseGuideButton exercise={exercise} onOpen={openExerciseGuide} compact /></div>
                    <small>{exercise.group} · {Math.round(exercise.seconds / 15) * 15} Sek. Übung · {exercise.preparationSeconds} Sek. Vorbereitung{exercise.transitionBeforeSeconds ? ` · ${exercise.transitionBeforeSeconds} Sek. Wechsel davor` : ""}{exercise.sideSwitch ? ` · ${exercise.sideSwitchSeconds} Sek. Seitenwechsel` : ""}</small>
                    <em>{exercise.selectionReason}</em>
                    {exercise.coachReason && <small className="mobility-exercise-coach-reason">{exercise.coachReason}</small>}
                    <p>{exercise.quickStart || exercise.instruction}</p>
                  </div>
                </article>
              ))}
            </div>
          </Card>

          <Card className="wide mobility-library-summary">
            <div>
              <p className="eyebrow">Übungszentrale</p>
              <h2>Physio, Favoriten und Reel-Übungen separat verwalten</h2>
              <p>Der Workout-Bereich bleibt auf die heutige Einheit fokussiert. Die vollständige Bibliothek, persönliche Quellen und Coach-Freigaben findest du jetzt auf einer eigenen Seite.</p>
              <div className="mobility-library-summary-metrics">
                <span>{physioExerciseIds.length} Physio-Prioritäten</span>
                <span>{knownExerciseCount} bekannte Übungen</span>
                <span>{customExercises.length} persönliche Übungen</span>
                <span>{preferredExerciseIds.length} bevorzugt</span>
              </div>
            </div>
            <Link className="button-link" to="/coach/exercises">Übungen verwalten →</Link>
          </Card>
        </div>
      )}

      {selected && <ReviewModal activity={selected} onClose={() => setSelected(null)} />}
      {selectedGuide && <ExerciseGuide exercise={selectedGuide} known={isExerciseKnown(selectedGuide.id)} knownLocked={physioExerciseIds.includes(selectedGuide.id)} onToggleKnown={toggleKnownExercise} onClose={() => setSelectedGuide(null)} />}
    </>
  );
}
