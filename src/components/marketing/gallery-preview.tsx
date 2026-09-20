import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listPublicGalleryCases } from "@/server/gallery";
import { disclaimers } from "@data/clinic-master-data";

/**
 * Before/after preview.
 *
 * Reads through `listPublicGalleryCases`, which enforces the consent gate.
 * When no consented case exists the section is omitted entirely rather than
 * padded with stock photography — a dental gallery filled with other people's
 * stock cases is both dishonest and instantly recognisable as such.
 */
export async function GalleryPreview() {
  const cases = await listPublicGalleryCases({ limit: 3 });
  if (cases.length === 0) return null;

  return (
    <div className="container-page">
      <ul className="grid gap-6 md:grid-cols-3">
        {cases.map((item) => {
          const before = item.media.find((m) => m.phase === "BEFORE");
          const after = item.media.find((m) => m.phase === "AFTER");

          return (
            <li
              key={item.id}
              className="overflow-hidden rounded-(--radius-card) border border-(--color-hairline) bg-white"
            >
              <div className="grid grid-cols-2 gap-px bg-(--color-hairline)">
                {[
                  { label: "Before", media: before },
                  { label: "After", media: after },
                ].map((panel) => (
                  <div key={panel.label} className="relative aspect-square bg-(--color-sand)">
                    {panel.media ? (
                      <Image
                        src={panel.media.imageUrl}
                        alt={panel.media.altText}
                        fill
                        sizes="(max-width: 768px) 50vw, 20vw"
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <ImageIcon className="size-6 text-(--color-navy-300)" aria-hidden="true" />
                      </div>
                    )}
                    <span className="absolute bottom-2 left-2 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white uppercase">
                      {panel.label}
                    </span>
                  </div>
                ))}
              </div>

              <div className="p-5">
                <h3 className="text-base font-semibold">{item.title}</h3>
                {item.concern ? (
                  <p className="mt-1 text-sm text-(--color-ink-subtle)">Concern: {item.concern}</p>
                ) : null}
                {item.summary ? (
                  <p className="mt-2 text-sm leading-relaxed text-(--color-ink-muted)">
                    {item.summary}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-8 flex flex-col items-center gap-4">
        <Button asChild variant="outline" size="lg">
          <Link href="/smile-gallery">
            See more cases
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>

        {/*
          Required alongside any before/after imagery. Results shown are from
          specific patients and are not a prediction for anyone else.
        */}
        <p className="max-w-2xl text-center text-xs leading-relaxed text-(--color-ink-subtle)">
          {disclaimers.results}
        </p>
      </div>
    </div>
  );
}
