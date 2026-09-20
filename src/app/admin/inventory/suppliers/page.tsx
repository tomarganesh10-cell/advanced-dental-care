import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@/lib/rbac";
import { requireStaffPage } from "@/server/auth/guards";
import { staffCan } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  const principal = await requireStaffPage(PERMISSIONS.SUPPLIER_VIEW);
  const includeCost = staffCan(principal, PERMISSIONS.INVENTORY_VIEW_COST);

  const suppliers = await prisma.supplier.findMany({
    where: { deletedAt: null },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: {
      _count: { select: { items: true, batches: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="Suppliers"
        description="Who the clinic buys from. A batch records the supplier it actually arrived from, which is what makes a recall notice traceable in both directions."
      />

      {suppliers.length === 0 ? (
        <EmptyState
          title="No suppliers recorded"
          description="Add a supplier so deliveries can be reconciled against their invoices."
        />
      ) : (
        <div className="overflow-x-auto rounded-(--radius-card) border border-(--color-hairline) bg-white">
          <table className="w-full min-w-[44rem] text-sm">
            <caption className="sr-only">Suppliers</caption>
            <thead className="border-b border-(--color-hairline) bg-(--color-surface-sunken)">
              <tr>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">Supplier</th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">Contact</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Items</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Deliveries</th>
                {includeCost ? (
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">GSTIN</th>
                ) : null}
                <th scope="col" className="px-4 py-2.5 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--color-hairline)">
              {suppliers.map((supplier) => (
                <tr key={supplier.id}>
                  <td className="px-4 py-3">
                    <span className="font-medium">{supplier.name}</span>
                    <p className="font-mono text-xs text-(--color-ink-subtle)">{supplier.code}</p>
                  </td>
                  <td className="px-4 py-3 text-(--color-ink-muted)">
                    {supplier.contactName ?? "—"}
                    {supplier.phone ? <span className="block text-xs">{supplier.phone}</span> : null}
                    {supplier.email ? <span className="block text-xs">{supplier.email}</span> : null}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{supplier._count.items}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{supplier._count.batches}</td>
                  {includeCost ? (
                    <td className="px-4 py-3 font-mono text-xs text-(--color-ink-muted)">
                      {supplier.gstin ?? "—"}
                    </td>
                  ) : null}
                  <td className="px-4 py-3">
                    {supplier.isActive ? (
                      <Badge tone="success">Active</Badge>
                    ) : (
                      <Badge tone="neutral">Inactive</Badge>
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
