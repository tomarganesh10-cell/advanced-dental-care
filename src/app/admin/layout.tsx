import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { ROLE_LABELS, type StaffRoleName } from "@/lib/rbac";
import { ADMIN_NAV, type NavGroup } from "@/components/admin/admin-nav";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireStaffPage } from "@/server/auth/guards";
import { staffCan } from "@/server/auth/session";
import { clinicDayEnd, clinicDayStart, clinicDateString } from "@/lib/time";

export const metadata: Metadata = {
  title: "Clinic admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Session is resolved against the database here, not inferred from the cookie
  // the middleware saw.
  const principal = await requireStaffPage();

  // Navigation is filtered to what this person can actually reach.
  const nav: NavGroup[] = ADMIN_NAV.map((group) => ({
    label: group.label,
    items: group.items.filter((item) => !item.permission || staffCan(principal, item.permission)),
  })).filter((group) => group.items.length > 0);

  const badges = await loadBadges(principal.staffId, principal.role as StaffRoleName);

  return (
    <AdminShell
      nav={nav}
      user={{
        fullName: principal.fullName,
        role: principal.role,
        roleLabel: ROLE_LABELS[principal.role as StaffRoleName] ?? principal.role,
      }}
      badges={badges}
    >
      {children}
    </AdminShell>
  );
}

/**
 * Counts for the sidebar badges.
 *
 * Kept to four cheap aggregate queries. The temptation is to show a count on
 * every nav item; the cost is a dozen queries on every admin page load, for
 * numbers nobody acts on.
 */
async function loadBadges(staffId: string, role: StaffRoleName): Promise<Record<string, number>> {
  const today = clinicDateString(new Date());
  const dayStart = clinicDayStart(today);
  const dayEnd = clinicDayEnd(today);

  const [todayAppointments, pendingConfirmations, newLeads, followUps] = await Promise.all([
    prisma.appointment.count({
      where: {
        deletedAt: null,
        startsAt: { gte: dayStart, lte: dayEnd },
        status: { in: ["CONFIRMED", "CHECKED_IN", "IN_PROGRESS"] },
      },
    }),
    prisma.appointment.count({
      where: { deletedAt: null, status: { in: ["REQUESTED", "PENDING_CONFIRMATION"] } },
    }),
    prisma.lead.count({ where: { deletedAt: null, status: "NEW" } }),
    prisma.lead.count({
      where: {
        deletedAt: null,
        nextFollowUpAt: { lte: new Date() },
        status: { notIn: ["WON", "LOST"] },
        // A marketing or support user sees only their own follow-ups; a manager
        // sees the whole queue.
        ...(role === "MARKETING" || role === "SUPPORT" ? { assignedToId: staffId } : {}),
      },
    }),
  ]);

  return { todayAppointments, pendingConfirmations, newLeads, followUps };
}
