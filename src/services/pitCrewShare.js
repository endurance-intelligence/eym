import { supabase, supabaseConfigured } from "./supabase.js";
import {
  buildPitCrewShareUrl as buildPitCrewShareUrlCore,
  cleanRaceKey,
  pitCrewStorageKey,
  readPitCrewLocalSnapshot,
  rememberPitCrewShareToken,
  storedPitCrewShareToken,
  writePitCrewLocalSnapshot,
} from "./pitCrewShareCore.js";

export {
  pitCrewStorageKey,
  readPitCrewLocalSnapshot,
  rememberPitCrewShareToken,
  storedPitCrewShareToken,
  writePitCrewLocalSnapshot,
};

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

export function buildPitCrewShareUrl(token, options = {}) {
  return buildPitCrewShareUrlCore(token, {
    ...options,
    baseUrl: options.baseUrl ?? import.meta.env?.BASE_URL ?? "/",
  });
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
