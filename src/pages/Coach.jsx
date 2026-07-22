import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../context/AppContext";
import { Card, PageTitle } from "../components/UI";
import { coachDashboard, hydration } from "../services/insights";
import { buildMissionOutlook } from "../services/missionOutlook";
import {
  activityDate,
  activityTimestamp,
  isRunningActivity,
  preferredActivities,
  reviewKind,
  reviewKindLabel,
} from "../services/activityUtils";
import ReviewModal from "../components/ReviewModal";
import ExerciseGuide, { ExerciseGuideButton } from "../components/ExerciseGuide";
import { activitiesWithGroups } from "../services/activityGroups";
import { fmtDate } from "../utils/format";
import { playWorkoutCue, primeWorkoutAudio, speakWorkoutCue } from "../services/workoutAudio";
import { athleteProfileAssessment } from "../services/athleteProfile";
import {
  buildMobilityWorkout,
  equipmentLabel,
  focusAreaLabel,
  MOBILITY_EQUIPMENT,
  MOBILITY_EXERCISES,
  MOBILITY_FOCUS_AREAS,
  nextMobilityWorkoutRotation,
} from "../services/mobilityWorkouts";

const monthFormatter = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" });
const DEFAULT_MOBILITY_EQUIPMENT = ["mat", "band"];

const coachTabs = [
  ["today", "Heute"],
  ["development", "Entwicklung"],
  ["mobility", "Stabi & Mobility"],
  ["knowledge", "Wissen"],
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

function runnerPhaseSeconds(items, index, phase) {
  const item = items[index];
  if (!item) return 0;
  if (phase === "transition") return Number(item.transitionBeforeSeconds || 0);
  if (phase === "prepare") return Number(item.preparationSeconds || 0);
  if (phase === "work") return Number(item.seconds || 0);
  return 0;
}

function advanceRunner(current) {
  if (!current || current.complete) return current;
  const items = current.items || [];
  let index = current.index;
  let phase = current.phase;
  for (let guard = 0; guard < 5; guard += 1) {
    if (phase === "prepare") {
      phase = "work";
    } else if (phase === "work") {
      if (index >= items.length - 1) return { ...current, remaining: 0, running: false, complete: true };
      index += 1;
      phase = "transition";
    } else {
      phase = "prepare";
    }
    const remaining = runnerPhaseSeconds(items, index, phase);
    if (remaining > 0) return { ...current, index, phase, remaining, complete: false };
  }
  return { ...current, remaining: 0, running: false, complete: true };
}

function sideOrder(weakSide) {
  if (weakSide === "right") return ["Rechte Seite", "Linke Seite"];
  return ["Linke Seite", "Rechte Seite"];
}

function activeSideLabel(exercise, remaining, weakSide) {
  if (!exercise?.sideSwitch) return "";
  const [first, second] = sideOrder(weakSide);
  const halfway = Math.floor(Number(exercise.seconds || 0) / 2);
  return Number(remaining || 0) > halfway ? first : second;
}

function nextSideLabel(weakSide) {
  return sideOrder(weakSide)[1];
}

export default function Coach() {
  const { state, setState } = useApp();
  const [selected, setSelected] = useState(null);
  const [selectedGuide, setSelectedGuide] = useState(null);
  const [activeTab, setActiveTab] = useState("today");
  const [runner, setRunner] = useState(null);
  const [workoutShuffleOffset, setWorkoutShuffleOffset] = useState(0);
  const [libraryFocus, setLibraryFocus] = useState("all");
  const [librarySearch, setLibrarySearch] = useState("");
  const previousRunnerRef = useRef(null);
  const cueKeyRef = useRef("");
  const now = useMemo(() => new Date(), []);
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const canonicalActivities = useMemo(() => preferredActivities(state.activities), [state.activities]);
  const reviewActivities = useMemo(() => activitiesWithGroups(canonicalActivities, state.activityGroups), [canonicalActivities, state.activityGroups]);
  const monthReviewable = useMemo(() => reviewActivities
    .filter((activity) => reviewKind(activity) && activityDate(activity).startsWith(currentMonth))
    .sort((a, b) => activityTimestamp(b) - activityTimestamp(a)), [reviewActivities, currentMonth]);
  const openReviews = monthReviewable.filter((activity) => !state.reviews[activity.id]);
  const reviewed = monthReviewable.filter((activity) => state.reviews[activity.id]);
  const analysis = useMemo(() => coachDashboard(reviewActivities, state.reviews, now), [reviewActivities, state.reviews, now]);
  const athleteAssessment = athleteProfileAssessment(state, now);
  const outlook = useMemo(() => buildMissionOutlook(reviewActivities, state.reviews, state.mission, now), [reviewActivities, state.reviews, state.mission, now]);
  const latestRunningActivity = useMemo(() => canonicalActivities
    .filter(isRunningActivity)
    .sort((left, right) => activityTimestamp(right) - activityTimestamp(left))[0], [canonicalActivities]);
  const latestRunningReview = latestRunningActivity ? state.reviews[latestRunningActivity.id] : null;
  const hydrationLearning = latestRunningActivity ? hydration(latestRunningActivity, latestRunningReview) : null;
  const learningPoint = hydrationLearning?.reliable
    ? `Für ähnliche Bedingungen sind ungefähr ${hydrationLearning.recommendedLow}–${hydrationLearning.recommendedHigh} ml pro Stunde ein sinnvoller Startpunkt.`
    : hydrationLearning?.reason || "Je genauer du Trinkmenge und Gefühl direkt nach der Einheit protokollierst, desto persönlicher werden deine Empfehlungen.";

  const mobilitySettings = state.mobilityCoach || {};
  const durationMinutes = Number(mobilitySettings.durationMinutes || 25);
  const condition = mobilitySettings.condition || "normal";
  const equipment = Array.isArray(mobilitySettings.equipment) ? mobilitySettings.equipment : DEFAULT_MOBILITY_EQUIPMENT;
  const physioExerciseIds = useMemo(() => Array.isArray(mobilitySettings.physioExerciseIds) ? mobilitySettings.physioExerciseIds : [], [mobilitySettings.physioExerciseIds]);
  const focusAreaIds = useMemo(() => Array.isArray(mobilitySettings.focusAreaIds) ? mobilitySettings.focusAreaIds : [], [mobilitySettings.focusAreaIds]);
  const knownExerciseIds = useMemo(() => Array.isArray(mobilitySettings.knownExerciseIds) ? mobilitySettings.knownExerciseIds : [], [mobilitySettings.knownExerciseIds]);
  const preparationSeconds = Number(mobilitySettings.preparationSeconds ?? 10);
  const unknownPreparationSeconds = Number(mobilitySettings.unknownPreparationSeconds ?? 20);
  const transitionSeconds = Number(mobilitySettings.transitionSeconds ?? 10);
  const materialTransitionSeconds = Number(mobilitySettings.materialTransitionSeconds ?? 20);
  const longerPreparationForUnknown = mobilitySettings.longerPreparationForUnknown !== false;
  const audioEnabled = mobilitySettings.audioEnabled !== false;
  const voiceCues = mobilitySettings.voiceCues !== false;
  const weakSide = ["left", "right"].includes(mobilitySettings.weakSide) ? mobilitySettings.weakSide : "none";
  const workoutHistory = Array.isArray(mobilitySettings.history) ? mobilitySettings.history : [];
  const knownExerciseCount = useMemo(() => new Set([...knownExerciseIds, ...physioExerciseIds]).size, [knownExerciseIds, physioExerciseIds]);
  const workoutOptions = useMemo(() => ({
    durationMinutes,
    condition,
    equipment,
    physioExerciseIds,
    focusAreaIds,
    knownExerciseIds,
    preparationSeconds,
    unknownPreparationSeconds,
    transitionSeconds,
    materialTransitionSeconds,
    longerPreparationForUnknown,
  }), [durationMinutes, condition, equipment, physioExerciseIds, focusAreaIds, knownExerciseIds, preparationSeconds, unknownPreparationSeconds, transitionSeconds, materialTransitionSeconds, longerPreparationForUnknown]);
  const workoutRotationOffset = workoutHistory.length + workoutShuffleOffset;
  const workout = useMemo(() => buildMobilityWorkout({
    ...workoutOptions,
    rotationOffset: workoutRotationOffset,
  }), [workoutOptions, workoutRotationOffset]);
  const localToday = new Date();
  const todayKey = `${localToday.getFullYear()}-${String(localToday.getMonth() + 1).padStart(2, "0")}-${String(localToday.getDate()).padStart(2, "0")}`;
  const todayMobilityPlan = state.plan.find((item) => !item.archived && !item.completed && !item.missedReason && item.date === todayKey && /stabi|mobility|kraft/i.test(`${item.title || ""} ${item.type || ""}`));
  const physioCandidates = MOBILITY_EXERCISES.filter((exercise) => exercise.physioDefault || ["adductor-rockback", "hip-flexor-stretch", "thoracic-rotation", "knee-to-wall", "pallof-press"].includes(exercise.id));
  const visibleLibraryExercises = useMemo(() => {
    const query = librarySearch.trim().toLocaleLowerCase("de-DE");
    return MOBILITY_EXERCISES.filter((exercise) => {
      if (libraryFocus !== "all" && !exercise.focusAreas.includes(libraryFocus)) return false;
      if (!query) return true;
      const haystack = `${exercise.name} ${exercise.group} ${exercise.purpose} ${exercise.focusAreas.map(focusAreaLabel).join(" ")}`.toLocaleLowerCase("de-DE");
      return haystack.includes(query);
    });
  }, [libraryFocus, librarySearch]);

  function updateMobility(patch) {
    setState((current) => ({
      ...current,
      mobilityCoach: { ...current.mobilityCoach, ...patch },
    }));
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

  function toggleEquipment(id) {
    const next = equipment.includes(id) ? equipment.filter((item) => item !== id) : [...equipment, id];
    updateMobility({ equipment: next });
    setRunner(null);
  }

  function togglePhysio(id) {
    const next = physioExerciseIds.includes(id) ? physioExerciseIds.filter((item) => item !== id) : [...physioExerciseIds, id];
    updateMobility({ physioExerciseIds: next });
    setRunner(null);
  }

  function toggleFocus(id) {
    if (focusAreaIds.includes(id)) {
      updateMobility({ focusAreaIds: focusAreaIds.filter((item) => item !== id) });
    } else if (focusAreaIds.length < 3) {
      updateMobility({ focusAreaIds: [...focusAreaIds, id] });
    }
    setRunner(null);
  }

  function shuffleWorkout() {
    if (runner || workout.items.length < 2) return;
    const nextRotationOffset = nextMobilityWorkoutRotation(workoutOptions, workoutRotationOffset);
    setWorkoutShuffleOffset(nextRotationOffset - workoutHistory.length);
  }

  async function startWorkout() {
    if (!workout.items.length) return;
    if (audioEnabled) await primeWorkoutAudio();
    previousRunnerRef.current = null;
    cueKeyRef.current = "";
    const items = workout.items.map((item) => ({ ...item }));
    const firstPhase = items[0].preparationSeconds > 0 ? "prepare" : "work";
    setRunner({
      sessionId: crypto.randomUUID(),
      planItemId: todayMobilityPlan?.id || null,
      focusAreaIds: [...focusAreaIds],
      items,
      title: workout.title,
      durationMinutes: workout.durationMinutes,
      index: 0,
      phase: firstPhase,
      remaining: runnerPhaseSeconds(items, 0, firstPhase),
      running: true,
      complete: false,
      saved: false,
    });
  }

  function closeFinishedWorkout() {
    if (!runner?.saved) return;
    setWorkoutShuffleOffset(0);
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
        return advanceRunner(current);
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [runner?.running]);

  const activeExercise = runner ? runner.items?.[runner.index] : null;

  useEffect(() => {
    if (!runner?.complete || runner.saved || !runner.sessionId) return undefined;
    const completedRunner = runner;
    const saveTimer = window.setTimeout(() => {
      const completedAt = new Date().toISOString();
      const completedItems = Array.isArray(completedRunner.items) ? completedRunner.items : [];
      const historyEntry = {
        id: crypto.randomUUID(),
        sessionId: completedRunner.sessionId,
        completedAt,
        title: completedRunner.title,
        durationMinutes: completedRunner.durationMinutes,
        exerciseIds: completedItems.map((item) => item.id),
        focusAreaIds: Array.isArray(completedRunner.focusAreaIds) ? completedRunner.focusAreaIds : [],
        planItemId: completedRunner.planItemId || null,
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
            actualSource: "EYM Coach",
            matchedMobilityWorkoutId: completedRunner.sessionId,
            missedReason: "",
          } : item),
        };
      });
      setRunner((current) => current?.sessionId === completedRunner.sessionId ? { ...current, saved: true, completedAt } : current);
    }, 0);
    return () => window.clearTimeout(saveTimer);
  }, [runner, setState]);

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

    const phaseChanged = !previous || previous.phase !== runner.phase || previous.index !== runner.index;
    if (runner.complete && !previous?.complete) {
      playWorkoutCue("complete");
      if (voiceCues) speakWorkoutCue("Workout abgeschlossen");
    } else if (phaseChanged) {
      if (previous?.phase === "work") playWorkoutCue("end");
      if (runner.phase === "work") {
        playWorkoutCue("start");
        if (voiceCues && activeExercise?.sideSwitch) speakWorkoutCue(`Start ${sideOrder(weakSide)[0]}`);
      }
    }

    if (runner.running && !runner.complete && runner.remaining > 0 && runner.remaining <= 3) {
      const countdownKey = `${runner.index}-${runner.phase}-${runner.remaining}`;
      if (cueKeyRef.current !== countdownKey) {
        cueKeyRef.current = countdownKey;
        playWorkoutCue("countdown");
      }
    }

    const halfway = Math.floor(Number(activeExercise?.seconds || 0) / 2);
    if (runner.running && runner.phase === "work" && activeExercise?.sideSwitch && runner.remaining === halfway) {
      const switchKey = `${runner.index}-switch`;
      if (cueKeyRef.current !== switchKey) {
        cueKeyRef.current = switchKey;
        playWorkoutCue("switch");
        if (voiceCues) speakWorkoutCue(`${activeExercise.switchCue || "Seite wechseln"}. ${nextSideLabel(weakSide)}`);
      }
    }

    previousRunnerRef.current = runner;
  }, [runner, activeExercise, audioEnabled, voiceCues, weakSide]);
  const runnerPhase = runner?.phase || "work";
  const runnerPhaseLabel = runnerPhase === "prepare" ? "Vorbereitung" : runnerPhase === "transition" ? "Wechselpause" : "Übung";
  const runnerPhaseAction = runnerPhase === "work" ? "Übung abschließen" : runnerPhase === "prepare" ? "Jetzt starten" : "Vorbereitung starten";
  const runnerSideLabel = activeExercise && runnerPhase === "work" ? activeSideLabel(activeExercise, runner?.remaining, weakSide) : "";
  const switchMoment = Boolean(activeExercise?.sideSwitch && runnerPhase === "work" && runner?.remaining === Math.floor(Number(activeExercise.seconds || 0) / 2));

  return (
    <>
      <PageTitle eyebrow="Coach Engine" title="Dein Coach" />
      <div className="section-tabs coach-tabs" role="tablist" aria-label="Coach-Bereiche">
        {coachTabs.map(([key, label]) => <button type="button" className={activeTab === key ? "selected" : ""} onClick={() => setActiveTab(key)} key={key}>{label}</button>)}
      </div>

      {activeTab === "today" && (
        <div className="grid coach-dashboard-grid">
          <Card className="wide insight coach-recommendation">
            <p className="eyebrow">Aktuelle Empfehlung</p>
            <h2>{analysis.recommendation}</h2>
          </Card>
          <Card className="coach-review-summary">
            <p className="eyebrow">Reviews im Monat</p>
            <h2>{reviewed.length}/{monthReviewable.length} bewertet</h2>
            <p className="muted">{openReviews.length ? `${openReviews.length} relevante ${openReviews.length === 1 ? "Einheit ist" : "Einheiten sind"} noch offen.` : `Alle relevanten Einheiten aus ${monthFormatter.format(now)} sind bewertet.`}</p>
          </Card>
          <SignalCard eyebrow="HF & Wetter" signal={analysis.hrWeather} />
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
            <div className="coach-athlete-model-heading"><div><p className="eyebrow">Athletenmodell</p><h2>{athleteAssessment.observedLabel} · Belastungsverträglichkeit {athleteAssessment.tolerance.label}</h2><p className="muted">EYM lernt aus deiner tatsächlichen Routine. Eine höhere Einstufung oder zusätzliche Einheit wird nur vorgeschlagen, nie automatisch übernommen.</p></div><span>{athleteAssessment.specializationLabel}</span></div>
            <div className="coach-athlete-model-metrics"><div><small>Läufe/Woche</small><strong>{athleteAssessment.metrics.runsPerWeek.toFixed(1)}</strong></div><div><small>km/Woche</small><strong>{athleteAssessment.metrics.weeklyKm.toFixed(0)}</strong></div><div><small>Longrun</small><strong>{athleteAssessment.metrics.longestRun.toFixed(1)} km</strong></div><div><small>Höhenmeter</small><strong>{athleteAssessment.metrics.weeklyElevation.toFixed(0)} hm</strong></div></div>
            <p><b>Progressionsrichtung:</b> {athleteAssessment.progressionFocus}</p>
          </Card>
          <Card className="wide coach-mission-outlook">
            <div className="coach-outlook-heading">
              <div>
                <p className="eyebrow">Missionsausblick</p>
                <h2>{outlook.nextTarget ? `${outlook.nextTarget.name} in ${outlook.nextDays} Tagen` : "Kein nächstes Ziel hinterlegt"}</h2>
                <p className="muted">{outlook.nextTarget ? `Zielkorridor: ${outlook.targetRange.label}. Der Coach bewertet Kontinuität, Longrun, Schlüsselreize und Erholung.` : "Lege unter Mission Control einen Wettkampf oder Meilenstein an."}</p>
              </div>
              <div className={`coach-readiness-badge ${outlook.readiness.tone}`}><strong>{outlook.score}%</strong><span>{outlook.readiness.label}</span></div>
            </div>
            <div className="coach-outlook-metrics">
              <div><span>Ø 8 Wochen</span><strong>{outlook.averageKm} km/Woche</strong></div>
              <div><span>Längster Lauf</span><strong>{outlook.longestRun} km</strong></div>
              <div><span>Aktive Wochen</span><strong>{outlook.activeWeeks}/8</strong></div>
              <div><span>Schlüsseleinheiten</span><strong>{outlook.keySessions}</strong></div>
            </div>
            <div className="coach-loop-preview">
              <div><p className="eyebrow">Nächster spezifischer Block</p><h3>{outlook.loop.title}</h3><p>{outlook.loop.text}</p></div>
              <p className="coach-readiness-copy">{outlook.readiness.text} {outlook.expectedHard ? `${outlook.expectedHard} harte Schlüsseleinheit${outlook.expectedHard === 1 ? " wurde" : "en wurden"} als erwarteter Trainingsreiz erkannt.` : ""}</p>
            </div>
            {outlook.roadmap.length > 0 && <div className="coach-roadmap">{outlook.roadmap.map((step) => <article key={`${step.label}-${step.title}`}><span>{step.label}</span><h3>{step.title}</h3><p>{step.text}</p></article>)}</div>}
            {outlook.mainTarget && outlook.nextTarget && outlook.mainTarget.id !== outlook.nextTarget.id && <p className="coach-main-target-note"><strong>Danach:</strong> {outlook.mainTarget.name} in {outlook.mainDays} Tagen.</p>}
          </Card>
          <SignalCard eyebrow="Schlüsseleinheiten" signal={analysis.keySessions} />
          <SignalCard eyebrow="Fuel & Hydration" signal={analysis.fuel} />
        </div>
      )}

      {activeTab === "mobility" && (
        <div className="grid mobility-coach-grid">
          <Card className="wide mobility-focus-card">
            <div className="settings-section-heading">
              <div>
                <p className="eyebrow">Persönliche Trainingsschwerpunkte</p>
                <h2>Woran möchtest du arbeiten?</h2>
                <p className="muted">Optional und für jeden Nutzer frei einstellbar. Ohne Auswahl erzeugt EYM ein ausgewogenes Standard-Workout. Mit Schwerpunkten kommen je nach verfügbarer Zeit ein bis zwei passende Übungen zusätzlich in den Ablauf.</p>
              </div>
              <span>{focusAreaIds.length}/3 gewählt</span>
            </div>
            <div className="mobility-focus-picker">
              <button type="button" className={!focusAreaIds.length ? "selected standard" : "standard"} onClick={() => { updateMobility({ focusAreaIds: [] }); setRunner(null); }}>
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
            {focusAreaIds.length > 0 && <p className="mobility-focus-summary"><b>Aktiv:</b> {focusAreaIds.map(focusAreaLabel).join(" · ")} <span>Die Auswahl wird in deiner Cloud-Konfiguration gespeichert.</span></p>}
          </Card>

          <Card className="wide mobility-workout-hero">
            <div className="mobility-workout-heading">
              <div>
                <p className="eyebrow">Stabi & Mobility Workout</p>
                <h2>{todayMobilityPlan ? `Heute geplant: ${todayMobilityPlan.title}` : workout.title}</h2>
                <p className="muted">Physio-Übungen haben Vorrang. Danach berücksichtigt EYM deine persönlichen Schwerpunkte, Tagesform, Zeit und vorhandenes Material.</p>
              </div>
              <strong>{workout.durationMinutes} min</strong>
            </div>
            <div className="mobility-workout-summary">
              <span><b>{workout.items.length}</b> Übungen</span>
              <span><b>{workout.activeMinutes}</b> min Bewegung</span>
              <span><b>{workout.pauseMinutes}</b> min Vorbereitung</span>
              <span><b>{physioExerciseIds.length}</b> Physio-Prioritäten</span>
            </div>
            <div className="mobility-controls">
              <label>Zeit
                <select value={durationMinutes} onChange={(event) => { updateMobility({ durationMinutes: Number(event.target.value) }); setRunner(null); }}>
                  {[10, 15, 20, 25, 30].map((value) => <option value={value} key={value}>{value} Minuten</option>)}
                </select>
              </label>
              <label>Tagesform
                <select value={condition} onChange={(event) => { updateMobility({ condition: event.target.value }); setRunner(null); }}>
                  <option value="fresh">Erholt</option><option value="normal">Normal</option><option value="tired">Müde / Regeneration</option>
                </select>
              </label>
            </div>
            <div className="mobility-equipment-picker">
              <b>Vorhandenes Material</b>
              <div>{MOBILITY_EQUIPMENT.map((item) => <button type="button" className={equipment.includes(item.id) ? "selected" : ""} onClick={() => toggleEquipment(item.id)} key={item.id}>{item.label}</button>)}</div>
            </div>
            <details className="mobility-timer-settings">
              <summary><span><b>Timer & Pausen</b><small>{preparationSeconds}s Vorbereitung · {transitionSeconds}s Wechsel · neue Übungen {longerPreparationForUnknown ? `${unknownPreparationSeconds}s` : "wie bekannte"}</small></span><strong>{knownExerciseCount} bekannt</strong></summary>
              <div className="mobility-timer-grid">
                <label>Vorbereitung bekannte Übung
                  <select value={preparationSeconds} onChange={(event) => { updateMobility({ preparationSeconds: Number(event.target.value) }); setRunner(null); }}>
                    {[0, 5, 10, 15, 20].map((value) => <option value={value} key={value}>{value} Sekunden</option>)}
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
              <label className="mobility-timer-toggle"><input type="checkbox" checked={audioEnabled} onChange={(event) => updateMobility({ audioEnabled: event.target.checked })} /><span><b>Signaltöne im Workout</b><small>Unterschiedliche Töne für Countdown, Start, Ende, Seitenwechsel und Workout-Abschluss.</small></span></label>
              <label className="mobility-timer-toggle"><input type="checkbox" checked={voiceCues} disabled={!audioEnabled} onChange={(event) => updateMobility({ voiceCues: event.target.checked })} /><span><b>Seitenwechsel ansagen</b><small>Bei Seitstütz, Pallof Press, Sprunggelenkübungen und weiteren beidseitigen Übungen sagt EYM die nächste Seite an.</small></span></label>
              <div className="mobility-audio-actions"><button type="button" onClick={async () => { await primeWorkoutAudio(); playWorkoutCue("switch"); if (voiceCues) speakWorkoutCue("Seite wechseln"); }}>Töne testen</button><span className="mobility-audio-status">Die Auswahl gilt nur für dein Nutzerprofil.</span></div>
              <p>Die Pausen zählen zur gewählten Gesamtdauer. Dadurch bleibt ein 25-Minuten-Workout ungefähr 25 Minuten lang. Die zuerst gewählte schwächere Seite erhält nicht automatisch mehr Belastung, sondern wird nur zuerst ausgeführt.</p>
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
                {runner.complete ? <><p className="eyebrow">Geschafft</p><h2>Workout abgeschlossen</h2><p className="mobility-completion-note">{runner.saved ? (runner.planItemId ? "Die heutige Stabi-/Mobility-Einheit wurde automatisch als erledigt markiert." : "Das Workout wurde automatisch in deinem Verlauf gespeichert.") : "Workout wird gespeichert …"}</p><button type="button" className="primary compact-primary" onClick={closeFinishedWorkout} disabled={!runner.saved}>Workout schließen</button></> : <>
                  <div className="mobility-runner-topline"><span>{runnerPhaseLabel} · Schritt {runner.index + 1} von {runner.items.length}</span><small>{isExerciseKnown(activeExercise.id) ? "Bekannte Übung" : "Neue Übung"}</small></div>
                  <h2>{runnerPhase === "transition" ? `Als Nächstes: ${activeExercise.name}` : activeExercise.name}</h2>
                  {activeExercise.subtitle && <small className="mobility-exercise-subtitle">{activeExercise.subtitle}</small>}
                  <strong>{secondsLabel(runner.remaining)}</strong>
                  {runnerSideLabel && <span className="mobility-side-status">{runnerSideLabel}{weakSide !== "none" && runnerSideLabel === sideOrder(weakSide)[0] ? " · zuerst trainiert" : ""}</span>}
                  <p>{runnerPhase === "transition" ? `${activeExercise.materialChangeBefore ? "Material wechseln und " : "Position einnehmen und "}${materialText(activeExercise)} bereitlegen.` : runnerPhase === "prepare" ? activeExercise.quickStart || activeExercise.instruction : activeExercise.instruction}</p>
                  {runnerPhase !== "work" && activeExercise.cues?.length > 0 && <div className="mobility-runner-cues">{activeExercise.cues.slice(0, 3).map((cue) => <span key={cue}>{cue}</span>)}</div>}
                  <div className="mobility-runner-tags"><small className="mobility-selection-reason">{activeExercise.selectionReason}</small>{!isExerciseKnown(activeExercise.id) && <small className="mobility-new-exercise">Mehr Zeit, weil noch nicht als bekannt markiert</small>}</div>
                  <div className="button-row">
                    <button type="button" onClick={() => setRunner({ ...runner, running: !runner.running })}>{runner.running ? "Pause" : "Weiter"}</button>
                    <button type="button" className="secondary" onClick={() => openExerciseGuide(activeExercise)}>Anleitung</button>
                    {!physioExerciseIds.includes(activeExercise.id) && <button type="button" className={`secondary ${isExerciseKnown(activeExercise.id) ? "selected" : ""}`} onClick={() => toggleKnownExercise(activeExercise.id)}>{isExerciseKnown(activeExercise.id) ? "✓ Kenne ich" : "Als bekannt markieren"}</button>}
                    <button type="button" className="secondary" onClick={() => setRunner((current) => advanceRunner(current))}>{runnerPhaseAction}</button>
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
                    <small>{exercise.group} · {Math.round(exercise.seconds / 15) * 15} Sek. Übung · {exercise.preparationSeconds} Sek. Vorbereitung{exercise.transitionBeforeSeconds ? ` · ${exercise.transitionBeforeSeconds} Sek. Wechsel davor` : ""}{exercise.sideSwitch ? " · Signal zur Halbzeit" : ""}</small>
                    <em>{exercise.selectionReason}</em>
                    <p>{exercise.quickStart || exercise.instruction}</p>
                  </div>
                </article>
              ))}
            </div>
          </Card>

          <Card className="wide physio-library-card">
            <p className="eyebrow">Meine Physio-Übungen</p>
            <h2>Nur persönliche Vorgaben fest anheften</h2>
            <p className="muted">Dieser Bereich ist bewusst individuell. Neue Nutzer starten ohne Physio-Pflichtübungen. Aktiviere nur Übungen, die du kennst oder die dir gezeigt wurden; sie werden vor allgemeinen Vorschlägen eingeplant.</p>
            <div className="physio-picker">{physioCandidates.map((exercise) => <button type="button" className={physioExerciseIds.includes(exercise.id) ? "selected" : ""} onClick={() => togglePhysio(exercise.id)} key={exercise.id}><strong>{exercise.name}</strong><span>{materialText(exercise)}</span></button>)}</div>
          </Card>

          <Card className="wide exercise-library-card">
            <div className="settings-section-heading">
              <div><p className="eyebrow">Übungsbibliothek</p><h2>Bewegung ansehen, dann sauber ausführen</h2><p className="muted">Jede Übung enthält eine schematische Bewegungsfolge, Schritt-für-Schritt-Erklärung, Technikhinweise, typische Fehler sowie eine leichtere und schwierigere Variante.</p></div>
              <span>{visibleLibraryExercises.length} Übungen</span>
            </div>
            <div className="exercise-library-toolbar">
              <label>Übung suchen<input type="search" value={librarySearch} onChange={(event) => setLibrarySearch(event.target.value)} placeholder="z. B. Dead Bug oder Sprunggelenk" /></label>
              <label>Schwerpunkt<select value={libraryFocus} onChange={(event) => setLibraryFocus(event.target.value)}><option value="all">Alle Bereiche</option>{MOBILITY_FOCUS_AREAS.map((focus) => <option value={focus.id} key={focus.id}>{focus.label}</option>)}</select></label>
            </div>
            <div className="exercise-library-grid">
              {visibleLibraryExercises.map((exercise) => (
                <article key={exercise.id}>
                  <div className="exercise-library-card-heading"><div><span>{exercise.group}</span><h3>{exercise.name}</h3>{exercise.subtitle && <small className="mobility-exercise-subtitle">{exercise.subtitle}</small>}</div><div className="exercise-library-badges">{physioExerciseIds.includes(exercise.id) && <b>Physio</b>}{knownExerciseIds.includes(exercise.id) && !physioExerciseIds.includes(exercise.id) && <b className="known">Bekannt</b>}</div></div>
                  <p>{exercise.purpose}</p>
                  <small>{materialText(exercise)} · {exercise.focusAreas.map(focusAreaLabel).join(" · ") || "Allgemein"}</small>
                  <ExerciseGuideButton exercise={exercise} onOpen={openExerciseGuide} />
                </article>
              ))}
            </div>
            {!visibleLibraryExercises.length && <p className="empty-library-result">Keine passende Übung gefunden. Suche oder Schwerpunkt anpassen.</p>}
            <p className="mobility-safety-note">Schmerz ist kein Trainingsziel. Übungen abbrechen oder vereinfachen, wenn die Bewegung Beschwerden auslöst; bei Physio-Vorgaben gilt die persönlich gezeigte Ausführung.</p>
          </Card>
        </div>
      )}

      {activeTab === "knowledge" && (
        <div className="grid coach-dashboard-grid">
          <Card className="wide insight coach-recommendation">
            <p className="eyebrow">Lernpunkt{latestRunningActivity?.name ? ` · ${latestRunningActivity.name}` : ""}</p>
            <blockquote>{learningPoint}</blockquote>
          </Card>
          <SignalCard eyebrow="Fuel & Hydration" signal={analysis.fuel} />
          <SignalCard eyebrow="HF & Wetter" signal={analysis.hrWeather} />
          <Card className="wide">
            <p className="eyebrow">Review-Logik</p>
            <h2>Gefühl direkt nach der Einheit</h2>
            <p className="muted">Bei Beine, Energie, Beweglichkeit und Magenverträglichkeit bedeutet 10 einen sehr guten beziehungsweise beschwerdefreien Zustand. Bei der wahrgenommenen Belastung bedeutet 10 maximal anstrengend.</p>
          </Card>
        </div>
      )}

      {selected && <ReviewModal activity={selected} onClose={() => setSelected(null)} />}
      {selectedGuide && <ExerciseGuide exercise={selectedGuide} known={isExerciseKnown(selectedGuide.id)} knownLocked={physioExerciseIds.includes(selectedGuide.id)} onToggleKnown={toggleKnownExercise} onClose={() => setSelectedGuide(null)} />}
    </>
  );
}
