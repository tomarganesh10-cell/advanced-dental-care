"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { PERMISSIONS, type Permission } from "@/lib/rbac";
import { requireStaffApi } from "@/server/auth/guards";
import { rescheduleAppointment, transitionAppointment } from "@/server/booking/service";
import { InvalidTransitionError } from "@/server/booking/state-machine";
import type { AppointmentStatus } from "@/lib/db";

/**
 * Appointment server actions.
 *
 * Each destination status maps to the permission that authorises it. Confirming
 * an appointment and cancelling one are different acts with different
 * consequences, so they are not covered by a single "can edit appointments".
 */

const TRANSITION_PERMISSIONS: Partial<Record<AppointmentStatus, Permission>> = {
  CONFIRMED: PERMISSIONS.APPOINTMENT_CONFIRM,
  CHECKED_IN: PERMISSIONS.APPOINTMENT_CHECK_IN,
  IN_PROGRESS: PERMISSIONS.APPOINTMENT_CHECK_IN,
  COMPLETED: PERMISSIONS.APPOINTMENT_COMPLETE,
  CANCELLED: PERMISSIONS.APPOINTMENT_CANCEL,
  NO_SHOW: PERMISSIONS.APPOINTMENT_UPDATE,
  RESCHEDULE_REQUESTED: PERMISSIONS.APPOINTMENT_RESCHEDULE,
};

export interface ActionResult {
  ok: boolean;
  message: string;
}

const transitionSchema = z.object({
  appointmentId: z.uuid(),
  to: z.enum([
    "PENDING_CONFIRMATION",
    "CONFIRMED",
    "RESCHEDULE_REQUESTED",
    "CHECKED_IN",
    "IN_PROGRESS",
    "COMPLETED",
    "CANCELLED",
    "NO_SHOW",
  ]),
  reason: z.string().max(500).optional(),
});

export async function transitionAppointmentAction(formData: FormData): Promise<ActionResult> {
  try {
    const input = transitionSchema.parse({
      appointmentId: formData.get("appointmentId"),
      to: formData.get("to"),
      reason: formData.get("reason") || undefined,
    });

    const permission = TRANSITION_PERMISSIONS[input.to] ?? PERMISSIONS.APPOINTMENT_UPDATE;
    const principal = await requireStaffApi(permission);

    // Cancelling without a reason makes the no-show and cancellation reports
    // useless — they become a count with no explanation of what to fix.
    if (input.to === "CANCELLED" && !input.reason?.trim()) {
      return { ok: false, message: "Please record why this appointment is being cancelled." };
    }

    await transitionAppointment({
      appointmentId: input.appointmentId,
      to: input.to,
      reason: input.reason ?? null,
      actor: { userId: principal.userId, label: principal.fullName, role: principal.role },
      actorStaffId: principal.staffId,
    });

    revalidatePath("/admin/appointments");
    revalidatePath("/admin/front-desk");
    revalidatePath("/admin/calendar");
    revalidatePath("/admin");

    return { ok: true, message: `Appointment marked ${input.to.toLowerCase().replace(/_/g, " ")}.` };
  } catch (error) {
    return { ok: false, message: toMessage(error) };
  }
}

const rescheduleSchema = z.object({
  appointmentId: z.uuid(),
  startsAt: z.iso.datetime(),
  doctorId: z.uuid().optional(),
  durationMinutes: z.coerce.number().int().min(10).max(480).optional(),
  reason: z.string().max(500).optional(),
});

export async function rescheduleAppointmentAction(formData: FormData): Promise<ActionResult> {
  try {
    const principal = await requireStaffApi(PERMISSIONS.APPOINTMENT_RESCHEDULE);

    const input = rescheduleSchema.parse({
      appointmentId: formData.get("appointmentId"),
      startsAt: formData.get("startsAt"),
      doctorId: formData.get("doctorId") || undefined,
      durationMinutes: formData.get("durationMinutes") || undefined,
      reason: formData.get("reason") || undefined,
    });

    const result = await rescheduleAppointment({
      appointmentId: input.appointmentId,
      startsAt: new Date(input.startsAt),
      doctorId: input.doctorId,
      durationMinutes: input.durationMinutes,
      reason: input.reason ?? null,
      actor: { userId: principal.userId, label: principal.fullName, role: principal.role },
      actorStaffId: principal.staffId,
      // Staff booking on the phone with the patient are not bound by the public
      // two-hour lead time — the whole point of calling is to be fitted in.
      ignoreLeadTime: true,
    });

    revalidatePath("/admin/appointments");
    revalidatePath("/admin/calendar");

    return { ok: true, message: `Rescheduled. New reference ${result.reference}.` };
  } catch (error) {
    return { ok: false, message: toMessage(error) };
  }
}

function toMessage(error: unknown): string {
  if (error instanceof InvalidTransitionError) return error.message;
  if (error instanceof AppError) return error.message;
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? "Please check the details and try again.";
  }
  return "Something went wrong. Please try again.";
}
