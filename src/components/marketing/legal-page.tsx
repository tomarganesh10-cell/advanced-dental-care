import type { ReactNode } from "react";
import { Breadcrumbs } from "./breadcrumbs";

/**
 * Shared shell for policy pages. Narrow measure, generous line height —
 * these are documents people actually need to read, not boxes to tick.
 */
export function LegalPage({
  title,
  lastUpdated,
  breadcrumb,
  children,
}: {
  title: string;
  lastUpdated: string;
  breadcrumb: { name: string; path: string };
  children: ReactNode;
}) {
  return (
    <>
      <Breadcrumbs items={[breadcrumb]} />

      <article className="container-page max-w-3xl pb-20">
        <h1 className="text-3xl md:text-4xl">{title}</h1>
        <p className="mt-2 text-sm text-[--color-ink-subtle]">Last updated: {lastUpdated}</p>

        <div className="prose-clinic mt-8 [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-xl [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-base [&_li]:mt-1.5 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">
          {children}
        </div>
      </article>
    </>
  );
}
