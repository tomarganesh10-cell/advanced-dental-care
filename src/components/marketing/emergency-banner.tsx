import { AlertTriangle, Phone } from "lucide-react";
import { contact, disclaimers, openingHours } from "@data/clinic-master-data";
import { OpeningHoursList } from "./opening-hours";

/**
 * Urgent care section.
 *
 * Deliberately does NOT claim 24/7 availability — the old site's structure
 * invited that claim and the clinic has not confirmed it staffs an out-of-hours
 * service. Promising a 24-hour line that nobody answers at 2am is worse than
 * being clear about hours, and it is the kind of promise that ends up in a
 * complaint.
 *
 * Instead it tells someone in pain what to do now, and — importantly — what
 * warrants a hospital rather than a dental clinic.
 */
const URGENT_SYMPTOMS = [
  "Severe or worsening toothache",
  "Facial swelling",
  "A broken or knocked-out tooth",
  "Bleeding that will not stop",
  "Wisdom tooth pain with difficulty opening",
  "A lost crown, filling or denture",
];

export function EmergencyBanner() {
  return (
    <div className="container-page">
      <div className="overflow-hidden rounded-[--radius-card] border border-amber-200 bg-amber-50">
        <div className="grid gap-8 p-6 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] md:p-8">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold tracking-wide text-amber-900 uppercase">
              <AlertTriangle className="size-3.5" aria-hidden="true" />
              Urgent dental care
            </p>

            <h2 className="mt-4 text-2xl md:text-3xl">In pain today?</h2>

            <p className="mt-3 max-w-lg text-sm leading-relaxed text-[--color-ink-muted]">
              Call the clinic during opening hours and we will try to see you the same day.
              Tell reception what the problem is — dental pain with swelling is triaged ahead
              of a routine check-up.
            </p>

            <ul className="mt-4 grid gap-x-6 gap-y-1.5 text-sm text-[--color-ink-muted] sm:grid-cols-2">
              {URGENT_SYMPTOMS.map((symptom) => (
                <li key={symptom} className="flex items-start gap-2">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
                  {symptom}
                </li>
              ))}
            </ul>

            <a
              href={`tel:${contact.phone.e164}`}
              className="mt-6 inline-flex h-12 items-center gap-2 rounded-full bg-amber-600 px-6 text-sm font-semibold text-white hover:bg-amber-700"
            >
              <Phone className="size-4" aria-hidden="true" />
              Call {contact.phone.display}
            </a>
          </div>

          <div className="space-y-5">
            <div className="rounded-xl border border-amber-200 bg-white p-5">
              <p className="text-xs font-semibold tracking-wide text-[--color-ink-subtle] uppercase">
                Clinic hours
              </p>
              <OpeningHoursList claim={openingHours} className="mt-3" />
            </div>

            {/*
              The distinction between a dental emergency and a medical one is
              the single most useful thing this section can say.
            */}
            <div className="rounded-xl border-2 border-red-200 bg-red-50 p-5">
              <p className="text-sm font-semibold text-red-900">Go to hospital, not the clinic</p>
              <p className="mt-1.5 text-sm leading-relaxed text-red-900/85">
                {disclaimers.emergency}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
