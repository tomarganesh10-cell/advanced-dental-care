import { hash, verify } from "@node-rs/argon2";

/**
 * Password hashing.
 *
 * Argon2id with parameters at the OWASP-recommended floor (19 MiB, t=2, p=1).
 * These are deliberately expensive: the whole point is that an attacker holding
 * a dump of this table cannot test candidate passwords quickly.
 */
const ARGON2_OPTIONS = {
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON2_OPTIONS);
}

export async function verifyPassword(hashed: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashed, plain, ARGON2_OPTIONS);
  } catch {
    // A malformed stored hash must read as "wrong password", not as a crash
    // that distinguishes this account from any other.
    return false;
  }
}

export interface PasswordPolicyResult {
  ok: boolean;
  problems: string[];
}

/**
 * Password policy for staff accounts.
 *
 * Length is weighted over composition rules, which is where the evidence
 * points — forced symbol rules mostly produce `Password1!`.
 */
export function checkPasswordPolicy(password: string, context: string[] = []): PasswordPolicyResult {
  const problems: string[] = [];

  if (password.length < 12) problems.push("Use at least 12 characters.");
  if (password.length > 200) problems.push("Use fewer than 200 characters.");
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) {
    problems.push("Include both upper and lower case letters.");
  }
  if (!/[0-9]/.test(password)) problems.push("Include at least one number.");

  const lowered = password.toLowerCase();
  for (const term of context) {
    if (term && term.length >= 4 && lowered.includes(term.toLowerCase())) {
      problems.push("Do not include your name, email or the clinic name in your password.");
      break;
    }
  }

  const COMMON = [
    "password", "12345678", "qwerty", "letmein", "welcome", "admin123",
    "dental", "clinic", "chandigarh", "dentist",
  ];
  if (COMMON.some((c) => lowered.includes(c))) {
    problems.push("That password contains a commonly guessed word.");
  }

  return { ok: problems.length === 0, problems };
}
