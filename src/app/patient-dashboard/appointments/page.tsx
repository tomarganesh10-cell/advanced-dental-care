import Link from "next/link";
import { CalendarPlus, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { formatClinicDate, formatClinicTime } from "@/lib/time";
import { requirePatientPage } from "@/server/auth/guards";
import { getPortalAppointments } from "@/server/portal";
import { STATUS_TONES, humanStatus } from "@/server/booking/state-machine";
import { contact } from "@data/clinic-master-data";

export const dynamic = "force-dynamic";

export default async function PortalAppointmentsPage() {
  const principal = await requirePatientPage();
  const { upcoming, past } = await getPortalAppointments(principal);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl">Your appointments</h1>
          <p className="mt-1 text-sm text-[--color-ink-subtle]">
            All times are Chandigarh time (IST).
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/book-appointment">
            <CalendarPlus aria-hidden="true" />
            Book another
          </Link>
        </Button>
      </div>

      <section className="mb-8" aria-label="Upcoming">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-[--color-ink-subtle] uppercase">
          Upcoming
        </h2>

        {upcoming.length === 0 ? (
          <EmptyState title="Nothing booked" description="Book online or call the clinic." />
        ) : (
          <ul className="space-y-3">
            {upcoming.map((appointment) => (
              <li
                key={appointment.id}
                className="rounded-[--radius-card] border border-[--color-hairline] bg-white p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-[--color-primary]">
                      {formatClinicDate(appointment.startsAt, "EEEE d MMMM yyyy")}
                    </p>
                    <p className="text-lg tabular-nums">{formatClinicTime(appointment.startsAt)}</p>
                    <p className="mt-1.5 text-sm text-[--color-ink-muted]">
                      {appointment.serviceName ?? "Consultation"}
                      {appointment.doctor ? ` · ${appointment.doctor.displayName}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-[--color-ink-subtle]">
                      Reference {appointment.reference}
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <Badge tone={STATUS_TONES[appointment.status]}>
                      {humanStatus(appointment.status)}
                    </Badge>
                    <Button asChild variant="outline" size="sm">
                      <a href={`tel:${contact.phone.e164}`}>
                        <Phone aria-hidden="true" />
                        Change
                      </a>
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/*
          Rescheduling is by phone rather than a button. Self-service
          rescheduling sounds patient-friendly and in a small clinic produces
          gaps nobody fills — reception can offer the slot that actually works
          and fill the one being vacated in the same call.
        */}
        <p className="mt-3 text-xs leading-relaxed text-[--color-ink-subtle]">
          To change or cancel an appointment, call {contact.phone.display}. Reception can usually
          find you a better time in the same call, and it means the slot you are giving up can be
          offered to someone waiting.
        </p>
      </section>

      <section aria-label="Past appointments">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-[--color-ink-subtle] uppercase">
          Past appointments
        </h2>

        {past.length === 0 ? (
          <EmptyState title="No past appointments yet" />
        ) : (
          <ul className="divide-y divide-[--color-hairline] overflow-hidden rounded-[--radius-card] border border-[--color-hairline] bg-white">
            {past.map((appointment) => (
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
    </>
  );
}
