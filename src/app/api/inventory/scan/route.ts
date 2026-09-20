import { apiSuccess, withApiHandler } from "@/lib/api";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/rbac";
import { requireStaffApi } from "@/server/auth/guards";
import { findBatchByLabel } from "@/server/inventory/queries";

export const dynamic = "force-dynamic";

/** Label codes are ADC-B- plus six characters from the no-lookalike alphabet. */
const LABEL_PATTERN = /^ADC-B-[A-Z0-9]{6}$/;

/**
 * GET /api/inventory/scan?code=ADC-B-7K2M9Q
 *
 * What a handheld barcode scanner submits. A scanner types the code and presses
 * Enter, so this has to answer from the code alone.
 *
 * Staff-only, and it returns the item and batch but never the purchase cost —
 * the people scanning boxes at the shelf are the ones least likely to hold the
 * cost permission, and this endpoint is the easiest one to call by hand.
 */
export const GET = withApiHandler(async (request) => {
  await requireStaffApi(PERMISSIONS.INVENTORY_VIEW);

  const code = new URL(request.url).searchParams.get("code")?.trim().toUpperCase() ?? "";

  if (!LABEL_PATTERN.test(code)) {
    throw new ValidationError("That is not a stock label code.");
  }

  const batch = await findBatchByLabel(code);

  if (!batch) {
    throw new NotFoundError("No batch carries that label. Check the code, or print a new label.");
  }

  return apiSuccess({
    batchId: batch.id,
    labelCode: batch.labelCode,
    batchNumber: batch.batchNumber,
    expiryDate: batch.expiryDate,
    isExpired: batch.isExpired,
    quantityRemaining: batch.quantityRemaining,
    supplierName: batch.supplierName,
    item: batch.item,
  });
});
