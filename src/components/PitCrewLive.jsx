import { useEffect, useMemo, useRef, useState } from "react";
import {
  assessPitSelection,
  buildPitCrewCustomProduct,
  PIT_CARB_TARGET,
  PIT_CREW_DEFAULT_STOCK_IDS,
  PIT_CREW_PRODUCTS,
  pitMetricStatus,
  pitTimeMode,
  pitCrewArrivalState,
  pitCountdownLabel,
  recommendPitCrew,
  rollingPitAverage,
  summarizePitSelection,
} from "../services/pitCrewCoach.js";
import {
  fetchPitCrewWeather,
  pitWeatherAlert,
  pitWeatherCrewActions,
  pitWeatherForecastForLoops,
  pitWeatherIcon,
  pitWeatherLoopBrief,
} from "../services/pitCrewWeather.js";
import { athleteCareHints } from "../services/pitCrewCare.js";
import { normalizePitCrewSnapshot } from "../services/pitCrewShareCore.js";
import "./PitCrewLive.css";

const STATUS_OPTIONS = [
  ["hungry", "🍽️", "Hunger"],
  ["thirsty", "💧", "Durst"],
  ["stomach", "🤢", "Magen"],
  ["sweet-fatigue", "🍬", "Süß satt"],
  ["wants-salty", "🥨", "Will salzig"],
  ["no-salty", "🚫", "Kein salzig"],
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

const EMPTY_STOCK_ITEM = {
  label: "",
  category: "food",
  portionLabel: "1 Portion",
  carbs: "",
  fluidMl: "",
  sodiumMg: "",
  caffeineMg: "",
  taste: "neutral",
  digestion: "normal",
};

function safeStoredSession(key) {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "null");
    return parsed && typeof parsed === "object" ? normalizePitCrewSnapshot(parsed) : normalizePitCrewSnapshot();
  } catch {
    return normalizePitCrewSnapshot();
  }
}


function normalizedLiveSelection(value) {
  return (Array.isArray(value) ? value : [])
    .filter((entry) => entry && typeof entry === "object" && entry.productId != null && entry.portionId != null)
    .map((entry) => ({
      ...entry,
      productId: String(entry.productId),
      portionId: String(entry.portionId),
      quantity: Math.max(1, Math.min(20, Math.round(Number(entry.quantity || 1)))),
    }));
}

function normalizedLiveHistory(value) {
  return (Array.isArray(value) ? value : [])
    .filter((record) => record && typeof record === "object")
    .map((record) => ({
      ...record,
      selection: normalizedLiveSelection(record.selection),
      carrySelection: normalizedLiveSelection(record.carrySelection),
      carriedSelection: normalizedLiveSelection(record.carriedSelection),
      flags: Array.isArray(record.flags) ? record.flags.map(String) : [],
      weather: Array.isArray(record.weather) ? record.weather.map(String) : [],
    }));
}

function normalizedCustomProducts(value) {
  return (Array.isArray(value) ? value : []).filter((product) =>
    product && typeof product === "object" && product.id != null && Array.isArray(product.portions) && product.portions.length > 0,
  );
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

function selectionLabel(entry, products = PIT_CREW_PRODUCTS) {
  if (!entry || typeof entry !== "object") return "Versorgung unbekannt";
  const product = (Array.isArray(products) ? products : PIT_CREW_PRODUCTS).find((item) => String(item?.id) === String(entry.productId));
  const portion = product?.portions?.find((item) => String(item.id) === String(entry.portionId));
  if (!product || !portion) return String(entry.productId || "Versorgung unbekannt");
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
  const [history, setHistory] = useState(() => normalizedLiveHistory(stored?.history));
  const [flags, setFlags] = useState(() => Array.isArray(stored?.flags) ? stored.flags : []);
  const [incomingFlags, setIncomingFlags] = useState(() => Array.isArray(stored?.incomingFlags) ? stored.incomingFlags : []);
  const [incomingAt, setIncomingAt] = useState(() => String(stored?.incomingAt || ""));
  const [incomingRound, setIncomingRound] = useState(() => Math.max(0, Number(stored?.incomingRound || 0)));
  const [signalDraft, setSignalDraft] = useState([]);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [arrivalIntakeMode, setArrivalIntakeMode] = useState("planned");
  const [athleteFeedback, setAthleteFeedback] = useState(() => stored?.athleteFeedback && typeof stored.athleteFeedback === "object" ? stored.athleteFeedback : null);
  const [weather, setWeather] = useState(() => Array.isArray(stored?.weather) ? stored.weather : []);
  const [anchorAt, setAnchorAt] = useState(() => stored?.anchorAt || plannedAnchor(race)?.toISOString() || "");
  const [arrivalRound, setArrivalRound] = useState(() => Math.max(0, Number(stored?.arrivalRound || 0)));
  const [arrivalAt, setArrivalAt] = useState(() => String(stored?.arrivalAt || ""));
  const [customProducts, setCustomProducts] = useState(() => normalizedCustomProducts(stored?.customProducts));
  const [stockIds, setStockIds] = useState(() => Array.isArray(stored?.stockIds) ? stored.stockIds : PIT_CREW_DEFAULT_STOCK_IDS);
  const [stockCategory, setStockCategory] = useState("drink");
  const [showStockForm, setShowStockForm] = useState(false);
  const [stockItemDraft, setStockItemDraft] = useState(EMPTY_STOCK_ITEM);
  const [selection, setSelection] = useState([]);
  const [selectionMode, setSelectionMode] = useState("suggestion");
  const [selectionDirty, setSelectionDirty] = useState(false);
  const [carryAdjust, setCarryAdjust] = useState({});
  const [carryDeviationOpen, setCarryDeviationOpen] = useState(false);
  const [pitCategory, setPitCategory] = useState("drink");
  const [saveMessage, setSaveMessage] = useState("");
  const [editingRound, setEditingRound] = useState(null);
  const [autoWeather, setAutoWeather] = useState(null);
  const [weatherError, setWeatherError] = useState("");
  const loadedPitRound = useRef(null);
  const liveSnapshotBeforeDemo = useRef(null);
  const loopFuelingRef = useRef(null);
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
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(storageKey, JSON.stringify({ anchorAt, history, flags, incomingFlags, incomingAt, incomingRound, athleteFeedback, weather, arrivalRound, arrivalAt, stockIds, customProducts }));
  }, [anchorAt, arrivalAt, arrivalRound, athleteFeedback, customProducts, flags, history, incomingAt, incomingFlags, incomingRound, stockIds, storageKey, weather]);

  useEffect(() => {
    if (loadedPitRound.current === pitRound || editingRound != null) return;
    loadedPitRound.current = pitRound;
    const existing = history.find((record) => Number(record.round) === Number(pitRound));
    setSelection(existing ? selectionWithTiming(existing) : []);
    setSelectionMode(existing ? "manual" : "suggestion");
    setSelectionDirty(false);
    setSaveMessage(existing ? `Loop ${Number(pitRound) + 1} ist startklar und kann bei Bedarf angepasst werden.` : "");
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
  const incomingApplies = Number(incomingRound || 0) === Number(timing.currentRound || 0) && Boolean(incomingAt);
  const athleteFeedbackApplies = Boolean(athleteFeedback) && Number(athleteFeedback.round || 0) === Number(timing.currentRound || 0);
  const effectiveAthleteFlags = [...new Set([...(flags || []), ...(incomingApplies ? incomingFlags : [])])];
  const nextLoopWeather = pitWeatherForecastForLoops({
    observation: autoWeather || {},
    nextStart: timing.nextStart,
    intervalMinutes,
    nextRound: Math.max(1, Number(timing.currentRound || 0) + 1),
    count: 3,
  });
  const nextWeatherAlert = pitWeatherAlert(nextLoopWeather[0]);
  const nextLoopWeatherBrief = pitWeatherLoopBrief(nextLoopWeather[0]);
  const weatherCrewActions = pitWeatherCrewActions(nextLoopWeather[0], effectiveAthleteFlags);
  const effectiveWeather = [...new Set([...(autoWeather?.flags || []), ...weather, ...(nextLoopWeather[0]?.flags || [])])];
  const previousHistory = history.filter((record) => Number(record.round) !== Number(saveRound));
  const planningHistory = previousHistory.map((record) => ({
    ...record,
    summary: record.carryStatus === "pending" && record.provisionalSummary ? record.provisionalSummary : record.summary,
  }));
  const pendingCarry = [...history].reverse().find((record) => record.carryStatus === "pending" && Array.isArray(record.carrySelection) && record.carrySelection.length);
  const pendingLoopNumber = pendingCarry ? Number(pendingCarry.round) + 1 : null;
  const arrivalPendingItems = pendingCarry && Number(pendingLoopNumber) === Number(timing.currentRound)
    ? (Array.isArray(pendingCarry.carrySelection) ? pendingCarry.carrySelection : []).filter((entry) => entry && typeof entry === "object" && entry.productId != null && entry.portionId != null)
    : [];
  const singleArrivalItem = arrivalPendingItems.length === 1 ? arrivalPendingItems[0] : null;
  const arrivalPartialRated = arrivalPendingItems.length === 1 || (arrivalPendingItems.length > 1 && arrivalPendingItems.every((entry, index) =>
    Object.prototype.hasOwnProperty.call(carryAdjust, `${pendingCarry?.round ?? "loop"}:${entry.productId}:${entry.portionId}:${index}`),
  ));
  const loopMustClose = false;
  const arrivalState = pitCrewArrivalState({
    started: timing.started,
    currentRound: timing.currentRound,
    arrivalRound,
    loopMustClose: false,
  });
  const athleteNeedsArrival = Boolean(arrivalState.awaitingArrival && editingRound == null);
  const loopReadyToClose = Boolean(pendingCarry && pendingLoopNumber === Number(timing.currentRound) && arrivalState.arrived && editingRound == null);
  const productCatalog = [...PIT_CREW_PRODUCTS, ...normalizedCustomProducts(customProducts)];
  const knownStockIds = new Set(productCatalog.map((product) => String(product.id)));
  const activeStockIds = stockIds.filter((id) => knownStockIds.has(String(id)));
  const availableProducts = productCatalog.filter((product) => activeStockIds.includes(String(product.id)));

  const recommendation = recommendPitCrew({
    round: Math.max(1, timing.currentRound || 1),
    minutesToStart: timing.minutesToStart,
    history: planningHistory,
    flags: effectiveAthleteFlags,
    weather: effectiveWeather,
    products: productCatalog,
    availableProductIds: activeStockIds,
  });

  const suggestionSummary = recommendation.summary;
  const modeTitle = modeLabel(timing.mode);
  const portableMode = recommendation.mode === "go" || recommendation.mode === "quick";
  const suggestedSelection = recommendation.selection.map((item) => {
    const product = productCatalog.find((entry) => String(entry?.id) === String(item?.productId));
    const inferredTiming = portableMode || product?.category === "drink" ? "carry" : "now";
    return { ...item, timing: item.timing || inferredTiming, quantity: quantity(item) };
  });
  const suggestionPit = suggestedSelection.filter((entry) => (entry.timing || "now") === "now");
  const suggestionLoop = suggestedSelection.filter((entry) => (entry.timing || "now") === "carry");
  const activeSelection = normalizedLiveSelection(selectionMode === "suggestion" && editingRound == null ? suggestedSelection : selection);
  const readyLoopNumber = Math.max(1, Number(saveRound || 0) + 1);
  const savedCurrentPit = editingRound == null
    ? history.find((record) => Number(record.round) === Number(saveRound))
    : null;
  const savedLoopReady = Boolean(savedCurrentPit && !loopMustClose && !selectionDirty);
  const assessment = assessPitSelection(activeSelection, planningHistory, { weather: effectiveWeather, products: productCatalog });
  const historyRolling = rollingPitAverage(history, null, 3, productCatalog);
  const metricStatus = pitMetricStatus(assessment.summary, assessment.rolling, { weather: effectiveWeather });
  const lastRecord = history.length ? history[history.length - 1] : null;
  const lastActualSummary = lastRecord
    ? (lastRecord.carryStatus === "pending" && lastRecord.provisionalSummary ? lastRecord.provisionalSummary : lastRecord.summary || summarizePitSelection(lastRecord.selection || [], productCatalog))
    : { carbs: 0, fluidMl: 0, caffeineMg: 0 };
  const actualMetricStatus = pitMetricStatus(lastActualSummary, historyRolling, { weather: effectiveWeather });
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
    flags: effectiveAthleteFlags,
    weather: effectiveWeather,
    recentWeather: planningHistory.slice(-3).map((record) => record.weather || []),
    observation: autoWeather,
  });

  const careLevel = athleteCare.level || (athleteCare.hints.length ? "notice" : "good");
  const careIndicator = careLevel === "urgent" ? "❗" : careLevel === "notice" ? "⚠️" : "✓";
  const careNeedsAttention = careLevel !== "good";

  function historyTone(record, index) {
    if (record.carryStatus === "pending") return "open";
    const recordSummary = record.summary || summarizePitSelection(record.selection || [], productCatalog);
    const rolling = rollingPitAverage(history.slice(Math.max(0, index - 2), index + 1), null, 3, productCatalog);
    const status = pitMetricStatus(recordSummary, rolling, { weather: record.weather || [] });
    if (status.carbs === "high" || status.fluid === "high" || status.rolling === "high") return "high";
    if (status.carbs === "low" || status.fluid === "low" || status.rolling === "low") return "low";
    return "good";
  }

  function updateSelection(mutator) {
    const base = selectionMode === "suggestion" && editingRound == null ? suggestedSelection : selection;
    setSelection(mutator(base));
    setSelectionMode("manual");
    setSelectionDirty(true);
    setSaveMessage("");
  }

  function selectPortion(productId, portionId, timingMode) {
    updateSelection((current) => {
      const existing = current.find((item) => item.productId === productId && (item.timing || "now") === timingMode);
      if (existing && String(existing.portionId) === String(portionId)) return current;
      return [
        ...current.filter((item) => !(item.productId === productId && (item.timing || "now") === timingMode)),
        { productId, portionId: String(portionId), timing: timingMode, quantity: 1 },
      ];
    });
  }

  function changeQuantity(productId, timingMode, delta) {
    updateSelection((current) => current.flatMap((entry) => {
      if (entry.productId !== productId || (entry.timing || "now") !== timingMode) return [entry];
      const next = Math.max(0, Math.min(20, quantity(entry) + delta));
      return next ? [{ ...entry, quantity: next }] : [];
    }));
  }

  function markAthleteReturned() {
    if (!timing.started || !(Number(timing.currentRound) > 0)) return;
    const round = Math.max(1, Number(timing.currentRound));
    const returnedAt = new Date().toISOString();
    setArrivalRound(round);
    setArrivalAt(returnedAt);
    setArrivalIntakeMode("planned");
    setCarryAdjust({});
    if (incomingApplies) {
      const reportedFlags = [...incomingFlags];
      setFlags(reportedFlags);
      setAthleteFeedback({ round, flags: reportedFlags, at: incomingAt || returnedAt, source: "athlete" });
      // Athlete status is already known. Open the return sheet only when the
      // just-finished loop still has carried fuel that should be confirmed.
      setCheckInOpen(Boolean(pendingCarry && Number(pendingLoopNumber) === round));
      setIncomingFlags([]);
      setIncomingAt("");
      setIncomingRound(0);
      setSignalDraft([]);
      setSaveMessage(reportedFlags.length
        ? `Rückmeldung Athlet übernommen · ${compactStatus(reportedFlags)} · Pit-Vorschlag angepasst.`
        : "Rückmeldung Athlet: Alles okay · keine Änderung am vorbereiteten Plan.");
      return;
    }
    setFlags([]);
    setAthleteFeedback(null);
    setCheckInOpen(true);
    setSaveMessage(`Loop ${round}: Athlet zurück · Countdown bis Start ${pitCountdownLabel(timing.minutesToStart)}.`);
  }

  function sendIncomingSignal() {
    if (!timing.started || !(Number(timing.currentRound) > 0)) return;
    const round = Math.max(1, Number(timing.currentRound));
    setIncomingFlags([...signalDraft]);
    setIncomingRound(round);
    setIncomingAt(new Date().toISOString());
    setSaveMessage(signalDraft.length ? `Athletenmeldung für Loop ${round} gesendet · Crew kann vorbereiten.` : `Athletenmeldung für Loop ${round}: alles okay.`);
  }

  function finishAthleteCheckIn() {
    const round = Math.max(1, Number(timing.currentRound || 1));
    const athleteAlreadyReported = athleteFeedbackApplies && athleteFeedback?.source === "athlete";
    if (!athleteAlreadyReported) {
      setAthleteFeedback({ round, flags: [...flags], at: new Date().toISOString(), source: "crew" });
    }
    if (pendingCarry && Number(pendingLoopNumber) === round) {
      if (arrivalIntakeMode === "partial") confirmPendingCarry(arrivalPendingItems.length === 1 ? "half" : "rated");
      else if (arrivalIntakeMode === "none") confirmPendingCarry("none");
      else confirmPendingCarry("planned");
    }
    setCheckInOpen(false);
    setArrivalIntakeMode("planned");
    setIncomingFlags([]);
    setIncomingAt("");
    setIncomingRound(0);
    setSignalDraft([]);
    setSaveMessage(`Loop ${round}: Rückkehr übernommen · Status und Versorgung sind aktualisiert.`);
  }

  function toggleStockProduct(productId) {
    const id = String(productId);
    const removing = stockIds.includes(id);
    setStockIds((current) => removing ? current.filter((item) => String(item) !== id) : [...new Set([...current, id])]);
    if (removing) {
      setSelection((current) => current.filter((entry) => String(entry.productId) !== id));
      if (selectionMode === "manual") setSelectionDirty(true);
    }
    setSaveMessage(removing ? "Aus Vorrat entfernt · Vorschlag wird automatisch angepasst." : "Zum Vorrat hinzugefügt · ab jetzt für Fueling verfügbar.");
  }

  function selectStarterStock() {
    const customIds = customProducts.map((product) => product.id);
    setStockIds([...new Set([...PIT_CREW_DEFAULT_STOCK_IDS, ...customIds])]);
    setSaveMessage("Besprochener Backyard-Grundstock aktiviert. Zusätzliche Basics bleiben optional.");
  }

  function addCustomStockItem(event) {
    event.preventDefault();
    const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const product = buildPitCrewCustomProduct(stockItemDraft, id);
    if (!product) {
      setSaveMessage("Bitte einen Namen für das neue Vorrats-Produkt eintragen.");
      return;
    }
    setCustomProducts((current) => [...current, product]);
    setStockIds((current) => [...new Set([...current, product.id])]);
    setStockItemDraft(EMPTY_STOCK_ITEM);
    setShowStockForm(false);
    setStockCategory(product.category);
    setSaveMessage(`${product.label} zum Vorrat hinzugefügt · Nährwerte werden als eigene Schätzung markiert.`);
  }

  function removeCustomStockItem(productId) {
    const id = String(productId);
    setCustomProducts((current) => current.filter((product) => String(product.id) !== id));
    setStockIds((current) => current.filter((item) => String(item) !== id));
    setSelection((current) => current.filter((entry) => String(entry.productId) !== id));
    setSaveMessage("Eigenes Vorrats-Produkt entfernt.");
  }

  function savePit() {
    if (!activeSelection.length) {
      setSaveMessage("Noch nichts vorgesehen. Bitte Fueling Pit bzw. Loop prüfen.");
      return;
    }
    const existing = history.find((item) => Number(item.round) === Number(saveRound));
    const consumedSelection = activeSelection.filter((entry) => entry.timing !== "carry").map(({ productId, portionId, quantity: count }) => ({ productId, portionId, quantity: quantity({ quantity: count }) }));
    const carrySelection = activeSelection.filter((entry) => entry.timing === "carry").map(({ productId, portionId, quantity: count }) => ({ productId, portionId, quantity: quantity({ quantity: count }) }));
    const summary = summarizePitSelection(consumedSelection, productCatalog);
    const provisionalSummary = summarizePitSelection([...consumedSelection, ...carrySelection], productCatalog);
    const record = {
      round: saveRound,
      recordedAt: new Date().toISOString(),
      selection: consumedSelection,
      carrySelection,
      carriedSelection: carrySelection.length ? carrySelection : (existing?.carriedSelection || []),
      carryStatus: carrySelection.length ? "pending" : "none",
      summary,
      provisionalSummary,
      flags: editingRound != null && existing ? [...(existing.flags || [])] : [...flags],
      weather: editingRound != null && existing ? [...(existing.weather || [])] : [...effectiveWeather],
    };
    setHistory((current) => {
      const finalized = current.map((item) => {
        if (item.carryStatus !== "pending" || Number(item.round) >= Number(saveRound)) return item;
        const merged = [...(item.selection || []), ...(item.carrySelection || [])];
        const confirmedSummary = summarizePitSelection(merged, productCatalog);
        return {
          ...item,
          selection: merged,
          carriedSelection: (item.carrySelection || []).map((entry) => ({ ...entry })),
          carrySelection: [],
          summary: confirmedSummary,
          provisionalSummary: confirmedSummary,
          carryStatus: "confirmed",
          carryConfirmedAt: new Date().toISOString(),
          carryAssumption: "planned",
        };
      });
      return [...finalized.filter((item) => Number(item.round) !== Number(saveRound)), record]
        .sort((left, right) => Number(left.round) - Number(right.round));
    });
    setSaveMessage(editingRound != null
      ? `Pit ${saveRound} korrigiert.`
      : `Loop ${readyLoopNumber} startklar · ${formatNumber(summary.carbs)} g im Pit bestätigt${carrySelection.length ? ` · ${formatNumber(provisionalSummary.carbs - summary.carbs)} g mitgegeben` : ""}.`);
    setSelectionMode("manual");
    setSelectionDirty(false);
    setEditingRound(null);
  }

  function carryResultKey(entry, index) {
    return `${pendingCarry?.round ?? "loop"}:${String(entry?.productId || "unknown")}:${String(entry?.portionId || "unknown")}:${index}`;
  }

  function setCarryResult(entry, index, intakeFactor) {
    const key = carryResultKey(entry, index);
    setCarryAdjust((current) => ({ ...current, [key]: intakeFactor }));
    setSaveMessage("");
  }

  function confirmPendingCarry(mode = "planned") {
    if (!pendingCarry) return;
    const consumedCarry = pendingCarry.carrySelection.flatMap((entry, index) => {
      const key = carryResultKey(entry, index);
      const factor = mode === "planned"
        ? 1
        : mode === "none"
          ? 0
          : mode === "half"
            ? 0.5
            : Number(carryAdjust[key]);
      if (!Number.isFinite(factor) || factor <= 0) return [];
      return [{ ...entry, intakeFactor: Math.max(0, Math.min(1, factor)) }];
    });
    const carriedSelection = pendingCarry.carrySelection.map((entry) => ({ ...entry }));
    setHistory((current) => current.map((record) => {
      if (Number(record.round) !== Number(pendingCarry.round)) return record;
      const merged = [...(record.selection || []), ...consumedCarry];
      const summary = summarizePitSelection(merged, productCatalog);
      return {
        ...record,
        selection: merged,
        carriedSelection,
        carrySelection: [],
        summary,
        provisionalSummary: summary,
        carryStatus: "confirmed",
        carryConfirmedAt: new Date().toISOString(),
      };
    }));
    setCarryAdjust({});
    setCarryDeviationOpen(false);
    setSaveMessage(`Loop ${Number(pendingCarry.round) + 1}: Abweichung übernommen · Engine rechnet mit der Realität weiter.`);
  }

  function editLastPit() {
    if (!lastRecord) return;
    setEditingRound(Number(lastRecord.round));
    setSelection(selectionWithTiming(lastRecord));
    setSelectionMode("manual");
    setSelectionDirty(false);
    setSaveMessage(`Pit ${lastRecord.round} zur Korrektur geöffnet.`);
  }

  function beginDemo() {
    if (!demoActive) {
      liveSnapshotBeforeDemo.current = {
        selection,
        selectionMode,
        selectionDirty,
        arrivalRound,
        arrivalAt,
        incomingFlags,
        incomingAt,
        incomingRound,
        athleteFeedback,
        carryAdjust,
        editingRound,
        saveMessage,
        stockIds,
        customProducts,
      };
    }
    if (typeof window !== "undefined") {
      if (!demoActive) window.localStorage.setItem(baseStorageKey, JSON.stringify({ anchorAt, history, flags, incomingFlags, incomingAt, incomingRound, weather, arrivalRound, arrivalAt, stockIds, customProducts }));
      window.localStorage.removeItem(`${baseStorageKey}:demo`);
    }
    setDemoActive(true);
    setDemoRound(1);
    setDemoMinutesToStart(10);
    setHistory([]);
    setFlags([]);
    setIncomingFlags([]);
    setIncomingAt("");
    setIncomingRound(0);
    setSignalDraft([]);
    setCheckInOpen(false);
    setAthleteFeedback(null);
    setWeather([]);
    setArrivalRound(0);
    setArrivalAt("");
    setSelection([]);
    setSelectionMode("suggestion");
    setSelectionDirty(false);
    setCarryAdjust({});
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
    setIncomingFlags(Array.isArray(liveStored?.incomingFlags) ? liveStored.incomingFlags : (Array.isArray(transient.incomingFlags) ? transient.incomingFlags : []));
    setIncomingAt(String(liveStored?.incomingAt || transient.incomingAt || ""));
    setIncomingRound(Math.max(0, Number(liveStored?.incomingRound || transient.incomingRound || 0)));
    setSignalDraft([]);
    setCheckInOpen(false);
    setAthleteFeedback(liveStored?.athleteFeedback && typeof liveStored.athleteFeedback === "object" ? liveStored.athleteFeedback : (transient.athleteFeedback || null));
    setWeather(Array.isArray(liveStored?.weather) ? liveStored.weather : []);
    setAnchorAt(liveStored?.anchorAt || plannedAnchor(race)?.toISOString() || "");
    setArrivalRound(Math.max(0, Number(liveStored?.arrivalRound || transient.arrivalRound || 0)));
    setArrivalAt(String(liveStored?.arrivalAt || transient.arrivalAt || ""));
    setCustomProducts(Array.isArray(liveStored?.customProducts) ? liveStored.customProducts : (Array.isArray(transient.customProducts) ? transient.customProducts : []));
    setStockIds(Array.isArray(liveStored?.stockIds) ? liveStored.stockIds : (Array.isArray(transient.stockIds) ? transient.stockIds : PIT_CREW_DEFAULT_STOCK_IDS));
    setSelection(Array.isArray(transient.selection) ? transient.selection : []);
    setSelectionMode(transient.selectionMode || "suggestion");
    setSelectionDirty(Boolean(transient.selectionDirty));
    setCarryAdjust(transient.carryAdjust || {});
    setEditingRound(transient.editingRound ?? null);
    setSaveMessage("Demo beendet · zurück in der echten Live-Session.");
    liveSnapshotBeforeDemo.current = null;
    loadedPitRound.current = null;
  }

  function moveDemoLoop(delta) {
    if (!demoActive) return;
    if (delta > 0 && loopMustClose) {
      setSaveMessage(`Bitte Loop ${pendingLoopNumber} zuerst abschließen.`);
      return;
    }
    setDemoRound((current) => Math.max(1, Number(current || 1) + delta));
    setDemoMinutesToStart(10);
    setArrivalRound(0);
    setArrivalAt("");
    setEditingRound(null);
    setSelection([]);
    setSelectionMode("suggestion");
    setSelectionDirty(false);
    setCarryAdjust({});
    setSaveMessage(delta > 0 ? "Nächste Demo-Loop geladen." : "Vorherige Demo-Loop geladen.");
    loadedPitRound.current = null;
  }

  function clearTimingSelection(timingMode) {
    updateSelection((current) => current.filter((entry) => (entry.timing || "now") !== timingMode));
  }

  function renderStockSection() {
    const categoryProducts = productCatalog.filter((product) => product.category === stockCategory);
    return (
      <details className="pit-live-collapse pit-live-stock">
        <summary><span>VORRAT</span><b>{activeStockIds.length} verfügbar{customProducts.length ? ` · ${customProducts.length} eigene` : ""}</b><i>›</i></summary>
        <div className="pit-live-collapse-body">
          <p className="pit-live-help">Nur aktivierte Sachen tauchen im Fueling und im Idealvorschlag auf. Zusätzliche Basics bleiben fern, bis du sie antippst.</p>
          <div className="pit-live-stock-actions">
            <button type="button" className="pit-live-secondary" onClick={selectStarterStock}>Besprochenen Grundstock wählen</button>
            <button type="button" className="pit-live-primary" onClick={() => setShowStockForm((value) => !value)}>＋ Eigenes Produkt</button>
          </div>
          <div className="pit-live-category-tabs">
            {CATEGORIES.map(([key, label]) => <button type="button" key={key} className={stockCategory === key ? "active" : ""} onClick={() => setStockCategory(key)}>{label}</button>)}
          </div>
          <div className="pit-live-stock-grid">
            {categoryProducts.map((product) => {
              const active = activeStockIds.includes(String(product.id));
              const portion = product.portions?.find((item) => !item.hidden) || product.portions?.[0];
              return <article key={product.id} className={active ? "active" : ""}>
                <button type="button" className="pit-live-stock-toggle" onClick={() => toggleStockProduct(product.id)}>
                  <span>{active ? "✓" : "+"}</span><b>{product.icon} {product.label}</b>
                  <small>{portion ? `${portion.label} · ${formatNumber(portion.carbs)} g KH` : "Portion offen"}{product.estimated ? " · ≈" : ""}</small>
                </button>
                {product.custom && <button type="button" className="pit-live-stock-remove" onClick={() => removeCustomStockItem(product.id)}>Entfernen</button>}
              </article>;
            })}
          </div>
          {showStockForm && <form className="pit-live-stock-form" onSubmit={addCustomStockItem}>
            <div className="pit-live-stock-form-head"><b>Eigenes Produkt hinzufügen</b><span>Für Restaurant-/Hausmannskost reichen praxisnahe Werte. Sie werden bewusst als ≈ Schätzung gespeichert.</span></div>
            <label className="wide"><span>Name</span><input value={stockItemDraft.label} onChange={(event) => setStockItemDraft((current) => ({ ...current, label: event.target.value }))} placeholder="z. B. Pizza vom Lieferdienst" /></label>
            <label><span>Kategorie</span><select value={stockItemDraft.category} onChange={(event) => setStockItemDraft((current) => ({ ...current, category: event.target.value }))}><option value="food">Essen</option><option value="drink">Getränk</option><option value="gel">Gel</option><option value="refresh">Refresh</option></select></label>
            <label><span>Portion</span><input value={stockItemDraft.portionLabel} onChange={(event) => setStockItemDraft((current) => ({ ...current, portionLabel: event.target.value }))} placeholder="1 Stück" /></label>
            <label><span>KH pro Portion · g</span><input type="number" min="0" step="0.1" value={stockItemDraft.carbs} onChange={(event) => setStockItemDraft((current) => ({ ...current, carbs: event.target.value }))} /></label>
            <label><span>Flüssigkeit · ml</span><input type="number" min="0" step="1" value={stockItemDraft.fluidMl} onChange={(event) => setStockItemDraft((current) => ({ ...current, fluidMl: event.target.value }))} /></label>
            <label><span>Natrium · mg</span><input type="number" min="0" step="1" value={stockItemDraft.sodiumMg} onChange={(event) => setStockItemDraft((current) => ({ ...current, sodiumMg: event.target.value }))} /></label>
            <label><span>Koffein · mg</span><input type="number" min="0" step="0.1" value={stockItemDraft.caffeineMg} onChange={(event) => setStockItemDraft((current) => ({ ...current, caffeineMg: event.target.value }))} /></label>
            <label><span>Geschmack</span><select value={stockItemDraft.taste} onChange={(event) => setStockItemDraft((current) => ({ ...current, taste: event.target.value }))}><option value="neutral">neutral</option><option value="sweet">süß</option><option value="savory">salzig/herzhaft</option></select></label>
            <label><span>Magenlast</span><select value={stockItemDraft.digestion} onChange={(event) => setStockItemDraft((current) => ({ ...current, digestion: event.target.value }))}><option value="light">leicht</option><option value="normal">normal</option><option value="heavy">eher schwer</option></select></label>
            <p className="wide">KH sind die Pflicht-Rechengröße. Flüssigkeit, Natrium und Koffein nur eintragen, wenn sie sinnvoll bekannt sind. Fett/Protein/Kalorien müssen die Crew im Rennen nicht pflegen.</p>
            <div className="pit-live-stock-form-actions wide"><button type="button" className="pit-live-secondary" onClick={() => setShowStockForm(false)}>Abbrechen</button><button type="submit" className="pit-live-primary">Zum Vorrat hinzufügen</button></div>
          </form>}
        </div>
      </details>
    );
  }

  function renderPitFuelingSection() {
    const selected = activeSelection.filter((entry) => (entry.timing || "now") === "now");
    const summary = summarizePitSelection(selected, productCatalog);
    const products = availableProducts.filter((product) => product.category === pitCategory);
    return (
      <details className="pit-live-collapse">
        <summary>
          <span>FUELING PIT</span>
          <b>{selected.length ? `${formatNumber(summary.carbs)} g KH · ${summary.fluidMl} ml` : "noch nichts im Pit"}</b>
          <i>›</i>
        </summary>
        <div className="pit-live-collapse-body pit-live-intake">
          {editingRound != null && <div className="pit-live-edit-banner">Pit {editingRound} wird korrigiert. Speichern ersetzt nur diesen Pit.</div>}
          <p className="pit-live-help">Der Idealvorschlag ist vorausgewählt. Nur ändern, wenn im Pit tatsächlich etwas anderes gegessen oder getrunken wird.</p>
          <div className="pit-live-category-tabs">
            {CATEGORIES.map(([key, label]) => <button type="button" key={key} className={pitCategory === key ? "active" : ""} onClick={() => setPitCategory(key)}>{label}</button>)}
          </div>
          {!products.length && <p className="pit-live-loop-empty">In dieser Kategorie ist aktuell nichts im Vorrat aktiviert. Unter „Vorrat“ kannst du es jederzeit hinzufügen.</p>}
          <div className="pit-live-product-grid">
            {products.map((product) => {
              const selectedInMode = activeSelection.find((item) => item.productId === product.id && (item.timing || "now") === "now");
              return (
                <article key={product.id} className={selectedInMode ? "selected" : ""}>
                  <div><b>{product.icon}</b><strong>{product.label}{product.estimated ? " ≈" : ""}</strong>{selectedInMode && quantity(selectedInMode) > 1 && <em>×{quantity(selectedInMode)}</em>}</div>
                  <div className="pit-live-portions">
                    {product.portions.filter((portion) => !portion.hidden).map((portion) => (
                      <button type="button" key={portion.id} className={selectedInMode && String(selectedInMode.portionId) === String(portion.id) ? "active" : ""} onClick={() => selectPortion(product.id, portion.id, "now")}>
                        <b>{portion.label}</b><span>{portion.carbs ? `${formatNumber(portion.carbs)} g KH` : "0 g KH"}</span>
                      </button>
                    ))}
                  </div>
                  {selectedInMode && (
                    <div className="pit-live-quantity">
                      <button type="button" onClick={() => changeQuantity(product.id, "now", -1)}>−</button>
                      <b>{quantity(selectedInMode)}</b>
                      <button type="button" onClick={() => changeQuantity(product.id, "now", 1)}>+</button>
                      <span>{formatNumber(summarizePitSelection([selectedInMode], productCatalog).carbs)} g KH gesamt</span>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
          {selected.length > 0 && <button type="button" className="pit-live-secondary pit-live-clear" onClick={() => clearTimingSelection("now")}>Fueling Pit Auswahl leeren</button>}
        </div>
      </details>
    );
  }

  function renderLoopFuelingSection({ priority = false } = {}) {
    const planned = activeSelection.filter((entry) => (entry.timing || "now") === "carry");
    const plannedSummary = summarizePitSelection(planned, productCatalog);
    const activePending = loopReadyToClose ? pendingCarry : null;
    const awaitingReturn = loopMustClose && !arrivalState.arrived ? pendingCarry : null;
    const preparedPending = !loopMustClose && pendingCarry && Number(pendingCarry.round) === Number(pitRound)
      ? pendingCarry
      : null;
    const loopNumber = activePending
      ? Number(activePending.round) + 1
      : awaitingReturn
        ? Number(awaitingReturn.round) + 1
        : preparedPending
          ? Number(preparedPending.round) + 1
          : Math.max(1, Number(saveRound) + 1);
    const pendingItems = activePending?.carrySelection || [];
    const runningItems = awaitingReturn?.carrySelection || [];
    const preparedItems = preparedPending?.carrySelection || [];
    const allRated = pendingItems.length > 0 && pendingItems.every((entry, index) => Object.prototype.hasOwnProperty.call(carryAdjust, carryResultKey(entry, index)));
    const summary = activePending
      ? `✓ Loop ${loopNumber} · wie geplant`
      : awaitingReturn
        ? `Loop ${loopNumber} läuft`
        : preparedPending
          ? `✓ Loop ${loopNumber} startklar`
          : planned.length
            ? `${formatNumber(plannedSummary.carbs)} g KH · ${plannedSummary.fluidMl} ml`
            : "noch nichts für Loop";

    return (
      <details
        ref={loopFuelingRef}
        className={`pit-live-collapse pit-live-loop ${activePending ? (carryDeviationOpen ? "loop-open" : "loop-ready") : awaitingReturn ? "loop-running" : preparedPending ? "loop-ready" : ""}${priority ? " priority" : ""}`}
        open={carryDeviationOpen ? true : undefined}
      >
        <summary><span>FUELING LOOP</span><b>{summary}</b><i>›</i></summary>
        <div className="pit-live-collapse-body">
          {activePending ? (
            <div className="pit-live-loop-confirm pit-live-loop-confirm-simple">
              <div className="pit-live-loop-confirm-head">
                <small>LOOP {loopNumber} · VORLÄUFIG WIE GEPLANT VERBUCHT</small>
                <strong>✓ Aufnahme zählt bereits in den Live-Daten</strong>
                <span>Keine Extra-Bestätigung nötig. Nur wenn real etwas anders war, kurz „Abweichung melden“ tippen.</span>
              </div>
              {!carryDeviationOpen ? (
                <button type="button" className="pit-live-secondary pit-live-wide" onClick={() => setCarryDeviationOpen(true)}>Abweichung melden</button>
              ) : (
                <>
                  <div className="pit-live-loop-items">
                    {pendingItems.map((entry, index) => {
                      const key = carryResultKey(entry, index);
                      const selectedFactor = carryAdjust[key];
                      const product = productCatalog.find((item) => item.id === entry.productId);
                      const options = product?.category === "drink"
                        ? [[1, "✓ komplett"], [0.5, "½ teilweise"], [0, "nicht"]]
                        : [[1, "✓ genommen"], [0, "nicht"]];
                      return (
                        <div className="pit-live-loop-item" key={key}>
                          <b>{selectionLabel(entry, productCatalog)}</b>
                          <div>
                            {options.map(([factor, label]) => (
                              <button type="button" key={factor} className={Number(selectedFactor) === factor ? "active" : ""} onClick={() => setCarryResult(entry, index, factor)}>{label}</button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="pit-live-loop-finish">
                    <button type="button" className="pit-live-secondary" onClick={() => { setCarryDeviationOpen(false); setCarryAdjust({}); }}>Abbrechen</button>
                    <button type="button" className="pit-live-primary" disabled={!allRated} onClick={() => confirmPendingCarry("rated")}>Abweichung übernehmen</button>
                  </div>
                </>
              )}
            </div>
          ) : awaitingReturn ? (
            <div className="pit-live-loop-plan pit-live-loop-running-copy">
              <p className="pit-live-help">Loop {loopNumber} läuft. Die mitgegebene Versorgung wird vorläufig als planmäßig gerechnet. Bei Rückkehr nur eine Abweichung melden, falls real etwas anders war.</p>
              {runningItems.length ? <div className="pit-live-loop-plan-items">{runningItems.map((entry) => <span key={`${entry.productId}:${entry.portionId}`}>{selectionLabel(entry, productCatalog)}</span>)}</div> : <p className="pit-live-loop-empty">Für diese Loop wurde kein zusätzliches Loop-Fueling mitgegeben.</p>}
            </div>
          ) : preparedPending ? (
            <div className="pit-live-loop-plan pit-live-loop-prepared">
              <p className="pit-live-help">Loop {loopNumber} ist vorbereitet. Das hier wurde mitgegeben:</p>
              {preparedItems.length ? <div className="pit-live-loop-plan-items">{preparedItems.map((entry) => <span key={`${entry.productId}:${entry.portionId}`}>{selectionLabel(entry, productCatalog)}</span>)}</div> : <p className="pit-live-loop-empty">Kein zusätzliches Loop-Fueling mitgegeben.</p>}
              <p className="pit-live-loop-ready-note">✓ Standardmäßig wird „wie geplant“ übernommen. Nur eine Abweichung muss die Crew melden.</p>
            </div>
          ) : (
            <div className="pit-live-loop-plan">
              <p className="pit-live-help">Hier wird nur gezeigt, was für Loop {loopNumber} mitgegeben wird. Der Idealvorschlag oben legt das automatisch fest.</p>
              {planned.length ? (
                <>
                  <div className="pit-live-loop-plan-items">{planned.map((entry) => <span key={`${entry.productId}:${entry.portionId}`}>{selectionLabel(entry, productCatalog)}</span>)}</div>
                  <button type="button" className="pit-live-secondary pit-live-clear" onClick={() => clearTimingSelection("carry")}>Loop-Fueling leeren</button>
                </>
              ) : <p className="pit-live-loop-empty">Für diese Loop ist aktuell kein zusätzliches Loop-Fueling vorgesehen.</p>}
            </div>
          )}
        </div>
      </details>
    );
  }

  function renderAthleteCareSection({ priority = false } = {}) {
    return (
      <details className={`pit-live-collapse pit-live-care care-${careLevel}${priority ? " priority" : ""}`} open={priority ? true : undefined}>
        <summary><span>ATHLETE CARE {careIndicator}</span><b>{athleteCare.summary}</b><i>›</i></summary>
        <div className="pit-live-collapse-body">
          <p className="pit-live-help">Nur Gedächtnisstützen für die Crew – nichts abhaken, nichts erzwingen. Hinweise passen sich an Restzeit, Rennverlauf, Athletenstatus und Wetter an.</p>
          {athleteCare.hints.length ? (
            <div className="pit-live-care-list">
              {athleteCare.hints.map((hint) => (
                <div key={hint.key} className={careLevel === "urgent" && hint.urgent ? "urgent" : ""}>
                  <b>{hint.icon}</b>
                  <span>{hint.text}</span>
                </div>
              ))}
            </div>
          ) : <p className="pit-live-care-clear">✓ Aktuell keine besondere Care-Aktion nötig. Routine ruhig weiterlaufen lassen.</p>}
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
    setIncomingFlags([]);
    setIncomingAt("");
    setIncomingRound(0);
    setSignalDraft([]);
    setCheckInOpen(false);
    setAthleteFeedback(null);
    setWeather([]);
    setArrivalRound(0);
    setArrivalAt("");
    setCustomProducts([]);
    setStockIds(PIT_CREW_DEFAULT_STOCK_IDS);
    setSelection([]);
    setSelectionMode("suggestion");
    setSelectionDirty(false);
    setCarryAdjust({});
    setCarryDeviationOpen(false);
    setEditingRound(null);
    setAnchorAt(plannedAnchor(race)?.toISOString() || "");
    setSaveMessage("Live-Session zurückgesetzt.");
  }

  return (
    <div className="pit-live-shell" role="dialog" aria-modal="true" aria-label="Pit Crew Live">
      <header className="pit-live-topbar">
        <div><small>PIT CREW LIVE{demoActive ? " · TESTMODUS" : ""}</small><strong>{race?.name || "Backyard"}</strong></div>
        <button type="button" onClick={onClose} aria-label="Pit Crew schließen">Schließen</button>
      </header>

      <main className="pit-live-main">
        <details className="pit-live-collapse pit-live-weather-top">
          <summary className="pit-live-weather-summary">
            <div className="pit-live-weather-summary-label">
              <span>{nextLoopWeather[0] ? `WETTER FÜR LOOP ${nextLoopWeather[0].round}` : "WETTER"}</span>
              {nextLoopWeather[0] && <small>{hhmm(nextLoopWeather[0].startAt)}–{hhmm(nextLoopWeather[0].endAt)}</small>}
            </div>
            <div className="pit-live-weather-summary-main">
              <b>{nextLoopWeatherBrief ? nextLoopWeatherBrief.headline : autoWeather ? `${pitWeatherIcon(autoWeather.weatherCode, autoWeather.isDay)} ${autoWeather.temperature} °C · ${autoWeather.windSpeed} km/h` : weatherError ? "Auto nicht verfügbar" : "wird automatisch geladen …"}</b>
              {nextLoopWeather[0] && <small>Gefühlt {nextLoopWeather[0].feelsLike} °C · Regen {nextLoopWeather[0].precipitationProbability} % · Wind {nextLoopWeather[0].windSpeed} km/h · Böen {nextLoopWeather[0].windGusts} km/h</small>}
              {nextLoopWeatherBrief && <span className={`pit-live-weather-summary-advice tone-${nextLoopWeatherBrief.tone}`}>{nextLoopWeatherBrief.detail}</span>}
            </div>
            <i>›</i>
          </summary>
          <div className="pit-live-collapse-body">
            {autoWeather ? <>
              {nextLoopWeatherBrief && <div className={`pit-live-weather-brief tone-${nextLoopWeatherBrief.tone}`}><small>KOMMENDER LOOP</small><strong>{nextLoopWeatherBrief.headline}</strong><span>{nextLoopWeatherBrief.detail}</span></div>}
              <div className="pit-live-weather-facts"><span><b>{autoWeather.feelsLike} °C</b> gefühlt</span><span><b>{autoWeather.humidity} %</b> Feuchte</span><span><b>{formatNumber(autoWeather.precipitation)} mm</b> Regen</span><span><b>{autoWeather.windGusts} km/h</b> Böen</span></div>
              <div className="pit-live-weather-horizon"><span>PLANUNG</span><b>{Math.round(Number(autoWeather.horizonMinutes || 0) / 60)} h</b><small>{race?.eventLimitMode === "open" ? "Open End · Einsatzhorizont, kein Rennende" : "Eventhorizont"}</small></div>
              {nextLoopWeather.length > 0 && <div className="pit-live-weather-next">
                <div className="pit-live-weather-next-head"><small>NÄCHSTE LOOPS</small><strong>{nextWeatherAlert?.label || "Wettertrend"}</strong></div>
                <div className="pit-live-weather-loop-grid">{nextLoopWeather.map((forecast) => {
                  const alert = pitWeatherAlert(forecast);
                  const loopActions = pitWeatherCrewActions(forecast, effectiveAthleteFlags);
                  return <article key={forecast.round} className={`tone-${alert?.tone || "good"}`}><div><span>LOOP {forecast.round}</span><b>{hhmm(forecast.startAt)}–{hhmm(forecast.endAt)}</b></div><strong>{pitWeatherIcon(forecast.weatherCode, forecast.isDay)} {forecast.temperature} °C <em>· gefühlt {forecast.feelsLike} °C</em></strong><small>Regen {forecast.precipitationProbability} % · {formatNumber(forecast.precipitation)} mm · Feuchte {forecast.humidity} %<br />Wind {forecast.windSpeed} km/h · Böen {forecast.windGusts} km/h</small>{loopActions.length > 0 && <div className="pit-live-weather-loop-actions">{loopActions.slice(0, 3).map((action) => <span key={action}>{action}</span>)}</div>}</article>;
                })}</div>
              </div>}
              {weatherCrewActions.length > 0 && <div className="pit-live-weather-actions"><small>CREW VORBEREITEN</small><div>{weatherCrewActions.map((action) => <span key={action}>{action}</span>)}</div></div>}
            </> : <p className="pit-live-help">{weatherError || "Wetter wird geladen …"}</p>}
            <details className="pit-live-weather-override">
              <summary>Wetter vor Ort weicht deutlich ab</summary>
              <p className="pit-live-help">Nur hier korrigieren, wenn die reale Situation sichtbar anders ist als der Forecast.</p>
              <div className="pit-live-weather-grid">
                {WEATHER_OPTIONS.map(([key, icon, label]) => <button type="button" key={key} className={weather.includes(key) ? "active" : ""} onClick={() => setWeather((current) => toggleValue(current, key))}>{icon} {label}</button>)}
              </div>
            </details>
          </div>
        </details>

        <section className={`pit-live-clock mode-${timing.mode} ${timing.started ? "" : "prestart"}`}>
          <b>{timing.started ? `RUNDE ${timing.currentRound}` : "VOR START"}</b>
          <span>Nächster Start <strong>{hhmm(timing.nextStart)}</strong>{timing.started && arrivalState.arrived && <small>Countdown bis Start: {pitCountdownLabel(timing.minutesToStart)}</small>}</span>
          {timing.started && <em><span>Pit Modus:</span><strong>{arrivalState.arrived ? modeTitle : "WARTET AUF ATHLET"}</strong></em>}
        </section>

        {incomingApplies && (
          <section className="pit-live-incoming">
            <div><small>ATHLET IM ANFLUG · LOOP {timing.currentRound}</small><strong>{compactStatus(incomingFlags)}</strong><span>Vorabmeldung synchronisiert{incomingAt ? ` · ${hhmm(new Date(incomingAt))}` : ""}. Crew-Hinweise und Fueling reagieren bereits darauf.</span></div>
            <b>→ vorbereiten</b>
          </section>
        )}

        {athleteFeedbackApplies && !incomingApplies && (
          <section className={`pit-live-athlete-feedback ${athleteFeedback.flags?.length ? "changed" : "okay"}`}>
            <div><small>{athleteFeedback.source === "athlete" ? "RÜCKMELDUNG ATHLET" : "RÜCKMELDUNG CREW"}</small><strong>{athleteFeedback.flags?.length ? compactStatus(athleteFeedback.flags) : "✓ Alles okay"}</strong><span>{athleteFeedback.flags?.length ? "Änderungen am Pit-Vorschlag wurden übernommen." : "Keine Änderung am vorbereiteten Plan nötig."}</span></div>
            <b>{athleteFeedback.flags?.length ? "↻ angepasst" : "✓ unverändert"}</b>
          </section>
        )}

        {!demoActive && !anchor && (
          <section className="pit-live-anchor-warning">
            <b>Startzeit fehlt</b>
            <p>Einmal die echte Startzeit setzen. Danach leitet die Uhr alle Loops und Quick-Pit-Fenster automatisch ab.</p>
            <button type="button" onClick={() => setAnchorAt(new Date().toISOString())}>Rennen jetzt starten</button>
          </section>
        )}

        {athleteNeedsArrival && (
          <details className="pit-live-collapse pit-live-athlete-signal">
            <summary><span>ATHLETENMELDUNG</span><b>{incomingApplies ? compactStatus(incomingFlags) : "Status vor Rückkehr senden"}</b><i>›</i></summary>
            <div className="pit-live-collapse-body">
              <p className="pit-live-help">Auf dem Athleten-Handy oder durch Begleitung antippen. Die Meldung wird über den gemeinsamen Crew-Link synchronisiert und passt die Vorbereitung schon vor der Rückkehr an.</p>
              <div className="pit-live-status-grid">{STATUS_OPTIONS.map(([key, icon, label]) => <button type="button" key={key} className={signalDraft.includes(key) ? "active" : ""} onClick={() => setSignalDraft((current) => toggleValue(current, key))}><b>{icon}</b><span>{label}</span></button>)}</div>
              <button type="button" className="pit-live-primary pit-live-wide" onClick={sendIncomingSignal}>{signalDraft.length ? "ATHLETENMELDUNG SENDEN" : "ALLES OKAY SENDEN"}</button>
            </div>
          </details>
        )}

        {athleteNeedsArrival && (
          <section className="pit-live-arrival">
            <div>
              <small>LOOP {timing.currentRound} LÄUFT</small>
              <strong>Warten auf den Athleten</strong>
              <span>Bei Rückkehr unten einmal „Athlet zurück“ tippen. Danach kennt die Crew die echte Restzeit bis zum nächsten festen Start und der passende Pit-Modus wird aktiv.</span>
            </div>
          </section>
        )}

        {careNeedsAttention && renderAthleteCareSection({ priority: true })}

        <section className="pit-live-recommendation">
          <div className="pit-live-section-head">
            <div><small>IDEALVORSCHLAG · KEINE ESSENSPFLICHT</small><h3>{timing.started ? `Pit nach Loop ${timing.currentRound} vorbereiten` : "Startversorgung vorbereiten"}</h3></div>
            <div className="pit-live-suggestion-total"><b>{Math.round(suggestionSummary.carbs)} g KH</b><span>{suggestionSummary.fluidMl} ml</span></div>
          </div>
          {effectiveAthleteFlags.length > 0 && <div className="pit-live-plan-adjusted"><b>↻ PLAN LIVE ANGEPASST</b><span>{compactStatus(effectiveAthleteFlags)}</span></div>}
          {suggestionPit.length > 0 && <div className="pit-live-suggestion-group"><small>IM PIT JETZT ANBIETEN</small><div>{suggestionPit.map((entry) => <span key={`pit:${entry.productId}:${entry.portionId}`}>{selectionLabel(entry, productCatalog)}</span>)}</div></div>}
          {suggestionLoop.length > 0 && <div className="pit-live-suggestion-group"><small>FÜR NÄCHSTE LOOP BEREITLEGEN</small><div>{suggestionLoop.map((entry) => <span key={`loop:${entry.productId}:${entry.portionId}`}>{selectionLabel(entry, productCatalog)}</span>)}</div></div>}
          {!recommendation.selection.length && <div className="pit-live-stock-warning">⚠️ Kein passendes Fuel im Vorrat aktiv. Vorrat öffnen und verfügbare Sachen auswählen.</div>}
          {weatherCrewActions.length > 0 && <div className="pit-live-crew-prep"><small>LIVE · CREW JETZT</small><div>{weatherCrewActions.slice(0, 4).map((action) => <span key={action}>{action}</span>)}</div></div>}
          <p><b>Warum?</b> {recommendation.why}</p>
          <div className="pit-live-auto-plan-note">✓ Der Idealvorschlag ist automatisch vorausgewählt. Nur ändern, wenn es im Pit tatsächlich anders läuft.</div>
        </section>

        <details className="pit-live-collapse">
          <summary><span>ATHLET</span><b>{compactStatus(effectiveAthleteFlags)}</b><i>›</i></summary>
          <div className="pit-live-collapse-body">
            <p className="pit-live-help">Nur Änderungen melden. Wenn alles gut ist, muss hier nichts angefasst werden.</p>
            <div className="pit-live-status-grid">
              {STATUS_OPTIONS.map(([key, icon, label]) => (
                <button type="button" key={key} className={flags.includes(key) ? "active" : ""} onClick={() => setFlags((current) => toggleValue(current, key))}><b>{icon}</b><span>{label}</span></button>
              ))}
            </div>
          </div>
        </details>

        {!careNeedsAttention && renderAthleteCareSection()}

        <details className="pit-live-collapse pit-live-carb-audit">
          <summary><span>KH-BILANZ</span><b>Ziel {PIT_CARB_TARGET.center} g/h · {PIT_CARB_TARGET.min}–{PIT_CARB_TARGET.max}</b><i>›</i></summary>
          <div className="pit-live-collapse-body">
            <p className="pit-live-help">Backyard-Arbeitsziel, nicht Zwang: Einzelne leichtere Stunden sind okay, solange der Verlauf passt. Defizite werden nicht aggressiv in einer Runde nachgeholt.</p>
            <div className="pit-live-history-rows">
              <div><em aria-hidden="true" /><b>Aktueller Vorschlag</b><span>{formatNumber(assessment.summary.carbs)} g KH · {assessment.summary.fluidMl} ml</span></div>
              <div><em aria-hidden="true" /><b>Zuletzt tatsächlich</b><span>{formatNumber(lastActualSummary.carbs)} g KH · {lastActualSummary.fluidMl} ml</span></div>
              <div><em aria-hidden="true" /><b>Ø letzte {historyRolling.hours || 0} h</b><span>{historyRolling.hours ? `${formatNumber(historyRolling.carbsPerHour)} g KH/h · ${historyRolling.fluidPerHour} ml/h` : "noch keine belastbare Historie"}</span></div>
            </div>
            <p className="pit-live-help">Details zu einzelnen Produkten bleiben im Pit-Vorschlag sichtbar. Die Bilanz selbst rendert bewusst nur robuste Summen, damit ältere Crew-Sessions die Live-Ansicht nicht blockieren können.</p>
          </div>
        </details>

        {renderStockSection()}
        {renderPitFuelingSection()}
        {renderLoopFuelingSection()}

        {history.length > 0 && (
          <details className="pit-live-collapse">
            <summary><span>VERLAUF</span><b>Ø3h {formatNumber(historyRolling.carbsPerHour)} g/h</b><i>›</i></summary>
            <div className="pit-live-collapse-body">
              <div className="pit-live-history-rows">{history.map((record, index) => ({ record, index })).slice(-5).reverse().map(({ record, index }) => {
                const carried = (record.carriedSelection || record.carrySelection || []).length > 0;
                const tone = historyTone(record, index);
                const pendingText = record.carryStatus === "pending"
                  ? Number(record.round) < Number(pitRound)
                    ? ` · Loop ${Number(record.round) + 1} abschließen`
                    : ` · Loop ${Number(record.round) + 1} startklar`
                  : "";
                const shownSummary = record.carryStatus === "pending" && record.provisionalSummary ? record.provisionalSummary : record.summary || summarizePitSelection(record.selection, productCatalog);
                return <div key={record.round} className={`tone-${tone}`}><em aria-hidden="true" /><b>{carried ? `Pit ${record.round} → Loop ${Number(record.round) + 1}` : `Pit ${record.round}`}</b><span>{formatNumber(shownSummary.carbs)} g KH · {shownSummary.fluidMl} ml{record.carryStatus === "pending" ? " · wie geplant angenommen" : ""}{pendingText}</span></div>;
              })}</div>
              <button type="button" className="pit-live-secondary pit-live-wide" onClick={editLastPit}>Letzten Pit korrigieren</button>
            </div>
          </details>
        )}

        <details className="pit-live-collapse pit-live-tools">
          <summary><span>WERKZEUGE</span><b>{demoActive ? "Testmodus aktiv" : "Korrektur / Test"}</b><i>›</i></summary>
          <div className="pit-live-collapse-body">
            {!demoActive ? (
              <>
                <p className="pit-live-help">Der Testmodus liegt bewusst nur hier unter Werkzeuge. Die normale Pit-Ansicht zeigt ausschließlich den Live-Workflow; echte Session-Daten bleiben unangetastet.</p>
                <button type="button" className="pit-live-primary pit-live-wide" onClick={beginDemo}>Testmodus starten</button>
                {!race?.time && <button type="button" className="pit-live-secondary pit-live-wide" onClick={() => setAnchorAt(new Date().toISOString())}>Startzeit = jetzt</button>}
                <button type="button" className="pit-live-danger pit-live-wide" onClick={resetSession}>Gesamte Live-Session zurücksetzen</button>
              </>
            ) : (
              <>
                <p className="pit-live-help">Testdaten liegen separat. Die Steuerung bleibt bewusst hier unter Werkzeuge und taucht nicht mehr in der Live-Ansicht auf.</p>
                <div className="pit-live-demo-loop">
                  <button type="button" className="pit-live-secondary" disabled={demoRound <= 1} onClick={() => moveDemoLoop(-1)}>← Loop</button>
                  <button type="button" className="pit-live-primary" onClick={() => moveDemoLoop(1)}>Nächste Loop →</button>
                </div>
                <div className="pit-live-demo-times" aria-label="Test Pit-Zeit">
                  {[[10, "STANDARD"], [6, "KOMPAKT"], [4, "QUICK"], [2, "GO"]].map(([minutes, label]) => (
                    <button type="button" key={minutes} className={demoMinutesToStart === minutes ? "active" : ""} onClick={() => setDemoMinutesToStart(minutes)}><b>{minutes} min</b><span>{label}</span></button>
                  ))}
                </div>
                <button type="button" className="pit-live-secondary pit-live-wide" onClick={beginDemo}>Testmodus neu starten</button>
                <button type="button" className="pit-live-primary pit-live-wide" onClick={endDemo}>Testmodus beenden</button>
              </>
            )}
          </div>
        </details>

        {saveMessage && <p className="pit-live-save-message">{saveMessage}</p>}
        {(metricStatus.carbs !== "good" || metricStatus.fluid === "low" || metricStatus.fluid === "high" || metricStatus.rolling === "low" || metricStatus.rolling === "high") && <div className={`pit-live-alert tone-${metricStatus.carbs === "high" || metricStatus.fluid === "high" || metricStatus.rolling === "high" ? "high" : "low"}`}>{alert}</div>}

        <section className="pit-live-mini-bar" aria-label="Versorgungsstatus">
          <div className={`tone-${actualMetricStatus.carbs}`}><small>IST KH</small><b>{Math.round(lastActualSummary.carbs)} g</b></div>
          <div className={`tone-${actualMetricStatus.fluid}`}><small>IST 💧</small><b>{lastActualSummary.fluidMl} ml</b></div>
          <div className={`tone-${actualMetricStatus.rolling}`}><small>Ø3h</small><b>{historyRolling.hours ? `${Math.round(historyRolling.carbsPerHour)} g/h` : "–"}</b></div>
          {lastActualSummary.caffeineMg > 0 && <div className="tone-neutral"><small>☕</small><b>{Math.round(lastActualSummary.caffeineMg)} mg</b></div>}
          <button
            type="button"
            className={`pit-live-main-action${athleteNeedsArrival ? " needs-arrival" : savedLoopReady ? " is-ready" : ""}`}
            disabled={athleteNeedsArrival ? false : savedLoopReady || !activeSelection.length}
            onClick={athleteNeedsArrival ? markAthleteReturned : savePit}
          >
            {athleteNeedsArrival
              ? `ATHLET ZURÜCK · LOOP ${timing.currentRound}`
              : editingRound != null
                ? `PIT ${saveRound} KORRIGIEREN`
                : savedLoopReady
                  ? `✓ LOOP ${readyLoopNumber} STARTKLAR`
                  : `LOOP ${readyLoopNumber} STARTKLAR MACHEN`}
          </button>
        </section>
      </main>

      {checkInOpen && <div className="pit-live-checkin-backdrop" role="presentation">
        <section className="pit-live-checkin" role="dialog" aria-modal="true" aria-label="Athletenstatus und Loop-Verpflegung nach Rückkehr">
          <div className="pit-live-checkin-head"><div><small>ATHLET ZURÜCK · LOOP {timing.currentRound}</small><h3>Rückkehr kurz übernehmen</h3><p>Status und Versorgung in einem Schritt. Nur Abweichungen brauchen Details.</p></div></div>

          {athleteFeedbackApplies && athleteFeedback?.source === "athlete" ? (
            <div className="pit-live-checkin-athlete-report">
              <small>RÜCKMELDUNG ATHLET</small>
              <strong>{compactStatus(athleteFeedback.flags || [])}</strong>
              <span>{(athleteFeedback.flags || []).length ? "Der Pit-Vorschlag wurde bereits darauf angepasst. Die Crew muss den Status nicht erneut eingeben." : "Alles okay · keine Änderung am vorbereiteten Plan nötig."}</span>
            </div>
          ) : (
            <>
              <div className="pit-live-checkin-subhead"><small>ATHLETENSTATUS</small><span>Alles okay ist der Standard. Nur Änderungen antippen.</span></div>
              <button type="button" className={`pit-live-checkin-ok${flags.length === 0 ? " active" : ""}`} onClick={() => setFlags([])}>✓ Alles okay</button>
              <div className="pit-live-status-grid">{STATUS_OPTIONS.map(([key, icon, label]) => <button type="button" key={key} className={flags.includes(key) ? "active" : ""} onClick={() => setFlags((current) => toggleValue(current, key))}><b>{icon}</b><span>{label}</span></button>)}</div>
            </>
          )}

          {arrivalPendingItems.length > 0 && (
            <div className="pit-live-checkin-intake">
              <div className="pit-live-checkin-subhead"><small>VERPFLEGUNG AUF LOOP {timing.currentRound}</small><span>{singleArrivalItem ? selectionLabel(singleArrivalItem, productCatalog) : "Was davon wurde tatsächlich genommen?"}</span></div>
              <div className="pit-live-checkin-intake-modes">
                <button type="button" className={arrivalIntakeMode === "planned" ? "active" : ""} onClick={() => { setArrivalIntakeMode("planned"); setCarryAdjust({}); }}>{singleArrivalItem ? "✓ Komplett" : "✓ Alles wie geplant"}</button>
                <button type="button" className={arrivalIntakeMode === "partial" ? "active" : ""} onClick={() => { setArrivalIntakeMode("partial"); if (singleArrivalItem) setCarryAdjust({}); }}>½ Teilweise</button>
                <button type="button" className={arrivalIntakeMode === "none" ? "active" : ""} onClick={() => { setArrivalIntakeMode("none"); setCarryAdjust({}); }}>○ Nichts</button>
              </div>
              {arrivalIntakeMode === "partial" && arrivalPendingItems.length > 1 && <div className="pit-live-loop-items pit-live-checkin-intake-items">
                {arrivalPendingItems.map((entry, index) => {
                  const key = carryResultKey(entry, index);
                  const selectedFactor = carryAdjust[key];
                  return <div className="pit-live-loop-item" key={key}><b>{selectionLabel(entry, productCatalog)}</b><div>{[[1, "✓ alles"], [0.5, "½ etwa halb"], [0, "nicht"]].map(([factor, label]) => <button type="button" key={factor} className={Number(selectedFactor) === factor ? "active" : ""} onClick={() => setCarryResult(entry, index, factor)}>{label}</button>)}</div></div>;
                })}
              </div>}
            </div>
          )}

          <div className="pit-live-checkin-actions">
            <button type="button" className="pit-live-primary pit-live-wide" disabled={arrivalIntakeMode === "partial" && !arrivalPartialRated} onClick={finishAthleteCheckIn}>RÜCKKEHR ÜBERNEHMEN</button>
          </div>
        </section>
      </div>}
    </div>
  );
}
