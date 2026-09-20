/**
 * Content governance gate.
 *
 * Fails CI when a claim in data/clinic-master-data.ts is marked VERIFIED
 * without recording who verified it, when, and against what evidence.
 *
 * Without this, "VERIFIED" degrades into a flag someone sets to make a number
 * appear on the site — which is precisely the habit that produced the
 * contradictory figures on the previous site.
 */

import clinicMasterData from "../data/clinic-master-data";
import { flattenClaims } from "../data/verification";

const claims = flattenClaims(clinicMasterData);
const problems: string[] = [];

for (const claim of claims) {
  if (claim.status !== "VERIFIED") continue;

  if (!claim.evidence?.trim()) {
    problems.push(`${claim.key}: marked VERIFIED with no evidence recorded`);
  }
  if (!claim.verifiedBy?.trim()) {
    problems.push(`${claim.key}: marked VERIFIED with no verifier named`);
  }
  if (!claim.verifiedOn?.trim()) {
    problems.push(`${claim.key}: marked VERIFIED with no verification date`);
  }
}

const verified = claims.filter((claim) => claim.status === "VERIFIED").length;
const pending = claims.filter((claim) => claim.status === "NEEDS_VERIFICATION").length;

console.log(`Content claims: ${claims.length} total, ${verified} verified, ${pending} pending.`);

if (problems.length > 0) {
  console.error("\nContent governance check FAILED:\n");
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error("\nA claim may only be VERIFIED when someone has recorded what evidence they saw.");
  console.error("See docs/CONTENT_GOVERNANCE.md.\n");
  process.exit(1);
}

if (pending > 0) {
  console.log(
    `\n${pending} claim(s) awaiting verification. These are hidden from the public site until verified in Admin → Content verification.`,
  );
}

console.log("\nContent governance check passed.");
