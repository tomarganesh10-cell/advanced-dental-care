import { z } from "zod";
import { apiSuccess, withApiHandler } from "@/lib/api";
import { formatPaise } from "@/lib/utils";
import { requirePatientApi } from "@/server/auth/guards";
import { verifyAndCapturePayment } from "@/server/payments/service";

export const dynamic = "force-dynamic";

const schema = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

/**
 * POST /api/payments/verify
 *
 * Handles the checkout callback. Every field here arrived from the browser and
 * is therefore untrusted — the service verifies the signature and then asks
 * Razorpay directly what happened before anything is marked paid.
 */
export const POST = withApiHandler(async (request) => {
  const principal = await requirePatientApi();

  const body = await request.json();
  const input = schema.parse(body);

  const result = await verifyAndCapturePayment({
    gatewayOrderId: input.razorpay_order_id,
    gatewayPaymentId: input.razorpay_payment_id,
    signature: input.razorpay_signature,
    actor: { userId: principal.userId, label: principal.fullName, role: "PATIENT" },
  });

  return apiSuccess({
    status: result.status,
    reference: result.reference,
    amount: formatPaise(result.amountPaise),
  });
});
