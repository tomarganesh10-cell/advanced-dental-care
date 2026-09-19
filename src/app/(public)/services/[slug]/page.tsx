import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowRight, CalendarPlus, CheckCircle2, Clock, Phone } from "lucide-react";
import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { BookingCta } from "@/components/marketing/booking-cta";
import { FaqAccordion } from "@/components/marketing/faq-accordion";
import { Section, SectionHeading } from "@/components/marketing/section";
import { ServiceGrid } from "@/components/marketing/service-grid";
import { Button } from "@/components/ui/button";
import { JsonLd } from "@/components/seo/json-ld";
import { buildMetadata, faqSchema, serviceSchema } from "@/lib/seo";
import { contact, disclaimers } from "@data/clinic-master-data";
import { SERVICES, getCategory, getService, getServicesByCategory } from "@data/services";

export function generateStaticParams() {
  return SERVICES.map((service) => ({ slug: service.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const service = getService(slug);
  if (!service) return {};

  return buildMetadata({
    title: service.seo.title,
    description: service.seo.description,
    path: `/services/${service.slug}`,
  });
}

export default async function ServicePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const service = getService(slug);
  if (!service) notFound();

  const category = getCategory(service.category);
  const related = getServicesByCategory(service.category).filter((s) => s.slug !== service.slug);

  return (
    <>
      <Breadcrumbs
        items={[
          { name: "Treatments", path: "/services" },
          { name: service.name, path: `/services/${service.slug}` },
        ]}
      />

      {/* Intro */}
      <div className="container-page grid gap-10 pb-12 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-16">
        <div>
          {category ? (
            <p className="mb-2.5 text-xs font-semibold tracking-[0.16em] text-[--color-accent] uppercase">
              {category.name}
            </p>
          ) : null}

          <h1 className="text-3xl md:text-4xl lg:text-[2.75rem]">{service.name}</h1>
          <p className="mt-4 text-lg leading-relaxed text-[--color-ink-muted]">{service.summary}</p>

          <div className="prose-clinic mt-6">
            {service.body.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
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

        {/* Side panel */}
        <aside className="space-y-5 lg:pt-12">
          {service.typicalVisits ? (
            <div className="rounded-[--radius-card] border border-[--color-hairline] bg-white p-5">
              <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-[--color-ink-subtle] uppercase">
                <Clock className="size-3.5" aria-hidden="true" />
                Typical course of treatment
              </p>
              <p className="mt-2 text-base font-medium text-[--color-primary]">
                {service.typicalVisits}
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-[--color-ink-subtle]">
                An estimate only. Your own plan depends on what the examination finds.
              </p>
            </div>
          ) : null}

          <div className="rounded-[--radius-card] border border-[--color-hairline] bg-[--color-surface-sunken] p-5">
            <h2 className="text-sm font-semibold text-[--color-primary]">
              This may be right for you if
            </h2>
            <ul className="mt-3 space-y-2">
              {service.indications.map((indication) => (
                <li key={indication} className="flex items-start gap-2 text-sm text-[--color-ink-muted]">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[--color-accent]" aria-hidden="true" />
                  {indication}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      {/* Process */}
      <Section tone="muted">
        <div className="container-page">
          <SectionHeading
            align="left"
            eyebrow="What happens"
            title="The treatment step by step"
            description="So you know what each visit involves before you commit to the first one."
          />

          <ol className="mt-10 space-y-6 border-l-2 border-[--color-navy-100] pl-6 md:pl-8">
            {service.steps.map((step, index) => (
              <li key={step.title} className="relative">
                <span
                  className="absolute -left-[2.1rem] flex size-7 items-center justify-center rounded-full bg-[--color-action] text-xs font-semibold text-white md:-left-[2.6rem]"
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <h3 className="text-base font-semibold">{step.title}</h3>
                <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-[--color-ink-muted]">
                  {step.description}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </Section>

      {/* FAQs */}
      {service.faqs.length > 0 ? (
        <Section>
          <div className="container-page max-w-3xl">
            <SectionHeading align="left" eyebrow="Questions" title="Common questions" />
            <div className="mt-8">
              <FaqAccordion faqs={service.faqs} />
            </div>
          </div>
        </Section>
      ) : null}

      {/* Related */}
      {related.length > 0 ? (
        <Section tone="sunken">
          <div className="container-page">
            <SectionHeading align="left" title={`More in ${category?.name ?? "this area"}`} />
            <ServiceGrid services={related} className="mt-8" />
            <div className="mt-6">
              <Link
                href="/services"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-[--color-action]"
              >
                All treatments
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </Section>
      ) : null}

      <Section tone="muted">
        <BookingCta />
        <p className="container-page mt-8 max-w-3xl text-center text-xs leading-relaxed text-[--color-ink-subtle]">
          {disclaimers.medical}
        </p>
      </Section>

      <JsonLd
        data={[
          serviceSchema({
            name: service.name,
            description: service.seo.description,
            path: `/services/${service.slug}`,
          }),
          ...(service.faqs.length > 0 ? [faqSchema(service.faqs)] : []),
        ]}
      />
    </>
  );
}
