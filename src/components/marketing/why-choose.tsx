import { ClipboardList, FileText, Globe2, Microscope, ShieldCheck, Users } from "lucide-react";

/**
 * Reasons to choose the practice.
 *
 * Written as verifiable commitments about how the clinic works, not as
 * superlatives. "Written treatment plans" is a promise the clinic can be held
 * to; "the best dental care in Chandigarh" is a claim nobody can check and one
 * the DCI ethics code does not permit.
 */
const REASONS = [
  {
    icon: ClipboardList,
    title: "A written plan before treatment starts",
    body: "You get the proposed treatment, the number of visits and the cost in writing, with the alternatives set out — including doing nothing for now.",
  },
  {
    icon: Users,
    title: "A specialist team under one roof",
    body: "Implants, orthodontics, endodontics, oral surgery and children's dentistry are handled in-house, so complex cases are not split across clinics.",
  },
  {
    icon: Microscope,
    title: "Diagnosis before treatment",
    body: "Implant and full-mouth cases are planned from 3D imaging and records rather than estimated at the chair.",
  },
  {
    icon: FileText,
    title: "Your records, available to you",
    body: "Appointments, treatment plans, prescriptions, X-rays and invoices are all in your patient portal, not locked in a filing cabinet.",
  },
  {
    icon: Globe2,
    title: "International patients planned around travel",
    body: "Remote assessment first, a provisional plan, then treatment sequenced to fit the dates you are actually in Chandigarh.",
  },
  {
    icon: ShieldCheck,
    title: "Clear about what we cannot promise",
    body: "No guaranteed outcomes and no 'permanent solutions'. Where results vary between patients, we tell you that before you decide.",
  },
];

export function WhyChoose() {
  return (
    <div className="container-page">
      <ul className="grid gap-x-8 gap-y-9 md:grid-cols-2 lg:grid-cols-3">
        {REASONS.map((reason) => (
          <li key={reason.title} className="flex gap-4">
            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-[--color-action] shadow-[--shadow-subtle]"
              aria-hidden="true"
            >
              <reason.icon className="size-5" />
            </span>
            <div>
              <h3 className="text-base font-semibold">{reason.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-[--color-ink-muted]">{reason.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
