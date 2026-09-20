import Link from "next/link";
import { MessageSquareWarning, Star } from "lucide-react";
import { PageHeader, StatCard } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { prisma, type Prisma } from "@/lib/db";
import { PERMISSIONS } from "@/lib/rbac";
import { formatClinicDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { requireStaffPage } from "@/server/auth/guards";

export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "attention", label: "Needs attention" },
  { key: "low", label: "Low scores" },
  { key: "all", label: "All" },
];

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  await requireStaffPage(PERMISSIONS.FEEDBACK_VIEW);
  const params = await searchParams;
  const filterKey = params.filter ?? "attention";

  const where: Prisma.FeedbackWhereInput =
    filterKey === "attention"
      ? { needsFollowUp: true, handledAt: null }
      : filterKey === "low"
        ? { overallRating: { lte: 3 } }
        : {};

  const [entries, average, distribution, unhandled] = await Promise.all([
    prisma.feedback.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 60,
      select: {
        id: true,
        overallRating: true,
        doctorRating: true,
        staffRating: true,
        waitingRating: true,
        cleanlinessRating: true,
        comment: true,
        needsFollowUp: true,
        handledAt: true,
        resolutionNote: true,
        createdAt: true,
        patient: { select: { id: true, fullName: true } },
        handledBy: { select: { fullName: true } },
      },
    }),
    prisma.feedback.aggregate({ _avg: { overallRating: true }, _count: { _all: true } }),
    prisma.feedback.groupBy({ by: ["overallRating"], _count: { _all: true } }),
    prisma.feedback.count({ where: { needsFollowUp: true, handledAt: null } }),
  ]);

  const total = average._count._all;
  const mean = average._avg.overallRating ?? 0;

  return (
    <>
      <PageHeader
        title="Patient feedback"
        description="Collected after completed appointments. Separate from Google reviews."
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Average score"
          value={total > 0 ? `${mean.toFixed(1)} / 5` : "—"}
          hint={`${total} response${total === 1 ? "" : "s"}`}
        />
        <StatCard
          label="Needs service recovery"
          value={unhandled}
          tone={unhandled > 0 ? "danger" : "default"}
          icon={<MessageSquareWarning className="size-4" />}
        />
        <StatCard
          label="Promoters (4–5)"
          value={distribution
            .filter((row) => row.overallRating >= 4)
            .reduce((sum, row) => sum + row._count._all, 0)}
          tone="success"
        />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <Link
            key={item.key}
            href={`/admin/feedback?filter=${item.key}`}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm font-medium",
              filterKey === item.key
                ? "border-[--color-action] bg-[--color-action] text-white"
                : "border-[--color-navy-200] bg-white text-[--color-ink-muted] hover:bg-[--color-navy-50]",
            )}
          >
            {item.label}
          </Link>
        ))}
      </div>

      {entries.length === 0 ? (
        <EmptyState
          title="Nothing in this view"
          description="Feedback requests are sent a few hours after each completed appointment."
        />
      ) : (
        <ul className="space-y-3">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className={cn(
                "rounded-[--radius-card] border bg-white p-5",
                entry.needsFollowUp && !entry.handledAt
                  ? "border-red-200 bg-red-50/40"
                  : "border-[--color-hairline]",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="flex gap-0.5" aria-label={`${entry.overallRating} out of 5`}>
                      {Array.from({ length: 5 }, (_, index) => (
                        <Star
                          key={index}
                          className={
                            index < entry.overallRating
                              ? "size-4 fill-amber-400 text-amber-400"
                              : "size-4 text-[--color-navy-200]"
                          }
                          aria-hidden="true"
                        />
                      ))}
                    </span>
                    {entry.patient ? (
                      <Link
                        href={`/admin/patients/${entry.patient.id}`}
                        className="text-sm font-medium text-[--color-action] hover:underline"
                      >
                        {entry.patient.fullName}
                      </Link>
                    ) : (
                      <span className="text-sm text-[--color-ink-subtle]">Anonymous</span>
                    )}
                  </div>

                  {entry.comment ? (
                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[--color-ink-muted]">
                      &ldquo;{entry.comment}&rdquo;
                    </p>
                  ) : null}

                  <dl className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[--color-ink-subtle]">
                    {[
                      { label: "Doctor", value: entry.doctorRating },
                      { label: "Staff", value: entry.staffRating },
                      { label: "Waiting", value: entry.waitingRating },
                      { label: "Cleanliness", value: entry.cleanlinessRating },
                    ]
                      .filter((item) => item.value !== null)
                      .map((item) => (
                        <div key={item.label} className="flex gap-1">
                          <dt>{item.label}:</dt>
                          <dd className="font-medium tabular-nums">{item.value}/5</dd>
                        </div>
                      ))}
                  </dl>
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-xs text-[--color-ink-subtle]">
                    {formatClinicDate(entry.createdAt, "d MMM yyyy")}
                  </p>
                  {entry.needsFollowUp ? (
                    <Badge tone={entry.handledAt ? "success" : "danger"} className="mt-1.5">
                      {entry.handledAt ? "Handled" : "Needs follow-up"}
                    </Badge>
                  ) : null}
                </div>
              </div>

              {entry.handledAt && entry.resolutionNote ? (
                <p className="mt-3 border-t border-[--color-hairline] pt-2.5 text-xs text-[--color-ink-subtle]">
                  Resolved by {entry.handledBy?.fullName ?? "staff"}: {entry.resolutionNote}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 rounded-[--radius-card] border border-[--color-hairline] bg-[--color-surface-sunken] p-4 text-xs leading-relaxed text-[--color-ink-subtle]">
        Every patient who completes this form is shown the Google review link, whatever their score.
        Filtering who gets asked for a public review is review gating and breaches Google&apos;s
        policies. A low score additionally raises the internal alert above — that is about fixing
        the experience, not suppressing the review.
      </p>
    </>
  );
}
