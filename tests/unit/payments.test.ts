import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Payment signature verification.
 *
 * These run as unit tests because they are pure crypto — but they cover the
 * single most security-critical decision in the application: whether a payment
 * callback arriving from an untrusted browser is genuine.
 */

const SECRET = "test_secret_key_value";
const WEBHOOK_SECRET = "test_webhook_secret";

vi.mock("@/lib/env", () => ({
  env: {
    RAZORPAY_KEY_SECRET: SECRET,
    RAZORPAY_WEBHOOK_SECRET: WEBHOOK_SECRET,
    NEXT_PUBLIC_RAZORPAY_KEY_ID: "rzp_test_key",
    // The module under test imports the logger, which reads these at load.
    LOG_LEVEL: "silent",
    NODE_ENV: "test",
  },
  features: { payments: true },
  isProduction: false,
}));

const { verifyCheckoutSignature, verifyWebhookSignature } = await import(
  "@/server/payments/razorpay"
);

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

describe("Razorpay signature verification", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("checkout callback", () => {
    it("accepts a correctly signed callback", () => {
      const orderId = "order_ABC123";
      const paymentId = "pay_XYZ789";
      const signature = sign(`${orderId}|${paymentId}`, SECRET);

      expect(verifyCheckoutSignature({ orderId, paymentId, signature })).toBe(true);
    });

    it("rejects a forged signature", () => {
      expect(
        verifyCheckoutSignature({
          orderId: "order_ABC123",
          paymentId: "pay_XYZ789",
          signature: "deadbeef".repeat(8),
        }),
      ).toBe(false);
    });

    it("rejects an empty signature", () => {
      expect(
        verifyCheckoutSignature({
          orderId: "order_ABC123",
          paymentId: "pay_XYZ789",
          signature: "",
        }),
      ).toBe(false);
    });

    /**
     * The substitution attack: take a valid signature from a small payment and
     * present it alongside a different order. The HMAC covers both ids
     * together, so it cannot transfer.
     */
    it("rejects a signature that was valid for a different order", () => {
      const signature = sign("order_CHEAP|pay_XYZ789", SECRET);

      expect(
        verifyCheckoutSignature({
          orderId: "order_EXPENSIVE",
          paymentId: "pay_XYZ789",
          signature,
        }),
      ).toBe(false);
    });

    it("rejects a signature that was valid for a different payment", () => {
      const signature = sign("order_ABC123|pay_OTHER", SECRET);

      expect(
        verifyCheckoutSignature({
          orderId: "order_ABC123",
          paymentId: "pay_XYZ789",
          signature,
        }),
      ).toBe(false);
    });

    it("rejects a signature made with the wrong secret", () => {
      const orderId = "order_ABC123";
      const paymentId = "pay_XYZ789";
      const signature = sign(`${orderId}|${paymentId}`, "attacker_guess");

      expect(verifyCheckoutSignature({ orderId, paymentId, signature })).toBe(false);
    });

    it("rejects a truncated signature rather than matching a prefix", () => {
      const orderId = "order_ABC123";
      const paymentId = "pay_XYZ789";
      const full = sign(`${orderId}|${paymentId}`, SECRET);

      expect(
        verifyCheckoutSignature({ orderId, paymentId, signature: full.slice(0, 32) }),
      ).toBe(false);
    });
  });

  describe("webhook", () => {
    it("accepts a correctly signed body", () => {
      const body = JSON.stringify({ event: "payment.captured", payload: {} });
      expect(verifyWebhookSignature(body, sign(body, WEBHOOK_SECRET))).toBe(true);
    });

    it("rejects a missing signature header", () => {
      const body = JSON.stringify({ event: "payment.captured" });
      expect(verifyWebhookSignature(body, null)).toBe(false);
    });

    it("rejects a body that has been altered after signing", () => {
      const original = JSON.stringify({ event: "payment.captured", amount: 100 });
      const signature = sign(original, WEBHOOK_SECRET);
      const tampered = JSON.stringify({ event: "payment.captured", amount: 1000000 });

      expect(verifyWebhookSignature(tampered, signature)).toBe(false);
    });

    /**
     * The webhook secret is separate from the API secret. A leaked checkout
     * signature must not let anyone forge webhooks.
     */
    it("rejects a body signed with the checkout secret", () => {
      const body = JSON.stringify({ event: "payment.captured" });
      expect(verifyWebhookSignature(body, sign(body, SECRET))).toBe(false);
    });

    it("rejects whitespace-different JSON, because the raw bytes are what is signed", () => {
      const original = '{"event":"payment.captured"}';
      const signature = sign(original, WEBHOOK_SECRET);
      const reserialised = '{ "event": "payment.captured" }';

      expect(verifyWebhookSignature(reserialised, signature)).toBe(false);
      expect(verifyWebhookSignature(original, signature)).toBe(true);
    });
  });
});
