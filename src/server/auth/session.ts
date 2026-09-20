import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { env, isProduction } from "@/lib/env";
import { logger } from "@/lib/logger";
import type { Permission, StaffRoleName } from "@/lib/rbac";
import { can, effectivePermissions } from "@/lib/rbac";
import { generateToken, hashToken } from "./tokens";

/**
 * Session management.
 *
 * Opaque random tokens stored server-side, not JWTs. The trade-off is one
 * database read per request; what it buys is instant revocation — a stolen
 * staff session can be killed immediately, which a self-contained signed token
 * cannot offer without a revocation list that costs the same read anyway.
 *
 * Each user also carries a `sessionEpoch`. Bumping it invalidates every session
 * that user holds at once, which is what a password change or a "sign out
 * everywhere" action does.
 */

export const STAFF_COOKIE = "adcc_staff_session";
export const PATIENT_COOKIE = "adcc_patient_session";

export type SessionKind = "STAFF" | "PATIENT";

export interface StaffPrincipal {
  kind: "STAFF";
  userId: string;
  staffId: string;
  doctorId: string | null;
  fullName: string;
  role: StaffRoleName;
  email: string | null;
  permissions: Permission[];
  sessionId: string;
}

export interface PatientPrincipal {
  kind: "PATIENT";
  userId: string;
  patientId: string;
  fullName: string;
  patientNumber: string;
  phone: string;
  sessionId: string;
}

export type Principal = StaffPrincipal | PatientPrincipal;

function cookieName(kind: SessionKind): string {
  return kind === "STAFF" ? STAFF_COOKIE : PATIENT_COOKIE;
}

function ttlSeconds(kind: SessionKind): number {
  return kind === "STAFF" ? env.AUTH_STAFF_SESSION_TTL : env.AUTH_PATIENT_SESSION_TTL;
}

export interface CreateSessionInput {
  userId: string;
  kind: SessionKind;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** Issues a session and sets its cookie. Returns the raw token for tests. */
export async function createSession(input: CreateSessionInput): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { sessionEpoch: true },
  });
  if (!user) throw new Error("Cannot create a session for a user that does not exist");

  const token = generateToken();
  const expiresAt = new Date(Date.now() + ttlSeconds(input.kind) * 1000);

  const session = await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      userId: input.userId,
      epoch: user.sessionEpoch,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      expiresAt,
    },
    select: { id: true },
  });

  const store = await cookies();
  store.set(cookieName(input.kind), token, {
    httpOnly: true,
    // Secure in production only; localhost has no TLS and the cookie would
    // simply never be set.
    secure: isProduction,
    // "lax" still sends the cookie on top-level navigation back from Razorpay
    // and from an emailed link, while blocking cross-site POSTs.
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  logger.info({ sessionId: session.id, kind: input.kind }, "session created");
  return token;
}

interface ResolvedSession {
  sessionId: string;
  userId: string;
}

async function resolveToken(token: string): Promise<ResolvedSession | null> {
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      userId: true,
      epoch: true,
      expiresAt: true,
      revokedAt: true,
      user: { select: { isActive: true, sessionEpoch: true, deletedAt: true } },
    },
  });

  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt.getTime() <= Date.now()) return null;
  if (!session.user.isActive || session.user.deletedAt) return null;
  // Epoch mismatch means everything this user holds has been revoked.
  if (session.epoch !== session.user.sessionEpoch) return null;

  return { sessionId: session.id, userId: session.userId };
}

/** Current staff principal, or null. Never throws. */
export async function getStaffPrincipal(): Promise<StaffPrincipal | null> {
  const store = await cookies();
  const token = store.get(STAFF_COOKIE)?.value;
  if (!token) return null;

  const resolved = await resolveToken(token);
  if (!resolved) return null;

  const staff = await prisma.staff.findUnique({
    where: { userId: resolved.userId },
    select: {
      id: true,
      fullName: true,
      role: true,
      email: true,
      isActive: true,
      deletedAt: true,
      doctor: { select: { id: true } },
      permissionGrants: {
        select: { permission: true, allow: true, expiresAt: true },
      },
    },
  });

  if (!staff || !staff.isActive || staff.deletedAt) return null;

  const role = staff.role as StaffRoleName;

  return {
    kind: "STAFF",
    userId: resolved.userId,
    staffId: staff.id,
    doctorId: staff.doctor?.id ?? null,
    fullName: staff.fullName,
    role,
    email: staff.email,
    permissions: effectivePermissions({ role, grants: staff.permissionGrants }),
    sessionId: resolved.sessionId,
  };
}

/** Current patient principal, or null. Never throws. */
export async function getPatientPrincipal(): Promise<PatientPrincipal | null> {
  const store = await cookies();
  const token = store.get(PATIENT_COOKIE)?.value;
  if (!token) return null;

  const resolved = await resolveToken(token);
  if (!resolved) return null;

  const patient = await prisma.patient.findUnique({
    where: { userId: resolved.userId },
    select: {
      id: true,
      fullName: true,
      patientNumber: true,
      phone: true,
      deletedAt: true,
    },
  });

  if (!patient || patient.deletedAt) return null;

  return {
    kind: "PATIENT",
    userId: resolved.userId,
    patientId: patient.id,
    fullName: patient.fullName,
    patientNumber: patient.patientNumber,
    phone: patient.phone,
    sessionId: resolved.sessionId,
  };
}

export async function destroySession(kind: SessionKind): Promise<void> {
  const store = await cookies();
  const token = store.get(cookieName(kind))?.value;

  if (token) {
    await prisma.session
      .updateMany({ where: { tokenHash: hashToken(token) }, data: { revokedAt: new Date() } })
      .catch((err: unknown) =>
        logger.warn({ err: (err as Error).message }, "failed to revoke session"),
      );
  }

  store.delete(cookieName(kind));
}

/** Revokes every session a user holds, by bumping their epoch. */
export async function revokeAllSessions(userId: string): Promise<void> {
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { sessionEpoch: { increment: 1 } } }),
    prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
}

/** Removes expired rows. Called by the maintenance job. */
export async function pruneExpiredSessions(): Promise<number> {
  const result = await prisma.session.deleteMany({
    where: { expiresAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
  });
  return result.count;
}

export function staffCan(principal: StaffPrincipal, permission: Permission): boolean {
  return can({ role: principal.role }, permission) || principal.permissions.includes(permission);
}
