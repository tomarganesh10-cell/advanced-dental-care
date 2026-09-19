import { prisma, type Prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * Audit trail.
 *
 * Every read or write of patient data, every permission change and every
 * financial action lands here. Two rules the rest of the codebase depends on:
 *
 *  1. Writing an audit row must never fail the operation being audited. A
 *     failed log is logged and swallowed — refusing to check a patient in
 *     because the audit table is full would be a worse outcome than a gap in
 *     the trail, and the gap itself gets logged.
 *  2. Never put clinical content in `before`/`after`. The trail records that a
 *     diagnosis was changed and by whom, not what the diagnosis said. Copying
 *     the note text here would create a second, less-protected copy of the
 *     record.
 */

export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "VIEW"
  | "EXPORT"
  | "LOGIN"
  | "LOGIN_FAILED"
  | "LOGOUT"
  | "PERMISSION_CHANGE"
  | "STATUS_CHANGE"
  | "PAYMENT_VERIFIED"
  | "REFUND"
  | "CONSENT_CHANGE"
  | "DOWNLOAD";

export interface AuditActor {
  userId?: string | null;
  label?: string | null;
  role?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

export interface AuditInput {
  actor: AuditActor;
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

/** Fields never written to the audit table, whatever a caller passes. */
const FORBIDDEN_KEYS = new Set([
  "password",
  "passwordHash",
  "mfaSecret",
  "codeHash",
  "tokenHash",
  "gatewaySignature",
  "privateNote",
  "diagnosis",
  "examination",
  "chiefComplaint",
  "allergies",
  "medicalConditions",
  "currentMedications",
  "notes",
  "comment",
  "documentText",
]);

/**
 * Strips forbidden keys and returns a value Prisma will accept as JSON.
 *
 * The cast is confined to this one function: `Record<string, unknown>` is
 * structurally compatible with Prisma's InputJsonValue at runtime but not at
 * the type level, and widening every caller would be worse than narrowing here.
 */
function sanitise(
  input: Record<string, unknown> | null | undefined,
): Prisma.InputJsonValue | undefined {
  if (!input) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (FORBIDDEN_KEYS.has(key)) {
      // Record that the field changed without recording its contents.
      out[key] = "[redacted]";
      continue;
    }
    out[key] = value;
  }
  return JSON.parse(JSON.stringify(out)) as Prisma.InputJsonValue;
}

export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: input.actor.userId ?? null,
        actorLabel: input.actor.label ?? null,
        actorRole: input.actor.role ?? null,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        before: sanitise(input.before) ?? undefined,
        after: sanitise(input.after) ?? undefined,
        ipAddress: input.actor.ipAddress ?? null,
        userAgent: input.actor.userAgent ?? null,
        requestId: input.actor.requestId ?? null,
        metadata: sanitise(input.metadata) ?? undefined,
      },
    });
  } catch (err) {
    logger.error(
      { err: (err as Error).message, action: input.action, entity: input.entity },
      "failed to write audit log",
    );
  }
}

/**
 * Computes the changed subset of two records, so the trail stores a diff rather
 * than two full copies of the row.
 */
export function diffRecords<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): { before: Record<string, unknown>; after: Record<string, unknown> } {
  const changedBefore: Record<string, unknown> = {};
  const changedAfter: Record<string, unknown> = {};

  for (const [key, newValue] of Object.entries(after)) {
    const oldValue = before[key];
    const same =
      oldValue instanceof Date && newValue instanceof Date
        ? oldValue.getTime() === newValue.getTime()
        : oldValue === newValue;
    if (!same) {
      changedBefore[key] = oldValue;
      changedAfter[key] = newValue;
    }
  }

  return { before: changedBefore, after: changedAfter };
}
