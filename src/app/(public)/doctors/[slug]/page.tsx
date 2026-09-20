import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Award, CalendarPlus, GraduationCap, Stethoscope, UserRound } from "lucide-react";
import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { BookingCta } from "@/components/marketing/booking-cta";
import { Section } from "@/components/marketing/section";
import { Button } from "@/components/ui/button";
import { JsonLd } from "@/components/seo/json-ld";
import { prisma } from "@/lib/db";
import { buildMetadata, physicianSchema } from "@/lib/seo";
import { doctors as masterDoctors } from "@data/clinic-master-data";
import { publicValue } from "@data/verification";

export const revalidate = 3600;

interface ProfileData {
  slug: string;
  name: string;
  designation: string;
  qualifications: string[];
  registration: { council: string; number: string } | null;
  specialInterests: string[];
  memberships: string[];
  practisingSinceYear: number | null;
  bio: string;
  isVisiting: boolean;
}

async function loadProfile(slug: string): Promise<ProfileData | null> {
  const master = masterDoctors.find((d) => d.slug === slug);

  if (master) {
    return {
      slug: master.slug,
      name: master.name,
      designation: master.designation,
      qualifications: publicValue(master.qualifications) ?? [],
      registration: publicValue(master.registration) ?? null,
      specialInterests: master.specialInterests,
      memberships: publicValue(master.memberships) ?? [],
      practisingSinceYear: publicValue(master.practisingSinceYear) ?? null,
      bio: master.bio,
      isVisiting: publicValue(master.availability) === "VISITING",
    };
  }

  const record = await prisma.doctor
    .findFirst({
      where: { slug, isPubliclyListed: true, deletedAt: null },
      select: {
        slug: true,
        displayName: true,
        qualifications: true,
        registrationCouncil: true,
        registrationNumber: true,
        specialties: true,
        specialInterests: true,
        bio: true,
        practisingSinceYear: true,
        isVisiting: true,
      },
    })
    .catch(() => null);

  if (!record) return null;

  return {
    slug: record.slug,
    name: record.displayName,
    designation: record.specialties.join(", ") || "Dental Surgeon",
    qualifications: record.qualifications,
    registration:
      record.registrationCouncil && record.registrationNumber
        ? { council: record.registrationCouncil, number: record.registrationNumber }
        : null,
    specialInterests: record.specialInterests,
    memberships: [],
    practisingSinceYear: record.practisingSinceYear,
    bio: record.bio ?? "",
    isVisiting: record.isVisiting,
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const profile = await loadProfile(slug);
  if (!profile) return {};

  return buildMetadata({
    title: `${profile.name} — ${profile.designation}`,
    description: `${profile.name}, ${profile.designation} at Advanced Dental Care Centre, Sector 18-A, Chandigarh. Book a consultation.`,
    path: `/doctors/${profile.slug}`,
  });
}

export default async function DoctorProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const profile = await loadProfile(slug);
  if (!profile) notFound();

  return (
    <>
      <Breadcrumbs
        items={[
          { name: "Doctors", path: "/doctors" },
          { name: profile.name, path: `/doctors/${profile.slug}` },
        ]}
      />

      <div className="container-page grid gap-10 pb-12 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] lg:gap-14">
        <div className="aspect-4/5 overflow-hidden rounded-(--radius-card) border border-(--color-hairline) bg-gradient-to-b from-(--color-navy-50) to-(--color-sand)">
          <div className="flex h-full items-center justify-center">
            <UserRound className="size-16 text-(--color-navy-300)" aria-hidden="true" />
          </div>
        </div>

        <div>
          <h1 className="text-3xl md:text-4xl">{profile.name}</h1>
          <p className="mt-2 text-lg text-(--color-ink-muted)">{profile.designation}</p>

          {profile.isVisiting ? (
            <p className="mt-2 inline-block rounded-full bg-(--color-navy-100) px-3 py-1 text-xs font-medium text-(--color-navy-800)">
              Visiting consultant — availability varies
            </p>
          ) : null}

          <dl className="mt-6 space-y-4">
            {profile.qualifications.length > 0 ? (
              <ProfileRow icon={<GraduationCap className="size-4" />} label="Qualifications">
                {profile.qualifications.join(" · ")}
              </ProfileRow>
            ) : null}

            {profile.registration ? (
              <ProfileRow icon={<Award className="size-4" />} label="Registration">
                {profile.registration.council} — {profile.registration.number}
              </ProfileRow>
            ) : null}

            {profile.practisingSinceYear ? (
              <ProfileRow icon={<Stethoscope className="size-4" />} label="In practice since">
                {profile.practisingSinceYear}
              </ProfileRow>
            ) : null}

            {profile.memberships.length > 0 ? (
              <ProfileRow icon={<Award className="size-4" />} label="Memberships">
                {profile.memberships.join(", ")}
              </ProfileRow>
            ) : null}
          </dl>

          {profile.bio ? (
            <div className="prose-clinic mt-6">
              <p>{profile.bio}</p>
            </div>
          ) : null}

          {profile.specialInterests.length > 0 ? (
            <div className="mt-6">
              <h2 className="text-sm font-semibold tracking-wide text-(--color-ink-subtle) uppercase">
                Areas of practice
              </h2>
              <ul className="mt-2.5 flex flex-wrap gap-2">
                {profile.specialInterests.map((interest) => (
                  <li
                    key={interest}
                    className="rounded-full bg-(--color-navy-50) px-3 py-1.5 text-sm text-(--color-navy-800)"
                  >
                    {interest}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/book-appointment">
                <CalendarPlus aria-hidden="true" />
                Book a consultation
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/doctors">All dentists</Link>
            </Button>
          </div>

          {/*
            Shown when we have no verified credentials to display. Silence would
            read as "this dentist has no qualifications", which is worse than
            saying plainly that we publish them once verified.
          */}
          {profile.qualifications.length === 0 ? (
            <p className="mt-6 rounded-lg border border-(--color-hairline) bg-(--color-surface-sunken) p-4 text-xs leading-relaxed text-(--color-ink-subtle)">
              Qualifications and council registration are published here once verified against the
              original documents. Ask reception if you would like to see them before your
              appointment — you are entitled to.
            </p>
          ) : null}
        </div>
      </div>

      <Section tone="sunken">
        <BookingCta />
      </Section>

      <JsonLd
        data={physicianSchema({
          name: profile.name,
          slug: profile.slug,
          qualifications: profile.qualifications.length > 0 ? profile.qualifications : undefined,
          specialties: profile.specialInterests,
          description: profile.bio || profile.designation,
        })}
      />
    </>
  );
}

function ProfileRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-(--color-accent)" aria-hidden="true">
        {icon}
      </span>
      <div>
        <dt className="text-xs font-semibold tracking-wide text-(--color-ink-subtle) uppercase">
          {label}
        </dt>
        <dd className="mt-0.5 text-sm text-(--color-ink)">{children}</dd>
      </div>
    </div>
  );
}
