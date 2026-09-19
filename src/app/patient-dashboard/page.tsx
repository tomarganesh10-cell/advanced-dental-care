import Link from "next/link";
import {
  CalendarDays,
  CalendarPlus,
  FileImage,
  IndianRupee,
  Phone,
  Stethoscope,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { formatClinicDate, formatClinicTime } from "@/lib/time";
import { formatPaise } from "@/lib/utils";
import { requirePatientPage } from "@/server/auth/guards";
import { getPortalOverview } from "@/server/portal";
import { STATUS_TONES, humanStatus } from "@/server/booking/state-machine";
import { contact } from "@data/clinic-master-data";

export const dynamic = "force-dynamic";

export default async function PatientDashboardPage() {
  const principal = await requirePatientPage();
  const { patient, upcoming, plan, outstandingInvoices, documentCount } =
    await getPortalOverview(principal);

  const nextAppointment = upcoming[0];
  const totalOutstanding = outstandingInvoices.reduce((sum, invoice) => sum + invoice.balancePaise, 0);

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl">Hello, {patient.fullName.split(" ")[0]}</h1>
        <p className="mt-1 text-sm text-[--color-ink-subtle]">
          Patient number {patient.patientNumber}
        </p>
      </div>

      {/* Next appointment — the single thing most people sign in to check. */}
      <section className="mb-6" aria-label="Next appointment">
        {nextAppointment ? (
          <div className="rounded-[--radius-card] border border-[--color-medical-200] bg-[--color-medical-50] p-5 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold tracking-wide text-[--color-action] uppercase">
                  Your next appointment
                </p>
                <p className="mt-2 font-[family-name:--font-display] text-2xl font-semibold text-[--color-primary]">
                  {formatClinicDate(nextAppointment.startsAt, "EEEE d MMMM")}
                </p>
                <p className="mt-0.5 text-lg text-[--color-ink]">
                  {formatClinicTime(nextAppointment.startsAt)}
                </p>
                <p className="mt-2 text-sm text-[--color-ink-muted]">
                  {nextAppointment.serviceName ?? "Consultation"}
                  {nextAppointment.doctor ? ` with ${nextAppointment.doctor.displayName}` : ""}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge tone={STATUS_TONES[nextAppointment.status]}>
                    {humanStatus(nextAppointment.status)}
                  </Badge>
                  <span className="text-xs text-[--color-ink-subtle]">
                    Reference {nextAppointment.reference}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Button asChild variant="outline" size="sm">
                  <a href={`tel:${contact.phone.e164}`}>
                    <Phone aria-hidden="true" />
                    Change or cancel
                  </a>
                </Button>
              </div>
            </div>

            <p className="mt-4 border-t border-[--color-medical-200] pt-3 text-xs leading-relaxed text-[--color-ink-muted]">
              Please arrive about 10 minutes early. {contact.address.formatted}
            </p>
          </div>
        ) : (
          <EmptyState
            title="No upcoming appointments"
            description="Book online, or call the clinic and reception will find a time with you."
            action={
              <Button asChild>
                <Link href="/book-appointment">
                  <CalendarPlus aria-hidden="true" />
                  Book an appointment
                </Link>
              </Button>
            }
          />
        )}
      </section>

      {/* Quick cards */}
      <section aria-label="Your records" className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <PortalCard
          href="/patient-dashboard/treatment-plan"
          icon={<Stethoscope className="size-5" />}
          title="Treatment plan"
          value={plan ? plan.title : "None shared yet"}
          hint={
            plan
              ? `${plan.items.length} step${plan.items.length === 1 ? "" : "s"} · ${formatPaise(plan.estimatedTotalPaise)}`
              : "Your dentist will share a plan here once one is agreed."
          }
        />

        <PortalCard
          href="/patient-dashboard/documents"
          icon={<FileImage className="size-5" />}
          title="Your records"
          value={`${documentCount} document${documentCount === 1 ? "" : "s"}`}
          hint="X-rays, reports and prescriptions shared with you"
        />

        <PortalCard
          href="/patient-dashboard/invoices"
          icon={<IndianRupee className="size-5" />}
          title="Invoices"
          value={totalOutstanding > 0 ? formatPaise(totalOutstanding) : "Nothing due"}
          hint={
            outstandingInvoices.length > 0
              ? `${outstandingInvoices.length} invoice${outstandingInvoices.length === 1 ? "" : "s"} outstanding`
              : "All settled"
          }
          tone={totalOutstanding > 0 ? "warning" : "default"}
        />
      </section>

      {/* Upcoming list */}
      {upcoming.length > 1 ? (
        <section aria-label="Other upcoming appointments">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <CalendarDays className="size-4 text-[--color-ink-subtle]" aria-hidden="true" />
            Also coming up
          </h2>
          <ul className="divide-y divide-[--color-hairline] overflow-hidden rounded-[--radius-card] border border-[--color-hairline] bg-white">
            {upcoming.slice(1).map((appointment) => (
              <li key={appointment.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
                <span className="font-medium">
                  {formatClinicDate(appointment.startsAt, "d MMM")} ·{" "}
                  {formatClinicTime(appointment.startsAt)}
                </span>
                <span className="text-[--color-ink-muted]">
                  {appointment.serviceName ?? "Consultation"}
                </span>
                <Badge tone={STATUS_TONES[appointment.status]} className="ml-auto">
                  {humanStatus(appointment.status)}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="mt-8 rounded-[--radius-card] border border-[--color-hairline] bg-white p-4 text-xs leading-relaxed text-[--color-ink-subtle]">
        This portal shows your appointments, treatment plan and records. It is not a way to
        reach the clinic urgently — if you are in pain or something is wrong, please call{" "}
        <a href={`tel:${contact.phone.e164}`} className="font-medium text-[--color-action]">
          {contact.phone.display}
        </a>
        .
      </p>
    </>
  );
}

function PortalCard({
  href,
  icon,
  title,
  value,
  hint,
  tone = "default",
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  value: string;
  hint: string;
  tone?: "default" | "warning";
}) {
  return (
    <Link
      href={href}
      className={`block rounded-[--radius-card] border p-5 transition-shadow hover:shadow-[--shadow-card] ${
        tone === "warning" ? "border-amber-200 bg-amber-50" : "border-[--color-hairline] bg-white"
      }`}
    >
      <span
        className="mb-3 flex size-10 items-center justify-center rounded-xl bg-[--color-navy-50] text-[--color-action]"
        aria-hidden="true"
      >
        {icon}
      </span>
      <p className="text-xs font-medium tracking-wide text-[--color-ink-subtle] uppercase">
        {title}
      </p>
      <p className="mt-1 font-semibold text-[--color-primary]">{value}</p>
      <p className="mt-1 text-xs leading-relaxed text-[--color-ink-subtle]">{hint}</p>
    </Link>
  );
}
