import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BookingCta } from "@/components/marketing/booking-cta";
import { DoctorIntro } from "@/components/marketing/doctor-intro";
import { EmergencyBanner } from "@/components/marketing/emergency-banner";
import { GalleryPreview } from "@/components/marketing/gallery-preview";
import { Hero } from "@/components/marketing/hero";
import { InternationalCta } from "@/components/marketing/international-cta";
import { LocationMap } from "@/components/marketing/location-map";
import { Section, SectionHeading } from "@/components/marketing/section";
import { ServiceGrid } from "@/components/marketing/service-grid";
import { TechnologyGrid } from "@/components/marketing/technology-grid";
import { Testimonials } from "@/components/marketing/testimonials";
import { TrustBar } from "@/components/marketing/trust-bar";
import { WhyChoose } from "@/components/marketing/why-choose";
import { buildMetadata } from "@/lib/seo";
import { FEATURED_SERVICES } from "@data/services";

export const metadata: Metadata = buildMetadata({
  title: "Dental Implants & Cosmetic Dentistry in Chandigarh",
  description:
    "Advanced Dental Care Centre, Sector 18-A, Chandigarh. Dental implants, smile design, orthodontics, root canal treatment and oral surgery. Book a consultation online.",
  path: "/",
  keywords: [
    "dentist chandigarh",
    "dental implants chandigarh",
    "cosmetic dentist chandigarh",
    "dental clinic sector 18 chandigarh",
  ],
});

export default function HomePage() {
  return (
    <>
      <Hero />
      <TrustBar />

      <Section tone="muted">
        <div className="container-page">
          <SectionHeading
            eyebrow="Treatments"
            title="Find the right treatment"
            description="Every treatment here starts with an examination. If a simpler option will do the job, we will say so."
          />
          <ServiceGrid services={FEATURED_SERVICES} className="mt-10" />
          <div className="mt-8 text-center">
            <Button asChild variant="outline" size="lg">
              <Link href="/services">
                See all treatments
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>
      </Section>

      <Section>
        <DoctorIntro />
      </Section>

      <Section tone="sunken">
        <div className="container-page">
          <SectionHeading
            eyebrow="Why patients choose us"
            title="How this practice works"
            description="Commitments you can hold us to, rather than claims you cannot check."
          />
        </div>
        <div className="mt-12">
          <WhyChoose />
        </div>
      </Section>

      <Section tone="muted">
        <div className="container-page">
          <SectionHeading
            eyebrow="Technology"
            title="Diagnosis before treatment"
            description="Equipment matters when it changes the plan — not as a list of names."
          />
        </div>
        <div className="mt-10">
          <TechnologyGrid showPendingNotice />
        </div>
      </Section>

      <Section>
        <div className="container-page">
          <SectionHeading
            eyebrow="Smile gallery"
            title="Treatment results"
            description="Cases published with the patient's written consent."
          />
        </div>
        <div className="mt-10">
          <GalleryPreview />
        </div>
      </Section>

      <Section tone="sunken">
        <div className="container-page">
          <SectionHeading
            eyebrow="Patient reviews"
            title="What patients say"
            description="Ratings come straight from Google. We do not select, edit or solicit selectively."
          />
        </div>
        <div className="mt-10">
          <Testimonials limit={6} />
        </div>
      </Section>

      <Section tone="dark">
        <InternationalCta />
      </Section>

      <Section tone="muted">
        <EmergencyBanner />
      </Section>

      <Section>
        <LocationMap />
      </Section>

      <Section tone="muted" className="pb-20">
        <BookingCta />
      </Section>
    </>
  );
}
