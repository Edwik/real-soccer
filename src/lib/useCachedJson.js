"use client";

import { useEffect, useMemo, useState } from "react";
import { readCache, writeCache } from "./localCache";

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

export function useCachedJson(url, { cacheKey, ttlMs = THREE_DAYS_MS } = {}) {
  const key = useMemo(() => cacheKey ?? url, [cacheKey, url]);
  const [cache, setCache] = useState(() => ({
    checkedKey: null,
    data: null,
  }));
  const [network, setNetwork] = useState(() => ({
    completedKey: null,
    data: null,
    error: null,
  }));

  useEffect(() => {
    if (!url) return;
    if (cache.checkedKey === key) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setCache({ checkedKey: key, data: readCache(key) });
    });
    return () => {
      cancelled = true;
    };
  }, [url, key, cache.checkedKey]);

  useEffect(() => {
    if (!url) return;
    if (cache.checkedKey !== key) return;
    if (cache.data !== null && cache.data !== undefined) return;
    if (network.completedKey === key) return;

    let cancelled = false;

    fetch(url)
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`HTTP ${res.status}: ${text || "Error"}`);
        }
        return res.json();
      })
      .then((json) => {
        if (cancelled) return;
        writeCache(key, json, ttlMs);
        setNetwork({ completedKey: key, data: json, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setNetwork({ completedKey: key, data: null, error: err });
      });

    return () => {
      cancelled = true;
    };
  }, [url, key, ttlMs, cache.checkedKey, cache.data, network.completedKey]);

  if (!url) {
    return { loading: false, data: null, error: null, source: "network" };
  }

  if (cache.checkedKey === key && cache.data !== null && cache.data !== undefined) {
    return { loading: false, data: cache.data, error: null, source: "cache" };
  }

  if (network.completedKey === key) {
    return {
      loading: false,
      data: network.data,
      error: network.error,
      source: "network",
    };
  }

  return { loading: true, data: null, error: null, source: "network" };
}
