import { useEffect, useMemo, useState } from "react";
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
import {
  buildMobilityWorkout,
  equipmentLabel,
  focusAreaLabel,
  MOBILITY_EQUIPMENT,
  MOBILITY_EXERCISES,
  MOBILITY_FOCUS_AREAS,
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

export default function Coach() {
  const { state, setState } = useApp();
  const [selected, setSelected] = useState(null);
  const [selectedGuide, setSelectedGuide] = useState(null);
  const [activeTab, setActiveTab] = useState("today");
  const [runner, setRunner] = useState(null);
  const [libraryFocus, setLibraryFocus] = useState("all");
  const [librarySearch, setLibrarySearch] = useState("");
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
  const outlook = useMemo(() => buildMissionOutlook(reviewActivities, state.reviews, state.mission, now), [reviewActivities, state.reviews, state.mission, now]);
  const latestRunningActivity = useMemo(() => canonicalActivities
    .filter(isRunningActivity)
    .sort((left, right) => activityTimestamp(right) - activityTimestamp(left))[0], [canonicalActivities]);
  const latestRunningReview = latestRunningActivity ? state.reviews[latestRunningActivity.id] : null;
  const hydrationLearning = latestRunningActivity ? hydration(latestRunningActivity, latestRunningReview) : null;
  const learningPoint = hydrationLearning
    ? `Für ähnliche Bedingungen sind ungefähr ${hydrationLearning.recommendedLow}–${hydrationLearning.recommendedHigh} ml pro Stunde ein sinnvoller Startpunkt.`
    : "Je genauer du Trinkmenge und Gefühl direkt nach der Einheit protokollierst, desto persönlicher werden deine Empfehlungen.";

  const mobilitySettings = state.mobilityCoach || {};
  const durationMinutes = Number(mobilitySettings.durationMinutes || 25);
  const condition = mobilitySettings.condition || "normal";
  const equipment = Array.isArray(mobilitySettings.equipment) ? mobilitySettings.equipment : DEFAULT_MOBILITY_EQUIPMENT;
  const physioExerciseIds = useMemo(() => Array.isArray(mobilitySettings.physioExerciseIds) ? mobilitySettings.physioExerciseIds : [], [mobilitySettings.physioExerciseIds]);
  const focusAreaIds = useMemo(() => Array.isArray(mobilitySettings.focusAreaIds) ? mobilitySettings.focusAreaIds : [], [mobilitySettings.focusAreaIds]);
  const workoutHistory = Array.isArray(mobilitySettings.history) ? mobilitySettings.history : [];
  const workout = useMemo(() => buildMobilityWorkout({
    durationMinutes,
    condition,
    equipment,
    physioExerciseIds,
    focusAreaIds,
    rotationOffset: workoutHistory.length,
  }), [durationMinutes, condition, equipment, physioExerciseIds, focusAreaIds, workoutHistory.length]);
  const localToday = new Date();
  const todayKey = `${localToday.getFullYear()}-${String(localToday.getMonth() + 1).padStart(2, "0")}-${String(localToday.getDate()).padStart(2, "0")}`;
  const todayMobilityPlan = state.plan.find((item) => !item.archived && item.date === todayKey && /stabi|mobility|kraft/i.test(`${item.title || ""} ${item.type || ""}`));
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

  function startWorkout() {
    if (!workout.items.length) return;
    setRunner({ index: 0, remaining: workout.items[0].seconds, running: true, complete: false });
  }

  function finishWorkout() {
    updateMobility({
      history: [{
        id: crypto.randomUUID(),
        completedAt: new Date().toISOString(),
        title: workout.title,
        durationMinutes: workout.durationMinutes,
        exerciseIds: workout.items.map((item) => item.id),
        focusAreaIds,
      }, ...workoutHistory].slice(0, 30),
    });
    setRunner(null);
  }

  useEffect(() => {
    if (!runner?.running) return undefined;
    const timer = window.setInterval(() => {
      setRunner((current) => {
        if (!current?.running) return current;
        if (current.remaining > 1) return { ...current, remaining: current.remaining - 1 };
        const nextIndex = current.index + 1;
        if (nextIndex >= workout.items.length) return { ...current, remaining: 0, running: false, complete: true };
        return { index: nextIndex, remaining: workout.items[nextIndex].seconds, running: true, complete: false };
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [runner?.running, workout.items]);

  const activeExercise = runner ? workout.items[runner.index] : null;

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
              <span><b>{workout.items.length}</b> Schritte</span>
              <span><b>{workout.focusExerciseCount}</b> Fokus-Schritte</span>
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
            {workout.missingPhysio.length > 0 && <div className="mobility-warning"><strong>Physioübung aktuell nicht im Workout:</strong> {workout.missingPhysio.map((item) => `${item.name} (${(item.equipment || item.equipmentAny || []).map(equipmentLabel).join(" oder ")})`).join(", ")}</div>}
            {workout.missingFocus.length > 0 && <div className="mobility-warning"><strong>Schwerpunkt ohne passende Übung:</strong> {workout.missingFocus.map(focusAreaLabel).join(", ")}. Prüfe das ausgewählte Material.</div>}
          </Card>

          <Card className="wide mobility-workout-plan">
            <div className="settings-section-heading"><div><p className="eyebrow">Heutiger Ablauf</p><h2>{workout.items.length} Übungsschritte</h2></div>{!runner && <button type="button" className="primary compact-primary" onClick={startWorkout}>Workout starten</button>}</div>
            {runner && activeExercise && (
              <div className={`mobility-runner ${runner.complete ? "complete" : ""}`}>
                {runner.complete ? <><p className="eyebrow">Geschafft</p><h2>Workout abgeschlossen</h2><button type="button" className="primary compact-primary" onClick={finishWorkout}>Abschluss speichern</button></> : <>
                  <span>Schritt {runner.index + 1} von {workout.items.length}</span>
                  <h2>{activeExercise.name}</h2>
                  <strong>{secondsLabel(runner.remaining)}</strong>
                  <p>{activeExercise.instruction}</p>
                  <small className="mobility-selection-reason">{activeExercise.selectionReason}</small>
                  <div className="button-row"><button type="button" onClick={() => setRunner({ ...runner, running: !runner.running })}>{runner.running ? "Pause" : "Weiter"}</button><button type="button" className="secondary" onClick={() => setSelectedGuide(activeExercise)}>Anleitung</button><button type="button" className="secondary" onClick={() => setRunner((current) => { const nextIndex = Math.min(workout.items.length - 1, current.index + 1); return { index: nextIndex, remaining: workout.items[nextIndex].seconds, running: current.running, complete: false }; })}>Nächste Übung</button><button type="button" className="secondary" onClick={() => setRunner(null)}>Beenden</button></div>
                </>}
              </div>
            )}
            <div className="mobility-exercise-list">
              {workout.items.map((exercise, index) => (
                <article className={runner?.index === index ? "active" : ""} key={exercise.stepId}>
                  <span>{index + 1}</span>
                  <div>
                    <div className="mobility-exercise-heading"><strong>{exercise.name}</strong><ExerciseGuideButton exercise={exercise} onOpen={setSelectedGuide} compact /></div>
                    <small>{exercise.group} · {Math.round(exercise.seconds / 15) * 15} Sek.</small>
                    <em>{exercise.selectionReason}</em>
                    <p>{exercise.instruction}</p>
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
                  <div className="exercise-library-card-heading"><div><span>{exercise.group}</span><h3>{exercise.name}</h3></div>{physioExerciseIds.includes(exercise.id) && <b>Physio</b>}</div>
                  <p>{exercise.purpose}</p>
                  <small>{materialText(exercise)} · {exercise.focusAreas.map(focusAreaLabel).join(" · ") || "Allgemein"}</small>
                  <ExerciseGuideButton exercise={exercise} onOpen={setSelectedGuide} />
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
      {selectedGuide && <ExerciseGuide exercise={selectedGuide} onClose={() => setSelectedGuide(null)} />}
    </>
  );
}
