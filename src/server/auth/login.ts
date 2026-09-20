import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { RateLimitError, UnauthorizedError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { rateLimit, resetRateLimit } from "@/lib/rate-limit";
import { recordAudit } from "@/server/audit";
import { verifyPassword } from "./password";
import { createSession } from "./session";

/**
 * Staff login.
 *
 * Three protections, each against a different attack:
 *  - per-IP limit: slows credential stuffing across many accounts
 *  - per-account limit and lockout: slows a targeted attack on one account
 *  - uniform failure message and a dummy hash comparison: an attacker cannot
 *    tell "no such user" from "wrong password" by the response or by timing,
 *    so the login form is not an account enumerator
 */

/**
 * A real Argon2id hash of a random string, compared against when the account
 * does not exist. Without this, a missing account returns in ~1ms and a real one
 * in ~50ms, which is a perfectly usable oracle.
 */
const DUMMY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$K3VQnKz9mK1lDCyQO8rBMDqvcWcVPz3s0fAMWXgz7xI";

const LOCKOUT_THRESHOLD = 8;
const LOCKOUT_MINUTES = 15;

export interface StaffLoginInput {
  email: string;
  password: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface StaffLoginResult {
  userId: string;
  staffId: string;
  fullName: string;
  role: string;
  /** True when the account has MFA enrolled and a second factor is required. */
  requiresMfa: boolean;
}

export async function loginStaff(input: StaffLoginInput): Promise<StaffLoginResult> {
  const email = input.email.trim().toLowerCase();

  if (input.ipAddress) {
    const ipLimit = await rateLimit(
      `login:ip:${input.ipAddress}`,
      env.RATE_LIMIT_LOGIN_PER_15MIN,
      900,
    );
    if (!ipLimit.allowed) {
      throw new RateLimitError(
        ipLimit.retryAfterSeconds,
        "Too many sign-in attempts. Please wait and try again.",
      );
    }
  }

  const accountLimit = await rateLimit(`login:account:${email}`, LOCKOUT_THRESHOLD, 900);
  if (!accountLimit.allowed) {
    throw new RateLimitError(
      accountLimit.retryAfterSeconds,
      "This account is temporarily locked after too many failed attempts. Try again shortly or ask an administrator to reset it.",
    );
  }

  const user = await prisma.user.findFirst({
    where: { email, type: "STAFF", deletedAt: null },
    select: {
      id: true,
      passwordHash: true,
      isActive: true,
      lockedUntil: true,
      failedLoginCount: true,
      mfaEnabledAt: true,
      staff: { select: { id: true, fullName: true, role: true, isActive: true, deletedAt: true } },
    },
  });

  // Always do the hash comparison, even with no user, so the timing is flat.
  const hash = user?.passwordHash ?? DUMMY_HASH;
  const passwordOk = await verifyPassword(hash, input.password);

  const genericFailure = new UnauthorizedError("That email or password is not correct.");

  if (!user || !user.staff) {
    await recordAudit({
      actor: { label: email, ipAddress: input.ipAddress, userAgent: input.userAgent },
      action: "LOGIN_FAILED",
      entity: "User",
      metadata: { reason: "no_such_account" },
    });
    throw genericFailure;
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    throw new RateLimitError(
      Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000),
      "This account is locked. Please try again later or ask an administrator.",
    );
  }

  if (!passwordOk) {
    const failures = user.failedLoginCount + 1;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: failures,
        // A lockout that never expires needs a human to clear it, which in a
        // small clinic means the one admin who is on leave. Time-boxed instead.
        lockedUntil:
          failures >= LOCKOUT_THRESHOLD ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) : null,
      },
    });

    await recordAudit({
      actor: {
        userId: user.id,
        label: email,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      },
      action: "LOGIN_FAILED",
      entity: "User",
      entityId: user.id,
      metadata: { attempt: failures },
    });

    throw genericFailure;
  }

  // Deactivated accounts fail with the same message as a wrong password, so a
  // former employee cannot confirm their account still exists.
  if (!user.isActive || !user.staff.isActive || user.staff.deletedAt) {
    await recordAudit({
      actor: { userId: user.id, label: email, ipAddress: input.ipAddress },
      action: "LOGIN_FAILED",
      entity: "User",
      entityId: user.id,
      metadata: { reason: "inactive" },
    });
    throw genericFailure;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      lastLoginIp: input.ipAddress ?? null,
    },
  });

  await resetRateLimit(`login:account:${email}`);

  const requiresMfa = Boolean(user.mfaEnabledAt) || env.AUTH_REQUIRE_STAFF_MFA;

  // MFA is enrolled per-account; the session is only issued once the second
  // factor passes. Until the TOTP step ships, an account with MFA enrolled
  // cannot complete login rather than silently bypassing it.
  if (!requiresMfa) {
    await createSession({
      userId: user.id,
      kind: "STAFF",
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
  }

  await recordAudit({
    actor: {
      userId: user.id,
      label: user.staff.fullName,
      role: user.staff.role,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    },
    action: "LOGIN",
    entity: "User",
    entityId: user.id,
  });

  logger.info({ userId: user.id, role: user.staff.role }, "staff signed in");

  return {
    userId: user.id,
    staffId: user.staff.id,
    fullName: user.staff.fullName,
    role: user.staff.role,
    requiresMfa,
  };
}

/**
 * Patient login is OTP-only by design.
 *
 * Patients do not choose passwords for a portal they use three times a year;
 * they reuse one, forget it, and the reset flow becomes the weakest link. The
 * mobile number is already verified at booking and is already how the clinic
 * contacts them.
 */
export async function completePatientLogin(input: {
  phone: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<{ userId: string; patientId: string } | null> {
  const patient = await prisma.patient.findFirst({
    where: { phone: input.phone, deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, fullName: true, userId: true },
  });

  if (!patient) return null;

  let userId = patient.userId;

  // A patient created by reception has no login until they first use the
  // portal; the account is created on that first verified login.
  if (!userId) {
    const user = await prisma.user.create({
      data: {
        type: "PATIENT",
        phone: input.phone,
        phoneVerifiedAt: new Date(),
        lastLoginAt: new Date(),
        lastLoginIp: input.ipAddress ?? null,
      },
      select: { id: true },
    });

    await prisma.patient.update({ where: { id: patient.id }, data: { userId: user.id } });
    userId = user.id;
  } else {
    await prisma.user.update({
      where: { id: userId },
      data: {
        phoneVerifiedAt: new Date(),
        lastLoginAt: new Date(),
        lastLoginIp: input.ipAddress ?? null,
      },
    });
  }

  await createSession({
    userId,
    kind: "PATIENT",
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });

  await recordAudit({
    actor: { userId, label: patient.fullName, role: "PATIENT", ipAddress: input.ipAddress },
    action: "LOGIN",
    entity: "Patient",
    entityId: patient.id,
  });

  return { userId, patientId: patient.id };
}
