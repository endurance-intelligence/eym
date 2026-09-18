import { useEffect, useMemo, useRef, useState } from "react";
import {
  assessPitSelection,
  buildPitCrewCustomProduct,
  PIT_CARB_TARGET,
  PIT_CREW_DEFAULT_GEL_PRIORITY,
  PIT_CREW_DEFAULT_STOCK_IDS,
  PIT_CREW_PRODUCTS,
  buildPitCrewStartStock,
  normalizeGelPriority,
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
  ["iso-fatigue", "🧃", "Iso satt"],
  ["liquid-only", "🥤", "Nur flüssig"],
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
  stockQuantity: "1",
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
      plannedSelection: normalizedLiveSelection(record.plannedSelection),
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
    const planned = normalizedLiveSelection(record.plannedSelection);
    if (planned.length) return planned.map((entry) => ({ ...entry, timing: entry.timing || "now" }));
    return [
      ...(record.selection || []).map((entry) => ({ ...entry, timing: entry.timing || "now" })),
      ...(record.carrySelection || []).map((entry) => ({ ...entry, timing: entry.timing || "carry" })),
    ];
  }
  return (record.selection || []).map((entry) => ({ ...entry, timing: entry.timing || "now" }));
}

function selectionSignature(value = []) {
  return normalizedLiveSelection(value)
    .map((entry) => `${entry.timing || "now"}:${entry.productId}:${entry.portionId}:${quantity(entry)}`)
    .sort()
    .join("|");
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
  const prepStorageKey = `endurance-pit-crew-prep:${race?.key || race?.name || "backyard"}:${race?.date || "open"}`;
  const stored = useMemo(() => safeStoredSession(baseStorageKey), [baseStorageKey]);
  const storedPrep = useMemo(() => safeStoredSession(prepStorageKey), [prepStorageKey]);
  const storedHasPrep = Array.isArray(stored?.stockIds);
  const [demoActive, setDemoActive] = useState(false);
  const [demoRound, setDemoRound] = useState(0);
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
  const [customProducts, setCustomProducts] = useState(() => normalizedCustomProducts(storedHasPrep ? stored?.customProducts : storedPrep?.customProducts));
  const [stockIds, setStockIds] = useState(() => Array.isArray(storedHasPrep ? stored?.stockIds : storedPrep?.stockIds) ? (storedHasPrep ? stored.stockIds : storedPrep.stockIds) : PIT_CREW_DEFAULT_STOCK_IDS);
  const [stockTargets, setStockTargets] = useState(() => {
    const source = storedHasPrep ? stored?.stockTargets : storedPrep?.stockTargets;
    return source && typeof source === "object" ? source : {};
  });
  const [gelPriority, setGelPriority] = useState(() => normalizeGelPriority((storedHasPrep ? stored?.gelPriority : storedPrep?.gelPriority) || PIT_CREW_DEFAULT_GEL_PRIORITY));
  const [fuelMode, setFuelMode] = useState(() => stored?.fuelMode === "liquid-only" ? "liquid-only" : "normal");
  const [stockCategory, setStockCategory] = useState("drink");
  const [showStockForm, setShowStockForm] = useState(false);
  const [stockItemDraft, setStockItemDraft] = useState(EMPTY_STOCK_ITEM);
  const [selection, setSelection] = useState([]);
  const [selectionMode, setSelectionMode] = useState("suggestion");
  const [selectionDirty, setSelectionDirty] = useState(false);
  const [carryAdjust, setCarryAdjust] = useState({});
  const [pitCategory, setPitCategory] = useState("drink");
  const [fuelTimingTab, setFuelTimingTab] = useState("now");
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
  const demoRoundNumber = Math.max(0, Number(demoRound || 0));
  const demoStarted = demoRoundNumber > 0;
  const demoNextStart = new Date(demoBase.getTime() + demoRoundNumber * intervalMinutes * 60 * 1000);
  const timing = demoActive ? {
    started: demoStarted,
    currentRound: demoRoundNumber,
    pitRound: demoRoundNumber,
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
    window.localStorage.setItem(storageKey, JSON.stringify({ anchorAt, history, flags, incomingFlags, incomingAt, incomingRound, athleteFeedback, weather, arrivalRound, arrivalAt, stockIds, stockTargets, customProducts, gelPriority, fuelMode }));
  }, [anchorAt, arrivalAt, arrivalRound, athleteFeedback, customProducts, flags, fuelMode, gelPriority, history, incomingAt, incomingFlags, incomingRound, stockIds, stockTargets, storageKey, weather]);

  useEffect(() => {
    if (typeof window === "undefined" || demoActive) return;
    window.localStorage.setItem(prepStorageKey, JSON.stringify({ stockIds, stockTargets, customProducts, gelPriority }));
  }, [customProducts, demoActive, gelPriority, prepStorageKey, stockIds, stockTargets]);

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
  const effectiveAthleteFlags = [...new Set([...(flags || []), ...(incomingApplies ? incomingFlags : []), ...(fuelMode === "liquid-only" ? ["liquid-only"] : [])])];
  const weatherTargetStart = demoActive
    ? new Date(demoBase.getTime() + Math.max(0, demoRoundNumber) * intervalMinutes * 60 * 1000)
    : timing.nextStart;
  const weatherTargetRound = demoActive
    ? Math.max(1, demoRoundNumber + 1)
    : Math.max(1, Number(timing.currentRound || 0) + 1);
  const nextLoopWeather = pitWeatherForecastForLoops({
    observation: autoWeather || {},
    nextStart: weatherTargetStart,
    intervalMinutes,
    nextRound: weatherTargetRound,
    count: 3,
  });
  const weatherFallback = autoWeather && weatherTargetStart ? {
    ...autoWeather,
    startAt: weatherTargetStart,
    endAt: new Date(weatherTargetStart.getTime() + intervalMinutes * 60000),
    round: weatherTargetRound,
    approximate: true,
  } : null;
  const primaryLoopWeather = nextLoopWeather[0] || weatherFallback;
  const nextWeatherAlert = pitWeatherAlert(primaryLoopWeather);
  const nextLoopWeatherBrief = pitWeatherLoopBrief(primaryLoopWeather);
  const weatherCrewActions = pitWeatherCrewActions(primaryLoopWeather, effectiveAthleteFlags);
  const effectiveWeather = [...new Set([...(autoWeather?.flags || []), ...weather, ...(primaryLoopWeather?.flags || [])])];
  const previousHistory = history.filter((record) => Number(record.round) !== Number(saveRound));
  const planningHistory = previousHistory.map((record) => ({
    ...record,
    summary: record.carryStatus === "pending" && record.provisionalSummary ? record.provisionalSummary : record.summary,
  }));
  const pendingCarry = [...history].reverse().find((record) => {
    if (record.carryStatus !== "pending") return false;
    const planned = normalizedLiveSelection(record.plannedSelection);
    const legacyCarry = normalizedLiveSelection(record.carrySelection);
    return planned.length > 0 || legacyCarry.length > 0;
  });
  const pendingLoopNumber = pendingCarry ? Number(pendingCarry.round) + 1 : null;
  const pendingIntakeSelection = pendingCarry
    ? (normalizedLiveSelection(pendingCarry.plannedSelection).length
      ? normalizedLiveSelection(pendingCarry.plannedSelection)
      : normalizedLiveSelection(pendingCarry.carrySelection).map((entry) => ({ ...entry, timing: entry.timing || "carry" })))
    : [];
  const arrivalPendingItems = pendingCarry && Number(pendingLoopNumber) === Number(timing.currentRound)
    ? pendingIntakeSelection
    : [];
  const singleArrivalItem = arrivalPendingItems.length === 1 ? arrivalPendingItems[0] : null;
  const arrivalPartialRated = arrivalPendingItems.length === 1 || (arrivalPendingItems.length > 1 && arrivalPendingItems.every((entry, index) =>
    Object.prototype.hasOwnProperty.call(carryAdjust, `${pendingCarry?.round ?? "loop"}:${entry.productId}:${entry.portionId}:${index}`),
  ));
  const loopMustClose = Boolean(pendingCarry && Number(pendingLoopNumber) === Number(timing.currentRound));
  const arrivalState = pitCrewArrivalState({
    started: timing.started,
    currentRound: timing.currentRound,
    arrivalRound,
    loopMustClose,
  });
  const athleteNeedsArrival = Boolean(arrivalState.awaitingArrival && editingRound == null);
  const productCatalog = [...PIT_CREW_PRODUCTS, ...normalizedCustomProducts(customProducts)];
  const knownStockIds = new Set(productCatalog.map((product) => String(product.id)));
  const activeStockIds = stockIds.filter((id) => knownStockIds.has(String(id)));
  const availableProducts = productCatalog.filter((product) => activeStockIds.includes(String(product.id)));
  const startStockPlan = buildPitCrewStartStock(race || {}, gelPriority);

  const recommendation = recommendPitCrew({
    round: Math.max(1, timing.currentRound || 1),
    minutesToStart: timing.minutesToStart,
    history: planningHistory,
    flags: effectiveAthleteFlags,
    weather: effectiveWeather,
    products: productCatalog,
    availableProductIds: activeStockIds,
    gelPriority,
  });

  const modeTitle = modeLabel(timing.mode);
  const portableMode = recommendation.mode === "go" || recommendation.mode === "quick";
  const suggestedSelection = recommendation.selection.map((item) => {
    const product = productCatalog.find((entry) => String(entry?.id) === String(item?.productId));
    const inferredTiming = portableMode || product?.category === "drink" ? "carry" : "now";
    return { ...item, timing: item.timing || inferredTiming, quantity: quantity(item) };
  });
  const activeSelection = normalizedLiveSelection(selectionMode === "suggestion" && editingRound == null ? suggestedSelection : selection);
  const activePitSelection = activeSelection.filter((entry) => (entry.timing || "now") === "now");
  const activeLoopSelection = activeSelection.filter((entry) => (entry.timing || "now") === "carry");
  const activePlanSummary = summarizePitSelection(activeSelection, productCatalog);
  const activePitSummary = summarizePitSelection(activePitSelection, productCatalog);
  const activeLoopSummary = summarizePitSelection(activeLoopSelection, productCatalog);
  const planAdjusted = selectionSignature(activeSelection) !== selectionSignature(suggestedSelection);
  const planCarbTone = activePlanSummary.carbs < PIT_CARB_TARGET.min ? "low" : activePlanSummary.carbs > PIT_CARB_TARGET.max ? "high" : "good";
  const planCarbLabel = planCarbTone === "low" ? "KH zu wenig" : planCarbTone === "high" ? "KH zu viel" : "KH passt";
  const readyLoopNumber = Math.max(1, Number(saveRound || 0) + 1);
  const savedCurrentPit = editingRound == null
    ? history.find((record) => Number(record.round) === Number(saveRound))
    : null;
  const savedLoopReady = Boolean(savedCurrentPit && !loopMustClose && !selectionDirty);
  const assessment = assessPitSelection(activeSelection, planningHistory, { weather: effectiveWeather, products: productCatalog });
  const confirmedHistory = history.filter((record) => record.carryStatus !== "pending");
  const historyRolling = rollingPitAverage(confirmedHistory, null, 3, productCatalog);
  const metricStatus = pitMetricStatus(assessment.summary, assessment.rolling, { weather: effectiveWeather });
  const lastRecord = history.length ? history[history.length - 1] : null;
  const lastConfirmedRecord = [...confirmedHistory].reverse().find((record) => record.summary || (record.selection || []).length) || null;
  const lastActualSummary = lastConfirmedRecord
    ? (lastConfirmedRecord.summary || summarizePitSelection(lastConfirmedRecord.selection || [], productCatalog))
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
  const fuelNeedsAttention = metricStatus.carbs !== "good" || metricStatus.fluid === "low" || metricStatus.fluid === "high" || metricStatus.rolling === "low" || metricStatus.rolling === "high";
  const planCardTone = planCarbTone === "high" || careLevel === "urgent"
    ? "high"
    : planCarbTone === "low" || fuelNeedsAttention || careLevel === "notice" || weatherCrewActions.length > 0 || effectiveAthleteFlags.length > 0
      ? "low"
      : "good";
  const crewOverviewActions = [
    ...athleteCare.hints.map((hint) => ({ key: `care:${hint.key}`, label: `${hint.icon} ${hint.short}`, urgent: Boolean(hint.urgent) })),
    ...weatherCrewActions.map((action) => ({ key: `weather:${action}`, label: action, urgent: false })),
  ].filter((entry, index, all) => {
    const normalized = entry.label.toLocaleLowerCase("de-DE").replace(/[^a-zäöüß0-9]+/g, " ").trim();
    return all.findIndex((candidate) => candidate.label.toLocaleLowerCase("de-DE").replace(/[^a-zäöüß0-9]+/g, " ").trim() === normalized) === index;
  });

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
      if (reportedFlags.includes("liquid-only")) setFuelMode("liquid-only");
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
    if (signalDraft.includes("liquid-only")) setFuelMode("liquid-only");
    setIncomingRound(round);
    setIncomingAt(new Date().toISOString());
    setSaveMessage(signalDraft.length ? `Athletenmeldung für Loop ${round} gesendet · Crew kann vorbereiten.` : `Athletenmeldung für Loop ${round}: alles okay.`);
  }

  function finishAthleteCheckIn() {
    const round = Math.max(1, Number(timing.currentRound || 1));
    const athleteAlreadyReported = athleteFeedbackApplies && athleteFeedback?.source === "athlete";
    if (flags.includes("liquid-only") || athleteFeedback?.flags?.includes("liquid-only")) setFuelMode("liquid-only");
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
    setStockTargets((current) => ({ ...current, [product.id]: { quantity: Math.max(0, Number(stockItemDraft.stockQuantity || 1)), unit: "Portionen" } }));
    setStockItemDraft(EMPTY_STOCK_ITEM);
    setShowStockForm(false);
    setStockCategory(product.category);
    setSaveMessage(`${product.label} zum Vorrat hinzugefügt · Nährwerte werden als eigene Schätzung markiert.`);
  }

  function removeCustomStockItem(productId) {
    const id = String(productId);
    setCustomProducts((current) => current.filter((product) => String(product.id) !== id));
    setStockIds((current) => current.filter((item) => String(item) !== id));
    setStockTargets((current) => { const next = { ...current }; delete next[id]; return next; });
    setSelection((current) => current.filter((entry) => String(entry.productId) !== id));
    setSaveMessage("Eigenes Vorrats-Produkt entfernt.");
  }

  function savePit() {
    const unresolvedCarry = [...history].reverse().find((record) =>
      record.carryStatus === "pending"
      && (normalizedLiveSelection(record.plannedSelection).length || normalizedLiveSelection(record.carrySelection).length)
      && Number(record.round) < Number(saveRound),
    );
    if (unresolvedCarry) {
      setSaveMessage(`Loop ${Number(unresolvedCarry.round) + 1} zuerst bei Rückkehr bestätigen – erst dann wird die nächste Versorgung gespeichert.`);
      setCheckInOpen(Number(unresolvedCarry.round) + 1 === Number(timing.currentRound));
      return;
    }
    if (!activeSelection.length) {
      setSaveMessage("Noch nichts vorgesehen. Bitte Fueling Pit bzw. Loop prüfen.");
      return;
    }
    const existing = history.find((item) => Number(item.round) === Number(saveRound));
    const plannedSelection = activeSelection.map(({ productId, portionId, quantity: count, timing: itemTiming }) => ({
      productId,
      portionId,
      quantity: quantity({ quantity: count }),
      timing: itemTiming || "now",
    }));
    const carrySelection = plannedSelection.filter((entry) => entry.timing === "carry");
    const provisionalSummary = summarizePitSelection(plannedSelection, productCatalog);
    const correctingConfirmedPit = editingRound != null && existing && existing.carryStatus !== "pending";
    const summary = correctingConfirmedPit ? provisionalSummary : summarizePitSelection([], productCatalog);
    const record = {
      round: saveRound,
      recordedAt: new Date().toISOString(),
      selection: correctingConfirmedPit ? plannedSelection : [],
      plannedSelection: correctingConfirmedPit ? [] : plannedSelection,
      carrySelection: correctingConfirmedPit ? [] : carrySelection,
      carriedSelection: correctingConfirmedPit ? (existing?.carriedSelection || carrySelection) : (carrySelection.length ? carrySelection : (existing?.carriedSelection || [])),
      carryStatus: correctingConfirmedPit ? "confirmed" : (plannedSelection.length ? "pending" : "none"),
      summary,
      provisionalSummary: correctingConfirmedPit ? summary : provisionalSummary,
      flags: editingRound != null && existing ? [...(existing.flags || [])] : [...flags],
      weather: editingRound != null && existing ? [...(existing.weather || [])] : [...effectiveWeather],
    };
    setHistory((current) => [...current.filter((item) => Number(item.round) !== Number(saveRound)), record]
      .sort((left, right) => Number(left.round) - Number(right.round)));
    setSaveMessage(editingRound != null
      ? `Pit ${saveRound} korrigiert · bestätigte IST-Aufnahme aktualisiert.`
      : `Loop ${readyLoopNumber} startklar · ${formatNumber(provisionalSummary.carbs)} g KH geplant · tatsächliche Aufnahme wird bei Rückkehr bestätigt.`);
    setSelection(plannedSelection);
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
    const intakePlan = pendingIntakeSelection;
    const consumedPlan = intakePlan.flatMap((entry, index) => {
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
    const carriedSelection = intakePlan.filter((entry) => entry.timing === "carry").map((entry) => ({ ...entry }));
    setHistory((current) => current.map((record) => {
      if (Number(record.round) !== Number(pendingCarry.round)) return record;
      const summary = summarizePitSelection(consumedPlan, productCatalog);
      return {
        ...record,
        selection: consumedPlan,
        plannedSelection: [],
        carriedSelection,
        carrySelection: [],
        summary,
        provisionalSummary: summary,
        carryStatus: "confirmed",
        carryConfirmedAt: new Date().toISOString(),
      };
    }));
    setCarryAdjust({});
    setSaveMessage(`Loop ${Number(pendingCarry.round) + 1}: Aufnahme bestätigt · Engine rechnet nur mit den tatsächlich bestätigten KH weiter.`);
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
        stockTargets,
        customProducts,
        gelPriority,
        fuelMode,
      };
    }
    if (typeof window !== "undefined") {
      if (!demoActive) window.localStorage.setItem(baseStorageKey, JSON.stringify({ anchorAt, history, flags, incomingFlags, incomingAt, incomingRound, weather, arrivalRound, arrivalAt, stockIds, stockTargets, customProducts, gelPriority, fuelMode }));
      window.localStorage.removeItem(`${baseStorageKey}:demo`);
    }
    setDemoActive(true);
    setDemoRound(0);
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
    setStockTargets(liveStored?.stockTargets && typeof liveStored.stockTargets === "object" ? liveStored.stockTargets : (transient.stockTargets && typeof transient.stockTargets === "object" ? transient.stockTargets : {}));
    setGelPriority(normalizeGelPriority(liveStored?.gelPriority || transient.gelPriority || PIT_CREW_DEFAULT_GEL_PRIORITY));
    setFuelMode((liveStored?.fuelMode || transient.fuelMode) === "liquid-only" ? "liquid-only" : "normal");
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
    const current = Math.max(0, Number(demoRound || 0));
    if (delta > 0) {
      if (!savedLoopReady) {
        setSaveMessage(`Loop ${current + 1} zuerst startklar machen – erst dann im Test starten.`);
        return;
      }
      if (current > 0 && (!arrivalState.arrived || checkInOpen)) {
        setSaveMessage(`Loop ${current} zuerst sauber bei Rückkehr abschließen.`);
        return;
      }
    }
    setDemoRound(Math.max(0, current + delta));
    setDemoMinutesToStart(10);
    setArrivalRound(0);
    setArrivalAt("");
    setEditingRound(null);
    setSelection([]);
    setSelectionMode("suggestion");
    setSelectionDirty(false);
    setCarryAdjust({});
    setCheckInOpen(false);
    setSaveMessage(delta > 0 ? `Loop ${current + 1} läuft · bei Rückkehr unten „Athlet zurück“ bestätigen.` : "Vorherige Demo-Phase geladen.");
    loadedPitRound.current = null;
  }

  function clearTimingSelection(timingMode) {
    updateSelection((current) => current.filter((entry) => (entry.timing || "now") !== timingMode));
  }

  function moveGelPriority(productId, direction) {
    setGelPriority((current) => {
      const next = normalizeGelPriority(current);
      const index = next.indexOf(String(productId));
      const target = index + direction;
      if (index < 0 || target < 0 || target >= next.length) return next;
      [next[index], next[target]] = [next[target], next[index]];
      return [...next];
    });
  }

  function stockRecommendationFor(productId) {
    const id = String(productId);
    return startStockPlan.items.find((item) => String(item.id) === id) || null;
  }

  function stockTargetFor(productId) {
    const id = String(productId);
    const override = stockTargets?.[id];
    const planned = stockRecommendationFor(id);
    const unit = String(planned?.unit || override?.unit || "Portionen");
    if (override && Number.isFinite(Number(override.quantity))) return { quantity: Math.max(0, Number(override.quantity)), unit };
    return { quantity: 0, unit };
  }

  function setStockTarget(productId, quantity, unit) {
    const id = String(productId);
    setStockTargets((current) => ({
      ...current,
      [id]: { quantity: Math.max(0, Number(quantity || 0)), unit: String(unit || stockTargetFor(id).unit || "Portionen") },
    }));
  }

  function renderStockSection() {
    const categoryProducts = productCatalog.filter((product) => product.category === stockCategory);
    const gelOrder = normalizeGelPriority(gelPriority);
    return (
      <details className="pit-live-tool-option pit-live-stock">
        <summary><span>VORRAT & STARTPLAN</span><b>{startStockPlan.hours} h · +{startStockPlan.reservePercent}% Reserve · {activeStockIds.length} aktiv</b><i>›</i></summary>
        <div className="pit-live-collapse-body">
          <div className="pit-live-start-stock-head"><b>≈ {startStockPlan.targetCarbs.toLocaleString("de-DE")} g KH Materialziel</b><span>Eventbezogen gespeichert: Einkauf und Startvorrat bleiben auch nach Browser-Neustart und Live-Session-Reset erhalten. Die Crew-Auswahl nutzt denselben Bestand.</span></div>
          <div className="pit-live-stock-actions">
            <button type="button" className="pit-live-secondary" onClick={selectStarterStock}>Grundstock aktivieren</button>
            <button type="button" className="pit-live-primary" onClick={() => setShowStockForm((value) => !value)}>＋ Eigenes Produkt</button>
          </div>
          <div className="pit-live-category-tabs">
            {CATEGORIES.map(([key, label]) => <button type="button" key={key} className={stockCategory === key ? "active" : ""} onClick={() => setStockCategory(key)}>{label}</button>)}
          </div>
          <div className="pit-live-stock-grid">
            {categoryProducts.map((product) => {
              const active = activeStockIds.includes(String(product.id));
              const target = stockTargetFor(product.id);
              const recommendation = stockRecommendationFor(product.id);
              const hasRecommendation = Number(recommendation?.quantity || 0) > 0;
              const stockStatus = !hasRecommendation ? "neutral" : target.quantity >= Number(recommendation.quantity) ? "enough" : "short";
              const missing = hasRecommendation ? Math.max(0, Number(recommendation.quantity) - target.quantity) : 0;
              const gelIndex = gelOrder.indexOf(String(product.id));
              const portion = product.referencePortionId
                ? product.portions?.find((item) => String(item.id) === String(product.referencePortionId))
                : product.portions?.find((item) => !item.hidden) || product.portions?.[0];
              return <article key={product.id} className={active ? "active" : ""}>
                <button type="button" className="pit-live-stock-toggle" onClick={() => toggleStockProduct(product.id)}>
                  <span>{active ? "✓" : "+"}</span><b>{product.icon} {product.label}</b>
                  <small>{portion ? `${portion.label} · ${formatNumber(portion.carbs)} g KH` : "Portion offen"}{product.estimated ? " · ≈" : ""}{product.stockNote ? ` · ${product.stockNote}` : ""}</small>
                </button>
                {active && <div className={`pit-live-stock-plan ${stockStatus}`}>
                  <label><span>Vorhanden</span><input type="number" min="0" step={target.unit === "l" ? "0.5" : "1"} value={target.quantity} onChange={(event) => setStockTarget(product.id, event.target.value, target.unit)} /></label>
                  <strong>{target.unit}</strong>
                  {hasRecommendation && <div className="pit-live-stock-recommendation">
                    <small>Empfohlen mitzunehmen</small>
                    <b>{formatNumber(recommendation.quantity)} {recommendation.unit}</b>
                    {recommendation.note && <span>{recommendation.note}</span>}
                    <em>{stockStatus === "enough" ? "✓ ausreichend vorhanden" : `Noch ${formatNumber(missing)} ${recommendation.unit} fehlen`}</em>
                  </div>}
                  {gelIndex >= 0 && <div className="pit-live-stock-priority"><small>Gel-Prio {gelIndex + 1}</small><button type="button" disabled={gelIndex === 0} onClick={() => moveGelPriority(product.id, -1)}>↑</button><button type="button" disabled={gelIndex === gelOrder.length - 1} onClick={() => moveGelPriority(product.id, 1)}>↓</button></div>}
                </div>}
                {product.custom && <button type="button" className="pit-live-stock-remove" onClick={() => removeCustomStockItem(product.id)}>Entfernen</button>}
              </article>;
            })}
          </div>
          {showStockForm && <form className="pit-live-stock-form" onSubmit={addCustomStockItem}>
            <div className="pit-live-stock-form-head"><b>Eigenes Produkt hinzufügen</b><span>Praxisnahe Werte reichen. Eigene Produkte landen direkt in derselben Vorratsliste.</span></div>
            <label className="wide"><span>Name</span><input value={stockItemDraft.label} onChange={(event) => setStockItemDraft((current) => ({ ...current, label: event.target.value }))} placeholder="z. B. Pizza vom Lieferdienst" /></label>
            <label><span>Kategorie</span><select value={stockItemDraft.category} onChange={(event) => setStockItemDraft((current) => ({ ...current, category: event.target.value }))}><option value="food">Essen</option><option value="drink">Getränk</option><option value="gel">Gel</option><option value="refresh">Refresh</option></select></label>
            <label><span>Portion</span><input value={stockItemDraft.portionLabel} onChange={(event) => setStockItemDraft((current) => ({ ...current, portionLabel: event.target.value }))} placeholder="1 Stück" /></label>
            <label><span>Startmenge</span><input type="number" min="0" step="1" value={stockItemDraft.stockQuantity} onChange={(event) => setStockItemDraft((current) => ({ ...current, stockQuantity: event.target.value }))} /></label>
            <label><span>KH pro Portion · g</span><input type="number" min="0" step="0.1" value={stockItemDraft.carbs} onChange={(event) => setStockItemDraft((current) => ({ ...current, carbs: event.target.value }))} /></label>
            <label><span>Flüssigkeit · ml</span><input type="number" min="0" step="1" value={stockItemDraft.fluidMl} onChange={(event) => setStockItemDraft((current) => ({ ...current, fluidMl: event.target.value }))} /></label>
            <label><span>Natrium · mg</span><input type="number" min="0" step="1" value={stockItemDraft.sodiumMg} onChange={(event) => setStockItemDraft((current) => ({ ...current, sodiumMg: event.target.value }))} /></label>
            <label><span>Koffein · mg</span><input type="number" min="0" step="0.1" value={stockItemDraft.caffeineMg} onChange={(event) => setStockItemDraft((current) => ({ ...current, caffeineMg: event.target.value }))} /></label>
            <label><span>Geschmack</span><select value={stockItemDraft.taste} onChange={(event) => setStockItemDraft((current) => ({ ...current, taste: event.target.value }))}><option value="neutral">neutral</option><option value="sweet">süß</option><option value="savory">salzig/herzhaft</option></select></label>
            <label><span>Magenlast</span><select value={stockItemDraft.digestion} onChange={(event) => setStockItemDraft((current) => ({ ...current, digestion: event.target.value }))}><option value="light">leicht</option><option value="normal">normal</option><option value="heavy">eher schwer</option></select></label>
            <p className="wide">KH sind die Pflicht-Rechengröße. Flüssigkeit, Natrium und Koffein nur eintragen, wenn sie sinnvoll bekannt sind.</p>
            <div className="pit-live-stock-form-actions wide"><button type="button" className="pit-live-secondary" onClick={() => setShowStockForm(false)}>Abbrechen</button><button type="submit" className="pit-live-primary">Zum Vorrat hinzufügen</button></div>
          </form>}
        </div>
      </details>
    );
  }

  function renderFuelingSection() {
    const selected = fuelTimingTab === "carry" ? activeLoopSelection : activePitSelection;
    const products = availableProducts.filter((product) => product.category === pitCategory);
    const loopNumber = Math.max(1, Number(saveRound || 0) + 1);
    return (
      <details className="pit-live-collapse pit-live-fueling">
        <summary>
          <span>FUELING</span>
          <b>{activeSelection.length ? `${formatNumber(activePlanSummary.carbs)} g KH · ${activePlanSummary.fluidMl} ml` : "noch nichts ausgewählt"}</b>
          <i>›</i>
        </summary>
        <div className="pit-live-collapse-body pit-live-intake">
          {editingRound != null && <div className="pit-live-edit-banner">Pit {editingRound} wird korrigiert. Speichern ersetzt nur diesen Pit.</div>}
          <p className="pit-live-help">Ein Ort für die gesamte Versorgung: Was jetzt im Pit genommen wird und was der Athlet mit auf die nächste Loop bekommt.</p>
          <div className="pit-live-fueling-timing-tabs">
            <button type="button" className={fuelTimingTab === "now" ? "active" : ""} onClick={() => setFuelTimingTab("now")}><small>IM PIT</small><b>{formatNumber(activePitSummary.carbs)} g KH · {activePitSummary.fluidMl} ml</b></button>
            <button type="button" className={fuelTimingTab === "carry" ? "active" : ""} onClick={() => setFuelTimingTab("carry")}><small>MIT AUF LOOP {loopNumber}</small><b>{formatNumber(activeLoopSummary.carbs)} g KH · {activeLoopSummary.fluidMl} ml</b></button>
          </div>
          <div className="pit-live-category-tabs">
            {CATEGORIES.map(([key, label]) => <button type="button" key={key} className={pitCategory === key ? "active" : ""} onClick={() => setPitCategory(key)}>{label}</button>)}
          </div>
          {!products.length && <p className="pit-live-loop-empty">In dieser Kategorie ist aktuell nichts im Vorrat aktiviert. „Vorrat & Startplan“ findest du ganz unten.</p>}
          <div className="pit-live-product-grid">
            {products.map((product) => {
              const selectedInMode = activeSelection.find((item) => item.productId === product.id && (item.timing || "now") === fuelTimingTab);
              return (
                <article key={product.id} className={selectedInMode ? "selected" : ""}>
                  <div><b>{product.icon}</b><strong>{product.label}{product.estimated ? " ≈" : ""}</strong>{selectedInMode && quantity(selectedInMode) > 1 && <em>×{quantity(selectedInMode)}</em>}</div>
                  <div className="pit-live-portions">
                    {product.portions.filter((portion) => !portion.hidden).map((portion) => (
                      <button type="button" key={portion.id} className={selectedInMode && String(selectedInMode.portionId) === String(portion.id) ? "active" : ""} onClick={() => selectPortion(product.id, portion.id, fuelTimingTab)}>
                        <b>{portion.label}</b><span>{portion.carbs ? `${formatNumber(portion.carbs)} g KH` : "0 g KH"}</span>
                      </button>
                    ))}
                  </div>
                  {selectedInMode && (
                    <div className="pit-live-quantity">
                      <button type="button" onClick={() => changeQuantity(product.id, fuelTimingTab, -1)}>−</button>
                      <b>{quantity(selectedInMode)}</b>
                      <button type="button" onClick={() => changeQuantity(product.id, fuelTimingTab, 1)}>+</button>
                      <span>{formatNumber(summarizePitSelection([selectedInMode], productCatalog).carbs)} g KH gesamt</span>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
          {selected.length > 0 && <button type="button" className="pit-live-secondary pit-live-clear" onClick={() => clearTimingSelection(fuelTimingTab)}>{fuelTimingTab === "carry" ? `Loop ${loopNumber}-Auswahl leeren` : "Pit-Auswahl leeren"}</button>}
          {pendingCarry && <div className="pit-live-loop-inline-status">
            <small>{pendingCarry.carryStatus === "pending" ? `LOOP ${Number(pendingCarry.round) + 1}` : "LOOP"}</small>
            <b>{loopMustClose ? (arrivalState.arrived ? "Rückkehr bestätigen" : "läuft · Aufnahme noch offen") : "Versorgung vorbereitet"}</b>
            <span>{pendingIntakeSelection.length ? pendingIntakeSelection.map((entry) => selectionLabel(entry, productCatalog)).join(" · ") : "Keine geplante Aufnahme offen."}</span>
          </div>}
          <div className={`pit-live-fueling-total tone-${planCarbTone}`}><span>AKTUELL GESAMT</span><b>{formatNumber(activePlanSummary.carbs)} g KH · {activePlanSummary.fluidMl} ml</b><em>{planCarbLabel} · Ziel {PIT_CARB_TARGET.min}–{PIT_CARB_TARGET.max} g</em></div>
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
    setSelection([]);
    setSelectionMode("suggestion");
    setSelectionDirty(false);
    setCarryAdjust({});
    setEditingRound(null);
    setAnchorAt(plannedAnchor(race)?.toISOString() || "");
    setSaveMessage("Live-Session zurückgesetzt. Vorrat & Startplan bleiben erhalten.");
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
              <span>{primaryLoopWeather ? `WETTER FÜR LOOP ${primaryLoopWeather.round}` : "WETTER"}</span>
              {primaryLoopWeather && <small>{hhmm(primaryLoopWeather.startAt)}–{hhmm(primaryLoopWeather.endAt)}</small>}
            </div>
            <div className="pit-live-weather-summary-main">
              <b>{nextLoopWeatherBrief ? nextLoopWeatherBrief.headline : autoWeather ? `${pitWeatherIcon(autoWeather.weatherCode, autoWeather.isDay)} ${autoWeather.temperature} °C · ${autoWeather.windSpeed} km/h` : weatherError ? "Auto nicht verfügbar" : "wird automatisch geladen …"}</b>
              {primaryLoopWeather && <small>Gefühlt {primaryLoopWeather.feelsLike} °C · Regen {primaryLoopWeather.precipitationProbability} % · Wind {primaryLoopWeather.windSpeed} km/h · Böen {primaryLoopWeather.windGusts} km/h{primaryLoopWeather.approximate ? " · aktuelle Wetterbasis" : ""}</small>}
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

        {fuelMode === "liquid-only" && (
          <section className="pit-live-fuel-mode">
            <div><small>FUEL-MODUS</small><strong>🥤 Nur flüssig aktiv</strong><span>Feste Nahrung bleibt aus dem Idealvorschlag, bis der Athlet wieder feste Nahrung freigibt.</span></div>
            <button type="button" onClick={() => { setFuelMode("normal"); setFlags((current) => current.filter((flag) => flag !== "liquid-only")); setSaveMessage("Fuel-Modus: feste Nahrung wieder freigegeben."); }}>Fest geht wieder</button>
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

        <section className={`pit-live-recommendation plan-tone-${planCardTone}`}>
          <div className="pit-live-section-head">
            <div><small>{planAdjusted ? "PIT-PLAN · MANUELL ANGEPASST" : "IDEALVORSCHLAG · VORAUSGEWÄHLT"}</small><h3>{timing.started ? `Pit: Loop ${timing.currentRound}` : "Pit: Start"}</h3></div>
            <div className="pit-live-suggestion-total"><b>{formatNumber(activePlanSummary.carbs)} g KH</b><span>{activePlanSummary.fluidMl} ml</span><em className={`pit-live-carb-marker tone-${planCarbTone}`}>{planCarbLabel}</em></div>
          </div>
          {effectiveAthleteFlags.length > 0 && <div className="pit-live-plan-adjusted"><b>↻ PLAN LIVE ANGEPASST</b><span>{compactStatus(effectiveAthleteFlags)}</span></div>}
          {planAdjusted && <div className="pit-live-plan-adjusted pit-live-manual-adjusted"><b>✎ CREW-AUSWAHL AKTIV</b><span>Die Werte und Produkte unten sind die tatsächlich ausgewählte Planung, nicht mehr der ursprüngliche Idealvorschlag.</span></div>}
          {activePitSelection.length > 0 && <div className="pit-live-suggestion-group"><small>IM PIT</small><div>{activePitSelection.map((entry) => <span key={`pit:${entry.productId}:${entry.portionId}`}>{selectionLabel(entry, productCatalog)}</span>)}</div></div>}
          {activeLoopSelection.length > 0 && <div className="pit-live-suggestion-group"><small>MIT AUF LOOP {Math.max(1, Number(saveRound || 0) + 1)}</small><div>{activeLoopSelection.map((entry) => <span key={`loop:${entry.productId}:${entry.portionId}`}>{selectionLabel(entry, productCatalog)}</span>)}</div></div>}
          {!activeSelection.length && <div className="pit-live-stock-warning">⚠️ Noch keine Versorgung ausgewählt. Fueling öffnen und verfügbare Sachen auswählen.</div>}
          <div className={`pit-live-overview-actions tone-${careLevel === "urgent" ? "high" : crewOverviewActions.length ? "low" : "good"}`}>
            <small>CREW-AKTIONEN</small>
            <div>
              {crewOverviewActions.length
                ? crewOverviewActions.map((action) => <span key={action.key} className={action.urgent ? "urgent" : ""}>{action.label}</span>)
                : <span className="clear">✓ Keine Zusatzaktion · Routine ruhig weiterlaufen lassen</span>}
            </div>
          </div>
          <div className="pit-live-actual-overview" aria-label="Bestätigte Versorgung">
            <div className={lastConfirmedRecord ? `tone-${actualMetricStatus.carbs}` : "tone-neutral"}>
              <small>ZULETZT BESTÄTIGT</small>
              <b>{lastConfirmedRecord ? `${formatNumber(lastActualSummary.carbs)} g KH · ${lastActualSummary.fluidMl} ml` : "noch keine Aufnahme"}</b>
            </div>
            <div className={historyRolling.hours ? `tone-${actualMetricStatus.rolling}` : "tone-neutral"}>
              <small>Ø 3 H</small>
              <b>{historyRolling.hours ? `${formatNumber(historyRolling.carbsPerHour)} g KH/h · ${historyRolling.fluidPerHour} ml/h` : "noch kein belastbarer Ø"}</b>
            </div>
            {lastActualSummary.caffeineMg > 0 && <div className="tone-neutral"><small>KOFFEIN ZULETZT</small><b>{Math.round(lastActualSummary.caffeineMg)} mg</b></div>}
          </div>
          {fuelNeedsAttention && <div className={`pit-live-plan-alert tone-${metricStatus.carbs === "high" ? "high" : "low"}`}>⚠️ {alert}</div>}
          <p><b>{planAdjusted ? "Coach-Basis:" : "Warum?"}</b> {recommendation.why}</p>
          <div className="pit-live-auto-plan-note">{planAdjusted ? "✎ Auswahl geändert. KH und Flüssigkeit werden sofort mit der aktuellen Crew-Auswahl neu gerechnet." : "✓ Der Idealvorschlag ist automatisch vorausgewählt. Nur ändern, wenn es im Pit tatsächlich anders läuft."}</div>
        </section>

        <details className="pit-live-collapse">
          <summary><span>ATHLETE STATUS</span><b>{compactStatus(effectiveAthleteFlags)}</b><i>›</i></summary>
          <div className="pit-live-collapse-body">
            <p className="pit-live-help">Nur Änderungen melden. Wenn alles gut ist, muss hier nichts angefasst werden.</p>
            <div className="pit-live-status-grid">
              {STATUS_OPTIONS.map(([key, icon, label]) => (
                <button type="button" key={key} className={flags.includes(key) ? "active" : ""} onClick={() => setFlags((current) => toggleValue(current, key))}><b>{icon}</b><span>{label}</span></button>
              ))}
            </div>
          </div>
        </details>

        {renderAthleteCareSection()}

        {renderFuelingSection()}

        <details className="pit-live-collapse pit-live-tools">
          <summary><span>WERKZEUGE</span><b>{demoActive ? "Testmodus aktiv" : "Bilanz · Verlauf · Test · Vorrat"}</b><i>›</i></summary>
          <div className="pit-live-collapse-body pit-live-tools-options">
            <details className="pit-live-tool-option">
              <summary><span>KH-BILANZ</span><b>{historyRolling.hours ? `${formatNumber(historyRolling.carbsPerHour)} g/h Ø` : `Ziel ${PIT_CARB_TARGET.center} g/h`}</b><i>›</i></summary>
              <div className="pit-live-tool-option-body">
                <div className="pit-live-history-rows">
                  <div><em aria-hidden="true" /><b>Aktueller Pit-Plan</b><span>{formatNumber(activePlanSummary.carbs)} g KH · {activePlanSummary.fluidMl} ml</span></div>
                  <div><em aria-hidden="true" /><b>Zuletzt tatsächlich</b><span>{formatNumber(lastActualSummary.carbs)} g KH · {lastActualSummary.fluidMl} ml</span></div>
                  <div><em aria-hidden="true" /><b>Ø letzte {historyRolling.hours || 0} h</b><span>{historyRolling.hours ? `${formatNumber(historyRolling.carbsPerHour)} g KH/h · ${historyRolling.fluidPerHour} ml/h` : "noch keine belastbare Historie"}</span></div>
                </div>
                <p className="pit-live-help">Zielbereich: {PIT_CARB_TARGET.min}–{PIT_CARB_TARGET.max} g KH/h. Der aktuelle Pit-Plan oben zeigt bereits direkt, ob die ausgewählte Versorgung passt.</p>
              </div>
            </details>

            {history.length > 0 && <details className="pit-live-tool-option">
              <summary><span>VERLAUF & KORREKTUR</span><b>Ø3h {formatNumber(historyRolling.carbsPerHour)} g/h</b><i>›</i></summary>
              <div className="pit-live-tool-option-body">
                <div className="pit-live-history-rows">{history.map((record, index) => ({ record, index })).slice(-5).reverse().map(({ record, index }) => {
                  const carried = (record.carriedSelection || record.plannedSelection || record.carrySelection || []).length > 0;
                  const tone = historyTone(record, index);
                  const pendingText = record.carryStatus === "pending"
                    ? Number(record.round) < Number(pitRound)
                      ? ` · Loop ${Number(record.round) + 1} Aufnahme bestätigen`
                      : ` · Loop ${Number(record.round) + 1} startklar`
                    : "";
                  const shownSummary = record.summary || summarizePitSelection(record.selection, productCatalog);
                  const plannedSummary = record.carryStatus === "pending" && record.provisionalSummary ? record.provisionalSummary : null;
                  return <div key={record.round} className={`tone-${tone}`}><em aria-hidden="true" /><b>{carried ? `Pit ${record.round} → Loop ${Number(record.round) + 1}` : `Pit ${record.round}`}</b><span>{formatNumber(shownSummary.carbs)} g KH · {shownSummary.fluidMl} ml{plannedSummary ? ` · geplant ${formatNumber(plannedSummary.carbs)} g / ${plannedSummary.fluidMl} ml · noch nicht bestätigt` : ""}{pendingText}</span></div>;
                })}</div>
                <button type="button" className="pit-live-secondary pit-live-wide" onClick={editLastPit}>Letzten Pit korrigieren</button>
              </div>
            </details>}

            <details className="pit-live-tool-option">
              <summary><span>TEST / DEMO</span><b>{demoActive ? "aktiv" : "optional"}</b><i>›</i></summary>
              <div className="pit-live-tool-option-body">
                {!demoActive ? (
                  <>
                    <p className="pit-live-help">Testdaten liegen separat. Die normale Pit-Ansicht und echte Session-Daten bleiben unangetastet.</p>
                    <button type="button" className="pit-live-primary pit-live-wide" onClick={beginDemo}>Testmodus starten</button>
                    {!race?.time && <button type="button" className="pit-live-secondary pit-live-wide" onClick={() => setAnchorAt(new Date().toISOString())}>Startzeit = jetzt</button>}
                    <button type="button" className="pit-live-danger pit-live-wide" onClick={resetSession}>Gesamte Live-Session zurücksetzen</button>
                  </>
                ) : (
                  <>
                    <p className="pit-live-help">Der Test beginnt bewusst bei „Pit: Start“. Erst Versorgung für Loop 1 startklar machen, dann Loop 1 starten. Danach gilt immer: Rückkehr bestätigen → nächsten Pit startklar machen → nächste Loop starten.</p>
                    <div className="pit-live-demo-loop">
                      <button type="button" className="pit-live-secondary" disabled={demoRound <= 0} onClick={() => moveDemoLoop(-1)}>← Phase</button>
                      <button type="button" className="pit-live-primary" disabled={!savedLoopReady || (demoRound > 0 && (!arrivalState.arrived || checkInOpen))} onClick={() => moveDemoLoop(1)}>{demoRound === 0 ? "Loop 1 starten →" : `Loop ${demoRound + 1} starten →`}</button>
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

            {renderStockSection()}
          </div>
        </details>

        {saveMessage && <p className="pit-live-save-message">{saveMessage}</p>}
        <section className="pit-live-mini-bar" aria-label="Pit Aktion">
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
          <div className="pit-live-checkin-head"><div><small>ATHLET ZURÜCK · LOOP {timing.currentRound}</small><h3>Rückkehr kurz übernehmen</h3><p>Status und tatsächliche Versorgung in einem Schritt bestätigen. Der Vorschlag ist vorausgewählt; nur Abweichungen brauchen Details.</p></div></div>

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
              <div className="pit-live-checkin-subhead"><small>AUFNAHME FÜR LOOP {timing.currentRound}</small><span>{singleArrivalItem ? selectionLabel(singleArrivalItem, productCatalog) : "Was vom kompletten Pit-/Loop-Plan wurde tatsächlich eingenommen?"}</span></div>
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
