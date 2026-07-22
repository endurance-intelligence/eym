import { supabase } from "./supabase";

export const IMAGE_BUCKET = "athlete-images";
const MANAGED_IMAGE_PREFIX = "eym-image://";
const IMAGE_DELETION_QUEUE_KEY = "endurance-intelligence.image-deletions.v1";
const resolvedImages = new Map();

const ENTITY_FIELDS = {
  equipment: ["photo"],
  fuel: ["imageUrl", "nutritionImageUrl", "ingredientsImageUrl"],
};

function safePathPart(value) {
  return String(value || "unknown").replace(/[^a-zA-Z0-9_-]/g, "-");
}

export function isEmbeddedImage(value) {
  return /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(String(value || ""));
}

export function isManagedImage(value) {
  return String(value || "").startsWith(MANAGED_IMAGE_PREFIX);
}

export function imageObjectPath(userId, entityType, entityId, field) {
  return [userId, safePathPart(entityType), safePathPart(entityId), `${safePathPart(field)}.jpg`].join("/");
}

export function managedImagePath(value) {
  if (!isManagedImage(value)) return "";
  return String(value).slice(MANAGED_IMAGE_PREFIX.length).split("?")[0];
}

function managedImageValue(path) {
  return `${MANAGED_IMAGE_PREFIX}${path}?v=${Date.now()}`;
}

async function dataUrlBlob(dataUrl) {
  const response = await fetch(dataUrl);
  if (!response.ok) throw new Error("Bilddaten konnten nicht vorbereitet werden.");
  return response.blob();
}

function clearResolvedPath(path) {
  for (const [value, objectUrl] of resolvedImages.entries()) {
    if (managedImagePath(value) !== path) continue;
    URL.revokeObjectURL(objectUrl);
    resolvedImages.delete(value);
  }
}

export async function uploadEntityImage(userId, entityType, entityId, field, value) {
  if (!isEmbeddedImage(value)) return value;
  const path = imageObjectPath(userId, entityType, entityId, field);
  const blob = await dataUrlBlob(value);
  const { error } = await supabase.storage.from(IMAGE_BUCKET).upload(path, blob, {
    contentType: "image/jpeg",
    cacheControl: "31536000",
    upsert: true,
  });
  if (error) throw new Error(`Bildspeicher nicht verfügbar: ${error.message}`);
  clearResolvedPath(path);
  return managedImageValue(path);
}

export async function resolveImageUrl(value) {
  if (!isManagedImage(value)) return value || "";
  if (resolvedImages.has(value)) return resolvedImages.get(value);
  const { data, error } = await supabase.storage.from(IMAGE_BUCKET).download(managedImagePath(value));
  if (error) throw new Error(`Bild konnte nicht geladen werden: ${error.message}`);
  const objectUrl = URL.createObjectURL(data);
  resolvedImages.set(value, objectUrl);
  return objectUrl;
}

export async function uploadEntityImages(userId, entityType, entityId, values) {
  const fields = ENTITY_FIELDS[entityType] || [];
  const stored = { ...values };
  for (const field of fields) {
    if (isEmbeddedImage(stored[field])) {
      stored[field] = await uploadEntityImage(userId, entityType, entityId, field, stored[field]);
    }
  }
  return stored;
}

function loadDeletionQueue() {
  try {
    const parsed = JSON.parse(localStorage.getItem(IMAGE_DELETION_QUEUE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveDeletionQueue(queue) {
  localStorage.setItem(IMAGE_DELETION_QUEUE_KEY, JSON.stringify(queue));
}

export function queueEntityImageDeletion(userId, entityType, entityId, values = {}) {
  const paths = (ENTITY_FIELDS[entityType] || [])
    .map((field) => managedImagePath(values[field]))
    .filter(Boolean);
  if (!paths.length) return 0;
  const queue = loadDeletionQueue().filter((entry) => !(
    entry.userId === userId && entry.entityType === entityType && entry.entityId === entityId
  ));
  queue.push({ userId, entityType, entityId, paths: [...new Set(paths)] });
  saveDeletionQueue(queue);
  return paths.length;
}

export async function flushQueuedImageDeletions(userId, cloudState = {}) {
  const queue = loadDeletionQueue();
  const removable = [];
  const retained = [];
  queue.forEach((entry) => {
    const entityStillExists = Array.isArray(cloudState[entry.entityType])
      && cloudState[entry.entityType].some((item) => item.id === entry.entityId);
    if (entry.userId !== userId || entityStillExists) retained.push(entry);
    else removable.push(entry);
  });
  if (!removable.length) return 0;
  const paths = [...new Set(removable.flatMap((entry) => entry.paths || []))];
  const { error } = await supabase.storage.from(IMAGE_BUCKET).remove(paths);
  if (error) throw new Error(`Bildbereinigung wird später erneut versucht: ${error.message}`);
  paths.forEach(clearResolvedPath);
  saveDeletionQueue(retained);
  return paths.length;
}

export function embeddedImageCount(state = {}) {
  return [
    ...(Array.isArray(state.equipment) ? state.equipment.flatMap((item) => ENTITY_FIELDS.equipment.map((field) => item[field])) : []),
    ...(Array.isArray(state.fuel) ? state.fuel.flatMap((item) => ENTITY_FIELDS.fuel.map((field) => item[field])) : []),
  ].filter(isEmbeddedImage).length;
}

export async function migrateEmbeddedImages(userId, state = {}, onProgress = () => {}) {
  const candidates = [];
  for (const [entityType, fields] of Object.entries(ENTITY_FIELDS)) {
    const items = Array.isArray(state[entityType]) ? state[entityType] : [];
    items.forEach((item) => fields.forEach((field) => {
      if (isEmbeddedImage(item[field])) candidates.push({ entityType, entityId: item.id, field, original: item[field] });
    }));
  }

  const updates = [];
  for (const candidate of candidates) {
    const url = await uploadEntityImage(userId, candidate.entityType, candidate.entityId, candidate.field, candidate.original);
    updates.push({ ...candidate, url });
    onProgress(updates.length, candidates.length);
  }
  return updates;
}

export function applyImageMigrations(state, updates = []) {
  if (!updates.length) return state;
  const byEntity = new Map();
  updates.forEach((update) => {
    const key = `${update.entityType}:${update.entityId}`;
    if (!byEntity.has(key)) byEntity.set(key, []);
    byEntity.get(key).push(update);
  });

  let changed = false;
  const next = { ...state };
  for (const entityType of Object.keys(ENTITY_FIELDS)) {
    const items = Array.isArray(state[entityType]) ? state[entityType] : [];
    next[entityType] = items.map((item) => {
      const entityUpdates = byEntity.get(`${entityType}:${item.id}`) || [];
      let updated = item;
      entityUpdates.forEach((entry) => {
        if (updated[entry.field] !== entry.original) return;
        updated = { ...updated, [entry.field]: entry.url };
        changed = true;
      });
      return updated;
    });
  }
  return changed ? next : state;
}
