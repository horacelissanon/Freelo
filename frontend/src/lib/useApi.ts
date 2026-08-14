'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from './api';

// In-memory stale-while-revalidate cache.
const cache = new Map<string, { data: unknown; ts: number }>();

const STALE_TIME = 2 * 60 * 1000;

// Broadcasts cache invalidation so mounted useApi() instances elsewhere in
// the tree (e.g. a list page open behind a "create" modal) refetch instead
// of silently going stale until the next manual navigation.
const CACHE_EVENT = 'merrudit:cache-invalidated';

function notifyInvalidated(prefix: string): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<{ prefix: string }>(CACHE_EVENT, { detail: { prefix } }));
  }
}

if (typeof window !== 'undefined') {
  const EVICTION_THRESHOLD = 3 * STALE_TIME;
  window.setInterval(
    () => {
      const now = Date.now();
      for (const [key, entry] of cache) {
        if (now - entry.ts > EVICTION_THRESHOLD) cache.delete(key);
      }
    },
    5 * 60 * 1000,
  );
}

interface UseApiOptions {
  skip?: boolean;
  staleTime?: number;
}

interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useApi<T>(path: string, options: UseApiOptions = {}): UseApiResult<T> {
  const { skip = false, staleTime = STALE_TIME } = options;

  const cached = cache.get(path);
  const [data, setData] = useState<T | null>(cached ? (cached.data as T) : null);
  const [loading, setLoading] = useState(!cached && !skip);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const pathRef = useRef(path);
  pathRef.current = path;
  const fetchIdRef = useRef(0);

  const fetchData = useCallback(
    async (showLoading: boolean) => {
      if (skip) return;
      const currentFetchId = ++fetchIdRef.current;
      if (showLoading) setLoading(true);
      setError(null);
      try {
        const result = await api<T>(pathRef.current);
        if (mountedRef.current && fetchIdRef.current === currentFetchId) {
          setData(result);
          cache.set(pathRef.current, { data: result, ts: Date.now() });
        }
      } catch (err) {
        if (mountedRef.current && fetchIdRef.current === currentFetchId) {
          setError(err instanceof Error ? err.message : 'Network error');
        }
      } finally {
        if (mountedRef.current && fetchIdRef.current === currentFetchId) setLoading(false);
      }
    },
    [skip],
  );

  useEffect(() => {
    mountedRef.current = true;
    if (skip) {
      setLoading(false);
      return;
    }
    const entry = cache.get(path);
    if (entry) {
      setData(entry.data as T);
      setLoading(false);
      if (Date.now() - entry.ts > staleTime) {
        void fetchData(false);
      }
    } else {
      void fetchData(true);
    }
    return () => {
      mountedRef.current = false;
    };
    // fetchData is intentionally excluded; it depends only on `skip` which is in deps.
  }, [path, skip]);

  useEffect(() => {
    function onInvalidate(e: Event) {
      const { prefix } = (e as CustomEvent<{ prefix: string }>).detail;
      if (!skip && pathRef.current.startsWith(prefix)) {
        void fetchData(false);
      }
    }
    window.addEventListener(CACHE_EVENT, onInvalidate);
    return () => window.removeEventListener(CACHE_EVENT, onInvalidate);
  }, [fetchData, skip]);

  const refresh = useCallback(async () => {
    cache.delete(pathRef.current);
    await fetchData(true);
  }, [fetchData]);

  return { data, loading, error, refresh };
}

export function getCache<T>(path: string): T | null {
  const entry = cache.get(path);
  return entry ? (entry.data as T) : null;
}

export function setCache(path: string, data: unknown): void {
  cache.set(path, { data, ts: Date.now() });
}

export function invalidateCache(path: string): void {
  cache.delete(path);
  notifyInvalidated(path);
}

export function invalidateCachePrefix(prefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
  notifyInvalidated(prefix);
}
