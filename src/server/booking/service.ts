import { prisma, type Prisma } from "@/lib/db";
import type { AppointmentChannel, AppointmentStatus, LeadSource } from "@/lib/db";
import { ConflictError, NotFoundError, SlotUnavailableError, ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { formatClinicDate, formatClinicTime } from "@/lib/time";
import { getService } from "@data/services";
import { recordAudit, type AuditActor } from "@/server/audit";
import { queueMultiChannel, queueNotification } from "@/server/notifications/dispatch";
import { TEMPLATE_KEYS } from "@/server/notifications/templates";
import {
  cancelScheduledReminders,
  scheduleAppointmentReminders,
} from "@/server/notifications/worker";
import { checkSlotBookable } from "./availability";
import {
  allocatePatientNumber,
  generateAppointmentReference,
  generateLeadReference,
} from "./references";
import { assertTransition } from "./state-machine";

/**
 * Booking service.
 *
 * The critical property here is that the availability check and the insert
 * happen inside one transaction at SERIALIZABLE isolation. Checking
 * availability in application code and then inserting is a textbook race: two
 * patients both see a free 4:30pm, both pass the check, both insert. Postgres
 * serialisation makes the second transaction fail rather than double-book, and
 * the caller retries or is told the slot went.
 */

export interface BookAppointmentInput {
  fullName: string;
  /** E.164, already normalised by the Zod schema at the edge. */
  phone: string;
  email?: string | null;
  isNewPatient: boolean;
  serviceSlug?: string | null;
  doctorId: string;
  startsAt: Date;
  durationMinutes: number;
  patientNote?: string | null;
  channel?: AppointmentChannel;
  /** Set when reception books on the patient's behalf. */
  createdByStaffId?: string | null;
  /** Reuse an existing patient record instead of matching on phone. */
  patientId?: string | null;
  /** Marketing attribution from the booking page. */
  attribution?: {
    utmSource?: string | null;
    utmMedium?: string | null;
    utmCampaign?: string | null;
    utmContent?: string | null;
    utmTerm?: string | null;
    landingPage?: string | null;
    referrerUrl?: string | null;
    gclid?: string | null;
  };
  actor?: AuditActor;
  /** Admin bookings may ignore the public lead-time rule. */
  ignoreLeadTime?: boolean;
  consents?: {
    whatsapp?: boolean;
    email?: boolean;
  };
}

export interface BookAppointmentResult {
  appointmentId: string;
  reference: string;
  patientId: string;
  status: AppointmentStatus;
  startsAt: Date;
  endsAt: Date;
}

/**
 * Finds an existing patient by phone, or creates one.
 *
 * Matching on phone alone is a deliberate trade-off. It occasionally merges two
 * family members who share a number, which reception can split; the alternative
 * — creating a new chart per booking — produces duplicate records that nobody
 * ever reconciles, which is worse for clinical safety.
 */
async function findOrCreatePatient(
  tx: Prisma.TransactionClient,
  input: BookAppointmentInput,
): Promise<{ id: string; isNew: boolean; fullName: string; email: string | null; phone: string }> {
  if (input.patientId) {
    const existing = await tx.patient.findUnique({
      where: { id: input.patientId },
      select: { id: true, fullName: true, email: true, phone: true, deletedAt: true },
    });
    if (!existing || existing.deletedAt) throw new NotFoundError("Patient record not found.");
    return { ...existing, isNew: false };
  }

  const byPhone = await tx.patient.findFirst({
    where: { phone: input.phone, deletedAt: null },
    select: { id: true, fullName: true, email: true, phone: true },
    orderBy: { createdAt: "asc" },
  });

  if (byPhone) {
    // Fill in an email we did not have before, but never overwrite a name the
    // clinic may have corrected in person.
    if (input.email && !byPhone.email) {
      await tx.patient.update({ where: { id: byPhone.id }, data: { email: input.email } });
    }
    return { ...byPhone, isNew: false };
  }

  const patientNumber = await allocatePatientNumber();

  const created = await tx.patient.create({
    data: {
      patientNumber,
      fullName: input.fullName.trim(),
      phone: input.phone,
      email: input.email ?? null,
      acquisitionSource: input.attribution?.utmSource ?? "WEBSITE",
    },
    select: { id: true, fullName: true, email: true, phone: true },
  });

  return { ...created, isNew: true };
}

async function recordConsents(
  tx: Prisma.TransactionClient,
  patientId: string,
  consents: BookAppointmentInput["consents"],
  ipAddress?: string | null,
): Promise<void> {
  if (!consents) return;

  const now = new Date();
  const entries: Array<{ type: "WHATSAPP_MESSAGING" | "EMAIL_MARKETING"; granted: boolean }> = [];

  if (consents.whatsapp !== undefined) {
    entries.push({ type: "WHATSAPP_MESSAGING", granted: consents.whatsapp });
  }
  if (consents.email !== undefined) {
    entries.push({ type: "EMAIL_MARKETING", granted: consents.email });
  }

  for (const entry of entries) {
    await tx.patientConsent.create({
      data: {
        patientId,
        type: entry.type,
        granted: entry.granted,
        grantedAt: entry.granted ? now : null,
        method: "PORTAL",
        documentVersion: "booking-form-v1",
        ipAddress: ipAddress ?? null,
      },
    });
  }
}

export async function bookAppointment(input: BookAppointmentInput): Promise<BookAppointmentResult> {
  const service = input.serviceSlug ? getService(input.serviceSlug) : undefined;
  if (input.serviceSlug && !service) {
    throw new ValidationError("That treatment is not one we offer online. Please call the clinic.");
  }

  if (input.durationMinutes <= 0 || input.durationMinutes > 480) {
    throw new ValidationError("That appointment length is not valid.");
  }

  const endsAt = new Date(input.startsAt.getTime() + input.durationMinutes * 60 * 1000);

  const result = await prisma.$transaction(
    async (tx) => {
      // Authoritative availability check, inside the transaction.
      const slotCheck = await checkSlotBookable(
        {
          doctorId: input.doctorId,
          startsAt: input.startsAt,
          endsAt,
          serviceSlug: input.serviceSlug,
          ignoreLeadTime: input.ignoreLeadTime,
        },
        tx as unknown as typeof prisma,
      );

      if (!slotCheck.ok) throw new SlotUnavailableError(slotCheck.reason);

      const patient = await findOrCreatePatient(tx, input);

      // Reject a second booking for the same patient at the same time. This is
      // a different failure from the slot being full — it catches a double
      // form submission, which is by far the most common cause.
      const duplicate = await tx.appointment.findFirst({
        where: {
          patientId: patient.id,
          deletedAt: null,
          status: { notIn: ["CANCELLED", "NO_SHOW", "RESCHEDULED"] },
          startsAt: { lt: endsAt },
          endsAt: { gt: input.startsAt },
        },
        select: { id: true, reference: true },
      });

      if (duplicate) {
        throw new ConflictError(
          `You already have an appointment booked at that time (${duplicate.reference}).`,
        );
      }

      await recordConsents(tx, patient.id, input.consents, input.actor?.ipAddress);

      const reference = await generateAppointmentReference();

      // Every website booking is also a CRM lead, so marketing attribution and
      // conversion are measurable from one place.
      const leadReference = await generateLeadReference();
      const lead = await tx.lead.create({
        data: {
          reference: leadReference,
          fullName: patient.fullName,
          phone: patient.phone,
          email: patient.email,
          serviceSlug: input.serviceSlug ?? null,
          treatmentInterest: service?.name ?? null,
          source: (input.channel === "WALK_IN"
            ? "WALK_IN"
            : input.channel === "PHONE"
              ? "PHONE"
              : "WEBSITE") as LeadSource,
          status: "APPOINTMENT_BOOKED",
          patientId: patient.id,
          utmSource: input.attribution?.utmSource ?? null,
          utmMedium: input.attribution?.utmMedium ?? null,
          utmCampaign: input.attribution?.utmCampaign ?? null,
          utmContent: input.attribution?.utmContent ?? null,
          utmTerm: input.attribution?.utmTerm ?? null,
          landingPage: input.attribution?.landingPage ?? null,
          referrerUrl: input.attribution?.referrerUrl ?? null,
          gclid: input.attribution?.gclid ?? null,
        },
        select: { id: true },
      });

      const appointment = await tx.appointment.create({
        data: {
          reference,
          patientId: patient.id,
          doctorId: input.doctorId,
          serviceSlug: input.serviceSlug ?? null,
          serviceName: service?.name ?? null,
          // A website booking is a request until the clinic confirms it.
          // Auto-confirming would commit the doctor's diary to whoever filled
          // in a form, which is not how a clinic runs.
          status: input.createdByStaffId ? "CONFIRMED" : "REQUESTED",
          channel: input.channel ?? "WEBSITE",
          startsAt: input.startsAt,
          endsAt,
          durationMinutes: input.durationMinutes,
          isNewPatient: input.isNewPatient,
          patientNote: input.patientNote ?? null,
          createdByStaffId: input.createdByStaffId ?? null,
          leadId: lead.id,
          confirmedAt: input.createdByStaffId ? new Date() : null,
        },
        select: { id: true, reference: true, status: true, startsAt: true, endsAt: true },
      });

      await tx.appointmentStatusEvent.create({
        data: {
          appointmentId: appointment.id,
          fromStatus: null,
          toStatus: appointment.status,
          actorId: input.actor?.userId ?? null,
          actorLabel: input.actor?.label ?? patient.fullName,
          reason: "Booking created",
        },
      });

      await tx.leadActivity.create({
        data: {
          leadId: lead.id,
          type: "APPOINTMENT_LINKED",
          summary: `Appointment ${reference} booked for ${formatClinicDate(input.startsAt)} at ${formatClinicTime(input.startsAt)}`,
          staffId: input.createdByStaffId ?? null,
        },
      });

      // Queued inside the transaction — see the note in dispatch.ts.
      await queueMultiChannel(
        {
          templateKey: TEMPLATE_KEYS.APPOINTMENT_REQUESTED,
          variables: {
            patientName: patient.fullName,
            reference,
            dateTime: `${formatClinicDate(input.startsAt)} at ${formatClinicTime(input.startsAt)}`,
            treatment: service?.name ?? "Dental consultation",
          },
          patientId: patient.id,
          appointmentId: appointment.id,
          dedupeKey: `requested:${appointment.id}`,
          channels: [
            { channel: "WHATSAPP", recipient: patient.phone },
            { channel: "EMAIL", recipient: patient.email },
          ],
        },
        tx,
      );

      return {
        appointmentId: appointment.id,
        reference: appointment.reference,
        patientId: patient.id,
        status: appointment.status,
        startsAt: appointment.startsAt,
        endsAt: appointment.endsAt,
        patientIsNew: patient.isNew,
      };
    },
    {
      // SERIALIZABLE is what actually prevents the double-booking race. The
      // cost is occasional serialisation failures under contention, which the
      // API layer surfaces as "that slot just went".
      isolationLevel: "Serializable",
      timeout: 15_000,
    },
  );

  await recordAudit({
    actor: input.actor ?? {},
    action: "CREATE",
    entity: "Appointment",
    entityId: result.appointmentId,
    after: {
      reference: result.reference,
      status: result.status,
      startsAt: result.startsAt,
      doctorId: input.doctorId,
      serviceSlug: input.serviceSlug,
    },
  });

  if (result.status === "CONFIRMED") {
    await scheduleAppointmentReminders(result.appointmentId);
  }

  logger.info(
    { appointmentId: result.appointmentId, reference: result.reference },
    "appointment booked",
  );

  return result;
}

// ---------------------------------------------------------------------------
// Status transitions
// ---------------------------------------------------------------------------

export interface TransitionInput {
  appointmentId: string;
  to: AppointmentStatus;
  reason?: string | null;
  actor?: AuditActor;
  /** Staff id, for the status history. */
  actorStaffId?: string | null;
}

export async function transitionAppointment(input: TransitionInput): Promise<void> {
  const appointment = await prisma.appointment.findUnique({
    where: { id: input.appointmentId },
    select: {
      id: true,
      status: true,
      reference: true,
      startsAt: true,
      serviceName: true,
      patient: { select: { id: true, fullName: true, phone: true, email: true } },
      doctor: { select: { displayName: true } },
    },
  });

  if (!appointment) throw new NotFoundError("Appointment not found.");

  assertTransition(appointment.status, input.to);

  const now = new Date();

  // Timestamp columns that correspond to the destination status.
  const timestamps: Partial<Record<string, Date | string | null>> = {};
  switch (input.to) {
    case "CONFIRMED":
      timestamps.confirmedAt = now;
      break;
    case "CHECKED_IN":
      timestamps.checkedInAt = now;
      break;
    case "IN_PROGRESS":
      timestamps.startedAt = now;
      break;
    case "COMPLETED":
      timestamps.completedAt = now;
      break;
    case "CANCELLED":
      timestamps.cancelledAt = now;
      timestamps.cancellationReason = input.reason ?? null;
      timestamps.cancelledBy = input.actor?.userId ?? null;
      break;
    case "NO_SHOW":
      timestamps.noShowAt = now;
      break;
    default:
      break;
  }

  await prisma.$transaction(async (tx) => {
    await tx.appointment.update({
      where: { id: appointment.id },
      data: { status: input.to, ...timestamps },
    });

    await tx.appointmentStatusEvent.create({
      data: {
        appointmentId: appointment.id,
        fromStatus: appointment.status,
        toStatus: input.to,
        actorId: input.actor?.userId ?? null,
        actorLabel: input.actor?.label ?? null,
        reason: input.reason ?? null,
      },
    });

    const variables = {
      patientName: appointment.patient.fullName,
      reference: appointment.reference,
      date: formatClinicDate(appointment.startsAt),
      time: formatClinicTime(appointment.startsAt),
      doctorName: appointment.doctor?.displayName ?? "our dental team",
      treatment: appointment.serviceName ?? "your appointment",
    };

    if (input.to === "CONFIRMED") {
      await queueMultiChannel(
        {
          templateKey: TEMPLATE_KEYS.APPOINTMENT_CONFIRMED,
          variables,
          patientId: appointment.patient.id,
          appointmentId: appointment.id,
          dedupeKey: `confirmed:${appointment.id}`,
          channels: [
            { channel: "WHATSAPP", recipient: appointment.patient.phone },
            { channel: "EMAIL", recipient: appointment.patient.email },
          ],
        },
        tx,
      );
    }

    if (input.to === "CANCELLED") {
      await queueNotification(
        {
          templateKey: TEMPLATE_KEYS.APPOINTMENT_CANCELLED,
          channel: "WHATSAPP",
          recipient: appointment.patient.phone,
          variables,
          patientId: appointment.patient.id,
          appointmentId: appointment.id,
          dedupeKey: `cancelled:${appointment.id}`,
        },
        tx,
      );
    }
  });

  if (input.to === "CONFIRMED") {
    await scheduleAppointmentReminders(appointment.id);
  }

  if (input.to === "CANCELLED" || input.to === "RESCHEDULED") {
    await cancelScheduledReminders(appointment.id);
  }

  if (input.to === "COMPLETED") {
    await createReviewRequest(appointment.id);
  }

  await recordAudit({
    actor: input.actor ?? {},
    action: "STATUS_CHANGE",
    entity: "Appointment",
    entityId: appointment.id,
    before: { status: appointment.status },
    after: { status: input.to },
    metadata: { reason: input.reason ?? null },
  });
}

/**
 * Reschedule.
 *
 * Creates a NEW appointment and marks the old one RESCHEDULED, rather than
 * editing the original row in place. The history then shows both the original
 * and the replacement, which matters when a patient says "but you moved me
 * twice".
 */
export interface RescheduleInput {
  appointmentId: string;
  startsAt: Date;
  durationMinutes?: number;
  doctorId?: string;
  reason?: string | null;
  actor?: AuditActor;
  actorStaffId?: string | null;
  ignoreLeadTime?: boolean;
}

export async function rescheduleAppointment(
  input: RescheduleInput,
): Promise<BookAppointmentResult> {
  const original = await prisma.appointment.findUnique({
    where: { id: input.appointmentId },
    select: {
      id: true,
      status: true,
      patientId: true,
      doctorId: true,
      serviceSlug: true,
      serviceName: true,
      durationMinutes: true,
      isNewPatient: true,
      patientNote: true,
      leadId: true,
      channel: true,
      patient: { select: { id: true, fullName: true, phone: true, email: true } },
    },
  });

  if (!original) throw new NotFoundError("Appointment not found.");

  if (
    !["REQUESTED", "PENDING_CONFIRMATION", "CONFIRMED", "RESCHEDULE_REQUESTED"].includes(
      original.status,
    )
  ) {
    throw new ConflictError(
      `An appointment that is ${original.status.toLowerCase()} cannot be rescheduled.`,
    );
  }

  const doctorId = input.doctorId ?? original.doctorId;
  if (!doctorId) throw new ValidationError("A doctor must be assigned before rescheduling.");

  const durationMinutes = input.durationMinutes ?? original.durationMinutes;
  const endsAt = new Date(input.startsAt.getTime() + durationMinutes * 60 * 1000);

  const result = await prisma.$transaction(
    async (tx) => {
      const slotCheck = await checkSlotBookable(
        {
          doctorId,
          startsAt: input.startsAt,
          endsAt,
          serviceSlug: original.serviceSlug,
          excludeAppointmentId: original.id,
          ignoreLeadTime: input.ignoreLeadTime,
        },
        tx as unknown as typeof prisma,
      );

      if (!slotCheck.ok) throw new SlotUnavailableError(slotCheck.reason);

      const reference = await generateAppointmentReference();

      const replacement = await tx.appointment.create({
        data: {
          reference,
          patientId: original.patientId,
          doctorId,
          serviceSlug: original.serviceSlug,
          serviceName: original.serviceName,
          status: "CONFIRMED",
          channel: original.channel,
          startsAt: input.startsAt,
          endsAt,
          durationMinutes,
          isNewPatient: original.isNewPatient,
          patientNote: original.patientNote,
          leadId: original.leadId,
          rescheduledFromId: original.id,
          confirmedAt: new Date(),
        },
        select: { id: true, reference: true, status: true, startsAt: true, endsAt: true },
      });

      await tx.appointment.update({
        where: { id: original.id },
        data: { status: "RESCHEDULED" },
      });

      await tx.appointmentStatusEvent.createMany({
        data: [
          {
            appointmentId: original.id,
            fromStatus: original.status,
            toStatus: "RESCHEDULED",
            actorId: input.actor?.userId ?? null,
            actorLabel: input.actor?.label ?? null,
            reason: input.reason ?? `Moved to ${reference}`,
          },
          {
            appointmentId: replacement.id,
            fromStatus: null,
            toStatus: "CONFIRMED",
            actorId: input.actor?.userId ?? null,
            actorLabel: input.actor?.label ?? null,
            reason: `Rescheduled from ${original.id}`,
          },
        ],
      });

      await queueMultiChannel(
        {
          templateKey: TEMPLATE_KEYS.APPOINTMENT_RESCHEDULED,
          variables: {
            patientName: original.patient.fullName,
            reference: replacement.reference,
            date: formatClinicDate(input.startsAt),
            time: formatClinicTime(input.startsAt),
            doctorName: original.serviceName ?? "our dental team",
          },
          patientId: original.patientId,
          appointmentId: replacement.id,
          dedupeKey: `rescheduled:${replacement.id}`,
          channels: [
            { channel: "WHATSAPP", recipient: original.patient.phone },
            { channel: "EMAIL", recipient: original.patient.email },
          ],
        },
        tx,
      );

      return {
        appointmentId: replacement.id,
        reference: replacement.reference,
        patientId: original.patientId,
        status: replacement.status,
        startsAt: replacement.startsAt,
        endsAt: replacement.endsAt,
      };
    },
    { isolationLevel: "Serializable", timeout: 15_000 },
  );

  await cancelScheduledReminders(original.id);
  await scheduleAppointmentReminders(result.appointmentId);

  await recordAudit({
    actor: input.actor ?? {},
    action: "UPDATE",
    entity: "Appointment",
    entityId: original.id,
    before: { status: original.status },
    after: { status: "RESCHEDULED", replacementId: result.appointmentId },
    metadata: { reason: input.reason ?? null },
  });

  return result;
}

/** Creates the post-visit feedback request. Token is single-use and expiring. */
async function createReviewRequest(appointmentId: string): Promise<void> {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      id: true,
      patient: { select: { id: true, fullName: true, phone: true } },
    },
  });

  if (!appointment) return;

  const { generateToken } = await import("@/server/auth/tokens");
  const { env } = await import("@/lib/env");

  const token = generateToken(24);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await prisma.reviewRequest.create({
    data: {
      patientId: appointment.patient.id,
      appointmentId: appointment.id,
      token,
      expiresAt,
      status: "PENDING",
    },
  });

  // Sent a few hours after the visit rather than immediately — asking for
  // feedback while the patient is still numb is not a fair sample.
  await queueNotification({
    templateKey: TEMPLATE_KEYS.FEEDBACK_REQUEST,
    channel: "WHATSAPP",
    recipient: appointment.patient.phone,
    variables: {
      patientName: appointment.patient.fullName,
      feedbackUrl: `${env.NEXT_PUBLIC_SITE_URL}/feedback/${token}`,
    },
    patientId: appointment.patient.id,
    appointmentId: appointment.id,
    scheduledFor: new Date(Date.now() + 4 * 60 * 60 * 1000),
    dedupeKey: `feedback:${appointment.id}`,
  });
}
