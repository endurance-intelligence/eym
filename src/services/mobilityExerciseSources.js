const INSTAGRAM_HOSTS = new Set(["instagram.com", "www.instagram.com"]);
const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"]);

function safeUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url;
  } catch {
    return null;
  }
}

function instagramPath(url) {
  const match = url.pathname.match(/^\/(reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i);
  if (!match) return null;
  return { type: match[1].toLocaleLowerCase("en-US"), id: match[2] };
}

function youtubeId(url) {
  if (url.hostname === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] || "";
  const shortMatch = url.pathname.match(/^\/shorts\/([A-Za-z0-9_-]+)/i);
  if (shortMatch) return shortMatch[1];
  return url.searchParams.get("v") || "";
}

export function parseExerciseSourceUrl(value) {
  const url = safeUrl(value);
  if (!url) return { valid: false, reason: "Bitte füge einen vollständigen öffentlichen Link ein." };

  if (INSTAGRAM_HOSTS.has(url.hostname)) {
    const path = instagramPath(url);
    if (!path) return { valid: false, reason: "Unterstützt werden öffentliche Instagram-Reels und -Beiträge." };
    const type = path.type === "reels" ? "reel" : path.type;
    const canonicalUrl = `https://www.instagram.com/${type}/${path.id}/`;
    return {
      valid: true,
      provider: "instagram",
      providerLabel: "Instagram",
      contentType: type,
      contentId: path.id,
      canonicalUrl,
      embedUrl: `${canonicalUrl}embed/captioned/`,
    };
  }

  if (YOUTUBE_HOSTS.has(url.hostname)) {
    const id = youtubeId(url);
    if (!id) return { valid: false, reason: "Der YouTube-Link enthält keine erkennbare Video-ID." };
    return {
      valid: true,
      provider: "youtube",
      providerLabel: "YouTube",
      contentType: url.pathname.includes("/shorts/") ? "short" : "video",
      contentId: id,
      canonicalUrl: `https://www.youtube.com/watch?v=${id}`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
    };
  }

  return { valid: false, reason: "Aktuell werden öffentliche Instagram- und YouTube-Links unterstützt." };
}

async function fetchJson(url, signal) {
  const response = await fetch(url, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Metadaten konnten nicht geladen werden (${response.status}).`);
  return response.json();
}

export async function fetchExerciseSourceMetadata(value, signal) {
  const parsed = parseExerciseSourceUrl(value);
  if (!parsed.valid) throw new Error(parsed.reason);

  let metadata = {};
  if (parsed.provider === "instagram") {
    const endpoint = `https://graph.facebook.com/instagram_oembed?url=${encodeURIComponent(parsed.canonicalUrl)}&omitscript=true`;
    metadata = await fetchJson(endpoint, signal);
  } else if (parsed.provider === "youtube") {
    const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(parsed.canonicalUrl)}&format=json`;
    metadata = await fetchJson(endpoint, signal);
  }

  return {
    ...parsed,
    title: String(metadata.title || "").trim(),
    authorName: String(metadata.author_name || "").trim(),
    providerName: String(metadata.provider_name || parsed.providerLabel).trim(),
    thumbnailUrl: String(metadata.thumbnail_url || "").trim(),
    fetchedAt: new Date().toISOString(),
  };
}

export function emptyCustomExerciseDraft() {
  return {
    id: "",
    sourceUrl: "",
    source: null,
    name: "",
    subtitle: "",
    group: "Dynamisch",
    seconds: 60,
    purpose: "",
    quickStart: "",
    instruction: "",
    focusAreas: ["hips", "core"],
    equipment: [],
    intensity: "medium",
    coachUse: "general",
    sideSwitch: false,
    sideSwitchSeconds: 5,
    coachApproved: false,
    avoidBeforeQuality: false,
  };
}

function unique(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter(Boolean))];
}

function text(value, fallback = "") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

export function normalizeCustomExercise(draft = {}, existingId = "") {
  const source = draft.source?.canonicalUrl
    ? {
      provider: draft.source.provider || "external",
      providerLabel: draft.source.providerLabel || draft.source.providerName || "Externe Quelle",
      canonicalUrl: draft.source.canonicalUrl,
      embedUrl: draft.source.embedUrl || "",
      title: draft.source.title || "",
      authorName: draft.source.authorName || "",
      thumbnailUrl: draft.source.thumbnailUrl || "",
      fetchedAt: draft.source.fetchedAt || "",
    }
    : null;
  const id = existingId || draft.id || `custom-${crypto.randomUUID()}`;
  const name = text(draft.name);
  const purpose = text(draft.purpose, "Persönlich gespeicherte Übung aus einer externen Inspirationsquelle.");
  const instruction = text(draft.instruction, draft.quickStart || "Bewegung kontrolliert und schmerzfrei ausführen.");
  const quickStart = text(draft.quickStart, instruction);
  const sideSwitch = Boolean(draft.sideSwitch);

  return {
    id,
    custom: true,
    name,
    subtitle: text(draft.subtitle, source?.authorName ? `Inspiration von ${source.authorName}` : "Persönliche Übung"),
    group: text(draft.group, "Dynamisch"),
    seconds: Math.max(15, Math.min(600, Number(draft.seconds || 60))),
    equipment: unique(draft.equipment),
    focusAreas: unique(draft.focusAreas).slice(0, 4),
    intensity: ["low", "medium", "high"].includes(draft.intensity) ? draft.intensity : "medium",
    coachUse: ["general", "activation", "recovery", "strength"].includes(draft.coachUse) ? draft.coachUse : "general",
    coachApproved: Boolean(draft.coachApproved),
    avoidBeforeQuality: Boolean(draft.avoidBeforeQuality),
    sideSwitch,
    sideSwitchSeconds: sideSwitch ? Math.max(3, Math.min(10, Number(draft.sideSwitchSeconds || 5))) : 0,
    switchCue: "Seite wechseln",
    visual: "custom-source",
    purpose,
    quickStart,
    instruction,
    steps: [quickStart, "Bewegung kontrolliert wiederholen.", sideSwitch ? "Nach dem Signal sauber die Seite wechseln." : "Spannung und Bewegungsqualität bis zum Ende halten."],
    cues: ["Kontrolliert arbeiten", "Ruhig weiteratmen", "Schmerzfreie Bewegung"],
    mistakes: ["Zu viel Schwung", "Bewegungsqualität für Tempo opfern", "In Beschwerden hineinarbeiten"],
    easier: "Bewegungsweg, Tempo oder Belastungszeit reduzieren.",
    harder: "Nur bei sauberer Technik den Bewegungsweg oder die Belastungszeit erhöhen.",
    source,
    updatedAt: new Date().toISOString(),
  };
}

export function validateCustomExerciseDraft(draft = {}) {
  if (!text(draft.name)) return "Bitte gib der Übung einen eindeutigen Namen.";
  if (!draft.source?.canonicalUrl) return "Bitte prüfe zuerst den Instagram- oder YouTube-Link.";
  if (!Array.isArray(draft.focusAreas) || draft.focusAreas.length === 0) return "Wähle mindestens einen Trainingsschwerpunkt.";
  if (!text(draft.quickStart || draft.instruction)) return "Beschreibe kurz, wie die Übung ausgeführt wird.";
  return "";
}

export function mergeExerciseLibrary(baseExercises = [], customExercises = []) {
  const base = Array.isArray(baseExercises) ? baseExercises : [];
  const custom = (Array.isArray(customExercises) ? customExercises : [])
    .filter((item) => item?.id && item?.name)
    .map((item) => ({ ...item, custom: true }));
  const customIds = new Set(custom.map((item) => item.id));
  return [...base.filter((item) => !customIds.has(item.id)), ...custom];
}

export function customExerciseCoachMatch(exercise = {}, adaptiveProfile = null) {
  if (!exercise.custom || !exercise.coachApproved) return false;
  if (!adaptiveProfile) return exercise.coachUse === "general";
  if (adaptiveProfile.safetyMode && exercise.intensity === "high") return false;
  const timing = adaptiveProfile.context?.timing || "rest";
  const kind = adaptiveProfile.context?.kind || "rest";
  if (exercise.avoidBeforeQuality && ["before", "tomorrow"].includes(timing) && ["track", "football", "long"].includes(kind)) return false;
  if (exercise.coachUse === "general") return true;
  if (exercise.coachUse === "activation") return ["before", "tomorrow"].includes(timing);
  if (exercise.coachUse === "recovery") return timing === "after" || adaptiveProfile.condition === "tired";
  if (exercise.coachUse === "strength") return adaptiveProfile.condition === "fresh" && kind === "rest";
  return false;
}

export function exerciseSourceLabel(source = {}) {
  if (!source?.canonicalUrl) return "Eigene Übung";
  const author = source.authorName ? ` · ${source.authorName}` : "";
  return `${source.providerLabel || "Quelle"}${author}`;
}
