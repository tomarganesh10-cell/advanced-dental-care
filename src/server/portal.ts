import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { recordAudit } from "./audit";
import type { PatientPrincipal } from "./auth/session";

/**
 * Patient portal queries.
 *
 * Every function here takes the principal and scopes on `principal.patientId`
 * inside the query. There is no function that accepts a patient id from the
 * caller, because that is the shape of the bug — a route handler that reads
 * `params.patientId` and forgets to compare it to the session.
 *
 * The portal also shows a deliberately narrower slice of the record than staff
 * see. A patient gets their diagnosis, their plan and their prescriptions; they
 * do not get a clinician's private working notes, which exist so clinicians can
 * think in writing and would be misread out of context.
 */

export async function getPortalOverview(principal: PatientPrincipal) {
  const [patient, upcoming, recentCompleted, plan, outstandingInvoices, documentCount] =
    await Promise.all([
      prisma.patient.findFirst({
        where: { id: principal.patientId, deletedAt: null },
        select: {
          id: true,
          fullName: true,
          patientNumber: true,
          phone: true,
          email: true,
          dateOfBirth: true,
        },
      }),
      prisma.appointment.findMany({
        where: {
          patientId: principal.patientId,
          deletedAt: null,
          startsAt: { gte: new Date() },
          status: { in: ["REQUESTED", "PENDING_CONFIRMATION", "CONFIRMED", "RESCHEDULED"] },
        },
        orderBy: { startsAt: "asc" },
        take: 3,
        select: {
          id: true,
          reference: true,
          startsAt: true,
          status: true,
          serviceName: true,
          doctor: { select: { displayName: true } },
        },
      }),
      prisma.appointment.findMany({
        where: { patientId: principal.patientId, deletedAt: null, status: "COMPLETED" },
        orderBy: { startsAt: "desc" },
        take: 3,
        select: { id: true, startsAt: true, serviceName: true },
      }),
      prisma.treatmentPlan.findFirst({
        where: {
          patientId: principal.patientId,
          deletedAt: null,
          // Only plans staff have chosen to share. A DRAFT plan is a clinician
          // thinking out loud and should not reach the patient half-formed.
          isVisibleToPatient: true,
          status: { in: ["PROPOSED", "ACCEPTED", "IN_PROGRESS"] },
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          summary: true,
          status: true,
          estimatedTotalPaise: true,
          items: {
            orderBy: { sequence: "asc" },
            select: {
              id: true,
              description: true,
              status: true,
              quantity: true,
              unitPricePaise: true,
              toothNumbers: true,
            },
          },
        },
      }),
      prisma.invoice.findMany({
        where: {
          patientId: principal.patientId,
          deletedAt: null,
          status: { in: ["ISSUED", "PARTIALLY_PAID"] },
        },
        orderBy: { issuedAt: "desc" },
        select: {
          id: true,
          number: true,
          totalPaise: true,
          paidPaise: true,
          balancePaise: true,
          issuedAt: true,
          dueAt: true,
          status: true,
        },
      }),
      prisma.patientDocument.count({
        where: {
          patientId: principal.patientId,
          deletedAt: null,
          isVisibleToPatient: true,
        },
      }),
    ]);

  if (!patient) throw new NotFoundError("Patient record not found.");

  return { patient, upcoming, recentCompleted, plan, outstandingInvoices, documentCount };
}

/**
 * Appointments, already split into upcoming and past.
 *
 * The split happens here rather than in the page because deciding what counts
 * as "upcoming" means reading the clock, and a component body is supposed to be
 * pure. Doing it once on the server also guarantees both lists agree about
 * where "now" is.
 */
export async function getPortalAppointments(principal: PatientPrincipal) {
  const now = new Date();

  const appointments = await prisma.appointment.findMany({
    where: { patientId: principal.patientId, deletedAt: null },
    orderBy: { startsAt: "desc" },
    take: 50,
    select: {
      id: true,
      reference: true,
      startsAt: true,
      endsAt: true,
      status: true,
      serviceName: true,
      cancellationReason: true,
      doctor: { select: { displayName: true } },
    },
  });

  const upcoming = appointments.filter(
    (appointment) =>
      appointment.startsAt.getTime() >= now.getTime() &&
      !["CANCELLED", "COMPLETED", "NO_SHOW", "RESCHEDULED"].includes(appointment.status),
  );

  const upcomingIds = new Set(upcoming.map((appointment) => appointment.id));

  return {
    all: appointments,
    upcoming: [...upcoming].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()),
    past: appointments.filter((appointment) => !upcomingIds.has(appointment.id)),
  };
}

/**
 * Documents the patient is allowed to see.
 *
 * `isVisibleToPatient` defaults to false: staff decide explicitly what a patient
 * should see without a clinician present. An un-discussed radiograph or a
 * pathology report landing in a portal is not information, it is anxiety.
 */
export async function getPortalDocuments(principal: PatientPrincipal) {
  return prisma.patientDocument.findMany({
    where: {
      patientId: principal.patientId,
      deletedAt: null,
      isVisibleToPatient: true,
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      kind: true,
      title: true,
      description: true,
      mimeType: true,
      sizeBytes: true,
      takenAt: true,
      createdAt: true,
    },
  });
}

/**
 * Resolves one document for download, scoped to the signed-in patient.
 *
 * Returns null rather than throwing a distinguishable error when the document
 * belongs to someone else — a different response for "not yours" and "does not
 * exist" would confirm which document ids are real.
 */
export async function getPortalDocumentForDownload(
  principal: PatientPrincipal,
  documentId: string,
): Promise<{ storageKey: string; title: string; mimeType: string } | null> {
  const document = await prisma.patientDocument.findFirst({
    where: {
      id: documentId,
      patientId: principal.patientId,
      deletedAt: null,
      isVisibleToPatient: true,
    },
    select: { id: true, storageKey: true, title: true, mimeType: true },
  });

  if (!document) return null;

  // Downloading a health record is an access event worth keeping.
  await recordAudit({
    actor: { userId: principal.userId, label: principal.fullName, role: "PATIENT" },
    action: "DOWNLOAD",
    entity: "PatientDocument",
    entityId: document.id,
  });

  return { storageKey: document.storageKey, title: document.title, mimeType: document.mimeType };
}

export async function getPortalInvoices(principal: PatientPrincipal) {
  return prisma.invoice.findMany({
    where: {
      patientId: principal.patientId,
      deletedAt: null,
      // A DRAFT invoice is not yet a bill and should not appear as one.
      status: { not: "DRAFT" },
    },
    orderBy: { issuedAt: "desc" },
    select: {
      id: true,
      number: true,
      status: true,
      subtotalPaise: true,
      discountPaise: true,
      taxPaise: true,
      totalPaise: true,
      paidPaise: true,
      balancePaise: true,
      issuedAt: true,
      dueAt: true,
      paidAt: true,
      items: {
        orderBy: { sequence: "asc" },
        select: {
          id: true,
          description: true,
          quantity: true,
          unitPricePaise: true,
          discountPaise: true,
          lineTotalPaise: true,
        },
      },
    },
  });
}

export async function getPortalPrescriptions(principal: PatientPrincipal) {
  return prisma.prescription.findMany({
    where: { patientId: principal.patientId, supersededById: null },
    orderBy: { issuedAt: "desc" },
    take: 20,
    select: {
      id: true,
      reference: true,
      issuedAt: true,
      notes: true,
      doctor: { select: { displayName: true } },
      items: {
        orderBy: { sequence: "asc" },
        select: {
          id: true,
          drugName: true,
          strength: true,
          dosage: true,
          frequency: true,
          durationDays: true,
          instructions: true,
        },
      },
    },
  });
}
