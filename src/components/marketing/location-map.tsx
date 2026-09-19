import { Car, MapPin, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { env } from "@/lib/env";
import { contact, openingHours } from "@data/clinic-master-data";
import { OpeningHoursList } from "./opening-hours";

/**
 * Location and directions.
 *
 * The map is a plain iframe embed loaded lazily. It is NOT the Maps JavaScript
 * API: the embed needs no key, costs nothing per load, and sets far fewer
 * third-party cookies — which keeps the privacy policy honest and the page
 * fast. Directions open in the user's own maps app.
 */
export function LocationMap() {
  const query = encodeURIComponent(contact.address.formatted);
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${query}`;

  // The keyed embed renders a nicer map when a key exists; the keyless form is
  // a working fallback so the section is never blank.
  const embedSrc = env.NEXT_PUBLIC_GOOGLE_MAPS_KEY
    ? `https://www.google.com/maps/embed/v1/place?key=${env.NEXT_PUBLIC_GOOGLE_MAPS_KEY}&q=${query}&zoom=16`
    : `https://maps.google.com/maps?q=${query}&z=16&output=embed`;

  return (
    <div className="container-page">
      <div className="overflow-hidden rounded-[--radius-card] border border-[--color-hairline] bg-white">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
          <div className="p-7 md:p-9">
            <p className="mb-2.5 text-xs font-semibold tracking-[0.16em] text-[--color-accent] uppercase">
              Visit the clinic
            </p>
            <h2 className="text-2xl md:text-3xl">Sector 18-A, Chandigarh</h2>

            <address className="mt-5 flex items-start gap-3 text-base not-italic text-[--color-ink-muted]">
              <MapPin className="mt-1 size-5 shrink-0 text-[--color-action]" aria-hidden="true" />
              <span>
                {contact.address.line1}
                <br />
                {contact.address.line2}
                <br />
                {contact.address.city} – {contact.address.postalCode}
                <br />
                {contact.address.country}
              </span>
            </address>

            <div className="mt-6 border-t border-[--color-hairline] pt-5">
              <p className="mb-3 text-xs font-semibold tracking-wide text-[--color-ink-subtle] uppercase">
                Opening hours
              </p>
              <OpeningHoursList claim={openingHours} />
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <a href={directionsUrl} target="_blank" rel="noopener noreferrer">
                  <Navigation aria-hidden="true" />
                  Get directions
                </a>
              </Button>
              <Button asChild variant="outline" size="lg">
                <a href={`tel:${contact.phone.e164}`}>Call the clinic</a>
              </Button>
            </div>

            <p className="mt-5 flex items-start gap-2 text-xs leading-relaxed text-[--color-ink-subtle]">
              <Car className="mt-px size-3.5 shrink-0" aria-hidden="true" />
              Sector 18-A is in central Chandigarh, close to the Sector 17 market. Ask
              reception about parking when you book.
            </p>
          </div>

          <div className="min-h-[22rem] bg-[--color-sand] lg:min-h-full">
            <iframe
              title={`Map showing ${contact.address.formatted}`}
              src={embedSrc}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="h-full min-h-[22rem] w-full border-0"
              allowFullScreen
            />
          </div>
        </div>
      </div>
    </div>
  );
}
