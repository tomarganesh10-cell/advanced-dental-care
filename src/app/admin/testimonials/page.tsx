import { Quote, Star, Video } from "lucide-react";
import { PageHeader, StatCard } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@/lib/rbac";
import { formatClinicDate } from "@/lib/time";
import { requireStaffPage } from "@/server/auth/guards";

export const dynamic = "force-dynamic";

export default async function TestimonialsAdminPage() {
  await requireStaffPage(PERMISSIONS.TESTIMONIAL_MANAGE);

  const testimonials = await prisma.testimonial.findMany({
    where: { deletedAt: null },
    orderBy: [{ isPublished: "desc" }, { displayOrder: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      authorName: true,
      authorLocation: true,
      serviceSlug: true,
      rating: true,
      quote: true,
      videoUrl: true,
      isPublished: true,
      consentGranted: true,
      consentEvidence: true,
      approvedAt: true,
      createdAt: true,
      patient: { select: { id: true, fullName: true } },
    },
  });

  const live = testimonials.filter((item) => item.isPublished && item.consentGranted);
  const awaitingConsent = testimonials.filter((item) => !item.consentGranted);

  return (
    <>
      <PageHeader
        title="Testimonials"
        description="Written and video patient stories. Published only with recorded consent."
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard label="Live on the website" value={live.length} tone="success" />
        <StatCard label="Total" value={testimonials.length} />
        <StatCard
          label="Awaiting consent"
          value={awaitingConsent.length}
          tone={awaitingConsent.length > 0 ? "warning" : "default"}
        />
      </div>

      {testimonials.length === 0 ? (
        <EmptyState
          title="No testimonials yet"
          description="Migrated testimonials from the previous site are held until consent is re-confirmed for each named patient."
        />
      ) : (
        <ul className="space-y-3">
          {testimonials.map((item) => (
            <li
              key={item.id}
              className="rounded-[--radius-card] border border-[--color-hairline] bg-white p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <Quote className="size-4 text-[--color-navy-200]" aria-hidden="true" />

                  {item.rating ? (
                    <div className="mt-1.5 flex gap-0.5" aria-label={`${item.rating} out of 5`}>
                      {Array.from({ length: 5 }, (_, index) => (
                        <Star
                          key={index}
                          className={
                            index < (item.rating ?? 0)
                              ? "size-3.5 fill-amber-400 text-amber-400"
                              : "size-3.5 text-[--color-navy-200]"
                          }
                          aria-hidden="true"
                        />
                      ))}
                    </div>
                  ) : null}

                  <blockquote className="mt-2 max-w-2xl text-sm leading-relaxed text-[--color-ink-muted]">
                    {item.quote}
                  </blockquote>

                  <p className="mt-2 text-sm">
                    <span className="font-medium">{item.authorName}</span>
                    {item.authorLocation ? (
                      <span className="text-[--color-ink-subtle]"> · {item.authorLocation}</span>
                    ) : null}
                    {item.serviceSlug ? (
                      <span className="text-[--color-ink-subtle]"> · {item.serviceSlug}</span>
                    ) : null}
                  </p>

                  {item.consentEvidence ? (
                    <p className="mt-1.5 text-xs text-[--color-ink-subtle]">
                      Consent: {item.consentEvidence}
                    </p>
                  ) : null}
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <Badge tone={item.isPublished && item.consentGranted ? "success" : "neutral"}>
                    {item.isPublished && item.consentGranted ? "Live" : "Not on website"}
                  </Badge>
                  <Badge tone={item.consentGranted ? "success" : "warning"}>
                    {item.consentGranted ? "Consent recorded" : "No consent"}
                  </Badge>
                  {item.videoUrl ? (
                    <Badge tone="info">
                      <Video className="size-3" aria-hidden="true" />
                      Video
                    </Badge>
                  ) : null}
                  <p className="text-xs text-[--color-ink-subtle]">
                    {formatClinicDate(item.createdAt, "d MMM yyyy")}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 text-xs leading-relaxed text-[--color-ink-subtle]">
        A testimonial is published only when both the consent flag and the published flag are set —
        enforced in the query the public page uses. Editing from this screen is not yet built; see
        docs/STATUS.md.
      </p>
    </>
  );
}
