import { describe, expect, it } from "vitest";
import type { AppointmentStatus } from "@/lib/db";
import {
  PATIENT_ACTIONABLE_STATUSES,
  RELEASING_STATUSES,
  STATUS_LABELS,
  STATUS_TONES,
  TRANSITIONS,
  assertTransition,
  canTransition,
} from "@/server/booking/state-machine";

const ALL_STATUSES = Object.keys(TRANSITIONS) as AppointmentStatus[];

describe("appointment state machine", () => {
  describe("the happy path", () => {
    it("walks a website booking through to completion", () => {
      const path: AppointmentStatus[] = [
        "REQUESTED",
        "CONFIRMED",
        "CHECKED_IN",
        "IN_PROGRESS",
        "COMPLETED",
      ];

      for (let i = 0; i < path.length - 1; i += 1) {
        expect(canTransition(path[i]!, path[i + 1]!), `${path[i]} → ${path[i + 1]}`).toBe(true);
      }
    });
  });

  describe("transitions that must never be allowed", () => {
    /**
     * The important one: a completed visit has been treated and probably
     * billed. Letting it become CANCELLED would silently unbill work that
     * actually happened.
     */
    it("refuses to cancel a completed appointment", () => {
      expect(canTransition("COMPLETED", "CANCELLED")).toBe(false);
    });

    it("treats COMPLETED and CANCELLED as terminal", () => {
      expect(TRANSITIONS.COMPLETED).toHaveLength(0);
      expect(TRANSITIONS.CANCELLED).toHaveLength(0);
    });

    it("refuses to skip check-in and go straight to completed", () => {
      expect(canTransition("CONFIRMED", "COMPLETED")).toBe(false);
      expect(canTransition("REQUESTED", "COMPLETED")).toBe(false);
    });

    it("refuses to un-cancel an appointment", () => {
      expect(canTransition("CANCELLED", "CONFIRMED")).toBe(false);
      expect(canTransition("CANCELLED", "REQUESTED")).toBe(false);
    });

    it("refuses to re-open a rescheduled appointment", () => {
      // The replacement is a new row; this one is done.
      expect(canTransition("RESCHEDULED", "CONFIRMED")).toBe(false);
      expect(canTransition("RESCHEDULED", "CHECKED_IN")).toBe(false);
    });

    it("refuses a no-op transition to the same status", () => {
      for (const status of ALL_STATUSES) {
        expect(canTransition(status, status), `${status} → itself`).toBe(false);
      }
    });

    it("refuses to take an unconfirmed appointment straight to in-progress", () => {
      expect(canTransition("REQUESTED", "IN_PROGRESS")).toBe(false);
      expect(canTransition("PENDING_CONFIRMATION", "CHECKED_IN")).toBe(false);
    });
  });

  describe("no-show correction", () => {
    /**
     * A no-show recorded in error must be correctable — otherwise the fix is
     * for someone to edit the database — but only back to CONFIRMED, so the
     * correction is visible in the status history.
     */
    it("allows only a correction back to CONFIRMED", () => {
      expect(canTransition("NO_SHOW", "CONFIRMED")).toBe(true);
      expect(canTransition("NO_SHOW", "COMPLETED")).toBe(false);
      expect(canTransition("NO_SHOW", "CHECKED_IN")).toBe(false);
      expect(canTransition("NO_SHOW", "CANCELLED")).toBe(false);
    });
  });

  describe("assertTransition", () => {
    it("throws a message a receptionist could read", () => {
      expect(() => assertTransition("COMPLETED", "CANCELLED")).toThrowError(
        /completed cannot be marked cancelled/i,
      );
    });

    it("does not throw for a valid transition", () => {
      expect(() => assertTransition("CONFIRMED", "CHECKED_IN")).not.toThrow();
    });
  });

  describe("metadata completeness", () => {
    it("has a label and a tone for every status", () => {
      for (const status of ALL_STATUSES) {
        expect(STATUS_LABELS[status], `label for ${status}`).toBeTruthy();
        expect(STATUS_TONES[status], `tone for ${status}`).toBeTruthy();
      }
    });

    it("only lists real statuses as releasing or patient-actionable", () => {
      for (const status of [...RELEASING_STATUSES, ...PATIENT_ACTIONABLE_STATUSES]) {
        expect(ALL_STATUSES).toContain(status);
      }
    });

    it("only points transitions at real statuses", () => {
      for (const [from, targets] of Object.entries(TRANSITIONS)) {
        for (const target of targets) {
          expect(ALL_STATUSES, `${from} → ${target}`).toContain(target);
        }
      }
    });
  });
});
