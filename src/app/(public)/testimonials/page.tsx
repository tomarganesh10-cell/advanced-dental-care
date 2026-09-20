import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { BookingCta } from "@/components/marketing/booking-cta";
import { Section } from "@/components/marketing/section";
import { Testimonials } from "@/components/marketing/testimonials";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Patient Reviews & Testimonials",
  description:
    "What patients say about Advanced Dental Care Centre, Sector 18-A, Chandigarh. Live Google rating and testimonials published with consent.",
  path: "/testimonials",
});

export const revalidate = 600;

export default function TestimonialsPage() {
  return (
    <>
      <Breadcrumbs items={[{ name: "Patient stories", path: "/testimonials" }]} />

      <div className="container-page pb-8">
        <h1 className="text-3xl md:text-4xl">Patient stories</h1>
        <div className="prose-clinic mt-4">
          <p>
            The star rating below is fetched from Google, not typed into this page. It reflects
            every review the practice has received, not a selection — we do not filter which
            patients are asked for a public review, and we do not edit what they write.
          </p>
        </div>
      </div>

      <Section className="pt-6">
        <Testimonials limit={24} />
      </Section>

      <Section tone="sunken">
        <BookingCta />
      </Section>
    </>
  );
}
