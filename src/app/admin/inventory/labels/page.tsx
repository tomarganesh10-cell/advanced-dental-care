import Link from "next/link";

import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { StockLabelSheet } from "@/components/admin/stock-label-sheet";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@/lib/rbac";
import { requireStaffPage } from "@/server/auth/guards";

export const dynamic = "force-dynamic";

/**
 * Printable stock labels.
 *
 * A label answers the question someone is holding a box to ask: what is this,
 * which batch, when does it expire, and what do I scan. The barcode carries the
 * batch's label code and nothing else — encoding the expiry date into the
 * symbol would freeze a fact that the system may later correct.
 *
 * Default selection is batches received in the last seven days, because the
 * realistic moment to print is straight after unpacking a delivery.
 */

const RECENT_DAYS = 7;

/**
 * Reads the clock and the database together, outside the component body.
 *
 * `Date.now()` in render is impure — React may re-run a render and get a
 * different answer. Everything time-dependent on this page is resolved here and
 * passed down as data.
 */
async function loadLabels(params: {
  batch?: string | string[];
  item?: string;
  all?: string;
}) {
  const now = new Date();
  const since = new Date(now.getTime() - RECENT_DAYS * 24 * 60 * 60 * 1000);

  const selected = params.batch
    ? Array.isArray(params.batch)
      ? params.batch
      : [params.batch]
    : [];

  const batches = await prisma.inventoryBatch.findMany({
    where:
      selected.length > 0
        ? { id: { in: selected } }
        : params.item
          ? { itemId: params.item, quantityRemaining: { gt: 0 } }
          : params.all === "1"
            ? { quantityRemaining: { gt: 0 }, closedAt: null }
            : { receivedAt: { gte: since } },
    orderBy: [{ receivedAt: "desc" }],
    take: 120,
    include: {
      item: { select: { name: true, sku: true, unit: true, storageLocation: true } },
      supplier: { select: { name: true } },
    },
  });

  const labels = batches.map((batch) => ({
    id: batch.id,
    labelCode: batch.labelCode,
    batchNumber: batch.batchNumber,
    expiryDate: batch.expiryDate,
    receivedAt: batch.receivedAt,
    quantityRemaining: batch.quantityRemaining,
    itemName: batch.item.name,
    sku: batch.item.sku,
    unit: batch.item.unit,
    storageLocation: batch.item.storageLocation,
    supplierName: batch.supplier?.name ?? null,
  }));

  return { labels, selectedCount: selected.length, now };
}

export default async function StockLabelsPage({
  searchParams,
}: {
  searchParams: Promise<{ batch?: string | string[]; item?: string; all?: string }>;
}) {
  await requireStaffPage(PERMISSIONS.INVENTORY_LABEL);
  const params = await searchParams;

  const { labels, selectedCount, now } = await loadLabels(params);

  const scopeLabel =
    selectedCount > 0
      ? `${selectedCount} selected ${selectedCount === 1 ? "batch" : "batches"}`
      : params.item
        ? "every batch of this item with stock"
        : params.all === "1"
          ? "every open batch"
          : `batches received in the last ${RECENT_DAYS} days`;

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title="Print stock labels"
          description={`Showing ${scopeLabel}. Print onto 70 × 37 mm labels (A4, 24 per sheet) — the sheet below is laid out to match.`}
          actions={
            <>
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/inventory/labels?all=1">All open batches</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/inventory">Back to stock</Link>
              </Button>
            </>
          }
        />

        <div className="mb-6 rounded-(--radius-card) border border-(--color-hairline) bg-(--color-surface-sunken) p-4 text-sm text-(--color-ink-muted)">
          <p className="font-medium text-(--color-ink)">Before printing</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              Set the printer to <strong>100% scale</strong>, not &ldquo;fit to page&rdquo;. A
              barcode scaled down by a few percent stops scanning reliably.
            </li>
            <li>Turn off headers and footers so nothing overlaps the top row.</li>
            <li>
              Print one test sheet on plain paper and scan it before committing a sheet of labels.
            </li>
          </ul>
        </div>
      </div>

      {labels.length === 0 ? (
        <EmptyState
          title="No batches to label"
          description={`Nothing has been received in the last ${RECENT_DAYS} days. Choose "All open batches" to print labels for everything currently in stock.`}
        />
      ) : (
        <StockLabelSheet labels={labels} now={now} />
      )}
    </>
  );
}
