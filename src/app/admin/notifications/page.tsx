import Link from "next/link";
import { AlertTriangle, Mail, MessageCircle, Send, Smartphone } from "lucide-react";
import { PageHeader, StatCard } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { prisma, type Prisma } from "@/lib/db";
import type { NotificationChannel, NotificationStatus } from "@/lib/db";
import { PERMISSIONS } from "@/lib/rbac";
import { formatClinicDateTime } from "@/lib/time";
import { cn, truncate } from "@/lib/utils";
import { requireStaffPage } from "@/server/auth/guards";

export const dynamic = "force-dynamic";

/**
 * Message queue.
 *
 * This screen exists because a stuck queue is silent. Nothing breaks, no error
 * appears, and the first symptom is a rise in patients not turning up — weeks
 * later, when nobody connects it to the reminders having stopped.
 */

const PAGE_SIZE = 40;

const STATUS_TONES: Record<
  NotificationStatus,
  "neutral" | "info" | "success" | "warning" | "danger"
> = {
  QUEUED: "warning",
  SENDING: "info",
  SENT: "info",
  DELIVERED: "success",
  READ: "success",
  FAILED: "danger",
  SUPPRESSED: "neutral",
};

const CHANNEL_ICONS: Record<NotificationChannel, React.ReactNode> = {
  WHATSAPP: <MessageCircle className="size-3.5" />,
  EMAIL: <Mail className="size-3.5" />,
  SMS: <Smartphone className="size-3.5" />,
  IN_APP: <Send className="size-3.5" />,
};

const FILTERS: Array<{ key: string; label: string; statuses?: NotificationStatus[] }> = [
  { key: "attention", label: "Needs attention", statuses: ["FAILED", "QUEUED"] },
  { key: "queued", label: "Queued", statuses: ["QUEUED", "SENDING"] },
  { key: "sent", label: "Sent", statuses: ["SENT", "DELIVERED", "READ"] },
  { key: "failed", label: "Failed", statuses: ["FAILED"] },
  { key: "suppressed", label: "Suppressed", statuses: ["SUPPRESSED"] },
  { key: "all", label: "All" },
];

async function loadQueue(filterKey: string, page: number) {
  const filter = FILTERS.find((f) => f.key === filterKey) ?? FILTERS[0]!;
  const staleBefore = new Date(Date.now() - 30 * 60 * 1000);

  const where: Prisma.NotificationMessageWhereInput = filter.statuses
    ? { status: { in: filter.statuses } }
    : {};

  const [messages, total, counts, stale] = await Promise.all([
    prisma.notificationMessage.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        channel: true,
        status: true,
        recipient: true,
        subject: true,
        body: true,
        attempts: true,
        maxAttempts: true,
        scheduledFor: true,
        sentAt: true,
        errorMessage: true,
        suppressionReason: true,
        createdAt: true,
        patient: { select: { id: true, fullName: true } },
      },
    }),
    prisma.notificationMessage.count({ where }),
    prisma.notificationMessage.groupBy({ by: ["status"], _count: { _all: true } }),
    // Queued and already past its send time by half an hour means the worker
    // is not running.
    prisma.notificationMessage.count({
      where: { status: "QUEUED", scheduledFor: { lt: staleBefore } },
    }),
  ]);

  return { messages, total, counts, stale };
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; page?: string }>;
}) {
  await requireStaffPage(PERMISSIONS.NOTIFICATION_VIEW);
  const params = await searchParams;

  const filterKey = params.filter ?? "attention";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const { messages, total, counts, stale } = await loadQueue(filterKey, page);

  const countFor = (status: NotificationStatus) =>
    counts.find((row) => row.status === status)?._count._all ?? 0;

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="Messages"
        description="Every confirmation, reminder and receipt sent to patients."
      />

      {stale > 0 ? (
        <div className="mb-5 flex items-start gap-3 rounded-[--radius-card] border-2 border-red-300 bg-red-50 p-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-red-700" aria-hidden="true" />
          <div className="text-sm">
            <p className="font-semibold text-red-900">
              {stale} message{stale === 1 ? "" : "s"} overdue by more than 30 minutes
            </p>
            <p className="mt-1 text-red-900/90">
              This almost always means the background worker has stopped. Patients are not receiving
              confirmations or reminders, and the first thing anyone will notice is people missing
              appointments.
            </p>
            <p className="mt-1.5 font-mono text-xs text-red-900/80">npm run worker</p>
          </div>
        </div>
      ) : null}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          label="Queued"
          value={countFor("QUEUED")}
          tone={countFor("QUEUED") > 20 ? "warning" : "default"}
        />
        <StatCard label="Sent" value={countFor("SENT") + countFor("DELIVERED")} />
        <StatCard
          label="Failed"
          value={countFor("FAILED")}
          tone={countFor("FAILED") > 0 ? "danger" : "default"}
        />
        <StatCard
          label="Suppressed"
          value={countFor("SUPPRESSED")}
          hint="No consent, or opted out"
        />
        <StatCard label="Total" value={counts.reduce((sum, row) => sum + row._count._all, 0)} />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <Link
            key={item.key}
            href={`/admin/notifications?filter=${item.key}`}
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

      {messages.length === 0 ? (
        <EmptyState
          title="Nothing in this view"
          description="Messages appear here as appointments are booked and confirmed."
        />
      ) : (
        <ul className="divide-y divide-[--color-hairline] overflow-hidden rounded-[--radius-card] border border-[--color-hairline] bg-white">
          {messages.map((message) => (
            <li key={message.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="outline">
                      {CHANNEL_ICONS[message.channel]}
                      {message.channel.toLowerCase()}
                    </Badge>
                    <Badge tone={STATUS_TONES[message.status]}>
                      {message.status.toLowerCase()}
                    </Badge>
                    <span className="text-sm font-medium">{message.recipient}</span>
                    {message.patient ? (
                      <Link
                        href={`/admin/patients/${message.patient.id}`}
                        className="text-xs text-[--color-action] hover:underline"
                      >
                        {message.patient.fullName}
                      </Link>
                    ) : null}
                  </div>

                  {message.subject ? (
                    <p className="mt-1.5 text-sm font-medium text-[--color-ink]">
                      {message.subject}
                    </p>
                  ) : null}

                  <p className="mt-1 text-sm leading-relaxed text-[--color-ink-muted]">
                    {truncate(message.body.replace(/\n+/g, " "), 160)}
                  </p>

                  {message.errorMessage ? (
                    <p className="mt-1.5 text-xs text-[--color-danger]">
                      {message.errorMessage} (attempt {message.attempts} of {message.maxAttempts})
                    </p>
                  ) : null}

                  {message.suppressionReason ? (
                    <p className="mt-1.5 text-xs text-[--color-ink-subtle]">
                      Not sent: {message.suppressionReason}
                    </p>
                  ) : null}
                </div>

                <div className="shrink-0 text-right text-xs text-[--color-ink-subtle]">
                  <p>{formatClinicDateTime(message.createdAt)}</p>
                  {message.sentAt ? (
                    <p className="mt-0.5">Sent {formatClinicDateTime(message.sentAt)}</p>
                  ) : message.status === "QUEUED" ? (
                    <p className="mt-0.5">Due {formatClinicDateTime(message.scheduledFor)}</p>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {pageCount > 1 ? (
        <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
          <p className="text-[--color-ink-subtle]">
            Page {page} of {pageCount}
          </p>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link
                href={`/admin/notifications?filter=${filterKey}&page=${page - 1}`}
                className="rounded-lg border border-[--color-navy-200] bg-white px-3 py-1.5 font-medium hover:bg-[--color-navy-50]"
              >
                Previous
              </Link>
            ) : null}
            {page < pageCount ? (
              <Link
                href={`/admin/notifications?filter=${filterKey}&page=${page + 1}`}
                className="rounded-lg border border-[--color-navy-200] bg-white px-3 py-1.5 font-medium hover:bg-[--color-navy-50]"
              >
                Next
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}

      <p className="mt-4 text-xs leading-relaxed text-[--color-ink-subtle]">
        <strong>Suppressed</strong> means deliberately not sent — usually because the patient has
        not consented to WhatsApp, or has opted out. That is correct behaviour, not a fault.{" "}
        <strong>Failed</strong> means the provider rejected it; check the error.
      </p>
    </>
  );
}
