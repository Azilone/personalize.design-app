type CacheValue<T> = {
  value: T;
  expiresAt: number;
};

const cache = new Map<string, CacheValue<unknown> | Promise<unknown>>();

const isCacheValue = (entry: unknown): entry is CacheValue<unknown> => {
  return (
    typeof entry === "object" &&
    entry !== null &&
    "expiresAt" in entry &&
    "value" in entry
  );
};

export const getCachedValue = <T>(key: string): T | null => {
  const entry = cache.get(key);

  if (!entry || entry instanceof Promise) {
    return null;
  }

  if (!isCacheValue(entry) || entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }

  return entry.value as T;
};

export const setCachedValue = <T>(
  key: string,
  value: T,
  ttlMs: number,
): T => {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
};

export const getOrSetCachedValue = async <T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<T> => {
  const cached = getCachedValue<T>(key);
  if (cached !== null) {
    return cached;
  }

  const entry = cache.get(key);
  if (entry instanceof Promise) {
    return entry as Promise<T>;
  }

  const promise = fetcher()
    .then((value) => setCachedValue(key, value, ttlMs))
    .catch((error) => {
      cache.delete(key);
      throw error;
    });

  cache.set(key, promise);
  return promise;
};

export const clearCachedValues = (): void => {
  cache.clear();
};
