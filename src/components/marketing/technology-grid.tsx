import { Info } from "lucide-react";
import { technology } from "@data/clinic-master-data";
import { isPublishable } from "@data/verification";
import { Icon } from "@/components/ui/icon";

const ICON_BY_SLUG: Record<string, string> = {
  cbct: "Scan",
  "dental-laser": "Zap",
  "guided-implant-planning": "Crosshair",
  "digital-smile-planning": "Smile",
  "intraoral-scanning": "ScanLine",
};

/**
 * Technology section.
 *
 * Every item is gated on verification. A CBCT claim in particular requires a
 * current AERB licence, not just an invoice — publishing an X-ray capability
 * the clinic cannot evidence is a regulatory exposure, not a marketing one.
 *
 * When nothing is verified yet the section explains what it is waiting for
 * rather than rendering an empty grid. That message is visible only to whoever
 * is reviewing the build; once the clinic verifies equipment it disappears.
 */
export function TechnologyGrid({ showPendingNotice = false }: { showPendingNotice?: boolean }) {
  const publishable = technology.filter(isPublishable);

  if (publishable.length === 0) {
    if (!showPendingNotice) return null;

    return (
      <div className="container-page">
        <div className="mx-auto flex max-w-2xl items-start gap-3 rounded-[--radius-card] border border-dashed border-[--color-navy-200] bg-white p-6">
          <Info className="mt-0.5 size-5 shrink-0 text-[--color-ink-subtle]" aria-hidden="true" />
          <div className="text-sm text-[--color-ink-muted]">
            <p className="font-medium text-[--color-ink]">Equipment list awaiting verification</p>
            <p className="mt-1 leading-relaxed">
              CBCT, laser and digital planning claims are held back until the clinic supplies
              the supporting documents (including the AERB licence for the CBCT unit). Verify
              them in <span className="font-medium">Admin → Content verification</span> and they
              will appear here.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container-page">
      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {publishable.map((claim) => (
          <li
            key={claim.value.slug}
            className="rounded-[--radius-card] border border-[--color-hairline] bg-white p-6"
          >
            <span
              className="mb-4 flex size-11 items-center justify-center rounded-xl bg-[--color-teal-50] text-[--color-accent]"
              aria-hidden="true"
            >
              <Icon name={ICON_BY_SLUG[claim.value.slug] ?? "Microscope"} className="size-5" />
            </span>
            <h3 className="text-base font-semibold">{claim.value.name}</h3>
            <p className="mt-2 text-sm leading-relaxed text-[--color-ink-muted]">
              {claim.value.summary}
            </p>
            <p className="mt-3 border-t border-[--color-hairline] pt-3 text-sm leading-relaxed text-[--color-ink-subtle]">
              {claim.value.patientBenefit}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
