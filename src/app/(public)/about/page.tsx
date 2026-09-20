import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { BookingCta } from "@/components/marketing/booking-cta";
import { LocationMap } from "@/components/marketing/location-map";
import { Section, SectionHeading } from "@/components/marketing/section";
import { TrustBar } from "@/components/marketing/trust-bar";
import { WhyChoose } from "@/components/marketing/why-choose";
import { buildMetadata } from "@/lib/seo";
import { identity, statistics, yearsSince } from "@data/clinic-master-data";
import { publicValue } from "@data/verification";

export const metadata: Metadata = buildMetadata({
  title: "About Advanced Dental Care Centre, Chandigarh",
  description:
    "A multi-specialist dental practice in Sector 18-A, Chandigarh. How we plan treatment, what we will and will not promise, and what to expect at a first visit.",
  path: "/about",
});

export default function AboutPage() {
  const foundedYear = publicValue(statistics.clinicFoundedYear);

  return (
    <>
      <Breadcrumbs items={[{ name: "About", path: "/about" }]} />

      <div className="container-page pb-10">
        <h1 className="text-3xl md:text-4xl">About the practice</h1>
        <div className="prose-clinic mt-5">
          <p>
            {identity.legalName} is a multi-specialist dental practice in Sector 18-A, Chandigarh
            {foundedYear
              ? `, established in ${foundedYear} — ${yearsSince(foundedYear)} years of practice in the city`
              : ""}
            . We see patients from across Chandigarh, Punjab and Haryana, and from overseas.
          </p>
          <p>
            What we try to do differently is unremarkable in principle and rarer than it should be
            in practice: examine first, explain the findings in language that makes sense, set out
            the options including the cheaper one and the do-nothing one, and put the plan in
            writing before treatment starts.
          </p>
          <p>
            We are also careful about what we claim. You will not find promises of
            &ldquo;permanent&rdquo; results, guaranteed outcomes, or claims to be the best clinic in
            the city on this website. Dentistry does not work that way, and a practice that tells
            you it does is telling you something about itself.
          </p>
        </div>
      </div>

      <TrustBar />

      <Section tone="muted">
        <div className="container-page">
          <SectionHeading
            align="left"
            eyebrow="What to expect"
            title="Your first visit"
            description="About 30–45 minutes, and no treatment on the day unless you are in pain and want it dealt with."
          />

          <ol className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {[
              {
                title: "History",
                body: "What brought you in, your medical history, medications, and anything you are anxious about.",
              },
              {
                title: "Examination",
                body: "Teeth, gums, bite and soft tissues, with X-rays only where they will change the plan.",
              },
              {
                title: "Findings",
                body: "What we found, shown to you on the images where possible, in plain language.",
              },
              {
                title: "Options and costs",
                body: "The treatment options, what each involves, what each costs, and what happens if you wait.",
              },
            ].map((step, index) => (
              <li
                key={step.title}
                className="rounded-(--radius-card) border border-(--color-hairline) bg-white p-6"
              >
                <span className="flex size-8 items-center justify-center rounded-full bg-(--color-action) text-xs font-semibold text-white">
                  {index + 1}
                </span>
                <h3 className="mt-3.5 text-base font-semibold">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-(--color-ink-muted)">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </Section>

      <Section tone="sunken">
        <div className="container-page">
          <SectionHeading eyebrow="How we work" title="Our commitments" />
        </div>
        <div className="mt-12">
          <WhyChoose />
        </div>
      </Section>

      <Section>
        <LocationMap />
      </Section>

      <Section tone="muted">
        <BookingCta />
      </Section>
    </>
  );
}
