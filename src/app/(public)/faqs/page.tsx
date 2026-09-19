import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { BookingCta } from "@/components/marketing/booking-cta";
import { FaqAccordion } from "@/components/marketing/faq-accordion";
import { Section, SectionHeading } from "@/components/marketing/section";
import { JsonLd } from "@/components/seo/json-ld";
import { buildMetadata, faqSchema } from "@/lib/seo";
import { contact } from "@data/clinic-master-data";

export const metadata: Metadata = buildMetadata({
  title: "Frequently Asked Questions",
  description:
    "Common questions about appointments, costs, payment, records and treatment at Advanced Dental Care Centre, Sector 18-A, Chandigarh.",
  path: "/faqs",
});

const GROUPS = [
  {
    title: "Appointments",
    faqs: [
      {
        question: "How do I book an appointment?",
        answer: `Book online through this website, call ${contact.phone.display}, or message us on WhatsApp. Online bookings need at least two hours' notice; for anything sooner, call — we hold time free for urgent problems.`,
      },
      {
        question: "Do I need to pay to book?",
        answer:
          "No. Booking is free and you pay after your consultation at the clinic. If we ever introduce a booking fee for a specific appointment type, it will be shown before you confirm, never after.",
      },
      {
        question: "What if I need to cancel?",
        answer:
          "Call or message as early as you can. Appointment time is the one thing a clinic cannot make more of — a slot you release is usually a slot someone in pain can use.",
      },
      {
        question: "Can I choose which dentist I see?",
        answer:
          "Yes, where their diary allows. The booking form lets you pick a clinician or take the first available appointment.",
      },
    ],
  },
  {
    title: "Costs and payment",
    faqs: [
      {
        question: "How much will my treatment cost?",
        answer:
          "You get a written estimate after the examination, before treatment starts. We cannot quote accurately for dentistry without looking in your mouth, and any clinic that does is guessing.",
      },
      {
        question: "Do you take card and UPI?",
        answer:
          "Yes — cash, card, UPI and bank transfer. Larger treatment plans can usually be paid in stages as treatment progresses.",
      },
      {
        question: "Will my insurance cover this?",
        answer:
          "Dental cover in India varies a lot between policies and most routine dentistry is not covered. We will give you an itemised invoice you can submit, but we cannot tell you what your insurer will pay.",
      },
    ],
  },
  {
    title: "Your records",
    faqs: [
      {
        question: "Can I see my own records?",
        answer:
          "Yes. Your appointments, treatment plan, prescriptions, uploaded X-rays and invoices are in your patient portal. You can also ask reception for a copy of your records, which you are entitled to.",
      },
      {
        question: "Who can see my dental records?",
        answer:
          "The clinicians involved in your care, and the front-office staff who need your contact and appointment details to run the clinic. Reception cannot open your clinical notes, and our marketing function has no access to patient records at all.",
      },
      {
        question: "Will you use my photographs on the website?",
        answer:
          "Only if you give specific written consent for that, separately from consent to treatment. You can withdraw it at any time and the images come down.",
      },
    ],
  },
  {
    title: "Treatment",
    faqs: [
      {
        question: "Will it hurt?",
        answer:
          "Treatment is done under local anaesthetic, so you should not feel pain during it. Afterwards varies by procedure — we will tell you what to expect and what to take. If you are anxious about dental treatment, say so when you book; it changes how we plan the appointment.",
      },
      {
        question: "Do you guarantee the results?",
        answer:
          "No, and neither can anyone else honestly. Dental work has expected lifespans, not guarantees, and the outcome depends on your bite, your oral hygiene, smoking and general health. We will tell you what usually happens and what makes your case different.",
      },
      {
        question: "Do I really need this treatment?",
        answer:
          "Ask us. For anything other than an emergency, doing nothing for now is a legitimate option and we will explain what happens if you choose it. If you want a second opinion, we will give you your records to take.",
      },
    ],
  },
];

export default function FaqsPage() {
  const allFaqs = GROUPS.flatMap((group) => group.faqs);

  return (
    <>
      <Breadcrumbs items={[{ name: "FAQs", path: "/faqs" }]} />

      <div className="container-page pb-6">
        <h1 className="text-3xl md:text-4xl">Frequently asked questions</h1>
        <p className="prose-clinic mt-4">
          If your question is not here, call the clinic. Reception can answer most practical
          questions straight away and will pass clinical ones to a dentist.
        </p>
      </div>

      {GROUPS.map((group, index) => (
        <Section key={group.title} tone={index % 2 === 0 ? "muted" : "default"}>
          <div className="container-page max-w-3xl">
            <SectionHeading align="left" title={group.title} />
            <div className="mt-6">
              <FaqAccordion faqs={group.faqs} />
            </div>
          </div>
        </Section>
      ))}

      <Section tone="sunken">
        <BookingCta />
      </Section>

      <JsonLd data={faqSchema(allFaqs)} />
    </>
  );
}
