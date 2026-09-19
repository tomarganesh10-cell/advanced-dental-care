/**
 * Verification wrapper for every public-facing clinic claim.
 *
 * The rule this type enforces: a claim that has not been verified against
 * evidence is never rendered on the public site. `publicValue()` returns
 * `undefined` for anything that is not `VERIFIED`, so a forgotten claim
 * disappears from the page rather than shipping as an unsubstantiated
 * statement.
 *
 * See docs/CONTENT_AUDIT.md and docs/CONTENT_GOVERNANCE.md.
 */

export const VERIFICATION_STATUSES = [
  /** Evidence seen and recorded by a named person. Safe to publish. */
  "VERIFIED",
  /** Carried over from the old site, no evidence yet. Never published. */
  "NEEDS_VERIFICATION",
  /** Was true, no longer is. Kept for the audit trail. Never published. */
  "ARCHIVED",
] as const;

export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export interface VerifiedClaim<T> {
  value: T;
  status: VerificationStatus;
  /** Where the value came from: "clinic email 2026-03-11", "old site homepage". */
  source: string;
  /** Who confirmed it. Required before status may be VERIFIED. */
  verifiedBy?: string;
  /** ISO date (YYYY-MM-DD) the verification happened. */
  verifiedOn?: string;
  /** What evidence was produced. Required before status may be VERIFIED. */
  evidence?: string;
  /** Free-text caveat shown to staff in the admin verification screen. */
  notes?: string;
  /**
   * For counts and statistics: the date the figure was accurate. Rendered
   * alongside the number so a stale figure is self-evidently dated rather than
   * silently wrong.
   */
  asOf?: string;
}

/** Helper for declaring a claim that has been verified against evidence. */
export function verified<T>(
  value: T,
  meta: { source: string; verifiedBy: string; verifiedOn: string; evidence: string; asOf?: string },
): VerifiedClaim<T> {
  return { value, status: "VERIFIED", ...meta };
}

/** Helper for declaring a claim that is not yet safe to publish. */
export function unverified<T>(
  value: T,
  meta: { source: string; notes?: string; asOf?: string },
): VerifiedClaim<T> {
  return { value, status: "NEEDS_VERIFICATION", ...meta };
}

/**
 * The only way public components should read a claim.
 * Returns the value if and only if it is VERIFIED.
 */
export function publicValue<T>(claim: VerifiedClaim<T> | undefined): T | undefined {
  if (!claim) return undefined;
  return claim.status === "VERIFIED" ? claim.value : undefined;
}

/** True when the claim may appear on a public page. */
export function isPublishable<T>(claim: VerifiedClaim<T> | undefined): boolean {
  return claim?.status === "VERIFIED";
}

/** Filters a list of claims down to the publishable ones. */
export function publishableList<T>(claims: readonly VerifiedClaim<T>[]): T[] {
  return claims.filter(isPublishable).map((c) => c.value);
}

/**
 * Every claim in the master data file, flattened for the admin verification
 * screen and for the `scripts/check-content.ts` CI gate.
 */
export interface FlatClaim {
  key: string;
  label: string;
  value: unknown;
  status: VerificationStatus;
  source: string;
  verifiedBy?: string;
  verifiedOn?: string;
  evidence?: string;
  notes?: string;
  asOf?: string;
}

function isClaim(v: unknown): v is VerifiedClaim<unknown> {
  return (
    typeof v === "object" &&
    v !== null &&
    "status" in v &&
    "value" in v &&
    "source" in v &&
    VERIFICATION_STATUSES.includes((v as VerifiedClaim<unknown>).status)
  );
}

/** Walks an arbitrary object tree and collects every VerifiedClaim it contains. */
export function flattenClaims(input: unknown, prefix = ""): FlatClaim[] {
  const out: FlatClaim[] = [];

  const walk = (node: unknown, path: string): void => {
    if (isClaim(node)) {
      out.push({
        key: path,
        label: path.split(".").pop() ?? path,
        value: node.value,
        status: node.status,
        source: node.source,
        verifiedBy: node.verifiedBy,
        verifiedOn: node.verifiedOn,
        evidence: node.evidence,
        notes: node.notes,
        asOf: node.asOf,
      });
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((child, i) => walk(child, `${path}[${i}]`));
      return;
    }
    if (typeof node === "object" && node !== null) {
      for (const [k, v] of Object.entries(node)) {
        walk(v, path ? `${path}.${k}` : k);
      }
    }
  };

  walk(input, prefix);
  return out;
}
