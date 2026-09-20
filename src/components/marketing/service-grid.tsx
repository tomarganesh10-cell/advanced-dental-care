import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Service } from "@data/services";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

/**
 * Treatment cards.
 *
 * Each card states what the treatment is in one plain sentence. No card claims
 * an outcome — the language rules in docs/CONTENT_GOVERNANCE.md apply to card
 * copy as much as to page copy, and cards are where marketing superlatives
 * usually creep back in.
 */
export function ServiceGrid({
  services,
  className,
  columns = 3,
}: {
  services: Service[];
  className?: string;
  columns?: 2 | 3;
}) {
  return (
    <ul
      className={cn(
        "grid gap-5",
        columns === 3 ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2",
        className,
      )}
    >
      {services.map((service) => (
        <li key={service.slug}>
          <Link
            href={`/services/${service.slug}`}
            className="group flex h-full flex-col rounded-(--radius-card) border border-(--color-hairline) bg-white p-6 transition-all hover:-translate-y-0.5 hover:border-(--color-medical-200) hover:shadow-(--shadow-card)"
          >
            <span
              className="mb-4 flex size-11 items-center justify-center rounded-xl bg-(--color-medical-50) text-(--color-action) transition-colors group-hover:bg-(--color-medical-100)"
              aria-hidden="true"
            >
              <Icon name={service.icon} className="size-5" />
            </span>

            <h3 className="text-lg font-semibold">{service.name}</h3>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-(--color-ink-muted)">
              {service.summary}
            </p>

            {service.typicalVisits ? (
              <p className="mt-3 text-xs text-(--color-ink-subtle)">
                Typically {service.typicalVisits}
              </p>
            ) : null}

            <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-(--color-action)">
              Learn more
              <ArrowRight
                className="size-4 transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
