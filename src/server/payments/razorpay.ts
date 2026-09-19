import { createHmac, timingSafeEqual } from "node:crypto";
import { env, features } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * Razorpay integration.
 *
 * The single rule this file exists to enforce: the CLIENT NEVER DECIDES THAT A
 * PAYMENT SUCCEEDED.
 *
 * The browser receives a payment id and a signature from Razorpay's checkout
 * and posts them back. Those values are attacker-controllable — anyone can POST
 * whatever they like to our callback. A payment is only marked SUCCESS after:
 *
 *   1. the HMAC signature over `order_id|payment_id` verifies against our
 *      secret, and
 *   2. the payment is fetched back from Razorpay's API and confirmed captured
 *      for the expected amount.
 *
 * Step 2 matters as much as step 1: a valid signature proves the ids came from
 * a real Razorpay flow, not that the money was actually captured for the right
 * amount.
 */

const API_BASE = "https://api.razorpay.com/v1";

function authHeader(): string {
  if (!features.payments) {
    throw new AppError("Online payment is not configured.", {
      status: 503,
      code: "PAYMENTS_UNCONFIGURED",
    });
  }
  const token = Buffer.from(
    `${env.NEXT_PUBLIC_RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`,
  ).toString("base64");
  return `Basic ${token}`;
}

export interface CreateOrderInput {
  amountPaise: number;
  /** Our own payment reference, echoed back on the webhook. */
  receipt: string;
  notes?: Record<string, string>;
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
}

export async function createOrder(input: CreateOrderInput): Promise<RazorpayOrder> {
  if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0) {
    throw new AppError("Invalid payment amount.", { status: 400, code: "INVALID_AMOUNT" });
  }

  const response = await fetch(`${API_BASE}/orders`, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: input.amountPaise,
      currency: "INR",
      receipt: input.receipt,
      notes: input.notes,
      // Capture automatically once authorised; a two-step capture would leave
      // authorised-but-uncaptured payments for staff to chase.
      payment_capture: 1,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    logger.error({ status: response.status, detail }, "razorpay order creation failed");
    throw new AppError("We could not start the payment. Please try again.", {
      status: 502,
      code: "PAYMENT_GATEWAY_ERROR",
    });
  }

  return (await response.json()) as RazorpayOrder;
}

/** Verifies the checkout callback signature. */
export function verifyCheckoutSignature(input: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  if (!env.RAZORPAY_KEY_SECRET) return false;

  const expected = createHmac("sha256", env.RAZORPAY_KEY_SECRET)
    .update(`${input.orderId}|${input.paymentId}`)
    .digest("hex");

  return safeEqual(expected, input.signature);
}

/** Verifies an inbound webhook body against the webhook secret. */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  if (!env.RAZORPAY_WEBHOOK_SECRET || !signature) return false;

  const expected = createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");

  return safeEqual(expected, signature);
}

export interface RazorpayPayment {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: "created" | "authorized" | "captured" | "refunded" | "failed";
  method?: string;
  error_description?: string;
  captured?: boolean;
}

/**
 * Fetches a payment from Razorpay.
 *
 * This is the authoritative check. Whatever the client claimed, this is what
 * Razorpay says happened.
 */
export async function fetchPayment(paymentId: string): Promise<RazorpayPayment> {
  const response = await fetch(`${API_BASE}/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: authHeader() },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    logger.error({ status: response.status, paymentId }, "razorpay payment fetch failed");
    throw new AppError("We could not confirm that payment. Please contact the clinic.", {
      status: 502,
      code: "PAYMENT_VERIFICATION_FAILED",
    });
  }

  return (await response.json()) as RazorpayPayment;
}

export interface RefundInput {
  paymentId: string;
  amountPaise?: number;
  notes?: Record<string, string>;
}

export async function createRefund(input: RefundInput): Promise<{ id: string; status: string }> {
  const response = await fetch(
    `${API_BASE}/payments/${encodeURIComponent(input.paymentId)}/refund`,
    {
      method: "POST",
      headers: { Authorization: authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(input.amountPaise ? { amount: input.amountPaise } : {}),
        notes: input.notes,
      }),
      signal: AbortSignal.timeout(20_000),
    },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    logger.error({ status: response.status, detail }, "razorpay refund failed");
    throw new AppError("The refund could not be processed. Please try again.", {
      status: 502,
      code: "REFUND_FAILED",
    });
  }

  return (await response.json()) as { id: string; status: string };
}

/** Constant-time hex comparison. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return timingSafeEqual(bufA, bufB);
}
