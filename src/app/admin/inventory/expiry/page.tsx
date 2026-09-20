import Link from "next/link";

import { PageHeader, StatCard } from "@/components/admin/page-header";
import { WriteOffExpiredButton } from "@/components/admin/stock-forms";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { PERMISSIONS } from "@/lib/rbac";
import { formatClinicDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { requireStaffPage } from "@/server/auth/guards";
import { staffCan } from "@/server/auth/session";
import { getExpiringBatches } from "@/server/inventory/queries";

export const dynamic = "force-dynamic";

const WINDOW_DAYS = 120;

/**
 * Expiry board.
 *
 * Ordered soonest-first and deliberately not filtered down to the expired rows:
 * the batches worth acting on are the ones with a few weeks left, where the
 * clinic can still use them. By the time a row turns red the money is gone.
 */
export default async function ExpiryPage() {
  const principal = await requireStaffPage(PERMISSIONS.INVENTORY_VIEW);
  const canAdjust = staffCan(principal, PERMISSIONS.INVENTORY_ADJUST);

  const batches = await getExpiringBatches(WINDOW_DAYS);

  const expired = batches.filter((batch) => batch.isExpired);
  const expiredUnits = expired.reduce((sum, batch) => sum + batch.quantityRemaining, 0);
  const soon = batches.filter((batch) => !batch.isExpired);
  const soonUnits = soon.reduce((sum, batch) => sum + batch.quantityRemaining, 0);

  return (
    <>
      <PageHeader
        title="Expiry"
        description={`Every batch with stock left that expires within ${WINDOW_DAYS} days, soonest first.`}
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Already expired"
          value={`${expiredUnits} units`}
          hint={`${expired.length} ${expired.length === 1 ? "batch" : "batches"}`}
          tone={expiredUnits > 0 ? "danger" : "default"}
        />
        <StatCard
          label="Expiring soon"
          value={`${soonUnits} units`}
          hint={`${soon.length} ${soon.length === 1 ? "batch" : "batches"}`}
          tone={soonUnits > 0 ? "warning" : "default"}
        />
        <StatCard label="Window" value={`${WINDOW_DAYS} days`} />
      </div>

      {canAdjust && expiredUnits > 0 ? (
        <div className="mb-6 rounded-(--radius-card) border border-red-200 bg-red-50 p-4">
          <p className="mb-3 text-sm text-red-900">
            Expired stock still counts towards what the clinic thinks it has. Writing it off records
            a reason against every batch and leaves the history intact.
          </p>
          <WriteOffExpiredButton expiredUnits={expiredUnits} />
        </div>
      ) : null}

      {batches.length === 0 ? (
        <EmptyState
          title="Nothing expiring"
          description={`No batch with stock left expires within ${WINDOW_DAYS} days.`}
        />
      ) : (
        <div className="overflow-x-auto rounded-(--radius-card) border border-(--color-hairline) bg-white">
          <table className="w-full min-w-[48rem] text-sm">
            <caption className="sr-only">Batches by expiry date</caption>
            <thead className="border-b border-(--color-hairline) bg-(--color-surface-sunken)">
              <tr>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">Item</th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">Batch / lot</th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">Expires</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Remaining</th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--color-hairline)">
              {batches.map((batch) => (
                <tr key={batch.id} className={cn(batch.isExpired && "bg-red-50/60")}>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/inventory/${batch.item.id}`}
                      className="font-medium text-(--color-action) hover:underline"
                    >
                      {batch.item.name}
                    </Link>
                    <p className="text-xs text-(--color-ink-subtle)">{batch.item.sku}</p>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {batch.batchNumber ?? batch.labelCode}
                  </td>
                  <td className="px-4 py-3">
                    {batch.expiryDate ? formatClinicDate(batch.expiryDate) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {batch.quantityRemaining} {batch.item.unit.toLowerCase()}
                  </td>
                  <td className="px-4 py-3">
                    {batch.isExpired ? (
                      <Badge tone="danger">Expired</Badge>
                    ) : batch.daysRemaining !== null && batch.daysRemaining <= 30 ? (
                      <Badge tone="warning">{batch.daysRemaining} days left</Badge>
                    ) : (
                      <Badge tone="neutral">{batch.daysRemaining} days left</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
