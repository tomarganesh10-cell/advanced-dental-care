"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarPlus, MapPin, MessageCircle, Phone } from "lucide-react";
import { contact } from "@data/clinic-master-data";
import { trackEvent } from "@/lib/analytics";

/**
 * Sticky mobile action bar.
 *
 * Most dental enquiries arrive on a phone, and most of those people want to
 * call rather than fill in a form. Keeping call, WhatsApp, book and directions
 * permanently reachable removes the scroll-back-to-the-top step that loses
 * them. `body` carries matching bottom padding so this never covers content.
 *
 * Hidden inside the booking flow and the portal, where it would compete with
 * the primary action on the page.
 */

const HIDDEN_PREFIXES = ["/book-appointment", "/patient-dashboard", "/admin", "/patient-login", "/staff-login"];

export function StickyMobileBar() {
  const pathname = usePathname();

  if (HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null;

  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    contact.address.formatted,
  )}`;

  return (
    <nav
      aria-label="Quick actions"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-[--color-hairline] bg-white/97 backdrop-blur-sm md:hidden no-print"
    >
      <a
        href={`tel:${contact.phone.e164}`}
        onClick={() => trackEvent("click_to_call", { placement: "sticky_bar" })}
        className="flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-[--color-ink-muted] active:bg-[--color-navy-50]"
      >
        <Phone className="size-5 text-[--color-action]" aria-hidden="true" />
        Call
      </a>

      <a
        href={`https://wa.me/${contact.phone.whatsapp}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => trackEvent("whatsapp_click", { placement: "sticky_bar" })}
        className="flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-[--color-ink-muted] active:bg-[--color-navy-50]"
      >
        <MessageCircle className="size-5 text-[#128C7E]" aria-hidden="true" />
        WhatsApp
      </a>

      <Link
        href="/book-appointment"
        onClick={() => trackEvent("booking_started", { placement: "sticky_bar" })}
        className="flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold text-[--color-action] active:bg-[--color-navy-50]"
      >
        <CalendarPlus className="size-5" aria-hidden="true" />
        Book
      </Link>

      <a
        href={directionsUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => trackEvent("directions_click", { placement: "sticky_bar" })}
        className="flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-[--color-ink-muted] active:bg-[--color-navy-50]"
      >
        <MapPin className="size-5 text-[--color-accent]" aria-hidden="true" />
        Directions
      </a>
    </nav>
  );
}
