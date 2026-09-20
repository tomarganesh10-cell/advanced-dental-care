import Link from "next/link";
import { PageHeader, StatCard } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { prisma, type Prisma } from "@/lib/db";
import type { InvoiceStatus } from "@/lib/db";
import { PERMISSIONS } from "@/lib/rbac";
import { formatClinicDate } from "@/lib/time";
import { cn, formatPaise } from "@/lib/utils";
import { requireStaffPage } from "@/server/auth/guards";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 40;

const STATUS_TONES: Record<InvoiceStatus, "neutral" | "info" | "success" | "warning" | "danger"> = {
  DRAFT: "neutral",
  ISSUED: "warning",
  PARTIALLY_PAID: "warning",
  PAID: "success",
  CANCELLED: "neutral",
  WRITTEN_OFF: "danger",
};

const FILTERS: Array<{ key: string; label: string; statuses?: InvoiceStatus[] }> = [
  { key: "outstanding", label: "Outstanding", statuses: ["ISSUED", "PARTIALLY_PAID"] },
  { key: "paid", label: "Paid", statuses: ["PAID"] },
  { key: "draft", label: "Draft", statuses: ["DRAFT"] },
  { key: "all", label: "All" },
];

async function loadInvoices(filterKey: string, page: number) {
  const filter = FILTERS.find((f) => f.key === filterKey) ?? FILTERS[0]!;
  const now = new Date();

  const where: Prisma.InvoiceWhereInput = {
    deletedAt: null,
    ...(filter.statuses ? { status: { in: filter.statuses } } : {}),
  };

  const [invoices, total, outstanding, overdue, paidThisMonth] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        number: true,
        status: true,
        totalPaise: true,
        paidPaise: true,
        balancePaise: true,
        issuedAt: true,
        dueAt: true,
        patient: { select: { id: true, fullName: true, patientNumber: true } },
      },
    }),
    prisma.invoice.count({ where }),
    prisma.invoice.aggregate({
      where: { deletedAt: null, status: { in: ["ISSUED", "PARTIALLY_PAID"] } },
      _sum: { balancePaise: true },
    }),
    prisma.invoice.count({
      where: {
        deletedAt: null,
        status: { in: ["ISSUED", "PARTIALLY_PAID"] },
        dueAt: { lt: now },
      },
    }),
    prisma.payment.aggregate({
      where: {
        status: "SUCCESS",
        verifiedAt: { not: null },
        paidAt: { gte: new Date(now.getFullYear(), now.getMonth(), 1) },
      },
      _sum: { amountPaise: true },
    }),
  ]);

  return {
    invoices,
    total,
    outstandingPaise: outstanding._sum.balancePaise ?? 0,
    overdue,
    paidThisMonthPaise: paidThisMonth._sum.amountPaise ?? 0,
    now: now.getTime(),
  };
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; page?: string }>;
}) {
  await requireStaffPage(PERMISSIONS.INVOICE_VIEW);
  const params = await searchParams;

  const filterKey = params.filter ?? "outstanding";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const { invoices, total, outstandingPaise, overdue, paidThisMonthPaise, now } =
    await loadInvoices(filterKey, page);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="Invoices"
        description={`${total} invoice${total === 1 ? "" : "s"} in this view`}
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Outstanding"
          value={formatPaise(outstandingPaise)}
          tone={outstandingPaise > 0 ? "warning" : "default"}
        />
        <StatCard
          label="Overdue"
          value={overdue}
          hint="Past the due date"
          tone={overdue > 0 ? "danger" : "default"}
        />
        <StatCard
          label="Received this month"
          value={formatPaise(paidThisMonthPaise)}
          tone="success"
        />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <Link
            key={item.key}
            href={`/admin/invoices?filter=${item.key}`}
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

      {invoices.length === 0 ? (
        <EmptyState
          title="No invoices in this view"
          description="Invoices are created when treatment is billed."
        />
      ) : (
        <div className="overflow-x-auto rounded-(--radius-card) border border-(--color-hairline) bg-white">
          <table className="w-full min-w-[46rem] text-sm">
            <caption className="sr-only">Invoices</caption>
            <thead className="border-b border-(--color-hairline) bg-(--color-surface-sunken)">
              <tr>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">
                  Invoice
                </th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">
                  Patient
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">
                  Total
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">
                  Paid
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">
                  Balance
                </th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">
                  Due
                </th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--color-hairline)">
              {invoices.map((invoice) => {
                const isOverdue =
                  invoice.dueAt &&
                  invoice.dueAt.getTime() < now &&
                  invoice.balancePaise > 0 &&
                  invoice.status !== "CANCELLED";

                return (
                  <tr key={invoice.id}>
                    <td className="px-4 py-2.5 font-medium tabular-nums">{invoice.number}</td>
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/admin/patients/${invoice.patient.id}`}
                        className="text-(--color-action) hover:underline"
                      >
                        {invoice.patient.fullName}
                      </Link>
                      <span className="block text-xs text-(--color-ink-subtle)">
                        {invoice.patient.patientNumber}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {formatPaise(invoice.totalPaise)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-(--color-ink-muted) tabular-nums">
                      {formatPaise(invoice.paidPaise)}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-2.5 text-right font-medium tabular-nums",
                        invoice.balancePaise > 0
                          ? "text-(--color-ink)"
                          : "text-(--color-ink-subtle)",
                      )}
                    >
                      {formatPaise(invoice.balancePaise)}
                    </td>
                    <td className="px-4 py-2.5">
                      {invoice.dueAt ? (
                        <span className={isOverdue ? "font-medium text-(--color-danger)" : ""}>
                          {formatClinicDate(invoice.dueAt, "d MMM yyyy")}
                        </span>
                      ) : (
                        <span className="text-(--color-ink-subtle)">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={STATUS_TONES[invoice.status]}>
                        {invoice.status.toLowerCase().replace(/_/g, " ")}
                      </Badge>
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
                href={`/admin/invoices?filter=${filterKey}&page=${page - 1}`}
                className="rounded-lg border border-(--color-navy-200) bg-white px-3 py-1.5 font-medium hover:bg-(--color-navy-50)"
              >
                Previous
              </Link>
            ) : null}
            {page < pageCount ? (
              <Link
                href={`/admin/invoices?filter=${filterKey}&page=${page + 1}`}
                className="rounded-lg border border-(--color-navy-200) bg-white px-3 py-1.5 font-medium hover:bg-(--color-navy-50)"
              >
                Next
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}

      <p className="mt-4 text-xs leading-relaxed text-(--color-ink-subtle)">
        Creating and editing invoices from this screen is not yet built — see docs/STATUS.md.
        Invoices currently originate from treatment plans and are settled by verified payments.
      </p>
    </>
  );
}
