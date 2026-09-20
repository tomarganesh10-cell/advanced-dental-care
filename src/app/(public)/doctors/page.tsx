import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, GraduationCap, Info, UserRound } from "lucide-react";
import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { BookingCta } from "@/components/marketing/booking-cta";
import { Section } from "@/components/marketing/section";
import { prisma } from "@/lib/db";
import { buildMetadata } from "@/lib/seo";
import { doctors as masterDoctors, specialistTeam } from "@data/clinic-master-data";
import { isPublishable, publicValue } from "@data/verification";

export const metadata: Metadata = buildMetadata({
  title: "Our Dentists in Chandigarh",
  description:
    "Meet the dental team at Advanced Dental Care Centre, Sector 18-A, Chandigarh — implantology, cosmetic dentistry, orthodontics, endodontics and oral surgery.",
  path: "/doctors",
});

export const revalidate = 3600;

export default async function DoctorsPage() {
  // Database doctors are the live source; the master data file provides the
  // principal dentist's profile until the clinic has populated the table.
  const dbDoctors = await prisma.doctor
    .findMany({
      where: { isPubliclyListed: true, deletedAt: null },
      orderBy: [{ displayOrder: "asc" }, { displayName: "asc" }],
      select: {
        id: true,
        slug: true,
        displayName: true,
        qualifications: true,
        specialties: true,
        specialInterests: true,
        bio: true,
        photoUrl: true,
        isVisiting: true,
        registrationCouncil: true,
        registrationNumber: true,
      },
    })
    .catch(() => []);

  return (
    <>
      <Breadcrumbs items={[{ name: "Doctors", path: "/doctors" }]} />

      <div className="container-page pb-10">
        <h1 className="text-3xl md:text-4xl">Our dental team</h1>
        <p className="prose-clinic mt-4">
          Complex dentistry benefits from more than one pair of hands. Implants, orthodontics,
          endodontics and oral surgery are handled by clinicians who do that work regularly, rather
          than by one generalist attempting all of it.
        </p>
      </div>

      <Section tone="muted" className="pt-0">
        <div className="container-page">
          <ul className="grid gap-6 md:grid-cols-2">
            {/* Principal dentist from master data */}
            {masterDoctors.map((doctor) => {
              const qualifications = publicValue(doctor.qualifications);
              const registration = publicValue(doctor.registration);

              return (
                <li
                  key={doctor.slug}
                  className="overflow-hidden rounded-(--radius-card) border border-(--color-hairline) bg-white"
                >
                  <div className="flex aspect-16/10 items-center justify-center bg-gradient-to-br from-(--color-navy-50) to-(--color-sand)">
                    <UserRound className="size-12 text-(--color-navy-300)" aria-hidden="true" />
                  </div>

                  <div className="p-6">
                    <h2 className="text-xl">{doctor.name}</h2>
                    <p className="mt-1 text-sm font-medium text-(--color-ink-muted)">
                      {doctor.designation}
                    </p>

                    {qualifications?.length ? (
                      <p className="mt-2.5 flex items-center gap-2 text-sm text-(--color-ink-subtle)">
                        <GraduationCap
                          className="size-4 shrink-0 text-(--color-accent)"
                          aria-hidden="true"
                        />
                        {qualifications.join(" · ")}
                      </p>
                    ) : null}

                    {registration ? (
                      <p className="mt-1 text-xs text-(--color-ink-subtle)">
                        {registration.council} reg. {registration.number}
                      </p>
                    ) : null}

                    <p className="mt-3 text-sm leading-relaxed text-(--color-ink-muted)">
                      {doctor.bio}
                    </p>

                    <ul className="mt-4 flex flex-wrap gap-1.5">
                      {doctor.specialInterests.map((interest) => (
                        <li
                          key={interest}
                          className="rounded-full bg-(--color-navy-50) px-2.5 py-1 text-xs text-(--color-navy-800)"
                        >
                          {interest}
                        </li>
                      ))}
                    </ul>

                    <Link
                      href={`/doctors/${doctor.slug}`}
                      className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-(--color-action)"
                    >
                      Full profile
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </Link>
                  </div>
                </li>
              );
            })}

            {/* Additional doctors from the database */}
            {dbDoctors
              .filter((d) => !masterDoctors.some((m) => m.slug === d.slug))
              .map((doctor) => (
                <li
                  key={doctor.id}
                  className="overflow-hidden rounded-(--radius-card) border border-(--color-hairline) bg-white"
                >
                  <div className="flex aspect-16/10 items-center justify-center bg-gradient-to-br from-(--color-navy-50) to-(--color-sand)">
                    <UserRound className="size-12 text-(--color-navy-300)" aria-hidden="true" />
                  </div>
                  <div className="p-6">
                    <h2 className="text-xl">
                      {doctor.displayName}
                      {doctor.isVisiting ? (
                        <span className="ml-2 rounded-full bg-(--color-navy-100) px-2 py-0.5 align-middle text-[10px] font-medium tracking-wide text-(--color-navy-700) uppercase">
                          Visiting
                        </span>
                      ) : null}
                    </h2>
                    {doctor.qualifications.length > 0 ? (
                      <p className="mt-2 text-sm text-(--color-ink-subtle)">
                        {doctor.qualifications.join(" · ")}
                      </p>
                    ) : null}
                    {doctor.bio ? (
                      <p className="mt-3 text-sm leading-relaxed text-(--color-ink-muted)">
                        {doctor.bio}
                      </p>
                    ) : null}
                    <Link
                      href={`/doctors/${doctor.slug}`}
                      className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-(--color-action)"
                    >
                      Full profile
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </Link>
                  </div>
                </li>
              ))}
          </ul>

          {/*
            The old site described a multi-specialist team without naming the
            specialists. Rather than inventing profiles, the site says which
            specialties are covered and is explicit that the individuals are
            named once the clinic supplies their registration details.
          */}
          {!isPublishable(specialistTeam) && dbDoctors.length <= masterDoctors.length ? (
            <div className="mt-8 flex items-start gap-3 rounded-(--radius-card) border border-(--color-hairline) bg-white p-6">
              <Info className="mt-0.5 size-5 shrink-0 text-(--color-accent)" aria-hidden="true" />
              <div>
                <h2 className="text-base font-semibold">Specialist clinicians</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-(--color-ink-muted)">
                  The practice covers endodontics, orthodontics, oral &amp; maxillofacial surgery
                  and paediatric dentistry. Individual specialists are listed here with their
                  qualifications and council registration once those details have been verified — we
                  would rather list nobody than list someone incorrectly.
                </p>
                <p className="mt-2 text-sm text-(--color-ink-subtle)">
                  Ask reception which clinician would see you for a specific treatment.
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </Section>

      <Section tone="sunken">
        <BookingCta title="Book with the right clinician" />
      </Section>
    </>
  );
}
