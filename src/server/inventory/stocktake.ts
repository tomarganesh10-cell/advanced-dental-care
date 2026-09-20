import { prisma } from "@/lib/db";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";

import { adjustStock, type ActorRef } from "./service";

/**
 * Physical stock counts.
 *
 * The point of a count is to find the gap between what the system believes and
 * what is on the shelf, and then to *explain* it. So a count is a three-step
 * object rather than a single form: open it (which snapshots what the system
 * believes), fill in what was actually found, then apply it — which writes a
 * COUNT_CORRECTION movement for every line that differs.
 *
 * Applying is deliberately not automatic. A variance with no explanation is a
 * number someone should look at, and a system that silently rewrites its own
 * balance to match whatever was typed teaches people to trust neither.
 */

const MAX_REFERENCE_ATTEMPTS = 8;

async function generateCountReference(): Promise<string> {
  for (let attempt = 0; attempt < MAX_REFERENCE_ATTEMPTS; attempt += 1) {
    const count = await prisma.stockCount.count();
    const reference = `ADC-SC-${String(count + 1 + attempt).padStart(6, "0")}`;
    const existing = await prisma.stockCount.findUnique({
      where: { reference },
      select: { id: true },
    });
    if (!existing) return reference;
  }
  throw new Error("Could not allocate a stock count reference");
}

export interface OpenStockCountInput extends ActorRef {
  /** Narrow the count to one category. Omit to count everything. */
  categoryId?: string | null;
  scope?: string | null;
  notes?: string | null;
}

/**
 * Opens a count and snapshots the expected quantity of every batch in scope.
 *
 * The snapshot is taken once, here. Comparing against a live balance at apply
 * time would silently absorb any movement made while the shelf was being
 * counted, which is exactly the discrepancy a count exists to surface.
 */
export async function openStockCount(input: OpenStockCountInput = {}) {
  const batches = await prisma.inventoryBatch.findMany({
    where: {
      quantityRemaining: { gt: 0 },
      closedAt: null,
      item: {
        deletedAt: null,
        isActive: true,
        ...(input.categoryId ? { categoryId: input.categoryId } : {}),
      },
    },
    select: { id: true, itemId: true, quantityRemaining: true },
  });

  if (batches.length === 0) {
    throw new ValidationError("There is no stock in that scope to count.");
  }

  const reference = await generateCountReference();

  return prisma.stockCount.create({
    data: {
      reference,
      status: "IN_PROGRESS",
      scope: input.scope ?? null,
      notes: input.notes ?? null,
      countedById: input.staffId ?? null,
      lines: {
        create: batches.map((batch) => ({
          itemId: batch.itemId,
          batchId: batch.id,
          expectedQuantity: batch.quantityRemaining,
        })),
      },
    },
    include: { lines: true },
  });
}

export interface RecordCountInput {
  lineId: string;
  countedQuantity: number;
  varianceReason?: string | null;
}

/** Records what was physically found on one line. */
export async function recordCountedQuantity(input: RecordCountInput) {
  if (!Number.isInteger(input.countedQuantity) || input.countedQuantity < 0) {
    throw new ValidationError("A counted quantity must be zero or a whole number above it.");
  }

  const line = await prisma.stockCountLine.findUnique({
    where: { id: input.lineId },
    include: { stockCount: { select: { status: true } } },
  });

  if (!line) throw new NotFoundError("That count line does not exist.");
  if (line.stockCount.status !== "IN_PROGRESS") {
    throw new ConflictError("That count is no longer open.");
  }

  return prisma.stockCountLine.update({
    where: { id: input.lineId },
    data: {
      countedQuantity: input.countedQuantity,
      varianceReason: input.varianceReason?.trim() || null,
      countedAt: new Date(),
    },
  });
}

export interface ApplyStockCountResult {
  reference: string;
  linesApplied: number;
  unitsAdded: number;
  unitsRemoved: number;
  linesSkipped: number;
}

/**
 * Closes a count and reconciles the balances.
 *
 * Refuses if any line with a variance has no reason recorded — that is the
 * whole point of the exercise. Lines that were never counted are left alone
 * rather than being treated as zero, which would write off the entire shelf
 * because someone stopped halfway.
 */
export async function applyStockCount(
  stockCountId: string,
  actor: ActorRef = {},
): Promise<ApplyStockCountResult> {
  const stockCount = await prisma.stockCount.findUnique({
    where: { id: stockCountId },
    include: { lines: true },
  });

  if (!stockCount) throw new NotFoundError("That stock count does not exist.");
  if (stockCount.status !== "IN_PROGRESS") {
    throw new ConflictError("That count has already been closed.");
  }

  const counted = stockCount.lines.filter((line) => line.countedQuantity !== null);
  const skipped = stockCount.lines.length - counted.length;

  const unexplained = counted.filter(
    (line) =>
      line.countedQuantity !== line.expectedQuantity &&
      (line.varianceReason === null || line.varianceReason.trim().length < 3),
  );

  if (unexplained.length > 0) {
    throw new ValidationError(
      `${unexplained.length} ${unexplained.length === 1 ? "line differs" : "lines differ"} ` +
        "from the expected quantity without a reason. Add one before closing the count.",
      { unexplainedLineIds: unexplained.map((line) => line.id) },
    );
  }

  let linesApplied = 0;
  let unitsAdded = 0;
  let unitsRemoved = 0;

  for (const line of counted) {
    const delta = (line.countedQuantity ?? 0) - line.expectedQuantity;
    if (delta === 0 || line.batchId === null) continue;

    await adjustStock({
      batchId: line.batchId,
      delta,
      type: "COUNT_CORRECTION",
      reason: line.varianceReason ?? `Stock count ${stockCount.reference}`,
      stockCountId: stockCount.id,
      staffId: actor.staffId ?? null,
    });

    linesApplied += 1;
    if (delta > 0) unitsAdded += delta;
    else unitsRemoved += -delta;
  }

  await prisma.stockCount.update({
    where: { id: stockCount.id },
    data: { status: "COMPLETED", completedAt: new Date() },
  });

  return {
    reference: stockCount.reference,
    linesApplied,
    unitsAdded,
    unitsRemoved,
    linesSkipped: skipped,
  };
}

export async function cancelStockCount(stockCountId: string) {
  const stockCount = await prisma.stockCount.findUnique({
    where: { id: stockCountId },
    select: { id: true, status: true },
  });

  if (!stockCount) throw new NotFoundError("That stock count does not exist.");
  if (stockCount.status === "COMPLETED") {
    throw new ConflictError("A completed count cannot be cancelled — its corrections are applied.");
  }

  return prisma.stockCount.update({
    where: { id: stockCount.id },
    data: { status: "CANCELLED", completedAt: new Date() },
  });
}

export async function getStockCount(stockCountId: string) {
  const stockCount = await prisma.stockCount.findUnique({
    where: { id: stockCountId },
    include: {
      countedBy: { select: { id: true, fullName: true } },
      lines: {
        include: {
          item: { select: { id: true, sku: true, name: true, unit: true } },
          batch: { select: { id: true, labelCode: true, batchNumber: true, expiryDate: true } },
        },
        orderBy: { item: { name: "asc" } },
      },
    },
  });

  if (!stockCount) throw new NotFoundError("That stock count does not exist.");

  return {
    ...stockCount,
    lines: stockCount.lines.map((line) => ({
      ...line,
      variance:
        line.countedQuantity === null ? null : line.countedQuantity - line.expectedQuantity,
    })),
  };
}

export async function listStockCounts(limit = 25) {
  return prisma.stockCount.findMany({
    orderBy: { startedAt: "desc" },
    take: limit,
    include: {
      countedBy: { select: { fullName: true } },
      _count: { select: { lines: true } },
    },
  });
}
