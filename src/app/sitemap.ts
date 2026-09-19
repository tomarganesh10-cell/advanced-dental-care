import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";
import { SITE_URL } from "@/lib/seo";
import { SERVICES } from "@data/services";

/**
 * XML sitemap.
 *
 * Only pages that should rank appear. The patient portal, admin panel, booking
 * confirmation and feedback links are excluded — they are either private or
 * single-use, and listing them wastes crawl budget on pages that will never
 * serve a searcher.
 *
 * Priorities are set relative to commercial intent rather than left at the
 * default, and lastModified on database-backed pages comes from the row.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/book-appointment`, lastModified: now, changeFrequency: "monthly", priority: 0.95 },
    { url: `${SITE_URL}/services`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_URL}/doctors`, lastModified: now, changeFrequency: "monthly", priority: 0.85 },
    { url: `${SITE_URL}/international-patients`, lastModified: now, changeFrequency: "monthly", priority: 0.85 },
    { url: `${SITE_URL}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/technology`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/smile-gallery`, lastModified: now, changeFrequency: "weekly", priority: 0.75 },
    { url: `${SITE_URL}/testimonials`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/contact`, lastModified: now, changeFrequency: "yearly", priority: 0.8 },
    { url: `${SITE_URL}/faqs`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/blog`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE_URL}/privacy-policy`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/medical-disclaimer`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/patient-rights`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];

  const serviceRoutes: MetadataRoute.Sitemap = SERVICES.map((service) => ({
    url: `${SITE_URL}/services/${service.slug}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.8,
  }));

  // Location landing pages carry the highest commercial intent after booking.
  const landingRoutes: MetadataRoute.Sitemap = SERVICES.filter((s) => s.seo.landingSlug).map(
    (service) => ({
      url: `${SITE_URL}/${service.seo.landingSlug}`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.9,
    }),
  );

  const [posts, doctors] = await Promise.all([
    prisma.blogPost
      .findMany({
        where: { isPublished: true, deletedAt: null },
        select: { slug: true, publishedAt: true, updatedContentAt: true },
      })
      .catch(() => []),
    prisma.doctor
      .findMany({
        where: { isPubliclyListed: true, deletedAt: null },
        select: { slug: true, updatedAt: true },
      })
      .catch(() => []),
  ]);

  const blogRoutes: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: post.updatedContentAt ?? post.publishedAt ?? now,
    changeFrequency: "monthly",
    priority: 0.5,
  }));

  const doctorRoutes: MetadataRoute.Sitemap = doctors.map((doctor) => ({
    url: `${SITE_URL}/doctors/${doctor.slug}`,
    lastModified: doctor.updatedAt,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  return [...staticRoutes, ...landingRoutes, ...serviceRoutes, ...doctorRoutes, ...blogRoutes];
}
