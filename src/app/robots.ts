import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

/**
 * robots.txt
 *
 * Everything patient-facing and private is disallowed. Note that this is a
 * crawl directive, not access control — the portal and admin are protected by
 * authentication and by `X-Robots-Tag: noindex` headers set in next.config.ts.
 * A robots.txt entry alone would advertise the paths rather than protect them,
 * which is why the sensitive routes are also noindexed at the header level.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin",
          "/admin/",
          "/patient-dashboard",
          "/patient-dashboard/",
          "/patient-login",
          "/staff-login",
          "/feedback/",
          "/booking-confirmed",
          "/_next/",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
