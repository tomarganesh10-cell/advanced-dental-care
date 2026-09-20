import Link from "next/link";

import { PageHeader } from "@/components/admin/page-header";
import { ApplyStockCountForm, CountLineForm, OpenStockCountForm } from "@/components/admin/stock-count-forms";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { PERMISSIONS } from "@/lib/rbac";
import { formatClinicDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { requireStaffPage } from "@/server/auth/guards";
import { getCategories } from "@/server/inventory/queries";
import { getStockCount, listStockCounts } from "@/server/inventory/stocktake";

export const dynamic = "force-dynamic";

/**
 * Stock counts.
 *
 * One open count at a time is the realistic workflow for a single-site clinic,
 * so the most recent open count is expanded inline rather than living behind
 * another click.
 */
export default async function StockCountsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  await requireStaffPage(PERMISSIONS.INVENTORY_COUNT);
  const params = await searchParams;

  const [counts, categories] = await Promise.all([listStockCounts(), getCategories()]);

  const openCount = counts.find((count) => count.status === "IN_PROGRESS");
  const selectedId = params.id ?? openCount?.id ?? null;
  const detail = selectedId ? await getStockCount(selectedId) : null;

  return (
    <>
      <PageHeader
        title="Stock counts"
        description="Count what is physically on the shelf, then reconcile. A line that differs from the expected quantity needs a reason before the count can be closed."
      />

      {!openCount ? (
        <div className="mb-8 rounded-(--radius-card) border border-(--color-hairline) bg-white p-5">
          <h2 className="mb-3 text-base font-semibold">Open a new count</h2>
          <OpenStockCountForm categories={categories.map((c) => ({ id: c.id, name: c.name }))} />
        </div>
      ) : null}

      {detail ? (
        <section className="mb-8">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">
                {detail.reference}{" "}
                <Badge tone={detail.status === "IN_PROGRESS" ? "warning" : "success"}>
                  {detail.status === "IN_PROGRESS" ? "Open" : detail.status.toLowerCase()}
                </Badge>
              </h2>
              <p className="text-sm text-(--color-ink-muted)">
                {detail.scope ?? "Everything in stock"} · started{" "}
                {formatClinicDateTime(detail.startedAt)}
                {detail.countedBy ? ` by ${detail.countedBy.fullName}` : ""}
              </p>
            </div>
            {detail.status === "IN_PROGRESS" ? (
              <ApplyStockCountForm stockCountId={detail.id} />
            ) : null}
          </div>

          <div className="overflow-x-auto rounded-(--radius-card) border border-(--color-hairline) bg-white">
            <table className="w-full min-w-[52rem] text-sm">
              <caption className="sr-only">Count lines for {detail.reference}</caption>
              <thead className="border-b border-(--color-hairline) bg-(--color-surface-sunken)">
                <tr>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">Item</th>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">Batch</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Expected</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Variance</th>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">Counted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-(--color-hairline)">
                {detail.lines.map((line) => (
                  <tr
                    key={line.id}
                    className={cn(line.variance !== null && line.variance !== 0 && "bg-amber-50/60")}
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/inventory/${line.item.id}`}
                        className="font-medium text-(--color-action) hover:underline"
                      >
                        {line.item.name}
                      </Link>
                      <p className="text-xs text-(--color-ink-subtle)">{line.item.sku}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {line.batch?.batchNumber ?? line.batch?.labelCode ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{line.expectedQuantity}</td>
                    <td
                      className={cn(
                        "px-4 py-3 text-right font-medium tabular-nums",
                        line.variance !== null && line.variance < 0 && "text-red-700",
                        line.variance !== null && line.variance > 0 && "text-(--color-teal-800)",
                      )}
                    >
                      {line.variance === null
                        ? "—"
                        : line.variance > 0
                          ? `+${line.variance}`
                          : line.variance}
                    </td>
                    <td className="px-4 py-3">
                      {detail.status === "IN_PROGRESS" ? (
                        <CountLineForm
                          lineId={line.id}
                          expected={line.expectedQuantity}
                          counted={line.countedQuantity}
                          varianceReason={line.varianceReason}
                        />
                      ) : (
                        <>
                          <span className="tabular-nums">{line.countedQuantity ?? "not counted"}</span>
                          {line.varianceReason ? (
                            <p className="text-xs text-(--color-ink-subtle)">{line.varianceReason}</p>
                          ) : null}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 text-base font-semibold">Previous counts</h2>
        {counts.length === 0 ? (
          <EmptyState
            title="No counts yet"
            description="Open one to snapshot what the system believes, then count the shelf against it."
          />
        ) : (
          <ul className="divide-y divide-(--color-hairline) rounded-(--radius-card) border border-(--color-hairline) bg-white">
            {counts.map((count) => (
              <li key={count.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <Link
                    href={`/admin/inventory/counts?id=${count.id}`}
                    className="font-medium text-(--color-action) hover:underline"
                  >
                    {count.reference}
                  </Link>
                  <p className="text-xs text-(--color-ink-subtle)">
                    {count._count.lines} lines · {formatClinicDateTime(count.startedAt)}
                    {count.countedBy ? ` · ${count.countedBy.fullName}` : ""}
                  </p>
                </div>
                <Badge
                  tone={
                    count.status === "COMPLETED"
                      ? "success"
                      : count.status === "IN_PROGRESS"
                        ? "warning"
                        : "neutral"
                  }
                >
                  {count.status.replace("_", " ").toLowerCase()}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
