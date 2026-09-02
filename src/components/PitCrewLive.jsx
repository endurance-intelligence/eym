import { useEffect, useMemo, useRef, useState } from "react";
import {
  assessPitSelection,
  PIT_CREW_PRODUCTS,
  pitMetricStatus,
  pitTimeMode,
  recommendPitCrew,
  rollingPitAverage,
  summarizePitSelection,
} from "../services/pitCrewCoach.js";
import { fetchPitCrewWeather, pitWeatherIcon } from "../services/pitCrewWeather.js";
import { athleteCareHints } from "../services/pitCrewCare.js";
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
  if (mode === "go") return "GO MODE";
  if (mode === "quick") return "QUICK PIT";
  if (mode === "compact") return "KOMPAKT";
  return "STANDARD-PIT";
}

function toggleValue(values, key) {
  return values.includes(key) ? values.filter((item) => item !== key) : [...values, key];
}

function quantity(entry) {
  return Math.max(1, Math.round(Number(entry?.quantity || 1)));
}

function formatNumber(value, digits = 1) {
  const number = Number(value || 0);
  return number.toLocaleString("de-DE", { maximumFractionDigits: digits });
}

function selectionLabel(entry) {
  const product = PIT_CREW_PRODUCTS.find((item) => item.id === entry.productId);
  const portion = product?.portions.find((item) => String(item.id) === String(entry.portionId));
  if (!product || !portion) return entry.productId;
  const count = quantity(entry);
  return `${product.icon} ${product.label} · ${portion.label}${count > 1 ? ` ×${count}` : ""}`;
}

function selectionWithTiming(record = {}) {
  if (record.carryStatus === "pending") {
    return [
      ...(record.selection || []).map((entry) => ({ ...entry, timing: "now" })),
      ...(record.carrySelection || []).map((entry) => ({ ...entry, timing: "carry" })),
    ];
  }
  return (record.selection || []).map((entry) => ({ ...entry, timing: "now" }));
}

function compactStatus(flags = []) {
  if (!flags.length) return "alles gut";
  return STATUS_OPTIONS.filter(([key]) => flags.includes(key)).map(([, icon, label]) => `${icon} ${label}`).join(" · ");
}

function warningText(metricStatus, assessment) {
  if (metricStatus.carbs === "high") return "KH aktuell hoch – nichts zusätzlich erzwingen.";
  if (metricStatus.rolling === "high") return "3-h-KH-Trend hoch – nächste Versorgung nicht unnötig stapeln.";
  if (metricStatus.fluid === "high") return "Flüssigkeit aktuell sehr hoch – nicht weiter auf Verdacht nachfüllen.";
  if (metricStatus.rolling === "low") return "KH-Trend niedrig – nächsten Pit gezielt etwas höher planen.";
  if (metricStatus.carbs === "low") return "Diese Stunde ist eher leicht – 3-h-Trend im Blick behalten.";
  if (metricStatus.fluid === "low") return "Flüssigkeit für die aktuellen Bedingungen eher niedrig.";
  return assessment?.headline || "";
}

export default function PitCrewLive({ race, onClose }) {
  const baseStorageKey = `endurance-pit-crew:${race?.key || race?.name || "backyard"}:${race?.date || "open"}`;
  const stored = useMemo(() => safeStoredSession(baseStorageKey), [baseStorageKey]);
  const [demoActive, setDemoActive] = useState(false);
  const [demoRound, setDemoRound] = useState(1);
  const [demoMinutesToStart, setDemoMinutesToStart] = useState(10);
  const storageKey = demoActive ? `${baseStorageKey}:demo` : baseStorageKey;
  const [now, setNow] = useState(() => new Date());
  const [history, setHistory] = useState(() => Array.isArray(stored?.history) ? stored.history : []);
  const [flags, setFlags] = useState(() => Array.isArray(stored?.flags) ? stored.flags : []);
  const [weather, setWeather] = useState(() => Array.isArray(stored?.weather) ? stored.weather : []);
  const [anchorAt, setAnchorAt] = useState(() => stored?.anchorAt || plannedAnchor(race)?.toISOString() || "");
  const [selection, setSelection] = useState([]);
  const [carryAdjust, setCarryAdjust] = useState({});
  const [carryEditOpen, setCarryEditOpen] = useState(false);
  const [pitCategory, setPitCategory] = useState("drink");
  const [loopCategory, setLoopCategory] = useState("drink");
  const [saveMessage, setSaveMessage] = useState("");
  const [editingRound, setEditingRound] = useState(null);
  const [autoWeather, setAutoWeather] = useState(null);
  const [weatherError, setWeatherError] = useState("");
  const loadedPitRound = useRef(null);
  const liveSnapshotBeforeDemo = useRef(null);
  const anchor = anchorAt ? new Date(anchorAt) : null;
  const intervalMinutes = Number(race?.loopIntervalMinutes || 60);
  const liveTiming = timeContext(anchor, intervalMinutes, now);
  const demoBase = plannedAnchor(race) || new Date(2000, 0, 1, 6, 0, 0, 0);
  const demoNextStart = new Date(demoBase.getTime() + Math.max(1, Number(demoRound || 1)) * intervalMinutes * 60 * 1000);
  const timing = demoActive ? {
    started: true,
    currentRound: Math.max(1, Number(demoRound || 1)),
    pitRound: Math.max(1, Number(demoRound || 1)),
    nextStart: demoNextStart,
    minutesToStart: Math.max(0, Number(demoMinutesToStart || 0)),
    mode: pitTimeMode(demoMinutesToStart),
  } : liveTiming;
  const pitRound = timing.pitRound;
  const saveRound = editingRound ?? pitRound;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 15000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(storageKey, JSON.stringify({ anchorAt, history, flags, weather }));
  }, [anchorAt, flags, history, storageKey, weather]);

  useEffect(() => {
    if (loadedPitRound.current === pitRound || editingRound != null) return;
    loadedPitRound.current = pitRound;
    const existing = history.find((record) => Number(record.round) === Number(pitRound));
    setSelection(existing ? selectionWithTiming(existing) : []);
    setSaveMessage(existing ? `Pit ${pitRound} ist gespeichert und kann angepasst werden.` : "");
  }, [editingRound, history, pitRound]);

  useEffect(() => {
    let active = true;
    async function loadWeather() {
      try {
        const loaded = await fetchPitCrewWeather(race || {});
        if (!active) return;
        setAutoWeather(loaded);
        setWeatherError("");
      } catch (error) {
        if (!active) return;
        setWeatherError(error?.message || "Wetter konnte gerade nicht automatisch geladen werden.");
      }
    }
    void loadWeather();
    const timer = window.setInterval(() => void loadWeather(), 30 * 60 * 1000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [race]);

  // These values are cheap render-time derivations. Let the React Compiler decide
  // whether to memoize them instead of maintaining dependency arrays manually.
  const effectiveWeather = [...new Set([...(autoWeather?.flags || []), ...weather])];
  const previousHistory = history.filter((record) => Number(record.round) !== Number(saveRound));
  const planningHistory = previousHistory.map((record) => ({
    ...record,
    summary: record.carryStatus === "pending" && record.provisionalSummary ? record.provisionalSummary : record.summary,
  }));
  const pendingCarry = [...history].reverse().find((record) => record.carryStatus === "pending" && Array.isArray(record.carrySelection) && record.carrySelection.length);

  const recommendation = recommendPitCrew({
    round: Math.max(1, timing.currentRound || 1),
    minutesToStart: timing.minutesToStart,
    history: planningHistory,
    flags,
    weather: effectiveWeather,
  });

  const assessment = assessPitSelection(selection, planningHistory, { weather: effectiveWeather });
  const historyRolling = rollingPitAverage(history, null, 3);
  const metricStatus = pitMetricStatus(assessment.summary, assessment.rolling, { weather: effectiveWeather });
  const suggestionSummary = recommendation.summary;
  const modeTitle = modeLabel(timing.mode);
  const portableMode = recommendation.mode === "go" || recommendation.mode === "quick";
  const suggestionPit = recommendation.selection.filter((entry) => {
    const product = PIT_CREW_PRODUCTS.find((item) => item.id === entry.productId);
    return !portableMode && product?.category !== "drink";
  });
  const suggestionLoop = recommendation.selection.filter((entry) => !suggestionPit.includes(entry));
  const lastRecord = history.length ? history[history.length - 1] : null;
  const alert = warningText(metricStatus, assessment);
  const elapsedMinutes = demoActive
    ? Math.max(0, timing.currentRound * intervalMinutes - timing.minutesToStart)
    : anchor && timing.started
      ? Math.max(0, (now.getTime() - anchor.getTime()) / 60000)
      : 0;
  const athleteCare = athleteCareHints({
    round: Math.max(1, timing.currentRound || 1),
    elapsedMinutes,
    minutesToStart: timing.minutesToStart,
    mode: timing.mode,
    flags,
    weather: effectiveWeather,
    observation: autoWeather,
  });

  function selectPortion(productId, portionId, timingMode) {
    setSaveMessage("");
    setSelection((current) => {
      const existing = current.find((item) => item.productId === productId && (item.timing || "now") === timingMode);
      if (existing && String(existing.portionId) === String(portionId)) return current;
      return [
        ...current.filter((item) => !(item.productId === productId && (item.timing || "now") === timingMode)),
        { productId, portionId: String(portionId), timing: timingMode, quantity: 1 },
      ];
    });
  }

  function changeQuantity(productId, timingMode, delta) {
    setSaveMessage("");
    setSelection((current) => current.flatMap((entry) => {
      if (entry.productId !== productId || (entry.timing || "now") !== timingMode) return [entry];
      const next = Math.max(0, Math.min(20, quantity(entry) + delta));
      return next ? [{ ...entry, quantity: next }] : [];
    }));
  }

  function useSuggestion() {
    setSelection(recommendation.selection.map((item) => {
      const product = PIT_CREW_PRODUCTS.find((entry) => entry.id === item.productId);
      const carry = portableMode || product?.category === "drink";
      return { ...item, timing: carry ? "carry" : "now", quantity: quantity(item) };
    }));
    setEditingRound(null);
    setSaveMessage("");
  }

  function savePit() {
    if (!selection.length) {
      setSaveMessage("Noch nichts ausgewählt. Nur echte Aufnahme und bewusst mitgegebenes Loop-Fuel speichern.");
      return;
    }
    const existing = history.find((item) => Number(item.round) === Number(saveRound));
    const consumedSelection = selection.filter((entry) => entry.timing !== "carry").map(({ productId, portionId, quantity: count }) => ({ productId, portionId, quantity: quantity({ quantity: count }) }));
    const carrySelection = selection.filter((entry) => entry.timing === "carry").map(({ productId, portionId, quantity: count }) => ({ productId, portionId, quantity: quantity({ quantity: count }) }));
    const summary = summarizePitSelection(consumedSelection);
    const provisionalSummary = summarizePitSelection([...consumedSelection, ...carrySelection]);
    const record = {
      round: saveRound,
      recordedAt: new Date().toISOString(),
      selection: consumedSelection,
      carrySelection,
      carryStatus: carrySelection.length ? "pending" : "none",
      summary,
      provisionalSummary,
      flags: editingRound != null && existing ? [...(existing.flags || [])] : [...flags],
      weather: editingRound != null && existing ? [...(existing.weather || [])] : [...effectiveWeather],
    };
    setHistory((current) => [...current.filter((item) => Number(item.round) !== Number(saveRound)), record]
      .sort((left, right) => Number(left.round) - Number(right.round)));
    setSaveMessage(editingRound != null
      ? `Pit ${saveRound} korrigiert.`
      : `Pit ${saveRound} gespeichert · ${formatNumber(summary.carbs)} g bestätigt${carrySelection.length ? ` · ${formatNumber(provisionalSummary.carbs - summary.carbs)} g mit auf Loop` : ""}.`);
    setEditingRound(null);
  }

  function confirmPendingCarry(useAdjusted = false) {
    if (!pendingCarry) return;
    const consumedCarry = pendingCarry.carrySelection.flatMap((entry, index) => {
      const key = `${pendingCarry.round}:${entry.productId}:${entry.portionId}:${index}`;
      const count = useAdjusted ? Math.max(0, Number(carryAdjust[key] ?? quantity(entry))) : quantity(entry);
      return count > 0 ? [{ ...entry, quantity: count }] : [];
    });
    setHistory((current) => current.map((record) => {
      if (Number(record.round) !== Number(pendingCarry.round)) return record;
      const merged = [...(record.selection || []), ...consumedCarry];
      const summary = summarizePitSelection(merged);
      return {
        ...record,
        selection: merged,
        carrySelection: [],
        summary,
        provisionalSummary: summary,
        carryStatus: "confirmed",
        carryConfirmedAt: new Date().toISOString(),
      };
    }));
    setCarryAdjust({});
    setCarryEditOpen(false);
    setSaveMessage(`Loop-Fuel aus Pit ${pendingCarry.round} bestätigt.`);
  }

  function adjustCarryQuantity(entry, index, delta) {
    if (!pendingCarry) return;
    const key = `${pendingCarry.round}:${entry.productId}:${entry.portionId}:${index}`;
    setCarryAdjust((current) => {
      const base = Number(current[key] ?? quantity(entry));
      return { ...current, [key]: Math.max(0, Math.min(20, base + delta)) };
    });
  }

  function editLastPit() {
    if (!lastRecord) return;
    setEditingRound(Number(lastRecord.round));
    setSelection(selectionWithTiming(lastRecord));
    setSaveMessage(`Pit ${lastRecord.round} zur Korrektur geöffnet.`);
  }

  function beginDemo() {
    if (!demoActive) {
      liveSnapshotBeforeDemo.current = {
        selection,
        carryAdjust,
        carryEditOpen,
        editingRound,
        saveMessage,
      };
    }
    if (typeof window !== "undefined") {
      if (!demoActive) window.localStorage.setItem(baseStorageKey, JSON.stringify({ anchorAt, history, flags, weather }));
      window.localStorage.removeItem(`${baseStorageKey}:demo`);
    }
    setDemoActive(true);
    setDemoRound(1);
    setDemoMinutesToStart(10);
    setHistory([]);
    setFlags([]);
    setWeather([]);
    setSelection([]);
    setCarryAdjust({});
    setCarryEditOpen(false);
    setEditingRound(null);
    setSaveMessage("Demo-Modus aktiv · echte Live-Daten bleiben unverändert.");
    loadedPitRound.current = null;
  }

  function endDemo() {
    const liveStored = safeStoredSession(baseStorageKey);
    const transient = liveSnapshotBeforeDemo.current || {};
    setDemoActive(false);
    setHistory(Array.isArray(liveStored?.history) ? liveStored.history : []);
    setFlags(Array.isArray(liveStored?.flags) ? liveStored.flags : []);
    setWeather(Array.isArray(liveStored?.weather) ? liveStored.weather : []);
    setAnchorAt(liveStored?.anchorAt || plannedAnchor(race)?.toISOString() || "");
    setSelection(Array.isArray(transient.selection) ? transient.selection : []);
    setCarryAdjust(transient.carryAdjust || {});
    setCarryEditOpen(Boolean(transient.carryEditOpen));
    setEditingRound(transient.editingRound ?? null);
    setSaveMessage("Demo beendet · zurück in der echten Live-Session.");
    liveSnapshotBeforeDemo.current = null;
    loadedPitRound.current = null;
  }

  function moveDemoLoop(delta) {
    if (!demoActive) return;
    setDemoRound((current) => Math.max(1, Number(current || 1) + delta));
    setDemoMinutesToStart(10);
    setEditingRound(null);
    setSelection([]);
    setCarryAdjust({});
    setCarryEditOpen(false);
    setSaveMessage(delta > 0 ? "Nächste Demo-Loop geladen." : "Vorherige Demo-Loop geladen.");
    loadedPitRound.current = null;
  }

  function clearTimingSelection(timingMode) {
    setSelection((current) => current.filter((entry) => (entry.timing || "now") !== timingMode));
    setSaveMessage("");
  }

  function renderFuelingSection(timingMode, title, category, setCategory, emptyLabel) {
    const selected = selection.filter((entry) => (entry.timing || "now") === timingMode);
    const summary = summarizePitSelection(selected);
    const products = PIT_CREW_PRODUCTS.filter((product) => product.category === category);
    const isCarry = timingMode === "carry";
    return (
      <details className="pit-live-collapse">
        <summary>
          <span>{title}</span>
          <b>{selected.length ? `${formatNumber(summary.carbs)} g KH · ${summary.fluidMl} ml` : emptyLabel}</b>
          <i>›</i>
        </summary>
        <div className="pit-live-collapse-body pit-live-intake">
          {editingRound != null && <div className="pit-live-edit-banner">Pit {editingRound} wird korrigiert. Speichern ersetzt nur diesen Pit.</div>}
          <p className="pit-live-help">{isCarry
            ? "Was für die nächste Loop mitgeht. Bei der Rückkehr reicht normalerweise ein Tap auf „✓ Wie geplant“."
            : "Nur tatsächlich im Pit gegessen oder getrunken eintragen – ideal zum schnellen Gegencheck der Crew."}</p>
          <div className="pit-live-category-tabs">
            {CATEGORIES.map(([key, label]) => <button type="button" key={key} className={category === key ? "active" : ""} onClick={() => setCategory(key)}>{label}</button>)}
          </div>
          <div className="pit-live-product-grid">
            {products.map((product) => {
              const selectedInMode = selection.find((item) => item.productId === product.id && (item.timing || "now") === timingMode);
              return (
                <article key={product.id} className={selectedInMode ? "selected" : ""}>
                  <div><b>{product.icon}</b><strong>{product.label}{product.estimated ? " ≈" : ""}</strong>{selectedInMode && quantity(selectedInMode) > 1 && <em>×{quantity(selectedInMode)}</em>}</div>
                  <div className="pit-live-portions">
                    {product.portions.map((portion) => (
                      <button type="button" key={portion.id} className={selectedInMode && String(selectedInMode.portionId) === String(portion.id) ? "active" : ""} onClick={() => selectPortion(product.id, portion.id, timingMode)}>
                        <b>{portion.label}</b><span>{portion.carbs ? `${formatNumber(portion.carbs)} g KH` : "0 g KH"}</span>
                      </button>
                    ))}
                  </div>
                  {selectedInMode && (
                    <div className="pit-live-quantity">
                      <button type="button" onClick={() => changeQuantity(product.id, timingMode, -1)}>−</button>
                      <b>{quantity(selectedInMode)}</b>
                      <button type="button" onClick={() => changeQuantity(product.id, timingMode, 1)}>+</button>
                      <span>{formatNumber(summarizePitSelection([selectedInMode]).carbs)} g KH gesamt</span>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
          {selected.length > 0 && <button type="button" className="pit-live-secondary pit-live-clear" onClick={() => clearTimingSelection(timingMode)}>{isCarry ? "Fueling Loop Auswahl leeren" : "Fueling Pit Auswahl leeren"}</button>}
        </div>
      </details>
    );
  }

  function resetSession() {
    if (demoActive) {
      beginDemo();
      setSaveMessage("Demo auf Loop 1 zurückgesetzt.");
      return;
    }
    const confirmed = typeof window === "undefined" || window.confirm("Wirklich die gesamte Live-Session löschen? Alle gespeicherten Pits, Statusmeldungen und Crew-Daten dieser Session werden zurückgesetzt.");
    if (!confirmed) return;
    if (typeof window !== "undefined") window.localStorage.removeItem(storageKey);
    setHistory([]);
    setFlags([]);
    setWeather([]);
    setSelection([]);
    setCarryAdjust({});
    setCarryEditOpen(false);
    setEditingRound(null);
    setAnchorAt(plannedAnchor(race)?.toISOString() || "");
    setSaveMessage("Live-Session zurückgesetzt.");
  }

  return (
    <div className="pit-live-shell" role="dialog" aria-modal="true" aria-label="Pit Crew Live">
      <header className="pit-live-topbar">
        <div><small>PIT CREW LIVE{demoActive ? " · DEMO" : ""}</small><strong>{race?.name || "Backyard"}</strong></div>
        <button type="button" onClick={onClose} aria-label="Pit Crew schließen">Schließen</button>
      </header>

      <main className="pit-live-main">
        <details className="pit-live-collapse pit-live-weather-top">
          <summary><span>WETTER</span><b>{autoWeather ? `${pitWeatherIcon(autoWeather.weatherCode, autoWeather.isDay)} ${autoWeather.temperature} °C · ${autoWeather.windSpeed} km/h` : weatherError ? "Auto nicht verfügbar" : "wird automatisch geladen …"}</b><i>›</i></summary>
          <div className="pit-live-collapse-body">
            {autoWeather ? <div className="pit-live-weather-facts"><span><b>{autoWeather.feelsLike} °C</b> gefühlt</span><span><b>{autoWeather.humidity} %</b> Feuchte</span><span><b>{formatNumber(autoWeather.precipitation)} mm</b> Regen</span><span><b>{autoWeather.windGusts} km/h</b> Böen</span></div> : <p className="pit-live-help">{weatherError || "Wetter wird geladen …"}</p>}
            <p className="pit-live-help">Automatisch erkannt. Nur antippen, wenn die Situation vor Ort deutlich anders ist.</p>
            <div className="pit-live-weather-grid">
              {WEATHER_OPTIONS.map(([key, icon, label]) => <button type="button" key={key} className={weather.includes(key) ? "active" : ""} onClick={() => setWeather((current) => toggleValue(current, key))}>{icon} {label}</button>)}
            </div>
          </div>
        </details>

        <section className={`pit-live-clock mode-${timing.mode} ${timing.started ? "" : "prestart"}`}>
          <b>{timing.started ? `RUNDE ${timing.currentRound}` : "VOR START"}</b>
          <span>Nächster Start <strong>{hhmm(timing.nextStart)}</strong></span>
          {timing.started && <em>{modeTitle}</em>}
        </section>

        {demoActive && (
          <section className="pit-live-demo-panel">
            <div className="pit-live-demo-head">
              <div><small>DEMO-MODUS · LIVE-DATEN UNVERÄNDERT</small><strong>Loop {timing.currentRound} simulieren</strong></div>
              <button type="button" className="pit-live-secondary" onClick={endDemo}>Demo beenden</button>
            </div>
            <div className="pit-live-demo-loop">
              <button type="button" className="pit-live-secondary" disabled={demoRound <= 1} onClick={() => moveDemoLoop(-1)}>← Loop</button>
              <button type="button" className="pit-live-primary" onClick={() => moveDemoLoop(1)}>Nächste Loop →</button>
            </div>
            <div className="pit-live-demo-times" aria-label="Demo Pit-Zeit">
              {[[10, "STANDARD"], [6, "KOMPAKT"], [4, "QUICK"], [2, "GO"]].map(([minutes, label]) => (
                <button type="button" key={minutes} className={demoMinutesToStart === minutes ? "active" : ""} onClick={() => setDemoMinutesToStart(minutes)}><b>{minutes} min</b><span>{label}</span></button>
              ))}
            </div>
          </section>
        )}

        {!demoActive && !anchor && (
          <section className="pit-live-anchor-warning">
            <b>Startzeit fehlt</b>
            <p>Einmal die echte Startzeit setzen. Danach leitet die Uhr alle Loops und Quick-Pit-Fenster automatisch ab.</p>
            <button type="button" onClick={() => setAnchorAt(new Date().toISOString())}>Rennen jetzt starten</button>
          </section>
        )}

        {pendingCarry && Number(pendingCarry.round) < Number(pitRound) && (
          <section className="pit-live-carry-confirm">
            <div className="pit-live-carry-compact">
              <div><small>RÜCKKEHR · LOOP {pendingCarry.round}</small><strong>Runden-Fuel wie geplant genommen?</strong><span>{pendingCarry.carrySelection.map(selectionLabel).join(" · ")}</span></div>
              <div className="pit-live-carry-actions">
                <button type="button" className="pit-live-primary" onClick={() => confirmPendingCarry(false)}>✓ Wie geplant</button>
                <button type="button" className="pit-live-secondary" onClick={() => setCarryEditOpen((value) => !value)}>Ändern</button>
              </div>
            </div>
            {carryEditOpen && (
              <div className="pit-live-carry-edit">
                {pendingCarry.carrySelection.map((entry, index) => {
                  const key = `${pendingCarry.round}:${entry.productId}:${entry.portionId}:${index}`;
                  const count = Number(carryAdjust[key] ?? quantity(entry));
                  return <div key={key}><span>{selectionLabel({ ...entry, quantity: 1 })}</span><div><button type="button" onClick={() => adjustCarryQuantity(entry, index, -1)}>−</button><b>{count}</b><button type="button" onClick={() => adjustCarryQuantity(entry, index, 1)}>+</button></div></div>;
                })}
                <button type="button" className="pit-live-primary" onClick={() => confirmPendingCarry(true)}>Korrigiert bestätigen</button>
              </div>
            )}
          </section>
        )}

        <section className="pit-live-recommendation">
          <div className="pit-live-section-head">
            <div><small>IDEALVORSCHLAG · KEINE ESSENSPFLICHT</small><h3>{timing.started ? `Pit nach Loop ${timing.currentRound} vorbereiten` : "Startversorgung vorbereiten"}</h3></div>
            <div className="pit-live-suggestion-total"><b>{Math.round(suggestionSummary.carbs)} g KH</b><span>{suggestionSummary.fluidMl} ml</span></div>
          </div>
          {suggestionPit.length > 0 && <div className="pit-live-suggestion-group"><small>IM PIT ANBIETEN</small><div>{suggestionPit.map((entry) => <span key={`pit:${entry.productId}:${entry.portionId}`}>{selectionLabel(entry)}</span>)}</div></div>}
          {suggestionLoop.length > 0 && <div className="pit-live-suggestion-group"><small>FÜR NÄCHSTE LOOP BEREITLEGEN</small><div>{suggestionLoop.map((entry) => <span key={`loop:${entry.productId}:${entry.portionId}`}>{selectionLabel(entry)}</span>)}</div></div>}
          <p><b>Warum?</b> {recommendation.why}</p>
          <button type="button" className="pit-live-primary" onClick={useSuggestion}>Vorschlag übernehmen</button>
        </section>

        <details className="pit-live-collapse">
          <summary><span>ATHLET</span><b>{compactStatus(flags)}</b><i>›</i></summary>
          <div className="pit-live-collapse-body">
            <p className="pit-live-help">Nur Änderungen melden. Wenn alles gut ist, muss hier nichts angefasst werden.</p>
            <div className="pit-live-status-grid">
              {STATUS_OPTIONS.map(([key, icon, label]) => (
                <button type="button" key={key} className={flags.includes(key) ? "active" : ""} onClick={() => setFlags((current) => toggleValue(current, key))}><b>{icon}</b><span>{label}</span></button>
              ))}
            </div>
          </div>
        </details>

        <details className={`pit-live-collapse pit-live-care ${athleteCare.urgent ? "urgent" : ""}`}>
          <summary><span>ATHLETE CARE</span><b>{athleteCare.summary}</b><i>›</i></summary>
          <div className="pit-live-collapse-body">
            <p className="pit-live-help">Nur Gedächtnisstützen für die Crew – nichts abhaken, nichts erzwingen. Hinweise passen sich an Restzeit, Rennverlauf, Athletenstatus und Wetter an.</p>
            {athleteCare.hints.length ? (
              <div className="pit-live-care-list">
                {athleteCare.hints.map((hint) => (
                  <div key={hint.key} className={hint.urgent ? "urgent" : ""}>
                    <b>{hint.icon}</b>
                    <span>{hint.text}</span>
                  </div>
                ))}
              </div>
            ) : <p className="pit-live-care-clear">✓ Aktuell keine besondere Care-Aktion nötig. Routine ruhig weiterlaufen lassen.</p>}
          </div>
        </details>

        {renderFuelingSection("now", "FUELING PIT", pitCategory, setPitCategory, "noch nichts im Pit")}
        {renderFuelingSection("carry", "FUELING LOOP", loopCategory, setLoopCategory, "noch nichts für Loop")}

        {history.length > 0 && (
          <details className="pit-live-collapse">
            <summary><span>VERLAUF</span><b>Ø3h {formatNumber(historyRolling.carbsPerHour)} g/h</b><i>›</i></summary>
            <div className="pit-live-collapse-body">
              <div className="pit-live-history-rows">{history.slice(-5).reverse().map((record) => <div key={record.round}><b>Pit {record.round}</b><span>{formatNumber(record.summary?.carbs ?? summarizePitSelection(record.selection).carbs)} g KH{record.carryStatus === "pending" ? " · Loop offen" : ""}</span></div>)}</div>
              <button type="button" className="pit-live-secondary pit-live-wide" onClick={editLastPit}>Letzten Pit korrigieren</button>
            </div>
          </details>
        )}

        <details className="pit-live-collapse pit-live-tools">
          <summary><span>WERKZEUGE</span><b>{demoActive ? "Demo läuft" : "Demo / Korrektur"}</b><i>›</i></summary>
          <div className="pit-live-collapse-body">
            {!demoActive ? (
              <>
                <p className="pit-live-help">Demo startet eine getrennte Simulation. Du kannst mehrere Loops, Fueling, Status und alle Zeitmodi in Minuten zeigen – die echte Session bleibt unangetastet.</p>
                <button type="button" className="pit-live-primary pit-live-wide" onClick={beginDemo}>Demo-Modus starten</button>
                {!race?.time && <button type="button" className="pit-live-secondary pit-live-wide" onClick={() => setAnchorAt(new Date().toISOString())}>Startzeit = jetzt</button>}
                <button type="button" className="pit-live-danger pit-live-wide" onClick={resetSession}>Gesamte Live-Session zurücksetzen</button>
              </>
            ) : (
              <>
                <p className="pit-live-help">Demo-Daten liegen separat. „Demo neu starten“ löscht nur die Simulation; „Demo beenden“ holt die echte Live-Session zurück.</p>
                <button type="button" className="pit-live-secondary pit-live-wide" onClick={beginDemo}>Demo neu starten</button>
                <button type="button" className="pit-live-primary pit-live-wide" onClick={endDemo}>Demo beenden</button>
              </>
            )}
          </div>
        </details>

        {saveMessage && <p className="pit-live-save-message">{saveMessage}</p>}
        {(metricStatus.carbs !== "good" || metricStatus.fluid === "low" || metricStatus.fluid === "high" || metricStatus.rolling === "low" || metricStatus.rolling === "high") && <div className={`pit-live-alert tone-${metricStatus.carbs === "high" || metricStatus.fluid === "high" || metricStatus.rolling === "high" ? "high" : "low"}`}>{alert}</div>}

        <section className="pit-live-mini-bar" aria-label="Versorgungsstatus">
          <div className={`tone-${metricStatus.carbs}`}><small>KH</small><b>{Math.round(assessment.summary.carbs)} g</b></div>
          <div className={`tone-${metricStatus.fluid}`}><small>💧</small><b>{assessment.summary.fluidMl} ml</b></div>
          <div className={`tone-${metricStatus.rolling}`}><small>Ø3h</small><b>{assessment.rolling.hours ? `${Math.round(assessment.rolling.carbsPerHour)} g/h` : "–"}</b></div>
          {assessment.summary.caffeineMg > 0 && <div className="tone-neutral"><small>☕</small><b>{Math.round(assessment.summary.caffeineMg)} mg</b></div>}
          <button type="button" disabled={!selection.length} onClick={savePit}>{demoActive ? `DEMO · PIT ${saveRound} ${editingRound != null ? "KORRIGIEREN" : "SPEICHERN"}` : editingRound != null ? `PIT ${saveRound} KORRIGIEREN` : `PIT ${saveRound} SPEICHERN`}</button>
        </section>
      </main>
    </div>
  );
}
