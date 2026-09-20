import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CalendarPlus, CheckCircle2, MapPin, Phone } from "lucide-react";
import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { BookingCta } from "@/components/marketing/booking-cta";
import { FaqAccordion } from "@/components/marketing/faq-accordion";
import { GoogleRating } from "@/components/marketing/google-rating";
import { LocationMap } from "@/components/marketing/location-map";
import { Section, SectionHeading } from "@/components/marketing/section";
import { Button } from "@/components/ui/button";
import { JsonLd } from "@/components/seo/json-ld";
import { buildMetadata, faqSchema, serviceSchema } from "@/lib/seo";
import { contact, disclaimers } from "@data/clinic-master-data";
import { SERVICES, getServiceByLandingSlug } from "@data/services";

/**
 * Location-targeted landing pages, e.g. /dental-implants-chandigarh.
 *
 * These are NOT duplicates of /services/[slug]. A near-identical page at two
 * URLs competes with itself and gets one of them filtered. The treatment page
 * explains the treatment; the landing page answers a local search — where the
 * clinic is, who provides it, what a first visit costs in time, and how to get
 * there. The canonical tag points each at itself, and the two cross-link.
 *
 * Kept in the data file (`seo.landingSlug`) rather than hand-built so a new
 * landing page is one line of content, not a new route.
 */

const LANDING_SLUGS = SERVICES.filter((s) => s.seo.landingSlug).map((s) => s.seo.landingSlug!);

export function generateStaticParams() {
  return LANDING_SLUGS.map((landingSlug) => ({ landingSlug }));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ landingSlug: string }>;
}): Promise<Metadata> {
  const { landingSlug } = await params;
  const service = getServiceByLandingSlug(landingSlug);
  if (!service) return {};

  return buildMetadata({
    title: service.seo.title,
    description: service.seo.description,
    path: `/${landingSlug}`,
    keywords: [
      `${service.name.toLowerCase()} chandigarh`,
      `${service.name.toLowerCase()} sector 18 chandigarh`,
      "dentist chandigarh",
    ],
  });
}

export default async function LandingPage({
  params,
}: {
  params: Promise<{ landingSlug: string }>;
}) {
  const { landingSlug } = await params;
  const service = getServiceByLandingSlug(landingSlug);
  if (!service) notFound();

  return (
    <>
      <Breadcrumbs items={[{ name: service.name, path: `/${landingSlug}` }]} />

      <div className="container-page pb-12">
        <div className="max-w-3xl">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-(--color-teal-50) px-3 py-1 text-xs font-semibold text-(--color-teal-800)">
            <MapPin className="size-3.5" aria-hidden="true" />
            Sector 18-A, Chandigarh
          </p>

          <h1 className="mt-4 text-3xl md:text-4xl lg:text-[2.75rem]">
            {service.name} in Chandigarh
          </h1>

          <p className="mt-4 text-lg leading-relaxed text-(--color-ink-muted)">{service.summary}</p>

          <GoogleRating className="mt-5" showLink />

          <div className="mt-7 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href={`/book-appointment?treatment=${service.slug}`}>
                <CalendarPlus aria-hidden="true" />
                Book a consultation
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <a href={`tel:${contact.phone.e164}`}>
                <Phone aria-hidden="true" />
                {contact.phone.display}
              </a>
            </Button>
          </div>
        </div>
      </div>

      <Section tone="muted">
        <div className="container-page grid gap-10 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-16">
          <div className="prose-clinic">
            {service.body.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}

            <p>
              <Link
                href={`/services/${service.slug}`}
                className="font-semibold text-(--color-action) underline underline-offset-4"
              >
                Read the full {service.name.toLowerCase()} treatment guide →
              </Link>
            </p>
          </div>

          <aside className="space-y-5">
            <div className="rounded-(--radius-card) border border-(--color-hairline) bg-white p-5">
              <h2 className="text-sm font-semibold">Who this suits</h2>
              <ul className="mt-3 space-y-2">
                {service.indications.map((indication) => (
                  <li
                    key={indication}
                    className="flex items-start gap-2 text-sm text-(--color-ink-muted)"
                  >
                    <CheckCircle2
                      className="mt-0.5 size-4 shrink-0 text-(--color-accent)"
                      aria-hidden="true"
                    />
                    {indication}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-(--radius-card) border border-(--color-hairline) bg-white p-5">
              <h2 className="text-sm font-semibold">Finding the clinic</h2>
              <p className="mt-2 text-sm leading-relaxed text-(--color-ink-muted)">
                {contact.address.formatted}. Sector 18-A is in central Chandigarh, a short drive
                from Sector 17 and the ISBT.
              </p>
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(contact.address.formatted)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-block text-sm font-semibold text-(--color-action) underline underline-offset-4"
              >
                Get directions
              </a>
            </div>
          </aside>
        </div>
      </Section>

      {service.faqs.length > 0 ? (
        <Section>
          <div className="container-page max-w-3xl">
            <SectionHeading align="left" title={`${service.name}: common questions`} />
            <div className="mt-8">
              <FaqAccordion faqs={service.faqs} />
            </div>
          </div>
        </Section>
      ) : null}

      <Section tone="sunken">
        <LocationMap />
      </Section>

      <Section tone="muted">
        <BookingCta
          title={`Book a ${service.name.toLowerCase()} consultation`}
          description="Choose a time online, or call the clinic and reception will find one with you."
        />
        <p className="container-page mt-8 max-w-3xl text-center text-xs leading-relaxed text-(--color-ink-subtle)">
          {disclaimers.medical}
        </p>
      </Section>

      <JsonLd
        data={[
          serviceSchema({
            name: `${service.name} in Chandigarh`,
            description: service.seo.description,
            path: `/${landingSlug}`,
          }),
          ...(service.faqs.length > 0 ? [faqSchema(service.faqs)] : []),
        ]}
      />
    </>
  );
}
