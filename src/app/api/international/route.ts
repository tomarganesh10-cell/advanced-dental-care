import { apiSuccess, withApiHandler } from "@/lib/api";
import { prisma } from "@/lib/db";
import { RateLimitError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { clientKeyFromHeaders, rateLimit } from "@/lib/rate-limit";
import { internationalEnquirySchema } from "@/lib/validation/booking";
import { generateEnquiryReference } from "@/server/booking/references";
import { captureLead } from "@/server/crm/leads";
import { queueNotification } from "@/server/notifications/dispatch";
import { TEMPLATE_KEYS } from "@/server/notifications/templates";

export const dynamic = "force-dynamic";

/**
 * POST /api/international
 *
 * Dental tourism enquiry. Creates both an InternationalPatientEnquiry (the
 * operational record the patient coordinator works from) and a Lead (so the
 * enquiry appears in the same CRM pipeline and reporting as every other
 * channel).
 */
export const POST = withApiHandler(async (request) => {
  const clientKey = clientKeyFromHeaders(request.headers);

  const limit = await rateLimit(`international:${clientKey}`, 6, 3600);
  if (!limit.allowed) {
    throw new RateLimitError(
      limit.retryAfterSeconds,
      "Too many enquiries. Please email the clinic.",
    );
  }

  const body = await request.json();
  const input = internationalEnquirySchema.parse(body);

  if (input.company && input.company.length > 0) {
    logger.info({ clientKey }, "international form honeypot triggered");
    return apiSuccess({ received: true, reference: null as string | null });
  }

  const reference = await generateEnquiryReference();

  const lead = await captureLead({
    fullName: input.fullName,
    phone: input.phone,
    email: input.email,
    city: input.city || null,
    country: input.country,
    serviceSlug: input.serviceSlug ?? null,
    treatmentInterest: input.treatmentInterest,
    message: input.message || null,
    source: "INTERNATIONAL",
    isInternational: true,
    // Consent is explicit and required on this form, so messaging is permitted.
    whatsappConsent: Boolean(input.whatsapp),
    internationalDetails: {
      country: input.country,
      city: input.city || null,
      timezone: input.timezone ?? null,
      preferredTravelFrom: input.preferredTravelFrom || null,
      preferredTravelTo: input.preferredTravelTo || null,
    },
  });

  const enquiry = await prisma.internationalPatientEnquiry.create({
    data: {
      reference,
      fullName: input.fullName,
      email: input.email,
      phone: input.phone,
      whatsapp: input.whatsapp ?? null,
      country: input.country,
      city: input.city || null,
      timezone: input.timezone ?? null,
      treatmentInterest: input.treatmentInterest,
      serviceSlug: input.serviceSlug ?? null,
      message: input.message || null,
      preferredTravelFrom: input.preferredTravelFrom ? new Date(input.preferredTravelFrom) : null,
      preferredTravelTo: input.preferredTravelTo ? new Date(input.preferredTravelTo) : null,
      status: "NEW",
      leadId: lead.leadId,
    },
    select: { id: true, reference: true },
  });

  await queueNotification({
    templateKey: TEMPLATE_KEYS.INTERNATIONAL_ACKNOWLEDGEMENT,
    channel: "EMAIL",
    recipient: input.email,
    variables: {
      name: input.fullName.split(" ")[0] ?? input.fullName,
      country: input.country,
      treatment: input.treatmentInterest,
    },
    leadId: lead.leadId,
    dedupeKey: `intl-ack:${enquiry.id}`,
  });

  logger.info({ enquiryId: enquiry.id, country: input.country }, "international enquiry received");

  return apiSuccess({ received: true, reference: enquiry.reference });
});
