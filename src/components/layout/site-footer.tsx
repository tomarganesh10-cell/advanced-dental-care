import Link from "next/link";
import { Mail, MapPin, Phone } from "lucide-react";
import { contact, footerDisclaimer, identity, openingHours } from "@data/clinic-master-data";
import { SERVICE_CATEGORIES, getServicesByCategory } from "@data/services";
import { OpeningHoursList } from "@/components/marketing/opening-hours";

const QUICK_LINKS = [
  { href: "/about", label: "About the practice" },
  { href: "/doctors", label: "Our dentists" },
  { href: "/technology", label: "Technology" },
  { href: "/smile-gallery", label: "Smile gallery" },
  { href: "/testimonials", label: "Patient stories" },
  { href: "/dental-tourism", label: "Dental tourism" },
  { href: "/blog", label: "Blog" },
  { href: "/faqs", label: "FAQs" },
  { href: "/contact", label: "Contact" },
];

const LEGAL_LINKS = [
  { href: "/privacy-policy", label: "Privacy policy" },
  { href: "/terms", label: "Terms of use" },
  { href: "/medical-disclaimer", label: "Medical disclaimer" },
  { href: "/patient-rights", label: "Your data rights" },
];

export function SiteFooter() {
  const year = new Date().getFullYear();
  const featuredCategories = SERVICE_CATEGORIES.slice(0, 3);

  return (
    <footer className="no-print border-t border-(--color-navy-800) bg-(--color-navy-900) text-(--color-navy-200)">
      <div className="container-page py-14">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          {/* Identity + contact */}
          <div className="space-y-4">
            <div>
              <p className="font-[family-name:--font-display] text-lg font-semibold text-white">
                {identity.displayName}
              </p>
              <p className="mt-1 text-sm">{identity.tagline}</p>
            </div>

            <address className="space-y-2.5 text-sm not-italic">
              <p className="flex items-start gap-2.5">
                <MapPin
                  className="mt-0.5 size-4 shrink-0 text-(--color-teal-400)"
                  aria-hidden="true"
                />
                <span>
                  {contact.address.line1}, {contact.address.line2}
                  <br />
                  {contact.address.city} – {contact.address.postalCode}
                </span>
              </p>
              <p className="flex items-center gap-2.5">
                <Phone className="size-4 shrink-0 text-(--color-teal-400)" aria-hidden="true" />
                <a href={`tel:${contact.phone.e164}`} className="hover:text-white hover:underline">
                  {contact.phone.display}
                </a>
              </p>
              <p className="flex items-center gap-2.5">
                <Mail className="size-4 shrink-0 text-(--color-teal-400)" aria-hidden="true" />
                <a
                  href={`mailto:${contact.email.primary}`}
                  className="break-all hover:text-white hover:underline"
                >
                  {contact.email.primary}
                </a>
              </p>
            </address>
          </div>

          {/* Treatments */}
          <div>
            <h2 className="mb-3.5 text-sm font-semibold tracking-wide text-white uppercase">
              Treatments
            </h2>
            <ul className="space-y-2 text-sm">
              {featuredCategories.flatMap((category) =>
                getServicesByCategory(category.slug)
                  .slice(0, 3)
                  .map((service) => (
                    <li key={service.slug}>
                      <Link
                        href={`/services/${service.slug}`}
                        className="hover:text-white hover:underline"
                      >
                        {service.name}
                      </Link>
                    </li>
                  )),
              )}
              <li>
                <Link
                  href="/services"
                  className="font-medium text-(--color-teal-300) hover:underline"
                >
                  All treatments →
                </Link>
              </li>
            </ul>
          </div>

          {/* Quick links */}
          <div>
            <h2 className="mb-3.5 text-sm font-semibold tracking-wide text-white uppercase">
              Quick links
            </h2>
            <ul className="space-y-2 text-sm">
              {QUICK_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="hover:text-white hover:underline">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Hours + actions */}
          <div className="space-y-5">
            <div>
              <h2 className="mb-3.5 text-sm font-semibold tracking-wide text-white uppercase">
                Clinic hours
              </h2>
              <OpeningHoursList claim={openingHours} tone="dark" />
            </div>

            <div className="space-y-2">
              <Link
                href="/book-appointment"
                className="flex h-11 w-full items-center justify-center rounded-full bg-(--color-action) px-5 text-sm font-semibold text-white hover:bg-(--color-medical-600)"
              >
                Book an appointment
              </Link>
              <a
                href={`https://wa.me/${contact.phone.whatsapp}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-11 w-full items-center justify-center rounded-full border border-(--color-navy-600) px-5 text-sm font-semibold text-white hover:bg-(--color-navy-800)"
              >
                WhatsApp us
              </a>
            </div>
          </div>
        </div>

        {/*
          Medical disclaimer. Required by the content governance rules — this is
          a health website, and the distinction between general information and
          a consultation has to be stated, not implied.
        */}
        <div className="mt-10 rounded-(--radius-card) border border-(--color-navy-700) bg-(--color-navy-950)/60 p-5">
          <p className="text-xs leading-relaxed text-(--color-navy-300)">{footerDisclaimer}</p>
        </div>

        <div className="mt-8 flex flex-col gap-4 border-t border-(--color-navy-800) pt-6 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {identity.legalName}. All rights reserved.
          </p>
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {LEGAL_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="hover:text-white hover:underline">
                  {link.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/staff-login" className="text-(--color-navy-400) hover:text-white">
                Staff login
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
