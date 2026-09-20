/**
 * Background worker.
 *
 * Without this process running, no WhatsApp message, email or reminder is ever
 * sent. Queue rows accumulate silently and the first symptom is patients
 * missing appointments weeks later. The admin dashboard raises a warning once
 * the backlog grows, but the honest fix is to run this under a supervisor.
 *
 *   npm run worker
 *
 * One instance is enough. The queue drain claims each row with a conditional
 * update, so a second instance would be safe but redundant.
 */

import { logger } from "@/lib/logger";
import { pruneExpiredOtps } from "@/server/auth/otp";
import { pruneExpiredSessions } from "@/server/auth/session";
import { drainNotificationQueue } from "@/server/notifications/worker";
import { getGoogleRating } from "@/server/integrations/google-places";

const QUEUE_INTERVAL_MS = 30_000;
const MAINTENANCE_INTERVAL_MS = 60 * 60 * 1000;

let running = true;
let draining = false;

async function drainOnce(): Promise<void> {
  // Guard against overlapping runs if a batch takes longer than the interval —
  // otherwise a slow provider turns into unbounded concurrency.
  if (draining) return;
  draining = true;

  try {
    const result = await drainNotificationQueue();
    if (result.attempted > 0) {
      logger.info(result, "notification queue drained");
    }
  } catch (error) {
    logger.error({ err: (error as Error).message }, "notification drain failed");
  } finally {
    draining = false;
  }
}

async function maintenance(): Promise<void> {
  try {
    const [sessions, otps] = await Promise.all([pruneExpiredSessions(), pruneExpiredOtps()]);
    if (sessions > 0 || otps > 0) {
      logger.info({ sessions, otps }, "expired records pruned");
    }

    // Refreshes the cache so the public site is not the first request to pay
    // the API latency after a TTL expiry.
    await getGoogleRating();
  } catch (error) {
    logger.error({ err: (error as Error).message }, "maintenance pass failed");
  }
}

function shutdown(signal: string): void {
  logger.info({ signal }, "worker shutting down");
  running = false;
  // Give an in-flight drain a moment to finish rather than killing it
  // mid-send, which would leave a row claimed as SENDING.
  setTimeout(() => process.exit(0), 5_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

async function main(): Promise<void> {
  logger.info(
    { queueIntervalMs: QUEUE_INTERVAL_MS, maintenanceIntervalMs: MAINTENANCE_INTERVAL_MS },
    "worker started",
  );

  await drainOnce();
  await maintenance();

  const queueTimer = setInterval(() => {
    if (running) void drainOnce();
  }, QUEUE_INTERVAL_MS);

  const maintenanceTimer = setInterval(() => {
    if (running) void maintenance();
  }, MAINTENANCE_INTERVAL_MS);

  // Keep the process alive until a signal arrives.
  await new Promise<void>((resolve) => {
    const check = setInterval(() => {
      if (!running) {
        clearInterval(queueTimer);
        clearInterval(maintenanceTimer);
        clearInterval(check);
        resolve();
      }
    }, 1_000);
  });
}

main().catch((error) => {
  logger.fatal({ err: (error as Error).message }, "worker crashed");
  process.exit(1);
});
