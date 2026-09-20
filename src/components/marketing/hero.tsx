import Link from "next/link";
import { CalendarPlus, MapPin, MessageCircle, Phone, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GoogleRating } from "./google-rating";
import { contact, identity } from "@data/clinic-master-data";

const HERO_SERVICES = [
  "Implants",
  "Cosmetic Dentistry",
  "Smile Design",
  "Orthodontics",
  "Root Canal",
  "Oral Surgery",
];

/**
 * Homepage hero.
 *
 * Priorities, in order: say who we are and where, give a reason to trust,
 * make booking one tap away. No carousel — rotating hero sliders measurably
 * hurt conversion and push the primary CTA below the fold on a phone.
 *
 * The clinical photography slot is deliberately left as a styled placeholder
 * rather than filled with stock imagery of models. Stock smiles on a dental
 * site read as stock smiles, and a real photograph of Dr. Gupta and the surgery
 * will outperform anything bought.
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden bg-(--color-navy-900)">
      {/* Soft radial wash — subtle depth without the gradient-everywhere look. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_60%_at_75%_10%,rgba(59,136,246,0.20),transparent_60%),radial-gradient(50%_50%_at_10%_90%,rgba(32,165,133,0.16),transparent_65%)]"
      />

      <div className="container-page relative grid gap-12 py-16 md:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] lg:items-center lg:gap-16 lg:py-24">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-medium tracking-wide text-(--color-teal-200)">
            <MapPin className="size-3.5" aria-hidden="true" />
            {contact.address.line2}, {contact.address.city}
          </p>

          <h1 className="mt-6 text-4xl leading-[1.08] text-white md:text-5xl lg:text-[3.4rem]">
            {identity.tagline}
          </h1>

          <p className="mt-5 max-w-xl text-lg leading-relaxed text-(--color-navy-200)">
            A multi-specialist dental practice in Chandigarh. Every treatment plan starts with an
            examination and an honest conversation about your options — including the option to do
            nothing yet.
          </p>

          <ul className="mt-6 flex flex-wrap gap-x-2 gap-y-2">
            {HERO_SERVICES.map((service) => (
              <li
                key={service}
                className="rounded-full border border-white/12 bg-white/[0.06] px-3 py-1 text-[13px] text-(--color-navy-100)"
              >
                {service}
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button asChild size="xl" className="sm:w-auto">
              <Link href="/book-appointment">
                <CalendarPlus aria-hidden="true" />
                Book an appointment
              </Link>
            </Button>

            <Button asChild size="xl" variant="whatsapp" className="sm:w-auto">
              <a
                href={`https://wa.me/${contact.phone.whatsapp}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle aria-hidden="true" />
                WhatsApp us
              </a>
            </Button>

            <Button
              asChild
              size="xl"
              variant="ghost"
              className="border border-white/20 text-white hover:bg-white/10 sm:w-auto"
            >
              <a href={`tel:${contact.phone.e164}`}>
                <Phone aria-hidden="true" />
                {contact.phone.display}
              </a>
            </Button>
          </div>

          <GoogleRating className="mt-8" tone="dark" showLink />
        </div>

        {/* Visual column */}
        <div className="relative">
          <div className="relative aspect-4/5 overflow-hidden rounded-(--radius-card) border border-white/10 bg-gradient-to-b from-(--color-navy-700) to-(--color-navy-800) shadow-(--shadow-lifted)">
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-8 text-center">
              <div className="flex size-16 items-center justify-center rounded-full bg-white/10">
                <ShieldCheck className="size-8 text-(--color-teal-300)" aria-hidden="true" />
              </div>
              <p className="text-sm font-medium text-white">Clinical photography</p>
              <p className="max-w-xs text-xs leading-relaxed text-(--color-navy-300)">
                Replace with a professional photograph of Dr. Anshu Gupta and the surgery. See
                docs/CONTENT_AUDIT.md for the asset checklist.
              </p>
            </div>
          </div>

          {/* Floating card — the one piece of decoration that carries information. */}
          <div className="absolute -bottom-5 -left-4 hidden max-w-[15rem] rounded-xl border border-(--color-hairline) bg-white p-4 shadow-(--shadow-lifted) sm:block">
            <p className="text-xs font-semibold tracking-wide text-(--color-accent) uppercase">
              Same-day emergencies
            </p>
            <p className="mt-1 text-sm leading-snug text-(--color-ink-muted)">
              In pain today? Call the clinic — we keep slots free for urgent problems.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
