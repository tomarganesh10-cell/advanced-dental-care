import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { clientKeyFromHeaders, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * POST /api/analytics
 *
 * First-party event collection, so campaign attribution survives ad blockers.
 *
 * Deliberately stores no personal data and no identifier that could be joined
 * back to a person: no IP, no user agent, no cookie id. It answers "how many
 * people started a booking from this campaign", not "who".
 *
 * Always returns 204, whatever happens. An analytics endpoint that returns
 * errors to the browser is an analytics endpoint that shows users error noise.
 */

const schema = z.object({
  name: z.string().max(64),
  path: z.string().max(500).optional(),
  utmSource: z.string().max(120).optional(),
  utmMedium: z.string().max(120).optional(),
  utmCampaign: z.string().max(200).optional(),
  referrer: z.string().max(500).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const ALLOWED_EVENTS = new Set([
  "booking_started",
  "booking_step_completed",
  "booking_completed",
  "click_to_call",
  "whatsapp_click",
  "directions_click",
  "treatment_page_view",
  "form_submitted",
  "international_enquiry",
  "review_link_click",
]);

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const clientKey = clientKeyFromHeaders(request.headers);
    const limit = await rateLimit(`analytics:${clientKey}`, 120, 3600);
    if (!limit.allowed) return new NextResponse(null, { status: 204 });

    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return new NextResponse(null, { status: 204 });

    const event = parsed.data;
    // Only events the app actually emits are stored, so this cannot be used as
    // an open write endpoint for arbitrary rows.
    if (!ALLOWED_EVENTS.has(event.name)) return new NextResponse(null, { status: 204 });

    await prisma.analyticsEvent.create({
      data: {
        name: event.name,
        path: event.path ?? null,
        utmSource: event.utmSource ?? null,
        utmMedium: event.utmMedium ?? null,
        utmCampaign: event.utmCampaign ?? null,
        referrer: event.referrer ?? null,
        metadata: event.metadata ? JSON.parse(JSON.stringify(event.metadata)) : undefined,
      },
    });
  } catch (err) {
    logger.debug({ err: (err as Error).message }, "analytics event dropped");
  }

  return new NextResponse(null, { status: 204 });
}
