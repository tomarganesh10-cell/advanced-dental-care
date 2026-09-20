import Image from "next/image";
import type { Metadata } from "next";
import { ImageIcon, ShieldCheck } from "lucide-react";
import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { BookingCta } from "@/components/marketing/booking-cta";
import { Section } from "@/components/marketing/section";
import { EmptyState } from "@/components/ui/states";
import { buildMetadata } from "@/lib/seo";
import { GALLERY_CATEGORIES, listPublicGalleryCases } from "@/server/gallery";
import { disclaimers } from "@data/clinic-master-data";
import Link from "next/link";
import { cn } from "@/lib/utils";

export const metadata: Metadata = buildMetadata({
  title: "Smile Gallery — Before & After",
  description:
    "Before and after dental treatment results from Advanced Dental Care Centre, Chandigarh. Published with each patient's written consent.",
  path: "/smile-gallery",
});

export const revalidate = 600;

export default async function SmileGalleryPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category = "all" } = await searchParams;
  const cases = await listPublicGalleryCases({ category });

  return (
    <>
      <Breadcrumbs items={[{ name: "Smile Gallery", path: "/smile-gallery" }]} />

      <div className="container-page pb-8">
        <h1 className="text-3xl md:text-4xl">Smile gallery</h1>
        <p className="prose-clinic mt-4">
          Real treatment results from patients of this practice. Every case here is published with
          that patient&apos;s written, specific consent, and any patient can withdraw that consent
          at any time — in which case their case disappears from this page.
        </p>
      </div>

      {/* Filters */}
      <div className="container-page">
        <ul className="flex flex-wrap gap-2">
          {GALLERY_CATEGORIES.map((item) => (
            <li key={item.slug}>
              <Link
                href={
                  item.slug === "all" ? "/smile-gallery" : `/smile-gallery?category=${item.slug}`
                }
                className={cn(
                  "inline-block rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                  category === item.slug
                    ? "border-[--color-action] bg-[--color-action] text-white"
                    : "border-[--color-navy-200] bg-white text-[--color-ink-muted] hover:bg-[--color-navy-50]",
                )}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <Section className="pt-10">
        <div className="container-page">
          {cases.length === 0 ? (
            <EmptyState
              title="No cases published in this category yet"
              description="We only publish treatment photographs where the patient has given written consent, so this gallery grows slowly. Ask at your consultation to see cases similar to yours."
            />
          ) : (
            <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {cases.map((item) => {
                const before = item.media.find((m) => m.phase === "BEFORE");
                const after = item.media.find((m) => m.phase === "AFTER");

                return (
                  <li
                    key={item.id}
                    className="overflow-hidden rounded-[--radius-card] border border-[--color-hairline] bg-white"
                  >
                    <div className="grid grid-cols-2 gap-px bg-[--color-hairline]">
                      {[
                        { label: "Before", media: before },
                        { label: "After", media: after },
                      ].map((panel) => (
                        <div key={panel.label} className="relative aspect-square bg-[--color-sand]">
                          {panel.media ? (
                            <Image
                              src={panel.media.imageUrl}
                              alt={panel.media.altText}
                              fill
                              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 16vw"
                              className="object-cover"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center">
                              <ImageIcon
                                className="size-6 text-[--color-navy-300]"
                                aria-hidden="true"
                              />
                            </div>
                          )}
                          <span className="absolute bottom-2 left-2 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white uppercase">
                            {panel.label}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="p-5">
                      <h2 className="text-base font-semibold">{item.title}</h2>
                      {item.concern ? (
                        <p className="mt-1 text-sm text-[--color-ink-subtle]">
                          Concern: {item.concern}
                        </p>
                      ) : null}
                      {item.treatmentDescription ? (
                        <p className="mt-2 text-sm leading-relaxed text-[--color-ink-muted]">
                          {item.treatmentDescription}
                        </p>
                      ) : null}
                      {item.doctorName ? (
                        <p className="mt-3 text-xs text-[--color-ink-subtle]">
                          Treated by {item.doctorName}
                        </p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-10 flex items-start gap-3 rounded-[--radius-card] border border-[--color-hairline] bg-[--color-surface-sunken] p-6">
            <ShieldCheck
              className="mt-0.5 size-5 shrink-0 text-[--color-accent]"
              aria-hidden="true"
            />
            <div className="text-sm leading-relaxed text-[--color-ink-muted]">
              <p className="font-medium text-[--color-ink]">About these images</p>
              <p className="mt-1">{disclaimers.results}</p>
              <p className="mt-2">
                Photographs are not retouched to change the result. Lighting and angle are matched
                between before and after as closely as clinical photography allows.
              </p>
            </div>
          </div>
        </div>
      </Section>

      <Section tone="sunken">
        <BookingCta title="Talk through what is possible for your smile" />
      </Section>
    </>
  );
}
