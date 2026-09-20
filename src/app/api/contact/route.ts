import { apiSuccess, withApiHandler } from "@/lib/api";
import { env } from "@/lib/env";
import { RateLimitError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { clientKeyFromHeaders, rateLimit } from "@/lib/rate-limit";
import { contactEnquirySchema } from "@/lib/validation/booking";
import { captureLead, scheduleLeadFollowUps } from "@/server/crm/leads";

export const dynamic = "force-dynamic";

const INTENT_LABELS: Record<string, { label: string; serviceSlug?: string }> = {
  "book-appointment": { label: "Appointment request" },
  "dental-implants": { label: "Dental implants", serviceSlug: "dental-implants" },
  "smile-makeover": { label: "Smile makeover", serviceSlug: "smile-design" },
  "braces-aligners": { label: "Braces or aligners", serviceSlug: "invisalign" },
  "root-canal": { label: "Root canal treatment", serviceSlug: "root-canal" },
  general: { label: "General dentistry", serviceSlug: "general-dentistry" },
  international: { label: "International patient enquiry" },
};

/**
 * POST /api/contact
 *
 * Website enquiry → CRM lead. Rate limited per client and protected by a
 * honeypot field.
 */
export const POST = withApiHandler(async (request) => {
  const clientKey = clientKeyFromHeaders(request.headers);

  const limit = await rateLimit(`contact:${clientKey}`, env.RATE_LIMIT_BOOKING_PER_HOUR, 3600);
  if (!limit.allowed) {
    throw new RateLimitError(
      limit.retryAfterSeconds,
      "Too many enquiries. Please call the clinic.",
    );
  }

  const body = await request.json();
  const input = contactEnquirySchema.parse(body);

  // Honeypot. Returns success so a bot cannot tell it was filtered, but nothing
  // is written. Telling a scraper its submission failed just teaches it.
  if (input.company && input.company.length > 0) {
    logger.info({ clientKey }, "contact form honeypot triggered");
    return apiSuccess({ received: true, reference: null as string | null });
  }

  const intent = INTENT_LABELS[input.intent] ?? { label: "General enquiry" };

  const result = await captureLead({
    fullName: input.fullName,
    phone: input.phone,
    email: input.email || null,
    serviceSlug: intent.serviceSlug ?? null,
    treatmentInterest: intent.label,
    message: input.message || null,
    source: input.intent === "international" ? "INTERNATIONAL" : "WEBSITE",
    isInternational: input.intent === "international",
    whatsappConsent: input.whatsappConsent,
    attribution: {
      utmSource: input.attribution?.utmSource ?? null,
      utmMedium: input.attribution?.utmMedium ?? null,
      utmCampaign: input.attribution?.utmCampaign ?? null,
      utmContent: input.attribution?.utmContent ?? null,
      utmTerm: input.attribution?.utmTerm ?? null,
      landingPage: input.attribution?.landingPage ?? null,
      referrer: input.attribution?.referrer ?? null,
      gclid: input.attribution?.gclid ?? null,
    },
  });

  // Only start the nurture sequence for a genuinely new lead, and only with
  // consent — see the note in scheduleLeadFollowUps.
  if (!result.isDuplicate && input.whatsappConsent) {
    await scheduleLeadFollowUps(result.leadId);
  }

  return apiSuccess({ received: true, reference: result.reference });
});
