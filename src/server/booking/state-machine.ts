import type { AppointmentStatus } from "@/lib/db";

/**
 * Appointment lifecycle.
 *
 * Encoded as an explicit transition table rather than scattered `if` checks,
 * because the invalid transitions are the interesting ones: a COMPLETED
 * appointment must not become CANCELLED (that would silently unbill a visit
 * that happened), and a NO_SHOW must not become CHECKED_IN an hour later
 * without an explicit correction path.
 */

export const TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  // A website request that reception has not touched yet.
  REQUESTED: ["PENDING_CONFIRMATION", "CONFIRMED", "CANCELLED", "RESCHEDULE_REQUESTED"],

  // Reception has seen it and is waiting on the patient or a doctor.
  PENDING_CONFIRMATION: ["CONFIRMED", "CANCELLED", "RESCHEDULE_REQUESTED"],

  CONFIRMED: ["CHECKED_IN", "RESCHEDULE_REQUESTED", "RESCHEDULED", "CANCELLED", "NO_SHOW"],

  RESCHEDULE_REQUESTED: ["RESCHEDULED", "CONFIRMED", "CANCELLED"],

  // The replacement booking is a new row; this one is terminal once replaced.
  RESCHEDULED: ["CANCELLED"],

  CHECKED_IN: ["IN_PROGRESS", "CANCELLED", "NO_SHOW"],

  IN_PROGRESS: ["COMPLETED", "CANCELLED"],

  // Terminal. Billing, feedback and the clinical record hang off this state.
  COMPLETED: [],

  // Terminal.
  CANCELLED: [],

  // A no-show can be corrected back to CONFIRMED if it was recorded in error,
  // and only to that — the correction is visible in the status history.
  NO_SHOW: ["CONFIRMED"],
};

/** Statuses after which the appointment no longer occupies a slot. */
export const RELEASING_STATUSES: AppointmentStatus[] = [
  "CANCELLED",
  "NO_SHOW",
  "COMPLETED",
  "RESCHEDULED",
];

/** Statuses a patient may still act on from the portal. */
export const PATIENT_ACTIONABLE_STATUSES: AppointmentStatus[] = [
  "REQUESTED",
  "PENDING_CONFIRMATION",
  "CONFIRMED",
];

export function canTransition(from: AppointmentStatus, to: AppointmentStatus): boolean {
  if (from === to) return false;
  return (TRANSITIONS[from] ?? []).includes(to);
}

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: AppointmentStatus,
    readonly to: AppointmentStatus,
  ) {
    super(`An appointment that is ${humanStatus(from)} cannot be marked ${humanStatus(to)}.`);
    this.name = "InvalidTransitionError";
  }
}

export function assertTransition(from: AppointmentStatus, to: AppointmentStatus): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  REQUESTED: "Requested",
  PENDING_CONFIRMATION: "Awaiting confirmation",
  CONFIRMED: "Confirmed",
  RESCHEDULE_REQUESTED: "Reschedule requested",
  RESCHEDULED: "Rescheduled",
  CHECKED_IN: "Checked in",
  IN_PROGRESS: "With the doctor",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "Did not attend",
};

export function humanStatus(status: AppointmentStatus): string {
  return STATUS_LABELS[status] ?? status;
}

/**
 * Colour tokens for the calendar. Paired with a distinct label and icon in the
 * UI — colour alone is not an accessible status indicator.
 */
export const STATUS_TONES: Record<
  AppointmentStatus,
  "neutral" | "info" | "success" | "warning" | "danger"
> = {
  REQUESTED: "neutral",
  PENDING_CONFIRMATION: "warning",
  CONFIRMED: "info",
  RESCHEDULE_REQUESTED: "warning",
  RESCHEDULED: "neutral",
  CHECKED_IN: "info",
  IN_PROGRESS: "info",
  COMPLETED: "success",
  CANCELLED: "neutral",
  NO_SHOW: "danger",
};
