import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, PageTitle } from "../components/UI";
import RaceCoach from "../components/RaceCoach";
import RacePrepPlanner from "../components/RacePrepPlanner";
import RaceWeatherStrategy from "../components/RaceWeatherStrategy";
import { useApp } from "../context/AppContext";
import {
  aidStationSegments,
  buildRacePhases,
  buildRaceFuelRotation,
  compactNumber,
  defaultRaceSupplyPlan,
  normalizeRaceSupplyPlan,
  officialRaceDistance,
  raceDurationHours,
  raceEventKey,
  raceEventsFromState,
  raceFormatLabel,
  raceFuelTargets,
  raceGelOptions,
  raceLoopDistance,
  raceRoundCount,
  resourceLabel,
  resourceOptions,
  supplyModeCopy,
} from "../services/raceIntelligence";
import { fetchRaceWeatherForecast, raceForecastConfidence, resolveRaceWeatherDuration } from "../services/raceWeatherStrategy";
import "./Race.css";

const tabs = [
  ["setup", "Rennbasis"],
  ["strategy", "Strategie & Strecke"],
  ["fuel", "Verpflegung & VP"],
  ["weather", "Wetter"],
];

function eventLabel(event) {
  return event?.name || event?.title || "Rennen";
}

function RaceNutrition({ event }) {
  const { state, setState } = useApp();
  const key = raceEventKey(event);
  const stored = state.racePlanningByEvent?.[key];
  const supply = normalizeRaceSupplyPlan(stored?.supply || defaultRaceSupplyPlan());
  const [forecastTemperature, setForecastTemperature] = useState({ key: "", value: null });
  const forecastTemperatureC = forecastTemperature.key === key ? forecastTemperature.value : null;
  const temperatureC = forecastTemperatureC ?? stored?.temperatureC ?? null;
  const targets = useMemo(
    () => raceFuelTargets({ event, state, temperatureC }),
    [event, state, temperatureC],
  );
  const phases = useMemo(
    () => buildRacePhases({ event, state, temperatureC }),
    [event, state, temperatureC],
  );
  const segments = aidStationSegments(event, supply, state, temperatureC);
  const resources = resourceOptions();
  const gelOptions = useMemo(() => raceGelOptions(), []);
  const fuelRotation = buildRaceFuelRotation({ event, state, supply, temperatureC });

  useEffect(() => {
    const confidence = raceForecastConfidence(event?.date);
    if (!event?.date || !event?.time || ["missing", "too-early"].includes(confidence.key)) return undefined;
    let active = true;
    const duration = resolveRaceWeatherDuration({ race: event, targetDurationMinutes: raceDurationHours(event) * 60 });
    fetchRaceWeatherForecast({ race: event, raceDistanceKm: officialRaceDistance(event), targetDurationMinutes: duration.minutes })
      .then((result) => {
        if (!active || result.status !== "ready") return;
        const values = result.forecasts.flatMap((forecast) => forecast.rows || [])
          .filter((row) => row.epoch >= result.startEpoch && row.epoch <= result.endEpoch)
          .map((row) => Number(row.temperature))
          .filter(Number.isFinite);
        if (values.length) setForecastTemperature({ key, value: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) });
      })
      .catch(() => { if (active) setForecastTemperature({ key, value: null }); });
    return () => { active = false; };
  }, [event, key]);

  function updatePlan(patch) {
    setState((current) => {
      const currentRace = current.racePlanningByEvent?.[key] || {};
      return {
        ...current,
        racePlanningByEvent: {
          ...(current.racePlanningByEvent || {}),
          [key]: { ...currentRace, ...patch },
        },
      };
    });
  }

  function updateSupply(patch) {
    updatePlan({ supply: normalizeRaceSupplyPlan({ ...supply, ...patch }) });
  }

  function toggleOrganizerResource(resource) {
    const next = supply.organizerResources.includes(resource)
      ? supply.organizerResources.filter((item) => item !== resource)
      : [...supply.organizerResources, resource];
    updateSupply({ organizerResources: next });
  }

  function moveGelPriority(productId, direction) {
    const current = [...supply.gelPriority];
    const index = current.indexOf(productId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return;
    [current[index], current[nextIndex]] = [current[nextIndex], current[index]];
    updateSupply({ gelPriority: current });
  }

  function addStation() {
    const nextIndex = supply.aidStations.length + 1;
    let stationId = nextIndex;
    while (supply.aidStations.some((station) => station.id === `vp-${stationId}`)) stationId += 1;
    updateSupply({
      aidStations: [
        ...supply.aidStations,
        { id: `vp-${stationId}`, km: 0, name: `VP ${nextIndex}`, resources: [], note: "" },
      ],
    });
  }

  function updateStation(id, patch) {
    updateSupply({
      aidStations: supply.aidStations.map((station) => station.id === id ? { ...station, ...patch } : station),
    });
  }

  function removeStation(id) {
    updateSupply({ aidStations: supply.aidStations.filter((station) => station.id !== id) });
  }

  function toggleStationResource(station, resource) {
    const current = station.resources || [];
    updateStation(station.id, {
      resources: current.includes(resource)
        ? current.filter((item) => item !== resource)
        : [...current, resource],
    });
  }

  const distance = officialRaceDistance(event);
  const loop = raceLoopDistance(event);
  const hours = raceDurationHours(event);
  const rounds = raceRoundCount(event);
  const finalLoopKm = rounds > 0 && loop > 0 && distance > 0 ? Math.max(0, distance - loop * (rounds - 1)) : 0;

  return (
    <div className="race-intelligence-stack">
      <Card className="wide race-intel-hero">
        <div>
          <p className="eyebrow">Race Nutrition Intelligence</p>
          <h2>Richtwerte statt Trinkpflicht.</h2>
          <p>Eigene, getestete Gels sind die Basis. Veranstalterversorgung ist eine Ressource – und wird nur eingeplant, wenn du sie freigibst.</p>
        </div>
        <div className="race-intel-targets">
          <article><span>KH-Korridor</span><strong>{targets.carbs.label}</strong><small>{targets.carbs.reason}</small></article>
          <article><span>Trinkorientierung</span><strong>{targets.hydration.label}</strong><small>{targets.hydration.reason}{temperatureC != null ? ` · Rennwetter ca. ${temperatureC} °C eingerechnet.` : ""}</small></article>
        </div>
      </Card>

      <Card className="wide">
        <div className="race-intel-heading">
          <div><p className="eyebrow">Rennbasis</p><h2>{eventLabel(event)}</h2></div>
          <span>{raceFormatLabel(event)}</span>
        </div>
        <div className="race-intel-facts">
          <span><b>{distance ? `${compactNumber(distance)} km` : "offen"}</b> offizielle Distanz</span>
          {loop > 0 && <span><b>{compactNumber(loop, 2)} km</b> Standardrunde</span>}
          {rounds > 0 && <span><b>{rounds}</b> Rennrunden</span>}
          {finalLoopKm > 0 && Math.abs(finalLoopKm - loop) > 0.05 && <span><b>{compactNumber(finalLoopKm, 2)} km</b> rechnerische Schlussrunde</span>}
          {hours > 0 && <span><b>{compactNumber(hours, 1)} h</b> Ziel-/Zeitfenster</span>}
        </div>
        <p className="race-intel-note">
          Die offizielle Renndistanz bleibt führend. Rundenlänge × Rundenzahl darf sie nicht überschreiben – damit werden aus 112 km keine 113,399999999 km.
        </p>
      </Card>

      <Card className="wide">
        <div className="race-intel-heading">
          <div><p className="eyebrow">Versorgungsmodell</p><h2>Woher kommt was?</h2></div>
          <span>{supply.mode === "hybrid" ? "EMPFOHLEN" : "INDIVIDUELL"}</span>
        </div>
        <div className="race-mode-grid">
          {[
            ["own", "Eigene Versorgung", "Box/Crew/Dropbag ist die Hauptquelle."],
            ["hybrid", "Hybrid", "Eigene Gels + gezielte VP-Ressourcen."],
            ["vp", "VP-basiert", "Veranstalterangebot trägt die Versorgung."],
          ].map(([value, label, text]) => (
            <button type="button" className={supply.mode === value ? "selected" : ""} onClick={() => updateSupply({ mode: value })} key={value}>
              <strong>{label}</strong><span>{text}</span>
            </button>
          ))}
        </div>
        <p className="race-intel-note">{supplyModeCopy(supply.mode)}</p>
        <div className="race-resource-box">
          <div><strong>Was darf EI vom Veranstalter einplanen?</strong><span>Eigene erprobte Gels werden nicht extra abgefragt – sie gelten als persönliche Basis.</span></div>
          <div className="race-resource-chips">
            {resources.filter((item) => item.value !== "organizerGel").map((item) => (
              <button type="button" className={supply.organizerResources.includes(item.value) ? "selected" : ""} onClick={() => toggleOrganizerResource(item.value)} key={item.value}>
                {item.label}
              </button>
            ))}
            <button
              type="button"
              className={supply.organizerGelApproved ? "selected warning" : "warning"}
              onClick={() => updateSupply({ organizerGelApproved: !supply.organizerGelApproved })}
            >
              Veranstalter-Gel {supply.organizerGelApproved ? "freigegeben" : "nur Reserve"}
            </button>
          </div>
        </div>
      </Card>

      <Card className="wide race-fuel-priority-card">
        <div className="race-intel-heading">
          <div><p className="eyebrow">Persönliche Fuel-Prio</p><h2>Gel ist ein Werkzeug – nicht der ganze Ernährungsplan.</h2></div>
          <span>GEL-PRIO</span>
        </div>
        <div className="race-fuel-priority-layout">
          <div className="race-gel-priority-list">
            {supply.gelPriority.map((productId, index) => {
              const option = gelOptions.find((item) => item.id === productId);
              return <article key={productId}>
                <b>#{index + 1}</b>
                <span><strong>{option?.label || productId}</strong><small>Wenn ein Gel-Slot sinnvoll ist, startet EI hier – Verträglichkeit und jüngste Nutzung bleiben Teil der Entscheidung.</small></span>
                <div><button type="button" onClick={() => moveGelPriority(productId, -1)} disabled={index === 0} aria-label={`${option?.label || productId} nach oben`}>↑</button><button type="button" onClick={() => moveGelPriority(productId, 1)} disabled={index === supply.gelPriority.length - 1} aria-label={`${option?.label || productId} nach unten`}>↓</button></div>
              </article>;
            })}
          </div>
          <aside className="race-drink-basis">
            <small>DRINK-BASIS</small>
            <strong>Elektrolyt-/Carb-Drink zählt mit.</strong>
            <p>Hydrate & Perform, Long Energy oder eine andere erprobte Drink-Quelle wird als Flüssigkeit <b>und</b> Kohlenhydratquelle gerechnet. Deshalb erzeugt EI nicht zusätzlich für jeden Slot ein Gel.</p>
            <span>{targets.hydration.label} · Orientierung, keine Trinkpflicht pro Runde</span>
          </aside>
        </div>
      </Card>

      <Card className="wide">
        <div className="race-intel-heading">
          <div><p className="eyebrow">Race Blocks</p><h2>Nicht jede Runde bekommt denselben Plan.</h2></div>
          <span>PACE · FUEL · HYDRATION</span>
        </div>
        <div className="race-phase-grid">
          {phases.map((phase) => (
            <article key={phase.key}>
              <small>{phase.title}</small>
              <strong>{phase.label}</strong>
              <span>{phase.effort}</span>
              <b>{phase.carbLabel}</b>
              <em>{phase.hydrationLabel} · Orientierung</em>
              <p>{phase.note}</p>
            </article>
          ))}
        </div>
      </Card>

      {fuelRotation.length > 0 && <Card className="wide race-fuel-rotation-card">
        <div className="race-intel-heading">
          <div><p className="eyebrow">Pit-Crew-Logik</p><h2>Rotation statt Gel-Tapete.</h2></div>
          <span>{fuelRotation.length} RUNDEN</span>
        </div>
        <p className="race-intel-note">Früh echte Nahrung und Drink nutzen, Gel-Slots gezielt nach deiner Prio setzen und Geschmack/Elektrolyte rotieren. Wetter und persönlicher Trinkkorridor verändern die Menge – nicht jede Runde bekommt stumpf dieselben 500 ml.</p>
        <div className="race-fuel-rotation">
          {fuelRotation.map((row) => <article key={row.round}>
            <header><b>Runde {row.round}</b><span>{row.carbs} g KH · {row.fluidMl} ml</span></header>
            <div className="race-fuel-rotation-items">
              {row.items.map((item, index) => <span className={`${item.category} ${item.timing || "now"}`} key={`${item.productId}-${index}`}>
                <small>{(item.timing || "now") === "carry" ? "AUF DIE RUNDE" : "IM PIT"}</small>
                <strong>{item.label}</strong>
                <em>{item.portionLabel}</em>
              </span>)}
            </div>
            <p>{row.why}</p>
          </article>)}
        </div>
      </Card>}

      <Card className="wide">
        <div className="race-intel-heading">
          <div><p className="eyebrow">Verpflegungspunkte</p><h2>VPs bestimmen Carry – nicht nur die Gesamtdistanz.</h2></div>
          <button type="button" onClick={addStation}>+ VP hinzufügen</button>
        </div>

        {supply.aidStations.length === 0 ? (
          <div className="race-empty-vp">
            <strong>Noch keine VPs hinterlegt.</strong>
            <span>Beispiel: km 8 · km 24 · km 38. Danach kann EI Abschnitte und Carry-Bedarf sinnvoll statt pauschal planen.</span>
          </div>
        ) : (
          <div className="race-vp-list">
            {supply.aidStations.map((station) => (
              <article key={station.id}>
                <div className="race-vp-fields">
                  <label>Name<input value={station.name} onChange={(eventChange) => updateStation(station.id, { name: eventChange.target.value })} /></label>
                  <label>km<input type="number" min="0" step="0.1" value={station.km || ""} onChange={(eventChange) => updateStation(station.id, { km: Number(eventChange.target.value) || 0 })} /></label>
                  <button type="button" className="danger" onClick={() => removeStation(station.id)}>Entfernen</button>
                </div>
                <div className="race-resource-chips compact">
                  {resources.map((item) => (
                    <button type="button" className={(station.resources || []).includes(item.value) ? "selected" : ""} onClick={() => toggleStationResource(station, item.value)} key={item.value}>
                      {resourceLabel(item.value)}
                    </button>
                  ))}
                </div>
                <input className="race-vp-note" placeholder="Notiz, Besonderheiten, Dropbag …" value={station.note || ""} onChange={(eventChange) => updateStation(station.id, { note: eventChange.target.value })} />
              </article>
            ))}
          </div>
        )}

        {segments.length > 0 && (
          <div className="race-segment-list">
            {segments.map((segment) => (
              <span key={`${segment.from}-${segment.to}`}><b>{segment.from} → {segment.to}</b>{compactNumber(segment.km)} km · {segment.carryHint}</span>
            ))}
          </div>
        )}
      </Card>

      <Card className="wide race-intel-footnote">
        <div><strong>Fuel Lab bleibt das Labor.</strong><span>Produkte, Bestand und Verträglichkeit werden dort gepflegt. Die konkrete Rennplanung passiert ausschließlich hier in Race.</span></div>
        <Link to="/fuel">Fuel Lab öffnen →</Link>
      </Card>
    </div>
  );
}

export default function Race() {
  const { state } = useApp();
  const events = useMemo(() => raceEventsFromState(state), [state]);
  const [activeTab, setActiveTab] = useState("setup");
  const [selectedKey, setSelectedKey] = useState(() => raceEventKey(events[0] || {}));
  const selected = events.find((event, index) => raceEventKey(event, index) === selectedKey) || events[0] || null;

  return (
    <>
      <PageTitle eyebrow="Race Intelligence" title="Race" />
      <div className="race-hub-head">
        <div className="section-tabs race-hub-tabs" role="tablist" aria-label="Race-Bereiche">
          {tabs.map(([key, label]) => <button type="button" className={activeTab === key ? "selected" : ""} onClick={() => setActiveTab(key)} key={key}>{label}</button>)}
        </div>
        {events.length > 0 && (
          <label className="race-event-select">Rennen
            <select value={raceEventKey(selected)} onChange={(event) => setSelectedKey(event.target.value)}>
              {events.map((item, index) => <option value={raceEventKey(item, index)} key={raceEventKey(item, index)}>{eventLabel(item)}{item.date ? ` · ${item.date}` : ""}</option>)}
            </select>
          </label>
        )}
      </div>

      {activeTab === "setup" && <Card className="wide race-setup-shell"><RacePrepPlanner setupOnly /></Card>}

      {activeTab === "strategy" && <RaceCoach />}

      {activeTab === "fuel" && (
        selected
          ? <RaceNutrition event={selected} />
          : <Card className="wide"><p className="eyebrow">Race Intelligence</p><h2>Noch kein Zielrennen hinterlegt</h2><p className="muted">Lege unter Ziele ein Rennen an. Danach verbindet Race Strecke, Strategie, Fuel, VPs und Wetter.</p><Link className="button-link" to="/mission">Ziel anlegen →</Link></Card>
      )}

      {activeTab === "weather" && (
        selected
          ? <Card className="wide race-weather-hub"><RaceWeatherStrategy race={selected} raceDistanceKm={officialRaceDistance(selected)} targetDurationMinutes={raceDurationHours(selected) * 60} /></Card>
          : <Card className="wide"><p className="eyebrow">Race Weather</p><h2>Noch kein Zielrennen hinterlegt</h2><p className="muted">Ort, Datum und Startzeit werden für eine rennspezifische Stundenprognose benötigt.</p></Card>
      )}
    </>
  );
}
