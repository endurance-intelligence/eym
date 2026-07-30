const RECOVERY_QUERY = "ei-refresh";

function scopePath(value) {
  try {
    return new URL(value, globalThis.window?.location?.origin || "https://local.invalid").pathname;
  } catch {
    return "/";
  }
}

export function isDeploymentChunkError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return /dynamically imported module|failed to fetch.*module|chunkloaderror|loading chunk|importing a module script/.test(message);
}

export async function clearApplicationRuntime({
  navigatorAdapter = globalThis.navigator,
  cachesAdapter = globalThis.caches,
  baseUrl = "/",
} = {}) {
  const basePath = scopePath(baseUrl);
  const registrations = navigatorAdapter?.serviceWorker?.getRegistrations
    ? await navigatorAdapter.serviceWorker.getRegistrations()
    : [];
  await Promise.all((registrations || [])
    .filter((registration) => scopePath(registration.scope).startsWith(basePath))
    .map((registration) => registration.unregister()));

  if (cachesAdapter?.keys && cachesAdapter?.delete) {
    const keys = await cachesAdapter.keys();
    await Promise.all(keys
      .filter((key) => String(key).startsWith("eym-shell-"))
      .map((key) => cachesAdapter.delete(key)));
  }
}

export async function recoverApplication({
  windowAdapter = globalThis.window,
  navigatorAdapter = globalThis.navigator,
  cachesAdapter = globalThis.caches,
  baseUrl = "/",
  destinationHash = "",
} = {}) {
  await clearApplicationRuntime({ navigatorAdapter, cachesAdapter, baseUrl });
  const url = new URL(windowAdapter.location.href);
  url.searchParams.set(RECOVERY_QUERY, Date.now().toString(36));
  if (destinationHash) url.hash = destinationHash;
  windowAdapter.location.replace(url.toString());
}

export function removeRecoveryMarker(windowAdapter = globalThis.window) {
  if (!windowAdapter?.location || !windowAdapter?.history?.replaceState) return;
  const url = new URL(windowAdapter.location.href);
  if (!url.searchParams.has(RECOVERY_QUERY)) return;
  url.searchParams.delete(RECOVERY_QUERY);
  windowAdapter.history.replaceState(windowAdapter.history.state, "", url.toString());
}
