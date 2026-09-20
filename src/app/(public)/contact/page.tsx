import type { Metadata } from "next";
import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { ContactForm } from "@/components/marketing/contact-form";
import { LocationMap } from "@/components/marketing/location-map";
import { OpeningHoursList } from "@/components/marketing/opening-hours";
import { Section } from "@/components/marketing/section";
import { buildMetadata } from "@/lib/seo";
import { contact, openingHours } from "@data/clinic-master-data";

export const metadata: Metadata = buildMetadata({
  title: "Contact Advanced Dental Care Centre, Chandigarh",
  description:
    "Call, WhatsApp, email or visit Advanced Dental Care Centre at #20, First Floor, Sector 18-A, Chandigarh – 160018. Clinic hours and directions.",
  path: "/contact",
});

export default function ContactPage() {
  return (
    <>
      <Breadcrumbs items={[{ name: "Contact", path: "/contact" }]} />

      <div className="container-page pb-10">
        <h1 className="text-3xl md:text-4xl">How can we help?</h1>
        <p className="prose-clinic mt-4">
          Tell us what you need and the right person will get back to you. If you are in pain today,
          calling will always be faster than this form.
        </p>
      </div>

      <Section className="pt-0">
        <div className="container-page grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:gap-14">
          <div className="rounded-[--radius-card] border border-[--color-hairline] bg-white p-6 md:p-8">
            <ContactForm />
          </div>

          <aside className="space-y-4">
            <ContactCard
              icon={<Phone className="size-4" />}
              title="Call the clinic"
              action={
                <a
                  href={`tel:${contact.phone.e164}`}
                  className="text-base font-semibold text-[--color-action]"
                >
                  {contact.phone.display}
                </a>
              }
              note="Fastest for urgent problems and same-day appointments."
            />

            <ContactCard
              icon={<MessageCircle className="size-4" />}
              title="WhatsApp"
              action={
                <a
                  href={`https://wa.me/${contact.phone.whatsapp}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-base font-semibold text-[#128C7E]"
                >
                  Message us
                </a>
              }
              note="Good for sending photos of a problem tooth, or reports if you are abroad."
            />

            <ContactCard
              icon={<Mail className="size-4" />}
              title="Email"
              action={
                <a
                  href={`mailto:${contact.email.primary}`}
                  className="text-sm font-semibold break-all text-[--color-action]"
                >
                  {contact.email.primary}
                </a>
              }
            />

            <ContactCard
              icon={<MapPin className="size-4" />}
              title="Visit"
              action={
                <address className="text-sm leading-relaxed text-[--color-ink-muted] not-italic">
                  {contact.address.line1}
                  <br />
                  {contact.address.line2}
                  <br />
                  {contact.address.city} – {contact.address.postalCode}
                </address>
              }
            />

            <div className="rounded-[--radius-card] border border-[--color-hairline] bg-[--color-surface-sunken] p-5">
              <p className="mb-3 text-xs font-semibold tracking-wide text-[--color-ink-subtle] uppercase">
                Clinic hours
              </p>
              <OpeningHoursList claim={openingHours} />
            </div>
          </aside>
        </div>
      </Section>

      <Section tone="sunken">
        <LocationMap />
      </Section>
    </>
  );
}

function ContactCard({
  icon,
  title,
  action,
  note,
}: {
  icon: React.ReactNode;
  title: string;
  action: React.ReactNode;
  note?: string;
}) {
  return (
    <div className="rounded-[--radius-card] border border-[--color-hairline] bg-white p-5">
      <div className="flex items-center gap-2.5">
        <span
          className="flex size-8 items-center justify-center rounded-lg bg-[--color-navy-50] text-[--color-navy-700]"
          aria-hidden="true"
        >
          {icon}
        </span>
        <p className="text-sm font-semibold text-[--color-primary]">{title}</p>
      </div>
      <div className="mt-2.5">{action}</div>
      {note ? (
        <p className="mt-2 text-xs leading-relaxed text-[--color-ink-subtle]">{note}</p>
      ) : null}
    </div>
  );
}
