import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { __clearMemoryBuckets } from "@/lib/rate-limit";
import { issueOtp, pruneExpiredOtps, verifyOtp } from "@/server/auth/otp";

/**
 * One-time passwords.
 *
 * Six digits is only 10^6, so the security comes entirely from the attempt
 * limit, the expiry and single use — not from the code itself. These tests
 * pin all three.
 */
describe("OTP", () => {
  beforeEach(() => {
    __clearMemoryBuckets();
  });

  it("issues a code and verifies it", async () => {
    const issued = await issueOtp({ destination: "+919800000001", purpose: "PATIENT_LOGIN" });

    expect(issued.code).toMatch(/^\d{6}$/);

    const result = await verifyOtp("+919800000001", issued.code, "PATIENT_LOGIN");
    expect(result.destination).toBe("+919800000001");
  });

  it("stores the code hashed, never in plaintext", async () => {
    const issued = await issueOtp({ destination: "+919800000002", purpose: "PATIENT_LOGIN" });

    const challenge = await prisma.otpChallenge.findFirst({
      where: { destination: "+919800000002" },
    });

    expect(challenge?.codeHash).toBeTruthy();
    expect(challenge?.codeHash).not.toBe(issued.code);
    expect(challenge?.codeHash).not.toContain(issued.code);
  });

  it("consumes the code so it cannot be replayed", async () => {
    const issued = await issueOtp({ destination: "+919800000003", purpose: "PATIENT_LOGIN" });

    await verifyOtp("+919800000003", issued.code, "PATIENT_LOGIN");

    await expect(verifyOtp("+919800000003", issued.code, "PATIENT_LOGIN")).rejects.toThrow(
      /no longer valid/i,
    );
  });

  it("rejects a wrong code and counts the attempt", async () => {
    await issueOtp({ destination: "+919800000004", purpose: "PATIENT_LOGIN" });

    await expect(verifyOtp("+919800000004", "000000", "PATIENT_LOGIN")).rejects.toThrow(
      /not correct/i,
    );

    const challenge = await prisma.otpChallenge.findFirst({
      where: { destination: "+919800000004" },
    });
    expect(challenge?.attempts).toBe(1);
  });

  it("locks the challenge after too many wrong attempts", async () => {
    const issued = await issueOtp({ destination: "+919800000005", purpose: "PATIENT_LOGIN" });
    const wrong = issued.code === "111111" ? "222222" : "111111";

    for (let i = 0; i < 5; i += 1) {
      await expect(verifyOtp("+919800000005", wrong, "PATIENT_LOGIN")).rejects.toThrow();
    }

    // Even the CORRECT code is refused once the attempts are exhausted. This is
    // the property that makes a six-digit code safe.
    await expect(verifyOtp("+919800000005", issued.code, "PATIENT_LOGIN")).rejects.toThrow();
  });

  it("rejects an expired code", async () => {
    const issued = await issueOtp({ destination: "+919800000006", purpose: "PATIENT_LOGIN" });

    await prisma.otpChallenge.updateMany({
      where: { destination: "+919800000006" },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await expect(verifyOtp("+919800000006", issued.code, "PATIENT_LOGIN")).rejects.toThrow(
      /expired/i,
    );
  });

  /**
   * The hash is bound to the destination, so a code issued for one number is
   * useless against another even if an attacker observes it.
   */
  it("refuses a code issued for a different number", async () => {
    const issued = await issueOtp({ destination: "+919800000007", purpose: "PATIENT_LOGIN" });
    await issueOtp({ destination: "+919800000008", purpose: "PATIENT_LOGIN" });

    await expect(verifyOtp("+919800000008", issued.code, "PATIENT_LOGIN")).rejects.toThrow(
      /not correct/i,
    );
  });

  it("refuses a code issued for a different purpose", async () => {
    const issued = await issueOtp({
      destination: "+919800000009",
      purpose: "BOOKING_VERIFICATION",
    });

    await expect(verifyOtp("+919800000009", issued.code, "PATIENT_LOGIN")).rejects.toThrow(
      /no longer valid/i,
    );
  });

  it("retires an earlier code when a new one is issued", async () => {
    const first = await issueOtp({ destination: "+919800000010", purpose: "PATIENT_LOGIN" });

    // The cooldown limiter is per-destination; clear it to simulate the resend
    // arriving after the cooldown rather than testing the limiter here.
    __clearMemoryBuckets();

    const second = await issueOtp({ destination: "+919800000010", purpose: "PATIENT_LOGIN" });

    await expect(verifyOtp("+919800000010", first.code, "PATIENT_LOGIN")).rejects.toThrow();

    const result = await verifyOtp("+919800000010", second.code, "PATIENT_LOGIN");
    expect(result.destination).toBe("+919800000010");
  });

  it("enforces a resend cooldown", async () => {
    await issueOtp({ destination: "+919800000011", purpose: "PATIENT_LOGIN" });

    await expect(
      issueOtp({ destination: "+919800000011", purpose: "PATIENT_LOGIN" }),
    ).rejects.toThrow(/wait/i);
  });

  it("carries a payload through verification", async () => {
    const issued = await issueOtp({
      destination: "+919800000012",
      purpose: "BOOKING_VERIFICATION",
      payload: { serviceSlug: "dental-implants", doctorId: "abc" },
    });

    const result = await verifyOtp("+919800000012", issued.code, "BOOKING_VERIFICATION");

    expect(result.payload).toMatchObject({ serviceSlug: "dental-implants", doctorId: "abc" });
  });

  it("rejects a malformed code without touching the database", async () => {
    await issueOtp({ destination: "+919800000013", purpose: "PATIENT_LOGIN" });

    await expect(verifyOtp("+919800000013", "abc", "PATIENT_LOGIN")).rejects.toThrow(/6-digit/i);

    const challenge = await prisma.otpChallenge.findFirst({
      where: { destination: "+919800000013" },
    });
    expect(challenge?.attempts).toBe(0);
  });

  it("prunes challenges that expired long ago", async () => {
    await issueOtp({ destination: "+919800000014", purpose: "PATIENT_LOGIN" });

    await prisma.otpChallenge.updateMany({
      where: { destination: "+919800000014" },
      data: { expiresAt: new Date(Date.now() - 48 * 60 * 60 * 1000) },
    });

    expect(await pruneExpiredOtps()).toBe(1);
  });
});
