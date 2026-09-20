import { prisma } from "@/lib/db";
import {
  CLINIC_TIMEZONE,
  clinicDateString,
  clinicDayEnd,
  clinicDayStart,
  clinicDayOfWeek,
  clinicTimeToUtc,
  intervalsOverlap,
  minutesToTime,
  timeToMinutes,
  utcToClinicTime,
} from "@/lib/time";
import type { AppointmentStatus } from "@/lib/db";

/**
 * Slot availability.
 *
 * A slot is offered only when every one of these holds:
 *   1. it falls inside one of the doctor's weekly schedule blocks
 *   2. the whole appointment fits inside that block (no slot that runs past
 *      closing)
 *   3. the clinic is not closed that day (ClinicHoliday)
 *   4. the doctor is not on leave (DoctorTimeOff)
 *   5. existing appointments in that window are below the block's capacity
 *   6. it is far enough in the future to be honoured (lead time)
 *
 * Statuses that consume capacity are listed explicitly. A cancelled or
 * no-show appointment must free its slot; a pending one must not, or the same
 * time gets handed out twice while reception is still confirming.
 */

export const CAPACITY_CONSUMING_STATUSES: AppointmentStatus[] = [
  "REQUESTED",
  "PENDING_CONFIRMATION",
  "CONFIRMED",
  "RESCHEDULE_REQUESTED",
  "RESCHEDULED",
  "CHECKED_IN",
  "IN_PROGRESS",
];

/** Minimum notice for an online booking. Reception can override in admin. */
export const DEFAULT_MIN_LEAD_MINUTES = 120;

/** How far ahead the public booking calendar goes. */
export const DEFAULT_MAX_ADVANCE_DAYS = 90;

export interface SlotQuery {
  /** "yyyy-MM-dd" in clinic-local time. */
  date: string;
  doctorId?: string | null;
  serviceSlug?: string | null;
  durationMinutes?: number;
  /** Overrides used by admin to book outside the public rules. */
  ignoreLeadTime?: boolean;
  now?: Date;
}

export interface Slot {
  /** UTC instant. */
  startsAt: Date;
  endsAt: Date;
  /** "HH:mm" clinic-local, for display. */
  label: string;
  doctorId: string;
  doctorName: string;
  remainingCapacity: number;
}

export interface DayAvailability {
  date: string;
  timezone: string;
  isClinicClosed: boolean;
  closureReason: string | null;
  slots: Slot[];
}

interface ScheduleBlock {
  doctorId: string;
  doctorName: string;
  startMinutes: number;
  endMinutes: number;
  slotMinutes: number;
  capacity: number;
  serviceSlugs: string[];
}

export async function getDayAvailability(query: SlotQuery): Promise<DayAvailability> {
  const now = query.now ?? new Date();
  const dayStart = clinicDayStart(query.date);
  const dayEnd = clinicDayEnd(query.date);
  const dayOfWeek = clinicDayOfWeek(dayStart);

  // --- 3. clinic-wide closure ------------------------------------------
  const holiday = await prisma.clinicHoliday.findFirst({
    where: { date: new Date(`${query.date}T00:00:00.000Z`) },
  });

  if (holiday && !holiday.opens) {
    return {
      date: query.date,
      timezone: CLINIC_TIMEZONE,
      isClinicClosed: true,
      closureReason: holiday.name,
      slots: [],
    };
  }

  // --- 1. schedule blocks ----------------------------------------------
  const schedules = await prisma.doctorSchedule.findMany({
    where: {
      dayOfWeek,
      isActive: true,
      doctor: {
        deletedAt: null,
        isBookable: true,
        ...(query.doctorId ? { id: query.doctorId } : {}),
      },
      AND: [
        { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: dayEnd } }] },
        { OR: [{ effectiveTo: null }, { effectiveTo: { gte: dayStart } }] },
      ],
    },
    select: {
      startTime: true,
      endTime: true,
      slotMinutes: true,
      capacity: true,
      serviceSlugs: true,
      doctor: { select: { id: true, displayName: true, defaultSlotMinutes: true } },
    },
  });

  if (schedules.length === 0) {
    return {
      date: query.date,
      timezone: CLINIC_TIMEZONE,
      isClinicClosed: true,
      closureReason: holiday?.name ?? "No clinic hours on this day",
      slots: [],
    };
  }

  // A half-day holiday narrows every block rather than removing it.
  const holidayOpen = holiday?.opens ? timeToMinutes(holiday.opens) : null;
  const holidayClose = holiday?.closes ? timeToMinutes(holiday.closes) : null;

  const blocks: ScheduleBlock[] = schedules
    .filter((s) => {
      // A block restricted to specific treatments only offers those.
      if (s.serviceSlugs.length === 0) return true;
      if (!query.serviceSlug) return true;
      return s.serviceSlugs.includes(query.serviceSlug);
    })
    .map((s) => {
      let startMinutes = timeToMinutes(s.startTime);
      let endMinutes = timeToMinutes(s.endTime);
      if (holidayOpen !== null) startMinutes = Math.max(startMinutes, holidayOpen);
      if (holidayClose !== null) endMinutes = Math.min(endMinutes, holidayClose);
      return {
        doctorId: s.doctor.id,
        doctorName: s.doctor.displayName,
        startMinutes,
        endMinutes,
        slotMinutes: s.slotMinutes || s.doctor.defaultSlotMinutes,
        capacity: Math.max(1, s.capacity),
        serviceSlugs: s.serviceSlugs,
      };
    })
    .filter((b) => b.endMinutes > b.startMinutes);

  const doctorIds = [...new Set(blocks.map((b) => b.doctorId))];

  // --- 4. doctor time off ----------------------------------------------
  const timeOff = await prisma.doctorTimeOff.findMany({
    where: {
      doctorId: { in: doctorIds },
      startsAt: { lt: dayEnd },
      endsAt: { gt: dayStart },
    },
    select: { doctorId: true, startsAt: true, endsAt: true },
  });

  // --- 5. existing appointments ----------------------------------------
  const existing = await prisma.appointment.findMany({
    where: {
      doctorId: { in: doctorIds },
      deletedAt: null,
      status: { in: CAPACITY_CONSUMING_STATUSES },
      startsAt: { lt: dayEnd },
      endsAt: { gt: dayStart },
    },
    select: { doctorId: true, startsAt: true, endsAt: true },
  });

  // --- assemble ---------------------------------------------------------
  const duration = query.durationMinutes ?? 0;
  const minStart = query.ignoreLeadTime
    ? now
    : new Date(now.getTime() + DEFAULT_MIN_LEAD_MINUTES * 60 * 1000);

  const slots: Slot[] = [];

  for (const block of blocks) {
    const slotLength = duration > 0 ? duration : block.slotMinutes;
    const step = block.slotMinutes;

    for (let m = block.startMinutes; m + slotLength <= block.endMinutes; m += step) {
      const startsAt = clinicTimeToUtc(dayStart, minutesToTime(m));
      const endsAt = new Date(startsAt.getTime() + slotLength * 60 * 1000);

      // 6. lead time
      if (startsAt.getTime() < minStart.getTime()) continue;

      // 4. doctor unavailable
      const isOff = timeOff.some(
        (t) =>
          t.doctorId === block.doctorId && intervalsOverlap(startsAt, endsAt, t.startsAt, t.endsAt),
      );
      if (isOff) continue;

      // 5. capacity
      const overlapping = existing.filter(
        (a) =>
          a.doctorId === block.doctorId && intervalsOverlap(startsAt, endsAt, a.startsAt, a.endsAt),
      ).length;
      const remainingCapacity = block.capacity - overlapping;
      if (remainingCapacity <= 0) continue;

      slots.push({
        startsAt,
        endsAt,
        label: utcToClinicTime(startsAt),
        doctorId: block.doctorId,
        doctorName: block.doctorName,
        remainingCapacity,
      });
    }
  }

  slots.sort(
    (a, b) =>
      a.startsAt.getTime() - b.startsAt.getTime() || a.doctorName.localeCompare(b.doctorName),
  );

  return {
    date: query.date,
    timezone: CLINIC_TIMEZONE,
    isClinicClosed: false,
    closureReason: null,
    slots,
  };
}

/**
 * Authoritative re-check performed inside the booking transaction.
 *
 * `getDayAvailability` is what the patient sees; this is what decides. The two
 * are separated because the list the patient loaded may be seconds or minutes
 * stale, and the gap between "showed a slot" and "wrote the row" is exactly
 * where double-booking lives.
 */
export interface SlotCheckInput {
  doctorId: string;
  startsAt: Date;
  endsAt: Date;
  serviceSlug?: string | null;
  /** Excluded from the conflict check when rescheduling an existing booking. */
  excludeAppointmentId?: string;
  now?: Date;
  ignoreLeadTime?: boolean;
}

export type SlotCheckResult = { ok: true } | { ok: false; reason: string };

export async function checkSlotBookable(
  input: SlotCheckInput,
  client: Pick<
    typeof prisma,
    "appointment" | "doctorSchedule" | "doctorTimeOff" | "clinicHoliday"
  > = prisma,
): Promise<SlotCheckResult> {
  const now = input.now ?? new Date();

  if (input.endsAt.getTime() <= input.startsAt.getTime()) {
    return { ok: false, reason: "The appointment end time must be after its start time." };
  }

  if (input.startsAt.getTime() <= now.getTime()) {
    return { ok: false, reason: "That time is in the past." };
  }

  if (!input.ignoreLeadTime) {
    const minStart = now.getTime() + DEFAULT_MIN_LEAD_MINUTES * 60 * 1000;
    if (input.startsAt.getTime() < minStart) {
      return {
        ok: false,
        reason:
          "Online bookings need at least two hours' notice. Please call the clinic for anything sooner.",
      };
    }
    const maxStart = now.getTime() + DEFAULT_MAX_ADVANCE_DAYS * 24 * 60 * 60 * 1000;
    if (input.startsAt.getTime() > maxStart) {
      return { ok: false, reason: "That date is too far ahead to book online." };
    }
  }

  // Holiday. The key is the clinic-local calendar date, not the UTC date —
  // a 19:00 IST appointment is 13:30 UTC on the same day, but an appointment
  // late enough in the evening would otherwise resolve to the wrong day.
  const dayKey = new Date(`${clinicDateString(input.startsAt)}T00:00:00.000Z`);
  const holiday = await client.clinicHoliday.findFirst({ where: { date: dayKey } });
  if (holiday && !holiday.opens) {
    return { ok: false, reason: `The clinic is closed that day (${holiday.name}).` };
  }

  // Schedule block must fully contain the appointment
  const dayOfWeek = clinicDayOfWeek(input.startsAt);
  const startHHmm = utcToClinicTime(input.startsAt);
  const endHHmm = utcToClinicTime(input.endsAt);
  const startMinutes = timeToMinutes(startHHmm);
  const endMinutes = timeToMinutes(endHHmm);

  const schedules = await client.doctorSchedule.findMany({
    where: {
      doctorId: input.doctorId,
      dayOfWeek,
      isActive: true,
      AND: [
        { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: input.startsAt } }] },
        { OR: [{ effectiveTo: null }, { effectiveTo: { gte: input.startsAt } }] },
      ],
    },
    select: { startTime: true, endTime: true, capacity: true, serviceSlugs: true },
  });

  const containing = schedules.find((s) => {
    const blockStart = timeToMinutes(s.startTime);
    const blockEnd = timeToMinutes(s.endTime);
    if (startMinutes < blockStart || endMinutes > blockEnd) return false;
    if (
      s.serviceSlugs.length > 0 &&
      input.serviceSlug &&
      !s.serviceSlugs.includes(input.serviceSlug)
    ) {
      return false;
    }
    return true;
  });

  if (!containing) {
    return { ok: false, reason: "That time is outside the doctor's clinic hours." };
  }

  // Doctor time off
  const off = await client.doctorTimeOff.findFirst({
    where: {
      doctorId: input.doctorId,
      startsAt: { lt: input.endsAt },
      endsAt: { gt: input.startsAt },
    },
  });
  if (off) {
    return { ok: false, reason: "The doctor is not available at that time." };
  }

  // Capacity
  const overlapping = await client.appointment.count({
    where: {
      doctorId: input.doctorId,
      deletedAt: null,
      status: { in: CAPACITY_CONSUMING_STATUSES },
      startsAt: { lt: input.endsAt },
      endsAt: { gt: input.startsAt },
      ...(input.excludeAppointmentId ? { id: { not: input.excludeAppointmentId } } : {}),
    },
  });

  if (overlapping >= Math.max(1, containing.capacity)) {
    return { ok: false, reason: "That time has just been taken. Please choose another slot." };
  }

  return { ok: true };
}
