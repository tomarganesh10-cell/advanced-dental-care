import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  CalendarDays,
  FileText,
  Globe2,
  Lock,
  Mail,
  Phone,
  Pill,
  ReceiptText,
  ShieldAlert,
  Stethoscope,
} from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, NoAccessState } from "@/components/ui/states";
import { NotFoundError } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/rbac";
import { formatPhone } from "@/lib/phone";
import { formatClinicDate, formatClinicDateTime } from "@/lib/time";
import { formatPaise } from "@/lib/utils";
import { requireStaffPage } from "@/server/auth/guards";
import { staffCan } from "@/server/auth/session";
import { getPatientForStaff, getPatientTimeline } from "@/server/patients";
import { STATUS_TONES, humanStatus } from "@/server/booking/state-machine";

export const dynamic = "force-dynamic";

export default async function PatientRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const principal = await requireStaffPage(PERMISSIONS.PATIENT_VIEW);

  let data: Awaited<ReturnType<typeof getPatientForStaff>>;
  try {
    data = await getPatientForStaff(id, principal);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const { patient, clinical } = data;
  const timeline = await getPatientTimeline(id);
  const canSeeMoney = staffCan(principal, PERMISSIONS.INVOICE_VIEW);

  return (
    <>
      <PageHeader
        title={patient.fullName}
        description={`${patient.patientNumber} · registered ${formatClinicDate(patient.createdAt, "d MMM yyyy")}`}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <a href={`tel:${patient.phone}`}>
                <Phone aria-hidden="true" />
                Call
              </a>
            </Button>
            <Button asChild size="sm">
              <Link href={`/admin/appointments/new?patientId=${patient.id}`}>
                <CalendarDays aria-hidden="true" />
                Book appointment
              </Link>
            </Button>
          </>
        }
      />

      {/* Safety flags first. Whatever else is on this page, an allergy or an
          anticoagulant needs to be seen before anything is planned. */}
      {patient.clinicalAlert ? (
        <div className="mb-5 flex items-start gap-3 rounded-[--radius-card] border-2 border-red-300 bg-red-50 p-4">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-red-700" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-red-900">Clinical alert</p>
            <p className="mt-0.5 text-sm text-red-900">{patient.clinicalAlert}</p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        {/* Left: identity and contact */}
        <div className="space-y-4">
          <section className="rounded-[--radius-card] border border-[--color-hairline] bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold">Contact</h2>
            <dl className="space-y-2.5 text-sm">
              <Row icon={<Phone className="size-3.5" />} label="Mobile">
                <a href={`tel:${patient.phone}`} className="text-[--color-action] hover:underline">
                  {formatPhone(patient.phone)}
                </a>
              </Row>
              {patient.altPhone ? (
                <Row icon={<Phone className="size-3.5" />} label="Alternate">
                  {formatPhone(patient.altPhone)}
                </Row>
              ) : null}
              {patient.email ? (
                <Row icon={<Mail className="size-3.5" />} label="Email">
                  <a
                    href={`mailto:${patient.email}`}
                    className="break-all text-[--color-action] hover:underline"
                  >
                    {patient.email}
                  </a>
                </Row>
              ) : null}
              {patient.address ? <Row label="Address">{patient.address}</Row> : null}
              {patient.dateOfBirth ? (
                <Row label="Date of birth">
                  {formatClinicDate(patient.dateOfBirth, "d MMM yyyy")}
                  {patient.age !== null ? ` (${patient.age})` : ""}
                </Row>
              ) : null}
              {patient.isInternational ? (
                <Row icon={<Globe2 className="size-3.5" />} label="Travelling from">
                  {patient.countryOfResidence ?? "International patient"}
                </Row>
              ) : null}
            </dl>

            {patient.emergencyContactName ? (
              <div className="mt-4 border-t border-[--color-hairline] pt-3">
                <p className="text-xs font-semibold tracking-wide text-[--color-ink-subtle] uppercase">
                  Emergency contact
                </p>
                <p className="mt-1 text-sm">
                  {patient.emergencyContactName}
                  {patient.emergencyContactRelation ? ` (${patient.emergencyContactRelation})` : ""}
                </p>
                {patient.emergencyContactPhone ? (
                  <a
                    href={`tel:${patient.emergencyContactPhone}`}
                    className="text-sm text-[--color-action] hover:underline"
                  >
                    {formatPhone(patient.emergencyContactPhone)}
                  </a>
                ) : null}
              </div>
            ) : null}

            <p className="mt-4 border-t border-[--color-hairline] pt-3 text-xs text-[--color-ink-subtle]">
              Portal account: {patient.hasPortalAccount ? "active" : "not yet used"}
            </p>
          </section>

          {/* Medical history — clinical staff only */}
          {clinical ? (
            <section className="rounded-[--radius-card] border border-[--color-hairline] bg-white p-5">
              <h2 className="mb-3 text-sm font-semibold">Medical history</h2>

              {clinical.medicalHistory ? (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {clinical.medicalHistory.isDiabetic ? (
                      <Badge tone="warning">Diabetic</Badge>
                    ) : null}
                    {clinical.medicalHistory.isHypertensive ? (
                      <Badge tone="warning">Hypertensive</Badge>
                    ) : null}
                    {clinical.medicalHistory.hasCardiacCondition ? (
                      <Badge tone="danger">Cardiac</Badge>
                    ) : null}
                    {clinical.medicalHistory.onBloodThinners ? (
                      <Badge tone="danger">Anticoagulant</Badge>
                    ) : null}
                    {clinical.medicalHistory.bleedingDisorder ? (
                      <Badge tone="danger">Bleeding disorder</Badge>
                    ) : null}
                    {clinical.medicalHistory.isPregnant ? (
                      <Badge tone="warning">Pregnant</Badge>
                    ) : null}
                    {clinical.medicalHistory.isSmoker ? <Badge tone="neutral">Smoker</Badge> : null}
                  </div>

                  {clinical.medicalHistory.allergies.length > 0 ? (
                    <div className="mt-3 rounded-lg bg-red-50 p-3">
                      <p className="flex items-center gap-1.5 text-xs font-semibold text-red-900">
                        <AlertTriangle className="size-3.5" aria-hidden="true" />
                        Allergies
                      </p>
                      <p className="mt-1 text-sm text-red-900">
                        {clinical.medicalHistory.allergies.join(", ")}
                      </p>
                    </div>
                  ) : null}

                  {clinical.medicalHistory.currentMedications.length > 0 ? (
                    <div className="mt-3">
                      <p className="text-xs font-semibold tracking-wide text-[--color-ink-subtle] uppercase">
                        Current medications
                      </p>
                      <p className="mt-1 text-sm text-[--color-ink-muted]">
                        {clinical.medicalHistory.currentMedications.join(", ")}
                      </p>
                    </div>
                  ) : null}

                  {clinical.medicalHistory.medicalConditions.length > 0 ? (
                    <div className="mt-3">
                      <p className="text-xs font-semibold tracking-wide text-[--color-ink-subtle] uppercase">
                        Conditions
                      </p>
                      <p className="mt-1 text-sm text-[--color-ink-muted]">
                        {clinical.medicalHistory.medicalConditions.join(", ")}
                      </p>
                    </div>
                  ) : null}

                  {clinical.medicalHistory.lastReviewedAt ? (
                    <p className="mt-3 text-xs text-[--color-ink-subtle]">
                      Last reviewed{" "}
                      {formatClinicDate(clinical.medicalHistory.lastReviewedAt, "d MMM yyyy")}
                    </p>
                  ) : (
                    <p className="mt-3 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900">
                      This history has never been reviewed. Confirm it with the patient before
                      treatment.
                    </p>
                  )}
                </>
              ) : (
                <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                  No medical history recorded. This must be taken before any treatment.
                </p>
              )}
            </section>
          ) : (
            /* A non-clinical role sees that a record exists without its
               contents. Pretending there is nothing here would be misleading. */
            <section className="rounded-[--radius-card] border border-[--color-hairline] bg-white p-5">
              <NoAccessState
                title="Clinical record not shown"
                description="Your role covers appointments and contact details. Medical history and clinical notes are restricted to clinical staff."
              />
            </section>
          )}
        </div>

        {/* Right: activity */}
        <div className="space-y-6">
          {/* Appointments */}
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <CalendarDays className="size-4 text-[--color-ink-subtle]" aria-hidden="true" />
              Appointments
            </h2>

            {timeline.appointments.length === 0 ? (
              <EmptyState title="No appointments yet" />
            ) : (
              <ul className="divide-y divide-[--color-hairline] overflow-hidden rounded-[--radius-card] border border-[--color-hairline] bg-white">
                {timeline.appointments.slice(0, 8).map((appointment) => (
                  <li
                    key={appointment.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm"
                  >
                    <span className="font-medium tabular-nums">
                      {formatClinicDate(appointment.startsAt, "d MMM yyyy")}
                    </span>
                    <span className="text-[--color-ink-muted]">
                      {appointment.serviceName ?? "Consultation"}
                    </span>
                    {appointment.doctor ? (
                      <span className="text-xs text-[--color-ink-subtle]">
                        {appointment.doctor.displayName}
                      </span>
                    ) : null}
                    <Badge tone={STATUS_TONES[appointment.status]} className="ml-auto">
                      {humanStatus(appointment.status)}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Clinical notes */}
          {clinical ? (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Stethoscope className="size-4 text-[--color-ink-subtle]" aria-hidden="true" />
                Clinical notes
              </h2>

              {clinical.notes.length === 0 ? (
                <EmptyState title="No clinical notes recorded" />
              ) : (
                <ul className="space-y-3">
                  {clinical.notes.slice(0, 10).map((note) => (
                    <li
                      key={note.id}
                      className="rounded-[--radius-card] border border-[--color-hairline] bg-white p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">
                          {formatClinicDateTime(note.createdAt)}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-[--color-ink-subtle]">
                          {note.doctorName ?? note.authorName ?? "Unknown author"}
                          {note.lockedAt ? (
                            <span title="Locked — corrections are added as amendments">
                              <Lock className="size-3" aria-hidden="true" />
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <dl className="mt-2.5 space-y-1.5 text-sm">
                        {note.chiefComplaint ? (
                          <NoteRow label="Complaint">{note.chiefComplaint}</NoteRow>
                        ) : null}
                        {note.examination ? (
                          <NoteRow label="Examination">{note.examination}</NoteRow>
                        ) : null}
                        {note.diagnosis ? (
                          <NoteRow label="Diagnosis">{note.diagnosis}</NoteRow>
                        ) : null}
                        {note.procedure ? (
                          <NoteRow label="Procedure">{note.procedure}</NoteRow>
                        ) : null}
                        {note.toothNumbers.length > 0 ? (
                          <NoteRow label="Teeth">{note.toothNumbers.join(", ")}</NoteRow>
                        ) : null}
                        {note.advice ? <NoteRow label="Advice">{note.advice}</NoteRow> : null}
                      </dl>

                      {note.privateNote ? (
                        <p className="mt-2.5 rounded-lg bg-[--color-navy-50] p-2.5 text-xs text-[--color-navy-900]">
                          <span className="font-semibold">Private note:</span> {note.privateNote}
                        </p>
                      ) : null}

                      {note.followUpDate ? (
                        <p className="mt-2 text-xs text-[--color-ink-subtle]">
                          Follow up {formatClinicDate(note.followUpDate, "d MMM yyyy")}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          {/* Treatment plans */}
          {clinical && clinical.treatmentPlans.length > 0 ? (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <FileText className="size-4 text-[--color-ink-subtle]" aria-hidden="true" />
                Treatment plans
              </h2>
              <ul className="divide-y divide-[--color-hairline] overflow-hidden rounded-[--radius-card] border border-[--color-hairline] bg-white">
                {clinical.treatmentPlans.map((plan) => (
                  <li
                    key={plan.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm"
                  >
                    <span className="font-medium">{plan.title}</span>
                    <span className="text-xs text-[--color-ink-subtle]">
                      {plan.itemCount} item(s)
                    </span>
                    {canSeeMoney ? (
                      <span className="text-[--color-ink-muted]">
                        {formatPaise(plan.estimatedTotalPaise)}
                      </span>
                    ) : null}
                    <Badge tone="neutral" className="ml-auto">
                      {plan.status.toLowerCase().replace(/_/g, " ")}
                    </Badge>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* Prescriptions */}
          {clinical && clinical.prescriptions.length > 0 ? (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Pill className="size-4 text-[--color-ink-subtle]" aria-hidden="true" />
                Prescriptions
              </h2>
              <ul className="divide-y divide-[--color-hairline] overflow-hidden rounded-[--radius-card] border border-[--color-hairline] bg-white">
                {clinical.prescriptions.map((prescription) => (
                  <li
                    key={prescription.id}
                    className="flex flex-wrap items-center gap-x-3 px-4 py-3 text-sm"
                  >
                    <span className="font-medium tabular-nums">{prescription.reference}</span>
                    <span className="text-[--color-ink-muted]">
                      {formatClinicDate(prescription.issuedAt, "d MMM yyyy")}
                    </span>
                    <span className="text-xs text-[--color-ink-subtle]">
                      {prescription.itemCount} medication(s)
                      {prescription.doctorName ? ` · ${prescription.doctorName}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* Invoices */}
          {canSeeMoney && timeline.invoices.length > 0 ? (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <ReceiptText className="size-4 text-[--color-ink-subtle]" aria-hidden="true" />
                Invoices
              </h2>
              <ul className="divide-y divide-[--color-hairline] overflow-hidden rounded-[--radius-card] border border-[--color-hairline] bg-white">
                {timeline.invoices.map((invoice) => (
                  <li
                    key={invoice.id}
                    className="flex flex-wrap items-center gap-x-3 px-4 py-3 text-sm"
                  >
                    <span className="font-medium tabular-nums">{invoice.number}</span>
                    <span className="text-[--color-ink-muted]">
                      {formatPaise(invoice.totalPaise)}
                    </span>
                    <Badge
                      tone={
                        invoice.status === "PAID"
                          ? "success"
                          : invoice.status === "ISSUED"
                            ? "warning"
                            : "neutral"
                      }
                      className="ml-auto"
                    >
                      {invoice.status.toLowerCase().replace(/_/g, " ")}
                    </Badge>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </>
  );
}

function Row({
  icon,
  label,
  children,
}: {
  icon?: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-2">
      {icon ? (
        <span className="mt-1 shrink-0 text-[--color-ink-subtle]" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <div className="min-w-0">
        <dt className="text-xs text-[--color-ink-subtle]">{label}</dt>
        <dd className="text-[--color-ink]">{children}</dd>
      </div>
    </div>
  );
}

function NoteRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 text-xs text-[--color-ink-subtle]">{label}</dt>
      <dd className="text-[--color-ink-muted]">{children}</dd>
    </div>
  );
}
