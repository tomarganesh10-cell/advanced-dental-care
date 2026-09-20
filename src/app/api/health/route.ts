import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/health
 *
 * Liveness and readiness in one. Checks the database, because an application
 * that responds 200 while unable to reach its database is not healthy in any
 * sense a monitor cares about — it just fails every real request instead.
 *
 * Returns no version, dependency list or error detail. A health endpoint is
 * reachable without authentication and should not describe the system to
 * whoever finds it.
 */
export async function GET(): Promise<NextResponse> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json(
      { status: "degraded" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
