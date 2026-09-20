import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { prisma, type Prisma } from "@/lib/db";
import { PERMISSIONS } from "@/lib/rbac";
import { formatClinicDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { requireStaffPage } from "@/server/auth/guards";

export const dynamic = "force-dynamic";

/**
 * Audit log.
 *
 * Read-only by construction — there is no edit or delete path to these rows
 * anywhere in the application. A log that privileged users can alter is not
 * evidence of anything.
 *
 * Note what is NOT here: the contents of clinical notes. The trail records that
 * a diagnosis changed and by whom, never what it said, so this screen is not a
 * second route to the record it is protecting.
 */

const PAGE_SIZE = 50;

const ACTION_TONES: Record<string, "neutral" | "info" | "success" | "warning" | "danger"> = {
  VIEW: "neutral",
  CREATE: "success",
  UPDATE: "info",
  DELETE: "danger",
  LOGIN: "info",
  LOGIN_FAILED: "warning",
  LOGOUT: "neutral",
  EXPORT: "warning",
  DOWNLOAD: "warning",
  PERMISSION_CHANGE: "danger",
  STATUS_CHANGE: "info",
  PAYMENT_VERIFIED: "success",
  REFUND: "danger",
  CONSENT_CHANGE: "warning",
};

const FILTERS = [
  { key: "all", label: "Everything" },
  { key: "access", label: "Record access", actions: ["VIEW", "DOWNLOAD", "EXPORT"] },
  { key: "changes", label: "Changes", actions: ["CREATE", "UPDATE", "DELETE", "STATUS_CHANGE"] },
  { key: "auth", label: "Sign-in", actions: ["LOGIN", "LOGIN_FAILED", "LOGOUT"] },
  { key: "money", label: "Money", actions: ["PAYMENT_VERIFIED", "REFUND"] },
  { key: "security", label: "Security", actions: ["PERMISSION_CHANGE", "CONSENT_CHANGE"] },
];

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; page?: string; entityId?: string }>;
}) {
  await requireStaffPage(PERMISSIONS.AUDIT_LOG_VIEW);
  const params = await searchParams;

  const filterKey = params.filter ?? "all";
  const filter = FILTERS.find((f) => f.key === filterKey) ?? FILTERS[0]!;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const where: Prisma.AuditLogWhereInput = {
    ...(filter.actions ? { action: { in: filter.actions } } : {}),
    ...(params.entityId ? { entityId: params.entityId } : {}),
  };

  const [entries, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        action: true,
        entity: true,
        entityId: true,
        actorLabel: true,
        actorRole: true,
        ipAddress: true,
        metadata: true,
        createdAt: true,
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="Audit log"
        description={`${total.toLocaleString("en-IN")} recorded action${total === 1 ? "" : "s"}. Read-only.`}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <Link
            key={item.key}
            href={`/admin/audit?filter=${item.key}`}
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

      {entries.length === 0 ? (
        <EmptyState title="No entries in this view" />
      ) : (
        <div className="overflow-x-auto rounded-(--radius-card) border border-(--color-hairline) bg-white">
          <table className="w-full min-w-[46rem] text-sm">
            <caption className="sr-only">Audit log entries</caption>
            <thead className="border-b border-(--color-hairline) bg-(--color-surface-sunken)">
              <tr>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">
                  When
                </th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">
                  Who
                </th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">
                  Action
                </th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">
                  Record
                </th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">
                  From
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--color-hairline)">
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="px-4 py-2.5 whitespace-nowrap text-(--color-ink-muted) tabular-nums">
                    {formatClinicDateTime(entry.createdAt)}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-medium">{entry.actorLabel ?? "System"}</span>
                    {entry.actorRole ? (
                      <span className="block text-xs text-(--color-ink-subtle)">
                        {entry.actorRole.toLowerCase().replace(/_/g, " ")}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={ACTION_TONES[entry.action] ?? "neutral"}>
                      {entry.action.toLowerCase().replace(/_/g, " ")}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-(--color-ink-muted)">
                    {entry.entity}
                    {entry.entityId ? (
                      <Link
                        href={`/admin/audit?entityId=${entry.entityId}`}
                        className="block font-mono text-[11px] text-(--color-action) hover:underline"
                      >
                        {entry.entityId.slice(0, 8)}…
                      </Link>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-(--color-ink-subtle)">
                    {entry.ipAddress ?? "—"}
                  </td>
                </tr>
              ))}
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
                href={`/admin/audit?filter=${filterKey}&page=${page - 1}`}
                className="rounded-lg border border-(--color-navy-200) bg-white px-3 py-1.5 font-medium hover:bg-(--color-navy-50)"
              >
                Previous
              </Link>
            ) : null}
            {page < pageCount ? (
              <Link
                href={`/admin/audit?filter=${filterKey}&page=${page + 1}`}
                className="rounded-lg border border-(--color-navy-200) bg-white px-3 py-1.5 font-medium hover:bg-(--color-navy-50)"
              >
                Next
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}

      <div className="mt-6 flex items-start gap-3 rounded-(--radius-card) border border-(--color-hairline) bg-(--color-surface-sunken) p-4">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-(--color-accent)" aria-hidden="true" />
        <p className="text-xs leading-relaxed text-(--color-ink-subtle)">
          These entries cannot be edited or deleted from anywhere in this application. Clinical
          content is deliberately excluded — the log records that a diagnosis was changed and by
          whom, never what it said, so this screen cannot become a second route into the record it
          exists to protect.
        </p>
      </div>
    </>
  );
}
