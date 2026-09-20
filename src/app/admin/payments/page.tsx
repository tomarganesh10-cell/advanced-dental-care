import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { PageHeader, StatCard } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { prisma, type Prisma } from "@/lib/db";
import type { PaymentStatus } from "@/lib/db";
import { PERMISSIONS } from "@/lib/rbac";
import { formatClinicDateTime } from "@/lib/time";
import { cn, formatPaise } from "@/lib/utils";
import { requireStaffPage } from "@/server/auth/guards";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 40;

const STATUS_TONES: Record<PaymentStatus, "neutral" | "info" | "success" | "warning" | "danger"> = {
  CREATED: "neutral",
  PENDING: "warning",
  SUCCESS: "success",
  FAILED: "danger",
  REFUNDED: "info",
  PARTIALLY_REFUNDED: "info",
};

const FILTERS: Array<{ key: string; label: string; statuses?: PaymentStatus[] }> = [
  { key: "successful", label: "Successful", statuses: ["SUCCESS"] },
  { key: "attention", label: "Needs attention", statuses: ["FAILED", "PENDING"] },
  { key: "refunds", label: "Refunds", statuses: ["REFUNDED", "PARTIALLY_REFUNDED"] },
  { key: "all", label: "All" },
];

async function loadPayments(filterKey: string, page: number) {
  const filter = FILTERS.find((f) => f.key === filterKey) ?? FILTERS[0]!;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const where: Prisma.PaymentWhereInput = filter.statuses
    ? { status: { in: filter.statuses } }
    : {};

  const [payments, total, monthTotal, failedCount, unreconciled] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        reference: true,
        amountPaise: true,
        status: true,
        method: true,
        verifiedAt: true,
        paidAt: true,
        failureReason: true,
        createdAt: true,
        gatewayPaymentId: true,
        patient: { select: { id: true, fullName: true } },
        invoice: { select: { id: true, number: true } },
      },
    }),
    prisma.payment.count({ where }),
    prisma.payment.aggregate({
      where: { status: "SUCCESS", verifiedAt: { not: null }, paidAt: { gte: monthStart } },
      _sum: { amountPaise: true },
      _count: { _all: true },
    }),
    prisma.payment.count({ where: { status: "FAILED" } }),
    /**
     * A payment the gateway gave an id for but which never verified. This is
     * the row that means money may have moved without settling, and it is the
     * one worth alerting on.
     */
    prisma.payment.count({
      where: { status: { not: "SUCCESS" }, gatewayPaymentId: { not: null } },
    }),
  ]);

  return {
    payments,
    total,
    monthPaise: monthTotal._sum.amountPaise ?? 0,
    monthCount: monthTotal._count._all,
    failedCount,
    unreconciled,
  };
}

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; page?: string }>;
}) {
  await requireStaffPage(PERMISSIONS.PAYMENT_VIEW);
  const params = await searchParams;

  const filterKey = params.filter ?? "successful";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const { payments, total, monthPaise, monthCount, failedCount, unreconciled } = await loadPayments(
    filterKey,
    page,
  );

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader title="Payments" description="Only server-verified payments count as received." />

      {unreconciled > 0 ? (
        <div className="mb-5 flex items-start gap-3 rounded-(--radius-card) border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden="true" />
          <div className="text-sm text-amber-900">
            <p className="font-semibold text-amber-950">
              {unreconciled} payment{unreconciled === 1 ? "" : "s"} carry a gateway reference but
              never verified
            </p>
            <p className="mt-1">
              Money may have left the patient&apos;s account without being recorded as received.
              Check each against the Razorpay dashboard before telling a patient their payment
              failed.
            </p>
          </div>
        </div>
      ) : null}

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Received this month"
          value={formatPaise(monthPaise)}
          hint={`${monthCount} payment${monthCount === 1 ? "" : "s"}`}
          tone="success"
        />
        <StatCard
          label="Failed"
          value={failedCount}
          tone={failedCount > 0 ? "warning" : "default"}
        />
        <StatCard label="In this view" value={total} />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <Link
            key={item.key}
            href={`/admin/payments?filter=${item.key}`}
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

      {payments.length === 0 ? (
        <EmptyState title="No payments in this view" />
      ) : (
        <div className="overflow-x-auto rounded-(--radius-card) border border-(--color-hairline) bg-white">
          <table className="w-full min-w-[48rem] text-sm">
            <caption className="sr-only">Payments</caption>
            <thead className="border-b border-(--color-hairline) bg-(--color-surface-sunken)">
              <tr>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">
                  Reference
                </th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">
                  Patient
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">
                  Amount
                </th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">
                  Method
                </th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">
                  Verified
                </th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--color-hairline)">
              {payments.map((payment) => (
                <tr key={payment.id}>
                  <td className="px-4 py-2.5 font-medium tabular-nums">
                    {payment.reference}
                    {payment.invoice ? (
                      <span className="block text-xs text-(--color-ink-subtle)">
                        {payment.invoice.number}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5">
                    {payment.patient ? (
                      <Link
                        href={`/admin/patients/${payment.patient.id}`}
                        className="text-(--color-action) hover:underline"
                      >
                        {payment.patient.fullName}
                      </Link>
                    ) : (
                      <span className="text-(--color-ink-subtle)">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                    {formatPaise(payment.amountPaise)}
                  </td>
                  <td className="px-4 py-2.5 text-(--color-ink-muted)">
                    {payment.method.toLowerCase().replace(/_/g, " ")}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-(--color-ink-subtle)">
                    {payment.verifiedAt ? (
                      formatClinicDateTime(payment.verifiedAt)
                    ) : (
                      <span className="text-(--color-danger)">Not verified</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={STATUS_TONES[payment.status]}>
                      {payment.status.toLowerCase().replace(/_/g, " ")}
                    </Badge>
                    {payment.failureReason ? (
                      <span className="mt-1 block max-w-[14rem] text-xs text-(--color-ink-subtle)">
                        {payment.failureReason}
                      </span>
                    ) : null}
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
                href={`/admin/payments?filter=${filterKey}&page=${page - 1}`}
                className="rounded-lg border border-(--color-navy-200) bg-white px-3 py-1.5 font-medium hover:bg-(--color-navy-50)"
              >
                Previous
              </Link>
            ) : null}
            {page < pageCount ? (
              <Link
                href={`/admin/payments?filter=${filterKey}&page=${page + 1}`}
                className="rounded-lg border border-(--color-navy-200) bg-white px-3 py-1.5 font-medium hover:bg-(--color-navy-50)"
              >
                Next
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}

      <p className="mt-4 text-xs leading-relaxed text-(--color-ink-subtle)">
        A payment counts as received only once the signature has been verified server-side and
        Razorpay has independently confirmed the capture. The <strong>Verified</strong> column is
        what reports total, not the status.
      </p>
    </>
  );
}
