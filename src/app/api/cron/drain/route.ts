import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { pruneExpiredOtps } from "@/server/auth/otp";
import { pruneExpiredSessions } from "@/server/auth/session";
import { drainNotificationQueue } from "@/server/notifications/worker";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/drain
 *
 * The serverless stand-in for `npm run worker`. A platform scheduler calls this
 * on a timer; it drains the notification outbox and prunes expired sessions and
 * OTP challenges — the same work the long-running worker does, minus the loop.
 *
 * Run one or the other, not both. Running both is harmless (the drain claims
 * each row with a conditional update, so a message is never sent twice) but
 * pointless.
 *
 * Auth is a shared secret rather than a session: there is no user here. Vercel
 * Cron sends `Authorization: Bearer $CRON_SECRET` automatically; any other
 * scheduler must send the same header.
 */

function authorised(request: NextRequest): boolean {
  const secret = env.CRON_SECRET;

  // No secret configured means this endpoint is not in use — refuse rather than
  // run unauthenticated, so a host that forgets the variable fails closed.
  if (!secret) return false;

  const header = request.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";

  const a = Buffer.from(presented);
  const b = Buffer.from(secret);

  // timingSafeEqual throws on a length mismatch, which would itself leak the
  // length, so compare a fixed-size digest of the inputs instead.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!authorised(request)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  try {
    const drained = await drainNotificationQueue();
    const [sessions, otps] = await Promise.all([pruneExpiredSessions(), pruneExpiredOtps()]);

    if (drained.attempted > 0 || sessions > 0 || otps > 0) {
      logger.info({ ...drained, sessions, otps }, "cron drain completed");
    }

    return NextResponse.json(
      { status: "ok", ...drained, prunedSessions: sessions, prunedOtps: otps },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logger.error({ err: (error as Error).message }, "cron drain failed");
    // A 500 is what makes the platform's cron dashboard show a failed run.
    return NextResponse.json({ status: "failed" }, { status: 500 });
  }
}
