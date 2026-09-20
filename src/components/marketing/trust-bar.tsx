import { CalendarCheck, Globe2, Microscope, Users } from "lucide-react";
import { statistics, yearsSince } from "@data/clinic-master-data";
import { isPublishable, publicValue } from "@data/verification";
import { formatCount } from "@/lib/utils";

/**
 * Trust bar.
 *
 * Only VERIFIED statistics appear. Everything else falls back to a qualitative
 * statement that is true regardless of the number — "a multi-specialist team"
 * rather than an invented headcount.
 *
 * This is why the old site's "25 years / 18 years" and "20,000 / 5,000
 * patients" contradictions cannot recur: the numbers are not typed into a
 * template, they are read from a claim that has to be signed off first. See
 * docs/CONTENT_AUDIT.md §2.
 */
export function TrustBar() {
  const items: Array<{ icon: React.ReactNode; value: string; label: string }> = [];

  const foundedYear = publicValue(statistics.clinicFoundedYear);
  if (foundedYear) {
    // Derived at render time, so it is never a year out of date.
    items.push({
      icon: <CalendarCheck className="size-5" aria-hidden="true" />,
      value: `${yearsSince(foundedYear)}+ years`,
      label: "Caring for Chandigarh",
    });
  }

  const patients = publicValue(statistics.patientsTreated);
  if (patients && isPublishable(statistics.patientsTreated)) {
    const asOf = statistics.patientsTreated.asOf;
    items.push({
      icon: <Users className="size-5" aria-hidden="true" />,
      value: `${formatCount(patients)}+`,
      label: asOf ? `Patients treated (as of ${asOf})` : "Patients treated",
    });
  }

  // Always-true statements that need no numeric claim behind them.
  items.push({
    icon: <Microscope className="size-5" aria-hidden="true" />,
    value: "Multi-specialist",
    label: "Implants, orthodontics, endodontics and surgery",
  });

  items.push({
    icon: <Globe2 className="size-5" aria-hidden="true" />,
    value: "International patients",
    label: "Treatment planned around your travel dates",
  });

  return (
    <div className="border-y border-(--color-hairline) bg-white">
      <div className="container-page">
        <ul className="grid divide-y divide-(--color-hairline) sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
          {items.slice(0, 4).map((item) => (
            <li key={item.label} className="flex items-start gap-3.5 px-1 py-6 lg:px-6">
              <span
                className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-(--color-teal-50) text-(--color-accent)"
                aria-hidden="true"
              >
                {item.icon}
              </span>
              <div>
                <p className="font-[family-name:--font-display] text-lg font-semibold text-(--color-primary)">
                  {item.value}
                </p>
                <p className="mt-0.5 text-sm leading-snug text-(--color-ink-subtle)">
                  {item.label}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
