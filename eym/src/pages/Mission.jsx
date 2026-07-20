import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../context/AppContext";
import { Card, PageTitle, Metric } from "../components/UI";
import { daysUntil, fmtDate } from "../utils/format";
import { buildEventAdvice, fetchEventForecast } from "../services/eventWeather";
import { searchPlaces } from "../services/placeSearch";
import { deriveAchievements } from "../services/achievements";
import { activityDate, isRunningActivity, preferredActivities } from "../services/activityUtils";

const emptyEvent = {
  name: "",
  date: "",
  location: "",
  place: null,
  targetKm: "",
  preparationStartDate: "",
  isMainTarget: false,
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
  const [forecasts, setForecasts] = useState({});
  const [showArchived, setShowArchived] = useState(false);
  const [placeSuggestions, setPlaceSuggestions] = useState([]);
  const [placeStatus, setPlaceStatus] = useState("");
  const placeRequest = useRef(null);

  const activities = useMemo(() => preferredActivities(state.activities), [state.activities]);
  const achievements = useMemo(() => deriveAchievements(activities, state.reviews), [activities, state.reviews]);
  const hermann2026 = achievements.find((item) => /hermannslauf/i.test(item.title) && item.date.startsWith("2026"));
  const preparationStartDate = state.mission.preparationStartDate || (hermann2026 ? nextDay(hermann2026.date) : "2026-04-27");
  const preparationRuns = useMemo(() => activities.filter((activity) => isRunningActivity(activity) && activityDate(activity) >= preparationStartDate), [activities, preparationStartDate]);
  const preparationKm = preparationRuns.reduce((sum, activity) => sum + Number(activity.distance || 0), 0);

  const milestones = useMemo(() => {
    const values = Array.isArray(state.mission.milestones) ? state.mission.milestones : [];
    if (values.some((item) => item.id === state.mission.id || item.isMainTarget)) return values;
    return [...values, {
      id: state.mission.id,
      name: state.mission.name,
      date: state.mission.date,
      location: state.mission.location || "",
      targetKm: state.mission.targetKm || 0,
      preparationStartDate,
      isMainTarget: true,
      archived: false,
    }];
  }, [state.mission, preparationStartDate]);

  const activeMilestones = milestones.filter((item) => !item.archived);
  const mainTarget = activeMilestones.find((item) => item.isMainTarget) || activeMilestones[0];
  const upcomingMilestones = activeMilestones.filter((item) => item.id !== mainTarget?.id);
  const archivedMilestones = milestones.filter((item) => item.archived);

  function change(event) {
    const { name, value, type, checked } = event.target;
    setDraft((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
      ...(name === "location" ? { place: null } : {}),
    }));
  }

  useEffect(() => {
    const query = draft.location.trim();
    if (draft.place || query.length < 3) {
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
  }, [draft.location, draft.place]);

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
        location: draft.location.trim(),
        place: draft.place,
        targetKm: draft.targetKm === "" ? null : Number(draft.targetKm),
        preparationStartDate: draft.preparationStartDate || null,
        isMainTarget: Boolean(draft.isMainTarget),
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
          location: mainTarget.location || "",
          targetKm: Number(mainTarget.targetKm) || 0,
          preparationStartDate: mainTarget.preparationStartDate || current.mission.preparationStartDate || preparationStartDate,
          milestones: next,
        },
      };
    });

    setDraft(emptyEvent);
    setEditingId(null);
    setShowEditor(false);
  }

  function edit(item) {
    setEditingId(item.id);
    setDraft({
      name: item.name,
      date: item.date,
      location: item.location || "",
      place: item.place || null,
      targetKm: item.targetKm ?? "",
      preparationStartDate: item.preparationStartDate ?? "",
      isMainTarget: Boolean(item.isMainTarget),
    });
    setShowEditor(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
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
            location: mainTarget.location || "",
            targetKm: Number(mainTarget.targetKm) || 0,
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
            location: mainTarget.location || "",
            targetKm: Number(mainTarget.targetKm) || 0,
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

  function eventCard(item, archived = false) {
    const forecast = forecasts[item.id];
    return (
      <Card key={item.id} className={item.isMainTarget ? "main-target-card" : ""}>
        <div className="card-heading-row">
          <div><p className="eyebrow">{item.isMainTarget ? "Hauptziel" : archived ? "Archiviert" : "Meilenstein"}</p><h2>{item.name}</h2></div>
          {item.isMainTarget && <span className="main-target-badge">Hauptziel</span>}
        </div>
        <p>{fmtDate(item.date)} · noch {daysUntil(item.date)} Tage</p>
        <p className="muted">{item.location || "Noch kein Ort hinterlegt"}</p>
        {item.targetKm ? <p><strong>Ziel:</strong> {item.targetKm} km</p> : null}
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
      <PageTitle eyebrow="Mission Control" title="Mission Control">
        <button className="mission-add-button" onClick={() => {
          setEditingId(null);
          setDraft(emptyEvent);
          setShowEditor((value) => !value);
        }}>+ Meilenstein / Event</button>
      </PageTitle>
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
              <Metric label="Countdown" value={`${daysUntil(mainTarget.date)} Tage`} sub={fmtDate(mainTarget.date)} />
              <Metric label="Fulda-Vorbereitung" value={`${preparationKm.toFixed(0)} km`} sub={`seit ${fmtDate(preparationStartDate)}`} />
              <Metric label="Laufeinheiten" value={preparationRuns.length} sub="seit Hermannslauf" />
            </div>
          </Card>
        )}

        {showEditor && <Card className="wide mission-editor-card">
          <div className="card-heading-row">
            <div><p className="eyebrow">Meilenstein & Event</p><h2>{editingId ? "Eintrag bearbeiten" : "Neuen Eintrag hinzufügen"}</h2></div>
            <button type="button" onClick={() => { setShowEditor(false); setEditingId(null); setDraft(emptyEvent); }}>Schließen</button>
          </div>
          <form className="editor-form mission-editor" onSubmit={save}>
            <label>Event<input name="name" value={draft.name} onChange={change} placeholder="Backyard Ultra" required /></label>
            <label>Datum<input name="date" type="date" value={draft.date} onChange={change} required /></label>
            <label className="place-field">Ort
              <input name="location" value={draft.location} onChange={change} placeholder="Sportpark Johannisau, Fulda" autoComplete="off" />
              {draft.place && <small className="place-confirmed">✓ Ort aus OpenStreetMap übernommen</small>}
              {placeStatus && <small className="muted">{placeStatus}</small>}
              {placeSuggestions.length > 0 && <div className="place-suggestions" role="listbox" aria-label="Ortsvorschläge">{placeSuggestions.map((place) => <button key={place.id} type="button" onClick={() => selectPlace(place)}><strong>{place.name}</strong><span>{place.label}</span></button>)}</div>}
            </label>
            <label>Zieldistanz (km)<input name="targetKm" type="number" min="0" step="0.1" value={draft.targetKm} onChange={change} /></label>
            {draft.isMainTarget && <label>Vorbereitung ab<input name="preparationStartDate" type="date" value={draft.preparationStartDate} onChange={change} /></label>}
            <label className="checkbox-label"><input name="isMainTarget" type="checkbox" checked={draft.isMainTarget} onChange={change} /> Als Hauptziel markieren</label>
            <button className="primary" type="submit">{editingId ? "Änderung speichern" : "Event hinzufügen"}</button>
            {editingId && <button type="button" onClick={() => { setEditingId(null); setDraft(emptyEvent); setShowEditor(false); }}>Abbrechen</button>}
          </form>
        </Card>}

        {upcomingMilestones.length > 0 && <Card className="wide mission-upcoming-section">
          <div className="card-heading-row"><div><p className="eyebrow">Nächste Meilensteine</p><h2>Auf dem Weg nach Fulda</h2></div><span className="achievement-count">{upcomingMilestones.length}</span></div>
          <div className="mission-event-grid">{upcomingMilestones.map((item) => eventCard(item))}</div>
        </Card>}

        <Card className="wide">
          <div className="card-heading-row"><div><p className="eyebrow">Achievements</p><h2>Absolvierte offizielle Läufe</h2></div><span className="achievement-count">{achievements.length}</span></div>
          {achievements.length === 0 ? <p className="muted">Offizielle Läufe werden aus Garmin-Daten oder einer als „Event“ markierten Review erkannt.</p> : (
            <div className="achievement-grid">
              {achievements.map((achievement) => (
                <article className="achievement-card" key={achievement.id}>
                  <span>{achievement.category}</span>
                  <h3>{achievement.title}</h3>
                  <p>{fmtDate(achievement.date)}{achievement.location ? ` · ${achievement.location}` : ""}</p>
                  <strong>{achievement.distance.toFixed(1)} km · {achievement.duration}</strong>
                  {achievement.spontaneous && <small>Spontan über Review als Event markiert</small>}
                </article>
              ))}
            </div>
          )}
        </Card>

        {archivedMilestones.length > 0 && <Card className="wide"><div className="archive-heading"><div><p className="eyebrow">Archiv</p><h2>Archivierte Events</h2></div><button onClick={() => setShowArchived((value) => !value)}>{showArchived ? "Ausblenden" : `Anzeigen (${archivedMilestones.length})`}</button></div>{showArchived && <div className="archive-grid">{archivedMilestones.map((item) => eventCard(item, true))}</div>}</Card>}
      </div>
    </>
  );
}
