import Link from "next/link";
import { Globe2, Mail, MessageCircle } from "lucide-react";
import { PageHeader, StatCard } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { prisma } from "@/lib/db";
import type { InternationalEnquiryStatus } from "@/lib/db";
import { PERMISSIONS } from "@/lib/rbac";
import { formatClinicDate, formatInViewerTimezone } from "@/lib/time";
import { formatPhone, whatsappNumber } from "@/lib/phone";
import { requireStaffPage } from "@/server/auth/guards";

export const dynamic = "force-dynamic";

const STATUS_TONES: Record<
  InternationalEnquiryStatus,
  "neutral" | "info" | "success" | "warning" | "danger"
> = {
  NEW: "warning",
  REPORTS_REQUESTED: "info",
  REPORTS_RECEIVED: "info",
  CONSULTATION_SCHEDULED: "info",
  PLAN_SENT: "info",
  TRAVEL_PLANNED: "success",
  ARRIVED: "success",
  TREATMENT_STARTED: "success",
  COMPLETED: "success",
  LOST: "neutral",
};

export default async function InternationalPage() {
  await requireStaffPage(PERMISSIONS.LEAD_VIEW);

  const now = new Date();

  const [enquiries, counts, countries] = await Promise.all([
    prisma.internationalPatientEnquiry.findMany({
      orderBy: { createdAt: "desc" },
      take: 60,
      select: {
        id: true,
        reference: true,
        fullName: true,
        email: true,
        phone: true,
        whatsapp: true,
        country: true,
        city: true,
        timezone: true,
        treatmentInterest: true,
        message: true,
        preferredTravelFrom: true,
        preferredTravelTo: true,
        consultationScheduledAt: true,
        status: true,
        createdAt: true,
      },
    }),
    prisma.internationalPatientEnquiry.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.internationalPatientEnquiry.groupBy({
      by: ["country"],
      _count: { _all: true },
      orderBy: { _count: { country: "desc" } },
      take: 6,
    }),
  ]);

  const countFor = (status: InternationalEnquiryStatus) =>
    counts.find((row) => row.status === status)?._count._all ?? 0;

  return (
    <>
      <PageHeader
        title="International patients"
        description="Enquiries from abroad, with the travel dates and timezone they gave."
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="New"
          value={countFor("NEW")}
          tone={countFor("NEW") > 0 ? "warning" : "default"}
        />
        <StatCard
          label="In consultation"
          value={countFor("CONSULTATION_SCHEDULED") + countFor("PLAN_SENT")}
        />
        <StatCard label="Travelling" value={countFor("TRAVEL_PLANNED") + countFor("ARRIVED")} />
        <StatCard
          label="Treated"
          value={countFor("TREATMENT_STARTED") + countFor("COMPLETED")}
          tone="success"
        />
      </div>

      {countries.length > 0 ? (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium tracking-wide text-[--color-ink-subtle] uppercase">
            Top countries
          </span>
          {countries.map((row) => (
            <Badge key={row.country} tone="outline">
              <Globe2 className="size-3" aria-hidden="true" />
              {row.country} · {row._count._all}
            </Badge>
          ))}
        </div>
      ) : null}

      {enquiries.length === 0 ? (
        <EmptyState
          title="No international enquiries yet"
          description="These arrive from the international patients page on the website."
        />
      ) : (
        <ul className="space-y-3">
          {enquiries.map((enquiry) => (
            <li
              key={enquiry.id}
              className="rounded-[--radius-card] border border-[--color-hairline] bg-white p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{enquiry.fullName}</span>
                    <Badge tone="outline">
                      <Globe2 className="size-3" aria-hidden="true" />
                      {enquiry.city ? `${enquiry.city}, ` : ""}
                      {enquiry.country}
                    </Badge>
                    <Badge tone={STATUS_TONES[enquiry.status]}>
                      {enquiry.status.toLowerCase().replace(/_/g, " ")}
                    </Badge>
                  </div>

                  <p className="mt-1.5 text-sm text-[--color-ink-muted]">
                    Asking about <strong>{enquiry.treatmentInterest}</strong>
                  </p>

                  {enquiry.message ? (
                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[--color-ink-muted]">
                      {enquiry.message}
                    </p>
                  ) : null}

                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
                    <a
                      href={`mailto:${enquiry.email}`}
                      className="inline-flex items-center gap-1 text-[--color-action] hover:underline"
                    >
                      <Mail className="size-3" aria-hidden="true" />
                      {enquiry.email}
                    </a>
                    <a
                      href={`tel:${enquiry.phone}`}
                      className="text-[--color-ink-muted] hover:underline"
                    >
                      {formatPhone(enquiry.phone)}
                    </a>
                    {enquiry.whatsapp ? (
                      <a
                        href={`https://wa.me/${whatsappNumber(enquiry.whatsapp)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[#128C7E] hover:underline"
                      >
                        <MessageCircle className="size-3" aria-hidden="true" />
                        WhatsApp
                      </a>
                    ) : null}
                  </div>

                  {/*
                    The patient's local time, so whoever calls does not ring
                    them at 3am. This is the single most useful field on the
                    screen and the reason the form asks for a timezone.
                  */}
                  {enquiry.timezone ? (
                    <p className="mt-2 text-xs text-[--color-ink-subtle]">
                      Their local time now: {formatInViewerTimezone(now, enquiry.timezone)}
                    </p>
                  ) : null}
                </div>

                <div className="shrink-0 text-right text-xs text-[--color-ink-subtle]">
                  <p className="font-mono">{enquiry.reference}</p>
                  <p className="mt-0.5">{formatClinicDate(enquiry.createdAt, "d MMM yyyy")}</p>
                  {enquiry.preferredTravelFrom ? (
                    <p className="mt-1.5 text-[--color-ink-muted]">
                      Travelling {formatClinicDate(enquiry.preferredTravelFrom, "d MMM")}
                      {enquiry.preferredTravelTo
                        ? ` – ${formatClinicDate(enquiry.preferredTravelTo, "d MMM")}`
                        : ""}
                    </p>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 text-xs leading-relaxed text-[--color-ink-subtle]">
        Every enquiry here also appears in{" "}
        <Link href="/admin/leads?filter=all" className="text-[--color-action] hover:underline">
          Enquiries
        </Link>{" "}
        so international conversion is measured on the same basis as every other channel.
      </p>
    </>
  );
}
