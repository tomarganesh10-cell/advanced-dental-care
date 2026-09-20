import { createHmac } from "node:crypto";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { reconcileWebhookPayment, verifyAndCapturePayment } from "@/server/payments/service";
import { createPatient } from "./factories";

/**
 * Payment verification against the database.
 *
 * The property under test throughout: a payment reaches SUCCESS only when the
 * signature verifies AND Razorpay independently confirms it was captured for
 * the expected amount. Everything the browser sends is treated as a claim, not
 * a fact.
 */

const SECRET = process.env.RAZORPAY_KEY_SECRET ?? "test_secret_for_integration";

function sign(orderId: string, paymentId: string): string {
  return createHmac("sha256", SECRET).update(`${orderId}|${paymentId}`).digest("hex");
}

async function createPendingPayment(options: { amountPaise?: number; orderId?: string } = {}) {
  const patient = await createPatient();
  const amountPaise = options.amountPaise ?? 500000;
  const gatewayOrderId = options.orderId ?? `order_${Math.random().toString(36).slice(2, 12)}`;

  const payment = await prisma.payment.create({
    data: {
      reference: `TEST-PY-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      patientId: patient.id,
      amountPaise,
      status: "CREATED",
      method: "RAZORPAY",
      gatewayOrderId,
    },
  });

  return { patient, payment, gatewayOrderId, amountPaise };
}

describe("payment verification", () => {
  beforeEach(() => {
    vi.stubEnv("RAZORPAY_KEY_SECRET", SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("refuses a forged signature and marks the payment failed", async () => {
    const { gatewayOrderId, payment } = await createPendingPayment();

    await expect(
      verifyAndCapturePayment({
        gatewayOrderId,
        gatewayPaymentId: "pay_forged",
        signature: "0".repeat(64),
      }),
    ).rejects.toThrow(/could not verify/i);

    const updated = await prisma.payment.findUnique({ where: { id: payment.id } });

    expect(updated?.status).toBe("FAILED");
    // The critical assertion: never verified, so it can never be counted as
    // revenue by a report that filters on verifiedAt.
    expect(updated?.verifiedAt).toBeNull();
  });

  it("records an audit entry for a rejected signature", async () => {
    const { gatewayOrderId, payment } = await createPendingPayment();

    await expect(
      verifyAndCapturePayment({
        gatewayOrderId,
        gatewayPaymentId: "pay_forged",
        signature: "0".repeat(64),
      }),
    ).rejects.toThrow();

    const audit = await prisma.auditLog.findFirst({
      where: { entity: "Payment", entityId: payment.id, action: "PAYMENT_VERIFIED" },
    });

    expect(audit).toBeTruthy();
  });

  it("refuses an unknown order", async () => {
    await expect(
      verifyAndCapturePayment({
        gatewayOrderId: "order_does_not_exist",
        gatewayPaymentId: "pay_x",
        signature: sign("order_does_not_exist", "pay_x"),
      }),
    ).rejects.toThrow(/could not find/i);
  });

  describe("webhook reconciliation", () => {
    it("settles a payment the browser never reported", async () => {
      const { gatewayOrderId, payment, amountPaise } = await createPendingPayment();

      const result = await reconcileWebhookPayment({
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: "pay_webhook_1",
              order_id: gatewayOrderId,
              status: "captured",
              amount: amountPaise,
            },
          },
        },
      });

      expect(result.handled).toBe(true);

      const updated = await prisma.payment.findUnique({ where: { id: payment.id } });
      expect(updated?.status).toBe("SUCCESS");
      expect(updated?.verifiedAt).toBeTruthy();
    });

    /**
     * The webhook is retried by Razorpay until it gets a 2xx, and a replayed
     * capture event must not credit the invoice twice.
     */
    it("is idempotent against a replayed event", async () => {
      const { gatewayOrderId, payment, amountPaise } = await createPendingPayment();

      const event = {
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: "pay_webhook_2",
              order_id: gatewayOrderId,
              status: "captured",
              amount: amountPaise,
            },
          },
        },
      };

      await reconcileWebhookPayment(event);
      const afterFirst = await prisma.payment.findUnique({ where: { id: payment.id } });

      await reconcileWebhookPayment(event);
      await reconcileWebhookPayment(event);

      const afterReplays = await prisma.payment.findUnique({ where: { id: payment.id } });

      expect(afterReplays?.status).toBe("SUCCESS");
      // The verification timestamp did not move, proving the later events were
      // no-ops rather than re-processing.
      expect(afterReplays?.verifiedAt?.getTime()).toBe(afterFirst?.verifiedAt?.getTime());
    });

    /**
     * The attack this blocks: a forged webhook claiming a large capture against
     * a small order. The signature check happens in the route; this is the
     * second line — the amounts must match.
     */
    it("refuses an event whose amount does not match the order", async () => {
      const { gatewayOrderId, payment } = await createPendingPayment({ amountPaise: 500000 });

      const result = await reconcileWebhookPayment({
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: "pay_webhook_3",
              order_id: gatewayOrderId,
              status: "captured",
              amount: 100,
            },
          },
        },
      });

      expect(result.handled).toBe(false);
      expect(result.reason).toMatch(/amount/i);

      const updated = await prisma.payment.findUnique({ where: { id: payment.id } });
      expect(updated?.status).toBe("CREATED");
      expect(updated?.verifiedAt).toBeNull();
    });

    it("records a failure event", async () => {
      const { gatewayOrderId, payment } = await createPendingPayment();

      const result = await reconcileWebhookPayment({
        event: "payment.failed",
        payload: {
          payment: {
            entity: {
              id: "pay_failed",
              order_id: gatewayOrderId,
              status: "failed",
              amount: 500000,
            },
          },
        },
      });

      expect(result.handled).toBe(true);

      const updated = await prisma.payment.findUnique({ where: { id: payment.id } });
      expect(updated?.status).toBe("FAILED");
      expect(updated?.verifiedAt).toBeNull();
    });

    it("ignores an event for an order it does not know", async () => {
      const result = await reconcileWebhookPayment({
        event: "payment.captured",
        payload: {
          payment: {
            entity: { id: "pay_x", order_id: "order_unknown", status: "captured", amount: 1000 },
          },
        },
      });

      expect(result.handled).toBe(false);
    });

    it("settles the linked invoice when a payment is captured", async () => {
      const patient = await createPatient();

      const invoice = await prisma.invoice.create({
        data: {
          number: "TEST-INV-PAY",
          patientId: patient.id,
          status: "ISSUED",
          subtotalPaise: 500000,
          totalPaise: 500000,
          balancePaise: 500000,
          issuedAt: new Date(),
        },
      });

      const gatewayOrderId = "order_with_invoice";

      await prisma.payment.create({
        data: {
          reference: "TEST-PY-INV",
          patientId: patient.id,
          invoiceId: invoice.id,
          amountPaise: 500000,
          status: "CREATED",
          method: "RAZORPAY",
          gatewayOrderId,
        },
      });

      await reconcileWebhookPayment({
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: "pay_invoice",
              order_id: gatewayOrderId,
              status: "captured",
              amount: 500000,
            },
          },
        },
      });

      const updatedInvoice = await prisma.invoice.findUnique({ where: { id: invoice.id } });

      expect(updatedInvoice?.status).toBe("PAID");
      expect(updatedInvoice?.paidPaise).toBe(500000);
      expect(updatedInvoice?.balancePaise).toBe(0);
      expect(updatedInvoice?.paidAt).toBeTruthy();
    });

    it("marks an invoice partially paid when the payment covers only part of it", async () => {
      const patient = await createPatient();

      const invoice = await prisma.invoice.create({
        data: {
          number: "TEST-INV-PARTIAL",
          patientId: patient.id,
          status: "ISSUED",
          subtotalPaise: 1000000,
          totalPaise: 1000000,
          balancePaise: 1000000,
          issuedAt: new Date(),
        },
      });

      const gatewayOrderId = "order_partial";

      await prisma.payment.create({
        data: {
          reference: "TEST-PY-PARTIAL",
          patientId: patient.id,
          invoiceId: invoice.id,
          amountPaise: 400000,
          status: "CREATED",
          method: "RAZORPAY",
          gatewayOrderId,
        },
      });

      await reconcileWebhookPayment({
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: "pay_partial",
              order_id: gatewayOrderId,
              status: "captured",
              amount: 400000,
            },
          },
        },
      });

      const updated = await prisma.invoice.findUnique({ where: { id: invoice.id } });

      expect(updated?.status).toBe("PARTIALLY_PAID");
      expect(updated?.paidPaise).toBe(400000);
      expect(updated?.balancePaise).toBe(600000);
      expect(updated?.paidAt).toBeNull();
    });
  });
});
