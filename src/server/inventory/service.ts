import { Prisma } from "@/generated/prisma/client";
import type { StockMovementType } from "@/generated/prisma/enums";

import { prisma } from "@/lib/db";
import {
  ConcurrentStockMovementError,
  InsufficientStockError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";
import { generateReference } from "@/server/auth/tokens";

/**
 * Stock movement.
 *
 * The invariant this file exists to protect: for every batch, the sum of its
 * stock movements equals its `quantityRemaining`, and that number is never
 * negative. Everything else is bookkeeping.
 *
 * Two people picking the last implant at the same moment is the same problem as
 * two patients booking the last slot, and gets the same answer — the balance is
 * read and written inside one SERIALIZABLE transaction, so the database refuses
 * one of them rather than letting both succeed. Reading the balance first and
 * writing it afterwards would let both pass the check.
 *
 * Issuing draws from the batch that expires soonest (FEFO), not the one that
 * arrived first. In a clinic those differ often enough to matter: a delivery
 * with three months left routinely arrives after one with a year.
 */

const REASON_REQUIRED: StockMovementType[] = ["ADJUSTMENT", "WASTAGE", "EXPIRY_WRITE_OFF"];

/** Postgres serialization failure, surfaced by Prisma as P2034. */
const SERIALIZATION_FAILURE = "P2034";

const TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  timeout: 15_000,
} as const;

export interface ActorRef {
  staffId?: string | null;
}

export interface ReceiveStockInput extends ActorRef {
  itemId: string;
  quantity: number;
  batchNumber?: string | null;
  expiryDate?: Date | null;
  supplierId?: string | null;
  invoiceRef?: string | null;
  unitCostPaise?: number | null;
  notes?: string | null;
}

export interface IssueStockInput extends ActorRef {
  itemId: string;
  quantity: number;
  /** Pin a specific batch. Omit to let FEFO choose. */
  batchId?: string | null;
  appointmentId?: string | null;
  patientId?: string | null;
  reason?: string | null;
  notes?: string | null;
}

export interface StockAllocation {
  batchId: string;
  batchNumber: string | null;
  labelCode: string;
  expiryDate: Date | null;
  quantity: number;
  balanceAfter: number;
}

// -----------------------------------------------------------------------------
// Label codes
// -----------------------------------------------------------------------------

const MAX_LABEL_ATTEMPTS = 8;

/**
 * Allocates a scannable code for a batch.
 *
 * Uppercase alphanumeric with no lookalike characters, because someone will
 * eventually read one out over the phone, and Code 128-B safe so it prints.
 */
export async function generateLabelCode(
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<string> {
  for (let attempt = 0; attempt < MAX_LABEL_ATTEMPTS; attempt += 1) {
    const labelCode = generateReference("ADC-B", 6);
    const existing = await client.inventoryBatch.findUnique({
      where: { labelCode },
      select: { id: true },
    });
    if (!existing) return labelCode;
  }
  throw new Error("Could not allocate a stock label code");
}

// -----------------------------------------------------------------------------
// Receiving
// -----------------------------------------------------------------------------

/**
 * Goods in. Creates a batch and its opening RECEIPT movement together, so a
 * batch can never exist without the movement that explains its balance.
 */
export async function receiveStock(input: ReceiveStockInput): Promise<StockAllocation> {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new ValidationError("Received quantity must be a whole number greater than zero.");
  }

  if (input.unitCostPaise !== undefined && input.unitCostPaise !== null) {
    if (!Number.isInteger(input.unitCostPaise) || input.unitCostPaise < 0) {
      throw new ValidationError("Unit cost must be a whole number of paise.");
    }
  }

  const item = await prisma.inventoryItem.findFirst({
    where: { id: input.itemId, deletedAt: null },
    select: {
      id: true,
      name: true,
      isActive: true,
      requiresExpiryTracking: true,
      requiresBatchTracking: true,
    },
  });

  if (!item) throw new NotFoundError("That stock item does not exist.");
  if (!item.isActive) {
    throw new ValidationError(`${item.name} is discontinued and cannot be received.`);
  }

  if (item.requiresExpiryTracking && !input.expiryDate) {
    throw new ValidationError(`${item.name} is expiry-tracked, so an expiry date is required.`);
  }

  if (item.requiresBatchTracking && !input.batchNumber) {
    throw new ValidationError(
      `${item.name} is batch-tracked, so the manufacturer's batch number is required. ` +
        "It is what a recall notice quotes.",
    );
  }

  // Receiving stock that is already expired is almost always a data-entry slip,
  // and accepting it silently puts unusable stock into the picking order.
  if (input.expiryDate && input.expiryDate.getTime() <= Date.now()) {
    throw new ValidationError("That expiry date has already passed. Check the packaging.");
  }

  return prisma.$transaction(async (tx) => {
    const labelCode = await generateLabelCode(tx);

    const batch = await tx.inventoryBatch.create({
      data: {
        itemId: item.id,
        batchNumber: input.batchNumber ?? null,
        labelCode,
        expiryDate: input.expiryDate ?? null,
        supplierId: input.supplierId ?? null,
        invoiceRef: input.invoiceRef ?? null,
        quantityReceived: input.quantity,
        quantityRemaining: input.quantity,
        unitCostPaise: input.unitCostPaise ?? null,
        notes: input.notes ?? null,
      },
    });

    await tx.stockMovement.create({
      data: {
        itemId: item.id,
        batchId: batch.id,
        type: "RECEIPT",
        quantity: input.quantity,
        balanceAfter: input.quantity,
        notes: input.notes ?? null,
        performedById: input.staffId ?? null,
      },
    });

    return {
      batchId: batch.id,
      batchNumber: batch.batchNumber,
      labelCode: batch.labelCode,
      expiryDate: batch.expiryDate,
      quantity: input.quantity,
      balanceAfter: input.quantity,
    };
  }, TRANSACTION_OPTIONS);
}

// -----------------------------------------------------------------------------
// Issuing
// -----------------------------------------------------------------------------

/**
 * Takes stock out, spreading the quantity across batches in expiry order.
 *
 * Returns one allocation per batch drawn from, because the caller usually needs
 * to record which batch went into which patient.
 */
export async function issueStock(input: IssueStockInput): Promise<StockAllocation[]> {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new ValidationError("Issued quantity must be a whole number greater than zero.");
  }

  const item = await prisma.inventoryItem.findFirst({
    where: { id: input.itemId, deletedAt: null },
    select: { id: true, name: true, requiresBatchTracking: true },
  });

  if (!item) throw new NotFoundError("That stock item does not exist.");

  try {
    return await prisma.$transaction(async (tx) => {
      const batches = await tx.inventoryBatch.findMany({
        where: {
          itemId: item.id,
          quantityRemaining: { gt: 0 },
          closedAt: null,
          ...(input.batchId ? { id: input.batchId } : {}),
        },
        // First-expiry-first-out. Batches with no expiry sort last, so dated
        // stock is always used before undated stock.
        orderBy: [{ expiryDate: { sort: "asc", nulls: "last" } }, { receivedAt: "asc" }],
      });

      const available = batches.reduce((sum, batch) => sum + batch.quantityRemaining, 0);

      if (available < input.quantity) {
        throw new InsufficientStockError(
          `Only ${available} of ${item.name} ${available === 1 ? "is" : "are"} in stock, ` +
            `but ${input.quantity} were requested.`,
        );
      }

      const allocations: StockAllocation[] = [];
      let outstanding = input.quantity;

      for (const batch of batches) {
        if (outstanding === 0) break;

        const take = Math.min(outstanding, batch.quantityRemaining);
        const balanceAfter = batch.quantityRemaining - take;

        // Conditional update: if another transaction moved this batch since the
        // read above, the row no longer matches and we have not oversold it.
        const claimed = await tx.inventoryBatch.updateMany({
          where: { id: batch.id, quantityRemaining: batch.quantityRemaining },
          data: {
            quantityRemaining: balanceAfter,
            closedAt: balanceAfter === 0 ? new Date() : null,
          },
        });

        if (claimed.count === 0) {
          throw new ConcurrentStockMovementError();
        }

        await tx.stockMovement.create({
          data: {
            itemId: item.id,
            batchId: batch.id,
            type: "ISSUE",
            quantity: -take,
            balanceAfter,
            reason: input.reason ?? null,
            notes: input.notes ?? null,
            appointmentId: input.appointmentId ?? null,
            patientId: input.patientId ?? null,
            performedById: input.staffId ?? null,
          },
        });

        allocations.push({
          batchId: batch.id,
          batchNumber: batch.batchNumber,
          labelCode: batch.labelCode,
          expiryDate: batch.expiryDate,
          quantity: take,
          balanceAfter,
        });

        outstanding -= take;
      }

      return allocations;
    }, TRANSACTION_OPTIONS);
  } catch (error) {
    if (isSerializationFailure(error)) {
      throw new ConcurrentStockMovementError();
    }
    throw error;
  }
}

// -----------------------------------------------------------------------------
// Corrections
// -----------------------------------------------------------------------------

export interface AdjustStockInput extends ActorRef {
  batchId: string;
  /** Signed: negative writes stock off, positive corrects an under-count. */
  delta: number;
  type: Extract<
    StockMovementType,
    "ADJUSTMENT" | "WASTAGE" | "EXPIRY_WRITE_OFF" | "RETURN" | "COUNT_CORRECTION"
  >;
  reason: string;
  notes?: string | null;
  stockCountId?: string | null;
}

/**
 * Moves a batch's balance without a patient attached.
 *
 * A reason is mandatory for the three types that remove stock. Unexplained
 * shrinkage is the thing a stock system is supposed to make visible, and an
 * optional free-text field is how it stays invisible.
 */
export async function adjustStock(input: AdjustStockInput): Promise<StockAllocation> {
  if (!Number.isInteger(input.delta) || input.delta === 0) {
    throw new ValidationError("An adjustment must be a whole number and cannot be zero.");
  }

  const reason = input.reason?.trim() ?? "";
  if (REASON_REQUIRED.includes(input.type) && reason.length < 3) {
    throw new ValidationError("Please say why this stock is being written off.");
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const batch = await tx.inventoryBatch.findUnique({
        where: { id: input.batchId },
        select: { id: true, itemId: true, batchNumber: true, labelCode: true, expiryDate: true, quantityRemaining: true },
      });

      if (!batch) throw new NotFoundError("That batch does not exist.");

      const balanceAfter = batch.quantityRemaining + input.delta;

      if (balanceAfter < 0) {
        throw new InsufficientStockError(
          `That would leave ${balanceAfter} in the batch. Only ${batch.quantityRemaining} ` +
            "are on hand.",
        );
      }

      const claimed = await tx.inventoryBatch.updateMany({
        where: { id: batch.id, quantityRemaining: batch.quantityRemaining },
        data: {
          quantityRemaining: balanceAfter,
          closedAt: balanceAfter === 0 ? new Date() : null,
        },
      });

      if (claimed.count === 0) {
        throw new ConcurrentStockMovementError("That batch changed a moment ago. Please try again.");
      }

      await tx.stockMovement.create({
        data: {
          itemId: batch.itemId,
          batchId: batch.id,
          type: input.type,
          quantity: input.delta,
          balanceAfter,
          reason: reason || null,
          notes: input.notes ?? null,
          stockCountId: input.stockCountId ?? null,
          performedById: input.staffId ?? null,
        },
      });

      return {
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        labelCode: batch.labelCode,
        expiryDate: batch.expiryDate,
        quantity: input.delta,
        balanceAfter,
      };
    }, TRANSACTION_OPTIONS);
  } catch (error) {
    if (isSerializationFailure(error)) {
      throw new ConcurrentStockMovementError("That batch changed a moment ago. Please try again.");
    }
    throw error;
  }
}

/**
 * Writes off every batch that has passed its expiry date.
 *
 * Run from the scheduled job. Expired stock left on the books overstates what
 * the clinic can actually use, which is how a treatment gets booked against
 * material that has to be thrown away.
 */
export async function writeOffExpiredStock(asOf = new Date()): Promise<{
  batches: number;
  units: number;
}> {
  const expired = await prisma.inventoryBatch.findMany({
    where: { expiryDate: { lt: asOf }, quantityRemaining: { gt: 0 }, closedAt: null },
    select: { id: true, quantityRemaining: true, expiryDate: true },
  });

  let units = 0;
  let batches = 0;

  for (const batch of expired) {
    try {
      await adjustStock({
        batchId: batch.id,
        delta: -batch.quantityRemaining,
        type: "EXPIRY_WRITE_OFF",
        reason: `Expired ${batch.expiryDate?.toISOString().slice(0, 10) ?? "(no date)"}`,
      });
      units += batch.quantityRemaining;
      batches += 1;
    } catch {
      // A batch that moved underneath us is picked up by the next run rather
      // than failing the whole sweep.
      continue;
    }
  }

  return { batches, units };
}

function isSerializationFailure(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === SERIALIZATION_FAILURE
  );
}
