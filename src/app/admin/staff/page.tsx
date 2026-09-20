import { PageHeader, StatCard } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { prisma } from "@/lib/db";
import { PERMISSIONS, ROLE_DESCRIPTIONS, ROLE_LABELS, type StaffRoleName } from "@/lib/rbac";
import { formatClinicDate } from "@/lib/time";
import { formatPhone } from "@/lib/phone";
import { requireStaffPage } from "@/server/auth/guards";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  await requireStaffPage(PERMISSIONS.STAFF_VIEW);

  const staff = await prisma.staff.findMany({
    where: { deletedAt: null },
    orderBy: [{ isActive: "desc" }, { fullName: "asc" }],
    select: {
      id: true,
      staffCode: true,
      fullName: true,
      role: true,
      designation: true,
      email: true,
      phone: true,
      joiningDate: true,
      isActive: true,
      doctor: { select: { id: true, isBookable: true, isPubliclyListed: true } },
      permissionGrants: { select: { permission: true, allow: true, expiresAt: true } },
      user: { select: { lastLoginAt: true, mfaEnabledAt: true } },
    },
  });

  const active = staff.filter((member) => member.isActive);
  const doctors = active.filter((member) => member.doctor);

  return (
    <>
      <PageHeader
        title="Staff"
        description="Everyone with access to this system, and what their role permits."
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard label="Active staff" value={active.length} />
        <StatCard label="Dentists" value={doctors.length} />
        <StatCard label="Inactive" value={staff.length - active.length} hint="Cannot sign in" />
      </div>

      {staff.length === 0 ? (
        <EmptyState title="No staff records" />
      ) : (
        <div className="overflow-x-auto rounded-[--radius-card] border border-[--color-hairline] bg-white">
          <table className="w-full min-w-[48rem] text-sm">
            <caption className="sr-only">Staff accounts</caption>
            <thead className="border-b border-[--color-hairline] bg-[--color-surface-sunken]">
              <tr>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">
                  Name
                </th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">
                  Role
                </th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">
                  Contact
                </th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">
                  Joined
                </th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">
                  Last signed in
                </th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[--color-hairline]">
              {staff.map((member) => {
                const grants = member.permissionGrants.filter(
                  (grant) => !grant.expiresAt || grant.expiresAt.getTime() > Date.now(),
                );

                return (
                  <tr key={member.id} className={member.isActive ? "" : "opacity-60"}>
                    <td className="px-4 py-3">
                      <span className="font-medium">{member.fullName}</span>
                      <span className="block text-xs text-[--color-ink-subtle]">
                        {member.staffCode}
                        {member.designation ? ` · ${member.designation}` : ""}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={member.role === "SUPER_ADMIN" ? "danger" : "neutral"}>
                        {ROLE_LABELS[member.role as StaffRoleName] ?? member.role}
                      </Badge>
                      {grants.length > 0 ? (
                        <span
                          className="mt-1 block text-xs text-[--color-ink-subtle]"
                          title={grants
                            .map((g) => `${g.allow ? "+" : "−"} ${g.permission}`)
                            .join("\n")}
                        >
                          {grants.filter((g) => g.allow).length} added,{" "}
                          {grants.filter((g) => !g.allow).length} removed
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-[--color-ink-muted]">
                      {member.email ? (
                        <span className="block truncate text-xs">{member.email}</span>
                      ) : null}
                      {member.phone ? (
                        <span className="block text-xs">{formatPhone(member.phone)}</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-[--color-ink-subtle]">
                      {member.joiningDate
                        ? formatClinicDate(member.joiningDate, "d MMM yyyy")
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-[--color-ink-subtle]">
                      {member.user?.lastLoginAt
                        ? formatClinicDate(member.user.lastLoginAt, "d MMM yyyy")
                        : "Never"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <Badge tone={member.isActive ? "success" : "neutral"}>
                          {member.isActive ? "Active" : "Inactive"}
                        </Badge>
                        {member.user?.mfaEnabledAt ? <Badge tone="info">2FA</Badge> : null}
                        {member.doctor?.isPubliclyListed ? (
                          <Badge tone="outline">On website</Badge>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* The permission model, spelled out where the people it governs are
          listed — so "why can't reception see that" has an answer on screen. */}
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-[--color-ink-subtle] uppercase">
          What each role can do
        </h2>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(Object.keys(ROLE_LABELS) as StaffRoleName[]).map((role) => (
            <div
              key={role}
              className="rounded-[--radius-card] border border-[--color-hairline] bg-white p-4"
            >
              <dt className="text-sm font-semibold">{ROLE_LABELS[role]}</dt>
              <dd className="mt-1 text-xs leading-relaxed text-[--color-ink-subtle]">
                {ROLE_DESCRIPTIONS[role]}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <p className="mt-6 text-xs leading-relaxed text-[--color-ink-subtle]">
        Creating and editing staff from this screen is not yet built — see docs/STATUS.md. Accounts
        are currently created by an administrator through the seed or directly. Every staff member
        must have their own login: the audit trail is worthless if several people share one.
      </p>
    </>
  );
}
