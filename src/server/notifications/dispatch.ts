import { prisma, type Prisma } from "@/lib/db";
import type { ConsentType, NotificationChannel } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { contact, identity } from "@data/clinic-master-data";
import { DEFAULT_TEMPLATES, renderTemplate, type TemplateKey } from "./templates";

/**
 * Queueing notifications.
 *
 * Messages are written to the `notification_messages` outbox inside the same
 * transaction as the business event that caused them, then sent by a worker.
 * That ordering is the point: if the booking transaction rolls back, the
 * confirmation was never queued, so the patient is never told about an
 * appointment that does not exist. The inverse — sending first, committing
 * second — produces exactly that failure.
 */

/** Which consent a channel requires before a message may be sent. */
const CHANNEL_CONSENT: Record<NotificationChannel, ConsentType | null> = {
  WHATSAPP: "WHATSAPP_MESSAGING",
  SMS: "SMS_MESSAGING",
  EMAIL: null, // transactional email about the patient's own appointment
  IN_APP: null,
};

export interface QueueNotificationInput {
  templateKey: TemplateKey;
  channel: NotificationChannel;
  recipient: string;
  variables: Record<string, string | number | undefined>;
  patientId?: string | null;
  appointmentId?: string | null;
  leadId?: string | null;
  scheduledFor?: Date;
  /** Stops the same logical message being queued twice. */
  dedupeKey?: string;
  language?: string;
}

/** Variables available to every template without the caller passing them. */
function clinicVariables(): Record<string, string> {
  return {
    clinicName: identity.displayName,
    clinicPhone: contact.phone.display,
    clinicAddress: contact.address.formatted,
    clinicEmail: contact.email.primary,
    bookingUrl: `${env.NEXT_PUBLIC_SITE_URL}/book-appointment`,
    portalUrl: `${env.NEXT_PUBLIC_SITE_URL}/patient-dashboard`,
    whatsappUrl: `https://wa.me/${contact.phone.whatsapp}`,
  };
}

/**
 * Checks whether a patient has consented to being messaged on this channel.
 *
 * Transactional email about the patient's own appointment does not require
 * marketing consent — it is the service they asked for. WhatsApp and SMS do,
 * because they are push channels on a personal device and because Meta's own
 * policy requires opt-in.
 */
async function isSuppressed(
  client: Prisma.TransactionClient | typeof prisma,
  channel: NotificationChannel,
  patientId: string | null | undefined,
): Promise<string | null> {
  const requiredConsent = CHANNEL_CONSENT[channel];
  if (!requiredConsent || !patientId) return null;

  const consent = await client.patientConsent.findFirst({
    where: { patientId, type: requiredConsent },
    orderBy: { createdAt: "desc" },
  });

  if (!consent) return `No ${requiredConsent} consent on record`;
  if (!consent.granted) return `${requiredConsent} consent was declined`;
  if (consent.revokedAt) return `${requiredConsent} consent was withdrawn`;
  if (consent.expiresAt && consent.expiresAt.getTime() < Date.now()) {
    return `${requiredConsent} consent has expired`;
  }

  return null;
}

export async function queueNotification(
  input: QueueNotificationInput,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<string | null> {
  const language = input.language ?? "en";

  const template =
    (await client.notificationTemplate.findFirst({
      where: { key: input.templateKey, channel: input.channel, language, isActive: true },
    })) ??
    // Fall back to the compiled-in default so a missing database row cannot
    // silently stop confirmations going out.
    DEFAULT_TEMPLATES.find(
      (t) => t.key === input.templateKey && t.channel === input.channel && t.language === language,
    );

  if (!template) {
    /**
     * A missing template used to return null and log, which meant a
     * confirmation could stop being sent and nobody would know until a patient
     * turned up on the wrong day. Now it writes a SUPPRESSED row instead, so
     * the gap is visible in Admin → Messages next to everything else.
     */
    logger.error(
      { templateKey: input.templateKey, channel: input.channel, language },
      "no notification template found — message suppressed",
    );

    try {
      const suppressed = await client.notificationMessage.create({
        data: {
          channel: input.channel,
          status: "SUPPRESSED",
          suppressionReason: `No ${input.channel} template for "${input.templateKey}" (${language})`,
          recipient: input.recipient,
          patientId: input.patientId ?? null,
          appointmentId: input.appointmentId ?? null,
          leadId: input.leadId ?? null,
          body: "",
          scheduledFor: input.scheduledFor ?? new Date(),
          dedupeKey: input.dedupeKey ? `missing-template:${input.dedupeKey}` : null,
        },
        select: { id: true },
      });
      return suppressed.id;
    } catch {
      // Even the suppression row failed. The log line above is the record.
      return null;
    }
  }

  const variables = { ...clinicVariables(), ...input.variables };
  const body = renderTemplate(template.body, variables);
  const subject = template.subject ? renderTemplate(template.subject, variables) : null;

  const suppressionReason = await isSuppressed(client, input.channel, input.patientId);

  try {
    const message = await client.notificationMessage.create({
      data: {
        templateId: "id" in template ? template.id : null,
        channel: input.channel,
        status: suppressionReason ? "SUPPRESSED" : "QUEUED",
        suppressionReason,
        recipient: input.recipient,
        patientId: input.patientId ?? null,
        appointmentId: input.appointmentId ?? null,
        leadId: input.leadId ?? null,
        subject,
        body,
        payload: {
          templateKey: input.templateKey,
          providerTemplateName:
            "providerTemplateName" in template ? (template.providerTemplateName ?? null) : null,
          variables: variables as Prisma.InputJsonValue,
        } as Prisma.InputJsonValue,
        scheduledFor: input.scheduledFor ?? new Date(),
        dedupeKey: input.dedupeKey ?? null,
      },
      select: { id: true },
    });

    return message.id;
  } catch (err) {
    // A unique violation on dedupeKey means this message is already queued,
    // which is the intended outcome, not an error.
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      logger.debug({ dedupeKey: input.dedupeKey }, "notification already queued, skipping duplicate");
      return null;
    }
    throw err;
  }
}

/**
 * Queues the same message on several channels, best-effort.
 * WhatsApp first, email as the durable record.
 */
export async function queueMultiChannel(
  input: Omit<QueueNotificationInput, "channel" | "recipient"> & {
    channels: Array<{ channel: NotificationChannel; recipient: string | null | undefined }>;
  },
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<string[]> {
  const ids: string[] = [];

  for (const { channel, recipient } of input.channels) {
    if (!recipient) continue;
    const id = await queueNotification(
      {
        ...input,
        channel,
        recipient,
        dedupeKey: input.dedupeKey ? `${input.dedupeKey}:${channel}` : undefined,
      },
      client,
    );
    if (id) ids.push(id);
  }

  return ids;
}
