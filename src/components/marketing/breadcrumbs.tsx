import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema, type BreadcrumbItem } from "@/lib/seo";

/**
 * Breadcrumbs.
 *
 * Rendered visually AND as BreadcrumbList structured data from the same array,
 * so the markup and what the user sees cannot disagree.
 */
export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  const trail: BreadcrumbItem[] = [{ name: "Home", path: "/" }, ...items];

  return (
    <>
      <nav aria-label="Breadcrumb" className="container-page py-4">
        <ol className="flex flex-wrap items-center gap-1.5 text-sm text-[--color-ink-subtle]">
          {trail.map((item, index) => {
            const isLast = index === trail.length - 1;
            return (
              <li key={item.path} className="flex items-center gap-1.5">
                {index > 0 ? <ChevronRight className="size-3.5 opacity-60" aria-hidden="true" /> : null}
                {isLast ? (
                  <span aria-current="page" className="font-medium text-[--color-ink]">
                    {item.name}
                  </span>
                ) : (
                  <Link href={item.path} className="hover:text-[--color-action] hover:underline">
                    {item.name}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      <JsonLd data={breadcrumbSchema(trail)} />
    </>
  );
}
