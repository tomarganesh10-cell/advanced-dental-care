import Redis from "ioredis";
import { env, features } from "./env";
import { logger } from "./logger";

/**
 * Redis connection, used for rate limiting, OTP throttling and the job queue.
 *
 * Redis is optional. Without it the app falls back to an in-process limiter,
 * which is correct for a single instance and NOT correct behind more than one —
 * see `docs/DEPLOYMENT.md`. The fallback exists so local development and CI do
 * not need Redis running, not as a production configuration.
 */

type GlobalWithRedis = typeof globalThis & { __adccRedis?: Redis | null };
const globalForRedis = globalThis as GlobalWithRedis;

function create(): Redis | null {
  if (!features.redis || !env.REDIS_URL) return null;

  const client = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 2,
    lazyConnect: false,
    retryStrategy: (times) => Math.min(times * 200, 3000),

    /**
     * Fail commands immediately while disconnected, instead of parking them.
     *
     * This is the setting that makes the fallback in `rateLimit` real. By
     * default ioredis holds commands in an offline queue until it reconnects,
     * so a command issued while Redis is down does not reject — it waits. The
     * caller's try/catch never runs, the in-memory limiter is never reached,
     * and the request hangs until something upstream times out. In practice
     * that meant a dead Redis container silently stopped the clinic taking
     * bookings: the button spun forever and no error was ever shown.
     *
     * With the offline queue off, the command rejects at once, the catch in
     * rateLimit runs, and the in-process limiter takes over — degraded, which
     * is the documented intent, rather than down.
     */
    enableOfflineQueue: false,

    /** A reachable-but-wedged server should not hold a request open either. */
    commandTimeout: 1000,
    connectTimeout: 2000,
  });

  client.on("error", (err) => {
    // Redis being down degrades rate limiting; it must not take the site down.
    // Logged at warn, not error: this is a handled, expected degradation, and
    // at error level a flapping Redis drowns the log it is meant to surface in.
    logger.warn({ err: err.message }, "redis unavailable, using in-process limiter");
  });

  return client;
}

export const redis: Redis | null = globalForRedis.__adccRedis ?? create();

if (process.env.NODE_ENV !== "production") {
  globalForRedis.__adccRedis = redis;
}

export const hasRedis = redis !== null;
