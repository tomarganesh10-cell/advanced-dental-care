import { prisma } from "@/lib/db";
import type { Prisma } from "@/lib/db";
import { AppError, ConflictError, NotFoundError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { formatPaise } from "@/lib/utils";
import { recordAudit, type AuditActor } from "@/server/audit";
import { generatePaymentReference } from "@/server/booking/references";
import { queueNotification } from "@/server/notifications/dispatch";
import { TEMPLATE_KEYS } from "@/server/notifications/templates";
import { createOrder, fetchPayment, verifyCheckoutSignature } from "./razorpay";

/**
 * Payment lifecycle.
 *
 * CREATED → (client pays) → verified server-side → SUCCESS
 *
 * The `verifiedAt` column is the source of truth. Any row with
 * `status = SUCCESS` and `verifiedAt = null` would be a bug, and the reporting
 * queries filter on `verifiedAt` rather than on status precisely so that such a
 * row could never be counted as revenue.
 */

export interface StartPaymentInput {
  patientId: string;
  amountPaise: number;
  invoiceId?: string | null;
  appointmentId?: string | null;
  actor?: AuditActor;
}

export interface StartPaymentResult {
  paymentId: string;
  reference: string;
  gatewayOrderId: string;
  amountPaise: number;
  keyId: string;
}

export async function startPayment(input: StartPaymentInput): Promise<StartPaymentResult> {
  if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0) {
    throw new AppError("That payment amount is not valid.", { status: 400, code: "INVALID_AMOUNT" });
  }

  // The amount is taken from the invoice server-side where one exists, so a
  // client cannot pay ₹1 against a ₹50,000 invoice by editing the request.
  let amountPaise = input.amountPaise;

  if (input.invoiceId) {
    const invoice = await prisma.invoice.findFirst({
      where: { id: input.invoiceId, patientId: input.patientId, deletedAt: null },
      select: { balancePaise: true, status: true },
    });

    if (!invoice) throw new NotFoundError("Invoice not found.");
    if (invoice.status === "PAID") throw new ConflictError("That invoice is already paid.");
    if (invoice.status === "CANCELLED") throw new ConflictError("That invoice has been cancelled.");

    amountPaise = invoice.balancePaise;

    if (amountPaise <= 0) throw new ConflictError("There is nothing left to pay on that invoice.");
  }

  const reference = await generatePaymentReference();

  const order = await createOrder({
    amountPaise,
    receipt: reference,
    notes: { patientId: input.patientId, reference },
  });

  const payment = await prisma.payment.create({
    data: {
      reference,
      patientId: input.patientId,
      invoiceId: input.invoiceId ?? null,
      appointmentId: input.appointmentId ?? null,
      amountPaise,
      status: "CREATED",
      method: "RAZORPAY",
      gatewayOrderId: order.id,
    },
    select: { id: true },
  });

  await recordAudit({
    actor: input.actor ?? {},
    action: "CREATE",
    entity: "Payment",
    entityId: payment.id,
    after: { reference, amountPaise, gatewayOrderId: order.id },
  });

  return {
    paymentId: payment.id,
    reference,
    gatewayOrderId: order.id,
    amountPaise,
    keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? "",
  };
}

export interface VerifyPaymentInput {
  gatewayOrderId: string;
  gatewayPaymentId: string;
  signature: string;
  actor?: AuditActor;
}

export interface VerifyPaymentResult {
  paymentId: string;
  reference: string;
  amountPaise: number;
  status: "SUCCESS" | "FAILED";
}

export async function verifyAndCapturePayment(
  input: VerifyPaymentInput,
): Promise<VerifyPaymentResult> {
  const payment = await prisma.payment.findUnique({
    where: { gatewayOrderId: input.gatewayOrderId },
    select: {
      id: true,
      reference: true,
      amountPaise: true,
      status: true,
      verifiedAt: true,
      patientId: true,
      invoiceId: true,
      patient: { select: { id: true, fullName: true, phone: true } },
    },
  });

  if (!payment) throw new NotFoundError("We could not find that payment.");

  // Idempotent: the browser callback and the webhook both arrive, and a user
  // may refresh the return page. Verifying twice must not double-credit.
  if (payment.status === "SUCCESS" && payment.verifiedAt) {
    return {
      paymentId: payment.id,
      reference: payment.reference,
      amountPaise: payment.amountPaise,
      status: "SUCCESS",
    };
  }

  // --- 1. signature ----------------------------------------------------
  const signatureValid = verifyCheckoutSignature({
    orderId: input.gatewayOrderId,
    paymentId: input.gatewayPaymentId,
    signature: input.signature,
  });

  if (!signatureValid) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED", failureReason: "Signature verification failed" },
    });

    logger.error(
      { paymentId: payment.id, gatewayOrderId: input.gatewayOrderId },
      "payment signature verification FAILED",
    );

    await recordAudit({
      actor: input.actor ?? {},
      action: "PAYMENT_VERIFIED",
      entity: "Payment",
      entityId: payment.id,
      after: { result: "signature_invalid" },
    });

    throw new AppError("We could not verify that payment. No money has been taken.", {
      status: 400,
      code: "PAYMENT_VERIFICATION_FAILED",
    });
  }

  // --- 2. ask Razorpay what actually happened --------------------------
  const gatewayPayment = await fetchPayment(input.gatewayPaymentId);

  const amountMatches = gatewayPayment.amount === payment.amountPaise;
  const orderMatches = gatewayPayment.order_id === input.gatewayOrderId;
  const captured = gatewayPayment.status === "captured";

  if (!amountMatches || !orderMatches || !captured) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "FAILED",
        gatewayPaymentId: input.gatewayPaymentId,
        gatewayPayload: gatewayPayment as unknown as Prisma.InputJsonValue,
        failureReason: !captured
          ? `Gateway status is ${gatewayPayment.status}`
          : !amountMatches
            ? `Amount mismatch: expected ${payment.amountPaise}, gateway reported ${gatewayPayment.amount}`
            : "Order mismatch",
      },
    });

    logger.error(
      {
        paymentId: payment.id,
        expected: payment.amountPaise,
        actual: gatewayPayment.amount,
        status: gatewayPayment.status,
      },
      "payment verification failed at the gateway check",
    );

    throw new AppError(
      "That payment could not be confirmed. If money has left your account, contact the clinic with your reference.",
      { status: 400, code: "PAYMENT_NOT_CAPTURED" },
    );
  }

  // --- 3. record it ----------------------------------------------------
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "SUCCESS",
        gatewayPaymentId: input.gatewayPaymentId,
        gatewaySignature: input.signature,
        gatewayPayload: gatewayPayment as unknown as Prisma.InputJsonValue,
        verifiedAt: now,
        paidAt: now,
        method: mapMethod(gatewayPayment.method),
      },
    });

    if (payment.invoiceId) {
      await applyPaymentToInvoice(tx, payment.invoiceId, payment.amountPaise);
    }

    await queueNotification(
      {
        templateKey: TEMPLATE_KEYS.PAYMENT_RECEIPT,
        channel: "WHATSAPP",
        recipient: payment.patient?.phone ?? "",
        variables: {
          amount: formatPaise(payment.amountPaise),
          reference: payment.reference,
          date: now.toLocaleDateString("en-IN"),
        },
        patientId: payment.patientId,
        dedupeKey: `receipt:${payment.id}`,
      },
      tx,
    );
  });

  await recordAudit({
    actor: input.actor ?? {},
    action: "PAYMENT_VERIFIED",
    entity: "Payment",
    entityId: payment.id,
    after: { status: "SUCCESS", amountPaise: payment.amountPaise, verifiedAt: now },
  });

  logger.info({ paymentId: payment.id, amountPaise: payment.amountPaise }, "payment verified");

  return {
    paymentId: payment.id,
    reference: payment.reference,
    amountPaise: payment.amountPaise,
    status: "SUCCESS",
  };
}

/**
 * Applies a payment to an invoice inside the caller's transaction.
 *
 * Reads the invoice inside the transaction rather than trusting a value read
 * earlier — two payments settling concurrently against one invoice would
 * otherwise both compute the balance from the same stale starting point.
 */
async function applyPaymentToInvoice(
  tx: Prisma.TransactionClient,
  invoiceId: string,
  amountPaise: number,
): Promise<void> {
  const invoice = await tx.invoice.findUnique({
    where: { id: invoiceId },
    select: { totalPaise: true, paidPaise: true },
  });

  if (!invoice) return;

  const paidPaise = invoice.paidPaise + amountPaise;
  const balancePaise = Math.max(0, invoice.totalPaise - paidPaise);

  await tx.invoice.update({
    where: { id: invoiceId },
    data: {
      paidPaise,
      balancePaise,
      status: balancePaise === 0 ? "PAID" : "PARTIALLY_PAID",
      paidAt: balancePaise === 0 ? new Date() : null,
    },
  });
}

function mapMethod(method?: string) {
  switch (method) {
    case "upi":
      return "UPI" as const;
    case "card":
      return "CARD" as const;
    case "netbanking":
      return "BANK_TRANSFER" as const;
    default:
      return "RAZORPAY" as const;
  }
}

/**
 * Webhook reconciliation.
 *
 * The webhook is the safety net for the case where the patient's browser closed
 * before the callback fired — the money left their account and, without this,
 * nobody at the clinic would know.
 */
export async function reconcileWebhookPayment(event: {
  event: string;
  payload: { payment?: { entity?: { id?: string; order_id?: string; status?: string; amount?: number } } };
}): Promise<{ handled: boolean; reason?: string }> {
  const entity = event.payload.payment?.entity;
  if (!entity?.order_id || !entity.id) return { handled: false, reason: "No payment entity" };

  const payment = await prisma.payment.findUnique({
    where: { gatewayOrderId: entity.order_id },
    select: { id: true, status: true, amountPaise: true, verifiedAt: true, invoiceId: true },
  });

  if (!payment) return { handled: false, reason: "Unknown order" };
  if (payment.status === "SUCCESS" && payment.verifiedAt) return { handled: true };

  if (event.event === "payment.captured" && entity.status === "captured") {
    if (entity.amount !== payment.amountPaise) {
      logger.error(
        { paymentId: payment.id, expected: payment.amountPaise, actual: entity.amount },
        "webhook amount mismatch",
      );
      return { handled: false, reason: "Amount mismatch" };
    }

    const now = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: "SUCCESS",
          gatewayPaymentId: entity.id,
          gatewayPayload: entity as unknown as Prisma.InputJsonValue,
          verifiedAt: now,
          paidAt: now,
        },
      });

      if (payment.invoiceId) {
        await applyPaymentToInvoice(tx, payment.invoiceId, payment.amountPaise);
      }
    });

    logger.info({ paymentId: payment.id }, "payment reconciled from webhook");
    return { handled: true };
  }

  if (event.event === "payment.failed") {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "FAILED",
        gatewayPaymentId: entity.id,
        failureReason: "Reported failed by the gateway",
      },
    });
    return { handled: true };
  }

  return { handled: false, reason: `Unhandled event ${event.event}` };
}
