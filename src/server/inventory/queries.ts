import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";

/**
 * Inventory reads.
 *
 * Purchase cost is gated on a separate permission from stock level, so every
 * function that can return money takes an explicit `includeCost` flag and omits
 * the fields entirely when it is false. Returning them and hiding them in the
 * component would put the clinic's margins one devtools panel away from anyone
 * who can see the stock list.
 */

export interface StockListRow {
  id: string;
  sku: string;
  name: string;
  brand: string | null;
  categoryName: string;
  unit: string;
  storageLocation: string | null;
  onHand: number;
  reorderLevel: number;
  reorderQuantity: number;
  /** Below the reorder level, including zero. */
  isLow: boolean;
  isOutOfStock: boolean;
  /** Earliest expiry among batches that still have stock. */
  nextExpiry: Date | null;
  /** Units in batches expiring inside the item's warning window. */
  expiringSoon: number;
  expiredUnits: number;
  /** Only present with the cost permission. */
  stockValuePaise?: number;
}

export interface StockListFilters {
  categoryId?: string | null;
  search?: string | null;
  /** Only items at or below their reorder level. */
  lowOnly?: boolean;
  includeInactive?: boolean;
}

export async function getStockList(
  filters: StockListFilters = {},
  options: { includeCost?: boolean } = {},
): Promise<StockListRow[]> {
  const now = new Date();

  const items = await prisma.inventoryItem.findMany({
    where: {
      deletedAt: null,
      ...(filters.includeInactive ? {} : { isActive: true }),
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
      ...(filters.search
        ? {
            OR: [
              { name: { contains: filters.search, mode: "insensitive" as const } },
              { sku: { contains: filters.search, mode: "insensitive" as const } },
              { brand: { contains: filters.search, mode: "insensitive" as const } },
              { manufacturerRef: { contains: filters.search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    include: {
      category: { select: { name: true } },
      batches: {
        where: { quantityRemaining: { gt: 0 } },
        select: { quantityRemaining: true, expiryDate: true, unitCostPaise: true },
      },
    },
    orderBy: [{ category: { position: "asc" } }, { name: "asc" }],
  });

  const rows = items.map((item): StockListRow => {
    const warningMs = item.expiryWarningDays * 24 * 60 * 60 * 1000;
    const warnBefore = new Date(now.getTime() + warningMs);

    let onHand = 0;
    let expiringSoon = 0;
    let expiredUnits = 0;
    let valuePaise = 0;
    let nextExpiry: Date | null = null;

    for (const batch of item.batches) {
      onHand += batch.quantityRemaining;
      valuePaise += batch.quantityRemaining * (batch.unitCostPaise ?? 0);

      if (batch.expiryDate) {
        if (batch.expiryDate < now) {
          expiredUnits += batch.quantityRemaining;
        } else if (batch.expiryDate <= warnBefore) {
          expiringSoon += batch.quantityRemaining;
        }

        if (nextExpiry === null || batch.expiryDate < nextExpiry) {
          nextExpiry = batch.expiryDate;
        }
      }
    }

    const row: StockListRow = {
      id: item.id,
      sku: item.sku,
      name: item.name,
      brand: item.brand,
      categoryName: item.category.name,
      unit: item.unit,
      storageLocation: item.storageLocation,
      onHand,
      reorderLevel: item.reorderLevel,
      reorderQuantity: item.reorderQuantity,
      isLow: onHand <= item.reorderLevel,
      isOutOfStock: onHand === 0,
      nextExpiry,
      expiringSoon,
      expiredUnits,
    };

    if (options.includeCost) row.stockValuePaise = valuePaise;

    return row;
  });

  return filters.lowOnly ? rows.filter((row) => row.isLow) : rows;
}

export interface StockSummary {
  trackedItems: number;
  lowItems: number;
  outOfStockItems: number;
  expiringSoonUnits: number;
  expiredUnits: number;
  stockValuePaise?: number;
}

export async function getStockSummary(
  options: { includeCost?: boolean } = {},
): Promise<StockSummary> {
  const rows = await getStockList({}, { includeCost: options.includeCost });

  const summary: StockSummary = {
    trackedItems: rows.length,
    lowItems: rows.filter((row) => row.isLow).length,
    outOfStockItems: rows.filter((row) => row.isOutOfStock).length,
    expiringSoonUnits: rows.reduce((sum, row) => sum + row.expiringSoon, 0),
    expiredUnits: rows.reduce((sum, row) => sum + row.expiredUnits, 0),
  };

  if (options.includeCost) {
    summary.stockValuePaise = rows.reduce((sum, row) => sum + (row.stockValuePaise ?? 0), 0);
  }

  return summary;
}

export async function getItemDetail(itemId: string, options: { includeCost?: boolean } = {}) {
  const item = await prisma.inventoryItem.findFirst({
    where: { id: itemId, deletedAt: null },
    include: {
      category: { select: { id: true, name: true } },
      supplier: { select: { id: true, name: true } },
      batches: {
        orderBy: [{ expiryDate: { sort: "asc", nulls: "last" } }, { receivedAt: "asc" }],
        include: { supplier: { select: { id: true, name: true } } },
      },
      movements: {
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          performedBy: { select: { id: true, fullName: true } },
          batch: { select: { id: true, labelCode: true, batchNumber: true } },
          appointment: { select: { id: true, reference: true } },
        },
      },
    },
  });

  if (!item) throw new NotFoundError("That stock item does not exist.");

  const batches = item.batches.map((batch) => ({
    id: batch.id,
    labelCode: batch.labelCode,
    batchNumber: batch.batchNumber,
    expiryDate: batch.expiryDate,
    quantityReceived: batch.quantityReceived,
    quantityRemaining: batch.quantityRemaining,
    receivedAt: batch.receivedAt,
    closedAt: batch.closedAt,
    supplierName: batch.supplier?.name ?? null,
    invoiceRef: batch.invoiceRef,
    ...(options.includeCost ? { unitCostPaise: batch.unitCostPaise } : {}),
  }));

  return {
    id: item.id,
    sku: item.sku,
    name: item.name,
    brand: item.brand,
    description: item.description,
    manufacturerRef: item.manufacturerRef,
    unit: item.unit,
    storageLocation: item.storageLocation,
    reorderLevel: item.reorderLevel,
    reorderQuantity: item.reorderQuantity,
    requiresBatchTracking: item.requiresBatchTracking,
    requiresExpiryTracking: item.requiresExpiryTracking,
    expiryWarningDays: item.expiryWarningDays,
    isActive: item.isActive,
    category: item.category,
    supplier: item.supplier,
    onHand: batches.reduce((sum, batch) => sum + batch.quantityRemaining, 0),
    batches,
    movements: item.movements.map((movement) => ({
      id: movement.id,
      type: movement.type,
      quantity: movement.quantity,
      balanceAfter: movement.balanceAfter,
      reason: movement.reason,
      notes: movement.notes,
      createdAt: movement.createdAt,
      performedBy: movement.performedBy?.fullName ?? null,
      batchLabel: movement.batch?.labelCode ?? null,
      batchNumber: movement.batch?.batchNumber ?? null,
      appointmentReference: movement.appointment?.reference ?? null,
    })),
  };
}

/** Looks a batch up by the code printed on its label. What a scanner submits. */
export async function findBatchByLabel(labelCode: string) {
  const batch = await prisma.inventoryBatch.findUnique({
    where: { labelCode: labelCode.trim().toUpperCase() },
    include: {
      item: { select: { id: true, sku: true, name: true, unit: true, storageLocation: true } },
      supplier: { select: { name: true } },
    },
  });

  if (!batch) return null;

  return {
    id: batch.id,
    labelCode: batch.labelCode,
    batchNumber: batch.batchNumber,
    expiryDate: batch.expiryDate,
    quantityRemaining: batch.quantityRemaining,
    isExpired: batch.expiryDate ? batch.expiryDate < new Date() : false,
    item: batch.item,
    supplierName: batch.supplier?.name ?? null,
  };
}

/** Batches expiring inside the window, soonest first. Drives the expiry board. */
export async function getExpiringBatches(withinDays = 90) {
  const cutoff = new Date(Date.now() + withinDays * 24 * 60 * 60 * 1000);

  const batches = await prisma.inventoryBatch.findMany({
    where: {
      quantityRemaining: { gt: 0 },
      closedAt: null,
      expiryDate: { not: null, lte: cutoff },
    },
    orderBy: { expiryDate: "asc" },
    include: { item: { select: { id: true, sku: true, name: true, unit: true } } },
  });

  const now = new Date();

  return batches.map((batch) => ({
    id: batch.id,
    labelCode: batch.labelCode,
    batchNumber: batch.batchNumber,
    expiryDate: batch.expiryDate,
    quantityRemaining: batch.quantityRemaining,
    isExpired: batch.expiryDate !== null && batch.expiryDate < now,
    daysRemaining:
      batch.expiryDate === null
        ? null
        : Math.floor((batch.expiryDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
    item: batch.item,
  }));
}

/**
 * Every patient who received stock from a batch.
 *
 * The question a recall notice asks. It reads the movement ledger rather than
 * the batch, because the batch may be long exhausted by the time a notice
 * arrives.
 */
export async function getBatchRecipients(batchId: string) {
  const movements = await prisma.stockMovement.findMany({
    where: { batchId, type: "ISSUE" },
    orderBy: { createdAt: "asc" },
    include: {
      patient: { select: { id: true, patientNumber: true, fullName: true, phone: true } },
      appointment: { select: { id: true, reference: true, startsAt: true } },
    },
  });

  return movements.map((movement) => ({
    movementId: movement.id,
    quantity: Math.abs(movement.quantity),
    usedAt: movement.createdAt,
    patient: movement.patient,
    appointment: movement.appointment,
  }));
}

export async function getCategories() {
  return prisma.inventoryCategory.findMany({ orderBy: [{ position: "asc" }, { name: "asc" }] });
}

export async function getSuppliers(includeInactive = false) {
  return prisma.supplier.findMany({
    where: { deletedAt: null, ...(includeInactive ? {} : { isActive: true }) },
    orderBy: { name: "asc" },
  });
}

/**
 * Number of active items at or below their reorder level.
 *
 * One aggregate query rather than `getStockList().filter()`, because this runs
 * on every admin page load to render a sidebar badge. Loading every batch of
 * every item to produce a single integer is the kind of thing that makes an
 * admin panel feel slow for no visible reason.
 */
export async function getLowStockCount(): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT count(*)::int AS count
    FROM (
      SELECT i.id
      FROM inventory_items i
      LEFT JOIN inventory_batches b
        ON b."itemId" = i.id AND b."quantityRemaining" > 0
      WHERE i."deletedAt" IS NULL AND i."isActive" = true
      GROUP BY i.id, i."reorderLevel"
      HAVING COALESCE(SUM(b."quantityRemaining"), 0) <= i."reorderLevel"
    ) low
  `;

  return rows[0]?.count ?? 0;
}
