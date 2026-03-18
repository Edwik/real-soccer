const PREFIX = "realsoccer.cache.v1.";

function nowMs() {
  return Date.now();
}

export function buildCacheKey(key) {
  return `${PREFIX}${key}`;
}

export function readCache(key) {
  if (typeof window === "undefined") return null;
  const storageKey = buildCacheKey(key);
  const raw = window.localStorage.getItem(storageKey);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    const expiresAt = parsed?.expiresAt ?? 0;
    if (!expiresAt || nowMs() > expiresAt) {
      window.localStorage.removeItem(storageKey);
      return null;
    }
    return parsed?.value ?? null;
  } catch {
    window.localStorage.removeItem(storageKey);
    return null;
  }
}

export function writeCache(key, value, ttlMs) {
  if (typeof window === "undefined") return;
  const storageKey = buildCacheKey(key);
  const expiresAt = nowMs() + Math.max(0, ttlMs);
  const payload = { expiresAt, value };
  window.localStorage.setItem(storageKey, JSON.stringify(payload));
}

export function removeCache(key) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(buildCacheKey(key));
}

