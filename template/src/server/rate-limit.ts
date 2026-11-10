export interface RateLimiter {
  check(key: string, now: number): { ok: true } | { ok: false; retryAfterSeconds: number }
}

export function createRateLimiter(limit: number, windowMs: number, maxKeys = 2000): RateLimiter {
  const hits = new Map<string, number[]>()

  return {
    check(key, now) {
      const recent = (hits.get(key) ?? []).filter((stamp) => now - stamp < windowMs)
      if (recent.length >= limit) {
        hits.set(key, recent)
        const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - (now - recent[0])) / 1000))
        return { ok: false, retryAfterSeconds }
      }
      recent.push(now)
      hits.set(key, recent)
      if (hits.size > maxKeys) {
        const oldest = hits.keys().next().value
        if (oldest) hits.delete(oldest)
      }
      return { ok: true }
    },
  }
}
