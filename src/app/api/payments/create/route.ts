import { z } from "zod";
import { apiSuccess, withApiHandler } from "@/lib/api";
import { features } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { requirePatientApi } from "@/server/auth/guards";
import { startPayment } from "@/server/payments/service";

export const dynamic = "force-dynamic";

const schema = z.object({
  invoiceId: z.uuid().optional(),
  /** Only used when there is no invoice, e.g. a consultation deposit. */
  amountPaise: z.number().int().positive().max(100_000_00).optional(),
});

/**
 * POST /api/payments/create
 *
 * Starts a payment for the SIGNED-IN patient. The patient id comes from the
 * session, never from the request body — otherwise one patient could create a
 * payment against another's invoice.
 */
export const POST = withApiHandler(async (request) => {
  const principal = await requirePatientApi();

  if (!features.payments) {
    throw new AppError("Online payment is not available at the moment. Please pay at the clinic.", {
      status: 503,
      code: "PAYMENTS_UNCONFIGURED",
    });
  }

  const body = await request.json();
  const input = schema.parse(body);

  if (!input.invoiceId && !input.amountPaise) {
    throw new AppError("Nothing to pay for.", { status: 400, code: "INVALID_REQUEST" });
  }

  const result = await startPayment({
    patientId: principal.patientId,
    // With an invoice, the server reads the real balance and ignores this.
    amountPaise: input.amountPaise ?? 1,
    invoiceId: input.invoiceId ?? null,
    actor: { userId: principal.userId, label: principal.fullName, role: "PATIENT" },
  });

  return apiSuccess({
    orderId: result.gatewayOrderId,
    amountPaise: result.amountPaise,
    reference: result.reference,
    keyId: result.keyId,
  });
});
