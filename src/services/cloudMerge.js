function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function same(left, right) {
  if (Object.is(left, right)) return true;
  if (typeof left !== typeof right) return false;
  if (left == null || right == null) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((entry, index) => same(entry, right[index]));
  }
  if (isPlainObject(left) && isPlainObject(right)) {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    if (!same(leftKeys, rightKeys)) return false;
    return leftKeys.every((key) => same(left[key], right[key]));
  }
  return false;
}

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (isPlainObject(value)) return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, clone(entry)]));
  return value;
}

function entityKey(item) {
  if (!isPlainObject(item)) return null;
  const candidates = ["id", "key", "uuid", "activityId", "intervalsId", "externalId", "productId", "eventId", "date"];
  for (const field of candidates) {
    const value = item[field];
    if (value !== undefined && value !== null && value !== "") return `${field}:${String(value)}`;
  }
  return null;
}

function entityArrayMap(array) {
  const map = new Map();
  for (const item of array) {
    const key = entityKey(item);
    if (!key || map.has(key)) return null;
    map.set(key, item);
  }
  return map;
}

function joinPath(path, key) {
  return path ? `${path}.${key}` : String(key);
}

function mergeNode(base, local, remote, path, conflicts) {
  if (same(local, remote)) return clone(local);
  if (same(local, base)) return clone(remote);
  if (same(remote, base)) return clone(local);

  if (isPlainObject(base) && isPlainObject(local) && isPlainObject(remote)) {
    const result = {};
    const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
    for (const key of keys) {
      const hasBase = Object.prototype.hasOwnProperty.call(base, key);
      const hasLocal = Object.prototype.hasOwnProperty.call(local, key);
      const hasRemote = Object.prototype.hasOwnProperty.call(remote, key);
      const childPath = joinPath(path, key);

      if (!hasLocal && !hasRemote) continue;
      if (!hasBase) {
        if (hasLocal && hasRemote) {
          if (same(local[key], remote[key])) result[key] = clone(local[key]);
          else conflicts.push(childPath);
        } else {
          result[key] = clone(hasLocal ? local[key] : remote[key]);
        }
        continue;
      }
      if (!hasLocal) {
        if (same(remote[key], base[key])) continue;
        conflicts.push(childPath);
        continue;
      }
      if (!hasRemote) {
        if (same(local[key], base[key])) continue;
        conflicts.push(childPath);
        continue;
      }
      result[key] = mergeNode(base[key], local[key], remote[key], childPath, conflicts);
    }
    return result;
  }

  if (Array.isArray(base) && Array.isArray(local) && Array.isArray(remote)) {
    const baseMap = entityArrayMap(base);
    const localMap = entityArrayMap(local);
    const remoteMap = entityArrayMap(remote);
    if (baseMap && localMap && remoteMap) {
      const keys = new Set([...baseMap.keys(), ...localMap.keys(), ...remoteMap.keys()]);
      const mergedByKey = new Map();
      for (const key of keys) {
        const hasBase = baseMap.has(key);
        const hasLocal = localMap.has(key);
        const hasRemote = remoteMap.has(key);
        const childPath = `${path || "items"}[${key}]`;
        if (!hasLocal && !hasRemote) continue;
        if (!hasBase) {
          if (hasLocal && hasRemote) {
            if (same(localMap.get(key), remoteMap.get(key))) mergedByKey.set(key, clone(localMap.get(key)));
            else conflicts.push(childPath);
          } else {
            mergedByKey.set(key, clone(hasLocal ? localMap.get(key) : remoteMap.get(key)));
          }
          continue;
        }
        if (!hasLocal) {
          if (!same(remoteMap.get(key), baseMap.get(key))) conflicts.push(childPath);
          continue;
        }
        if (!hasRemote) {
          if (!same(localMap.get(key), baseMap.get(key))) conflicts.push(childPath);
          continue;
        }
        mergedByKey.set(key, mergeNode(baseMap.get(key), localMap.get(key), remoteMap.get(key), childPath, conflicts));
      }

      const order = [];
      for (const item of local) {
        const key = entityKey(item);
        if (mergedByKey.has(key) && !order.includes(key)) order.push(key);
      }
      for (const item of remote) {
        const key = entityKey(item);
        if (mergedByKey.has(key) && !order.includes(key)) order.push(key);
      }
      return order.map((key) => mergedByKey.get(key));
    }
  }

  conflicts.push(path || "root");
  return clone(local);
}

export function mergeCloudStates(base = {}, local = {}, remote = {}) {
  const conflicts = [];
  const value = mergeNode(base ?? {}, local ?? {}, remote ?? {}, "", conflicts);
  return {
    clean: conflicts.length === 0,
    value,
    conflicts: [...new Set(conflicts)],
  };
}
