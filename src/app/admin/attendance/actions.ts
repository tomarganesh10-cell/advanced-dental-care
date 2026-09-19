"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/rbac";
import { clientKeyFromHeaders } from "@/lib/rate-limit";
import { requireStaffApi } from "@/server/auth/guards";
import { adjustAttendance, checkIn, checkOut } from "@/server/attendance";

/**
 * Attendance server actions.
 *
 * Every action re-resolves the session and re-checks permission. A server
 * action is a public HTTP endpoint with a generated name — it is reachable by
 * anyone who can read the page source, so "only the button calls it" is not a
 * security property.
 */

export interface ActionResult {
  ok: boolean;
  message: string;
}

async function requestIp(): Promise<string | null> {
  const headerList = await headers();
  return clientKeyFromHeaders(headerList);
}

export async function checkInAction(): Promise<ActionResult> {
  const principal = await requireStaffApi(PERMISSIONS.ATTENDANCE_SELF);

  try {
    const record = await checkIn({
      staffId: principal.staffId,
      ipAddress: await requestIp(),
      actor: { userId: principal.userId, label: principal.fullName, role: principal.role },
    });

    revalidatePath("/admin/attendance");

    return {
      ok: true,
      message:
        record.lateMinutes > 0
          ? `Checked in. Recorded as ${record.lateMinutes} minutes late.`
          : "Checked in.",
    };
  } catch (error) {
    return { ok: false, message: toMessage(error) };
  }
}

export async function checkOutAction(): Promise<ActionResult> {
  const principal = await requireStaffApi(PERMISSIONS.ATTENDANCE_SELF);

  try {
    const record = await checkOut({
      staffId: principal.staffId,
      ipAddress: await requestIp(),
      actor: { userId: principal.userId, label: principal.fullName, role: principal.role },
    });

    revalidatePath("/admin/attendance");

    const hours = ((record.workedMinutes ?? 0) / 60).toFixed(1);
    return { ok: true, message: `Checked out. ${hours} hours recorded.` };
  } catch (error) {
    return { ok: false, message: toMessage(error) };
  }
}

const adjustSchema = z.object({
  attendanceId: z.uuid(),
  status: z
    .enum(["PRESENT", "ABSENT", "LATE", "HALF_DAY", "LEAVE", "WEEK_OFF", "HOLIDAY"])
    .optional(),
  checkInAt: z.string().optional(),
  checkOutAt: z.string().optional(),
  notes: z.string().max(500).optional(),
  reason: z.string().min(3, "Please give a reason for the change."),
});

export async function adjustAttendanceAction(formData: FormData): Promise<ActionResult> {
  const principal = await requireStaffApi(PERMISSIONS.ATTENDANCE_ADJUST);

  try {
    const input = adjustSchema.parse({
      attendanceId: formData.get("attendanceId"),
      status: formData.get("status") || undefined,
      checkInAt: formData.get("checkInAt") || undefined,
      checkOutAt: formData.get("checkOutAt") || undefined,
      notes: formData.get("notes") || undefined,
      reason: formData.get("reason"),
    });

    await adjustAttendance({
      attendanceId: input.attendanceId,
      status: input.status,
      checkInAt: input.checkInAt ? new Date(input.checkInAt) : undefined,
      checkOutAt: input.checkOutAt ? new Date(input.checkOutAt) : undefined,
      notes: input.notes ?? null,
      reason: input.reason,
      adjustedByUserId: principal.userId,
      actor: { userId: principal.userId, label: principal.fullName, role: principal.role },
    });

    revalidatePath("/admin/attendance");
    return { ok: true, message: "Attendance record updated." };
  } catch (error) {
    return { ok: false, message: toMessage(error) };
  }
}

function toMessage(error: unknown): string {
  if (error instanceof AppError) return error.message;
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? "Please check the details and try again.";
  }
  // Never surface the raw error to a browser.
  return "Something went wrong. Please try again.";
}
