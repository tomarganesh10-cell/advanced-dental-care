import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { AppointmentActions } from "@/components/admin/appointment-actions";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { prisma, type Prisma } from "@/lib/db";
import type { AppointmentStatus } from "@/lib/db";
import { PERMISSIONS } from "@/lib/rbac";
import { formatClinicDate, formatClinicTime, clinicDayStart, clinicDayEnd } from "@/lib/time";
import { formatPhone } from "@/lib/phone";
import { requireStaffPage } from "@/server/auth/guards";
import { STATUS_LABELS, STATUS_TONES, humanStatus } from "@/server/booking/state-machine";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

const FILTERS: Array<{ key: string; label: string; statuses?: AppointmentStatus[] }> = [
  {
    key: "needs-action",
    label: "Needs confirming",
    statuses: ["REQUESTED", "PENDING_CONFIRMATION"],
  },
  { key: "upcoming", label: "Upcoming", statuses: ["CONFIRMED", "RESCHEDULED"] },
  { key: "today", label: "Today" },
  { key: "completed", label: "Completed", statuses: ["COMPLETED"] },
  { key: "no-show", label: "Did not attend", statuses: ["NO_SHOW"] },
  { key: "cancelled", label: "Cancelled", statuses: ["CANCELLED"] },
  { key: "all", label: "All" },
];

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string; page?: string }>;
}) {
  const principal = await requireStaffPage(PERMISSIONS.APPOINTMENT_VIEW);
  const params = await searchParams;

  const filterKey = params.filter ?? "needs-action";
  const filter = FILTERS.find((f) => f.key === filterKey) ?? FILTERS[0]!;
  const search = params.q?.trim() ?? "";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const where: Prisma.AppointmentWhereInput = {
    deletedAt: null,
    ...(filter.statuses ? { status: { in: filter.statuses } } : {}),
    ...(filterKey === "today"
      ? {
          startsAt: {
            gte: clinicDayStart(new Date().toISOString().slice(0, 10)),
            lte: clinicDayEnd(new Date().toISOString().slice(0, 10)),
          },
        }
      : {}),
    ...(filterKey === "upcoming" ? { startsAt: { gte: new Date() } } : {}),
    // A doctor's list is their own unless they have been given the wider view.
    ...(principal.role === "DOCTOR" && principal.doctorId ? { doctorId: principal.doctorId } : {}),
    ...(search
      ? {
          OR: [
            { reference: { contains: search, mode: "insensitive" } },
            { patient: { fullName: { contains: search, mode: "insensitive" } } },
            { patient: { phone: { contains: search } } },
            { patient: { patientNumber: { contains: search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [appointments, total] = await Promise.all([
    prisma.appointment.findMany({
      where,
      orderBy:
        filterKey === "completed" || filterKey === "cancelled"
          ? { startsAt: "desc" }
          : { startsAt: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        reference: true,
        startsAt: true,
        status: true,
        serviceName: true,
        channel: true,
        isNewPatient: true,
        cancellationReason: true,
        patient: { select: { id: true, fullName: true, patientNumber: true, phone: true } },
        doctor: { select: { displayName: true } },
      },
    }),
    prisma.appointment.count({ where }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="Appointments"
        description={`${total} appointment${total === 1 ? "" : "s"} in this view`}
      />

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <Link
            key={item.key}
            href={`/admin/appointments?filter=${item.key}${search ? `&q=${encodeURIComponent(search)}` : ""}`}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm font-medium",
              filterKey === item.key
                ? "border-[--color-action] bg-[--color-action] text-white"
                : "border-[--color-navy-200] bg-white text-[--color-ink-muted] hover:bg-[--color-navy-50]",
            )}
          >
            {item.label}
          </Link>
        ))}
      </div>

      {/* Search */}
      <form method="get" className="mb-4 flex gap-2">
        <input type="hidden" name="filter" value={filterKey} />
        <input
          type="search"
          name="q"
          defaultValue={search}
          placeholder="Search by name, phone, patient number or reference"
          aria-label="Search appointments"
          className="h-10 w-full max-w-md rounded-lg border border-[--color-navy-200] bg-white px-3.5 text-sm"
        />
        <button
          type="submit"
          className="h-10 rounded-lg border border-[--color-navy-200] bg-white px-4 text-sm font-medium hover:bg-[--color-navy-50]"
        >
          Search
        </button>
      </form>

      {appointments.length === 0 ? (
        <EmptyState
          title="No appointments in this view"
          description={
            search
              ? "Nothing matched that search. Try a phone number or the booking reference."
              : "Appointments will appear here once they are booked."
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-[--radius-card] border border-[--color-hairline] bg-white">
          <table className="w-full min-w-[56rem] text-sm">
            <caption className="sr-only">Appointments, {filter.label}</caption>
            <thead className="border-b border-[--color-hairline] bg-[--color-surface-sunken]">
              <tr>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">
                  When
                </th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">
                  Patient
                </th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">
                  Treatment
                </th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">
                  Dentist
                </th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">
                  Status
                </th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[--color-hairline]">
              {appointments.map((appointment) => (
                <tr key={appointment.id} className="align-top">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="block font-medium">
                      {formatClinicDate(appointment.startsAt, "d MMM")}
                    </span>
                    <span className="block text-xs text-[--color-ink-subtle] tabular-nums">
                      {formatClinicTime(appointment.startsAt)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/patients/${appointment.patient.id}`}
                      className="font-medium text-[--color-action] hover:underline"
                    >
                      {appointment.patient.fullName}
                    </Link>
                    <span className="block text-xs text-[--color-ink-subtle]">
                      {formatPhone(appointment.patient.phone)} · {appointment.reference}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[--color-ink-muted]">
                    {appointment.serviceName ?? "—"}
                    {appointment.isNewPatient ? (
                      <Badge tone="info" className="ml-1.5">
                        New
                      </Badge>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-[--color-ink-muted]">
                    {appointment.doctor?.displayName ?? "Unassigned"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONES[appointment.status]}>
                      {humanStatus(appointment.status)}
                    </Badge>
                    {appointment.cancellationReason ? (
                      <span className="mt-1 block max-w-[12rem] text-xs text-[--color-ink-subtle]">
                        {appointment.cancellationReason}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <AppointmentActions
                      appointmentId={appointment.id}
                      status={appointment.status}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pageCount > 1 ? (
        <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
          <p className="text-[--color-ink-subtle]">
            Page {page} of {pageCount}
          </p>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link
                href={`/admin/appointments?filter=${filterKey}&page=${page - 1}${search ? `&q=${encodeURIComponent(search)}` : ""}`}
                className="rounded-lg border border-[--color-navy-200] bg-white px-3 py-1.5 font-medium hover:bg-[--color-navy-50]"
              >
                Previous
              </Link>
            ) : null}
            {page < pageCount ? (
              <Link
                href={`/admin/appointments?filter=${filterKey}&page=${page + 1}${search ? `&q=${encodeURIComponent(search)}` : ""}`}
                className="rounded-lg border border-[--color-navy-200] bg-white px-3 py-1.5 font-medium hover:bg-[--color-navy-50]"
              >
                Next
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}

      <p className="sr-only">Status meanings: {Object.values(STATUS_LABELS).join(", ")}.</p>
    </>
  );
}
