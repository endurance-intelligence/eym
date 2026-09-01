const TOKEN_STORAGE_PREFIX = "endurance-pit-crew-share-token:";

export function cleanRaceKey(value) {
  return String(value || "").trim().slice(0, 240);
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
  baseUrl = "/",
} = {}) {
  const url = new URL(baseUrl, `${String(origin).replace(/\/+$/, "")}/`);
  url.searchParams.set("crew", String(token || ""));
  url.hash = "";
  return url.toString();
}
