export async function requestScreenWakeLock(environment = globalThis.navigator) {
  if (!environment?.wakeLock?.request) return { supported: false, lock: null, error: null };
  try {
    const lock = await environment.wakeLock.request("screen");
    return { supported: true, lock, error: null };
  } catch (error) {
    return { supported: true, lock: null, error };
  }
}

export async function releaseScreenWakeLock(lock) {
  if (!lock || typeof lock.release !== "function") return;
  try {
    await lock.release();
  } catch {
    // The browser may already have released the lock after hiding the tab.
  }
}
