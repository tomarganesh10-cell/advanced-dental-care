import { prisma, type Prisma } from "@/lib/db";
import type { LeadSource } from "@/lib/db";
import { logger } from "@/lib/logger";
import { generateLeadReference } from "@/server/booking/references";
import { queueNotification } from "@/server/notifications/dispatch";
import { TEMPLATE_KEYS } from "@/server/notifications/templates";

/**
 * Lead capture.
 *
 * Every enquiry — contact form, international enquiry, phone call logged by
 * reception — becomes a Lead. The point is that the clinic can answer "which
 * channel produced paying patients", which is the only way to know whether the
 * ad spend is working. Attribution is captured at first touch and never
 * overwritten.
 */

export interface CaptureLeadInput {
  fullName: string;
  phone: string;
  email?: string | null;
  city?: string | null;
  country?: string | null;
  serviceSlug?: string | null;
  treatmentInterest?: string | null;
  message?: string | null;
  source?: LeadSource;
  isInternational?: boolean;
  internationalDetails?: Record<string, unknown>;
  attribution?: {
    utmSource?: string | null;
    utmMedium?: string | null;
    utmCampaign?: string | null;
    utmContent?: string | null;
    utmTerm?: string | null;
    landingPage?: string | null;
    referrer?: string | null;
    gclid?: string | null;
  };
  /** Set when reception logs the enquiry rather than the patient submitting it. */
  createdByStaffId?: string | null;
  /** Whether the enquirer agreed to be messaged on WhatsApp. */
  whatsappConsent?: boolean;
}

export interface CaptureLeadResult {
  leadId: string;
  reference: string;
  isDuplicate: boolean;
}

/**
 * Window in which a repeat enquiry from the same number is treated as the same
 * lead rather than a new one. Someone filling in two forms in an afternoon is
 * one person, and two rows means two staff members ring them.
 */
const DEDUPE_WINDOW_HOURS = 24;

export async function captureLead(input: CaptureLeadInput): Promise<CaptureLeadResult> {
  const since = new Date(Date.now() - DEDUPE_WINDOW_HOURS * 60 * 60 * 1000);

  const existing = await prisma.lead.findFirst({
    where: {
      phone: input.phone,
      deletedAt: null,
      createdAt: { gte: since },
      status: { notIn: ["WON", "LOST"] },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, reference: true },
  });

  if (existing) {
    // Record the repeat contact as an activity rather than a duplicate row —
    // "enquired twice" is itself useful signal for whoever calls them.
    await prisma.leadActivity.create({
      data: {
        leadId: existing.id,
        type: "NOTE",
        summary: "Repeat enquiry from the website",
        detail: input.message ?? null,
        staffId: input.createdByStaffId ?? null,
      },
    });

    return { leadId: existing.id, reference: existing.reference, isDuplicate: true };
  }

  const reference = await generateLeadReference();

  const lead = await prisma.$transaction(async (tx) => {
    const created = await tx.lead.create({
      data: {
        reference,
        fullName: input.fullName,
        phone: input.phone,
        email: input.email ?? null,
        city: input.city ?? null,
        country: input.country ?? null,
        serviceSlug: input.serviceSlug ?? null,
        treatmentInterest: input.treatmentInterest ?? null,
        message: input.message ?? null,
        source: input.source ?? "WEBSITE",
        status: "NEW",
        isInternational: input.isInternational ?? false,
        internationalDetails: input.internationalDetails
          ? (input.internationalDetails as Prisma.InputJsonValue)
          : undefined,
        utmSource: input.attribution?.utmSource ?? null,
        utmMedium: input.attribution?.utmMedium ?? null,
        utmCampaign: input.attribution?.utmCampaign ?? null,
        utmContent: input.attribution?.utmContent ?? null,
        utmTerm: input.attribution?.utmTerm ?? null,
        landingPage: input.attribution?.landingPage ?? null,
        referrerUrl: input.attribution?.referrer ?? null,
        gclid: input.attribution?.gclid ?? null,
        // First follow-up is due the next working morning.
        nextFollowUpAt: new Date(Date.now() + 16 * 60 * 60 * 1000),
      },
      select: { id: true, reference: true },
    });

    await tx.leadActivity.create({
      data: {
        leadId: created.id,
        type: "NOTE",
        summary: `Enquiry received via ${input.source ?? "WEBSITE"}`,
        detail: input.message ?? null,
        staffId: input.createdByStaffId ?? null,
      },
    });

    // Immediate acknowledgement. Only on WhatsApp if they opted in — an
    // unsolicited WhatsApp message to someone who ticked nothing is both a
    // policy breach and a bad first impression.
    if (input.whatsappConsent) {
      await queueNotification(
        {
          templateKey: TEMPLATE_KEYS.LEAD_ACKNOWLEDGEMENT,
          channel: "WHATSAPP",
          recipient: input.phone,
          variables: {
            name: input.fullName.split(" ")[0] ?? input.fullName,
            treatment: input.treatmentInterest ?? "your enquiry",
          },
          leadId: created.id,
          dedupeKey: `lead-ack:${created.id}`,
        },
        tx,
      );
    }

    if (input.email) {
      await queueNotification(
        {
          templateKey: TEMPLATE_KEYS.LEAD_ACKNOWLEDGEMENT,
          channel: "EMAIL",
          recipient: input.email,
          variables: {
            name: input.fullName.split(" ")[0] ?? input.fullName,
            treatment: input.treatmentInterest ?? "your enquiry",
          },
          leadId: created.id,
          dedupeKey: `lead-ack-email:${created.id}`,
        },
        tx,
      );
    }

    return created;
  });

  logger.info({ leadId: lead.id, source: input.source }, "lead captured");

  return { leadId: lead.id, reference: lead.reference, isDuplicate: false };
}

/**
 * Schedules the follow-up sequence for a lead that has not booked.
 *
 * Three messages over seven days, then it stops. A sequence that keeps going
 * until the person replies is the reason people block clinic numbers, and
 * WhatsApp will suspend a business account for it. Any reply, booking or opt-out
 * cancels the remaining messages — see `cancelLeadFollowUps`.
 */
export async function scheduleLeadFollowUps(leadId: string): Promise<void> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      fullName: true,
      phone: true,
      status: true,
      serviceSlug: true,
      treatmentInterest: true,
    },
  });

  if (!lead || lead.status !== "NEW") return;

  const firstName = lead.fullName.split(" ")[0] ?? lead.fullName;
  const day = 24 * 60 * 60 * 1000;

  const sequence = [
    { key: TEMPLATE_KEYS.LEAD_FOLLOW_UP_1, delay: 1 * day, tag: "d1" },
    { key: TEMPLATE_KEYS.LEAD_FOLLOW_UP_3, delay: 3 * day, tag: "d3" },
    { key: TEMPLATE_KEYS.LEAD_FOLLOW_UP_7, delay: 7 * day, tag: "d7" },
  ];

  for (const step of sequence) {
    await queueNotification({
      templateKey: step.key,
      channel: "WHATSAPP",
      recipient: lead.phone,
      variables: {
        name: firstName,
        treatment: lead.treatmentInterest ?? "dental treatment",
        infoUrl: lead.serviceSlug ? `/services/${lead.serviceSlug}` : "/services",
      },
      leadId: lead.id,
      scheduledFor: new Date(Date.now() + step.delay),
      dedupeKey: `lead-followup:${step.tag}:${lead.id}`,
    });
  }
}

/** Stops the remaining follow-ups. Called on reply, booking or opt-out. */
export async function cancelLeadFollowUps(leadId: string, reason: string): Promise<number> {
  const result = await prisma.notificationMessage.updateMany({
    where: { leadId, status: "QUEUED", dedupeKey: { startsWith: "lead-followup:" } },
    data: { status: "SUPPRESSED", suppressionReason: reason },
  });
  return result.count;
}
