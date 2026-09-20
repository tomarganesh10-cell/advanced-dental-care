import { describe, expect, it } from "vitest";

import { InsufficientStockError, ValidationError } from "@/lib/errors";
import {
  adjustStock,
  issueStock,
  receiveStock,
  writeOffExpiredStock,
} from "@/server/inventory/service";
import { getStockList, findBatchByLabel, getBatchRecipients } from "@/server/inventory/queries";
import {
  applyStockCount,
  openStockCount,
  recordCountedQuantity,
} from "@/server/inventory/stocktake";

import { createInventoryItem, createPatient, daysFromNow } from "./factories";
import { testDb } from "./setup";

/**
 * These run against a real PostgreSQL database because the property under test
 * — that stock cannot go negative and that the ledger always sums to the
 * balance — is enforced by the database's isolation level, not by application
 * code. Mocked, every one of these would pass while the real system oversold.
 */

/** The invariant the whole module exists to protect. */
async function expectLedgerBalances(batchId: string) {
  const batch = await testDb.inventoryBatch.findUniqueOrThrow({ where: { id: batchId } });
  const movements = await testDb.stockMovement.findMany({ where: { batchId } });
  const sum = movements.reduce((total, movement) => total + movement.quantity, 0);

  expect(sum).toBe(batch.quantityRemaining);
  expect(batch.quantityRemaining).toBeGreaterThanOrEqual(0);
}

describe("receiving stock", () => {
  it("creates a batch, its opening movement and a scannable label", async () => {
    const item = await createInventoryItem();

    const result = await receiveStock({ itemId: item.id, quantity: 25 });

    expect(result.quantity).toBe(25);
    expect(result.balanceAfter).toBe(25);
    expect(result.labelCode).toMatch(/^ADC-B-[A-Z0-9]{6}$/);

    await expectLedgerBalances(result.batchId);

    const movements = await testDb.stockMovement.findMany({ where: { batchId: result.batchId } });
    expect(movements).toHaveLength(1);
    expect(movements[0]?.type).toBe("RECEIPT");
  });

  it("gives every batch a distinct label code", async () => {
    const item = await createInventoryItem();

    const codes = new Set<string>();
    for (let i = 0; i < 12; i += 1) {
      const batch = await receiveStock({ itemId: item.id, quantity: 1 });
      codes.add(batch.labelCode);
    }

    expect(codes.size).toBe(12);
  });

  it("requires a batch number for a batch-tracked item", async () => {
    const item = await createInventoryItem({ requiresBatchTracking: true });

    await expect(receiveStock({ itemId: item.id, quantity: 5 })).rejects.toBeInstanceOf(
      ValidationError,
    );

    const ok = await receiveStock({ itemId: item.id, quantity: 5, batchNumber: "LOT-99" });
    expect(ok.batchNumber).toBe("LOT-99");
  });

  it("requires an expiry date for an expiry-tracked item, and refuses a past one", async () => {
    const item = await createInventoryItem({ requiresExpiryTracking: true });

    await expect(receiveStock({ itemId: item.id, quantity: 5 })).rejects.toBeInstanceOf(
      ValidationError,
    );

    await expect(
      receiveStock({ itemId: item.id, quantity: 5, expiryDate: daysFromNow(-1) }),
    ).rejects.toBeInstanceOf(ValidationError);

    const ok = await receiveStock({
      itemId: item.id,
      quantity: 5,
      expiryDate: daysFromNow(200),
    });
    expect(ok.balanceAfter).toBe(5);
  });

  it("refuses a zero or fractional quantity", async () => {
    const item = await createInventoryItem();

    await expect(receiveStock({ itemId: item.id, quantity: 0 })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(receiveStock({ itemId: item.id, quantity: 2.5 })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});

describe("issuing stock", () => {
  it("draws from the batch that expires first, not the one received first", async () => {
    const item = await createInventoryItem({ requiresExpiryTracking: true });

    // Received first, but expires later.
    const longDated = await receiveStock({
      itemId: item.id,
      quantity: 10,
      expiryDate: daysFromNow(365),
    });
    const shortDated = await receiveStock({
      itemId: item.id,
      quantity: 10,
      expiryDate: daysFromNow(30),
    });

    const allocations = await issueStock({ itemId: item.id, quantity: 4 });

    expect(allocations).toHaveLength(1);
    expect(allocations[0]?.batchId).toBe(shortDated.batchId);
    expect(allocations[0]?.balanceAfter).toBe(6);

    const untouched = await testDb.inventoryBatch.findUniqueOrThrow({
      where: { id: longDated.batchId },
    });
    expect(untouched.quantityRemaining).toBe(10);
  });

  it("spreads one issue across batches when the first cannot cover it", async () => {
    const item = await createInventoryItem({ requiresExpiryTracking: true });

    const first = await receiveStock({ itemId: item.id, quantity: 3, expiryDate: daysFromNow(30) });
    const second = await receiveStock({
      itemId: item.id,
      quantity: 10,
      expiryDate: daysFromNow(90),
    });

    const allocations = await issueStock({ itemId: item.id, quantity: 7 });

    expect(allocations).toHaveLength(2);
    expect(allocations[0]).toMatchObject({ batchId: first.batchId, quantity: 3, balanceAfter: 0 });
    expect(allocations[1]).toMatchObject({ batchId: second.batchId, quantity: 4, balanceAfter: 6 });

    await expectLedgerBalances(first.batchId);
    await expectLedgerBalances(second.batchId);
  });

  it("closes a batch when it is exhausted so it drops out of picking", async () => {
    const item = await createInventoryItem();
    const batch = await receiveStock({ itemId: item.id, quantity: 2 });

    await issueStock({ itemId: item.id, quantity: 2 });

    const closed = await testDb.inventoryBatch.findUniqueOrThrow({ where: { id: batch.batchId } });
    expect(closed.quantityRemaining).toBe(0);
    expect(closed.closedAt).not.toBeNull();
  });

  it("refuses to issue more than is on hand, and writes nothing when it does", async () => {
    const item = await createInventoryItem();
    const batch = await receiveStock({ itemId: item.id, quantity: 5 });

    await expect(issueStock({ itemId: item.id, quantity: 6 })).rejects.toBeInstanceOf(
      InsufficientStockError,
    );

    const after = await testDb.inventoryBatch.findUniqueOrThrow({ where: { id: batch.batchId } });
    expect(after.quantityRemaining).toBe(5);

    const movements = await testDb.stockMovement.findMany({ where: { batchId: batch.batchId } });
    expect(movements).toHaveLength(1);
  });

  it("never oversells when two people pick the last units at once", async () => {
    const item = await createInventoryItem();
    const batch = await receiveStock({ itemId: item.id, quantity: 10 });

    // Six concurrent requests for 2 each against 10 on hand: at most five can
    // succeed, and the balance must never go below zero whatever the ordering.
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => issueStock({ itemId: item.id, quantity: 2 })),
    );

    const fulfilled = results.filter((result) => result.status === "fulfilled").length;
    expect(fulfilled).toBeLessThanOrEqual(5);
    expect(fulfilled).toBeGreaterThan(0);

    const after = await testDb.inventoryBatch.findUniqueOrThrow({ where: { id: batch.batchId } });
    expect(after.quantityRemaining).toBe(10 - fulfilled * 2);
    expect(after.quantityRemaining).toBeGreaterThanOrEqual(0);

    await expectLedgerBalances(batch.batchId);
  });

  it("records which patient received which batch, for a recall", async () => {
    const item = await createInventoryItem({ requiresBatchTracking: true });
    const patient = await createPatient();

    const batch = await receiveStock({
      itemId: item.id,
      quantity: 4,
      batchNumber: "RECALL-LOT-7",
    });

    await issueStock({ itemId: item.id, quantity: 1, patientId: patient.id });

    const recipients = await getBatchRecipients(batch.batchId);
    expect(recipients).toHaveLength(1);
    expect(recipients[0]?.patient?.id).toBe(patient.id);
    expect(recipients[0]?.quantity).toBe(1);
  });
});

describe("adjustments and write-offs", () => {
  it("demands a reason before stock leaves without a patient", async () => {
    const item = await createInventoryItem();
    const batch = await receiveStock({ itemId: item.id, quantity: 5 });

    await expect(
      adjustStock({ batchId: batch.batchId, delta: -2, type: "WASTAGE", reason: "" }),
    ).rejects.toBeInstanceOf(ValidationError);

    const ok = await adjustStock({
      batchId: batch.batchId,
      delta: -2,
      type: "WASTAGE",
      reason: "Dropped on the floor during setup",
    });
    expect(ok.balanceAfter).toBe(3);
    await expectLedgerBalances(batch.batchId);
  });

  it("refuses an adjustment that would drive a batch negative", async () => {
    const item = await createInventoryItem();
    const batch = await receiveStock({ itemId: item.id, quantity: 3 });

    await expect(
      adjustStock({
        batchId: batch.batchId,
        delta: -4,
        type: "ADJUSTMENT",
        reason: "Miscount correction",
      }),
    ).rejects.toBeInstanceOf(InsufficientStockError);

    await expectLedgerBalances(batch.batchId);
  });

  it("writes off expired batches and leaves in-date stock alone", async () => {
    const item = await createInventoryItem({ requiresExpiryTracking: true });

    const good = await receiveStock({
      itemId: item.id,
      quantity: 6,
      expiryDate: daysFromNow(120),
    });
    const soonExpired = await receiveStock({
      itemId: item.id,
      quantity: 4,
      expiryDate: daysFromNow(1),
    });

    // Move it into the past directly: receiveStock refuses to accept expired
    // stock, which is the behaviour tested above.
    await testDb.inventoryBatch.update({
      where: { id: soonExpired.batchId },
      data: { expiryDate: daysFromNow(-2) },
    });

    const result = await writeOffExpiredStock();

    expect(result).toEqual({ batches: 1, units: 4 });

    const written = await testDb.inventoryBatch.findUniqueOrThrow({
      where: { id: soonExpired.batchId },
    });
    expect(written.quantityRemaining).toBe(0);

    const untouched = await testDb.inventoryBatch.findUniqueOrThrow({
      where: { id: good.batchId },
    });
    expect(untouched.quantityRemaining).toBe(6);
  });
});

describe("stock list", () => {
  it("flags items at or below their reorder level", async () => {
    const low = await createInventoryItem({ name: "Low Item", reorderLevel: 10 });
    const fine = await createInventoryItem({ name: "Fine Item", reorderLevel: 2 });

    await receiveStock({ itemId: low.id, quantity: 8 });
    await receiveStock({ itemId: fine.id, quantity: 40 });

    const rows = await getStockList();

    expect(rows.find((row) => row.id === low.id)?.isLow).toBe(true);
    expect(rows.find((row) => row.id === fine.id)?.isLow).toBe(false);

    const lowOnly = await getStockList({ lowOnly: true });
    expect(lowOnly.map((row) => row.id)).toContain(low.id);
    expect(lowOnly.map((row) => row.id)).not.toContain(fine.id);
  });

  it("omits purchase cost unless the caller is allowed to see it", async () => {
    const item = await createInventoryItem();
    await receiveStock({ itemId: item.id, quantity: 10, unitCostPaise: 25_000 });

    const withoutCost = await getStockList();
    expect(withoutCost[0]).not.toHaveProperty("stockValuePaise");

    const withCost = await getStockList({}, { includeCost: true });
    expect(withCost[0]?.stockValuePaise).toBe(250_000);
  });

  it("counts units expiring inside the item's warning window", async () => {
    const item = await createInventoryItem({
      requiresExpiryTracking: true,
      expiryWarningDays: 45,
    });

    await receiveStock({ itemId: item.id, quantity: 3, expiryDate: daysFromNow(20) });
    await receiveStock({ itemId: item.id, quantity: 7, expiryDate: daysFromNow(300) });

    const row = (await getStockList()).find((candidate) => candidate.id === item.id);

    expect(row?.onHand).toBe(10);
    expect(row?.expiringSoon).toBe(3);
    expect(row?.expiredUnits).toBe(0);
  });

  it("finds a batch by the code printed on its label", async () => {
    const item = await createInventoryItem({ name: "Scannable" });
    const batch = await receiveStock({ itemId: item.id, quantity: 5 });

    const found = await findBatchByLabel(batch.labelCode.toLowerCase());

    expect(found?.id).toBe(batch.batchId);
    expect(found?.item.name).toBe("Scannable");
    expect(await findBatchByLabel("ADC-B-NOPE12")).toBeNull();
  });
});

describe("stocktake", () => {
  it("applies a counted variance and explains it in the ledger", async () => {
    const item = await createInventoryItem();
    const batch = await receiveStock({ itemId: item.id, quantity: 20 });

    const count = await openStockCount({ scope: "Test shelf" });
    const line = count.lines.find((candidate) => candidate.batchId === batch.batchId);
    expect(line?.expectedQuantity).toBe(20);

    await recordCountedQuantity({
      lineId: line!.id,
      countedQuantity: 18,
      varianceReason: "Two used without being recorded",
    });

    const result = await applyStockCount(count.id);

    expect(result.linesApplied).toBe(1);
    expect(result.unitsRemoved).toBe(2);

    const after = await testDb.inventoryBatch.findUniqueOrThrow({ where: { id: batch.batchId } });
    expect(after.quantityRemaining).toBe(18);

    const correction = await testDb.stockMovement.findFirst({
      where: { batchId: batch.batchId, type: "COUNT_CORRECTION" },
    });
    expect(correction?.quantity).toBe(-2);
    expect(correction?.reason).toBe("Two used without being recorded");

    await expectLedgerBalances(batch.batchId);
  });

  it("refuses to close a count with an unexplained variance", async () => {
    const item = await createInventoryItem();
    const batch = await receiveStock({ itemId: item.id, quantity: 12 });

    const count = await openStockCount();
    const line = count.lines.find((candidate) => candidate.batchId === batch.batchId);

    await recordCountedQuantity({ lineId: line!.id, countedQuantity: 9 });

    await expect(applyStockCount(count.id)).rejects.toBeInstanceOf(ValidationError);

    const untouched = await testDb.inventoryBatch.findUniqueOrThrow({
      where: { id: batch.batchId },
    });
    expect(untouched.quantityRemaining).toBe(12);
  });

  it("leaves uncounted lines alone rather than treating them as zero", async () => {
    const counted = await createInventoryItem({ name: "Counted" });
    const skipped = await createInventoryItem({ name: "Skipped" });

    const countedBatch = await receiveStock({ itemId: counted.id, quantity: 10 });
    const skippedBatch = await receiveStock({ itemId: skipped.id, quantity: 10 });

    const count = await openStockCount();
    const line = count.lines.find((candidate) => candidate.batchId === countedBatch.batchId);
    await recordCountedQuantity({ lineId: line!.id, countedQuantity: 10 });

    const result = await applyStockCount(count.id);

    expect(result.linesSkipped).toBe(1);

    const untouched = await testDb.inventoryBatch.findUniqueOrThrow({
      where: { id: skippedBatch.batchId },
    });
    expect(untouched.quantityRemaining).toBe(10);
  });
});
