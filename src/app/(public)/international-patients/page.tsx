import type { Metadata } from "next";
import { AlertTriangle, FileText, Globe2 } from "lucide-react";
import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { FaqAccordion } from "@/components/marketing/faq-accordion";
import { InternationalForm } from "@/components/marketing/international-form";
import { LocationMap } from "@/components/marketing/location-map";
import { Section, SectionHeading } from "@/components/marketing/section";
import { JsonLd } from "@/components/seo/json-ld";
import { buildMetadata, faqSchema } from "@/lib/seo";
import { contact } from "@data/clinic-master-data";

export const metadata: Metadata = buildMetadata({
  title: "International Patients & Dental Tourism in Chandigarh",
  description:
    "Planning dental treatment in Chandigarh from abroad. Remote assessment, provisional treatment plan, and treatment sequenced around your travel dates.",
  path: "/international-patients",
});

const RECORDS_NEEDED = [
  "Recent dental X-rays — a panoramic (OPG) is the most useful single image",
  "A CBCT scan if you have had one, especially for implant cases",
  "Photographs of the teeth that concern you, taken in daylight",
  "A list of your medical conditions and current medications",
  "Any treatment plan or estimate you have been given elsewhere",
];

const FAQS = [
  {
    question: "Can you tell me the cost before I travel?",
    answer:
      "We can give you a provisional estimate from your records, and we will tell you what it is based on. It is not a fixed quotation — an in-person examination sometimes finds things an X-ray does not show, and we would rather revise a number than start treatment that turns out to be the wrong plan.",
  },
  {
    question: "How many visits will I need, and how long should I stay?",
    answer:
      "It depends entirely on the treatment. Some cosmetic work can be done in a week; implants need months between placement and the final crown, usually meaning two trips. We tell you the realistic sequence before you book flights, not after you arrive.",
  },
  {
    question: "Can everything be done in one trip?",
    answer:
      "Sometimes, and sometimes not. Where healing time is biologically required — as with implants — compressing it is not something any clinic can safely offer. If a clinic tells you an implant can be placed and finally restored in a week, ask them what happens to the integration period.",
  },
  {
    question: "What happens if there is a problem after I go home?",
    answer:
      "You get a written summary of exactly what was done, including the implant system and components used, so any dentist anywhere can work on it. We will review photographs remotely, and we will tell you honestly when something needs to be seen in person rather than managed over a video call.",
  },
  {
    question: "Do you help with travel, visas or accommodation?",
    answer:
      "We help with the dental side — the plan, the sequencing and the appointment dates. We can point you towards hotels near the clinic, but we are a dental practice, not a travel agency, and we do not want to imply otherwise.",
  },
  {
    question: "Which languages are spoken at the clinic?",
    answer:
      "English, Hindi and Punjabi. If you would be more comfortable in another language, tell us in your enquiry and we will let you know whether we can arrange it.",
  },
];

export default function InternationalPatientsPage() {
  return (
    <>
      <Breadcrumbs items={[{ name: "International patients", path: "/international-patients" }]} />

      <div className="container-page pb-10">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-[--color-teal-50] px-3 py-1 text-xs font-semibold text-[--color-teal-800]">
          <Globe2 className="size-3.5" aria-hidden="true" />
          Dental tourism
        </p>
        <h1 className="mt-4 text-3xl md:text-4xl">Dental treatment in Chandigarh, planned from home</h1>
        <div className="prose-clinic mt-5">
          <p>
            Travelling for dental treatment works when the planning happens before the
            flight. Send us your records, we assess them, and you arrive knowing what is
            proposed, roughly what it costs and how many visits it takes.
          </p>
          <p>
            We will also tell you when travelling is not the right answer. Some treatment is
            better done close to home, particularly where it needs long-term follow-up, and
            saying so is more useful to you than a booking.
          </p>
        </div>
      </div>

      <Section tone="muted">
        <div className="container-page grid gap-10 lg:grid-cols-2 lg:gap-14">
          <div>
            <SectionHeading align="left" eyebrow="Step one" title="What to send us" />
            <ul className="mt-6 space-y-3">
              {RECORDS_NEEDED.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm leading-relaxed text-[--color-ink-muted]">
                  <FileText className="mt-0.5 size-4 shrink-0 text-[--color-accent]" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>

            <p className="mt-5 text-sm text-[--color-ink-subtle]">
              Send them by email to{" "}
              <a href={`mailto:${contact.email.primary}`} className="font-medium text-[--color-action]">
                {contact.email.primary}
              </a>{" "}
              or on{" "}
              <a
                href={`https://wa.me/${contact.phone.whatsapp}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-[#128C7E]"
              >
                WhatsApp
              </a>
              , quoting the reference from your enquiry.
            </p>

            <div className="mt-6 flex items-start gap-3 rounded-[--radius-card] border border-amber-200 bg-amber-50 p-5">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden="true" />
              <p className="text-sm leading-relaxed text-amber-900">
                A remote assessment is a starting point, not a diagnosis. Nothing we say
                before examining you is final, and we will not ask you to pay for treatment
                before you have been seen.
              </p>
            </div>
          </div>

          <div className="rounded-[--radius-card] border border-[--color-hairline] bg-white p-6 md:p-8">
            <h2 className="text-xl">Request a consultation</h2>
            <p className="mt-1.5 text-sm text-[--color-ink-subtle]">
              We will reply with the records we need and offer a video call in your timezone.
            </p>
            <div className="mt-6">
              <InternationalForm />
            </div>
          </div>
        </div>
      </Section>

      <Section>
        <div className="container-page max-w-3xl">
          <SectionHeading align="left" eyebrow="Questions" title="Before you book a flight" />
          <div className="mt-8">
            <FaqAccordion faqs={FAQS} />
          </div>
        </div>
      </Section>

      <Section tone="sunken">
        <LocationMap />
      </Section>

      <JsonLd data={faqSchema(FAQS)} />
    </>
  );
}
