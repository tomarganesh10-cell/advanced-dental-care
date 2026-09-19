import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { prisma, type Prisma } from "@/lib/db";
import { PERMISSIONS } from "@/lib/rbac";
import { formatPhone } from "@/lib/phone";
import { formatClinicDate } from "@/lib/time";
import { requireStaffPage } from "@/server/auth/guards";
import { staffCan } from "@/server/auth/session";
import { recordAudit } from "@/server/audit";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const principal = await requireStaffPage(PERMISSIONS.PATIENT_VIEW);
  const params = await searchParams;

  const search = params.q?.trim() ?? "";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const where: Prisma.PatientWhereInput = {
    deletedAt: null,
    ...(search
      ? {
          OR: [
            { fullName: { contains: search, mode: "insensitive" } },
            { phone: { contains: search } },
            { email: { contains: search, mode: "insensitive" } },
            { patientNumber: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [patients, total] = await Promise.all([
    prisma.patient.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        patientNumber: true,
        fullName: true,
        phone: true,
        email: true,
        createdAt: true,
        isInternational: true,
        clinicalAlert: true,
        _count: { select: { appointments: true } },
        appointments: {
          where: { status: "COMPLETED" },
          orderBy: { startsAt: "desc" },
          take: 1,
          select: { startsAt: true },
        },
      },
    }),
    prisma.patient.count({ where }),
  ]);

  /**
   * A patient search is a query against health records, so it is audited even
   * though nothing was changed. "Who looked up this patient, and when" is the
   * question an access investigation actually needs answered.
   */
  if (search) {
    await recordAudit({
      actor: { userId: principal.userId, label: principal.fullName, role: principal.role },
      action: "VIEW",
      entity: "Patient",
      metadata: { searchTerm: search, resultCount: total },
    });
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="Patients"
        description={`${total} patient record${total === 1 ? "" : "s"}`}
        actions={
          staffCan(principal, PERMISSIONS.PATIENT_CREATE) ? (
            <Button asChild size="sm">
              <Link href="/admin/patients/new">
                <Plus aria-hidden="true" />
                New patient
              </Link>
            </Button>
          ) : null
        }
      />

      <form method="get" className="mb-4 flex gap-2">
        <div className="relative w-full max-w-md">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[--color-ink-subtle]"
            aria-hidden="true"
          />
          <input
            type="search"
            name="q"
            defaultValue={search}
            placeholder="Name, phone, email or patient number"
            aria-label="Search patients"
            className="h-10 w-full rounded-lg border border-[--color-navy-200] bg-white pr-3.5 pl-9 text-sm"
          />
        </div>
        <button
          type="submit"
          className="h-10 rounded-lg border border-[--color-navy-200] bg-white px-4 text-sm font-medium hover:bg-[--color-navy-50]"
        >
          Search
        </button>
      </form>

      {patients.length === 0 ? (
        <EmptyState
          title={search ? "No patients matched" : "No patient records yet"}
          description={
            search
              ? "Try a phone number, or part of the patient number."
              : "Patient records are created automatically when someone books, or manually by reception."
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-[--radius-card] border border-[--color-hairline] bg-white">
          <table className="w-full min-w-[48rem] text-sm">
            <caption className="sr-only">Patient records</caption>
            <thead className="border-b border-[--color-hairline] bg-[--color-surface-sunken]">
              <tr>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">Patient</th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">Contact</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Visits</th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">Last seen</th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">Registered</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[--color-hairline]">
              {patients.map((patient) => (
                <tr key={patient.id} className="hover:bg-[--color-navy-50]/50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/patients/${patient.id}`}
                      className="font-medium text-[--color-action] hover:underline"
                    >
                      {patient.fullName}
                    </Link>
                    <span className="block text-xs text-[--color-ink-subtle]">
                      {patient.patientNumber}
                    </span>
                    <span className="mt-1 flex flex-wrap gap-1">
                      {patient.clinicalAlert ? <Badge tone="danger">Alert</Badge> : null}
                      {patient.isInternational ? <Badge tone="info">International</Badge> : null}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[--color-ink-muted]">
                    <a href={`tel:${patient.phone}`} className="hover:underline">
                      {formatPhone(patient.phone)}
                    </a>
                    {patient.email ? (
                      <span className="block truncate text-xs">{patient.email}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{patient._count.appointments}</td>
                  <td className="px-4 py-3 text-[--color-ink-muted]">
                    {patient.appointments[0]
                      ? formatClinicDate(patient.appointments[0].startsAt, "d MMM yyyy")
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-[--color-ink-subtle]">
                    {formatClinicDate(patient.createdAt, "d MMM yyyy")}
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
                href={`/admin/patients?page=${page - 1}${search ? `&q=${encodeURIComponent(search)}` : ""}`}
                className="rounded-lg border border-[--color-navy-200] bg-white px-3 py-1.5 font-medium hover:bg-[--color-navy-50]"
              >
                Previous
              </Link>
            ) : null}
            {page < pageCount ? (
              <Link
                href={`/admin/patients?page=${page + 1}${search ? `&q=${encodeURIComponent(search)}` : ""}`}
                className="rounded-lg border border-[--color-navy-200] bg-white px-3 py-1.5 font-medium hover:bg-[--color-navy-50]"
              >
                Next
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}
    </>
  );
}
