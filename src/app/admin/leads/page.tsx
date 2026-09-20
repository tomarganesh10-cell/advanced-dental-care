import Link from "next/link";
import { AlertCircle, Phone } from "lucide-react";
import { PageHeader, StatCard } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { prisma, type Prisma } from "@/lib/db";
import type { LeadStatus } from "@/lib/db";
import { PERMISSIONS } from "@/lib/rbac";
import { formatPhone } from "@/lib/phone";
import { formatClinicDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { requireStaffPage } from "@/server/auth/guards";
import { getLeadSourcePerformance } from "@/server/reports/dashboard";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

const STATUS_TONES: Record<LeadStatus, "neutral" | "info" | "success" | "warning" | "danger"> = {
  NEW: "warning",
  CONTACTED: "info",
  QUALIFIED: "info",
  APPOINTMENT_BOOKED: "success",
  VISITED: "success",
  TREATMENT_STARTED: "success",
  WON: "success",
  LOST: "neutral",
  FOLLOW_UP: "warning",
};

const FILTERS: Array<{ key: string; label: string; statuses?: LeadStatus[] }> = [
  { key: "new", label: "New", statuses: ["NEW"] },
  { key: "due", label: "Follow-up due" },
  { key: "open", label: "Open", statuses: ["NEW", "CONTACTED", "QUALIFIED", "FOLLOW_UP"] },
  {
    key: "booked",
    label: "Booked",
    statuses: ["APPOINTMENT_BOOKED", "VISITED", "TREATMENT_STARTED"],
  },
  { key: "won", label: "Won", statuses: ["WON"] },
  { key: "lost", label: "Lost", statuses: ["LOST"] },
  { key: "all", label: "All" },
];

async function loadLeads(filterKey: string, page: number) {
  const now = new Date();
  const filter = FILTERS.find((f) => f.key === filterKey) ?? FILTERS[0]!;

  const where: Prisma.LeadWhereInput = {
    deletedAt: null,
    ...(filter.statuses ? { status: { in: filter.statuses } } : {}),
    ...(filterKey === "due"
      ? { nextFollowUpAt: { lte: now }, status: { notIn: ["WON", "LOST"] } }
      : {}),
  };

  const [leads, total, funnel, sources] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: filterKey === "due" ? { nextFollowUpAt: "asc" } : { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        reference: true,
        fullName: true,
        phone: true,
        email: true,
        treatmentInterest: true,
        source: true,
        status: true,
        utmSource: true,
        utmCampaign: true,
        createdAt: true,
        nextFollowUpAt: true,
        isInternational: true,
        assignedTo: { select: { fullName: true } },
      },
    }),
    prisma.lead.count({ where }),
    prisma.lead.groupBy({
      by: ["status"],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
    getLeadSourcePerformance(90, now),
  ]);

  return { leads, total, funnel, sources, now: now.getTime() };
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; page?: string }>;
}) {
  await requireStaffPage(PERMISSIONS.LEAD_VIEW);
  const params = await searchParams;

  const filterKey = params.filter ?? "new";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const { leads, total, funnel, sources, now } = await loadLeads(filterKey, page);

  const countFor = (status: LeadStatus) =>
    funnel.find((row) => row.status === status)?._count._all ?? 0;

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="Enquiries"
        description="Every website, phone and walk-in enquiry, with the campaign that produced it."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          label="New"
          value={countFor("NEW")}
          tone={countFor("NEW") > 0 ? "warning" : "default"}
        />
        <StatCard label="Contacted" value={countFor("CONTACTED")} />
        <StatCard label="Booked" value={countFor("APPOINTMENT_BOOKED")} />
        <StatCard label="Won" value={countFor("WON")} tone="success" />
        <StatCard label="Lost" value={countFor("LOST")} />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <Link
            key={item.key}
            href={`/admin/leads?filter=${item.key}`}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm font-medium",
              filterKey === item.key
                ? "border-(--color-action) bg-(--color-action) text-white"
                : "border-(--color-navy-200) bg-white text-(--color-ink-muted) hover:bg-(--color-navy-50)",
            )}
          >
            {item.label}
          </Link>
        ))}
      </div>

      {leads.length === 0 ? (
        <EmptyState
          title="No enquiries in this view"
          description="Enquiries from the website, phone and walk-ins all land here."
        />
      ) : (
        <div className="overflow-x-auto rounded-(--radius-card) border border-(--color-hairline) bg-white">
          <table className="w-full min-w-[56rem] text-sm">
            <caption className="sr-only">Enquiries</caption>
            <thead className="border-b border-(--color-hairline) bg-(--color-surface-sunken)">
              <tr>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">
                  Enquirer
                </th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">
                  Interest
                </th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">
                  Source
                </th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">
                  Owner
                </th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">
                  Follow-up
                </th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--color-hairline)">
              {leads.map((lead) => {
                const overdue =
                  lead.nextFollowUpAt &&
                  lead.nextFollowUpAt.getTime() < now &&
                  !["WON", "LOST"].includes(lead.status);

                return (
                  <tr key={lead.id} className="hover:bg-(--color-navy-50)/50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/leads/${lead.id}`}
                        className="font-medium text-(--color-action) hover:underline"
                      >
                        {lead.fullName}
                      </Link>
                      <span className="block text-xs text-(--color-ink-subtle)">
                        <a
                          href={`tel:${lead.phone}`}
                          className="inline-flex items-center gap-1 hover:underline"
                        >
                          <Phone className="size-3" aria-hidden="true" />
                          {formatPhone(lead.phone)}
                        </a>
                      </span>
                      <span className="mt-1 flex gap-1">
                        {lead.isInternational ? <Badge tone="info">International</Badge> : null}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-(--color-ink-muted)">
                      {lead.treatmentInterest ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-(--color-ink-muted)">{titleCase(lead.source)}</span>
                      {lead.utmCampaign ? (
                        <span className="block text-xs text-(--color-ink-subtle)">
                          {lead.utmSource} / {lead.utmCampaign}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-(--color-ink-muted)">
                      {lead.assignedTo?.fullName ?? (
                        <span className="text-(--color-ink-subtle)">Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {lead.nextFollowUpAt ? (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 tabular-nums",
                            overdue
                              ? "font-medium text-(--color-danger)"
                              : "text-(--color-ink-muted)",
                          )}
                        >
                          {overdue ? <AlertCircle className="size-3.5" aria-hidden="true" /> : null}
                          {formatClinicDate(lead.nextFollowUpAt, "d MMM")}
                        </span>
                      ) : (
                        <span className="text-(--color-ink-subtle)">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONES[lead.status]}>{titleCase(lead.status)}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pageCount > 1 ? (
        <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
          <p className="text-(--color-ink-subtle)">
            Page {page} of {pageCount}
          </p>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link
                href={`/admin/leads?filter=${filterKey}&page=${page - 1}`}
                className="rounded-lg border border-(--color-navy-200) bg-white px-3 py-1.5 font-medium hover:bg-(--color-navy-50)"
              >
                Previous
              </Link>
            ) : null}
            {page < pageCount ? (
              <Link
                href={`/admin/leads?filter=${filterKey}&page=${page + 1}`}
                className="rounded-lg border border-(--color-navy-200) bg-white px-3 py-1.5 font-medium hover:bg-(--color-navy-50)"
              >
                Next
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}

      {/* Source performance — the question the clinic is really paying to answer. */}
      {sources.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-(--color-ink-subtle) uppercase">
            Where enquiries come from (last 90 days)
          </h2>
          <div className="overflow-hidden rounded-(--radius-card) border border-(--color-hairline) bg-white">
            <table className="w-full text-sm">
              <caption className="sr-only">Enquiry volume and booking rate by source</caption>
              <thead className="border-b border-(--color-hairline) bg-(--color-surface-sunken)">
                <tr>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">
                    Source
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">
                    Enquiries
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">
                    Booked
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">
                    Booking rate
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-(--color-hairline)">
                {sources.map((source) => (
                  <tr key={source.source}>
                    <td className="px-4 py-2.5 font-medium">{titleCase(source.source)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{source.total}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{source.booked}</td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                      {source.bookingRate}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-(--color-ink-subtle)">
            Booking rate counts enquiries that reached an appointment or beyond. A source with high
            volume and a low rate is usually a targeting problem, not a volume problem.
          </p>
        </section>
      ) : null}
    </>
  );
}

function titleCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, " ");
}
