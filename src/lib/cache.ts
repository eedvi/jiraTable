// Tiny stale-while-revalidate cache backed by localStorage.
// Past weeks are immutable, so we paint the cached copy instantly and
// revalidate against Jira in the background. No TTL: every mount revalidates,
// so the cache is just a paint accelerator + offline fallback.
// ponytail: localStorage only. If cross-device history matters, move to the server.

const PREFIX = 'jt-cache:'

export function readCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function writeCache<T>(key: string, data: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(data))
  } catch {
    // quota exceeded / disabled storage — cache is best-effort, ignore
  }
}
