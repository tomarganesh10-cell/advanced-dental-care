import { CalendarOff, Clock } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@/lib/rbac";
import { formatClinicDate, formatClinicDateTime } from "@/lib/time";
import { requireStaffPage } from "@/server/auth/guards";

export const dynamic = "force-dynamic";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default async function SchedulesPage() {
  await requireStaffPage(PERMISSIONS.SCHEDULE_VIEW);

  const now = new Date();

  const [doctors, timeOff, holidays] = await Promise.all([
    prisma.doctor.findMany({
      where: { deletedAt: null },
      orderBy: [{ displayOrder: "asc" }, { displayName: "asc" }],
      select: {
        id: true,
        displayName: true,
        isBookable: true,
        defaultSlotMinutes: true,
        schedules: {
          where: { isActive: true },
          orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
          select: {
            id: true,
            dayOfWeek: true,
            startTime: true,
            endTime: true,
            slotMinutes: true,
            capacity: true,
            serviceSlugs: true,
          },
        },
      },
    }),
    prisma.doctorTimeOff.findMany({
      where: { endsAt: { gte: now } },
      orderBy: { startsAt: "asc" },
      take: 20,
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        reason: true,
        doctor: { select: { displayName: true } },
      },
    }),
    prisma.clinicHoliday.findMany({
      where: { date: { gte: new Date(now.toISOString().slice(0, 10)) } },
      orderBy: { date: "asc" },
      take: 20,
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Schedules"
        description="Working hours, leave and clinic closures. These decide which slots the website offers."
      />

      {doctors.length === 0 ? (
        <EmptyState title="No dentists configured" />
      ) : (
        <div className="space-y-4">
          {doctors.map((doctor) => {
            const byDay = new Map<number, typeof doctor.schedules>();
            for (const block of doctor.schedules) {
              byDay.set(block.dayOfWeek, [...(byDay.get(block.dayOfWeek) ?? []), block]);
            }

            return (
              <section
                key={doctor.id}
                className="rounded-(--radius-card) border border-(--color-hairline) bg-white"
              >
                <header className="flex flex-wrap items-center justify-between gap-2 border-b border-(--color-hairline) px-5 py-3.5">
                  <h2 className="font-semibold">{doctor.displayName}</h2>
                  <div className="flex gap-1.5">
                    <Badge tone={doctor.isBookable ? "success" : "neutral"}>
                      {doctor.isBookable ? "Bookable online" : "Not bookable online"}
                    </Badge>
                    <Badge tone="outline">{doctor.defaultSlotMinutes} min default</Badge>
                  </div>
                </header>

                {doctor.schedules.length === 0 ? (
                  <p className="px-5 py-4 text-sm text-(--color-ink-subtle)">
                    No working hours set. This dentist will never appear in online availability.
                  </p>
                ) : (
                  <ul className="divide-y divide-(--color-hairline)">
                    {/* Monday-first, which is how a clinic reads a week. */}
                    {[1, 2, 3, 4, 5, 6, 0].map((day) => {
                      const blocks = byDay.get(day);
                      if (!blocks || blocks.length === 0) return null;

                      return (
                        <li
                          key={day}
                          className="flex flex-wrap items-center gap-3 px-5 py-2.5 text-sm"
                        >
                          <span className="w-24 shrink-0 font-medium">{DAY_NAMES[day]}</span>
                          <span className="flex flex-wrap gap-2">
                            {blocks.map((block) => (
                              <span
                                key={block.id}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-(--color-surface-sunken) px-2.5 py-1 text-xs tabular-nums"
                              >
                                <Clock
                                  className="size-3 text-(--color-ink-subtle)"
                                  aria-hidden="true"
                                />
                                {block.startTime} – {block.endTime}
                                {block.capacity > 1 ? ` · ${block.capacity} chairs` : ""}
                                {block.serviceSlugs.length > 0
                                  ? ` · ${block.serviceSlugs.length} treatment(s) only`
                                  : ""}
                              </span>
                            ))}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-(--color-ink-subtle) uppercase">
            Upcoming leave
          </h2>
          {timeOff.length === 0 ? (
            <EmptyState title="No leave booked" />
          ) : (
            <ul className="divide-y divide-(--color-hairline) overflow-hidden rounded-(--radius-card) border border-(--color-hairline) bg-white">
              {timeOff.map((entry) => (
                <li key={entry.id} className="px-4 py-2.5 text-sm">
                  <span className="font-medium">{entry.doctor.displayName}</span>
                  <span className="block text-xs text-(--color-ink-subtle)">
                    {formatClinicDateTime(entry.startsAt)} – {formatClinicDateTime(entry.endsAt)}
                    {entry.reason ? ` · ${entry.reason}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-(--color-ink-subtle) uppercase">
            Clinic closures
          </h2>
          {holidays.length === 0 ? (
            <EmptyState
              title="No holidays loaded"
              description="Load public holidays before launch, or the site will offer appointments on days the clinic is shut."
            />
          ) : (
            <ul className="divide-y divide-(--color-hairline) overflow-hidden rounded-(--radius-card) border border-(--color-hairline) bg-white">
              {holidays.map((holiday) => (
                <li key={holiday.id} className="flex items-center gap-2.5 px-4 py-2.5 text-sm">
                  <CalendarOff
                    className="size-3.5 shrink-0 text-(--color-ink-subtle)"
                    aria-hidden="true"
                  />
                  <span className="font-medium tabular-nums">
                    {formatClinicDate(holiday.date, "d MMM yyyy")}
                  </span>
                  <span className="text-(--color-ink-muted)">{holiday.name}</span>
                  {holiday.opens ? (
                    <Badge tone="warning" className="ml-auto">
                      Half day {holiday.opens}–{holiday.closes}
                    </Badge>
                  ) : (
                    <Badge tone="neutral" className="ml-auto">
                      Closed
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <p className="mt-6 text-xs leading-relaxed text-(--color-ink-subtle)">
        Editing schedules from this screen is not yet built — see docs/STATUS.md. Changes made
        directly to the data take effect immediately: online availability is computed from these
        blocks minus leave, closures and existing appointments.
      </p>
    </>
  );
}
