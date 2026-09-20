import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader, StatCard } from "@/components/admin/page-header";
import { AdjustBatchForm, IssueStockForm } from "@/components/admin/stock-forms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NotFoundError } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/rbac";
import { formatClinicDate, formatClinicDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { requireStaffPage } from "@/server/auth/guards";
import { staffCan } from "@/server/auth/session";
import { getItemDetail } from "@/server/inventory/queries";

export const dynamic = "force-dynamic";

const MOVEMENT_LABELS: Record<string, string> = {
  RECEIPT: "Received",
  ISSUE: "Issued",
  RETURN: "Returned",
  ADJUSTMENT: "Correction",
  WASTAGE: "Wastage",
  EXPIRY_WRITE_OFF: "Expired",
  COUNT_CORRECTION: "Stock count",
};

function formatRupees(paise: number | null | undefined): string {
  if (paise === null || paise === undefined) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

/** Resolves the clock once, outside render. */
async function loadItem(itemId: string, includeCost: boolean) {
  const item = await getItemDetail(itemId, { includeCost });
  return { item, now: new Date() };
}

export default async function InventoryItemPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const principal = await requireStaffPage(PERMISSIONS.INVENTORY_VIEW);
  const { itemId } = await params;

  const includeCost = staffCan(principal, PERMISSIONS.INVENTORY_VIEW_COST);
  const canIssue = staffCan(principal, PERMISSIONS.INVENTORY_ISSUE);
  const canAdjust = staffCan(principal, PERMISSIONS.INVENTORY_ADJUST);
  const canLabel = staffCan(principal, PERMISSIONS.INVENTORY_LABEL);

  let loaded;
  try {
    loaded = await loadItem(itemId, includeCost);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const { item, now } = loaded;
  const openBatches = item.batches.filter((batch) => batch.quantityRemaining > 0);

  return (
    <>
      <PageHeader
        title={item.name}
        description={`${item.sku}${item.brand ? ` · ${item.brand}` : ""}${
          item.storageLocation ? ` · ${item.storageLocation}` : ""
        }`}
        actions={
          <>
            {canLabel ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/admin/inventory/labels?item=${item.id}`}>Print labels</Link>
              </Button>
            ) : null}
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/inventory">Back to stock</Link>
            </Button>
          </>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="On hand"
          value={`${item.onHand} ${item.unit.toLowerCase()}`}
          tone={item.onHand === 0 ? "danger" : item.onHand <= item.reorderLevel ? "warning" : "default"}
        />
        <StatCard label="Reorder at" value={item.reorderLevel} hint={`Order ${item.reorderQuantity}`} />
        <StatCard label="Open batches" value={openBatches.length} />
        <StatCard
          label="Traceability"
          value={item.requiresBatchTracking ? "Batch-tracked" : "Not tracked"}
          hint={item.requiresExpiryTracking ? "Expiry recorded" : "No expiry"}
        />
      </div>

      {canIssue ? (
        <section className="mb-6 rounded-(--radius-card) border border-(--color-hairline) bg-white p-5">
          <h2 className="mb-3 text-base font-semibold">Issue stock</h2>
          <IssueStockForm
            itemId={item.id}
            unit={item.unit}
            batches={openBatches.map((batch) => ({
              id: batch.id,
              labelCode: batch.labelCode,
              batchNumber: batch.batchNumber,
              remaining: batch.quantityRemaining,
            }))}
          />
          <p className="mt-3 text-xs text-(--color-ink-subtle)">
            Leaving the batch on &ldquo;earliest expiry first&rdquo; is almost always right — it
            uses the stock that would otherwise be thrown away.
          </p>
        </section>
      ) : null}

      <section className="mb-8">
        <h2 className="mb-3 text-base font-semibold">Batches</h2>
        {item.batches.length === 0 ? (
          <p className="rounded-(--radius-card) border border-(--color-hairline) bg-white p-5 text-sm text-(--color-ink-muted)">
            Nothing has been received for this item yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-(--radius-card) border border-(--color-hairline) bg-white">
            <table className="w-full min-w-[52rem] text-sm">
              <caption className="sr-only">Batches of {item.name}</caption>
              <thead className="border-b border-(--color-hairline) bg-(--color-surface-sunken)">
                <tr>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">Label</th>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">Batch / lot</th>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">Expires</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Remaining</th>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">Supplier</th>
                  {includeCost ? (
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">Unit cost</th>
                  ) : null}
                  {canAdjust ? <th scope="col" className="px-4 py-2.5" /> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-(--color-hairline)">
                {item.batches.map((batch) => {
                  const expired = batch.expiryDate !== null && batch.expiryDate < now;

                  return (
                    <tr key={batch.id} className={cn(expired && "bg-red-50/60")}>
                      <td className="px-4 py-3 font-mono text-xs">{batch.labelCode}</td>
                      <td className="px-4 py-3">{batch.batchNumber ?? "—"}</td>
                      <td className="px-4 py-3">
                        {batch.expiryDate ? (
                          <span className={cn(expired && "font-semibold text-red-700")}>
                            {formatClinicDate(batch.expiryDate)}
                            {expired ? " · expired" : ""}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {batch.quantityRemaining}
                        <span className="text-(--color-ink-subtle)"> / {batch.quantityReceived}</span>
                      </td>
                      <td className="px-4 py-3 text-(--color-ink-muted)">
                        {batch.supplierName ?? "—"}
                        {batch.invoiceRef ? (
                          <span className="block text-xs">{batch.invoiceRef}</span>
                        ) : null}
                      </td>
                      {includeCost ? (
                        <td className="px-4 py-3 text-right tabular-nums">
                          {formatRupees(batch.unitCostPaise)}
                        </td>
                      ) : null}
                      {canAdjust ? (
                        <td className="px-4 py-3">
                          {batch.quantityRemaining > 0 ? (
                            <AdjustBatchForm
                              batchId={batch.id}
                              itemId={item.id}
                              remaining={batch.quantityRemaining}
                            />
                          ) : (
                            <Badge tone="neutral">Closed</Badge>
                          )}
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold">Movement history</h2>
        <p className="mb-3 text-sm text-(--color-ink-muted)">
          Every change to this item&rsquo;s balance, most recent first. Nothing edits these rows —
          a mistake is corrected by another movement, so the history stays true.
        </p>

        {item.movements.length === 0 ? (
          <p className="rounded-(--radius-card) border border-(--color-hairline) bg-white p-5 text-sm text-(--color-ink-muted)">
            No movements recorded.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-(--radius-card) border border-(--color-hairline) bg-white">
            <table className="w-full min-w-[52rem] text-sm">
              <caption className="sr-only">Stock movements for {item.name}</caption>
              <thead className="border-b border-(--color-hairline) bg-(--color-surface-sunken)">
                <tr>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">When</th>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">What</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Change</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Balance</th>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">Batch</th>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">By</th>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-(--color-hairline)">
                {item.movements.map((movement) => (
                  <tr key={movement.id}>
                    <td className="px-4 py-3 whitespace-nowrap text-(--color-ink-muted)">
                      {formatClinicDateTime(movement.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      {MOVEMENT_LABELS[movement.type] ?? movement.type}
                      {movement.appointmentReference ? (
                        <span className="block text-xs text-(--color-ink-subtle)">
                          {movement.appointmentReference}
                        </span>
                      ) : null}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 text-right font-medium tabular-nums",
                        movement.quantity < 0 ? "text-red-700" : "text-(--color-teal-800)",
                      )}
                    >
                      {movement.quantity > 0 ? `+${movement.quantity}` : movement.quantity}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{movement.balanceAfter}</td>
                    <td className="px-4 py-3 font-mono text-xs text-(--color-ink-muted)">
                      {movement.batchNumber ?? movement.batchLabel ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-(--color-ink-muted)">
                      {movement.performedBy ?? "System"}
                    </td>
                    <td className="px-4 py-3 text-(--color-ink-muted)">
                      {movement.reason ?? movement.notes ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
