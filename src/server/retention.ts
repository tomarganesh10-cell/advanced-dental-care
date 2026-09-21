import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * Data retention.
 *
 * Two tables in this schema grow with *traffic* rather than with clinical
 * activity, and nothing was deleting either of them. Patient and appointment
 * rows are small and bounded by how many people the clinic actually treats —
 * measured, about 500 bytes per appointment, so a busy single-site practice
 * takes decades to reach half a gigabyte. Analytics events are not bounded by
 * anything: they grow with every page view, which is exactly the number a
 * clinic hopes will keep rising.
 *
 * The two tables are treated very differently on purpose.
 *
 * `analytics_events` is marketing telemetry. Nothing depends on a two-year-old
 * page view, so it is pruned by default, with thirteen months kept so a
 * year-on-year comparison still works.
 *
 * `audit_logs` record who opened which patient record. That is an
 * accountability trail, and quietly deleting it by default would be the wrong
 * default for a medical practice — the point of the trail is that it outlives
 * the person who might want it gone. So it is pruned ONLY when the clinic sets
 * an explicit retention period, and the choice of period belongs to whoever
 * advises the practice on record-keeping obligations, not to this file.
 */

/** Thirteen months: long enough for a year-on-year comparison, short enough to bound growth. */
const DEFAULT_ANALYTICS_RETENTION_DAYS = 400;

/** Deleted in chunks so a first run on a large table does not hold one long transaction. */
const DELETE_BATCH = 5_000;

function cutoff(days: number, asOf: Date): Date {
  return new Date(asOf.getTime() - days * 24 * 60 * 60 * 1000);
}

async function deleteInBatches(
  deleteBatch: (before: Date, take: number) => Promise<number>,
  before: Date,
): Promise<number> {
  let total = 0;

  // Bounded rather than while(true): if something keeps re-creating rows older
  // than the cutoff, this should stop and say so, not spin.
  for (let pass = 0; pass < 200; pass += 1) {
    const deleted = await deleteBatch(before, DELETE_BATCH);
    total += deleted;
    if (deleted < DELETE_BATCH) return total;
  }

  logger.warn({ total }, "retention: stopped at the batch limit, will continue next run");
  return total;
}

export async function pruneAnalyticsEvents(
  retentionDays = DEFAULT_ANALYTICS_RETENTION_DAYS,
  asOf = new Date(),
): Promise<number> {
  if (retentionDays <= 0) return 0;

  const before = cutoff(retentionDays, asOf);

  return deleteInBatches(async (cut, take) => {
    const rows = await prisma.analyticsEvent.findMany({
      where: { createdAt: { lt: cut } },
      select: { id: true },
      take,
    });

    if (rows.length === 0) return 0;

    const result = await prisma.analyticsEvent.deleteMany({
      where: { id: { in: rows.map((row) => row.id) } },
    });

    return result.count;
  }, before);
}

/**
 * Prunes the audit trail.
 *
 * Disabled unless `AUDIT_LOG_RETENTION_DAYS` is set to a positive number. See
 * the note at the top of this file: an audit trail that deletes itself on a
 * default nobody chose is not an audit trail.
 */
export async function pruneAuditLogs(
  retentionDays: number | undefined,
  asOf = new Date(),
): Promise<number> {
  if (!retentionDays || retentionDays <= 0) return 0;

  const before = cutoff(retentionDays, asOf);

  return deleteInBatches(async (cut, take) => {
    const rows = await prisma.auditLog.findMany({
      where: { createdAt: { lt: cut } },
      select: { id: true },
      take,
    });

    if (rows.length === 0) return 0;

    const result = await prisma.auditLog.deleteMany({
      where: { id: { in: rows.map((row) => row.id) } },
    });

    return result.count;
  }, before);
}

export interface RetentionResult {
  analyticsEvents: number;
  auditLogs: number;
}

export async function runRetention(options: {
  analyticsRetentionDays?: number;
  auditRetentionDays?: number;
} = {}): Promise<RetentionResult> {
  const analyticsEvents = await pruneAnalyticsEvents(
    options.analyticsRetentionDays ?? DEFAULT_ANALYTICS_RETENTION_DAYS,
  );
  const auditLogs = await pruneAuditLogs(options.auditRetentionDays);

  if (analyticsEvents > 0 || auditLogs > 0) {
    logger.info({ analyticsEvents, auditLogs }, "retention pass completed");
  }

  return { analyticsEvents, auditLogs };
}
