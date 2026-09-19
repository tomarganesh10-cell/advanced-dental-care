import type { Metadata } from "next";
import { CalendarCheck, Phone, ShieldCheck } from "lucide-react";
import { BookingWizard } from "@/components/booking/booking-wizard";
import { buildMetadata } from "@/lib/seo";
import { contact, openingHours } from "@data/clinic-master-data";
import { OpeningHoursList } from "@/components/marketing/opening-hours";

export const metadata: Metadata = buildMetadata({
  title: "Book a Dental Appointment in Chandigarh",
  description:
    "Book an appointment at Advanced Dental Care Centre, Sector 18-A, Chandigarh. Choose your treatment, dentist and time online, or call the clinic.",
  path: "/book-appointment",
});

export default async function BookAppointmentPage({
  searchParams,
}: {
  searchParams: Promise<{ treatment?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="bg-[--color-surface-sunken] py-10 md:py-16">
      <div className="container-page">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <h1 className="text-3xl md:text-4xl">Book an appointment</h1>
          <p className="mt-3 text-base leading-relaxed text-[--color-ink-muted]">
            Choose a time that suits you. Your booking is confirmed by reception, and you
            will get a message as soon as it is.
          </p>
        </div>

        <BookingWizard initialServiceSlug={params.treatment} />

        <div className="mx-auto mt-10 grid max-w-3xl gap-4 sm:grid-cols-3">
          <InfoCard
            icon={<ShieldCheck className="size-4" />}
            title="Verified by SMS"
            body="We send a 6-digit code so reception knows the number is right."
          />
          <InfoCard
            icon={<CalendarCheck className="size-4" />}
            title="No payment to book"
            body="You pay at the clinic after your consultation, not to hold a slot."
          />
          <InfoCard
            icon={<Phone className="size-4" />}
            title="Prefer to talk?"
            body={
              <>
                Call{" "}
                <a href={`tel:${contact.phone.e164}`} className="font-medium text-[--color-action]">
                  {contact.phone.display}
                </a>{" "}
                or{" "}
                <a
                  href={`https://wa.me/${contact.phone.whatsapp}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-[#128C7E]"
                >
                  WhatsApp us
                </a>
                .
              </>
            }
          />
        </div>

        <div className="mx-auto mt-6 max-w-3xl rounded-[--radius-card] border border-[--color-hairline] bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <h2 className="text-base font-semibold">Clinic hours</h2>
              <p className="mt-1 text-sm text-[--color-ink-subtle]">
                All appointment times shown are Chandigarh time (IST).
              </p>
            </div>
            <OpeningHoursList claim={openingHours} className="min-w-[14rem]" />
          </div>
        </div>

        <p className="mx-auto mt-6 max-w-3xl text-center text-xs leading-relaxed text-[--color-ink-subtle]">
          Online bookings need at least two hours&apos; notice. For anything urgent today,
          please call the clinic — we keep time free for emergencies.
        </p>
      </div>
    </div>
  );
}

function InfoCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: React.ReactNode;
}) {
  return (
    <div className="rounded-[--radius-card] border border-[--color-hairline] bg-white p-5">
      <span
        className="mb-2.5 flex size-8 items-center justify-center rounded-lg bg-[--color-teal-50] text-[--color-accent]"
        aria-hidden="true"
      >
        {icon}
      </span>
      <p className="text-sm font-semibold text-[--color-primary]">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-[--color-ink-subtle]">{body}</p>
    </div>
  );
}
