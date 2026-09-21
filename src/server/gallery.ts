import { prisma } from "@/lib/db";
import { prerenderSafe } from "@/lib/prerender";

/**
 * Smile gallery queries.
 *
 * The consent gate lives HERE, in the only function the public site uses to
 * read gallery cases, rather than in the template. A template-level check is
 * one careless `prisma.galleryCase.findMany()` away from publishing a patient's
 * face without permission, which is the most serious thing this site could get
 * wrong.
 *
 * A case is public only when all of these hold:
 *   - consentStatus is GRANTED
 *   - the consent has not expired (consent is revocable and time-limited)
 *   - it has been explicitly published by staff
 *   - it is not soft-deleted
 */

export interface PublicGalleryCase {
  id: string;
  slug: string;
  title: string;
  category: string;
  serviceSlug: string | null;
  concern: string | null;
  summary: string | null;
  treatmentDescription: string | null;
  doctorName: string | null;
  media: Array<{
    id: string;
    phase: string;
    imageUrl: string;
    altText: string;
    width: number | null;
    height: number | null;
  }>;
}

function publicWhere(now: Date) {
  return {
    isPublished: true,
    deletedAt: null,
    consentStatus: "GRANTED" as const,
    OR: [{ consentExpiresAt: null }, { consentExpiresAt: { gt: now } }],
  };
}

export async function listPublicGalleryCases(
  options: {
    category?: string;
    limit?: number;
    now?: Date;
  } = {},
): Promise<PublicGalleryCase[]> {
  const now = options.now ?? new Date();

  const cases = await prerenderSafe(
    () =>
      prisma.galleryCase.findMany({
        where: {
          ...publicWhere(now),
          ...(options.category && options.category !== "all" ? { category: options.category } : {}),
        },
        orderBy: [{ displayOrder: "asc" }, { createdAt: "desc" }],
        take: options.limit,
        select: {
          id: true,
          slug: true,
          title: true,
          category: true,
          serviceSlug: true,
          concern: true,
          summary: true,
          treatmentDescription: true,
          doctor: { select: { displayName: true } },
          media: {
            orderBy: { sequence: "asc" },
            select: {
              id: true,
              phase: true,
              imageUrl: true,
              altText: true,
              width: true,
              height: true,
            },
          },
        },
      }),
    [],
    "public gallery cases",
  );

  return cases.map((item) => ({
    id: item.id,
    slug: item.slug,
    title: item.title,
    category: item.category,
    serviceSlug: item.serviceSlug,
    concern: item.concern,
    summary: item.summary,
    treatmentDescription: item.treatmentDescription,
    doctorName: item.doctor?.displayName ?? null,
    media: item.media,
  }));
}

export async function getPublicGalleryCase(slug: string, now = new Date()) {
  const cases = await prisma.galleryCase.findFirst({
    where: { slug, ...publicWhere(now) },
    select: {
      id: true,
      slug: true,
      title: true,
      category: true,
      serviceSlug: true,
      concern: true,
      summary: true,
      treatmentDescription: true,
      doctor: { select: { displayName: true } },
      media: {
        orderBy: { sequence: "asc" },
        select: { id: true, phase: true, imageUrl: true, altText: true, width: true, height: true },
      },
    },
  });

  if (!cases) return null;

  return {
    ...cases,
    doctorName: cases.doctor?.displayName ?? null,
  };
}

export const GALLERY_CATEGORIES = [
  { slug: "all", label: "All cases" },
  { slug: "implants", label: "Implants" },
  { slug: "veneers", label: "Veneers" },
  { slug: "smile-design", label: "Smile design" },
  { slug: "whitening", label: "Whitening" },
  { slug: "braces", label: "Braces & aligners" },
  { slug: "full-mouth", label: "Full mouth" },
] as const;

/** Published testimonials, gated on their own consent flag. */
export async function listPublishedTestimonials(limit?: number) {
  return prerenderSafe(() => prisma.testimonial.findMany({
    where: { isPublished: true, consentGranted: true, deletedAt: null },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "desc" }],
    take: limit,
    select: {
      id: true,
      authorName: true,
      authorLocation: true,
      serviceSlug: true,
      rating: true,
      quote: true,
      videoUrl: true,
      thumbnailUrl: true,
    },
  }), [], "published testimonials");
}
