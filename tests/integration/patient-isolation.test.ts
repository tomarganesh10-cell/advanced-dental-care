import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@/lib/rbac";
import type { StaffPrincipal } from "@/server/auth/session";
import { getPatientForStaff } from "@/server/patients";
import {
  getPortalAppointments,
  getPortalDocumentForDownload,
  getPortalInvoices,
  getPortalOverview,
} from "@/server/portal";
import { clinicInstant, createAppointment, createDoctor, createPatient, createStaff } from "./factories";

/**
 * Patient isolation.
 *
 * The failure this file exists to catch is the one that ends a clinic: patient
 * A signs in and sees patient B's records. It is trivially easy to introduce —
 * one query that takes an id from a URL without comparing it to the session —
 * and it is invisible in review because the code looks correct.
 */

function patientPrincipal(patient: { id: string; fullName: string; patientNumber: string; phone: string; userId: string | null }) {
  return {
    kind: "PATIENT" as const,
    userId: patient.userId ?? "test-user",
    patientId: patient.id,
    fullName: patient.fullName,
    patientNumber: patient.patientNumber,
    phone: patient.phone,
    sessionId: "test-session",
  };
}

function staffPrincipal(overrides: Partial<StaffPrincipal> = {}): StaffPrincipal {
  return {
    kind: "STAFF",
    userId: "staff-user",
    staffId: "staff-id",
    doctorId: null,
    fullName: "Test Staff",
    role: "RECEPTIONIST",
    email: null,
    permissions: [],
    sessionId: "staff-session",
    ...overrides,
  };
}

describe("patient isolation", () => {
  describe("the portal only ever returns the signed-in patient's data", () => {
    it("scopes appointments to the session", async () => {
      const doctor = await createDoctor();
      const alice = await createPatient({ fullName: "Alice", withUser: true });
      const bob = await createPatient({ fullName: "Bob", withUser: true });

      await createAppointment({
        patientId: alice.id,
        doctorId: doctor.id,
        startsAt: clinicInstant(3, "11:00"),
      });
      await createAppointment({
        patientId: bob.id,
        doctorId: doctor.id,
        startsAt: clinicInstant(3, "12:00"),
      });

      const { all } = await getPortalAppointments(patientPrincipal(alice));

      expect(all).toHaveLength(1);
      expect(all.every((appointment) => appointment.id)).toBe(true);

      const aliceAppointmentIds = await prisma.appointment.findMany({
        where: { patientId: alice.id },
        select: { id: true },
      });
      expect(all.map((a) => a.id).sort()).toEqual(aliceAppointmentIds.map((a) => a.id).sort());
    });

    it("scopes invoices to the session", async () => {
      const alice = await createPatient({ withUser: true });
      const bob = await createPatient({ withUser: true });

      for (const [index, patient] of [alice, bob].entries()) {
        await prisma.invoice.create({
          data: {
            number: `TEST-INV-${index}`,
            patientId: patient.id,
            status: "ISSUED",
            subtotalPaise: 100000,
            totalPaise: 100000,
            balancePaise: 100000,
            issuedAt: new Date(),
          },
        });
      }

      const invoices = await getPortalInvoices(patientPrincipal(alice));

      expect(invoices).toHaveLength(1);
      expect(invoices[0]?.number).toBe("TEST-INV-0");
    });

    /**
     * The direct-object-reference case: Alice asks for Bob's document id.
     */
    it("refuses a document belonging to another patient", async () => {
      const alice = await createPatient({ withUser: true });
      const bob = await createPatient({ withUser: true });

      const bobsDocument = await prisma.patientDocument.create({
        data: {
          patientId: bob.id,
          kind: "XRAY",
          title: "Bob's OPG",
          storageKey: "patients/bob/xray/secret.jpg",
          mimeType: "image/jpeg",
          sizeBytes: 1024,
          isVisibleToPatient: true,
        },
      });

      const result = await getPortalDocumentForDownload(patientPrincipal(alice), bobsDocument.id);

      expect(result).toBeNull();
    });

    it("returns null for a document id that does not exist, same as one that is not yours", async () => {
      const alice = await createPatient({ withUser: true });

      const result = await getPortalDocumentForDownload(
        patientPrincipal(alice),
        "00000000-0000-0000-0000-000000000000",
      );

      // Identical outcome to the previous test — the two cases are
      // indistinguishable to a caller, so ids cannot be probed.
      expect(result).toBeNull();
    });

    /**
     * Staff decide what a patient sees unsupervised. A document that exists on
     * their own record but has not been shared must not appear.
     */
    it("hides the patient's own documents until staff mark them visible", async () => {
      const alice = await createPatient({ withUser: true });

      const hidden = await prisma.patientDocument.create({
        data: {
          patientId: alice.id,
          kind: "CBCT",
          title: "Pre-operative CBCT",
          storageKey: "patients/alice/cbct/scan.dcm",
          mimeType: "application/dicom",
          sizeBytes: 2048,
          isVisibleToPatient: false,
        },
      });

      expect(await getPortalDocumentForDownload(patientPrincipal(alice), hidden.id)).toBeNull();
    });

    it("does not show a draft treatment plan to the patient", async () => {
      const alice = await createPatient({ withUser: true });

      await prisma.treatmentPlan.create({
        data: {
          patientId: alice.id,
          title: "Draft implant plan",
          status: "DRAFT",
          isVisibleToPatient: false,
          estimatedTotalPaise: 5000000,
        },
      });

      const { plan } = await getPortalOverview(patientPrincipal(alice));
      expect(plan).toBeNull();
    });

    it("shows a plan once it has been proposed and shared", async () => {
      const alice = await createPatient({ withUser: true });

      await prisma.treatmentPlan.create({
        data: {
          patientId: alice.id,
          title: "Implant plan",
          status: "PROPOSED",
          isVisibleToPatient: true,
          estimatedTotalPaise: 5000000,
          proposedAt: new Date(),
        },
      });

      const { plan } = await getPortalOverview(patientPrincipal(alice));
      expect(plan?.title).toBe("Implant plan");
    });

    it("does not show a draft invoice as a bill", async () => {
      const alice = await createPatient({ withUser: true });

      await prisma.invoice.create({
        data: {
          number: "TEST-INV-DRAFT",
          patientId: alice.id,
          status: "DRAFT",
          subtotalPaise: 100000,
          totalPaise: 100000,
          balancePaise: 100000,
        },
      });

      expect(await getPortalInvoices(patientPrincipal(alice))).toHaveLength(0);
    });
  });

  describe("staff clinical access", () => {
    it("strips clinical data for a role without CLINICAL_VIEW", async () => {
      const doctor = await createDoctor();
      const patient = await createPatient();
      const { staff, user } = await createStaff({ role: "RECEPTIONIST" });

      await prisma.clinicalNote.create({
        data: {
          patientId: patient.id,
          doctorId: doctor.id,
          diagnosis: "Irreversible pulpitis 46",
          privateNote: "Patient very anxious — allow extra time",
        },
      });

      const result = await getPatientForStaff(
        patient.id,
        staffPrincipal({
          userId: user.id,
          staffId: staff.id,
          role: "RECEPTIONIST",
        }),
      );

      // Contact details are present — reception needs them to do their job…
      expect(result.patient.phone).toBe(patient.phone);
      // …and the clinical object is absent entirely, not merely hidden in the UI.
      expect(result.clinical).toBeNull();
    });

    it("gives a doctor the clinical record including private notes", async () => {
      const doctor = await createDoctor();
      const patient = await createPatient();
      const { staff, user } = await createStaff({ role: "DOCTOR" });

      await prisma.clinicalNote.create({
        data: {
          patientId: patient.id,
          doctorId: doctor.id,
          diagnosis: "Irreversible pulpitis 46",
          privateNote: "Patient very anxious — allow extra time",
        },
      });

      const result = await getPatientForStaff(
        patient.id,
        staffPrincipal({
          userId: user.id,
          staffId: staff.id,
          role: "DOCTOR",
          permissions: [PERMISSIONS.CLINICAL_VIEW, PERMISSIONS.CLINICAL_VIEW_PRIVATE],
        }),
      );

      expect(result.clinical?.notes[0]?.diagnosis).toBe("Irreversible pulpitis 46");
      expect(result.clinical?.notes[0]?.privateNote).toBe(
        "Patient very anxious — allow extra time",
      );
    });

    /**
     * An assistant can read the record they are assisting with, but a
     * clinician's private working note is not theirs to read.
     */
    it("strips private notes for a role without CLINICAL_VIEW_PRIVATE", async () => {
      const doctor = await createDoctor();
      const patient = await createPatient();
      const { staff, user } = await createStaff({ role: "DENTAL_ASSISTANT" });

      await prisma.clinicalNote.create({
        data: {
          patientId: patient.id,
          doctorId: doctor.id,
          diagnosis: "Irreversible pulpitis 46",
          privateNote: "Patient very anxious — allow extra time",
        },
      });

      const result = await getPatientForStaff(
        patient.id,
        staffPrincipal({
          userId: user.id,
          staffId: staff.id,
          role: "DENTAL_ASSISTANT",
          permissions: [PERMISSIONS.CLINICAL_VIEW],
        }),
      );

      expect(result.clinical?.notes[0]?.diagnosis).toBe("Irreversible pulpitis 46");
      expect(result.clinical?.notes[0]?.privateNote).toBeNull();
    });

    it("audits every time a patient record is opened", async () => {
      const patient = await createPatient();
      const { staff, user } = await createStaff({ role: "RECEPTIONIST" });

      await getPatientForStaff(
        patient.id,
        staffPrincipal({ userId: user.id, staffId: staff.id, role: "RECEPTIONIST" }),
      );

      const audit = await prisma.auditLog.findFirst({
        where: { entity: "Patient", entityId: patient.id, action: "VIEW" },
      });

      expect(audit).toBeTruthy();
      expect(audit?.actorId).toBe(user.id);
    });

    it("refuses a soft-deleted patient record", async () => {
      const patient = await createPatient();
      const { staff, user } = await createStaff({ role: "CLINIC_ADMIN" });

      await prisma.patient.update({
        where: { id: patient.id },
        data: { deletedAt: new Date() },
      });

      await expect(
        getPatientForStaff(
          patient.id,
          staffPrincipal({ userId: user.id, staffId: staff.id, role: "CLINIC_ADMIN" }),
        ),
      ).rejects.toThrow(/not found/i);
    });
  });
});
