import Link from "next/link";
import {
  AlertTriangle,
  CalendarCheck,
  CalendarClock,
  IndianRupee,
  MessageSquareWarning,
  Send,
  Target,
  UserPlus,
} from "lucide-react";
import { PageHeader, StatCard } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { PERMISSIONS } from "@/lib/rbac";
import { formatClinicDate, formatClinicTime } from "@/lib/time";
import { formatPaise } from "@/lib/utils";
import { prisma } from "@/lib/db";
import { requireStaffPage } from "@/server/auth/guards";
import { staffCan } from "@/server/auth/session";
import { getDashboardSummary } from "@/server/reports/dashboard";
import { STATUS_TONES, humanStatus } from "@/server/booking/state-machine";
import { clinicDateString, clinicDayEnd, clinicDayStart } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const principal = await requireStaffPage();
  const summary = await getDashboardSummary();

  const canSeeMoney = staffCan(principal, PERMISSIONS.REPORT_FINANCIAL);
  const canSeeLeads = staffCan(principal, PERMISSIONS.LEAD_VIEW);
  const canSeeAppointments = staffCan(principal, PERMISSIONS.APPOINTMENT_VIEW);

  const today = clinicDateString(new Date());

  // A doctor sees their own list; everyone else with appointment access sees
  // the whole day.
  const todaysAppointments = canSeeAppointments
    ? await prisma.appointment.findMany({
        where: {
          deletedAt: null,
          startsAt: { gte: clinicDayStart(today), lte: clinicDayEnd(today) },
          status: { notIn: ["CANCELLED"] },
          ...(principal.role === "DOCTOR" && principal.doctorId
            ? { doctorId: principal.doctorId }
            : {}),
        },
        orderBy: { startsAt: "asc" },
        take: 12,
        select: {
          id: true,
          reference: true,
          startsAt: true,
          status: true,
          serviceName: true,
          patient: { select: { fullName: true, patientNumber: true } },
          doctor: { select: { displayName: true } },
        },
      })
    : [];

  return (
    <>
      <PageHeader
        title={`Good ${greeting()}, ${principal.fullName.split(" ")[0]}`}
        description={`${formatClinicDate(new Date(), "EEEE d MMMM yyyy")} · ${summary.today.total} appointment${summary.today.total === 1 ? "" : "s"} today`}
        actions={
          canSeeAppointments ? (
            <>
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/calendar">Calendar</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/admin/front-desk">Front desk</Link>
              </Button>
            </>
          ) : null
        }
      />

      {/* Things that need attention, before things that are merely interesting. */}
      <section aria-label="Needs attention" className="mb-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Awaiting confirmation"
            value={summary.pipeline.pendingConfirmation}
            hint="Website bookings not yet confirmed"
            tone={summary.pipeline.pendingConfirmation > 0 ? "warning" : "default"}
            icon={<CalendarClock className="size-4" />}
          />
          {canSeeLeads ? (
            <StatCard
              label="New leads"
              value={summary.pipeline.newLeads}
              hint="Not yet contacted"
              tone={summary.pipeline.newLeads > 0 ? "warning" : "default"}
              icon={<Target className="size-4" />}
            />
          ) : null}
          {canSeeLeads ? (
            <StatCard
              label="Overdue follow-ups"
              value={summary.pipeline.overdueFollowUps}
              tone={summary.pipeline.overdueFollowUps > 0 ? "danger" : "default"}
              icon={<AlertTriangle className="size-4" />}
            />
          ) : null}
          <StatCard
            label="Feedback to handle"
            value={summary.pipeline.unhandledLowFeedback}
            hint="Low scores flagged for service recovery"
            tone={summary.pipeline.unhandledLowFeedback > 0 ? "danger" : "default"}
            icon={<MessageSquareWarning className="size-4" />}
          />
        </div>
      </section>

      {/* Today */}
      <section aria-label="Today" className="mb-6">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-[--color-ink-subtle] uppercase">
          Today
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard
            label="Scheduled"
            value={summary.today.total}
            icon={<CalendarCheck className="size-4" />}
          />
          <StatCard label="Confirmed" value={summary.today.confirmed} />
          <StatCard
            label="In clinic"
            value={summary.today.checkedIn}
            tone={summary.today.checkedIn > 0 ? "success" : "default"}
          />
          <StatCard label="Completed" value={summary.today.completed} />
          <StatCard
            label="Did not attend"
            value={summary.today.noShow}
            tone={summary.today.noShow > 0 ? "danger" : "default"}
          />
        </div>
      </section>

      {/* This month */}
      <section aria-label="This month" className="mb-6">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-[--color-ink-subtle] uppercase">
          This month
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="New patients"
            value={summary.month.newPatients}
            icon={<UserPlus className="size-4" />}
          />
          <StatCard label="Appointments completed" value={summary.month.completedAppointments} />
          <StatCard
            label="Did-not-attend rate"
            value={`${summary.month.noShowRate}%`}
            hint={summary.month.noShowRate > 10 ? "Above the level worth investigating" : undefined}
            tone={summary.month.noShowRate > 10 ? "warning" : "default"}
          />
          {canSeeMoney ? (
            <StatCard
              label="Payments received"
              value={formatPaise(summary.month.revenuePaise)}
              hint={`${formatPaise(summary.month.outstandingPaise)} outstanding`}
              icon={<IndianRupee className="size-4" />}
            />
          ) : (
            <StatCard label="Cancellation rate" value={`${summary.month.cancellationRate}%`} />
          )}
        </div>
      </section>

      {/* Message queue health — a silently stuck queue means patients stop
          getting reminders, which shows up weeks later as a no-show problem. */}
      {summary.messaging.failed > 0 || summary.messaging.queued > 20 ? (
        <div className="mb-6 flex items-start gap-3 rounded-[--radius-card] border border-amber-200 bg-amber-50 p-4">
          <Send className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden="true" />
          <div className="text-sm">
            <p className="font-medium text-amber-950">Message queue needs a look</p>
            <p className="mt-0.5 text-amber-900">
              {summary.messaging.queued} queued, {summary.messaging.failed} failed. Patients may not
              be receiving confirmations or reminders.
            </p>
            <Link
              href="/admin/notifications"
              className="mt-1.5 inline-block font-medium text-amber-900 underline underline-offset-2"
            >
              Open message queue
            </Link>
          </div>
        </div>
      ) : null}

      {/* Today's list */}
      {canSeeAppointments ? (
        <section aria-label="Today's appointments">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-wide text-[--color-ink-subtle] uppercase">
              {principal.role === "DOCTOR" ? "Your schedule today" : "Today's schedule"}
            </h2>
            <Link href="/admin/appointments" className="text-sm font-medium text-[--color-action]">
              All appointments
            </Link>
          </div>

          {todaysAppointments.length === 0 ? (
            <EmptyState
              title="Nothing booked for today"
              description="New bookings will appear here as they come in."
            />
          ) : (
            <div className="overflow-hidden rounded-[--radius-card] border border-[--color-hairline] bg-white">
              <table className="w-full text-sm">
                <caption className="sr-only">Appointments scheduled today</caption>
                <thead className="border-b border-[--color-hairline] bg-[--color-surface-sunken]">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 text-left font-medium">
                      Time
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-left font-medium">
                      Patient
                    </th>
                    <th
                      scope="col"
                      className="hidden px-4 py-2.5 text-left font-medium sm:table-cell"
                    >
                      Treatment
                    </th>
                    <th
                      scope="col"
                      className="hidden px-4 py-2.5 text-left font-medium md:table-cell"
                    >
                      Dentist
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-left font-medium">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[--color-hairline]">
                  {todaysAppointments.map((appointment) => (
                    <tr key={appointment.id} className="hover:bg-[--color-navy-50]/50">
                      <td className="px-4 py-3 font-medium tabular-nums">
                        {formatClinicTime(appointment.startsAt)}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/appointments/${appointment.id}`}
                          className="font-medium text-[--color-action] hover:underline"
                        >
                          {appointment.patient.fullName}
                        </Link>
                        <span className="block text-xs text-[--color-ink-subtle]">
                          {appointment.patient.patientNumber}
                        </span>
                      </td>
                      <td className="hidden px-4 py-3 text-[--color-ink-muted] sm:table-cell">
                        {appointment.serviceName ?? "—"}
                      </td>
                      <td className="hidden px-4 py-3 text-[--color-ink-muted] md:table-cell">
                        {appointment.doctor?.displayName ?? "Unassigned"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={STATUS_TONES[appointment.status]}>
                          {humanStatus(appointment.status)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </>
  );
}

function greeting(now = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      hour12: false,
    }).format(now),
  );
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}
