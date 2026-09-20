import Link from "next/link";
import { ArrowRight, GraduationCap, Stethoscope, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { doctors } from "@data/clinic-master-data";
import { publicValue } from "@data/verification";

/**
 * Principal dentist introduction.
 *
 * Credentials render only when verified. An unverified qualification is
 * replaced by the clinician's area of practice, which is descriptive rather
 * than a claim about a certificate — see docs/CONTENT_AUDIT.md §3.
 */
export function DoctorIntro() {
  const doctor = doctors[0];
  if (!doctor) return null;

  const qualifications = publicValue(doctor.qualifications);
  const registration = publicValue(doctor.registration);
  const practisingSince = publicValue(doctor.practisingSinceYear);
  const memberships = publicValue(doctor.memberships);

  return (
    <div className="container-page">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)] lg:items-center lg:gap-16">
        <div className="relative">
          <div className="aspect-4/5 overflow-hidden rounded-(--radius-card) border border-(--color-hairline) bg-gradient-to-b from-(--color-navy-50) to-(--color-sand) shadow-(--shadow-card)">
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <div className="flex size-16 items-center justify-center rounded-full bg-white shadow-(--shadow-subtle)">
                <UserRound className="size-8 text-(--color-navy-400)" aria-hidden="true" />
              </div>
              <p className="text-sm font-medium text-(--color-ink)">Portrait of {doctor.name}</p>
              <p className="max-w-xs text-xs leading-relaxed text-(--color-ink-subtle)">
                A professional headshot belongs here. Patients look for the person before they look
                for the practice.
              </p>
            </div>
          </div>
        </div>

        <div>
          <p className="mb-2.5 text-xs font-semibold tracking-[0.16em] text-(--color-accent) uppercase">
            Meet your dentist
          </p>

          <h2 className="text-3xl md:text-4xl">{doctor.name}</h2>
          <p className="mt-2 text-base font-medium text-(--color-ink-muted)">
            {doctor.designation}
          </p>

          {qualifications?.length ? (
            <p className="mt-3 flex items-center gap-2 text-sm text-(--color-ink-muted)">
              <GraduationCap className="size-4 shrink-0 text-(--color-accent)" aria-hidden="true" />
              {qualifications.join(" · ")}
            </p>
          ) : null}

          {registration ? (
            <p className="mt-1.5 text-sm text-(--color-ink-subtle)">
              {registration.council} registration {registration.number}
            </p>
          ) : null}

          {practisingSince ? (
            <p className="mt-1.5 text-sm text-(--color-ink-subtle)">
              In practice since {practisingSince}
            </p>
          ) : null}

          <div className="prose-clinic mt-5">
            <p>
              Dr. Gupta leads the implant and cosmetic practice at the clinic. Complex cases here
              start with records and a written plan rather than a chair-side estimate — you should
              know what is proposed, what it will cost and what the alternatives are before
              treatment begins.
            </p>
          </div>

          <div className="mt-6">
            <p className="text-xs font-semibold tracking-wide text-(--color-ink-subtle) uppercase">
              Areas of practice
            </p>
            <ul className="mt-2.5 flex flex-wrap gap-2">
              {doctor.specialInterests.map((interest) => (
                <li
                  key={interest}
                  className="inline-flex items-center gap-1.5 rounded-full bg-(--color-navy-50) px-3 py-1.5 text-[13px] font-medium text-(--color-navy-800)"
                >
                  <Stethoscope className="size-3.5 text-(--color-accent)" aria-hidden="true" />
                  {interest}
                </li>
              ))}
            </ul>
          </div>

          {memberships?.length ? (
            <p className="mt-4 text-sm text-(--color-ink-subtle)">
              Member of {memberships.join(", ")}
            </p>
          ) : null}

          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/book-appointment">Book a consultation</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href={`/doctors/${doctor.slug}`}>
                Full profile
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
