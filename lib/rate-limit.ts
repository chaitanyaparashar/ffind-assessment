// Simple per-IP token bucket. In-memory — resets per cold start.
// Adequate for a demo; production should use Redis/Upstash.

type Bucket = { tokens: number; lastRefill: number };

const buckets = new Map<string, Bucket>();
const CAPACITY = 10;
const REFILL_PER_MINUTE = 10;

export function rateLimit(ip: string): { ok: boolean; retryAfter?: number } {
  const now = Date.now();
  const existing = buckets.get(ip);
  if (!existing) {
    buckets.set(ip, { tokens: CAPACITY - 1, lastRefill: now });
    return { ok: true };
  }
  const elapsedMs = now - existing.lastRefill;
  const refill = (elapsedMs / 60_000) * REFILL_PER_MINUTE;
  const tokens = Math.min(CAPACITY, existing.tokens + refill);
  if (tokens < 1) {
    const retryAfter = Math.ceil(((1 - tokens) / REFILL_PER_MINUTE) * 60);
    buckets.set(ip, { tokens, lastRefill: now });
    return { ok: false, retryAfter };
  }
  buckets.set(ip, { tokens: tokens - 1, lastRefill: now });
  return { ok: true };
}
