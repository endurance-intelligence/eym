import { useEffect, useMemo, useRef, useState } from "react";
import {
  assessPitSelection,
  PIT_CREW_PRODUCTS,
  pitTimeMode,
  recommendPitCrew,
  rollingPitAverage,
  summarizePitSelection,
} from "../services/pitCrewCoach.js";
import "./PitCrewLive.css";

const STATUS_OPTIONS = [
  ["hungry", "🍽️", "Hunger"],
  ["thirsty", "💧", "Durst"],
  ["stomach", "🤢", "Magen"],
  ["sweet-fatigue", "🍬", "Süß satt"],
  ["wants-salty", "🥨", "Will salzig"],
  ["too-warm", "🥵", "Zu warm"],
  ["too-cold", "🥶", "Zu kalt"],
  ["tired", "😴", "Müde"],
  ["heavy-legs", "🦵", "Beine schwer"],
];

const WEATHER_OPTIONS = [
  ["hot", "☀️", "Warm/heiß"],
  ["cold", "🥶", "Kalt"],
  ["rain", "🌧️", "Regen"],
  ["wind", "💨", "Wind"],
];

const CATEGORIES = [
  ["drink", "💧 Getränk"],
  ["food", "🍽️ Essen"],
  ["gel", "⚡ Gel"],
  ["refresh", "🥒 Refresh"],
];

function safeStoredSession(key) {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "null");
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function plannedAnchor(race) {
  if (!race?.date || !race?.time) return null;
  const time = String(race.time).slice(0, 5);
  const date = new Date(`${race.date}T${time}:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function hhmm(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "–";
  return date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

function timeContext(anchor, intervalMinutes, now) {
  const intervalMs = Math.max(1, Number(intervalMinutes || 60)) * 60 * 1000;
  if (!anchor) return { started: false, currentRound: 1, pitRound: 1, nextStart: null, minutesToStart: 99, mode: "normal" };
  const delta = now.getTime() - anchor.getTime();
  if (delta < 0) {
    const minutesToStart = Math.max(0, (anchor.getTime() - now.getTime()) / 60000);
    return { started: false, currentRound: 0, pitRound: 0, nextStart: anchor, minutesToStart, mode: pitTimeMode(minutesToStart) };
  }
  const currentRound = Math.floor(delta / intervalMs) + 1;
  const nextStart = new Date(anchor.getTime() + currentRound * intervalMs);
  const minutesToStart = Math.max(0, (nextStart.getTime() - now.getTime()) / 60000);
  return { started: true, currentRound, pitRound: currentRound, nextStart, minutesToStart, mode: pitTimeMode(minutesToStart) };
}

function modeLabel(mode) {
  if (mode === "go") return ["GO MODE", "Start sichern · keine feste Nahrung erzwingen"];
  if (mode === "quick") return ["QUICK PIT", "Nur kompakt und portabel"];
  if (mode === "compact") return ["KOMPAKTER PIT", "Keine große Mahlzeit mehr anfangen"];
  return ["NORMALER PIT", "Zeit für normale Auswahl"];
}

function toggleValue(values, key) {
  return values.includes(key) ? values.filter((item) => item !== key) : [...values, key];
}

function roundCarryCarbs(record) {
  return summarizePitSelection(record?.carrySelection || []).carbs;
}

function selectionLabel(entry) {
  const product = PIT_CREW_PRODUCTS.find((item) => item.id === entry.productId);
  const portion = product?.portions.find((item) => String(item.id) === String(entry.portionId));
  if (!product || !portion) return entry.productId;
  return `${product.icon} ${product.label} · ${portion.label}`;
}

export default function PitCrewLive({ race, onClose }) {
  const storageKey = `endurance-pit-crew:${race?.key || race?.name || "backyard"}:${race?.date || "open"}`;
  const stored = useMemo(() => safeStoredSession(storageKey), [storageKey]);
  const [now, setNow] = useState(() => new Date());
  const [history, setHistory] = useState(() => Array.isArray(stored?.history) ? stored.history : []);
  const [flags, setFlags] = useState(() => Array.isArray(stored?.flags) ? stored.flags : []);
  const [weather, setWeather] = useState(() => Array.isArray(stored?.weather) ? stored.weather : []);
  const [anchorAt, setAnchorAt] = useState(() => stored?.anchorAt || plannedAnchor(race)?.toISOString() || "");
  const [selection, setSelection] = useState([]);
  const [inputMode, setInputMode] = useState("now");
  const [carryConfirm, setCarryConfirm] = useState({});
  const [activeCategory, setActiveCategory] = useState("drink");
  const [saveMessage, setSaveMessage] = useState("");
  const loadedPitRound = useRef(null);
  const anchor = anchorAt ? new Date(anchorAt) : null;
  const intervalMinutes = Number(race?.loopIntervalMinutes || 60);
  const timing = timeContext(anchor, intervalMinutes, now);
  const pitRound = timing.pitRound;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 15000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(storageKey, JSON.stringify({ anchorAt, history, flags, weather }));
  }, [anchorAt, flags, history, storageKey, weather]);

  useEffect(() => {
    if (loadedPitRound.current === pitRound) return;
    loadedPitRound.current = pitRound;
    const existing = history.find((record) => Number(record.round) === Number(pitRound));
    setSelection(existing ? [
      ...(existing.selection || []).map((entry) => ({ ...entry, timing: "now" })),
      ...(existing.carrySelection || []).map((entry) => ({ ...entry, timing: "carry" })),
    ] : []);
    setSaveMessage(existing ? `Pit ${pitRound} ist gespeichert und kann angepasst werden.` : "");
  }, [history, pitRound]);

  const previousHistory = useMemo(() => history.filter((record) => Number(record.round) !== Number(pitRound)), [history, pitRound]);
  const planningHistory = useMemo(() => previousHistory.map((record) => ({
    ...record,
    summary: record.carryStatus === "pending" && record.provisionalSummary ? record.provisionalSummary : record.summary,
  })), [previousHistory]);
  const pendingCarry = useMemo(() => [...history].reverse().find((record) => record.carryStatus === "pending" && Array.isArray(record.carrySelection) && record.carrySelection.length), [history]);

  const recommendation = useMemo(() => recommendPitCrew({
    round: Math.max(1, timing.currentRound || 1),
    minutesToStart: timing.minutesToStart,
    history: planningHistory,
    flags,
    weather,
  }), [flags, planningHistory, timing.currentRound, timing.minutesToStart, weather]);

  const assessment = useMemo(() => assessPitSelection(selection, planningHistory, { weather }), [planningHistory, selection, weather]);
  const historyRolling = useMemo(() => rollingPitAverage(history, null, 3), [history]);
  const confirmedNow = useMemo(() => summarizePitSelection(selection.filter((entry) => entry.timing !== "carry")), [selection]);
  const carryNow = useMemo(() => summarizePitSelection(selection.filter((entry) => entry.timing === "carry")), [selection]);
  const suggestionSummary = recommendation.summary;
  const [modeTitle, modeDetail] = modeLabel(timing.mode);

  function selectPortion(productId, portionId) {
    setSaveMessage("");
    setSelection((current) => {
      const existing = current.find((item) => item.productId === productId && (item.timing || "now") === inputMode);
      if (existing && String(existing.portionId) === String(portionId)) {
        return current.filter((item) => !(item.productId === productId && (item.timing || "now") === inputMode));
      }
      return [
        ...current.filter((item) => !(item.productId === productId && (item.timing || "now") === inputMode)),
        { productId, portionId: String(portionId), timing: inputMode },
      ];
    });
  }

  function useSuggestion() {
    const portableMode = recommendation.mode === "go" || recommendation.mode === "quick";
    setSelection(recommendation.selection.map((item) => {
      const product = PIT_CREW_PRODUCTS.find((entry) => entry.id === item.productId);
      const carry = portableMode || product?.category === "drink";
      return { ...item, timing: carry ? "carry" : "now" };
    }));
    setSaveMessage("");
  }

  function savePit() {
    if (!selection.length) {
      setSaveMessage("Noch nichts ausgewählt. Nur echte Aufnahme und bewusst mitgegebenes Runden-Fuel speichern.");
      return;
    }
    const consumedSelection = selection.filter((entry) => entry.timing !== "carry").map((entry) => ({ productId: entry.productId, portionId: entry.portionId }));
    const carrySelection = selection.filter((entry) => entry.timing === "carry").map((entry) => ({ productId: entry.productId, portionId: entry.portionId }));
    const summary = summarizePitSelection(consumedSelection);
    const provisionalSummary = summarizePitSelection([...consumedSelection, ...carrySelection]);
    const record = {
      round: pitRound,
      recordedAt: new Date().toISOString(),
      selection: consumedSelection,
      carrySelection,
      carryStatus: carrySelection.length ? "pending" : "none",
      summary,
      provisionalSummary,
      flags: [...flags],
      weather: [...weather],
    };
    setHistory((current) => [...current.filter((item) => Number(item.round) !== Number(pitRound)), record]
      .sort((left, right) => Number(left.round) - Number(right.round)));
    setSaveMessage(`Pit ${pitRound} gespeichert · ${summary.carbs} g bestätigt${carrySelection.length ? ` · ${provisionalSummary.carbs - summary.carbs} g für die Runde mitgegeben` : ""}.`);
  }

  function confirmPendingCarry() {
    if (!pendingCarry) return;
    const consumedCarry = pendingCarry.carrySelection.filter((entry, index) => carryConfirm[`${pendingCarry.round}:${entry.productId}:${entry.portionId}:${index}`] !== false);
    setHistory((current) => current.map((record) => {
      if (Number(record.round) !== Number(pendingCarry.round)) return record;
      const merged = [...(record.selection || []), ...consumedCarry];
      const summary = summarizePitSelection(merged);
      return { ...record, selection: merged, summary, provisionalSummary: summary, carryStatus: "confirmed", carryConfirmedAt: new Date().toISOString() };
    }));
    setCarryConfirm({});
    setSaveMessage(`Runden-Fuel aus Pit ${pendingCarry.round} bestätigt.`);
  }

  function resetSession() {
    if (typeof window !== "undefined") window.localStorage.removeItem(storageKey);
    setHistory([]);
    setFlags([]);
    setWeather([]);
    setSelection([]);
    setCarryConfirm({});
    setAnchorAt(plannedAnchor(race)?.toISOString() || "");
    setSaveMessage("Live-Session zurückgesetzt.");
  }

  const categoryProducts = PIT_CREW_PRODUCTS.filter((product) => product.category === activeCategory);

  return (
    <div className="pit-live-shell" role="dialog" aria-modal="true" aria-label="Pit Crew Live">
      <header className="pit-live-topbar">
        <div>
          <small>PIT CREW LIVE</small>
          <strong>{race?.name || "Backyard"}</strong>
        </div>
        <button type="button" onClick={onClose} aria-label="Pit Crew schließen">Schließen</button>
      </header>

      <main className="pit-live-main">
        <section className={`pit-live-clock mode-${timing.mode}`}>
          <div>
            <small>{timing.started ? `RUNDE ${timing.currentRound} LÄUFT` : "VOR DEM START"}</small>
            <strong>{timing.started ? `Pit nach Runde ${timing.currentRound}` : "Startversorgung"}</strong>
            <span>Nächster Start <b>{hhmm(timing.nextStart)}</b></span>
          </div>
          <div className="pit-live-mode">
            <b>{modeTitle}</b>
            <span>{modeDetail}</span>
          </div>
        </section>

        {!anchor && (
          <section className="pit-live-anchor-warning">
            <b>Startzeit fehlt</b>
            <p>Einmal die echte Startzeit setzen. Danach leitet die Uhr alle Runden und Quick-Pit-Fenster automatisch ab.</p>
            <button type="button" onClick={() => setAnchorAt(new Date().toISOString())}>Rennen jetzt starten</button>
          </section>
        )}

        {pendingCarry && Number(pendingCarry.round) < Number(pitRound) && (
          <section className="pit-live-carry-confirm">
            <div className="pit-live-section-head"><div><small>RÜCKKEHR · PIT {pendingCarry.round}</small><h3>Was vom Runden-Fuel wurde wirklich genommen?</h3></div><span>1 Tap zum Korrigieren</span></div>
            <div className="pit-live-carry-items">
              {pendingCarry.carrySelection.map((entry, index) => {
                const key = `${pendingCarry.round}:${entry.productId}:${entry.portionId}:${index}`;
                const consumed = carryConfirm[key] !== false;
                return <button type="button" key={key} className={consumed ? "active" : ""} onClick={() => setCarryConfirm((current) => ({ ...current, [key]: !consumed }))}><b>{consumed ? "✓" : "–"}</b><span>{selectionLabel(entry)}</span></button>;
              })}
            </div>
            <button type="button" className="pit-live-primary" onClick={confirmPendingCarry}>Runden-Fuel bestätigen</button>
          </section>
        )}

        <section className="pit-live-recommendation">
          <div className="pit-live-section-head">
            <div><small>VORSCHLAG</small><h3>Was jetzt vorbereiten?</h3></div>
            <div className="pit-live-suggestion-total"><b>{suggestionSummary.carbs} g KH</b><span>{suggestionSummary.fluidMl} ml</span></div>
          </div>
          <div className="pit-live-recommendation-items">
            {recommendation.selection.map((entry) => <span key={`${entry.productId}:${entry.portionId}`}>{selectionLabel(entry)}</span>)}
          </div>
          <p><b>Warum?</b> {recommendation.why}</p>
          <button type="button" className="pit-live-primary" onClick={useSuggestion}>Vorschlag übernehmen</button>
        </section>

        <section className="pit-live-status-section">
          <div className="pit-live-section-head"><div><small>NUR WENN SICH ETWAS ÄNDERT</small><h3>Athlet</h3></div><span>{flags.length ? `${flags.length} aktiv` : "keine Meldung"}</span></div>
          <div className="pit-live-status-grid">
            {STATUS_OPTIONS.map(([key, icon, label]) => (
              <button type="button" key={key} className={flags.includes(key) ? "active" : ""} onClick={() => setFlags((current) => toggleValue(current, key))}>
                <b>{icon}</b><span>{label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="pit-live-weather-section">
          <div className="pit-live-section-head"><div><small>BEDINGUNGEN</small><h3>Wetter</h3></div><button type="button" className={!weather.length ? "pit-live-mini active" : "pit-live-mini"} onClick={() => setWeather([])}>Normal</button></div>
          <div className="pit-live-weather-grid">
            {WEATHER_OPTIONS.map(([key, icon, label]) => (
              <button type="button" key={key} className={weather.includes(key) ? "active" : ""} onClick={() => setWeather((current) => toggleValue(current, key))}>{icon} {label}</button>
            ))}
          </div>
        </section>

        <section className="pit-live-intake">
          <div className="pit-live-section-head">
            <div><small>ATHLET ENTSCHEIDET</small><h3>Was nimmt er wirklich?</h3></div>
            {selection.length > 0 && <button type="button" className="pit-live-mini" onClick={() => setSelection([])}>Leeren</button>}
          </div>
          <p className="pit-live-help">Vorschlag egal? Einfach die tatsächliche Auswahl antippen. „Jetzt genommen“ zählt sofort; Runden-Fuel bleibt vorläufig, bis es bei der Rückkehr bestätigt wird.</p>
          <div className="pit-live-intake-mode">
            <button type="button" className={inputMode === "now" ? "active" : ""} onClick={() => setInputMode("now")}><b>JETZT GENOMMEN</b><span>zählt bestätigt</span></button>
            <button type="button" className={inputMode === "carry" ? "active" : ""} onClick={() => setInputMode("carry")}><b>MIT AUF RUNDE</b><span>wird später bestätigt</span></button>
          </div>
          <div className="pit-live-category-tabs">
            {CATEGORIES.map(([key, label]) => <button type="button" key={key} className={activeCategory === key ? "active" : ""} onClick={() => setActiveCategory(key)}>{label}</button>)}
          </div>
          <div className="pit-live-product-grid">
            {categoryProducts.map((product) => {
              const selected = selection.find((item) => item.productId === product.id);
              const selectedInMode = selection.find((item) => item.productId === product.id && (item.timing || "now") === inputMode);
              return (
                <article key={product.id} className={selected ? "selected" : ""}>
                  <div><b>{product.icon}</b><strong>{product.label}{product.estimated ? " ≈" : ""}</strong></div>
                  <div className="pit-live-portions">
                    {product.portions.map((portion) => (
                      <button
                        type="button"
                        key={portion.id}
                        className={selectedInMode && String(selectedInMode.portionId) === String(portion.id) ? "active" : ""}
                        onClick={() => selectPortion(product.id, portion.id)}
                      >
                        <b>{portion.label}</b>
                        <span>{portion.carbs ? `${portion.carbs} g KH` : "0 g KH"}</span>
                      </button>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className={`pit-live-totals tone-${assessment.tone}`}>
          <div className="pit-live-total-grid">
            <div><small>KH DIESE STUNDE</small><strong>{assessment.summary.carbs} g</strong></div>
            <div><small>FLÜSSIGKEIT</small><strong>{assessment.summary.fluidMl} ml</strong></div>
            <div><small>3-h-SCHNITT</small><strong>{assessment.rolling.hours ? `${assessment.rolling.carbsPerHour} g/h` : "–"}</strong></div>
            <div><small>KOFFEIN</small><strong>{assessment.summary.caffeineMg ? `${assessment.summary.caffeineMg} mg` : "0 mg"}</strong></div>
          </div>
          {selection.length > 0 && <div className="pit-live-confirmed-split"><span>✓ jetzt bestätigt <b>{confirmedNow.carbs} g KH</b></span><span>→ für Runde <b>{carryNow.carbs} g KH</b></span></div>}
          <div className="pit-live-assessment"><b>{selection.length ? assessment.headline : "Noch keine tatsächliche Auswahl"}</b><span>{selection.length ? assessment.detail : historyRolling.hours ? `Bestätigter 3-h-Schnitt bisher: ${historyRolling.carbsPerHour} g KH/h.` : "Vorschlag übernehmen oder frei auswählen."}</span></div>
          {assessment.summary.sodiumMg > 0 && <small className="pit-live-electrolytes">Bekanntes Natrium aus Auswahl: ~{assessment.summary.sodiumMg} mg. Isostar/sonstige Produkte sind hier noch nicht vollständig eingerechnet.</small>}
          {assessment.summary.estimated && <small className="pit-live-estimate">≈ Mindestens ein Lebensmittel nutzt vorläufige Portionswerte. Packungswerte können wir später exakt hinterlegen.</small>}
          <button type="button" className="pit-live-save" onClick={savePit}>Aufnahme für Pit {pitRound} speichern</button>
          {saveMessage && <p className="pit-live-save-message">{saveMessage}</p>}
        </section>

        {history.length > 0 && (
          <section className="pit-live-history">
            <div className="pit-live-section-head"><div><small>VERLAUF</small><h3>Letzte Pits</h3></div><span>Ø {historyRolling.carbsPerHour} g KH/h</span></div>
            <div className="pit-live-history-rows">
              {history.slice(-5).reverse().map((record) => <div key={record.round}><b>Pit {record.round}</b><span>{record.summary?.carbs ?? summarizePitSelection(record.selection).carbs} g KH bestätigt{record.carryStatus === "pending" ? ` · +${roundCarryCarbs(record)} g offen` : ""}</span></div>)}
            </div>
          </section>
        )}

        <section className="pit-live-footer-tools">
          <p><b>Prinzip:</b> Vorschlag → Athlet entscheidet → „jetzt genommen“ zählt sofort → Runden-Fuel erst bei Rückkehr bestätigen. Kein Ankunftsbutton nötig.</p>
          <div>
            {!race?.time && <button type="button" onClick={() => setAnchorAt(new Date().toISOString())}>Startzeit = jetzt</button>}
            <button type="button" onClick={resetSession}>Live-Session zurücksetzen</button>
          </div>
        </section>
      </main>
    </div>
  );
}
