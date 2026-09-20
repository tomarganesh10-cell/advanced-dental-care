import { AlertTriangle, ImageIcon, ShieldCheck } from "lucide-react";
import Image from "next/image";
import { PageHeader, StatCard } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { prisma } from "@/lib/db";
import type { ConsentStatus } from "@/lib/db";
import { PERMISSIONS } from "@/lib/rbac";
import { formatClinicDate } from "@/lib/time";
import { requireStaffPage } from "@/server/auth/guards";

export const dynamic = "force-dynamic";

const CONSENT_TONES: Record<ConsentStatus, "neutral" | "info" | "success" | "warning" | "danger"> =
  {
    NOT_REQUESTED: "neutral",
    REQUESTED: "warning",
    GRANTED: "success",
    REFUSED: "danger",
    WITHDRAWN: "danger",
    EXPIRED: "warning",
  };

export default async function GalleryAdminPage() {
  await requireStaffPage(PERMISSIONS.GALLERY_MANAGE);

  const now = new Date();

  const cases = await prisma.galleryCase.findMany({
    where: { deletedAt: null },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      slug: true,
      title: true,
      category: true,
      concern: true,
      consentStatus: true,
      consentEvidence: true,
      consentExpiresAt: true,
      isPublished: true,
      createdAt: true,
      patient: { select: { id: true, fullName: true } },
      doctor: { select: { displayName: true } },
      media: { select: { id: true, phase: true, imageUrl: true, altText: true } },
    },
  });

  const live = cases.filter(
    (item) =>
      item.isPublished &&
      item.consentStatus === "GRANTED" &&
      (!item.consentExpiresAt || item.consentExpiresAt > now),
  );

  const expiringSoon = cases.filter(
    (item) =>
      item.consentStatus === "GRANTED" &&
      item.consentExpiresAt &&
      item.consentExpiresAt > now &&
      item.consentExpiresAt.getTime() - now.getTime() < 60 * 24 * 60 * 60 * 1000,
  );

  const blocked = cases.filter((item) => item.isPublished && item.consentStatus !== "GRANTED");

  return (
    <>
      <PageHeader
        title="Smile gallery"
        description="Treatment photographs. Nothing appears on the website without granted, unexpired consent."
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard label="Live on the website" value={live.length} tone="success" />
        <StatCard label="Total cases" value={cases.length} />
        <StatCard
          label="Consent expiring soon"
          value={expiringSoon.length}
          hint="Within 60 days"
          tone={expiringSoon.length > 0 ? "warning" : "default"}
        />
      </div>

      {blocked.length > 0 ? (
        <div className="mb-5 flex items-start gap-3 rounded-[--radius-card] border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden="true" />
          <p className="text-sm text-amber-900">
            <strong>
              {blocked.length} case{blocked.length === 1 ? " is" : "s are"} marked published but
              held back
            </strong>{" "}
            because consent is not granted or has lapsed. This is the system working as intended —
            the website is showing nothing for them. Renew the consent or unpublish.
          </p>
        </div>
      ) : null}

      {cases.length === 0 ? (
        <EmptyState
          title="No cases yet"
          description="Upload is not yet built — see docs/STATUS.md. Cases added directly to the data appear here."
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cases.map((item) => {
            const before = item.media.find((m) => m.phase === "BEFORE");
            const after = item.media.find((m) => m.phase === "AFTER");
            const isLive = live.some((live) => live.id === item.id);

            return (
              <li
                key={item.id}
                className="overflow-hidden rounded-[--radius-card] border border-[--color-hairline] bg-white"
              >
                <div className="grid grid-cols-2 gap-px bg-[--color-hairline]">
                  {[before, after].map((media, index) => (
                    <div key={index} className="relative aspect-square bg-[--color-sand]">
                      {media ? (
                        <Image
                          src={media.imageUrl}
                          alt={media.altText}
                          fill
                          sizes="20vw"
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <ImageIcon
                            className="size-5 text-[--color-navy-300]"
                            aria-hidden="true"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="p-4">
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className="mt-0.5 text-xs text-[--color-ink-subtle]">
                    {item.category}
                    {item.concern ? ` · ${item.concern}` : ""}
                  </p>

                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    <Badge tone={isLive ? "success" : "neutral"}>
                      {isLive ? "Live" : "Not on website"}
                    </Badge>
                    <Badge tone={CONSENT_TONES[item.consentStatus]}>
                      consent: {item.consentStatus.toLowerCase().replace(/_/g, " ")}
                    </Badge>
                  </div>

                  {item.consentExpiresAt ? (
                    <p className="mt-2 text-xs text-[--color-ink-subtle]">
                      Consent expires {formatClinicDate(item.consentExpiresAt, "d MMM yyyy")}
                    </p>
                  ) : null}

                  {item.consentEvidence ? (
                    <p className="mt-1 flex items-start gap-1 text-xs text-[--color-ink-subtle]">
                      <ShieldCheck className="mt-px size-3 shrink-0" aria-hidden="true" />
                      {item.consentEvidence}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-6 rounded-[--radius-card] border border-[--color-hairline] bg-[--color-surface-sunken] p-4 text-xs leading-relaxed text-[--color-ink-subtle]">
        Consent to treatment is not consent to publication. A case needs separate, specific, written
        consent, and the patient can withdraw it at any time — at which point the images come off
        the website immediately. That gate is enforced in the query that the public page uses, not
        in the page itself, so it cannot be bypassed by a new template.
      </p>
    </>
  );
}
