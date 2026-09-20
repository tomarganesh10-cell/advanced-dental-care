import { prisma } from "@/lib/db";
import type { AttendanceStatus } from "@/lib/db";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { clinicDateString, formatClinicTime, timeToMinutes, utcToClinicTime } from "@/lib/time";
import { recordAudit, type AuditActor } from "./audit";

/**
 * Staff attendance.
 *
 * Design decisions worth stating, because attendance systems are where
 * workplace software most often becomes surveillance:
 *
 *  - No location tracking, no screenshots, no idle monitoring. The record is
 *    check-in time, check-out time and the resulting hours. Optional IP
 *    restriction exists for clinics that want "must be on the clinic network",
 *    and it is OFF by default.
 *  - Staff can see their own full history at any time. A record about someone
 *    that they cannot see is a record they cannot correct.
 *  - A manager CAN adjust a record — people forget to clock out — but every
 *    adjustment stores who made it and why, and the original values stay in the
 *    audit log. Silent edits to someone's hours are how payroll disputes start.
 */

/** Grace period before a check-in counts as late. */
const LATE_GRACE_MINUTES = 10;

export interface CheckInInput {
  staffId: string;
  /** "HH:mm" clinic-local expected start, from the staff member's shift. */
  expectedStart?: string | null;
  ipAddress?: string | null;
  actor?: AuditActor;
  now?: Date;
}

export interface AttendanceRecord {
  id: string;
  date: Date;
  status: AttendanceStatus;
  checkInAt: Date | null;
  checkOutAt: Date | null;
  workedMinutes: number | null;
  lateMinutes: number;
}

export async function checkIn(input: CheckInInput): Promise<AttendanceRecord> {
  const now = input.now ?? new Date();
  const dateKey = new Date(`${clinicDateString(now)}T00:00:00.000Z`);

  const existing = await prisma.attendance.findUnique({
    where: { staffId_date: { staffId: input.staffId, date: dateKey } },
  });

  if (existing?.checkInAt) {
    throw new ConflictError(
      `You already checked in at ${formatClinicTime(existing.checkInAt)} today.`,
    );
  }

  // Lateness is measured against the expected start, if one is configured.
  // Without a shift time there is nothing to be late against, and inventing a
  // 9am default would mark an evening-shift receptionist late every day.
  let lateMinutes = 0;
  if (input.expectedStart) {
    const actual = timeToMinutes(utcToClinicTime(now));
    const expected = timeToMinutes(input.expectedStart);
    lateMinutes = Math.max(0, actual - expected - LATE_GRACE_MINUTES);
  }

  const status: AttendanceStatus = lateMinutes > 0 ? "LATE" : "PRESENT";

  const record = await prisma.attendance.upsert({
    where: { staffId_date: { staffId: input.staffId, date: dateKey } },
    create: {
      staffId: input.staffId,
      date: dateKey,
      status,
      checkInAt: now,
      lateMinutes,
      checkInIp: input.ipAddress ?? null,
    },
    update: {
      status,
      checkInAt: now,
      lateMinutes,
      checkInIp: input.ipAddress ?? null,
    },
  });

  await recordAudit({
    actor: input.actor ?? {},
    action: "CREATE",
    entity: "Attendance",
    entityId: record.id,
    after: { status, checkInAt: now, lateMinutes },
  });

  return toRecord(record);
}

export async function checkOut(input: {
  staffId: string;
  ipAddress?: string | null;
  actor?: AuditActor;
  now?: Date;
}): Promise<AttendanceRecord> {
  const now = input.now ?? new Date();
  const dateKey = new Date(`${clinicDateString(now)}T00:00:00.000Z`);

  const existing = await prisma.attendance.findUnique({
    where: { staffId_date: { staffId: input.staffId, date: dateKey } },
  });

  if (!existing?.checkInAt) {
    throw new ValidationError("You have not checked in today.");
  }

  if (existing.checkOutAt) {
    throw new ConflictError(`You already checked out at ${formatClinicTime(existing.checkOutAt)}.`);
  }

  const workedMinutes = Math.max(
    0,
    Math.round((now.getTime() - existing.checkInAt.getTime()) / 60000),
  );

  // A shift shorter than half the standard day is recorded as a half day rather
  // than a full one, so monthly totals are not quietly wrong.
  const status: AttendanceStatus =
    workedMinutes < 240 && existing.status !== "LATE" ? "HALF_DAY" : existing.status;

  const record = await prisma.attendance.update({
    where: { id: existing.id },
    data: { checkOutAt: now, workedMinutes, status, checkOutIp: input.ipAddress ?? null },
  });

  await recordAudit({
    actor: input.actor ?? {},
    action: "UPDATE",
    entity: "Attendance",
    entityId: record.id,
    before: { checkOutAt: null },
    after: { checkOutAt: now, workedMinutes, status },
  });

  return toRecord(record);
}

/**
 * Manager adjustment.
 *
 * Requires a reason. The previous values go into the audit log before they are
 * overwritten, so "my hours were changed and nobody told me" is answerable.
 */
export async function adjustAttendance(input: {
  attendanceId: string;
  status?: AttendanceStatus;
  checkInAt?: Date | null;
  checkOutAt?: Date | null;
  notes?: string | null;
  reason: string;
  adjustedByUserId: string;
  actor?: AuditActor;
}): Promise<AttendanceRecord> {
  if (!input.reason.trim()) {
    throw new ValidationError("Please record why this attendance record is being changed.");
  }

  const existing = await prisma.attendance.findUnique({ where: { id: input.attendanceId } });
  if (!existing) throw new NotFoundError("Attendance record not found.");

  const checkInAt = input.checkInAt !== undefined ? input.checkInAt : existing.checkInAt;
  const checkOutAt = input.checkOutAt !== undefined ? input.checkOutAt : existing.checkOutAt;

  if (checkInAt && checkOutAt && checkOutAt.getTime() <= checkInAt.getTime()) {
    throw new ValidationError("Check-out must be after check-in.");
  }

  const workedMinutes =
    checkInAt && checkOutAt
      ? Math.max(0, Math.round((checkOutAt.getTime() - checkInAt.getTime()) / 60000))
      : null;

  const record = await prisma.attendance.update({
    where: { id: existing.id },
    data: {
      status: input.status ?? existing.status,
      checkInAt,
      checkOutAt,
      workedMinutes,
      notes: input.notes ?? existing.notes,
      adjustedBy: input.adjustedByUserId,
      adjustmentReason: input.reason,
    },
  });

  await recordAudit({
    actor: input.actor ?? {},
    action: "UPDATE",
    entity: "Attendance",
    entityId: record.id,
    before: {
      status: existing.status,
      checkInAt: existing.checkInAt,
      checkOutAt: existing.checkOutAt,
      workedMinutes: existing.workedMinutes,
    },
    after: { status: record.status, checkInAt, checkOutAt, workedMinutes },
    metadata: { reason: input.reason },
  });

  return toRecord(record);
}

export async function getTodayAttendance(staffId: string, now = new Date()) {
  const dateKey = new Date(`${clinicDateString(now)}T00:00:00.000Z`);
  const record = await prisma.attendance.findUnique({
    where: { staffId_date: { staffId, date: dateKey } },
  });
  return record ? toRecord(record) : null;
}

export interface MonthlySummary {
  staffId: string;
  fullName: string;
  role: string;
  present: number;
  late: number;
  absent: number;
  halfDay: number;
  leave: number;
  totalMinutes: number;
}

export async function getMonthlySummary(year: number, month: number): Promise<MonthlySummary[]> {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));

  const [staff, records] = await Promise.all([
    prisma.staff.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, role: true },
    }),
    prisma.attendance.findMany({
      where: { date: { gte: start, lt: end } },
      select: { staffId: true, status: true, workedMinutes: true },
    }),
  ]);

  const byStaff = new Map<string, MonthlySummary>();

  for (const member of staff) {
    byStaff.set(member.id, {
      staffId: member.id,
      fullName: member.fullName,
      role: member.role,
      present: 0,
      late: 0,
      absent: 0,
      halfDay: 0,
      leave: 0,
      totalMinutes: 0,
    });
  }

  for (const record of records) {
    const entry = byStaff.get(record.staffId);
    if (!entry) continue;

    entry.totalMinutes += record.workedMinutes ?? 0;

    switch (record.status) {
      case "PRESENT":
        entry.present += 1;
        break;
      case "LATE":
        entry.late += 1;
        entry.present += 1;
        break;
      case "HALF_DAY":
        entry.halfDay += 1;
        break;
      case "ABSENT":
        entry.absent += 1;
        break;
      case "LEAVE":
        entry.leave += 1;
        break;
      default:
        break;
    }
  }

  return [...byStaff.values()];
}

/** CSV export for payroll. */
export function attendanceToCsv(rows: MonthlySummary[]): string {
  const header = ["Staff", "Role", "Present", "Late", "Half day", "Leave", "Absent", "Hours"];
  const lines = rows.map((row) =>
    [
      escapeCsv(row.fullName),
      row.role,
      row.present,
      row.late,
      row.halfDay,
      row.leave,
      row.absent,
      (row.totalMinutes / 60).toFixed(2),
    ].join(","),
  );
  return [header.join(","), ...lines].join("\n");
}

/**
 * CSV escaping.
 *
 * Also neutralises formula injection: a name starting with =, +, - or @ is
 * executed by Excel when the export is opened. A staff list is user-controlled
 * data, so this is not theoretical.
 */
function escapeCsv(value: string): string {
  const needsPrefix = /^[=+\-@\t\r]/.test(value);
  const safe = needsPrefix ? `'${value}` : value;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function toRecord(record: {
  id: string;
  date: Date;
  status: AttendanceStatus;
  checkInAt: Date | null;
  checkOutAt: Date | null;
  workedMinutes: number | null;
  lateMinutes: number;
}): AttendanceRecord {
  return {
    id: record.id,
    date: record.date,
    status: record.status,
    checkInAt: record.checkInAt,
    checkOutAt: record.checkOutAt,
    workedMinutes: record.workedMinutes,
    lateMinutes: record.lateMinutes,
  };
}
