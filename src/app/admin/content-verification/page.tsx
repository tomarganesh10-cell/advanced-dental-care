import { AlertTriangle, BadgeCheck, CircleAlert } from "lucide-react";
import { PageHeader, StatCard } from "@/components/admin/page-header";
import { ClaimRow } from "@/components/admin/claim-row";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@/lib/rbac";
import { requireStaffPage } from "@/server/auth/guards";
import clinicMasterData from "@data/clinic-master-data";
import { flattenClaims } from "@data/verification";

export const dynamic = "force-dynamic";

/**
 * Content verification.
 *
 * This screen is how docs/CONTENT_AUDIT.md stops being a document and becomes a
 * control. Every VerifiedClaim in data/clinic-master-data.ts appears here, and
 * nothing reaches the public site until someone records what evidence they saw.
 *
 * The file is the default; a row in content_claims overrides it. That way the
 * clinic can verify a figure without a deploy, and a fresh checkout still ships
 * with everything unverified rather than everything switched on.
 */
export default async function ContentVerificationPage() {
  await requireStaffPage(PERMISSIONS.CONTENT_VERIFY_CLAIMS);

  const claims = flattenClaims(clinicMasterData);

  const stored = await prisma.contentClaim.findMany({
    select: {
      key: true,
      status: true,
      value: true,
      evidence: true,
      notes: true,
      verifiedAt: true,
      verifiedBy: { select: { fullName: true } },
    },
  });

  const storedByKey = new Map(
    stored.map((row) => [
      row.key,
      {
        status: row.status,
        value: row.value,
        evidence: row.evidence,
        notes: row.notes,
        verifiedByName: row.verifiedBy?.fullName ?? null,
        verifiedAt: row.verifiedAt,
      },
    ]),
  );

  const effectiveStatus = (key: string, fallback: string) =>
    storedByKey.get(key)?.status ?? fallback;

  const verified = claims.filter((c) => effectiveStatus(c.key, c.status) === "VERIFIED").length;
  const pending = claims.filter(
    (c) => effectiveStatus(c.key, c.status) === "NEEDS_VERIFICATION",
  ).length;
  const archived = claims.filter((c) => effectiveStatus(c.key, c.status) === "ARCHIVED").length;

  // Grouped by the top-level section of the dotted key, so related claims are
  // reviewed together — someone verifying qualifications has the certificates
  // in front of them and may as well do all of them.
  const groups = new Map<string, typeof claims>();
  for (const claim of claims) {
    const group = claim.key.split(".")[0] ?? "other";
    const existing = groups.get(group) ?? [];
    existing.push(claim);
    groups.set(group, existing);
  }

  return (
    <>
      <PageHeader
        title="Content verification"
        description="Every factual claim the website makes about the practice. Nothing here appears publicly until it has been verified against evidence."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Verified"
          value={verified}
          hint="Appearing on the public site"
          tone="success"
          icon={<BadgeCheck className="size-4" />}
        />
        <StatCard
          label="Needs verification"
          value={pending}
          hint="Hidden from the public site"
          tone={pending > 0 ? "warning" : "default"}
          icon={<CircleAlert className="size-4" />}
        />
        <StatCard label="Archived" value={archived} hint="No longer true" />
      </div>

      {pending > 0 ? (
        <div className="mb-6 flex items-start gap-3 rounded-[--radius-card] border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden="true" />
          <div className="text-sm text-amber-900">
            <p className="font-medium text-amber-950">
              {pending} claim{pending === 1 ? "" : "s"} are being withheld from the website
            </p>
            <p className="mt-1 leading-relaxed">
              This is deliberate. The previous site published contradictory figures — 25 years and
              18 years of experience, 20,000 and 5,000 patients — because the numbers were typed
              into the page. Here, a claim is hidden until someone records the evidence behind it.
            </p>
            <p className="mt-2 leading-relaxed">
              Two of these are more than a marketing issue: a CBCT claim needs a current AERB
              licence, and each named specialist needs their council registration.
            </p>
          </div>
        </div>
      ) : null}

      <div className="space-y-6">
        {[...groups.entries()].map(([group, groupClaims]) => (
          <section key={group}>
            <h2 className="mb-2 text-sm font-semibold tracking-wide text-[--color-ink-subtle] uppercase">
              {group.replace(/([A-Z])/g, " $1")}
            </h2>
            <ul className="overflow-hidden rounded-[--radius-card] border border-[--color-hairline] bg-white">
              {groupClaims.map((claim) => (
                <ClaimRow
                  key={claim.key}
                  claim={claim}
                  stored={storedByKey.get(claim.key) ?? null}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>

      <p className="mt-6 text-xs leading-relaxed text-[--color-ink-subtle]">
        Claims defined in <code className="font-mono">data/clinic-master-data.ts</code>. Verifying
        here stores an override in the database, so no deploy is needed. See{" "}
        <code className="font-mono">docs/CONTENT_AUDIT.md</code> for the full list of conflicts
        found on the previous site and the evidence required for each claim.
      </p>
    </>
  );
}
