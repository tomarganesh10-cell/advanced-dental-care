import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { reconcileWebhookPayment } from "@/server/payments/service";
import { verifyWebhookSignature } from "@/server/payments/razorpay";

export const dynamic = "force-dynamic";

/**
 * POST /api/payments/webhook
 *
 * Razorpay webhook receiver.
 *
 * Three things this handler gets deliberately right:
 *
 *  1. It reads the RAW body and verifies the HMAC before parsing. Parsing first
 *     and re-serialising would change the bytes and break the signature — and
 *     accepting an unverified body means anyone who learns this URL can mark
 *     invoices paid.
 *  2. It is idempotent. Razorpay retries until it gets a 2xx, so the same
 *     event will arrive more than once; reconcile checks `verifiedAt` and
 *     no-ops on an already-settled payment. This is also what makes a replayed
 *     capture event harmless.
 *  3. It returns 200 for events it does not handle. A non-2xx tells Razorpay to
 *     retry forever, so an unrecognised event type would turn into a permanent
 *     retry loop.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature");

  if (!verifyWebhookSignature(rawBody, signature)) {
    logger.warn({ hasSignature: Boolean(signature) }, "razorpay webhook signature rejected");
    // 401 without detail: an attacker probing this endpoint learns nothing
    // about why it failed.
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let event: {
    event: string;
    payload: { payment?: { entity?: Record<string, unknown> } };
  };

  try {
    event = JSON.parse(rawBody);
  } catch {
    logger.warn("razorpay webhook body was not valid JSON");
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  try {
    const result = await reconcileWebhookPayment(
      event as Parameters<typeof reconcileWebhookPayment>[0],
    );

    if (!result.handled) {
      logger.info({ event: event.event, reason: result.reason }, "webhook event not actioned");
    }
  } catch (error) {
    // Log and still return 200: a 500 makes Razorpay retry, and if the failure
    // is deterministic that retry loop never ends. The failure is visible in
    // the logs and the payment stays unsettled for staff to resolve.
    logger.error(
      { err: (error as Error).message, event: event.event },
      "webhook processing failed",
    );
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
