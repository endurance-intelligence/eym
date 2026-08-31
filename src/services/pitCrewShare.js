import { supabase, supabaseConfigured } from "./supabase.js";

const TOKEN_STORAGE_PREFIX = "endurance-pit-crew-share-token:";

function cleanRaceKey(value) {
  return String(value || "").trim().slice(0, 240);
}

function functionError(error, fallback) {
  let detail = error?.message || fallback;
  const response = error?.context;
  if (!response?.json) return Promise.resolve(detail);
  return response.json()
    .then((body) => body?.message || detail)
    .catch(() => detail);
}

async function invokeShare(action, payload = {}) {
  if (!supabaseConfigured) throw new Error("Supabase ist für den Crew-Link noch nicht konfiguriert.");
  const { data, error } = await supabase.functions.invoke("pit-crew-share", {
    body: { action, ...payload },
  });
  if (error) throw new Error(await functionError(error, "Pit-Crew-Synchronisierung fehlgeschlagen."));
  if (!data?.ok) throw new Error(data?.message || "Pit-Crew-Synchronisierung wurde nicht bestätigt.");
  return data;
}

export function pitCrewStorageKey(race = {}) {
  return `endurance-pit-crew:${race?.key || race?.name || "backyard"}:${race?.date || "open"}`;
}

export function readPitCrewLocalSnapshot(race = {}, storage = globalThis.window?.localStorage) {
  if (!storage) return { anchorAt: "", history: [], flags: [], weather: [] };
  try {
    const parsed = JSON.parse(storage.getItem(pitCrewStorageKey(race)) || "null");
    return {
      anchorAt: String(parsed?.anchorAt || ""),
      history: Array.isArray(parsed?.history) ? parsed.history : [],
      flags: Array.isArray(parsed?.flags) ? parsed.flags : [],
      weather: Array.isArray(parsed?.weather) ? parsed.weather : [],
    };
  } catch {
    return { anchorAt: "", history: [], flags: [], weather: [] };
  }
}

export function writePitCrewLocalSnapshot(race = {}, snapshot = {}, storage = globalThis.window?.localStorage) {
  if (!storage) return;
  storage.setItem(pitCrewStorageKey(race), JSON.stringify({
    anchorAt: String(snapshot?.anchorAt || ""),
    history: Array.isArray(snapshot?.history) ? snapshot.history : [],
    flags: Array.isArray(snapshot?.flags) ? snapshot.flags : [],
    weather: Array.isArray(snapshot?.weather) ? snapshot.weather : [],
  }));
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
  baseUrl = import.meta.env.BASE_URL || "/",
} = {}) {
  const url = new URL(baseUrl, `${String(origin).replace(/\/+$/, "")}/`);
  url.searchParams.set("crew", String(token || ""));
  url.hash = "";
  return url.toString();
}

export async function createPitCrewShare({ raceKey, race, state }) {
  const data = await invokeShare("create", {
    raceKey: cleanRaceKey(raceKey),
    race,
    state,
  });
  return {
    token: data.token,
    url: buildPitCrewShareUrl(data.token),
    revision: Number(data.revision || 0),
    expiresAt: data.expiresAt || "",
  };
}

export async function loadPitCrewShare(token) {
  const data = await invokeShare("get", { token: String(token || "") });
  return {
    race: data.race || {},
    state: data.state || {},
    revision: Number(data.revision || 0),
    expiresAt: data.expiresAt || "",
  };
}

export async function updatePitCrewShare(token, state) {
  const data = await invokeShare("update", { token: String(token || ""), state });
  return {
    state: data.state || state || {},
    revision: Number(data.revision || 0),
    expiresAt: data.expiresAt || "",
  };
}

export async function sharePitCrewUrl(url, raceName = "Backyard") {
  if (globalThis.navigator?.share) {
    try {
      await globalThis.navigator.share({
        title: `Pit Crew · ${raceName}`,
        text: "Pit Crew Live – gemeinsamer Rennstand ohne EI-Login",
        url,
      });
      return "shared";
    } catch (error) {
      if (error?.name !== "AbortError") throw error;
      return "cancelled";
    }
  }
  if (!globalThis.navigator?.clipboard?.writeText) throw new Error("Der Crew-Link konnte nicht automatisch kopiert werden.");
  await globalThis.navigator.clipboard.writeText(url);
  return "copied";
}
