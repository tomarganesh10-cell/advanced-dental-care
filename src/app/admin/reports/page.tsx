import { Download } from "lucide-react";
import { PageHeader, StatCard } from "@/components/admin/page-header";
import { AppointmentTrendChart, SourceChart } from "@/components/admin/trend-chart";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@/lib/rbac";
import { formatPaise } from "@/lib/utils";
import { requireStaffPage } from "@/server/auth/guards";
import { staffCan } from "@/server/auth/session";
import {
  getAppointmentTrend,
  getDashboardSummary,
  getLeadSourcePerformance,
} from "@/server/reports/dashboard";

export const dynamic = "force-dynamic";

async function loadReports() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [summary, trend, sources, byTreatment, doctorLoad] = await Promise.all([
    getDashboardSummary(now),
    getAppointmentTrend(30, now),
    getLeadSourcePerformance(90, now),
    prisma.appointment.groupBy({
      by: ["serviceName"],
      where: { deletedAt: null, startsAt: { gte: monthStart } },
      _count: { _all: true },
      orderBy: { _count: { serviceName: "desc" } },
      take: 10,
    }),
    prisma.appointment.groupBy({
      by: ["doctorId"],
      where: { deletedAt: null, startsAt: { gte: monthStart }, status: "COMPLETED" },
      _count: { _all: true },
    }),
  ]);

  const doctors = await prisma.doctor.findMany({
    where: { id: { in: doctorLoad.map((row) => row.doctorId).filter(Boolean) as string[] } },
    select: { id: true, displayName: true },
  });

  const doctorNames = new Map(doctors.map((doctor) => [doctor.id, doctor.displayName]));

  return {
    summary,
    trend,
    sources,
    byTreatment,
    doctorLoad: doctorLoad
      .map((row) => ({
        name: row.doctorId ? (doctorNames.get(row.doctorId) ?? "Unassigned") : "Unassigned",
        count: row._count._all,
      }))
      .sort((a, b) => b.count - a.count),
  };
}

export default async function ReportsPage() {
  const principal = await requireStaffPage(PERMISSIONS.REPORT_VIEW);
  const canSeeMoney = staffCan(principal, PERMISSIONS.REPORT_FINANCIAL);
  const canExport = staffCan(principal, PERMISSIONS.REPORT_EXPORT);

  const { summary, trend, sources, byTreatment, doctorLoad } = await loadReports();

  return (
    <>
      <PageHeader
        title="Reports"
        description="Appointment volume, enquiry conversion and clinic performance."
        actions={
          canExport ? (
            <Button asChild variant="outline" size="sm">
              {/*
                A plain anchor, not next/link: this is a file download from an
                API route. Client-side navigation to a CSV response would leave
                the user on a blank page instead of downloading anything.
              */}
              <a href="/api/admin/reports/export?report=appointments" download>
                <Download aria-hidden="true" />
                Export appointments
              </a>
            </Button>
          ) : null
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Completed this month" value={summary.month.completedAppointments} />
        <StatCard label="New patients" value={summary.month.newPatients} />
        <StatCard
          label="Did-not-attend rate"
          value={`${summary.month.noShowRate}%`}
          tone={summary.month.noShowRate > 10 ? "warning" : "default"}
          hint={summary.month.noShowRate > 10 ? "Worth investigating above 10%" : undefined}
        />
        {canSeeMoney ? (
          <StatCard
            label="Payments received"
            value={formatPaise(summary.month.revenuePaise)}
            hint={`${formatPaise(summary.month.outstandingPaise)} outstanding`}
          />
        ) : (
          <StatCard label="Cancellation rate" value={`${summary.month.cancellationRate}%`} />
        )}
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-[--color-ink-subtle] uppercase">
          Appointments, last 30 days
        </h2>
        <div className="rounded-[--radius-card] border border-[--color-hairline] bg-white p-4">
          <AppointmentTrendChart data={trend} />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-[--color-ink-subtle] uppercase">
            Where enquiries come from, last 90 days
          </h2>
          <div className="rounded-[--radius-card] border border-[--color-hairline] bg-white p-4">
            <SourceChart data={sources} />
          </div>
          <p className="mt-2 text-xs leading-relaxed text-[--color-ink-subtle]">
            The booked bar is shaded by conversion rate. A long pale bar is a source producing
            volume that does not convert — usually a targeting problem rather than a volume one.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-[--color-ink-subtle] uppercase">
            Treatments booked this month
          </h2>
          <div className="overflow-hidden rounded-[--radius-card] border border-[--color-hairline] bg-white">
            {byTreatment.length === 0 ? (
              <p className="p-6 text-center text-sm text-[--color-ink-subtle]">
                No appointments this month.
              </p>
            ) : (
              <table className="w-full text-sm">
                <caption className="sr-only">Appointments by treatment this month</caption>
                <thead className="border-b border-[--color-hairline] bg-[--color-surface-sunken]">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 text-left font-medium">
                      Treatment
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">
                      Appointments
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[--color-hairline]">
                  {byTreatment.map((row) => (
                    <tr key={row.serviceName ?? "none"}>
                      <td className="px-4 py-2.5">{row.serviceName ?? "Not specified"}</td>
                      <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                        {row._count._all}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-[--color-ink-subtle] uppercase">
          Completed appointments by clinician, this month
        </h2>
        <div className="overflow-hidden rounded-[--radius-card] border border-[--color-hairline] bg-white">
          {doctorLoad.length === 0 ? (
            <p className="p-6 text-center text-sm text-[--color-ink-subtle]">
              Nothing completed this month yet.
            </p>
          ) : (
            <table className="w-full text-sm">
              <caption className="sr-only">Completed appointments by clinician</caption>
              <thead className="border-b border-[--color-hairline] bg-[--color-surface-sunken]">
                <tr>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">
                    Clinician
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">
                    Completed
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[--color-hairline]">
                {doctorLoad.map((row) => (
                  <tr key={row.name}>
                    <td className="px-4 py-2.5">{row.name}</td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums">{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <p className="mt-6 text-xs leading-relaxed text-[--color-ink-subtle]">
        Date-range filtering beyond the fixed windows above is not yet built — see docs/STATUS.md.
        Revenue counts only payments that passed server-side verification.
      </p>
    </>
  );
}
