"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Menu, Phone, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { contact, identity } from "@data/clinic-master-data";
import { SERVICE_CATEGORIES, getServicesByCategory } from "@data/services";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/about", label: "About" },
  { href: "/doctors", label: "Doctors" },
  { href: "/services", label: "Treatments", hasMenu: true },
  { href: "/technology", label: "Technology" },
  { href: "/smile-gallery", label: "Smile Gallery" },
  { href: "/dental-tourism", label: "International" },
  { href: "/blog", label: "Blog" },
  { href: "/contact", label: "Contact" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [treatmentsOpen, setTreatmentsOpen] = useState(false);

  /**
   * Close both menus on navigation, adjusting state during render rather than
   * in an effect. An effect would leave the open overlay painted over the new
   * page for one frame; this closes it in the same render that the route
   * changes. (React documents this "adjust state when a prop changes" pattern
   * for exactly this case.)
   */
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setMobileOpen(false);
    setTreatmentsOpen(false);
  }

  // Stop the page scrolling behind the open mobile sheet. This is a genuine
  // external-system sync, which is what effects are for.
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <header className="sticky top-0 z-40 border-b border-[--color-hairline] bg-white/95 backdrop-blur-sm no-print">
      {/* Utility strip — phone number visible without scrolling on desktop. */}
      <div className="hidden border-b border-[--color-hairline] bg-[--color-navy-900] text-white lg:block">
        <div className="container-page flex h-9 items-center justify-between text-xs">
          <p>{contact.address.formatted}</p>
          <div className="flex items-center gap-5">
            <a href={`tel:${contact.phone.e164}`} className="flex items-center gap-1.5 hover:underline">
              <Phone className="size-3" aria-hidden="true" />
              {contact.phone.display}
            </a>
            <a href={`mailto:${contact.email.primary}`} className="hover:underline">
              {contact.email.primary}
            </a>
          </div>
        </div>
      </div>

      <div className="container-page flex h-16 items-center justify-between gap-4 lg:h-[4.5rem]">
        <Link href="/" className="flex items-center gap-2.5" aria-label={`${identity.displayName} — home`}>
          <ToothMark className="size-8 shrink-0 text-[--color-action]" />
          <span className="flex flex-col leading-none">
            <span className="font-[family-name:--font-display] text-[15px] font-semibold tracking-tight text-[--color-primary] sm:text-base">
              Advanced Dental
            </span>
            <span className="mt-0.5 text-[10px] font-medium tracking-[0.14em] text-[--color-ink-subtle] uppercase">
              Care Centre
            </span>
          </span>
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-0.5 xl:flex">
          {NAV.map((item) =>
            item.hasMenu ? (
              <div
                key={item.href}
                className="relative"
                onMouseEnter={() => setTreatmentsOpen(true)}
                onMouseLeave={() => setTreatmentsOpen(false)}
              >
                <Link
                  href={item.href}
                  aria-expanded={treatmentsOpen}
                  aria-haspopup="true"
                  className={cn(
                    "flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    pathname.startsWith(item.href)
                      ? "text-[--color-action]"
                      : "text-[--color-ink-muted] hover:text-[--color-primary]",
                  )}
                >
                  {item.label}
                  <ChevronDown className="size-3.5" aria-hidden="true" />
                </Link>

                {treatmentsOpen ? (
                  <div className="absolute top-full left-1/2 w-[46rem] -translate-x-1/2 pt-2">
                    <div className="grid grid-cols-3 gap-x-6 gap-y-5 rounded-[--radius-card] border border-[--color-hairline] bg-white p-6 shadow-[--shadow-lifted]">
                      {SERVICE_CATEGORIES.map((category) => (
                        <div key={category.slug}>
                          <p className="mb-2 text-xs font-semibold tracking-wide text-[--color-ink-subtle] uppercase">
                            {category.name}
                          </p>
                          <ul className="space-y-1">
                            {getServicesByCategory(category.slug).map((service) => (
                              <li key={service.slug}>
                                <Link
                                  href={`/services/${service.slug}`}
                                  className="block rounded px-1.5 py-1 text-sm text-[--color-ink-muted] hover:bg-[--color-navy-50] hover:text-[--color-primary]"
                                >
                                  {service.name}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  pathname === item.href
                    ? "text-[--color-action]"
                    : "text-[--color-ink-muted] hover:text-[--color-primary]",
                )}
              >
                {item.label}
              </Link>
            ),
          )}
        </nav>

        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="hidden md:inline-flex">
            <Link href="/patient-login">Patient login</Link>
          </Button>
          <Button asChild size="sm" className="hidden sm:inline-flex">
            <Link href="/book-appointment">Book appointment</Link>
          </Button>
          <button
            type="button"
            onClick={() => setMobileOpen((open) => !open)}
            className="flex size-10 items-center justify-center rounded-lg border border-[--color-navy-200] text-[--color-primary] xl:hidden"
            aria-expanded={mobileOpen}
            aria-controls="mobile-menu"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
          >
            {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {mobileOpen ? (
        <div
          id="mobile-menu"
          className="fixed inset-x-0 top-16 bottom-0 z-50 overflow-y-auto border-t border-[--color-hairline] bg-white xl:hidden"
        >
          <nav aria-label="Mobile" className="container-page py-5">
            <ul className="space-y-0.5">
              {NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="block rounded-lg px-3 py-3 text-[15px] font-medium text-[--color-ink] hover:bg-[--color-navy-50]"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>

            <div className="mt-5 space-y-2 border-t border-[--color-hairline] pt-5">
              <Button asChild size="lg" full>
                <Link href="/book-appointment">Book an appointment</Link>
              </Button>
              <Button asChild variant="outline" size="lg" full>
                <Link href="/patient-login">Patient login</Link>
              </Button>
            </div>

            <div className="mt-5 space-y-1 border-t border-[--color-hairline] pt-5 text-sm text-[--color-ink-subtle]">
              <p className="font-medium text-[--color-ink]">{identity.displayName}</p>
              <p>{contact.address.formatted}</p>
              <a href={`tel:${contact.phone.e164}`} className="block text-[--color-action]">
                {contact.phone.display}
              </a>
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}

/** Simple geometric tooth mark. Not a photograph, so it stays crisp at any size. */
function ToothMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" aria-hidden="true">
      <path
        d="M16 4c-3 0-4.2 1.4-6.5 1.4C6.6 5.4 4 7.4 4 11.6c0 3.4 1.2 5.4 2 8.2.8 2.9 1.1 8.2 3.6 8.2 2.2 0 2.3-4.4 3.2-7.1.5-1.6 1.2-2.4 3.2-2.4s2.7.8 3.2 2.4c.9 2.7 1 7.1 3.2 7.1 2.5 0 2.8-5.3 3.6-8.2.8-2.8 2-4.8 2-8.2 0-4.2-2.6-6.2-5.5-6.2C20.2 5.4 19 4 16 4Z"
        fill="currentColor"
      />
    </svg>
  );
}
