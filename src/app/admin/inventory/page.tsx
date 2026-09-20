import Link from "next/link";
import { AlertTriangle, PackageX, TriangleAlert } from "lucide-react";

import { PageHeader, StatCard } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { PERMISSIONS } from "@/lib/rbac";
import { formatClinicDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { requireStaffPage } from "@/server/auth/guards";
import { staffCan } from "@/server/auth/session";
import { getCategories, getStockList, getStockSummary } from "@/server/inventory/queries";

export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "all", label: "All stock" },
  { key: "low", label: "Needs reordering" },
] as const;

function formatRupees(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; category?: string; q?: string }>;
}) {
  const principal = await requireStaffPage(PERMISSIONS.INVENTORY_VIEW);
  const params = await searchParams;

  // Cost is a separate grant: a dental assistant picks stock all day and has no
  // reason to see what the clinic pays for it.
  const includeCost = staffCan(principal, PERMISSIONS.INVENTORY_VIEW_COST);
  const canReceive = staffCan(principal, PERMISSIONS.INVENTORY_RECEIVE);
  const canLabel = staffCan(principal, PERMISSIONS.INVENTORY_LABEL);

  const filterKey = params.filter === "low" ? "low" : "all";

  const [rows, summary, categories] = await Promise.all([
    getStockList(
      {
        lowOnly: filterKey === "low",
        categoryId: params.category ?? null,
        search: params.q ?? null,
      },
      { includeCost },
    ),
    getStockSummary({ includeCost }),
    getCategories(),
  ]);

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Stock on hand by batch, with expiry dates and reorder levels. Quantities move only through recorded receipts, issues and counts."
        actions={
          <>
            {canLabel ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/inventory/labels">Print labels</Link>
              </Button>
            ) : null}
            {canReceive ? (
              <Button asChild size="sm">
                <Link href="/admin/inventory/receive">Receive stock</Link>
              </Button>
            ) : null}
          </>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Items tracked" value={summary.trackedItems} />
        <StatCard
          label="Needs reordering"
          value={summary.lowItems}
          tone={summary.lowItems > 0 ? "warning" : "default"}
          icon={<TriangleAlert aria-hidden="true" className="size-4" />}
        />
        <StatCard
          label="Out of stock"
          value={summary.outOfStockItems}
          tone={summary.outOfStockItems > 0 ? "danger" : "default"}
          icon={<PackageX aria-hidden="true" className="size-4" />}
        />
        {includeCost ? (
          <StatCard
            label="Stock value"
            value={formatRupees(summary.stockValuePaise ?? 0)}
            hint="At recorded purchase cost"
          />
        ) : (
          <StatCard
            label="Expiring soon"
            value={summary.expiringSoonUnits}
            hint="Units inside their warning window"
            tone={summary.expiringSoonUnits > 0 ? "warning" : "default"}
          />
        )}
      </div>

      {summary.expiredUnits > 0 ? (
        <div className="mb-4 flex items-start gap-3 rounded-(--radius-card) border border-red-200 bg-red-50 p-4 text-sm">
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-red-700" />
          <p className="text-red-900">
            <strong className="font-semibold">
              {summary.expiredUnits} {summary.expiredUnits === 1 ? "unit has" : "units have"} passed
              their expiry date
            </strong>{" "}
            and are still counted as on hand.{" "}
            <Link href="/admin/inventory/expiry" className="underline">
              Review and write them off
            </Link>{" "}
            so the clinic is not planning treatments around material that cannot be used.
          </p>
        </div>
      ) : null}

      <form className="mb-4 flex flex-wrap items-end gap-2" action="/admin/inventory">
        <input type="hidden" name="filter" value={filterKey} />
        <label className="flex-1 basis-56 text-sm">
          <span className="mb-1 block font-medium">Search</span>
          <input
            type="search"
            name="q"
            id="inventory-search"
            defaultValue={params.q ?? ""}
            placeholder="Name, SKU, brand or catalogue number"
            className="w-full rounded-(--radius-input) border border-(--color-navy-200) px-3 py-2"
          />
        </label>
        <label className="basis-48 text-sm">
          <span className="mb-1 block font-medium">Category</span>
          <select
            name="category"
            id="inventory-category"
            defaultValue={params.category ?? ""}
            className="w-full rounded-(--radius-input) border border-(--color-navy-200) px-3 py-2"
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="outline" size="md">
          Apply
        </Button>
      </form>

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <Link
            key={item.key}
            href={`/admin/inventory?filter=${item.key}`}
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

      {rows.length === 0 ? (
        <EmptyState
          title={filterKey === "low" ? "Nothing needs reordering" : "No stock items yet"}
          description={
            filterKey === "low"
              ? "Every tracked item is above its reorder level."
              : "Add items, then record what arrives from each supplier."
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-(--radius-card) border border-(--color-hairline) bg-white">
          <table className="w-full min-w-[56rem] text-sm">
            <caption className="sr-only">Stock on hand</caption>
            <thead className="border-b border-(--color-hairline) bg-(--color-surface-sunken)">
              <tr>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">
                  Item
                </th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">
                  Category
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">
                  On hand
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">
                  Reorder at
                </th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">
                  Next expiry
                </th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--color-hairline)">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-(--color-navy-50)/50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/inventory/${row.id}`}
                      className="font-medium text-(--color-action) hover:underline"
                    >
                      {row.name}
                    </Link>
                    <p className="text-xs text-(--color-ink-subtle)">
                      {row.sku}
                      {row.brand ? ` · ${row.brand}` : ""}
                      {row.storageLocation ? ` · ${row.storageLocation}` : ""}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-(--color-ink-muted)">{row.categoryName}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <span className={cn("font-medium", row.isOutOfStock && "text-red-700")}>
                      {row.onHand}
                    </span>
                    <span className="ml-1 text-xs text-(--color-ink-subtle)">
                      {row.unit.toLowerCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-(--color-ink-muted)">
                    {row.reorderLevel}
                  </td>
                  <td className="px-4 py-3 text-(--color-ink-muted)">
                    {row.nextExpiry ? formatClinicDate(row.nextExpiry) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {row.isOutOfStock ? (
                        <Badge tone="danger">Out of stock</Badge>
                      ) : row.isLow ? (
                        <Badge tone="warning">Reorder {row.reorderQuantity || ""}</Badge>
                      ) : (
                        <Badge tone="success">In stock</Badge>
                      )}
                      {row.expiredUnits > 0 ? (
                        <Badge tone="danger">{row.expiredUnits} expired</Badge>
                      ) : null}
                      {row.expiringSoon > 0 ? (
                        <Badge tone="warning">{row.expiringSoon} expiring</Badge>
                      ) : null}
                    </div>
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
