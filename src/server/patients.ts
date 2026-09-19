import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/rbac";
import { recordAudit } from "./audit";
import { staffCan, type StaffPrincipal } from "./auth/session";

/** Whole years between a date of birth and now. */
function calculateAge(dateOfBirth: Date, now: Date = new Date()): number {
  let age = now.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - dateOfBirth.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < dateOfBirth.getUTCDate())) {
    age -= 1;
  }
  return Math.max(0, age);
}

/**
 * Patient record assembly, with the clinical/administrative split enforced here
 * rather than in the page.
 *
 * The split exists because most people who need a patient's phone number do not
 * need their diagnosis. Reception books, bills and checks people in all day and
 * has no clinical reason to read a note; marketing has no reason to be in this
 * file at all. Putting the boundary in the query means a new page cannot
 * accidentally render a note to someone who should not see it — the data simply
 * is not in the object.
 */

export interface PatientAdminView {
  id: string;
  patientNumber: string;
  fullName: string;
  phone: string;
  altPhone: string | null;
  email: string | null;
  dateOfBirth: Date | null;
  /**
   * Computed here rather than in the page. A component body reading the clock
   * is impure, and an age that differs between two parts of the same render is
   * a real (if rare) bug on a birthday.
   */
  age: number | null;
  gender: string | null;
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelation: string | null;
  isInternational: boolean;
  countryOfResidence: string | null;
  acquisitionSource: string | null;
  /** Short safety flag — shown to any staff member who can view the patient. */
  clinicalAlert: string | null;
  createdAt: Date;
  hasPortalAccount: boolean;
}

export interface PatientClinicalView {
  medicalHistory: {
    allergies: string[];
    currentMedications: string[];
    medicalConditions: string[];
    pastSurgeries: string[];
    isDiabetic: boolean;
    isHypertensive: boolean;
    isPregnant: boolean;
    isSmoker: boolean;
    bleedingDisorder: boolean;
    onBloodThinners: boolean;
    hasCardiacCondition: boolean;
    notes: string | null;
    dentalHistory: string | null;
    chiefComplaint: string | null;
    lastReviewedAt: Date | null;
  } | null;
  notes: Array<{
    id: string;
    createdAt: Date;
    chiefComplaint: string | null;
    examination: string | null;
    diagnosis: string | null;
    procedure: string | null;
    toothNumbers: string[];
    advice: string | null;
    /** Present only when the viewer holds CLINICAL_VIEW_PRIVATE. */
    privateNote: string | null;
    followUpDate: Date | null;
    lockedAt: Date | null;
    authorName: string | null;
    doctorName: string | null;
  }>;
  treatmentPlans: Array<{
    id: string;
    title: string;
    status: string;
    estimatedTotalPaise: number;
    proposedAt: Date | null;
    itemCount: number;
  }>;
  prescriptions: Array<{
    id: string;
    reference: string;
    issuedAt: Date;
    doctorName: string | null;
    itemCount: number;
  }>;
}

export async function getPatientForStaff(
  patientId: string,
  principal: StaffPrincipal,
): Promise<{ patient: PatientAdminView; clinical: PatientClinicalView | null }> {
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, deletedAt: null },
    select: {
      id: true,
      patientNumber: true,
      fullName: true,
      phone: true,
      altPhone: true,
      email: true,
      dateOfBirth: true,
      gender: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      state: true,
      postalCode: true,
      emergencyContactName: true,
      emergencyContactPhone: true,
      emergencyContactRelation: true,
      isInternational: true,
      countryOfResidence: true,
      acquisitionSource: true,
      clinicalAlert: true,
      createdAt: true,
      userId: true,
    },
  });

  if (!patient) throw new NotFoundError("Patient record not found.");

  const addressParts = [
    patient.addressLine1,
    patient.addressLine2,
    patient.city,
    patient.state,
    patient.postalCode,
  ].filter(Boolean);

  const adminView: PatientAdminView = {
    id: patient.id,
    patientNumber: patient.patientNumber,
    fullName: patient.fullName,
    phone: patient.phone,
    altPhone: patient.altPhone,
    email: patient.email,
    dateOfBirth: patient.dateOfBirth,
    age: patient.dateOfBirth ? calculateAge(patient.dateOfBirth) : null,
    gender: patient.gender,
    address: addressParts.length > 0 ? addressParts.join(", ") : null,
    emergencyContactName: patient.emergencyContactName,
    emergencyContactPhone: patient.emergencyContactPhone,
    emergencyContactRelation: patient.emergencyContactRelation,
    isInternational: patient.isInternational,
    countryOfResidence: patient.countryOfResidence,
    acquisitionSource: patient.acquisitionSource,
    clinicalAlert: patient.clinicalAlert,
    createdAt: patient.createdAt,
    hasPortalAccount: Boolean(patient.userId),
  };

  // Opening a patient record is itself an event worth recording.
  await recordAudit({
    actor: { userId: principal.userId, label: principal.fullName, role: principal.role },
    action: "VIEW",
    entity: "Patient",
    entityId: patient.id,
    metadata: { clinical: staffCan(principal, PERMISSIONS.CLINICAL_VIEW) },
  });

  if (!staffCan(principal, PERMISSIONS.CLINICAL_VIEW)) {
    return { patient: adminView, clinical: null };
  }

  const canSeePrivate = staffCan(principal, PERMISSIONS.CLINICAL_VIEW_PRIVATE);

  const [history, notes, plans, prescriptions] = await Promise.all([
    prisma.medicalHistory.findUnique({ where: { patientId } }),
    prisma.clinicalNote.findMany({
      where: { patientId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        createdAt: true,
        chiefComplaint: true,
        examination: true,
        diagnosis: true,
        procedure: true,
        toothNumbers: true,
        advice: true,
        privateNote: true,
        followUpDate: true,
        lockedAt: true,
        authorStaff: { select: { fullName: true } },
        doctor: { select: { displayName: true } },
      },
    }),
    prisma.treatmentPlan.findMany({
      where: { patientId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        status: true,
        estimatedTotalPaise: true,
        proposedAt: true,
        _count: { select: { items: true } },
      },
    }),
    prisma.prescription.findMany({
      where: { patientId },
      orderBy: { issuedAt: "desc" },
      take: 20,
      select: {
        id: true,
        reference: true,
        issuedAt: true,
        doctor: { select: { displayName: true } },
        _count: { select: { items: true } },
      },
    }),
  ]);

  return {
    patient: adminView,
    clinical: {
      medicalHistory: history
        ? {
            allergies: history.allergies,
            currentMedications: history.currentMedications,
            medicalConditions: history.medicalConditions,
            pastSurgeries: history.pastSurgeries,
            isDiabetic: history.isDiabetic,
            isHypertensive: history.isHypertensive,
            isPregnant: history.isPregnant,
            isSmoker: history.isSmoker,
            bleedingDisorder: history.bleedingDisorder,
            onBloodThinners: history.onBloodThinners,
            hasCardiacCondition: history.hasCardiacCondition,
            notes: history.notes,
            dentalHistory: history.dentalHistory,
            chiefComplaint: history.chiefComplaint,
            lastReviewedAt: history.lastReviewedAt,
          }
        : null,
      notes: notes.map((note) => ({
        id: note.id,
        createdAt: note.createdAt,
        chiefComplaint: note.chiefComplaint,
        examination: note.examination,
        diagnosis: note.diagnosis,
        procedure: note.procedure,
        toothNumbers: note.toothNumbers,
        advice: note.advice,
        // Stripped here, not hidden in the template.
        privateNote: canSeePrivate ? note.privateNote : null,
        followUpDate: note.followUpDate,
        lockedAt: note.lockedAt,
        authorName: note.authorStaff?.fullName ?? null,
        doctorName: note.doctor?.displayName ?? null,
      })),
      treatmentPlans: plans.map((plan) => ({
        id: plan.id,
        title: plan.title,
        status: plan.status,
        estimatedTotalPaise: plan.estimatedTotalPaise,
        proposedAt: plan.proposedAt,
        itemCount: plan._count.items,
      })),
      prescriptions: prescriptions.map((prescription) => ({
        id: prescription.id,
        reference: prescription.reference,
        issuedAt: prescription.issuedAt,
        doctorName: prescription.doctor?.displayName ?? null,
        itemCount: prescription._count.items,
      })),
    },
  };
}

/** Chronological timeline for the patient record page. */
export async function getPatientTimeline(patientId: string, limit = 40) {
  const [appointments, notes, invoices, documents] = await Promise.all([
    prisma.appointment.findMany({
      where: { patientId, deletedAt: null },
      orderBy: { startsAt: "desc" },
      take: limit,
      select: {
        id: true,
        reference: true,
        startsAt: true,
        status: true,
        serviceName: true,
        doctor: { select: { displayName: true } },
      },
    }),
    prisma.clinicalNote.findMany({
      where: { patientId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, createdAt: true, procedure: true, diagnosis: true },
    }),
    prisma.invoice.findMany({
      where: { patientId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, number: true, createdAt: true, totalPaise: true, status: true },
    }),
    prisma.patientDocument.findMany({
      where: { patientId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, createdAt: true, kind: true, title: true },
    }),
  ]);

  return { appointments, notes, invoices, documents };
}
