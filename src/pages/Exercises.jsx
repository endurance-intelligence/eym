import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { Card, PageTitle } from "../components/UI";
import EditorModal from "../components/EditorModal";
import ExerciseGuide, { ExerciseGuideButton } from "../components/ExerciseGuide";
import { fmtDate } from "../utils/format";
import {
  equipmentLabel,
  focusAreaLabel,
  MOBILITY_EQUIPMENT,
  MOBILITY_EXERCISES,
  MOBILITY_FOCUS_AREAS,
  mobilityExerciseUsage,
} from "../services/mobilityWorkouts";
import {
  customExerciseDraftsForSource,
  emptyCustomExerciseDraft,
  exerciseSourceLabel,
  fetchExerciseSourceMetadata,
  mergeExerciseLibrary,
  normalizeCustomExercise,
  parseExerciseSourceUrl,
  validateCustomExerciseDraft,
} from "../services/mobilityExerciseSources";

function materialText(exercise) {
  const ids = exercise.equipment?.length ? exercise.equipment : exercise.equipmentAny || [];
  return ids.length ? ids.map(equipmentLabel).join(" / ") : "Ohne Material";
}

function exerciseUsageLabel(stat) {
  if (!stat?.count) return "";
  const dateKey = String(stat.lastCompletedAt || "").slice(0, 10);
  return `${stat.count}× absolviert${dateKey ? ` · zuletzt ${fmtDate(dateKey)}` : ""}`;
}

export default function Exercises() {
  const { state, setState } = useApp();
  const [selectedGuide, setSelectedGuide] = useState(null);
  const [libraryFocus, setLibraryFocus] = useState("all");
  const [librarySearch, setLibrarySearch] = useState("");
  const [exerciseEditorOpen, setExerciseEditorOpen] = useState(false);
  const [exerciseSourceUrl, setExerciseSourceUrl] = useState("");
  const [exerciseSourceCount, setExerciseSourceCount] = useState(1);
  const [exerciseSourceStatus, setExerciseSourceStatus] = useState({ tone: "idle", message: "" });
  const [customExerciseDrafts, setCustomExerciseDrafts] = useState([]);
  const [activeCustomExerciseIndex, setActiveCustomExerciseIndex] = useState(0);
  const customExerciseDraft = customExerciseDrafts[activeCustomExerciseIndex] || null;
  const [customExerciseMessage, setCustomExerciseMessage] = useState("");
  const [pageMessage, setPageMessage] = useState("");

  const mobilitySettings = state.mobilityCoach || {};
  const physioExerciseIds = useMemo(() => Array.isArray(mobilitySettings.physioExerciseIds) ? mobilitySettings.physioExerciseIds : [], [mobilitySettings.physioExerciseIds]);
  const knownExerciseIds = useMemo(() => Array.isArray(mobilitySettings.knownExerciseIds) ? mobilitySettings.knownExerciseIds : [], [mobilitySettings.knownExerciseIds]);
  const preferredExerciseIds = useMemo(() => Array.isArray(mobilitySettings.preferredExerciseIds) ? mobilitySettings.preferredExerciseIds : [], [mobilitySettings.preferredExerciseIds]);
  const excludedExerciseIds = useMemo(() => Array.isArray(mobilitySettings.excludedExerciseIds) ? mobilitySettings.excludedExerciseIds : [], [mobilitySettings.excludedExerciseIds]);
  const customExercises = useMemo(() => Array.isArray(mobilitySettings.customExercises) ? mobilitySettings.customExercises : [], [mobilitySettings.customExercises]);
  const workoutHistory = useMemo(() => Array.isArray(mobilitySettings.history) ? mobilitySettings.history : [], [mobilitySettings.history]);
  const exerciseLibrary = useMemo(() => mergeExerciseLibrary(MOBILITY_EXERCISES, customExercises), [customExercises]);
  const exerciseUsage = useMemo(() => mobilityExerciseUsage(workoutHistory), [workoutHistory]);
  const physioCandidates = MOBILITY_EXERCISES.filter((exercise) => exercise.physioDefault || ["adductor-rockback", "hip-flexor-stretch", "thoracic-rotation", "knee-to-wall", "pallof-press"].includes(exercise.id));
  const visibleLibraryExercises = useMemo(() => {
    const query = librarySearch.trim().toLocaleLowerCase("de-DE");
    return exerciseLibrary.filter((exercise) => {
      if (libraryFocus !== "all" && !exercise.focusAreas.includes(libraryFocus)) return false;
      if (!query) return true;
      const haystack = `${exercise.name} ${exercise.group} ${exercise.purpose} ${exercise.focusAreas.map(focusAreaLabel).join(" ")}`.toLocaleLowerCase("de-DE");
      return haystack.includes(query);
    });
  }, [exerciseLibrary, libraryFocus, librarySearch]);

  function updateMobility(patch) {
    setState((current) => ({
      ...current,
      mobilityCoach: { ...current.mobilityCoach, ...patch },
    }));
  }

  function closeExerciseEditor() {
    setExerciseEditorOpen(false);
    setExerciseSourceUrl("");
    setExerciseSourceStatus({ tone: "idle", message: "" });
    setExerciseSourceCount(1);
    setCustomExerciseDrafts([]);
    setActiveCustomExerciseIndex(0);
    setCustomExerciseMessage("");
  }

  function openNewExercise() {
    setExerciseSourceUrl("");
    setExerciseSourceStatus({ tone: "idle", message: "Füge zuerst den öffentlichen Instagram- oder YouTube-Link ein." });
    setExerciseSourceCount(1);
    setCustomExerciseDrafts([]);
    setActiveCustomExerciseIndex(0);
    setCustomExerciseMessage("");
    setExerciseEditorOpen(true);
  }

  function patchCustomExerciseDraft(patch) {
    setCustomExerciseDrafts((current) => current.map((draft, index) => index === activeCustomExerciseIndex ? { ...draft, ...patch } : draft));
    setCustomExerciseMessage("");
  }

  function toggleCustomDraftList(field, id) {
    setCustomExerciseDrafts((current) => current.map((draft, index) => {
      if (index !== activeCustomExerciseIndex) return draft;
      const values = Array.isArray(draft[field]) ? draft[field] : [];
      return {
        ...draft,
        [field]: values.includes(id) ? values.filter((item) => item !== id) : [...values, id],
      };
    }));
    setCustomExerciseMessage("");
  }

  async function inspectExerciseSource() {
    const parsed = parseExerciseSourceUrl(exerciseSourceUrl);
    if (!parsed.valid) {
      setExerciseSourceStatus({ tone: "bad", message: parsed.reason });
      return;
    }

    setExerciseSourceStatus({ tone: "testing", message: "Quelle und Metadaten werden geprüft …" });
    let source;
    let metadataLoaded = false;
    try {
      source = await fetchExerciseSourceMetadata(exerciseSourceUrl);
      metadataLoaded = true;
    } catch (error) {
      source = parsed;
      setExerciseSourceStatus({
        tone: "warn",
        message: `${error.message} Der Link ist gültig; Name und Übungsdaten kannst du trotzdem selbst ergänzen.`,
      });
    }

    setCustomExerciseDrafts(customExerciseDraftsForSource(source, exerciseSourceCount));
    setActiveCustomExerciseIndex(0);
    setCustomExerciseMessage("");
    if (metadataLoaded) {
      setExerciseSourceStatus({
        tone: "good",
        message: `${source.providerLabel || source.providerName || "Quelle"}${source.authorName ? ` von ${source.authorName}` : ""} erkannt. Beschreibe jetzt die Übung fachlich für den Coach.`,
      });
    }
  }

  function saveCustomExercise() {
    const drafts = customExerciseDrafts.length ? customExerciseDrafts : (customExerciseDraft ? [customExerciseDraft] : []);
    if (!drafts.length) return;
    for (let index = 0; index < drafts.length; index += 1) {
      const error = validateCustomExerciseDraft(drafts[index]);
      if (error) {
        setActiveCustomExerciseIndex(index);
        setCustomExerciseMessage(`Übung ${index + 1}: ${error}`);
        return;
      }
    }
    const normalizedExercises = drafts.map((draft) => normalizeCustomExercise(draft, draft.id || ""));
    let next = [...customExercises];
    normalizedExercises.forEach((normalized) => {
      next = next.some((item) => item.id === normalized.id)
        ? next.map((item) => item.id === normalized.id ? normalized : item)
        : [...next, normalized];
    });
    updateMobility({ customExercises: next });
    setPageMessage(normalizedExercises.length > 1
      ? `${normalizedExercises.length} Übungen wurden aus einer gemeinsamen Quelle in deiner Bibliothek gespeichert.`
      : `${normalizedExercises[0].name} wurde in deiner persönlichen Übungsbibliothek gespeichert.`);
    closeExerciseEditor();
  }

  function editCustomExercise(exercise) {
    setCustomExerciseDrafts([{
      ...emptyCustomExerciseDraft(),
      ...exercise,
      sourceUrl: exercise.source?.canonicalUrl || "",
      sourceSegment: exercise.source?.segmentLabel || "",
    }]);
    setActiveCustomExerciseIndex(0);
    setExerciseSourceCount(1);
    setExerciseSourceUrl(exercise.source?.canonicalUrl || "");
    setCustomExerciseMessage("");
    setExerciseSourceStatus({ tone: "idle", message: "Persönliche Übung wird bearbeitet." });
    setExerciseEditorOpen(true);
  }

  function toggleCustomExerciseApproval(id) {
    updateMobility({
      customExercises: customExercises.map((item) => item.id === id
        ? { ...item, coachApproved: !item.coachApproved, updatedAt: new Date().toISOString() }
        : item),
    });
  }

  function removeCustomExercise(id) {
    const exercise = customExercises.find((item) => item.id === id);
    if (!exercise || !window.confirm(`„${exercise.name}“ aus deiner persönlichen Bibliothek löschen?`)) return;
    updateMobility({
      customExercises: customExercises.filter((item) => item.id !== id),
      preferredExerciseIds: preferredExerciseIds.filter((item) => item !== id),
      excludedExerciseIds: excludedExerciseIds.filter((item) => item !== id),
      knownExerciseIds: knownExerciseIds.filter((item) => item !== id),
    });
    setPageMessage(`${exercise.name} wurde gelöscht.`);
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

  function togglePreferredExercise(id) {
    const preferred = preferredExerciseIds.includes(id);
    updateMobility({
      preferredExerciseIds: preferred ? preferredExerciseIds.filter((item) => item !== id) : [...preferredExerciseIds, id],
      excludedExerciseIds: excludedExerciseIds.filter((item) => item !== id),
    });
  }

  function toggleExcludedExercise(id) {
    if (physioExerciseIds.includes(id)) return;
    const excluded = excludedExerciseIds.includes(id);
    updateMobility({
      excludedExerciseIds: excluded ? excludedExerciseIds.filter((item) => item !== id) : [...excludedExerciseIds, id],
      preferredExerciseIds: preferredExerciseIds.filter((item) => item !== id),
    });
  }

  function togglePhysio(id) {
    const next = physioExerciseIds.includes(id) ? physioExerciseIds.filter((item) => item !== id) : [...physioExerciseIds, id];
    updateMobility({ physioExerciseIds: next });
  }

  return (
    <>
      <PageTitle eyebrow="Coach Engine" title="Übungen">
        <div className="page-actions">
          <Link className="button-link" to="/coach?tab=mobility">Zurück zum Workout</Link>
          <button type="button" onClick={openNewExercise}>+ Übung aus Link</button>
        </div>
      </PageTitle>

      <div className="grid exercise-page-grid">
        <Card className="wide exercise-page-intro">
          <div>
            <p className="eyebrow">Persönliche Übungszentrale</p>
            <h2>Bibliothek verwalten, ohne den Workout-Bereich zu überladen</h2>
            <p>Physio-Prioritäten, bekannte Übungen, persönliche Reel-Inspirationen und Coach-Freigaben liegen jetzt an einem eigenen Ort. Der Stabi-&-Mobility-Tab bleibt dadurch auf das heutige Workout fokussiert.</p>
          </div>
          <div className="exercise-page-stats">
            <span><b>{exerciseLibrary.length}</b> Übungen</span>
            <span><b>{physioExerciseIds.length}</b> Physio</span>
            <span><b>{customExercises.length}</b> persönlich</span>
            <span><b>{preferredExerciseIds.length}</b> bevorzugt</span>
          </div>
        </Card>

        {pageMessage && <div className="connection-message wide" role="status">{pageMessage}</div>}

        <Card className="wide physio-library-card">
          <div className="exercise-page-section-heading">
            <div>
              <p className="eyebrow">Meine Physio-Übungen</p>
              <h2>Nur persönliche Vorgaben fest anheften</h2>
              <p>Aktiviere nur Übungen, die du kennst oder die dir fachlich gezeigt wurden. Diese Prioritäten werden vor allgemeinen Coach-Vorschlägen eingeplant.</p>
            </div>
            <span>{physioExerciseIds.length} aktiv</span>
          </div>
          <div className="physio-picker">{physioCandidates.map((exercise) => <button type="button" className={physioExerciseIds.includes(exercise.id) ? "selected" : ""} onClick={() => togglePhysio(exercise.id)} key={exercise.id}><strong>{exercise.name}</strong><span>{materialText(exercise)}</span></button>)}</div>
        </Card>

        <Card className="wide exercise-inspiration-card">
          <div className="exercise-page-section-heading">
            <div>
              <p className="eyebrow">Inspirationen</p>
              <h2>Eigene Übungen aus Reels und Videos</h2>
              <p>Die Originalquelle bleibt verknüpft. Erst nach deiner Freigabe darf der Coach die Übung automatisch in ein Workout einbauen.</p>
            </div>
            <button type="button" className="primary compact-primary" onClick={openNewExercise}>+ Übung hinzufügen</button>
          </div>

          {customExercises.length > 0 ? <div className="custom-exercise-source-list">
            {customExercises.map((exercise) => <article key={exercise.id}>
              {exercise.source?.thumbnailUrl ? <img src={exercise.source.thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="custom-source-placeholder" aria-hidden="true">▶</span>}
              <div>
                <small>{exerciseSourceLabel(exercise.source)}</small>
                <strong>{exercise.name}</strong>
                <p>{exercise.purpose}</p>
                <div><b className={exercise.coachApproved ? "approved" : "library-only"}>{exercise.coachApproved ? "Coach freigegeben" : "Nur Bibliothek"}</b><span>{exercise.coachUse === "activation" ? "Aktivierung" : exercise.coachUse === "recovery" ? "Regeneration" : exercise.coachUse === "strength" ? "Kraft" : "Allgemein"}</span></div>
              </div>
              <div className="custom-exercise-source-actions">
                <a href={exercise.source?.canonicalUrl} target="_blank" rel="noreferrer">Quelle ↗</a>
                <button type="button" onClick={() => editCustomExercise(exercise)}>Bearbeiten</button>
                <button type="button" onClick={() => toggleCustomExerciseApproval(exercise.id)}>{exercise.coachApproved ? "Coach pausieren" : "Coach freigeben"}</button>
                <button type="button" className="danger" onClick={() => removeCustomExercise(exercise.id)}>Löschen</button>
              </div>
            </article>)}
          </div> : <p className="empty-library-result">Noch keine persönliche Übung hinterlegt. Öffne ein Reel oder Video, kopiere den Link und bereite die Übung einmal sauber für den Coach auf.</p>}
        </Card>

        <Card className="wide exercise-library-card">
          <div className="exercise-page-section-heading">
            <div><p className="eyebrow">Übungsbibliothek</p><h2>Bewegung ansehen, dann sauber ausführen</h2><p>Suche, Anleitung, persönliche Priorisierung und Pausenstatus sind hier gebündelt.</p></div>
            <span>{visibleLibraryExercises.length} sichtbar</span>
          </div>
          <div className="exercise-library-toolbar">
            <label>Übung suchen<input type="search" value={librarySearch} onChange={(event) => setLibrarySearch(event.target.value)} placeholder="z. B. Dead Bug oder Sprunggelenk" /></label>
            <label>Schwerpunkt<select value={libraryFocus} onChange={(event) => setLibraryFocus(event.target.value)}><option value="all">Alle Bereiche</option>{MOBILITY_FOCUS_AREAS.map((focus) => <option value={focus.id} key={focus.id}>{focus.label}</option>)}</select></label>
          </div>
          <div className="exercise-library-grid">
            {visibleLibraryExercises.map((exercise) => (
              <article key={exercise.id}>
                <div className="exercise-library-card-heading"><div><span>{exercise.group}</span><h3>{exercise.name}</h3>{exercise.subtitle && <small className="mobility-exercise-subtitle">{exercise.subtitle}</small>}</div><div className="exercise-library-badges">{exercise.custom && <b className="custom">Eigene Quelle</b>}{exercise.custom && <b className={exercise.coachApproved ? "coach-approved" : "coach-locked"}>{exercise.coachApproved ? "Coach aktiv" : "Nur Bibliothek"}</b>}{physioExerciseIds.includes(exercise.id) && <b>Physio</b>}{knownExerciseIds.includes(exercise.id) && !physioExerciseIds.includes(exercise.id) && <b className="known">Bekannt</b>}{exerciseUsage[exercise.id]?.count > 0 && <b className="usage">{exerciseUsage[exercise.id].count}×</b>}{preferredExerciseIds.includes(exercise.id) && <b className="preferred">Bevorzugt</b>}{excludedExerciseIds.includes(exercise.id) && <b className="excluded">Pausiert</b>}</div></div>
                <p>{exercise.purpose}</p>
                <small>{materialText(exercise)} · {exercise.focusAreas.map(focusAreaLabel).join(" · ") || "Allgemein"}{exerciseUsageLabel(exerciseUsage[exercise.id]) ? ` · ${exerciseUsageLabel(exerciseUsage[exercise.id])}` : ""}</small>
                {exercise.custom && <small className="custom-exercise-library-source">{exerciseSourceLabel(exercise.source)}</small>}
                <div className="exercise-library-actions">
                  <ExerciseGuideButton exercise={exercise} onOpen={setSelectedGuide} />
                  {exercise.custom && <button type="button" className={exercise.coachApproved ? "selected" : "secondary"} onClick={() => toggleCustomExerciseApproval(exercise.id)}>{exercise.coachApproved ? "✓ Coach aktiv" : "Coach freigeben"}</button>}
                  <button type="button" className={preferredExerciseIds.includes(exercise.id) ? "selected" : ""} onClick={() => togglePreferredExercise(exercise.id)}>{preferredExerciseIds.includes(exercise.id) ? "✓ Bevorzugt" : "Bevorzugen"}</button>
                  <button type="button" className={excludedExerciseIds.includes(exercise.id) ? "selected danger" : "secondary"} disabled={physioExerciseIds.includes(exercise.id)} title={physioExerciseIds.includes(exercise.id) ? "Physio-Prioritäten können nicht pausiert werden" : "Übung vorübergehend aus automatisch erzeugten Workouts entfernen"} onClick={() => toggleExcludedExercise(exercise.id)}>{excludedExerciseIds.includes(exercise.id) ? "✓ Pausiert" : "Pausieren"}</button>
                </div>
              </article>
            ))}
          </div>
          {!visibleLibraryExercises.length && <p className="empty-library-result">Keine passende Übung gefunden. Suche oder Schwerpunkt anpassen.</p>}
          <p className="mobility-safety-note">Schmerz ist kein Trainingsziel. Übungen abbrechen oder vereinfachen, wenn die Bewegung Beschwerden auslöst; bei Physio-Vorgaben gilt die persönlich gezeigte Ausführung.</p>
        </Card>
      </div>

      {exerciseEditorOpen && <EditorModal
        eyebrow="Persönliche Übung"
        title={customExerciseDraft?.id ? "Übung bearbeiten" : "Übung aus Reel oder Video hinzufügen"}
        description="Der Link bleibt als Originalquelle erhalten. Die fachliche Einordnung kontrollierst du selbst."
        width="xl"
        className="custom-exercise-modal"
        onClose={closeExerciseEditor}
      >
        <div className="exercise-source-input-row">
          <label>Öffentlicher Instagram- oder YouTube-Link
            <input type="url" value={exerciseSourceUrl} onChange={(event) => setExerciseSourceUrl(event.target.value)} placeholder="https://www.instagram.com/reel/…" disabled={Boolean(customExerciseDraft?.id)} />
          </label>
          {!customExerciseDraft?.id && <label className="exercise-source-count">Übungen im Video
            <select value={exerciseSourceCount} onChange={(event) => setExerciseSourceCount(Number(event.target.value))}>{[1, 2, 3, 4, 5, 6].map((value) => <option value={value} key={value}>{value}</option>)}</select>
          </label>}
          {!customExerciseDraft?.id && <button type="button" className="primary compact-primary" onClick={inspectExerciseSource}>Quelle aufteilen</button>}
        </div>
        {exerciseSourceStatus.message && <p className={`exercise-source-status ${exerciseSourceStatus.tone}`}>{exerciseSourceStatus.message}</p>}

        {customExerciseDraft && <div className="custom-exercise-editor">
          {customExerciseDrafts.length > 1 && <div className="custom-source-exercise-tabs">
            <div><b>{customExerciseDrafts.length} Übungen aus einer Quelle</b><small>Jede Übung wird separat gespeichert. Der Coach zeigt dieselbe Videoquelle in einem automatisch erzeugten Workout höchstens einmal.</small></div>
            <div>{customExerciseDrafts.map((draft, index) => <button type="button" className={activeCustomExerciseIndex === index ? "selected" : ""} onClick={() => { setActiveCustomExerciseIndex(index); setCustomExerciseMessage(""); }} key={`${draft.source?.sourceGroupId || "source"}-${index}`}>Übung {index + 1}{draft.name ? ` · ${draft.name}` : ""}</button>)}</div>
          </div>}
          <div className="custom-exercise-source-preview">
            {customExerciseDraft.source?.thumbnailUrl
              ? <img src={customExerciseDraft.source.thumbnailUrl} alt="Vorschaubild der Inspirationsquelle" loading="lazy" referrerPolicy="no-referrer" />
              : <span aria-hidden="true">▶</span>}
            <div>
              <small>Originalquelle</small>
              <strong>{exerciseSourceLabel(customExerciseDraft.source)}</strong>
              <p>{customExerciseDraft.source?.title || customExerciseDraft.source?.canonicalUrl}</p>
              {customExerciseDraft.source?.canonicalUrl && <a href={customExerciseDraft.source.canonicalUrl} target="_blank" rel="noreferrer">Quelle öffnen ↗</a>}
            </div>
          </div>

          <div className="custom-exercise-form-grid">
            <label>Name der Übung<input value={customExerciseDraft.name} onChange={(event) => patchCustomExerciseDraft({ name: event.target.value })} placeholder="z. B. Dynamischer Lunge-to-Knee-Drive" /></label>
            <label>Übungsgruppe<input value={customExerciseDraft.group} onChange={(event) => patchCustomExerciseDraft({ group: event.target.value })} placeholder="Dynamische Stabilität" /></label>
            {customExerciseDrafts.length > 1 && <label>Position im Video / Hinweis<input value={customExerciseDraft.sourceSegment || ""} onChange={(event) => patchCustomExerciseDraft({ sourceSegment: event.target.value })} placeholder="z. B. Übung 2 · ab 0:18" /></label>}
            <label>Steuerung<select value={customExerciseDraft.doseMode || "time"} onChange={(event) => patchCustomExerciseDraft({ doseMode: event.target.value })}><option value="time">Zeit</option><option value="reps">Wiederholungen mit Progression</option></select></label>
            {customExerciseDraft.doseMode === "reps"
              ? <label>Start-Wiederholungen<input type="number" min="1" max="30" value={customExerciseDraft.baseReps || 5} onChange={(event) => patchCustomExerciseDraft({ baseReps: Number(event.target.value) })} /></label>
              : <label>Dauer je Übung<select value={customExerciseDraft.seconds} onChange={(event) => patchCustomExerciseDraft({ seconds: Number(event.target.value) })}>{[30, 45, 60, 75, 90, 120].map((value) => <option value={value} key={value}>{value} Sekunden</option>)}</select></label>}
            <label>Coach-Einsatz<select value={customExerciseDraft.coachUse} onChange={(event) => patchCustomExerciseDraft({ coachUse: event.target.value })}><option value="general">Allgemeine Stabi</option><option value="activation">Aktivierung vor Belastung</option><option value="recovery">Regeneration nach Belastung</option><option value="strength">Kraft an freien Tagen</option></select></label>
            <label className="wide-field">Wofür ist die Übung gut?<textarea rows="2" value={customExerciseDraft.purpose} onChange={(event) => patchCustomExerciseDraft({ purpose: event.target.value })} placeholder="Trainiert Hüftstabilität, Balance und kontrollierte Kraftübertragung." /></label>
            <label className="wide-field">Kurz erklärt<textarea rows="3" value={customExerciseDraft.quickStart} onChange={(event) => patchCustomExerciseDraft({ quickStart: event.target.value, instruction: event.target.value })} placeholder="Ausgangsposition, Bewegungsweg und wichtigster Technikhinweis in zwei bis drei Sätzen." /></label>
          </div>

          <div className="custom-exercise-picker">
            <b>Trainingsschwerpunkte</b>
            <div>{MOBILITY_FOCUS_AREAS.map((focus) => <button type="button" className={customExerciseDraft.focusAreas.includes(focus.id) ? "selected" : ""} onClick={() => toggleCustomDraftList("focusAreas", focus.id)} key={focus.id}>{focus.shortLabel}</button>)}</div>
          </div>
          <div className="custom-exercise-picker">
            <b>Benötigtes Material</b>
            <div><button type="button" className={!customExerciseDraft.equipment.length ? "selected" : ""} onClick={() => patchCustomExerciseDraft({ equipment: [] })}>Ohne Material</button>{MOBILITY_EQUIPMENT.map((item) => <button type="button" className={customExerciseDraft.equipment.includes(item.id) ? "selected" : ""} onClick={() => toggleCustomDraftList("equipment", item.id)} key={item.id}>{item.label}</button>)}</div>
          </div>

          <div className="custom-exercise-toggles">
            {customExerciseDraft.doseMode === "reps" && <label><input type="checkbox" checked={Boolean(customExerciseDraft.repsPerSide)} onChange={(event) => patchCustomExerciseDraft({ repsPerSide: event.target.checked })} /><span><b>Wiederholungen pro Seite</b><small>Die Vorgabe wird z. B. als 5/Seite geführt und gemeinsam abgeschlossen.</small></span></label>}
            {customExerciseDraft.doseMode !== "reps" && <label><input type="checkbox" checked={customExerciseDraft.sideSwitch} onChange={(event) => patchCustomExerciseDraft({ sideSwitch: event.target.checked })} /><span><b>Seitenwechsel nötig</b><small>Der Timer teilt die Belastungszeit auf beide Seiten auf.</small></span></label>}
            <label><input type="checkbox" checked={customExerciseDraft.avoidBeforeQuality} onChange={(event) => patchCustomExerciseDraft({ avoidBeforeQuality: event.target.checked })} /><span><b>Nicht vor Track, Fußball oder Longrun</b><small>Für dynamische oder ermüdende Übungen mit Bedacht setzen.</small></span></label>
            <label><input type="checkbox" checked={customExerciseDraft.coachApproved} onChange={(event) => patchCustomExerciseDraft({ coachApproved: event.target.checked })} /><span><b>Für Coach-Auswahl freigeben</b><small>Ohne Freigabe bleibt die Übung nur in deiner persönlichen Bibliothek.</small></span></label>
          </div>
          {customExerciseDraft.doseMode !== "reps" && customExerciseDraft.sideSwitch && <label className="custom-side-switch-seconds">Pause für Seitenwechsel<input type="number" min="3" max="10" step="1" value={customExerciseDraft.sideSwitchSeconds} onChange={(event) => patchCustomExerciseDraft({ sideSwitchSeconds: Number(event.target.value) })} /> Sekunden</label>}

          {customExerciseMessage && <p className="form-error">{customExerciseMessage}</p>}
          <div className="button-row">
            <button type="button" className="primary" onClick={saveCustomExercise}>{customExerciseDraft.id ? "Änderung speichern" : customExerciseDrafts.length > 1 ? `${customExerciseDrafts.length} Übungen speichern` : "Übung speichern"}</button>
            <button type="button" className="secondary" onClick={closeExerciseEditor}>Abbrechen</button>
          </div>
        </div>}
      </EditorModal>}

      {selectedGuide && <ExerciseGuide exercise={selectedGuide} known={isExerciseKnown(selectedGuide.id)} knownLocked={physioExerciseIds.includes(selectedGuide.id)} onToggleKnown={toggleKnownExercise} onClose={() => setSelectedGuide(null)} />}
    </>
  );
}
