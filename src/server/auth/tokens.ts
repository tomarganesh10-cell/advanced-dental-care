import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/**
 * Token and OTP primitives.
 *
 * Session tokens and one-time codes are stored hashed. A database dump then
 * contains no usable credential — the same reasoning as password hashing,
 * applied to the things that let you skip the password.
 */

/** 32 bytes of CSPRNG entropy, base64url. */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** SHA-256 is correct here: the input is already high-entropy, unlike a password. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Constant-time comparison of two hex digests. */
export function tokensMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Numeric OTP.
 *
 * `randomInt` is used rather than Math.random — a predictable OTP is a login
 * bypass. Six digits is the usable ceiling for something read off a phone; the
 * brute-force protection comes from attempt limits and expiry, not length.
 */
export function generateOtp(digits = 6): string {
  const max = 10 ** digits;
  return randomInt(0, max).toString().padStart(digits, "0");
}

export function hashOtp(code: string, destination: string): string {
  // Binding the hash to the destination stops a code issued for one number
  // being replayed against another.
  return createHash("sha256").update(`${destination}:${code}`).digest("hex");
}

/** Short, human-quotable reference, e.g. ADC-A-8F2K3M. Excludes lookalikes. */
const REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateReference(prefix: string, length = 6): string {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += REFERENCE_ALPHABET[randomInt(0, REFERENCE_ALPHABET.length)];
  }
  return `${prefix}-${out}`;
}
