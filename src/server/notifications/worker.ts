import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { sendEmail, sendSms, sendWhatsApp } from "./providers";

/**
 * Outbox drain.
 *
 * Picks up QUEUED messages whose scheduledFor has passed and attempts delivery.
 * Called by the background worker on a timer, and by an authenticated admin
 * endpoint so a stuck queue can be nudged without shell access.
 *
 * Failure handling distinguishes retryable from permanent. Retrying a message
 * Meta rejected as malformed just burns quota and delays the queue behind it;
 * retrying a timeout is exactly right.
 */

const BATCH_SIZE = 25;
/** Exponential-ish backoff between attempts, in minutes. */
const RETRY_DELAYS_MINUTES = [2, 10, 60];

export interface DrainResult {
  attempted: number;
  sent: number;
  failed: number;
  deferred: number;
}

export async function drainNotificationQueue(limit = BATCH_SIZE): Promise<DrainResult> {
  const now = new Date();

  const pending = await prisma.notificationMessage.findMany({
    where: {
      status: { in: ["QUEUED", "SENDING"] },
      scheduledFor: { lte: now },
      attempts: { lt: prisma.notificationMessage.fields.maxAttempts },
    },
    orderBy: { scheduledFor: "asc" },
    take: limit,
  });

  const result: DrainResult = { attempted: 0, sent: 0, failed: 0, deferred: 0 };

  for (const message of pending) {
    // Claim the row. If another worker got there first, updateMany matches
    // nothing and we skip it rather than sending twice.
    const claimed = await prisma.notificationMessage.updateMany({
      where: { id: message.id, status: { in: ["QUEUED", "SENDING"] } },
      data: { status: "SENDING", attempts: { increment: 1 }, lastAttemptAt: now },
    });

    if (claimed.count === 0) continue;

    result.attempted += 1;

    const payload = (message.payload ?? {}) as {
      providerTemplateName?: string | null;
      variables?: Record<string, string>;
    };

    const sendResult = await (async () => {
      switch (message.channel) {
        case "WHATSAPP":
          return sendWhatsApp({
            to: message.recipient,
            body: message.body,
            templateName: payload.providerTemplateName ?? undefined,
            templateVariables: payload.variables ? Object.values(payload.variables) : undefined,
          });
        case "EMAIL":
          return sendEmail({
            to: message.recipient,
            subject: message.subject ?? "Advanced Dental Care Centre",
            body: message.body,
          });
        case "SMS":
          return sendSms({ to: message.recipient, body: message.body });
        case "IN_APP":
          // Nothing to transmit — the portal reads these rows directly.
          return { ok: true as const };
      }
    })();

    if (sendResult.ok) {
      await prisma.notificationMessage.update({
        where: { id: message.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          providerMessageId: sendResult.providerMessageId ?? null,
          errorMessage: null,
        },
      });
      result.sent += 1;
      continue;
    }

    const attemptsUsed = message.attempts + 1;
    const canRetry = sendResult.retryable !== false && attemptsUsed < message.maxAttempts;

    if (canRetry) {
      const delayMinutes =
        RETRY_DELAYS_MINUTES[Math.min(attemptsUsed - 1, RETRY_DELAYS_MINUTES.length - 1)] ?? 60;
      await prisma.notificationMessage.update({
        where: { id: message.id },
        data: {
          status: "QUEUED",
          scheduledFor: new Date(Date.now() + delayMinutes * 60 * 1000),
          errorMessage: sendResult.error ?? null,
        },
      });
      result.deferred += 1;
    } else {
      await prisma.notificationMessage.update({
        where: { id: message.id },
        data: { status: "FAILED", failedAt: new Date(), errorMessage: sendResult.error ?? null },
      });
      result.failed += 1;
      logger.warn(
        { messageId: message.id, channel: message.channel, error: sendResult.error },
        "notification permanently failed",
      );
    }
  }

  return result;
}

/**
 * Schedules the 24h and 2h reminders for a confirmed appointment.
 *
 * Reminders are queued as future-dated outbox rows rather than computed by a
 * cron scan, so a reminder cannot be missed because the scanner was down at the
 * wrong minute. The dedupe key means re-confirming an appointment does not
 * double-send.
 */
export async function scheduleAppointmentReminders(appointmentId: string): Promise<void> {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      id: true,
      startsAt: true,
      status: true,
      serviceName: true,
      patient: { select: { id: true, fullName: true, phone: true, email: true } },
      doctor: { select: { displayName: true } },
    },
  });

  if (!appointment || appointment.status !== "CONFIRMED") return;

  const { queueNotification } = await import("./dispatch");
  const { TEMPLATE_KEYS } = await import("./templates");
  const { formatClinicDate, formatClinicTime } = await import("@/lib/time");

  const variables = {
    patientName: appointment.patient.fullName,
    date: formatClinicDate(appointment.startsAt),
    time: formatClinicTime(appointment.startsAt),
    doctorName: appointment.doctor?.displayName ?? "our dental team",
    treatment: appointment.serviceName ?? "your appointment",
  };

  const reminders = [
    { key: TEMPLATE_KEYS.APPOINTMENT_REMINDER_24H, offsetMs: 24 * 60 * 60 * 1000, tag: "24h" },
    { key: TEMPLATE_KEYS.APPOINTMENT_REMINDER_2H, offsetMs: 2 * 60 * 60 * 1000, tag: "2h" },
  ];

  for (const reminder of reminders) {
    const scheduledFor = new Date(appointment.startsAt.getTime() - reminder.offsetMs);
    // An appointment booked for tomorrow morning is already inside the 24h
    // window; sending that reminder immediately would be noise.
    if (scheduledFor.getTime() <= Date.now()) continue;

    await queueNotification({
      templateKey: reminder.key,
      channel: "WHATSAPP",
      recipient: appointment.patient.phone,
      variables,
      patientId: appointment.patient.id,
      appointmentId: appointment.id,
      scheduledFor,
      dedupeKey: `reminder:${reminder.tag}:${appointment.id}`,
    });
  }
}

/** Cancels queued reminders when an appointment moves or is cancelled. */
export async function cancelScheduledReminders(appointmentId: string): Promise<number> {
  const result = await prisma.notificationMessage.updateMany({
    where: {
      appointmentId,
      status: "QUEUED",
      dedupeKey: { startsWith: "reminder:" },
    },
    data: { status: "SUPPRESSED", suppressionReason: "Appointment changed or cancelled" },
  });
  return result.count;
}
