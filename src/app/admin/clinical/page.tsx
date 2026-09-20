import Link from "next/link";
import { CalendarClock, Lock, Stethoscope } from "lucide-react";
import { PageHeader, StatCard } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@/lib/rbac";
import { formatClinicDate, formatClinicDateTime } from "@/lib/time";
import { truncate } from "@/lib/utils";
import { requireStaffPage } from "@/server/auth/guards";
import { staffCan } from "@/server/auth/session";

export const dynamic = "force-dynamic";

/**
 * Clinical activity.
 *
 * A doctor's working view: recent notes, follow-ups that have come due, and
 * treatment plans waiting on a patient's decision. Scoped to the signed-in
 * clinician unless they hold the wider view.
 */
async function loadClinicalActivity(doctorId: string | null, scopeToDoctor: boolean) {
  const now = new Date();
  const doctorFilter = scopeToDoctor && doctorId ? { doctorId } : {};

  const [notes, dueFollowUps, openPlans, overdueFollowUpCount] = await Promise.all([
    prisma.clinicalNote.findMany({
      where: { deletedAt: null, ...doctorFilter },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true,
        createdAt: true,
        diagnosis: true,
        procedure: true,
        toothNumbers: true,
        followUpDate: true,
        lockedAt: true,
        patient: { select: { id: true, fullName: true, patientNumber: true } },
        doctor: { select: { displayName: true } },
      },
    }),
    prisma.clinicalNote.findMany({
      where: {
        deletedAt: null,
        followUpDate: { lte: now },
        ...doctorFilter,
      },
      orderBy: { followUpDate: "asc" },
      take: 25,
      select: {
        id: true,
        followUpDate: true,
        diagnosis: true,
        advice: true,
        patient: { select: { id: true, fullName: true, phone: true } },
      },
    }),
    prisma.treatmentPlan.findMany({
      where: { deletedAt: null, status: { in: ["PROPOSED", "IN_PROGRESS"] }, ...doctorFilter },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true,
        title: true,
        status: true,
        proposedAt: true,
        isVisibleToPatient: true,
        patient: { select: { id: true, fullName: true } },
        _count: { select: { items: true } },
      },
    }),
    prisma.clinicalNote.count({
      where: { deletedAt: null, followUpDate: { lte: now }, ...doctorFilter },
    }),
  ]);

  return { notes, dueFollowUps, openPlans, overdueFollowUpCount };
}

export default async function ClinicalPage() {
  const principal = await requireStaffPage(PERMISSIONS.CLINICAL_VIEW);

  // A doctor sees their own caseload; an admin or assistant sees everything
  // they are permitted to.
  const scopeToDoctor = principal.role === "DOCTOR" && Boolean(principal.doctorId);

  const { notes, dueFollowUps, openPlans, overdueFollowUpCount } = await loadClinicalActivity(
    principal.doctorId,
    scopeToDoctor,
  );

  const canManagePlans = staffCan(principal, PERMISSIONS.TREATMENT_PLAN_MANAGE);

  return (
    <>
      <PageHeader
        title="Clinical activity"
        description={
          scopeToDoctor
            ? "Your recent notes, follow-ups and open treatment plans."
            : "Recent clinical notes, follow-ups and open treatment plans."
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Recent notes"
          value={notes.length}
          icon={<Stethoscope className="size-4" />}
        />
        <StatCard
          label="Follow-ups due"
          value={overdueFollowUpCount}
          tone={overdueFollowUpCount > 0 ? "warning" : "default"}
          icon={<CalendarClock className="size-4" />}
        />
        <StatCard label="Open treatment plans" value={openPlans.length} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-[--color-ink-subtle] uppercase">
            Follow-ups due
          </h2>
          {dueFollowUps.length === 0 ? (
            <EmptyState
              title="Nothing due"
              description="Follow-up dates set on notes appear here."
            />
          ) : (
            <ul className="divide-y divide-[--color-hairline] overflow-hidden rounded-[--radius-card] border border-[--color-hairline] bg-white">
              {dueFollowUps.map((note) => (
                <li key={note.id} className="px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link
                      href={`/admin/patients/${note.patient.id}`}
                      className="font-medium text-[--color-action] hover:underline"
                    >
                      {note.patient.fullName}
                    </Link>
                    <span className="text-xs text-[--color-danger]">
                      due {note.followUpDate ? formatClinicDate(note.followUpDate, "d MMM") : ""}
                    </span>
                  </div>
                  {note.diagnosis ? (
                    <p className="mt-1 text-xs text-[--color-ink-muted]">
                      {truncate(note.diagnosis, 90)}
                    </p>
                  ) : null}
                  <a
                    href={`tel:${note.patient.phone}`}
                    className="mt-1 inline-block text-xs text-[--color-ink-subtle] hover:underline"
                  >
                    {note.patient.phone}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-[--color-ink-subtle] uppercase">
            Open treatment plans
          </h2>
          {openPlans.length === 0 ? (
            <EmptyState title="No open plans" />
          ) : (
            <ul className="divide-y divide-[--color-hairline] overflow-hidden rounded-[--radius-card] border border-[--color-hairline] bg-white">
              {openPlans.map((plan) => (
                <li key={plan.id} className="px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link
                      href={`/admin/patients/${plan.patient.id}`}
                      className="font-medium text-[--color-action] hover:underline"
                    >
                      {plan.patient.fullName}
                    </Link>
                    <Badge tone={plan.status === "IN_PROGRESS" ? "info" : "warning"}>
                      {plan.status.toLowerCase().replace(/_/g, " ")}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-[--color-ink-muted]">
                    {plan.title} · {plan._count.items} step(s)
                  </p>
                  {!plan.isVisibleToPatient ? (
                    <p className="mt-1 text-xs text-[--color-ink-subtle]">
                      Not yet shared with the patient
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-[--color-ink-subtle] uppercase">
          Recent notes
        </h2>
        {notes.length === 0 ? (
          <EmptyState title="No clinical notes yet" />
        ) : (
          <div className="overflow-x-auto rounded-[--radius-card] border border-[--color-hairline] bg-white">
            <table className="w-full min-w-[42rem] text-sm">
              <caption className="sr-only">Recent clinical notes</caption>
              <thead className="border-b border-[--color-hairline] bg-[--color-surface-sunken]">
                <tr>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">
                    When
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">
                    Patient
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">
                    Diagnosis
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">
                    Procedure
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">
                    Clinician
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[--color-hairline]">
                {notes.map((note) => (
                  <tr key={note.id}>
                    <td className="px-4 py-2.5 text-xs whitespace-nowrap text-[--color-ink-subtle]">
                      {formatClinicDateTime(note.createdAt)}
                      {note.lockedAt ? (
                        <Lock
                          className="ml-1 inline size-3"
                          aria-label="Locked; corrections are appended as amendments"
                        />
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/admin/patients/${note.patient.id}`}
                        className="font-medium text-[--color-action] hover:underline"
                      >
                        {note.patient.fullName}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-[--color-ink-muted]">
                      {note.diagnosis ? truncate(note.diagnosis, 60) : "—"}
                      {note.toothNumbers.length > 0 ? (
                        <span className="block text-xs text-[--color-ink-subtle]">
                          {note.toothNumbers.join(", ")}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 text-[--color-ink-muted]">
                      {note.procedure ? truncate(note.procedure, 50) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-[--color-ink-subtle]">
                      {note.doctor?.displayName ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="mt-6 text-xs leading-relaxed text-[--color-ink-subtle]">
        {canManagePlans
          ? "Authoring notes and prescriptions from this screen is not yet built — see docs/STATUS.md. The data model, permissions and audit trail are in place."
          : "You have read access to the clinical record. Authoring is limited to clinicians."}{" "}
        Notes lock after a grace period; corrections are appended as dated amendments rather than
        rewriting the original.
      </p>
    </>
  );
}
