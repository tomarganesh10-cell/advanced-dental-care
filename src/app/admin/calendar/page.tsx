import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@/lib/rbac";
import {
  clinicDateString,
  clinicDayEnd,
  clinicDayStart,
  formatClinicDate,
  formatClinicTime,
  timeToMinutes,
  utcToClinicTime,
} from "@/lib/time";
import { cn } from "@/lib/utils";
import { requireStaffPage } from "@/server/auth/guards";
import { STATUS_TONES, humanStatus } from "@/server/booking/state-machine";

export const dynamic = "force-dynamic";

/**
 * Day calendar, one column per dentist.
 *
 * Appointments are positioned by their real start and end times rather than
 * being listed in order, so an overbooked half-hour is visible as an overlap
 * instead of as two adjacent rows nobody notices.
 */

const DAY_START_MINUTES = timeToMinutes("09:00");
const DAY_END_MINUTES = timeToMinutes("20:00");
const MINUTES_PER_PIXEL = 1.4;

function shiftDate(dateString: string, days: number): string {
  const date = new Date(`${dateString}T12:00:00.000Z`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

async function loadCalendar(dateString: string) {
  const dayStart = clinicDayStart(dateString);
  const dayEnd = clinicDayEnd(dateString);

  const [doctors, appointments, holiday] = await Promise.all([
    prisma.doctor.findMany({
      where: { deletedAt: null, isBookable: true },
      orderBy: [{ displayOrder: "asc" }, { displayName: "asc" }],
      select: { id: true, displayName: true },
    }),
    prisma.appointment.findMany({
      where: {
        deletedAt: null,
        startsAt: { gte: dayStart, lte: dayEnd },
        status: { notIn: ["CANCELLED", "RESCHEDULED"] },
      },
      orderBy: { startsAt: "asc" },
      select: {
        id: true,
        reference: true,
        startsAt: true,
        endsAt: true,
        status: true,
        serviceName: true,
        doctorId: true,
        patient: { select: { id: true, fullName: true } },
      },
    }),
    prisma.clinicHoliday.findFirst({
      where: { date: new Date(`${dateString}T00:00:00.000Z`) },
    }),
  ]);

  return { doctors, appointments, holiday };
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  await requireStaffPage(PERMISSIONS.APPOINTMENT_VIEW);
  const params = await searchParams;

  const dateString = params.date ?? clinicDateString(new Date());
  const { doctors, appointments, holiday } = await loadCalendar(dateString);

  const hours: number[] = [];
  for (let m = DAY_START_MINUTES; m <= DAY_END_MINUTES; m += 60) hours.push(m);

  const gridHeight = (DAY_END_MINUTES - DAY_START_MINUTES) / MINUTES_PER_PIXEL;

  return (
    <>
      <PageHeader
        title="Calendar"
        description={formatClinicDate(clinicDayStart(dateString), "EEEE d MMMM yyyy")}
        actions={
          <div className="flex items-center gap-1.5">
            <Link
              href={`/admin/calendar?date=${shiftDate(dateString, -1)}`}
              aria-label="Previous day"
              className="flex size-9 items-center justify-center rounded-lg border border-[--color-navy-200] bg-white hover:bg-[--color-navy-50]"
            >
              <ChevronLeft className="size-4" />
            </Link>
            <Link
              href="/admin/calendar"
              className="rounded-lg border border-[--color-navy-200] bg-white px-3 py-2 text-sm font-medium hover:bg-[--color-navy-50]"
            >
              Today
            </Link>
            <Link
              href={`/admin/calendar?date=${shiftDate(dateString, 1)}`}
              aria-label="Next day"
              className="flex size-9 items-center justify-center rounded-lg border border-[--color-navy-200] bg-white hover:bg-[--color-navy-50]"
            >
              <ChevronRight className="size-4" />
            </Link>
          </div>
        }
      />

      {holiday && !holiday.opens ? (
        <div className="mb-4 rounded-[--radius-card] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>Clinic closed:</strong> {holiday.name}
        </div>
      ) : null}

      {doctors.length === 0 ? (
        <EmptyState
          title="No bookable dentists"
          description="Add a dentist and their working hours before the calendar can show anything."
        />
      ) : (
        <div className="overflow-x-auto rounded-[--radius-card] border border-[--color-hairline] bg-white">
          <div className="min-w-[44rem]">
            {/* Column headers */}
            <div
              className="grid border-b border-[--color-hairline] bg-[--color-surface-sunken]"
              style={{ gridTemplateColumns: `4rem repeat(${doctors.length}, minmax(0, 1fr))` }}
            >
              <div className="px-2 py-2.5 text-xs font-medium text-[--color-ink-subtle]">Time</div>
              {doctors.map((doctor) => (
                <div
                  key={doctor.id}
                  className="border-l border-[--color-hairline] px-3 py-2.5 text-sm font-semibold"
                >
                  {doctor.displayName}
                  <span className="ml-1.5 text-xs font-normal text-[--color-ink-subtle] tabular-nums">
                    {appointments.filter((a) => a.doctorId === doctor.id).length}
                  </span>
                </div>
              ))}
            </div>

            {/* Grid */}
            <div
              className="relative grid"
              style={{
                gridTemplateColumns: `4rem repeat(${doctors.length}, minmax(0, 1fr))`,
                height: `${gridHeight}px`,
              }}
            >
              {/* Hour gutter */}
              <div className="relative">
                {hours.map((minutes) => (
                  <div
                    key={minutes}
                    className="absolute right-2 -translate-y-1/2 text-[11px] text-[--color-ink-subtle] tabular-nums"
                    style={{ top: `${(minutes - DAY_START_MINUTES) / MINUTES_PER_PIXEL}px` }}
                  >
                    {String(Math.floor(minutes / 60)).padStart(2, "0")}:00
                  </div>
                ))}
              </div>

              {doctors.map((doctor) => (
                <div key={doctor.id} className="relative border-l border-[--color-hairline]">
                  {/* Hour lines */}
                  {hours.map((minutes) => (
                    <div
                      key={minutes}
                      className="absolute inset-x-0 border-t border-[--color-hairline]/60"
                      style={{ top: `${(minutes - DAY_START_MINUTES) / MINUTES_PER_PIXEL}px` }}
                      aria-hidden="true"
                    />
                  ))}

                  {appointments
                    .filter((appointment) => appointment.doctorId === doctor.id)
                    .map((appointment) => {
                      const startMinutes = timeToMinutes(utcToClinicTime(appointment.startsAt));
                      const endMinutes = timeToMinutes(utcToClinicTime(appointment.endsAt));
                      const top = (startMinutes - DAY_START_MINUTES) / MINUTES_PER_PIXEL;
                      const height = Math.max(
                        22,
                        (endMinutes - startMinutes) / MINUTES_PER_PIXEL - 2,
                      );

                      return (
                        <Link
                          key={appointment.id}
                          href={`/admin/patients/${appointment.patient.id}`}
                          className={cn(
                            "absolute inset-x-1 overflow-hidden rounded border-l-4 px-2 py-1 text-[11px] leading-tight shadow-[--shadow-subtle] transition-shadow hover:shadow-[--shadow-card]",
                            appointment.status === "COMPLETED"
                              ? "border-l-[--color-teal-500] bg-[--color-teal-50]"
                              : appointment.status === "NO_SHOW"
                                ? "border-l-red-500 bg-red-50"
                                : appointment.status === "IN_PROGRESS" ||
                                    appointment.status === "CHECKED_IN"
                                  ? "border-l-[--color-action] bg-[--color-medical-50]"
                                  : "border-l-[--color-navy-400] bg-[--color-navy-50]",
                          )}
                          style={{ top: `${top}px`, height: `${height}px` }}
                        >
                          <span className="block font-semibold tabular-nums">
                            {formatClinicTime(appointment.startsAt)}
                          </span>
                          <span className="block truncate">{appointment.patient.fullName}</span>
                          {height > 44 ? (
                            <span className="block truncate text-[--color-ink-subtle]">
                              {appointment.serviceName ?? "Consultation"}
                            </span>
                          ) : null}
                        </Link>
                      );
                    })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Legend — colour alone is never the only signal, so the statuses are
          spelled out here as well as carried on each card. */}
      <div className="mt-4 flex flex-wrap gap-2">
        {(["CONFIRMED", "CHECKED_IN", "IN_PROGRESS", "COMPLETED", "NO_SHOW"] as const).map(
          (status) => (
            <Badge key={status} tone={STATUS_TONES[status]}>
              {humanStatus(status)}
            </Badge>
          ),
        )}
      </div>
    </>
  );
}
