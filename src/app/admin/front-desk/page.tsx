import Link from "next/link";
import { Phone } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { AppointmentActions } from "@/components/admin/appointment-actions";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { prisma } from "@/lib/db";
import type { AppointmentStatus } from "@/lib/db";
import { PERMISSIONS } from "@/lib/rbac";
import { clinicDateString, clinicDayEnd, clinicDayStart, formatClinicTime } from "@/lib/time";
import { formatPhone } from "@/lib/phone";
import { requireStaffPage } from "@/server/auth/guards";

export const dynamic = "force-dynamic";

/**
 * Front desk board.
 *
 * A kanban of the day, in the order a patient moves through the clinic. The
 * point is that the receptionist can see, at a glance, who is waiting and for
 * how long — the single most common question at a front desk and the thing an
 * appointment list buries.
 */

const COLUMNS: Array<{
  key: string;
  title: string;
  statuses: AppointmentStatus[];
  description: string;
}> = [
  {
    key: "expected",
    title: "Expected",
    statuses: ["CONFIRMED"],
    description: "Confirmed, not yet arrived",
  },
  {
    key: "waiting",
    title: "Waiting",
    statuses: ["CHECKED_IN"],
    description: "Arrived, waiting to be seen",
  },
  {
    key: "with-doctor",
    title: "With the doctor",
    statuses: ["IN_PROGRESS"],
    description: "In treatment",
  },
  {
    key: "done",
    title: "Completed",
    statuses: ["COMPLETED"],
    description: "Finished today",
  },
  {
    key: "unconfirmed",
    title: "Needs confirming",
    statuses: ["REQUESTED", "PENDING_CONFIRMATION"],
    description: "Booked online, awaiting your confirmation",
  },
];

/**
 * Loads today's board.
 *
 * Kept out of the component body on purpose. Reading the clock is exactly what
 * this page must do — it renders "today" and live waiting times — but a
 * component body is supposed to be pure, so the time-dependent work happens
 * here and the component renders the result it is given.
 */
async function loadFrontDeskBoard() {
  const now = new Date();
  const today = clinicDateString(now);

  const appointments = await prisma.appointment.findMany({
    where: {
      deletedAt: null,
      startsAt: { gte: clinicDayStart(today), lte: clinicDayEnd(today) },
      status: { notIn: ["CANCELLED", "RESCHEDULED"] },
    },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      reference: true,
      startsAt: true,
      status: true,
      serviceName: true,
      isNewPatient: true,
      checkedInAt: true,
      patientNote: true,
      patient: { select: { id: true, fullName: true, patientNumber: true, phone: true, clinicalAlert: true } },
      doctor: { select: { displayName: true } },
    },
  });

  return {
    appointments,
    // One timestamp for the whole render, so two rows in the same table cannot
    // report waiting times measured a few milliseconds apart.
    renderedAt: now.getTime(),
  };
}

export default async function FrontDeskPage() {
  await requireStaffPage(PERMISSIONS.APPOINTMENT_CHECK_IN);

  const { appointments, renderedAt } = await loadFrontDeskBoard();

  return (
    <>
      <PageHeader
        title="Front desk"
        description={`${appointments.length} appointment${appointments.length === 1 ? "" : "s"} today. Move patients across as they arrive.`}
      />

      <div className="grid gap-4 lg:grid-cols-3 xl:grid-cols-5">
        {COLUMNS.map((column) => {
          const items = appointments.filter((a) => column.statuses.includes(a.status));

          return (
            <section
              key={column.key}
              aria-label={column.title}
              className="rounded-[--radius-card] border border-[--color-hairline] bg-white"
            >
              <header className="border-b border-[--color-hairline] px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold">{column.title}</h2>
                  <span className="rounded-full bg-[--color-navy-100] px-2 py-0.5 text-xs font-medium tabular-nums">
                    {items.length}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-[--color-ink-subtle]">{column.description}</p>
              </header>

              <div className="space-y-2.5 p-3">
                {items.length === 0 ? (
                  <p className="py-6 text-center text-xs text-[--color-ink-subtle]">Nobody here</p>
                ) : (
                  items.map((appointment) => {
                    // Waiting time is the number reception is actually asked
                    // for, so it is computed and shown rather than left for
                    // someone to work out from a check-in timestamp.
                    const waitingMinutes = appointment.checkedInAt
                      ? Math.floor((renderedAt - appointment.checkedInAt.getTime()) / 60000)
                      : null;

                    return (
                      <article
                        key={appointment.id}
                        className="rounded-lg border border-[--color-hairline] p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">
                              {appointment.patient.fullName}
                            </p>
                            <p className="text-[11px] text-[--color-ink-subtle]">
                              {appointment.patient.patientNumber}
                            </p>
                          </div>
                          <span className="shrink-0 text-xs font-semibold tabular-nums text-[--color-ink]">
                            {formatClinicTime(appointment.startsAt)}
                          </span>
                        </div>

                        <p className="mt-1.5 text-xs text-[--color-ink-muted]">
                          {appointment.serviceName ?? "Consultation"}
                          {appointment.doctor ? ` · ${appointment.doctor.displayName}` : ""}
                        </p>

                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {appointment.isNewPatient ? <Badge tone="info">New patient</Badge> : null}
                          {waitingMinutes !== null ? (
                            <Badge tone={waitingMinutes > 20 ? "danger" : waitingMinutes > 10 ? "warning" : "neutral"}>
                              Waiting {waitingMinutes}m
                            </Badge>
                          ) : null}
                          {/*
                            A clinical alert (allergy, anticoagulant, latex) is
                            shown at the front desk because that is where the
                            patient is greeted, but the flag only — never the
                            underlying record.
                          */}
                          {appointment.patient.clinicalAlert ? (
                            <Badge tone="danger">Clinical alert</Badge>
                          ) : null}
                        </div>

                        {appointment.patientNote ? (
                          <p className="mt-2 rounded bg-[--color-surface-sunken] p-2 text-[11px] leading-relaxed text-[--color-ink-muted]">
                            “{appointment.patientNote}”
                          </p>
                        ) : null}

                        <div className="mt-2.5 flex items-center gap-2 text-[11px]">
                          <a
                            href={`tel:${appointment.patient.phone}`}
                            className="inline-flex items-center gap-1 text-[--color-action] hover:underline"
                          >
                            <Phone className="size-3" aria-hidden="true" />
                            {formatPhone(appointment.patient.phone)}
                          </a>
                          <Link
                            href={`/admin/patients/${appointment.patient.id}`}
                            className="text-[--color-ink-subtle] hover:underline"
                          >
                            Record
                          </Link>
                        </div>

                        <div className="mt-2.5">
                          <AppointmentActions
                            appointmentId={appointment.id}
                            status={appointment.status}
                          />
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </section>
          );
        })}
      </div>

      {appointments.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="Nothing booked today"
            description="Bookings made on the website appear here as soon as they come in."
          />
        </div>
      ) : null}
    </>
  );
}
