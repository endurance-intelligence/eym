import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../context/AppContext";
import { Card, PageTitle, Metric } from "../components/UI";
import EventAutocomplete from "../components/EventAutocomplete";
import EditorModal from "../components/EditorModal";
import TrainingSectionNav from "../components/SectionNav";
import { daysUntil, fmtDate } from "../utils/format";
import { buildEventAdvice, fetchEventForecast } from "../services/eventWeather";
import { placeSuggestionSubtitle, searchPlaces } from "../services/placeSearch";
import { deriveAchievements } from "../services/achievements";
import { activityDate, isRunningActivity, preferredActivities } from "../services/activityUtils";
import {
  aidStationLabel,
  courseTypeLabel,
  eventCourseProfile,
  loopModeLabel,
} from "../services/goalPlanning";
import {
  GOAL_DISCIPLINE_OPTIONS,
  formatGoalDuration,
  formatGoalDurationInput,
  formatPaceSeconds,
  inferGoalDiscipline,
  parseGoalDurationSeconds,
} from "../services/goalEngine";
import { LOOP_MODES, formatLoopDuration, loopMatchPlan } from "../services/loopWorkout";
import {
  eventSourceStatusLabel,
  eventSuggestionMissionPatch,
} from "../services/eventCatalog";
import {
  buildGoalPath,
  eventDateLabel,
  forecastAvailableFromLabel,
  weatherGlyph,
} from "../services/goalTimeline";

const emptyEvent = {
  name: "",
  date: "",
  time: "",
  location: "",
  place: null,
  targetKm: "",
  preparationStartDate: "",
  isMainTarget: false,
  priority: "B",
  goalType: "finish",
  goalDiscipline: "auto",
  targetTime: "",
  elevationGain: "",
  elevationLoss: "",
  surface: "road",
  courseType: "unspecified",
  loopKm: "",
  loopMode: "free",
  loopIntervalMinutes: 60,
  eventTimeLimit: "",
  plannedStopMinutes: 3,
  aidStationMode: "unspecified",
  role: "",
  eventCatalogId: "",
  eventSourceName: "",
  eventSourceUrl: "",
  eventVerifiedAt: "",
  eventDataStatus: "",
  eventSourceDetails: "",
};

function nextDay(dateString) {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

export default function Mission() {
  const { state, setState } = useApp();
  const [draft, setDraft] = useState(emptyEvent);
  const [editingId, setEditingId] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [eventSearchQuery, setEventSearchQuery] = useState("");
  const [selectedMilestoneId, setSelectedMilestoneId] = useState(null);
  const [forecasts, setForecasts] = useState({});
  const [showArchived, setShowArchived] = useState(false);
  const [showAllAchievements, setShowAllAchievements] = useState(false);
  const [placeSuggestions, setPlaceSuggestions] = useState([]);
  const [placeStatus, setPlaceStatus] = useState("");
  const placeRequest = useRef(null);
  const forecastRequests = useRef(new Set());

  const activities = useMemo(() => preferredActivities(state.activities), [state.activities]);
  const achievements = useMemo(() => deriveAchievements(activities, state.reviews), [activities, state.reviews]);
  const hermann2026 = achievements.find((item) => /hermannslauf/i.test(item.title) && item.date.startsWith("2026"));
  const preparationStartDate = state.mission.preparationStartDate || (hermann2026 ? nextDay(hermann2026.date) : "");
  const preparationRuns = useMemo(() => preparationStartDate
    ? activities.filter((activity) => isRunningActivity(activity) && activityDate(activity) >= preparationStartDate)
    : [], [activities, preparationStartDate]);
  const preparationKm = preparationRuns.reduce((sum, activity) => sum + Number(activity.distance || 0), 0);

  const milestones = useMemo(() => {
    const values = Array.isArray(state.mission.milestones) ? state.mission.milestones : [];
    if (values.some((item) => item.id === state.mission.id || item.isMainTarget)) return values;
    if (!state.mission?.name || !state.mission?.date) return values;
    return [...values, {
      id: state.mission.id,
      name: state.mission.name,
      date: state.mission.date,
      time: state.mission.time || "",
      location: state.mission.location || "",
      targetKm: state.mission.targetKm || 0,
      goalType: state.mission.goalType || (state.mission.targetTime ? "time" : "finish"),
      targetTime: state.mission.targetTime || "",
      goalDiscipline: state.mission.goalDiscipline || "auto",
      courseType: state.mission.courseType || "",
      loopKm: state.mission.loopKm || 0,
      loopMode: state.mission.loopMode || "",
      loopIntervalMinutes: state.mission.loopIntervalMinutes || 0,
      eventTimeLimit: state.mission.eventTimeLimit || "",
      plannedStopMinutes: state.mission.plannedStopMinutes ?? 3,
      aidStationMode: state.mission.aidStationMode || "",
      preparationStartDate,
      isMainTarget: true,
      archived: false,
    }];
  }, [state.mission, preparationStartDate]);

  const activeMilestones = useMemo(() => milestones.filter((item) => !item.archived), [milestones]);
  const mainTarget = useMemo(() => activeMilestones.find((item) => item.isMainTarget) || activeMilestones[0], [activeMilestones]);
  const mainCourseProfile = eventCourseProfile(mainTarget || {});
  const mainLoopMatchPlan = mainCourseProfile.loopMode === LOOP_MODES.TIME_LIMIT
    ? loopMatchPlan({ ...mainCourseProfile, targetKm: Number(mainTarget?.targetKm || 0) })
    : null;
  const goalPath = useMemo(() => buildGoalPath(activeMilestones, mainTarget, new Date()), [activeMilestones, mainTarget]);
  const selectedMilestone = goalPath.find((item) => item.id === selectedMilestoneId) || null;
  const archivedMilestones = milestones.filter((item) => item.archived);

  useEffect(() => {
    goalPath.forEach((item) => {
      const days = daysUntil(item.date);
      if (!item.location || days < 0 || days > 16) return;
      const placeKey = item.place?.latitude && item.place?.longitude
        ? `${item.place.latitude}:${item.place.longitude}`
        : item.location;
      const requestKey = `${item.id}:${item.date}:${placeKey}`;
      if (forecastRequests.current.has(requestKey)) return;
      forecastRequests.current.add(requestKey);
      setForecasts((current) => ({ ...current, [item.id]: { loading: true } }));
      fetchEventForecast(item.place || item.location, item.date)
        .then((forecast) => setForecasts((current) => ({ ...current, [item.id]: forecast })))
        .catch((error) => setForecasts((current) => ({ ...current, [item.id]: { error: error.message } })));
    });
  }, [goalPath]);

  function change(event) {
    const { name, value, type, checked } = event.target;
    setDraft((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
      ...(name === "location" ? { place: null } : {}),
      ...(["name", "date", "time", "location", "targetKm", "surface", "courseType", "elevationGain", "elevationLoss"].includes(name) && current.eventCatalogId
        ? { eventDataStatus: "adjusted" }
        : {}),
    }));
  }

  function selectEventSuggestion(event) {
    setDraft((current) => ({
      ...current,
      ...eventSuggestionMissionPatch(event),
    }));
    setEventSearchQuery("");
    setPlaceSuggestions([]);
    setPlaceStatus("");
  }

  useEffect(() => {
    const query = draft.location.trim();
    if (draft.place || (draft.eventCatalogId && draft.eventDataStatus === "verified") || query.length < 3) {
      setPlaceSuggestions([]);
      setPlaceStatus("");
      return undefined;
    }

    const timer = window.setTimeout(async () => {
      placeRequest.current?.abort();
      const controller = new AbortController();
      placeRequest.current = controller;
      setPlaceStatus("Orte werden gesucht …");
      try {
        const results = await searchPlaces(query, controller.signal);
        setPlaceSuggestions(results);
        setPlaceStatus(results.length ? "" : "Kein passender Ort gefunden.");
      } catch (error) {
        if (error.name !== "AbortError") setPlaceStatus(error.message);
      }
    }, 800);

    return () => window.clearTimeout(timer);
  }, [draft.eventCatalogId, draft.eventDataStatus, draft.location, draft.place]);

  function selectPlace(place) {
    setDraft((current) => ({ ...current, location: place.label, place }));
    setPlaceSuggestions([]);
    setPlaceStatus("");
  }

  function save(event) {
    event.preventDefault();
    if (!draft.name.trim() || !draft.date) return;

    setState((current) => {
      const currentMilestones = Array.isArray(current.mission.milestones) ? current.mission.milestones : [];
      const id = editingId || crypto.randomUUID();
      const savedEvent = {
        id,
        name: draft.name.trim(),
        date: draft.date,
        time: draft.time || "",
        location: draft.location.trim(),
        place: draft.place,
        targetKm: draft.targetKm === "" ? null : Number(draft.targetKm),
        preparationStartDate: draft.preparationStartDate || null,
        isMainTarget: Boolean(draft.isMainTarget),
        priority: draft.isMainTarget ? "A" : (draft.priority || "B"),
        goalType: draft.goalType || "finish",
        goalDiscipline: draft.goalDiscipline || "auto",
        targetTime: ["time", "pb"].includes(draft.goalType)
          ? formatGoalDurationInput(draft.targetTime)
          : "",
        elevationGain: draft.elevationGain === "" ? 0 : Number(draft.elevationGain),
        elevationLoss: draft.elevationLoss === "" ? 0 : Number(draft.elevationLoss),
        surface: draft.surface || "road",
        courseType: draft.courseType || "unspecified",
        loopKm: draft.courseType === "loop" && draft.loopKm !== "" ? Number(draft.loopKm) : 0,
        loopMode: draft.courseType === "loop" ? draft.loopMode || LOOP_MODES.FREE : LOOP_MODES.FREE,
        loopIntervalMinutes: draft.courseType === "loop" && draft.loopMode === LOOP_MODES.FIXED_INTERVAL ? Number(draft.loopIntervalMinutes || 60) : 0,
        eventTimeLimit: draft.courseType === "loop" && draft.loopMode === LOOP_MODES.TIME_LIMIT ? draft.eventTimeLimit : "",
        plannedStopMinutes: draft.courseType === "loop" && draft.loopMode === LOOP_MODES.TIME_LIMIT ? Number(draft.plannedStopMinutes || 0) : 0,
        aidStationMode: draft.aidStationMode || "unspecified",
        role: draft.role || "",
        eventCatalogId: draft.eventCatalogId || "",
        eventSourceName: draft.eventSourceName || "",
        eventSourceUrl: draft.eventSourceUrl || "",
        eventVerifiedAt: draft.eventVerifiedAt || "",
        eventDataStatus: draft.eventDataStatus || "",
        eventSourceDetails: draft.eventSourceDetails || "",
        archived: false,
      };

      let next = editingId
        ? currentMilestones.map((item) => item.id === editingId ? { ...item, ...savedEvent } : item)
        : [...currentMilestones, savedEvent];

      if (savedEvent.isMainTarget) next = next.map((item) => ({ ...item, isMainTarget: item.id === id }));

      const mainTarget = next.find((item) => item.isMainTarget && !item.archived) || next.find((item) => !item.archived) || savedEvent;
      return {
        ...current,
        mission: {
          ...current.mission,
          id: mainTarget.id,
          name: mainTarget.name,
          date: mainTarget.date,
          time: mainTarget.time || "",
          location: mainTarget.location || "",
          targetKm: Number(mainTarget.targetKm) || 0,
          goalType: mainTarget.goalType || "finish",
          targetTime: mainTarget.targetTime || "",
          goalDiscipline: mainTarget.goalDiscipline || "auto",
          courseType: mainTarget.courseType || "unspecified",
          loopKm: Number(mainTarget.loopKm) || 0,
          loopMode: mainTarget.loopMode || LOOP_MODES.FREE,
          loopIntervalMinutes: Number(mainTarget.loopIntervalMinutes) || 0,
          eventTimeLimit: mainTarget.eventTimeLimit || "",
          plannedStopMinutes: Number(mainTarget.plannedStopMinutes) || 0,
          aidStationMode: mainTarget.aidStationMode || "unspecified",
          preparationStartDate: mainTarget.preparationStartDate || current.mission.preparationStartDate || preparationStartDate,
          milestones: next,
        },
      };
    });

    setDraft(emptyEvent);
    setEditingId(null);
    setEventSearchQuery("");
    setShowEditor(false);
  }

  function edit(item) {
    setSelectedMilestoneId(null);
    const courseProfile = eventCourseProfile(item);
    setEditingId(item.id);
    setEventSearchQuery("");
    setDraft({
      name: item.name,
      date: item.date,
      time: item.time || "",
      location: item.location || "",
      place: item.place || null,
      targetKm: item.targetKm ?? "",
      preparationStartDate: item.preparationStartDate ?? "",
      isMainTarget: Boolean(item.isMainTarget),
      priority: item.priority || (item.isMainTarget ? "A" : "B"),
      goalType: item.goalType || (item.targetTime ? "time" : item.targetKm ? "distance" : "finish"),
      goalDiscipline: item.goalDiscipline || "auto",
      targetTime: formatGoalDurationInput(item.targetTime),
      elevationGain: item.elevationGain ?? "",
      elevationLoss: item.elevationLoss ?? "",
      surface: item.surface || "road",
      courseType: courseProfile.courseType,
      loopKm: courseProfile.loopKm || "",
      loopMode: courseProfile.loopMode,
      loopIntervalMinutes: courseProfile.loopIntervalMinutes || 60,
      eventTimeLimit: courseProfile.eventTimeLimit || "",
      plannedStopMinutes: courseProfile.plannedStopMinutes ?? 3,
      aidStationMode: courseProfile.aidStationMode,
      role: item.role || "",
      eventCatalogId: item.eventCatalogId || "",
      eventSourceName: item.eventSourceName || "",
      eventSourceUrl: item.eventSourceUrl || "",
      eventVerifiedAt: item.eventVerifiedAt || "",
      eventDataStatus: item.eventDataStatus || "",
      eventSourceDetails: item.eventSourceDetails || "",
    });
    setShowEditor(true);
  }

  function archive(id) {
    setState((current) => {
      let next = current.mission.milestones.map((item) => item.id === id ? { ...item, archived: !item.archived, isMainTarget: item.id === id ? false : item.isMainTarget } : item);
      const currentMain = next.find((item) => item.isMainTarget && !item.archived);
      if (!currentMain) {
        const replacement = next.find((item) => !item.archived);
        if (replacement) next = next.map((item) => ({ ...item, isMainTarget: item.id === replacement.id }));
      }
      const mainTarget = next.find((item) => item.isMainTarget && !item.archived);
      return {
        ...current,
        mission: {
          ...current.mission,
          ...(mainTarget ? {
            id: mainTarget.id,
            name: mainTarget.name,
            date: mainTarget.date,
            time: mainTarget.time || "",
            location: mainTarget.location || "",
            targetKm: Number(mainTarget.targetKm) || 0,
            goalType: mainTarget.goalType || "finish",
            targetTime: mainTarget.targetTime || "",
            goalDiscipline: mainTarget.goalDiscipline || "auto",
            courseType: mainTarget.courseType || "unspecified",
            loopKm: Number(mainTarget.loopKm) || 0,
            loopMode: mainTarget.loopMode || LOOP_MODES.FREE,
            loopIntervalMinutes: Number(mainTarget.loopIntervalMinutes) || 0,
            eventTimeLimit: mainTarget.eventTimeLimit || "",
            plannedStopMinutes: Number(mainTarget.plannedStopMinutes) || 0,
            aidStationMode: mainTarget.aidStationMode || "unspecified",
            preparationStartDate: mainTarget.preparationStartDate || current.mission.preparationStartDate,
          } : {}),
          milestones: next,
        },
      };
    });
  }

  function remove(id) {
    if (!window.confirm("Diesen Eintrag endgültig löschen?")) return;
    setState((current) => {
      let next = current.mission.milestones.filter((item) => item.id !== id);
      if (!next.some((item) => item.isMainTarget && !item.archived)) {
        const replacement = next.find((item) => !item.archived);
        if (replacement) next = next.map((item) => ({ ...item, isMainTarget: item.id === replacement.id }));
      }
      const mainTarget = next.find((item) => item.isMainTarget && !item.archived);
      return {
        ...current,
        mission: {
          ...current.mission,
          ...(mainTarget ? {
            id: mainTarget.id,
            name: mainTarget.name,
            date: mainTarget.date,
            time: mainTarget.time || "",
            location: mainTarget.location || "",
            targetKm: Number(mainTarget.targetKm) || 0,
            goalType: mainTarget.goalType || "finish",
            targetTime: mainTarget.targetTime || "",
            goalDiscipline: mainTarget.goalDiscipline || "auto",
            courseType: mainTarget.courseType || "unspecified",
            loopKm: Number(mainTarget.loopKm) || 0,
            loopMode: mainTarget.loopMode || LOOP_MODES.FREE,
            loopIntervalMinutes: Number(mainTarget.loopIntervalMinutes) || 0,
            eventTimeLimit: mainTarget.eventTimeLimit || "",
            plannedStopMinutes: Number(mainTarget.plannedStopMinutes) || 0,
            aidStationMode: mainTarget.aidStationMode || "unspecified",
            preparationStartDate: mainTarget.preparationStartDate || current.mission.preparationStartDate,
          } : {}),
          milestones: next,
        },
      };
    });
  }

  async function loadForecast(item) {
    setForecasts((current) => ({ ...current, [item.id]: { loading: true } }));
    try {
      const forecast = await fetchEventForecast(item.place || item.location, item.date);
      setForecasts((current) => ({ ...current, [item.id]: forecast }));
    } catch (error) {
      setForecasts((current) => ({ ...current, [item.id]: { error: error.message } }));
    }
  }

  function timelineWeather(item) {
    if (!item.location) return null;
    const days = daysUntil(item.date);
    const forecast = forecasts[item.id];
    if (days > 16) return <span className="mission-goal-path-weather future">Wetter ab {forecastAvailableFromLabel(item.date)} verfügbar</span>;
    if (forecast?.loading) return <span className="mission-goal-path-weather">Wetter wird geladen …</span>;
    if (forecast?.error) return <span className="mission-goal-path-weather muted">Wetter aktuell nicht verfügbar</span>;
    if (forecast?.unavailable) return <span className="mission-goal-path-weather future">{forecast.reason}</span>;
    if (!forecast) return null;
    return <span className="mission-goal-path-weather available">{weatherGlyph(forecast.condition)} {forecast.min}–{forecast.max} °C · Regen {forecast.rainChance}% · Wind {forecast.wind} km/h</span>;
  }

  function eventCard(item, archived = false) {
    const forecast = forecasts[item.id];
    const courseProfile = eventCourseProfile(item);
    const discipline = inferGoalDiscipline(item);
    const disciplineLabel = GOAL_DISCIPLINE_OPTIONS.find((option) => option.value === discipline)?.label || "Allgemeine Ausdauer";
    const targetSeconds = parseGoalDurationSeconds(item.targetTime);
    const targetPace = targetSeconds > 0 && Number(item.targetKm || 0) > 0
      ? formatPaceSeconds(targetSeconds / Number(item.targetKm))
      : "";
    const matchPlan = courseProfile.loopMode === LOOP_MODES.TIME_LIMIT
      ? loopMatchPlan({ ...courseProfile, targetKm: Number(item.targetKm || 0) })
      : null;
    return (
      <Card key={item.id} className={item.isMainTarget ? "main-target-card" : ""}>
        <div className="card-heading-row">
          <div><p className="eyebrow">{item.isMainTarget ? "Hauptziel" : archived ? "Archiviert" : "Meilenstein"}</p><h2>{item.name}</h2></div>
          {item.isMainTarget && <span className="main-target-badge">Hauptziel</span>}
        </div>
        <p>{fmtDate(item.date)}{item.time ? ` · ${item.time} Uhr` : ""} · noch {daysUntil(item.date)} Tage</p>
        <p className="muted">{item.location || "Noch kein Ort hinterlegt"}</p>
        {item.targetKm ? <p><strong>Ziel:</strong> {item.targetKm} km</p> : null}
        <p><strong>Zielprofil:</strong> {disciplineLabel}</p>
        {item.goalType && <p><strong>Zielart:</strong> {{ finish: "Finish", time: "Zielzeit", pb: "Bestzeit", distance: "Distanz maximieren", training: "Vorbereitung" }[item.goalType] || item.goalType}{targetSeconds ? ` · ${formatGoalDuration(targetSeconds)}${targetPace ? ` · ${targetPace} min/km` : ""}` : ""} · Priorität {item.priority || (item.isMainTarget ? "A" : "B")}</p>}{Number(item.elevationGain || 0) > 0 && <p><strong>Profil:</strong> {item.elevationGain} hm aufwärts · {item.surface || "gemischt"}</p>}
        {courseProfile.courseType !== "unspecified" && <p><strong>Strecke:</strong> {courseTypeLabel(courseProfile.courseType)}{courseProfile.loopKm ? ` · ${String(courseProfile.loopKm).replace(".", ",")} km je Runde` : ""}{courseProfile.courseType === "loop" ? ` · ${loopModeLabel(courseProfile.loopMode)}` : ""}{courseProfile.aidStationMode !== "unspecified" ? ` · ${aidStationLabel(courseProfile.aidStationMode)}` : ""}</p>}
        {courseProfile.loopMode === LOOP_MODES.FIXED_INTERVAL && <div className="mission-loop-plan"><span><small>Rundenstart</small><strong>alle {courseProfile.loopIntervalMinutes} Minuten</strong></span><span><small>Garmin-Steuerung</small><strong>manuell per LAP</strong></span></div>}
        {matchPlan && <div className="mission-loop-plan match-plan">
          <span><small>Zeitlimit</small><strong>{formatLoopDuration(matchPlan.timeLimitMinutes, { compact: true })}</strong></span>
          <span><small>Rundenbudget</small><strong>{formatLoopDuration(matchPlan.averageLoopBudgetMinutes)}</strong></span>
          <span><small>Boxenstopp</small><strong>{String(matchPlan.plannedStopMinutes).replace(".", ",")} min</strong></span>
          <span><small>Laufbudget je Runde</small><strong>{formatLoopDuration(matchPlan.runBudgetMinutes)}</strong></span>
          <span><small>Späteste Ø-Pace ohne Puffer</small><strong>{matchPlan.requiredPace}/km</strong></span>
          <span><small>Rundenziel</small><strong>{matchPlan.targetLoops} Runden · {String(matchPlan.plannedDistanceKm).replace(".", ",")} km</strong></span>
          <p>Die Pace ist die rechnerische Obergrenze ohne Sicherheitspuffer und wird nicht automatisch an Garmin gesendet. Runde und Boxenstopp enden erst durch deine LAP-Taste.</p>
        </div>}
        {item.isMainTarget && <p><strong>Vorbereitung ab:</strong> {fmtDate(item.preparationStartDate || preparationStartDate)}</p>}
        <div className="event-actions">
          {!archived && <button onClick={() => edit(item)}>Bearbeiten</button>}
          <button onClick={() => archive(item.id)}>{archived ? "Reaktivieren" : "Archivieren"}</button>
          <button className="danger-button" onClick={() => remove(item.id)}>Löschen</button>
          {!archived && item.location && <button onClick={() => loadForecast(item)}>Wetter prüfen</button>}
        </div>
        {forecast?.loading && <p className="muted">Wetter wird geladen …</p>}
        {forecast?.error && <p className="bad">{forecast.error}</p>}
        {forecast?.unavailable && <div className="event-weather"><b>Wetterprognose</b><p>{forecast.reason}</p></div>}
        {forecast && !forecast.loading && !forecast.error && !forecast.unavailable && <div className="event-weather"><b>Prognose für {forecast.place}</b><p>{forecast.condition} · {forecast.min}–{forecast.max} °C · Regen {forecast.rainChance}% · Wind {forecast.wind} km/h</p><p><strong>Planung:</strong> {buildEventAdvice(forecast)}</p></div>}
      </Card>
    );
  }

  return (
    <>
      <PageTitle eyebrow="Training" title="Ziele">
        <button className="mission-add-button" onClick={() => {
          setEditingId(null);
          setDraft(emptyEvent);
          setEventSearchQuery("");
          setShowEditor(true);
        }}>+ Meilenstein / Event</button>
      </PageTitle>
      <TrainingSectionNav />
      <div className="grid mission-grid">
        {mainTarget && (
          <Card className="hero wide mission-main-hero">
            <div className="mission-main-heading">
              <div>
                <p className="eyebrow">Hauptziel</p>
                <h2>{mainTarget.name}</h2>
                <p className="mission-location">📍 {mainTarget.location || "Noch kein Ort hinterlegt"}</p>
              </div>
              <button onClick={() => edit(mainTarget)}>Hauptziel bearbeiten</button>
            </div>
            <div className="hero-stats mission-hero-stats">
              <Metric label="Ziel" value={`${mainTarget.targetKm || state.mission.targetKm || 0} km`} />
              <Metric label="Countdown" value={`${daysUntil(mainTarget.date)} Tage`} sub={`${fmtDate(mainTarget.date)}${mainTarget.time ? ` · ${mainTarget.time} Uhr` : ""}`} />
              <Metric label="Vorbereitungsumfang" value={`${preparationKm.toFixed(0)} km`} sub={`seit ${fmtDate(preparationStartDate)}`} />
              <Metric label="Laufeinheiten" value={preparationRuns.length} sub="im aktuellen Aufbau" />
            </div>
            {mainCourseProfile.loopMode === LOOP_MODES.FIXED_INTERVAL && <div className="mission-loop-plan mission-main-loop-plan"><span><small>Rundenformat</small><strong>{loopModeLabel(mainCourseProfile.loopMode)}</strong></span><span><small>Rundenstart</small><strong>alle {mainCourseProfile.loopIntervalMinutes} Minuten</strong></span><span><small>Garmin</small><strong>Runde & Pause per LAP</strong></span></div>}
            {mainLoopMatchPlan && <div className="mission-loop-plan match-plan mission-main-loop-plan">
              <span><small>Zeitlimit</small><strong>{formatLoopDuration(mainLoopMatchPlan.timeLimitMinutes, { compact: true })}</strong></span>
              <span><small>Rundenlänge</small><strong>{String(mainLoopMatchPlan.loopKm).replace(".", ",")} km</strong></span>
              <span><small>Budget je Runde</small><strong>{formatLoopDuration(mainLoopMatchPlan.averageLoopBudgetMinutes)}</strong></span>
              <span><small>Boxenstopp</small><strong>{String(mainLoopMatchPlan.plannedStopMinutes).replace(".", ",")} min</strong></span>
              <span><small>Laufbudget je Runde</small><strong>{formatLoopDuration(mainLoopMatchPlan.runBudgetMinutes)}</strong></span>
              <span><small>Späteste Ø-Pace ohne Puffer</small><strong>{mainLoopMatchPlan.requiredPace}/km</strong></span>
              <p>{mainLoopMatchPlan.targetLoops} offizielle Runden ergeben {String(mainLoopMatchPlan.plannedDistanceKm).replace(".", ",")} km{Math.abs(mainLoopMatchPlan.distanceDeltaKm) >= 0.05 ? ` und bilden dein ${String(mainLoopMatchPlan.targetKm).replace(".", ",")}-km-Ziel damit praxisnah ab` : ""}. Die angezeigte Pace ist die rechnerische Obergrenze ohne Sicherheitspuffer. Garmin beendet keine Runde automatisch nach GPS-Distanz; der offizielle Rundenpunkt und deine LAP-Taste entscheiden.</p>
            </div>}
          </Card>
        )}

        {!mainTarget && !showEditor && (
          <Card className="hero wide mission-empty-state">
            <p className="eyebrow">Deine Mission</p>
            <h2>Noch kein Hauptziel hinterlegt</h2>
            <p className="muted">Lege dein persönliches Ziel, das Datum und optional eine Distanz fest. Coach, Analyse und künftige Wochenplanungen richten sich danach aus.</p>
            <button type="button" className="primary compact-primary" onClick={() => { setEditingId(null); setDraft({ ...emptyEvent, isMainTarget: true, priority: "A" }); setEventSearchQuery(""); setShowEditor(true); }}>Hauptziel anlegen</button>
          </Card>
        )}

        {showEditor && <EditorModal
          eyebrow="Meilenstein & Event"
          title={editingId ? "Eintrag bearbeiten" : "Neuen Eintrag hinzufügen"}
          description="Event suchen oder manuell anlegen. Änderungen werden erst mit dem Speichern übernommen."
          width="xl"
          className="mission-editor-modal"
          onClose={() => { setShowEditor(false); setEditingId(null); setDraft(emptyEvent); setEventSearchQuery(""); }}
        >
          <form className="editor-form mission-editor" onSubmit={save}>
            <label className="event-search-field">Event suchen
              <EventAutocomplete
                value={eventSearchQuery}
                onChange={setEventSearchQuery}
                onSelect={selectEventSuggestion}
                placeholder={draft.eventCatalogId ? "Anderes veröffentlichtes Event suchen …" : "Name oder Ort eingeben …"}
                inputProps={{ maxLength: 100 }}
              />
              <small>Suche unabhängig vom gespeicherten Eventnamen nach Veranstaltung oder Ort. Ein Treffer übernimmt nur bekannte Angaben; alles bleibt danach editierbar.</small>
            </label>
            <label>Eventname<input name="name" value={draft.name} onChange={change} required maxLength="100" autoComplete="off" /></label>
            {draft.eventCatalogId && <div className={`event-source-card ${draft.eventDataStatus || "verified"}`}>
              <div>
                <span>{eventSourceStatusLabel(draft.eventDataStatus)}</span>
                <strong>{draft.eventSourceName}</strong>
                {draft.eventSourceDetails && <small>{draft.eventSourceDetails}</small>}
                {draft.eventVerifiedAt && <small>Zuletzt geprüft am {fmtDate(draft.eventVerifiedAt)}.</small>}
              </div>
              {draft.eventSourceUrl && <a href={draft.eventSourceUrl} target="_blank" rel="noreferrer">Quelle öffnen ↗</a>}
            </div>}
            <label>Datum<input name="date" type="date" value={draft.date} onChange={change} required /></label>
            <label>Startzeit (optional)<input name="time" type="time" value={draft.time} onChange={change} /></label>
            <label className="place-field">Ort
              <input name="location" value={draft.location} onChange={change} placeholder="Ort oder Veranstaltungsstätte" autoComplete="off" />
              {draft.place && <small className="place-confirmed">✓ Ort aus OpenStreetMap übernommen</small>}
              {placeStatus && <small className="muted">{placeStatus}</small>}
              {placeSuggestions.length > 0 && <div className="place-suggestions" role="listbox" aria-label="Ortsvorschläge">{placeSuggestions.map((place) => <button key={place.id} type="button" role="option" aria-selected="false" onClick={() => selectPlace(place)}><strong>{place.name}</strong><span>{placeSuggestionSubtitle(place)}</span></button>)}</div>}
            </label>
            <label>Zieldistanz (km)<input name="targetKm" type="number" min="0" step="0.1" value={draft.targetKm} onChange={change} /></label>
            <label>Zielprofil<select name="goalDiscipline" value={draft.goalDiscipline} onChange={change}>{GOAL_DISCIPLINE_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select><small>Bei „automatisch“ nutzt der Coach Distanz, Name und Streckenformat.</small></label>
            <label>Zielart<select name="goalType" value={draft.goalType} onChange={change}><option value="finish">Teilnehmen und schaffen</option><option value="time">Mit Zielzeit absolvieren</option><option value="pb">Persönliche Bestzeit</option><option value="distance">Distanz / Zeit maximieren</option><option value="training">Trainings- oder Vorbereitungsevent</option></select></label>
            {(draft.goalType === "time" || draft.goalType === "pb") && <label>Zielzeit (hh:mm:ss)<input name="targetTime" type="text" inputMode="numeric" pattern="[0-9]{1,3}:[0-5][0-9]:[0-5][0-9]" placeholder="02:00:00" value={draft.targetTime} onChange={change} required /><small>5 km in 25 Minuten: 00:25:00 · Halbmarathon in 2 Stunden: 02:00:00</small></label>}
            <label>Priorität<select name="priority" value={draft.priority} onChange={change}><option value="A">A · Hauptevent</option><option value="B">B · wichtiges Zwischenziel</option><option value="C">C · Trainingswettkampf</option></select></label>
            <label>Höhenmeter aufwärts<input name="elevationGain" type="number" min="0" value={draft.elevationGain} onChange={change} /></label>
            <label>Höhenmeter abwärts<input name="elevationLoss" type="number" min="0" value={draft.elevationLoss} onChange={change} /></label>
            <label>Untergrund<select name="surface" value={draft.surface} onChange={change}><option value="road">Straße</option><option value="trail">Trail</option><option value="mixed">Gemischt</option><option value="track">Bahn</option></select></label>
            <label>Streckenformat<select name="courseType" value={draft.courseType} onChange={change}><option value="unspecified">Noch offen / nicht relevant</option><option value="loop">Rundenkurs</option><option value="out_and_back">Hin und zurück</option><option value="point_to_point">A nach B</option></select><small>Damit erkennt dein Coach, welche Abläufe im Training geprobt werden sollen.</small></label>
            {draft.courseType === "loop" && <>
              <label>Rundenlänge (km)<input name="loopKm" type="number" min="0.1" step="0.1" value={draft.loopKm} onChange={change} required /><small>Backyard: 6,7 km. Heartbeat Ultra: 6,2 km. Die Distanz dient der Planung, nicht als automatischer Garmin-Rundenabschluss.</small></label>
              <label>Rundenformat<select name="loopMode" value={draft.loopMode} onChange={change}><option value={LOOP_MODES.FIXED_INTERVAL}>Fester Starttakt · Backyard</option><option value={LOOP_MODES.TIME_LIMIT}>Gesamtzeitlimit · Stunden-/Heartbeat-Lauf</option><option value={LOOP_MODES.FREE}>Freier Rundkurs</option></select><small>Der Coach nutzt je nach Format eine andere Pausen- und Matchplan-Logik.</small></label>
              {draft.loopMode === LOOP_MODES.FIXED_INTERVAL && <label>Starttakt je Runde (Minuten)<input name="loopIntervalMinutes" type="number" min="10" max="240" step="1" value={draft.loopIntervalMinutes} onChange={change} required /><small>Beim Backyard normalerweise 60 Minuten.</small></label>}
              {draft.loopMode === LOOP_MODES.TIME_LIMIT && <>
                <label>Gesamtzeitlimit (hh:mm:ss)<input name="eventTimeLimit" type="text" inputMode="numeric" pattern="[0-9]{1,3}:[0-5][0-9]:[0-5][0-9]" placeholder="14:00:00" value={draft.eventTimeLimit} onChange={change} required /><small>Das ist das Zeitbudget des Events, nicht die Laufzeit einer einzelnen Runde.</small></label>
                <label>Geplanter Boxenstopp je Runde (Minuten)<input name="plannedStopMinutes" type="number" min="0" max="60" step="0.5" value={draft.plannedStopMinutes} onChange={change} /><small>Dient dem Matchplan; auf Garmin bleibt die Pause trotzdem bis zur LAP-Taste offen.</small></label>
              </>}
            </> }
            <label>Versorgung im Event<select name="aidStationMode" value={draft.aidStationMode} onChange={change}><option value="unspecified">Noch offen / nicht relevant</option><option value="every_loop">Verpflegung nach jeder Runde</option><option value="fixed_stations">Feste Verpflegungspunkte</option><option value="self_supported">Selbstversorgung / alles mitnehmen</option></select></label>
            <label className="wide-field">Rolle im Aufbau<input name="role" value={draft.role} onChange={change} placeholder="z. B. kontrollierter Trainingswettkampf" /></label>
            {draft.isMainTarget && <label>Vorbereitung ab<input name="preparationStartDate" type="date" value={draft.preparationStartDate} onChange={change} /></label>}
            <label className="checkbox-label"><input name="isMainTarget" type="checkbox" checked={draft.isMainTarget} onChange={change} /> Als Hauptziel markieren</label>
            <button className="primary" type="submit">{editingId ? "Änderung speichern" : "Event hinzufügen"}</button>
            {editingId && <button type="button" onClick={() => { setEditingId(null); setDraft(emptyEvent); setEventSearchQuery(""); setShowEditor(false); }}>Abbrechen</button>}
          </form>
        </EditorModal>}

        {goalPath.length > 0 && <Card className="wide mission-goal-path">
          <div className="mission-goal-path-heading">
            <p className="eyebrow">Auf dem Weg zum Hauptziel</p>
            <h2>{mainTarget ? `Nächste Stationen bis ${mainTarget.name}` : "Nächste Stationen"}</h2>
          </div>
          <div className="mission-goal-path-list">
            {goalPath.map((item) => {
              const days = daysUntil(item.date);
              const role = item.isMainTarget ? "Hauptziel" : `${item.priority || "B"}-Event`;
              const priorityClass = item.isMainTarget ? "main" : `priority-${String(item.priority || "B").toLowerCase()}`;
              return <article className={`mission-goal-path-item ${priorityClass}`} key={item.id}>
                <time dateTime={item.date}>{eventDateLabel(item.date)}</time>
                <div className="mission-goal-path-copy">
                  <div className="mission-goal-path-title"><h3>{item.name}</h3>{item.isMainTarget && <span>★ Hauptziel</span>}</div>
                  <div className="mission-goal-path-meta"><span>{role}</span><span>{days} {days === 1 ? "Tag" : "Tage"}</span></div>
                  {timelineWeather(item)}
                </div>
                <button type="button" className="mission-goal-path-details" onClick={() => setSelectedMilestoneId(item.id)}>Details <span aria-hidden="true">→</span></button>
              </article>;
            })}
          </div>
        </Card>}

        {selectedMilestone && <EditorModal
          eyebrow={selectedMilestone.isMainTarget ? "Hauptziel" : "Meilenstein"}
          title={selectedMilestone.name}
          description={`${fmtDate(selectedMilestone.date)}${selectedMilestone.time ? ` · ${selectedMilestone.time} Uhr` : ""}`}
          width="wide"
          className="mission-goal-path-modal"
          onClose={() => setSelectedMilestoneId(null)}
        >
          <div className="mission-goal-path-detail">{eventCard(selectedMilestone)}</div>
        </EditorModal>}

        <Card className="wide">
          <div className="card-heading-row"><div><p className="eyebrow">Achievements</p><h2>Absolvierte offizielle Läufe</h2></div><span className="achievement-count">{achievements.length}</span></div>
          {achievements.length === 0 ? <p className="muted">Offizielle Läufe werden aus Garmin-Daten oder einer als „Event“ markierten Review erkannt.</p> : (
            <>
              <div className="achievement-grid">
                {(showAllAchievements ? achievements : achievements.slice(0, 3)).map((achievement) => (
                  <article className="achievement-card" key={achievement.id}>
                    <span>{achievement.category}</span>
                    <h3>{achievement.title}</h3>
                    <p>{fmtDate(achievement.date)}{achievement.location ? ` · ${achievement.location}` : ""}</p>
                    <strong>{achievement.distance.toFixed(1)} km · {achievement.duration}</strong>
                    {achievement.spontaneous && <small>Spontan über Review als Event markiert</small>}
                  </article>
                ))}
              </div>
              {achievements.length > 3 && <button type="button" className="mission-achievement-toggle" onClick={() => setShowAllAchievements((value) => !value)}>{showAllAchievements ? "Meilensteine einklappen" : `Alle ${achievements.length} Erfolge anzeigen`}</button>}
            </>
          )}
        </Card>

        {archivedMilestones.length > 0 && <Card className="wide"><div className="archive-heading"><div><p className="eyebrow">Archiv</p><h2>Archivierte Events</h2></div><button onClick={() => setShowArchived((value) => !value)}>{showArchived ? "Ausblenden" : `Anzeigen (${archivedMilestones.length})`}</button></div>{showArchived && <div className="archive-grid">{archivedMilestones.map((item) => eventCard(item, true))}</div>}</Card>}
      </div>
    </>
  );
}
