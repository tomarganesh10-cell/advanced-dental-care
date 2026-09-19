import { prisma } from "@/lib/db";
import { env, isProduction } from "@/lib/env";
import { RateLimitError, ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import type { OtpPurpose } from "@/lib/db";
import { generateOtp, hashOtp } from "./tokens";

/**
 * One-time password issue and verification.
 *
 * Abuse controls, and why each exists:
 *  - per-destination hourly cap: stops a number being used to pump SMS/WhatsApp
 *    cost, which is a real financial attack on a clinic with a metered provider
 *  - per-IP hourly cap: stops one client enumerating many numbers
 *  - resend cooldown: stops a stuck client hammering the send endpoint
 *  - attempt counter on the challenge: 6 digits is only 10^6, so the guess
 *    limit is what makes it safe, not the code length
 *  - single-use consumption: a verified code cannot be replayed
 */

export interface IssueOtpInput {
  destination: string;
  purpose: OtpPurpose;
  ipAddress?: string | null;
  payload?: Record<string, unknown>;
}

export interface IssuedOtp {
  challengeId: string;
  expiresAt: Date;
  /**
   * The plaintext code, for the notification dispatcher to send.
   *
   * SERVER-ONLY. This must never be placed in an HTTP response body. The one
   * exception is `devCode` below, which is gated on OTP_DEV_ECHO and cannot be
   * enabled in production (see src/lib/env.ts).
   */
  code: string;
  /** Mirrors `code`, but only when OTP_DEV_ECHO is on outside production. */
  devCode?: string;
}

export async function issueOtp(input: IssueOtpInput): Promise<IssuedOtp> {
  const destination = input.destination.trim();

  const perDestination = await rateLimit(
    `otp:dest:${destination}`,
    env.RATE_LIMIT_OTP_PER_HOUR,
    3600,
  );
  if (!perDestination.allowed) {
    throw new RateLimitError(
      perDestination.retryAfterSeconds,
      "Too many codes requested for this number. Please try again later, or call the clinic.",
    );
  }

  if (input.ipAddress) {
    const perIp = await rateLimit(`otp:ip:${input.ipAddress}`, env.RATE_LIMIT_OTP_PER_HOUR * 3, 3600);
    if (!perIp.allowed) {
      throw new RateLimitError(perIp.retryAfterSeconds, "Too many requests. Please try again later.");
    }
  }

  const cooldown = await rateLimit(
    `otp:cooldown:${destination}`,
    1,
    env.OTP_RESEND_COOLDOWN_SECONDS,
  );
  if (!cooldown.allowed) {
    throw new RateLimitError(
      cooldown.retryAfterSeconds,
      `Please wait ${cooldown.retryAfterSeconds}s before requesting another code.`,
    );
  }

  // Any outstanding challenge for this destination/purpose is retired, so only
  // the newest code can be used.
  await prisma.otpChallenge.updateMany({
    where: { destination, purpose: input.purpose, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  const code = generateOtp(6);
  const expiresAt = new Date(Date.now() + env.OTP_TTL_SECONDS * 1000);

  const challenge = await prisma.otpChallenge.create({
    data: {
      purpose: input.purpose,
      destination,
      codeHash: hashOtp(code, destination),
      maxAttempts: env.OTP_MAX_ATTEMPTS,
      expiresAt,
      ipAddress: input.ipAddress ?? null,
      payload: input.payload ? (input.payload as never) : undefined,
    },
    select: { id: true },
  });

  const result: IssuedOtp = { challengeId: challenge.id, expiresAt, code };

  if (env.OTP_DEV_ECHO && !isProduction) {
    // Development affordance so the flow can be exercised without a live
    // WhatsApp/SMS provider. `env.ts` refuses to boot production with this on.
    logger.warn({ destination, code, purpose: input.purpose }, "DEV OTP issued");
    result.devCode = code;
  }

  return result;
}

export interface VerifyOtpResult {
  challengeId: string;
  destination: string;
  purpose: OtpPurpose;
  payload: Record<string, unknown> | null;
}

/**
 * Verifies and consumes a code.
 *
 * Consumption happens in the same transaction as the check, so two concurrent
 * requests with the same code cannot both succeed.
 */
export async function verifyOtp(
  destination: string,
  code: string,
  purpose: OtpPurpose,
): Promise<VerifyOtpResult> {
  const trimmedDestination = destination.trim();
  const trimmedCode = code.trim();

  if (!/^\d{4,8}$/.test(trimmedCode)) {
    throw new ValidationError("Enter the 6-digit code from your message.");
  }

  return prisma.$transaction(async (tx) => {
    const challenge = await tx.otpChallenge.findFirst({
      where: { destination: trimmedDestination, purpose, consumedAt: null },
      orderBy: { createdAt: "desc" },
    });

    if (!challenge) {
      throw new ValidationError("That code is no longer valid. Please request a new one.");
    }

    if (challenge.expiresAt.getTime() <= Date.now()) {
      await tx.otpChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: new Date() },
      });
      throw new ValidationError("That code has expired. Please request a new one.");
    }

    if (challenge.attempts >= challenge.maxAttempts) {
      await tx.otpChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: new Date() },
      });
      throw new ValidationError("Too many incorrect attempts. Please request a new code.");
    }

    const expected = hashOtp(trimmedCode, trimmedDestination);

    if (expected !== challenge.codeHash) {
      const updated = await tx.otpChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
        select: { attempts: true, maxAttempts: true },
      });
      const remaining = Math.max(0, updated.maxAttempts - updated.attempts);
      throw new ValidationError(
        remaining > 0
          ? `That code is not correct. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`
          : "That code is not correct. Please request a new code.",
      );
    }

    await tx.otpChallenge.update({
      where: { id: challenge.id },
      data: { consumedAt: new Date() },
    });

    return {
      challengeId: challenge.id,
      destination: challenge.destination,
      purpose: challenge.purpose,
      payload: (challenge.payload as Record<string, unknown> | null) ?? null,
    };
  });
}

/** Maintenance: drop challenges that expired more than a day ago. */
export async function pruneExpiredOtps(): Promise<number> {
  const result = await prisma.otpChallenge.deleteMany({
    where: { expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  });
  return result.count;
}
