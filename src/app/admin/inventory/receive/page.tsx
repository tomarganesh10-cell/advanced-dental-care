import { PageHeader } from "@/components/admin/page-header";
import { ReceiveStockForm } from "@/components/admin/stock-forms";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@/lib/rbac";
import { requireStaffPage } from "@/server/auth/guards";
import { staffCan } from "@/server/auth/session";
import { getSuppliers } from "@/server/inventory/queries";

export const dynamic = "force-dynamic";

export default async function ReceiveStockPage() {
  const principal = await requireStaffPage(PERMISSIONS.INVENTORY_RECEIVE);

  const [items, suppliers] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        sku: true,
        unit: true,
        requiresBatchTracking: true,
        requiresExpiryTracking: true,
      },
    }),
    getSuppliers(),
  ]);

  return (
    <>
      <PageHeader
        title="Receive stock"
        description="Record what arrived. Each delivery becomes its own batch with its own expiry date, so stock can be traced back to the box it came out of."
      />

      <div className="max-w-3xl rounded-(--radius-card) border border-(--color-hairline) bg-white p-5">
        <ReceiveStockForm
          items={items}
          suppliers={suppliers.map((supplier) => ({ id: supplier.id, name: supplier.name }))}
          canSeeCost={staffCan(principal, PERMISSIONS.INVENTORY_VIEW_COST)}
        />
      </div>
    </>
  );
}
