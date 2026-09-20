import { redis } from "./redis";
import { logger } from "./logger";

/**
 * Fixed-window rate limiter.
 *
 * Backed by Redis when available; otherwise an in-process Map, which is correct
 * only for a single instance. The distinction matters for the endpoints this
 * protects — OTP send, login and booking are exactly the endpoints an attacker
 * probes, and a limiter that resets per-instance is a limiter you can walk
 * around by reconnecting.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  /** Unix ms when the current window resets. */
  resetAt: number;
  retryAfterSeconds: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const memoryBuckets = new Map<string, Bucket>();

/** Bounded cleanup so a long-running process does not accumulate dead keys. */
function sweepMemory(now: number): void {
  if (memoryBuckets.size < 5000) return;
  for (const [key, bucket] of memoryBuckets) {
    if (bucket.resetAt <= now) memoryBuckets.delete(key);
  }
}

export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const namespaced = `rl:${key}`;

  if (redis) {
    try {
      const results = await redis.multi().incr(namespaced).ttl(namespaced).exec();

      const count = Number(results?.[0]?.[1] ?? 0);
      let ttl = Number(results?.[1]?.[1] ?? -1);

      if (ttl < 0) {
        await redis.expire(namespaced, windowSeconds);
        ttl = windowSeconds;
      }

      const resetAt = now + ttl * 1000;
      return {
        allowed: count <= limit,
        remaining: Math.max(0, limit - count),
        limit,
        resetAt,
        retryAfterSeconds: count <= limit ? 0 : ttl,
      };
    } catch (err) {
      // Fall through to the in-memory limiter rather than failing the request.
      logger.warn(
        { err: (err as Error).message, key },
        "rate limit: redis unavailable, using memory",
      );
    }
  }

  sweepMemory(now);
  const existing = memoryBuckets.get(namespaced);

  if (!existing || existing.resetAt <= now) {
    const bucket: Bucket = { count: 1, resetAt: now + windowMs };
    memoryBuckets.set(namespaced, bucket);
    return {
      allowed: true,
      remaining: limit - 1,
      limit,
      resetAt: bucket.resetAt,
      retryAfterSeconds: 0,
    };
  }

  existing.count += 1;
  const allowed = existing.count <= limit;
  return {
    allowed,
    remaining: Math.max(0, limit - existing.count),
    limit,
    resetAt: existing.resetAt,
    retryAfterSeconds: allowed ? 0 : Math.ceil((existing.resetAt - now) / 1000),
  };
}

/** Clears a limiter, e.g. after a successful login. */
export async function resetRateLimit(key: string): Promise<void> {
  const namespaced = `rl:${key}`;
  if (redis) {
    try {
      await redis.del(namespaced);
      return;
    } catch {
      // fall through
    }
  }
  memoryBuckets.delete(namespaced);
}

/** Test-only helper. */
export function __clearMemoryBuckets(): void {
  memoryBuckets.clear();
}

/**
 * Derives a client identifier for rate limiting.
 *
 * Trusts `x-forwarded-for` only because the app is expected to sit behind a
 * reverse proxy that sets it (see docs/DEPLOYMENT.md). Exposed directly to the
 * internet, this header is client-controlled and the limiter becomes bypassable.
 */
export function clientKeyFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip") ?? "unknown";
}
