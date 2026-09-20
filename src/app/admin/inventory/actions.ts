"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { AppError } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/rbac";
import { recordAudit } from "@/server/audit";
import { requireStaffApi } from "@/server/auth/guards";
import { adjustStock, issueStock, receiveStock, writeOffExpiredStock } from "@/server/inventory/service";
import { applyStockCount, openStockCount, recordCountedQuantity } from "@/server/inventory/stocktake";

export interface ActionResult {
  ok: boolean;
  message: string;
  /** Present after a successful receipt, so the UI can offer to print the label. */
  labelCode?: string;
  batchId?: string;
}

/**
 * Every action here changes a stock balance, so every one of them is audited.
 * The audit trail is the only way to answer "where did six implants go", and it
 * is worth more than the few milliseconds each write costs.
 */

function failure(error: unknown, fallback: string): ActionResult {
  if (error instanceof AppError && error.isPublic) {
    return { ok: false, message: error.message };
  }
  return { ok: false, message: fallback };
}

const receiveSchema = z.object({
  itemId: z.uuid(),
  quantity: z.coerce.number().int().positive(),
  batchNumber: z.string().max(80).optional(),
  expiryDate: z.string().optional(),
  supplierId: z.uuid().optional(),
  invoiceRef: z.string().max(80).optional(),
  // Entered in rupees by a human; stored in paise.
  unitCostRupees: z.coerce.number().nonnegative().optional(),
  notes: z.string().max(500).optional(),
});

export async function receiveStockAction(formData: FormData): Promise<ActionResult> {
  try {
    const principal = await requireStaffApi(PERMISSIONS.INVENTORY_RECEIVE);

    const input = receiveSchema.parse({
      itemId: formData.get("itemId"),
      quantity: formData.get("quantity"),
      batchNumber: formData.get("batchNumber") || undefined,
      expiryDate: formData.get("expiryDate") || undefined,
      supplierId: formData.get("supplierId") || undefined,
      invoiceRef: formData.get("invoiceRef") || undefined,
      unitCostRupees: formData.get("unitCostRupees") || undefined,
      notes: formData.get("notes") || undefined,
    });

    const result = await receiveStock({
      itemId: input.itemId,
      quantity: input.quantity,
      batchNumber: input.batchNumber ?? null,
      // A date input gives a local calendar day; midday avoids it landing on the
      // previous day once it is stored as UTC.
      expiryDate: input.expiryDate ? new Date(`${input.expiryDate}T12:00:00`) : null,
      supplierId: input.supplierId ?? null,
      invoiceRef: input.invoiceRef ?? null,
      unitCostPaise:
        input.unitCostRupees === undefined ? null : Math.round(input.unitCostRupees * 100),
      notes: input.notes ?? null,
      staffId: principal.staffId,
    });

    await recordAudit({
      actor: { userId: principal.userId, label: principal.fullName, role: principal.role },
      action: "CREATE",
      entity: "InventoryBatch",
      entityId: result.batchId,
      after: {
        itemId: input.itemId,
        quantity: input.quantity,
        labelCode: result.labelCode,
        batchNumber: result.batchNumber,
      },
    });

    revalidatePath("/admin/inventory");
    revalidatePath(`/admin/inventory/${input.itemId}`);

    return {
      ok: true,
      message: `Received ${input.quantity}. Label ${result.labelCode} is ready to print.`,
      labelCode: result.labelCode,
      batchId: result.batchId,
    };
  } catch (error) {
    return failure(error, "That stock could not be received.");
  }
}

const issueSchema = z.object({
  itemId: z.uuid(),
  quantity: z.coerce.number().int().positive(),
  batchId: z.uuid().optional(),
  appointmentId: z.uuid().optional(),
  patientId: z.uuid().optional(),
  reason: z.string().max(300).optional(),
});

export async function issueStockAction(formData: FormData): Promise<ActionResult> {
  try {
    const principal = await requireStaffApi(PERMISSIONS.INVENTORY_ISSUE);

    const input = issueSchema.parse({
      itemId: formData.get("itemId"),
      quantity: formData.get("quantity"),
      batchId: formData.get("batchId") || undefined,
      appointmentId: formData.get("appointmentId") || undefined,
      patientId: formData.get("patientId") || undefined,
      reason: formData.get("reason") || undefined,
    });

    const allocations = await issueStock({
      itemId: input.itemId,
      quantity: input.quantity,
      batchId: input.batchId ?? null,
      appointmentId: input.appointmentId ?? null,
      patientId: input.patientId ?? null,
      reason: input.reason ?? null,
      staffId: principal.staffId,
    });

    await recordAudit({
      actor: { userId: principal.userId, label: principal.fullName, role: principal.role },
      action: "UPDATE",
      entity: "InventoryItem",
      entityId: input.itemId,
      after: {
        issued: input.quantity,
        batches: allocations.map((a) => ({ labelCode: a.labelCode, quantity: a.quantity })),
        patientId: input.patientId ?? null,
      },
    });

    revalidatePath("/admin/inventory");
    revalidatePath(`/admin/inventory/${input.itemId}`);

    const drawn = allocations
      .map((a) => `${a.quantity} from ${a.batchNumber ?? a.labelCode}`)
      .join(", ");

    return { ok: true, message: `Issued ${input.quantity} — ${drawn}.` };
  } catch (error) {
    return failure(error, "That stock could not be issued.");
  }
}

const adjustSchema = z.object({
  batchId: z.uuid(),
  itemId: z.uuid(),
  delta: z.coerce.number().int(),
  type: z.enum(["ADJUSTMENT", "WASTAGE", "EXPIRY_WRITE_OFF", "RETURN"]),
  reason: z.string().min(3).max(300),
});

export async function adjustStockAction(formData: FormData): Promise<ActionResult> {
  try {
    const principal = await requireStaffApi(PERMISSIONS.INVENTORY_ADJUST);

    const input = adjustSchema.parse({
      batchId: formData.get("batchId"),
      itemId: formData.get("itemId"),
      delta: formData.get("delta"),
      type: formData.get("type"),
      reason: formData.get("reason"),
    });

    const result = await adjustStock({
      batchId: input.batchId,
      delta: input.delta,
      type: input.type,
      reason: input.reason,
      staffId: principal.staffId,
    });

    await recordAudit({
      actor: { userId: principal.userId, label: principal.fullName, role: principal.role },
      action: "UPDATE",
      entity: "InventoryBatch",
      entityId: input.batchId,
      after: { type: input.type, delta: input.delta, reason: input.reason, balanceAfter: result.balanceAfter },
    });

    revalidatePath("/admin/inventory");
    revalidatePath(`/admin/inventory/${input.itemId}`);
    revalidatePath("/admin/inventory/expiry");

    return { ok: true, message: `Batch updated. ${result.balanceAfter} now on hand.` };
  } catch (error) {
    return failure(error, "That batch could not be adjusted.");
  }
}

export async function writeOffExpiredAction(): Promise<ActionResult> {
  try {
    const principal = await requireStaffApi(PERMISSIONS.INVENTORY_ADJUST);

    const result = await writeOffExpiredStock();

    await recordAudit({
      actor: { userId: principal.userId, label: principal.fullName, role: principal.role },
      action: "UPDATE",
      entity: "InventoryBatch",
      entityId: null,
      after: { writtenOffBatches: result.batches, writtenOffUnits: result.units },
    });

    revalidatePath("/admin/inventory");
    revalidatePath("/admin/inventory/expiry");

    if (result.batches === 0) {
      return { ok: true, message: "Nothing has expired — no stock was written off." };
    }

    return {
      ok: true,
      message: `Wrote off ${result.units} ${result.units === 1 ? "unit" : "units"} across ${result.batches} ${result.batches === 1 ? "batch" : "batches"}.`,
    };
  } catch (error) {
    return failure(error, "Expired stock could not be written off.");
  }
}

export async function openStockCountAction(formData: FormData): Promise<ActionResult> {
  try {
    const principal = await requireStaffApi(PERMISSIONS.INVENTORY_COUNT);

    const categoryId = formData.get("categoryId");
    const scope = formData.get("scope");

    const count = await openStockCount({
      categoryId: typeof categoryId === "string" && categoryId ? categoryId : null,
      scope: typeof scope === "string" && scope ? scope : null,
      staffId: principal.staffId,
    });

    revalidatePath("/admin/inventory/counts");

    return {
      ok: true,
      message: `Count ${count.reference} opened with ${count.lines.length} ${count.lines.length === 1 ? "line" : "lines"}.`,
    };
  } catch (error) {
    return failure(error, "That stock count could not be opened.");
  }
}

const countLineSchema = z.object({
  lineId: z.uuid(),
  countedQuantity: z.coerce.number().int().nonnegative(),
  varianceReason: z.string().max(300).optional(),
});

export async function recordCountLineAction(formData: FormData): Promise<ActionResult> {
  try {
    await requireStaffApi(PERMISSIONS.INVENTORY_COUNT);

    const input = countLineSchema.parse({
      lineId: formData.get("lineId"),
      countedQuantity: formData.get("countedQuantity"),
      varianceReason: formData.get("varianceReason") || undefined,
    });

    await recordCountedQuantity({
      lineId: input.lineId,
      countedQuantity: input.countedQuantity,
      varianceReason: input.varianceReason ?? null,
    });

    revalidatePath("/admin/inventory/counts");

    return { ok: true, message: "Counted." };
  } catch (error) {
    return failure(error, "That line could not be recorded.");
  }
}

export async function applyStockCountAction(formData: FormData): Promise<ActionResult> {
  try {
    const principal = await requireStaffApi(PERMISSIONS.INVENTORY_COUNT);

    const stockCountId = z.uuid().parse(formData.get("stockCountId"));

    const result = await applyStockCount(stockCountId, { staffId: principal.staffId });

    await recordAudit({
      actor: { userId: principal.userId, label: principal.fullName, role: principal.role },
      action: "UPDATE",
      entity: "StockCount",
      entityId: stockCountId,
      after: { ...result },
    });

    revalidatePath("/admin/inventory");
    revalidatePath("/admin/inventory/counts");

    return {
      ok: true,
      message:
        result.linesApplied === 0
          ? `${result.reference} closed with no variances.`
          : `${result.reference} closed. ${result.linesApplied} ${result.linesApplied === 1 ? "line" : "lines"} corrected: +${result.unitsAdded} / −${result.unitsRemoved}.`,
    };
  } catch (error) {
    return failure(error, "That count could not be closed.");
  }
}
