import { z } from "zod";

/**
 * Indian mobile number handling, with international numbers accepted for
 * dental-tourism enquiries.
 *
 * Normalising to E.164 at the edge matters more here than it looks: the same
 * patient typing "98551 23236", "+919855123236" and "098551 23236" must
 * resolve to one record, or the clinic ends up with three charts for one person
 * and an OTP rate limiter that never triggers.
 */

export function normalisePhone(input: string, defaultCountry: "IN" | "INTL" = "IN"): string | null {
  const cleaned = input.replace(/[\s\-()./]/g, "").trim();
  if (!cleaned) return null;

  if (cleaned.startsWith("+")) {
    const digits = cleaned.slice(1).replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) return null;
    return `+${digits}`;
  }

  const digits = cleaned.replace(/\D/g, "");

  if (defaultCountry === "IN") {
    // 10-digit mobile
    if (/^[6-9]\d{9}$/.test(digits)) return `+91${digits}`;
    // 0-prefixed STD form
    if (/^0[6-9]\d{9}$/.test(digits)) return `+91${digits.slice(1)}`;
    // Already country-coded without the plus
    if (/^91[6-9]\d{9}$/.test(digits)) return `+${digits}`;
  }

  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}

export function isIndianMobile(e164: string): boolean {
  return /^\+91[6-9]\d{9}$/.test(e164);
}

/** Display form: +91 98551 23236 */
export function formatPhone(e164: string): string {
  if (isIndianMobile(e164)) {
    const n = e164.slice(3);
    return `+91 ${n.slice(0, 5)} ${n.slice(5)}`;
  }
  return e164;
}

/** wa.me link target — digits only, no plus. */
export function whatsappNumber(e164: string): string {
  return e164.replace(/\D/g, "");
}

export const phoneSchema = z
  .string()
  .min(6, "Enter your mobile number.")
  .max(24, "That number is too long.")
  .transform((v, ctx) => {
    const normalised = normalisePhone(v);
    if (!normalised) {
      ctx.addIssue({ code: "custom", message: "Enter a valid mobile number." });
      return z.NEVER;
    }
    return normalised;
  });

export const indianPhoneSchema = z
  .string()
  .transform((v, ctx) => {
    const normalised = normalisePhone(v);
    if (!normalised || !isIndianMobile(normalised)) {
      ctx.addIssue({ code: "custom", message: "Enter a valid 10-digit Indian mobile number." });
      return z.NEVER;
    }
    return normalised;
  });
