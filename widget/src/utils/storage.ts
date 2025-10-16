// LocalStorage helpers with TTL

export type TTLItem<T> = T & { ts: number; ttlDays: number };

export function saveWithTTL<T>(key: string, value: T, ttlDays = 14) {
  const payload: TTLItem<T> = { ...(value as any), ts: Date.now(), ttlDays };
  localStorage.setItem(key, JSON.stringify(payload));
}

export function loadWithTTL<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const obj = JSON.parse(raw) as TTLItem<T>;
    const ageMs = Date.now() - (obj.ts || 0);
    const maxMs = (obj.ttlDays ?? 14) * 24 * 3600 * 1000;
    if (ageMs > maxMs) return null;
    const { ts, ttlDays, ...rest } = obj as any;
    return rest as T;
  } catch {
    return null;
  }
}
