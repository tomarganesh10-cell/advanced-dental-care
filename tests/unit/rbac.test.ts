import { describe, expect, it } from "vitest";
import {
  ALL_PERMISSIONS,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  can,
  canAll,
  canAny,
  effectivePermissions,
  requirePermission,
  type StaffRoleName,
} from "@/lib/rbac";

describe("RBAC", () => {
  describe("role defaults", () => {
    it("gives SUPER_ADMIN every permission", () => {
      for (const permission of ALL_PERMISSIONS) {
        expect(can({ role: "SUPER_ADMIN" }, permission)).toBe(true);
      }
    });

    /**
     * The boundary that matters most operationally: reception handles the most
     * walk-up traffic and has the least clinical need.
     */
    it("does not let a receptionist read clinical notes", () => {
      expect(can({ role: "RECEPTIONIST" }, PERMISSIONS.CLINICAL_VIEW)).toBe(false);
      expect(can({ role: "RECEPTIONIST" }, PERMISSIONS.CLINICAL_CREATE)).toBe(false);
      expect(can({ role: "RECEPTIONIST" }, PERMISSIONS.CLINICAL_VIEW_PRIVATE)).toBe(false);
      expect(can({ role: "RECEPTIONIST" }, PERMISSIONS.PRESCRIPTION_CREATE)).toBe(false);
    });

    it("still lets a receptionist do their job", () => {
      expect(can({ role: "RECEPTIONIST" }, PERMISSIONS.APPOINTMENT_CREATE)).toBe(true);
      expect(can({ role: "RECEPTIONIST" }, PERMISSIONS.APPOINTMENT_CHECK_IN)).toBe(true);
      expect(can({ role: "RECEPTIONIST" }, PERMISSIONS.PATIENT_VIEW)).toBe(true);
      expect(can({ role: "RECEPTIONIST" }, PERMISSIONS.PAYMENT_RECORD)).toBe(true);
    });

    /** Marketing works the funnel, not the chart. */
    it("gives marketing no access to patient records at all", () => {
      expect(can({ role: "MARKETING" }, PERMISSIONS.PATIENT_VIEW)).toBe(false);
      expect(can({ role: "MARKETING" }, PERMISSIONS.CLINICAL_VIEW)).toBe(false);
      expect(can({ role: "MARKETING" }, PERMISSIONS.DOCUMENT_VIEW)).toBe(false);
      // …but it does get the lead pipeline.
      expect(can({ role: "MARKETING" }, PERMISSIONS.LEAD_VIEW)).toBe(true);
    });

    it("gives a doctor clinical authority and no financial authority", () => {
      expect(can({ role: "DOCTOR" }, PERMISSIONS.CLINICAL_CREATE)).toBe(true);
      expect(can({ role: "DOCTOR" }, PERMISSIONS.PRESCRIPTION_CREATE)).toBe(true);
      expect(can({ role: "DOCTOR" }, PERMISSIONS.PAYMENT_REFUND)).toBe(false);
      expect(can({ role: "DOCTOR" }, PERMISSIONS.INVOICE_CREATE)).toBe(false);
    });

    it("lets an assistant read the clinical record but not author it", () => {
      expect(can({ role: "DENTAL_ASSISTANT" }, PERMISSIONS.CLINICAL_VIEW)).toBe(true);
      expect(can({ role: "DENTAL_ASSISTANT" }, PERMISSIONS.CLINICAL_CREATE)).toBe(false);
      expect(can({ role: "DENTAL_ASSISTANT" }, PERMISSIONS.CLINICAL_VIEW_PRIVATE)).toBe(false);
      expect(can({ role: "DENTAL_ASSISTANT" }, PERMISSIONS.PRESCRIPTION_CREATE)).toBe(false);
    });

    it("keeps accountants out of the clinical record", () => {
      expect(can({ role: "ACCOUNTANT" }, PERMISSIONS.PAYMENT_REFUND)).toBe(true);
      expect(can({ role: "ACCOUNTANT" }, PERMISSIONS.CLINICAL_VIEW)).toBe(false);
    });

    it("keeps managers out of the clinical record", () => {
      expect(can({ role: "MANAGER" }, PERMISSIONS.ATTENDANCE_VIEW_ALL)).toBe(true);
      expect(can({ role: "MANAGER" }, PERMISSIONS.REPORT_FINANCIAL)).toBe(true);
      expect(can({ role: "MANAGER" }, PERMISSIONS.CLINICAL_VIEW)).toBe(false);
    });

    it("gives every role its own attendance", () => {
      const roles: StaffRoleName[] = [
        "CLINIC_ADMIN",
        "DOCTOR",
        "DENTAL_ASSISTANT",
        "RECEPTIONIST",
        "MANAGER",
        "MARKETING",
        "ACCOUNTANT",
        "SUPPORT",
      ];
      for (const role of roles) {
        expect(can({ role }, PERMISSIONS.ATTENDANCE_SELF)).toBe(true);
      }
    });
  });

  describe("per-user grants", () => {
    it("grants a permission the role does not include", () => {
      const principal = {
        role: "RECEPTIONIST" as const,
        grants: [{ permission: PERMISSIONS.PAYMENT_REFUND, allow: true }],
      };
      expect(can(principal, PERMISSIONS.PAYMENT_REFUND)).toBe(true);
    });

    /**
     * Deny-beats-allow is what makes it possible to remove a capability from
     * one person without inventing a whole new role for them.
     */
    it("lets an explicit DENY override a role default", () => {
      const principal = {
        role: "DOCTOR" as const,
        grants: [{ permission: PERMISSIONS.CLINICAL_VIEW_PRIVATE, allow: false }],
      };
      expect(can({ role: "DOCTOR" }, PERMISSIONS.CLINICAL_VIEW_PRIVATE)).toBe(true);
      expect(can(principal, PERMISSIONS.CLINICAL_VIEW_PRIVATE)).toBe(false);
    });

    it("lets DENY win even when an ALLOW for the same permission exists", () => {
      const principal = {
        role: "RECEPTIONIST" as const,
        grants: [
          { permission: PERMISSIONS.PAYMENT_REFUND, allow: true },
          { permission: PERMISSIONS.PAYMENT_REFUND, allow: false },
        ],
      };
      expect(can(principal, PERMISSIONS.PAYMENT_REFUND)).toBe(false);
    });

    it("ignores an expired grant", () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const principal = {
        role: "RECEPTIONIST" as const,
        grants: [{ permission: PERMISSIONS.PAYMENT_REFUND, allow: true, expiresAt: yesterday }],
      };
      expect(can(principal, PERMISSIONS.PAYMENT_REFUND)).toBe(false);
    });

    it("honours a grant that has not expired yet", () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const principal = {
        role: "RECEPTIONIST" as const,
        grants: [{ permission: PERMISSIONS.PAYMENT_REFUND, allow: true, expiresAt: tomorrow }],
      };
      expect(can(principal, PERMISSIONS.PAYMENT_REFUND)).toBe(true);
    });

    it("does not let a grant elevate a non-super-admin to everything", () => {
      const principal = {
        role: "SUPPORT" as const,
        grants: [{ permission: PERMISSIONS.LEAD_DELETE, allow: true }],
      };
      expect(can(principal, PERMISSIONS.LEAD_DELETE)).toBe(true);
      expect(can(principal, PERMISSIONS.AUDIT_LOG_VIEW)).toBe(false);
      expect(can(principal, PERMISSIONS.STAFF_MANAGE_PERMISSIONS)).toBe(false);
    });
  });

  describe("helpers", () => {
    it("canAll requires every permission", () => {
      expect(
        canAll({ role: "DOCTOR" }, [PERMISSIONS.CLINICAL_VIEW, PERMISSIONS.CLINICAL_CREATE]),
      ).toBe(true);
      expect(
        canAll({ role: "DOCTOR" }, [PERMISSIONS.CLINICAL_VIEW, PERMISSIONS.PAYMENT_REFUND]),
      ).toBe(false);
    });

    it("canAny requires only one", () => {
      expect(
        canAny({ role: "DOCTOR" }, [PERMISSIONS.PAYMENT_REFUND, PERMISSIONS.CLINICAL_VIEW]),
      ).toBe(true);
      expect(
        canAny({ role: "MARKETING" }, [PERMISSIONS.PAYMENT_REFUND, PERMISSIONS.CLINICAL_VIEW]),
      ).toBe(false);
    });

    it("effectivePermissions reflects grants and denials", () => {
      const permissions = effectivePermissions({
        role: "RECEPTIONIST",
        grants: [
          { permission: PERMISSIONS.PAYMENT_REFUND, allow: true },
          { permission: PERMISSIONS.PATIENT_UPDATE, allow: false },
        ],
      });

      expect(permissions).toContain(PERMISSIONS.PAYMENT_REFUND);
      expect(permissions).not.toContain(PERMISSIONS.PATIENT_UPDATE);
      expect(permissions).toContain(PERMISSIONS.APPOINTMENT_CREATE);
    });

    it("requirePermission throws for a missing permission", () => {
      expect(() => requirePermission({ role: "MARKETING" }, PERMISSIONS.CLINICAL_VIEW)).toThrow();
      expect(() => requirePermission({ role: "DOCTOR" }, PERMISSIONS.CLINICAL_VIEW)).not.toThrow();
    });
  });

  describe("catalogue integrity", () => {
    it("has no duplicate permission strings", () => {
      expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
    });

    it("only references permissions that exist in the catalogue", () => {
      const known = new Set<string>(ALL_PERMISSIONS);
      for (const [role, permissions] of Object.entries(ROLE_PERMISSIONS)) {
        for (const permission of permissions) {
          expect(known.has(permission), `${role} references unknown permission ${permission}`).toBe(
            true,
          );
        }
      }
    });
  });
});
