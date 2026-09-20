# SEO migration

The existing chandigarhdentist.com has accumulated ranking over years. A
redesign that changes URLs without redirecting throws that away, and the loss
usually shows up six weeks later when nobody remembers what changed.

## Before launch — non-negotiable

The redirect map in [`data/legacy-redirects.ts`](../data/legacy-redirects.ts) is
a **best-effort starting point built from the old site's known structure**. It
has not been reconciled against the real list of indexed URLs, because that list
has to come from the clinic's own accounts.

**Do this first:**

1. **Google Search Console → Pages → export every indexed URL.** This is the
   authoritative list. Nothing else substitutes for it.
2. **Export the existing XML sitemap** (`/sitemap.xml` on the old site).
3. **Crawl the live site** with Screaming Frog or equivalent, following internal
   links to depth 5.
4. **Export the top 200 landing pages** from the last 12 months of Analytics.
   These are the URLs that actually earn.
5. Combine, deduplicate, and check every one against
   `data/legacy-redirects.ts`.

Any indexed URL not covered will 404 on launch day.

## URL mapping

### Preserved

| Old               | New                                                        |
| ----------------- | ---------------------------------------------------------- |
| `/`               | `/`                                                        |
| `/dental-tourism` | `/dental-tourism` (redirects to `/international-patients`) |
| `/technology`     | `/technology`                                              |
| `/blog`           | `/blog`                                                    |
| `/contact`        | `/contact`                                                 |

### Consolidated

Several old pages covering one topic are merged, with all variants redirecting
to the surviving page. Consolidation is deliberate: three thin pages about
implants compete with each other, and Google picks one anyway.

| Old                                                          | New                         |
| ------------------------------------------------------------ | --------------------------- |
| `/dental-implants`, `/implants`, `/dental-implant`           | `/services/dental-implants` |
| `/cosmetic-dentistry`, `/smile-designing`, `/smile-makeover` | `/services/smile-design`    |
| `/invisalign`, `/clear-aligners`, `/invisible-braces`        | `/services/invisalign`      |
| `/root-canal`, `/root-canal-treatment`, `/rct`               | `/services/root-canal`      |
| `/gallery`, `/photo-gallery`, `/before-after`                | `/smile-gallery`            |
| `/patient-testimonials`, `/reviews`                          | `/testimonials`             |

### New

Location landing pages that did not exist before:

`/dental-implants-chandigarh` · `/smile-design-chandigarh` ·
`/veneers-chandigarh` · `/invisalign-chandigarh` · `/root-canal-chandigarh` ·
`/orthodontist-chandigarh` · `/oral-surgeon-chandigarh`

These are **not** duplicates of the treatment pages. A near-identical page at
two URLs competes with itself and one gets filtered. The treatment page explains
the treatment; the landing page answers a local search — where the clinic is,
who provides it, how to get there. Each canonicalises to itself and they
cross-link.

## What is implemented

| Item                           | Where                                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------- |
| 301 redirects                  | `next.config.ts` via `data/legacy-redirects.ts` — `permanent: true`, since a 302 passes no equity |
| Canonical URLs                 | Every page, through `buildMetadata()`                                                             |
| XML sitemap                    | `src/app/sitemap.ts`, priorities weighted by commercial intent                                    |
| robots.txt                     | `src/app/robots.ts`                                                                               |
| Dentist / LocalBusiness schema | `clinicSchema()` — `aggregateRating` included **only** when a live rating is actually displayed   |
| Physician schema               | Doctor profiles; unverified credentials are omitted rather than asserted                          |
| MedicalProcedure schema        | Treatment and landing pages                                                                       |
| FAQPage schema                 | Rendered from the same array the page displays, so markup and content cannot disagree             |
| MedicalWebPage schema          | Blog posts, with `reviewedBy` and `lastReviewed`                                                  |
| BreadcrumbList                 | Rendered from the same array as the visible breadcrumb                                            |
| OpenGraph / Twitter            | All pages                                                                                         |
| Server rendering               | Everything public is SSR or static                                                                |

## Structured data policy

`aggregateRating` appears in the markup **only when a live rating was fetched
and is visible on the page**. Marking up a rating the visitor cannot see is
against Google's guidelines and risks a manual action. This is enforced in code:
`clinicSchema(rating)` omits the block when `rating` is null, and the same value
feeds the visible badge.

Unverified doctor qualifications are likewise absent from `hasCredential` rather
than asserted.

## Launch day

- [ ] Redirect map reconciled against Search Console (see above)
- [ ] Every redirect tested — `curl -I` each one, confirm `301` and the target
- [ ] Sitemap submitted in Search Console
- [ ] Old sitemap removed
- [ ] Google Business Profile URL updated
- [ ] NAP (name, address, phone) matches the Business Profile **exactly** — a
      mismatched suite number splits local ranking signals
- [ ] `NEXT_PUBLIC_SITE_URL` set to the canonical https domain
- [ ] Non-www → www (or the reverse) redirect at the edge, one canonical host
- [ ] `noindex` verified on `/admin`, `/patient-dashboard`, `/feedback/*`
- [ ] Structured data validated with Google's Rich Results Test
- [ ] Core Web Vitals checked on a real phone on mobile data, not a desktop
- [ ] 404 page tested

## Weeks 1–8 after launch

Watch Search Console **Pages** for a rise in `Not found (404)` and
`Page with redirect`. A 404 spike means a URL was missed — add it to the
redirect map and redeploy.

Impressions typically dip for two to four weeks after a restructure and
recover. A dip that has not recovered by week eight is not settling; it is a
problem, and the first place to look is the redirect map.
