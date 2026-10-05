import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, PageTitle } from "../components/UI";
import RaceCoach from "../components/RaceCoach";
import { useApp } from "../context/AppContext";
import {
  aidStationSegments,
  buildRacePhases,
  compactNumber,
  defaultRaceSupplyPlan,
  normalizeRaceSupplyPlan,
  officialRaceDistance,
  raceDurationHours,
  raceEventKey,
  raceEventsFromState,
  raceFormatLabel,
  raceFuelTargets,
  raceLoopDistance,
  resourceLabel,
  resourceOptions,
  supplyModeCopy,
} from "../services/raceIntelligence";
import "./Race.css";

const tabs = [
  ["strategy", "Strategie & Strecke"],
  ["fuel", "Verpflegung & VP"],
];

function eventLabel(event) {
  return event?.name || event?.title || "Rennen";
}

function RaceNutrition({ event }) {
  const { state, setState } = useApp();
  const key = raceEventKey(event);
  const stored = state.racePlanningByEvent?.[key];
  const supply = normalizeRaceSupplyPlan(stored?.supply || defaultRaceSupplyPlan());
  const temperatureC = stored?.temperatureC ?? null;
  const targets = useMemo(
    () => raceFuelTargets({ event, state, temperatureC }),
    [event, state, temperatureC],
  );
  const phases = useMemo(
    () => buildRacePhases({ event, state, temperatureC }),
    [event, state, temperatureC],
  );
  const segments = aidStationSegments(event, supply);
  const resources = resourceOptions();

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
          <article><span>Trinkorientierung</span><strong>{targets.hydration.label}</strong><small>{targets.hydration.reason}</small></article>
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
        <div><strong>Fuel Lab bleibt das Labor.</strong><span>Produkte, Verträglichkeit und Trainingsreviews werden dort gepflegt. Race Intelligence nutzt diese Evidenz für den konkreten Renntag.</span></div>
        <Link to="/fuel">Fuel Lab öffnen →</Link>
      </Card>
    </div>
  );
}

export default function Race() {
  const { state } = useApp();
  const events = useMemo(() => raceEventsFromState(state), [state]);
  const [activeTab, setActiveTab] = useState("strategy");
  const [selectedKey, setSelectedKey] = useState(() => raceEventKey(events[0] || {}));
  const selected = events.find((event, index) => raceEventKey(event, index) === selectedKey) || events[0] || null;

  return (
    <>
      <PageTitle eyebrow="Race Intelligence" title="Race" />
      <div className="race-hub-head">
        <div className="section-tabs race-hub-tabs" role="tablist" aria-label="Race-Bereiche">
          {tabs.map(([key, label]) => <button type="button" className={activeTab === key ? "selected" : ""} onClick={() => setActiveTab(key)} key={key}>{label}</button>)}
        </div>
        {activeTab === "fuel" && events.length > 0 && (
          <label className="race-event-select">Rennen
            <select value={raceEventKey(selected)} onChange={(event) => setSelectedKey(event.target.value)}>
              {events.map((item, index) => <option value={raceEventKey(item, index)} key={raceEventKey(item, index)}>{eventLabel(item)}{item.date ? ` · ${item.date}` : ""}</option>)}
            </select>
          </label>
        )}
      </div>

      {activeTab === "strategy" && <RaceCoach />}

      {activeTab === "fuel" && (
        selected
          ? <RaceNutrition event={selected} />
          : <Card className="wide"><p className="eyebrow">Race Intelligence</p><h2>Noch kein Zielrennen hinterlegt</h2><p className="muted">Lege unter Ziele ein Rennen an. Danach verbindet Race Strecke, Strategie, Fuel, VPs und Wetter.</p><Link className="button-link" to="/mission">Ziel anlegen →</Link></Card>
      )}
    </>
  );
}
