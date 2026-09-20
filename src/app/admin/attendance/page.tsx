import { Download } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { AttendanceClock } from "@/components/admin/attendance-clock";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { prisma } from "@/lib/db";
import { PERMISSIONS, ROLE_LABELS, type StaffRoleName } from "@/lib/rbac";
import { clinicDateString, clinicDayStart, formatClinicTime } from "@/lib/time";
import { requireStaffPage } from "@/server/auth/guards";
import { staffCan } from "@/server/auth/session";
import { getMonthlySummary, getTodayAttendance } from "@/server/attendance";

export const dynamic = "force-dynamic";

const STATUS_TONES = {
  PRESENT: "success",
  LATE: "warning",
  HALF_DAY: "warning",
  ABSENT: "danger",
  LEAVE: "info",
  WEEK_OFF: "neutral",
  HOLIDAY: "neutral",
} as const;

export default async function AttendancePage() {
  const principal = await requireStaffPage(PERMISSIONS.ATTENDANCE_SELF);
  const canSeeAll = staffCan(principal, PERMISSIONS.ATTENDANCE_VIEW_ALL);
  const canExport = staffCan(principal, PERMISSIONS.ATTENDANCE_EXPORT);

  const now = new Date();
  const today = clinicDateString(now);
  const todayRecord = await getTodayAttendance(principal.staffId, now);

  const monthly = await getMonthlySummary(now.getFullYear(), now.getMonth() + 1);
  const mine = monthly.find((row) => row.staffId === principal.staffId);

  // Today's board, for managers and admins only.
  const todayBoard = canSeeAll
    ? await prisma.attendance.findMany({
        where: { date: clinicDayStart(today) },
        orderBy: { checkInAt: "asc" },
        select: {
          id: true,
          status: true,
          checkInAt: true,
          checkOutAt: true,
          lateMinutes: true,
          adjustmentReason: true,
          staff: { select: { id: true, fullName: true, role: true } },
        },
      })
    : [];

  const activeStaff = canSeeAll
    ? await prisma.staff.findMany({
        where: { isActive: true, deletedAt: null },
        orderBy: { fullName: "asc" },
        select: { id: true, fullName: true, role: true },
      })
    : [];

  const recordedIds = new Set(todayBoard.map((row) => row.staff.id));
  const notYetIn = activeStaff.filter((member) => !recordedIds.has(member.id));

  return (
    <>
      <PageHeader
        title="Attendance"
        description={
          canSeeAll ? "Your shift and today's team board." : "Your shift and this month's record."
        }
        actions={
          canExport ? (
            <Button asChild variant="outline" size="sm">
              <a
                href={`/api/admin/attendance/export?year=${now.getFullYear()}&month=${now.getMonth() + 1}`}
              >
                <Download aria-hidden="true" />
                Export CSV
              </a>
            </Button>
          ) : null
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <AttendanceClock
          fullName={principal.fullName}
          checkedInAt={todayRecord?.checkInAt ? formatClinicTime(todayRecord.checkInAt) : null}
          checkedOutAt={todayRecord?.checkOutAt ? formatClinicTime(todayRecord.checkOutAt) : null}
          lateMinutes={todayRecord?.lateMinutes ?? 0}
          monthSummary={{
            present: mine?.present ?? 0,
            late: mine?.late ?? 0,
            leave: mine?.leave ?? 0,
            absent: mine?.absent ?? 0,
            hours: ((mine?.totalMinutes ?? 0) / 60).toFixed(1),
          }}
        />

        {canSeeAll ? (
          <div className="rounded-[--radius-card] border border-[--color-hairline] bg-white">
            <div className="border-b border-[--color-hairline] px-5 py-3.5">
              <h2 className="text-base font-semibold">Today</h2>
              <p className="text-xs text-[--color-ink-subtle]">
                {todayBoard.length} of {activeStaff.length} staff have clocked in
              </p>
            </div>

            {todayBoard.length === 0 && notYetIn.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  title="No staff records yet"
                  description="Check-ins will appear here."
                />
              </div>
            ) : (
              <table className="w-full text-sm">
                <caption className="sr-only">Staff attendance today</caption>
                <thead className="border-b border-[--color-hairline] bg-[--color-surface-sunken]">
                  <tr>
                    <th scope="col" className="px-5 py-2.5 text-left font-medium">
                      Staff
                    </th>
                    <th
                      scope="col"
                      className="hidden px-4 py-2.5 text-left font-medium sm:table-cell"
                    >
                      Role
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-left font-medium">
                      In
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-left font-medium">
                      Out
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-left font-medium">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[--color-hairline]">
                  {todayBoard.map((row) => (
                    <tr key={row.id}>
                      <td className="px-5 py-2.5 font-medium">
                        {row.staff.fullName}
                        {row.adjustmentReason ? (
                          <span
                            className="ml-1.5 text-xs text-[--color-ink-subtle]"
                            title={`Adjusted: ${row.adjustmentReason}`}
                          >
                            (edited)
                          </span>
                        ) : null}
                      </td>
                      <td className="hidden px-4 py-2.5 text-[--color-ink-subtle] sm:table-cell">
                        {ROLE_LABELS[row.staff.role as StaffRoleName] ?? row.staff.role}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums">
                        {row.checkInAt ? formatClinicTime(row.checkInAt) : "—"}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums">
                        {row.checkOutAt ? formatClinicTime(row.checkOutAt) : "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge tone={STATUS_TONES[row.status]}>
                          {row.status === "HALF_DAY" ? "Half day" : titleCase(row.status)}
                          {row.lateMinutes > 0 ? ` · ${row.lateMinutes}m` : ""}
                        </Badge>
                      </td>
                    </tr>
                  ))}

                  {notYetIn.map((member) => (
                    <tr key={member.id} className="text-[--color-ink-subtle]">
                      <td className="px-5 py-2.5">{member.fullName}</td>
                      <td className="hidden px-4 py-2.5 sm:table-cell">
                        {ROLE_LABELS[member.role as StaffRoleName] ?? member.role}
                      </td>
                      <td className="px-4 py-2.5">—</td>
                      <td className="px-4 py-2.5">—</td>
                      <td className="px-4 py-2.5">
                        <Badge tone="outline">Not in yet</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : null}
      </div>

      {canSeeAll ? (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-[--color-ink-subtle] uppercase">
            This month
          </h2>
          <div className="overflow-x-auto rounded-[--radius-card] border border-[--color-hairline] bg-white">
            <table className="w-full text-sm">
              <caption className="sr-only">Monthly attendance summary by staff member</caption>
              <thead className="border-b border-[--color-hairline] bg-[--color-surface-sunken]">
                <tr>
                  <th scope="col" className="px-5 py-2.5 text-left font-medium">
                    Staff
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">
                    Present
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">
                    Late
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">
                    Half day
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">
                    Leave
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">
                    Absent
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">
                    Hours
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[--color-hairline]">
                {monthly.map((row) => (
                  <tr key={row.staffId}>
                    <td className="px-5 py-2.5 font-medium">{row.fullName}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{row.present}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{row.late}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{row.halfDay}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{row.leave}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{row.absent}</td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                      {(row.totalMinutes / 60).toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs leading-relaxed text-[--color-ink-subtle]">
            Attendance records track check-in and check-out only. This system does not record
            location, screen activity or anything else about how staff spend their day. Every
            manager adjustment is logged with a reason and is visible to the staff member.
          </p>
        </section>
      ) : null}
    </>
  );
}

function titleCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, " ");
}
