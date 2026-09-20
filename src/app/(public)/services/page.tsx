import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { BookingCta } from "@/components/marketing/booking-cta";
import { Section } from "@/components/marketing/section";
import { ServiceGrid } from "@/components/marketing/service-grid";
import { Icon } from "@/components/ui/icon";
import { buildMetadata } from "@/lib/seo";
import { SERVICE_CATEGORIES, getServicesByCategory } from "@data/services";

export const metadata: Metadata = buildMetadata({
  title: "Dental Treatments in Chandigarh",
  description:
    "Dental implants, cosmetic dentistry, braces and aligners, root canal treatment, oral surgery and children's dentistry at Advanced Dental Care Centre, Sector 18-A, Chandigarh.",
  path: "/services",
});

export default function ServicesPage() {
  return (
    <>
      <Breadcrumbs items={[{ name: "Treatments", path: "/services" }]} />

      <div className="container-page pb-4">
        <h1 className="text-3xl md:text-4xl">Dental treatments</h1>
        <p className="prose-clinic mt-4">
          Every treatment listed here starts with an examination and a conversation about what you
          actually want to change. Where a simpler or cheaper option would achieve the same thing,
          we will tell you.
        </p>
      </div>

      {SERVICE_CATEGORIES.map((category, index) => {
        const services = getServicesByCategory(category.slug);
        if (services.length === 0) return null;

        return (
          <Section
            key={category.slug}
            tone={index % 2 === 0 ? "muted" : "default"}
            id={category.slug}
          >
            <div className="container-page">
              <div className="flex items-start gap-4">
                <span
                  className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[--color-teal-50] text-[--color-accent]"
                  aria-hidden="true"
                >
                  <Icon name={category.icon} className="size-5" />
                </span>
                <div>
                  <h2 className="text-2xl">{category.name}</h2>
                  <p className="mt-1.5 text-[--color-ink-muted]">{category.description}</p>
                </div>
              </div>

              <ServiceGrid services={services} className="mt-8" />
            </div>
          </Section>
        );
      })}

      <Section tone="sunken">
        <BookingCta
          title="Not sure which treatment you need?"
          description="Book a consultation and we will examine, explain the options, and put the plan in writing before anything starts."
        />
      </Section>
    </>
  );
}
