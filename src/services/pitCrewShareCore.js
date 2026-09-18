
const TOKEN_STORAGE_PREFIX = "endurance-pit-crew-share-token:";

function normalizeSelection(value) {
  return (Array.isArray(value) ? value : [])
    .filter((entry) => entry && typeof entry === "object" && entry.productId != null && entry.portionId != null)
    .map((entry) => ({
      ...entry,
      productId: String(entry.productId),
      portionId: String(entry.portionId),
      quantity: Math.max(1, Math.min(20, Math.round(Number(entry.quantity || 1)))),
      ...(entry.intakeFactor == null ? {} : { intakeFactor: Math.max(0, Math.min(1, Number(entry.intakeFactor) || 0)) }),
    }));
}

function normalizeSummary(value) {
  if (!value || typeof value !== "object") return null;
  return {
    ...value,
    carbs: Math.max(0, Number(value.carbs || 0)),
    fluidMl: Math.max(0, Math.round(Number(value.fluidMl || 0))),
    caffeineMg: Math.max(0, Number(value.caffeineMg || 0)),
    sodiumMg: Math.max(0, Math.round(Number(value.sodiumMg || 0))),
  };
}

function normalizeHistory(value) {
  return (Array.isArray(value) ? value : [])
    .filter((record) => record && typeof record === "object")
    .map((record) => ({
      ...record,
      round: Math.max(0, Number(record.round || 0)),
      selection: normalizeSelection(record.selection),
      plannedSelection: normalizeSelection(record.plannedSelection),
      carrySelection: normalizeSelection(record.carrySelection),
      carriedSelection: normalizeSelection(record.carriedSelection),
      ...(normalizeSummary(record.summary) ? { summary: normalizeSummary(record.summary) } : {}),
      ...(normalizeSummary(record.provisionalSummary) ? { provisionalSummary: normalizeSummary(record.provisionalSummary) } : {}),
      flags: Array.isArray(record.flags) ? record.flags.map(String) : [],
      weather: Array.isArray(record.weather) ? record.weather.map(String) : [],
    }));
}

function normalizeCustomProducts(value) {
  return (Array.isArray(value) ? value : [])
    .filter((product) => product && typeof product === "object" && product.id != null && Array.isArray(product.portions) && product.portions.length > 0)
    .map((product) => ({
      ...product,
      id: String(product.id),
      portions: product.portions
        .filter((portion) => portion && typeof portion === "object" && portion.id != null)
        .map((portion) => ({ ...portion, id: String(portion.id) })),
    }))
    .filter((product) => product.portions.length > 0);
}


function normalizeStockTargets(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([id, target]) => {
    if (!target || typeof target !== "object") return [];
    const quantity = Number(target.quantity);
    if (!Number.isFinite(quantity) || quantity < 0) return [];
    return [[String(id), { quantity, unit: String(target.unit || "Portionen") }]];
  }));
}

function normalizeAthleteFeedback(value) {
  if (!value || typeof value !== "object") return null;
  return {
    ...value,
    round: Math.max(0, Number(value.round || 0)),
    flags: Array.isArray(value.flags) ? value.flags.map(String) : [],
    at: String(value.at || ""),
    source: value.source === "athlete" ? "athlete" : "crew",
  };
}

export function normalizePitCrewSnapshot(value = {}) {
  return {
    anchorAt: String(value?.anchorAt || ""),
    history: normalizeHistory(value?.history),
    flags: Array.isArray(value?.flags) ? value.flags.map(String) : [],
    incomingFlags: Array.isArray(value?.incomingFlags) ? value.incomingFlags.map(String) : [],
    incomingAt: String(value?.incomingAt || ""),
    incomingRound: Math.max(0, Number(value?.incomingRound || 0)),
    athleteFeedback: normalizeAthleteFeedback(value?.athleteFeedback),
    weather: Array.isArray(value?.weather) ? value.weather.map(String) : [],
    arrivalRound: Math.max(0, Number(value?.arrivalRound || 0)),
    arrivalAt: String(value?.arrivalAt || ""),
    stockIds: Array.isArray(value?.stockIds) ? value.stockIds.map(String) : null,
    stockTargets: normalizeStockTargets(value?.stockTargets),
    gelPriority: Array.isArray(value?.gelPriority) ? value.gelPriority.map(String) : null,
    fuelMode: value?.fuelMode === "liquid-only" ? "liquid-only" : "normal",
    customProducts: normalizeCustomProducts(value?.customProducts),
  };
}

export function cleanRaceKey(value) {
  return String(value || "").trim().slice(0, 240);
}

export function pitCrewStorageKey(race = {}) {
  return `endurance-pit-crew:${race?.key || race?.name || "backyard"}:${race?.date || "open"}`;
}

export function readPitCrewLocalSnapshot(race = {}, storage = globalThis.window?.localStorage) {
  if (!storage) return normalizePitCrewSnapshot();
  try {
    const parsed = JSON.parse(storage.getItem(pitCrewStorageKey(race)) || "null");
    return normalizePitCrewSnapshot(parsed || {});
  } catch {
    return normalizePitCrewSnapshot();
  }
}

export function writePitCrewLocalSnapshot(race = {}, snapshot = {}, storage = globalThis.window?.localStorage) {
  if (!storage) return;
  storage.setItem(pitCrewStorageKey(race), JSON.stringify(normalizePitCrewSnapshot(snapshot)));
}

export function storedPitCrewShareToken(raceKey, storage = globalThis.window?.localStorage) {
  if (!storage) return "";
  return String(storage.getItem(`${TOKEN_STORAGE_PREFIX}${cleanRaceKey(raceKey)}`) || "");
}

export function rememberPitCrewShareToken(raceKey, token, storage = globalThis.window?.localStorage) {
  if (!storage || !cleanRaceKey(raceKey)) return;
  if (token) storage.setItem(`${TOKEN_STORAGE_PREFIX}${cleanRaceKey(raceKey)}`, String(token));
  else storage.removeItem(`${TOKEN_STORAGE_PREFIX}${cleanRaceKey(raceKey)}`);
}

export function buildPitCrewShareUrl(token, {
  origin = globalThis.window?.location?.origin || "https://local.invalid",
  baseUrl = "/",
} = {}) {
  const url = new URL(baseUrl, `${String(origin).replace(/\/+$/, "")}/`);
  url.searchParams.set("crew", String(token || ""));
  url.hash = "";
  return url.toString();
}
