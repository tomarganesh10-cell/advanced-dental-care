import Link from "next/link";
import { Home, Phone, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { contact } from "@data/clinic-master-data";

/**
 * 404.
 *
 * The previous site's URLs are 301-redirected (data/legacy-redirects.ts), so
 * most people landing here followed a genuinely dead link. Give them the three
 * things they were most likely looking for rather than an apology.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-5 py-20 text-center">
      <p className="text-sm font-semibold tracking-wide text-[--color-accent] uppercase">
        Page not found
      </p>
      <h1 className="mt-3 text-3xl md:text-4xl">We could not find that page</h1>
      <p className="mt-4 max-w-md text-[--color-ink-muted]">
        The link may be out of date. Here are the pages most people are looking for.
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button asChild size="lg">
          <Link href="/book-appointment">Book an appointment</Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href="/services">
            <Search aria-hidden="true" />
            Browse treatments
          </Link>
        </Button>
        <Button asChild variant="ghost" size="lg">
          <Link href="/">
            <Home aria-hidden="true" />
            Home
          </Link>
        </Button>
      </div>

      <p className="mt-8 text-sm text-[--color-ink-subtle]">
        Or call the clinic:{" "}
        <a href={`tel:${contact.phone.e164}`} className="font-semibold text-[--color-action]">
          <Phone className="mr-1 inline size-3.5" aria-hidden="true" />
          {contact.phone.display}
        </a>
      </p>
    </div>
  );
}
