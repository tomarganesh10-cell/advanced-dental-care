import Link from "next/link";
import { FileUp, MessageCircle, Plane, Stethoscope, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { contact } from "@data/clinic-master-data";

/**
 * International patient pathway.
 *
 * The six steps are process, not promises. Nothing here claims a cost saving,
 * a treatment duration or help with visas or hotels unless the clinic has
 * confirmed it actually provides that — those are the claims dental tourism
 * marketing usually overreaches on, and they are the ones that produce angry
 * patients when they do not materialise.
 */
const STEPS = [
  {
    icon: FileUp,
    title: "Send your records",
    body: "Recent X-rays or a CBCT scan, photographs, and a note of your medical history and medications.",
  },
  {
    icon: Video,
    title: "Online consultation",
    body: "A video call at a time that works in your timezone, to talk through what you want and what is realistic.",
  },
  {
    icon: Stethoscope,
    title: "Provisional plan",
    body: "A written plan and estimate, clearly marked provisional — it can change once you are examined in person.",
  },
  {
    icon: Plane,
    title: "Plan your dates",
    body: "We tell you how many visits are needed and how far apart, so you can book travel around the treatment, not the other way round.",
  },
  {
    icon: Stethoscope,
    title: "Treatment in Chandigarh",
    body: "In-person examination first. The plan is confirmed or revised before treatment begins.",
  },
  {
    icon: MessageCircle,
    title: "Follow-up after you travel home",
    body: "Remote review, and a written summary of what was done so your local dentist can continue your care.",
  },
];

export function InternationalCta() {
  return (
    <div className="container-page">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
        <div>
          <p className="mb-2.5 text-xs font-semibold tracking-[0.16em] text-[--color-teal-300] uppercase">
            International patients
          </p>
          <h2 className="text-3xl text-white md:text-4xl">Planning dental treatment from abroad</h2>
          <p className="mt-4 text-base leading-relaxed text-[--color-navy-200]">
            Patients travel to us from across India and overseas. The assessment starts before you
            fly, so you arrive with a plan and a realistic number of visits rather than finding out
            on day one.
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" variant="accent">
              <Link href="/international-patients">Request an international consultation</Link>
            </Button>
            <Button asChild size="lg" variant="whatsapp">
              <a
                href={`https://wa.me/${contact.phone.whatsapp}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle aria-hidden="true" />
                WhatsApp the patient desk
              </a>
            </Button>
          </div>

          <p className="mt-5 text-xs leading-relaxed text-[--color-navy-400]">
            A plan prepared from records alone is provisional. It is confirmed only after an
            in-person examination, and it may change.
          </p>
        </div>

        <ol className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              className="rounded-[--radius-card] border border-white/10 bg-white/[0.04] p-5"
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="flex size-7 items-center justify-center rounded-full bg-[--color-teal-500]/20 text-xs font-semibold text-[--color-teal-200]"
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <step.icon className="size-4 text-[--color-teal-300]" aria-hidden="true" />
              </div>
              <h3 className="mt-3 text-[15px] font-semibold text-white">{step.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-[--color-navy-300]">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
