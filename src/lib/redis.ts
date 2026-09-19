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
  });

  client.on("error", (err) => {
    // Redis being down degrades rate limiting; it must not take the site down.
    logger.error({ err: err.message }, "redis error");
  });

  return client;
}

export const redis: Redis | null = globalForRedis.__adccRedis ?? create();

if (process.env.NODE_ENV !== "production") {
  globalForRedis.__adccRedis = redis;
}

export const hasRedis = redis !== null;
