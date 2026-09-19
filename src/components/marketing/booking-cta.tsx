import Link from "next/link";
import { CalendarPlus, MessageCircle, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { contact } from "@data/clinic-master-data";

export function BookingCta({
  title = "Ready to book?",
  description = "Choose a time that suits you, or call and we will find one with you. New patients welcome.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="container-page">
      <div className="rounded-[--radius-card] bg-gradient-to-br from-[--color-navy-800] to-[--color-navy-950] px-7 py-12 text-center md:px-12 md:py-16">
        <h2 className="text-3xl text-white md:text-4xl">{title}</h2>
        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-[--color-navy-200]">
          {description}
        </p>

        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button asChild size="xl">
            <Link href="/book-appointment">
              <CalendarPlus aria-hidden="true" />
              Book an appointment
            </Link>
          </Button>
          <Button asChild size="xl" variant="whatsapp">
            <a href={`https://wa.me/${contact.phone.whatsapp}`} target="_blank" rel="noopener noreferrer">
              <MessageCircle aria-hidden="true" />
              WhatsApp
            </a>
          </Button>
          <Button
            asChild
            size="xl"
            variant="ghost"
            className="border border-white/20 text-white hover:bg-white/10"
          >
            <a href={`tel:${contact.phone.e164}`}>
              <Phone aria-hidden="true" />
              {contact.phone.display}
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
