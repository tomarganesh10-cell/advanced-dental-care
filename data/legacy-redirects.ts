/**
 * 301 redirect map from the previous chandigarhdentist.com URL structure.
 *
 * Loaded by next.config.ts. Every entry is `permanent: true` — a 301 passes
 * link equity, a 302 does not.
 *
 * IMPORTANT: this map is a best-effort starting point built from the old site's
 * known structure. Before launch it MUST be reconciled against the real list of
 * indexed URLs from:
 *   1. Google Search Console → Pages → "Indexed" export
 *   2. The existing XML sitemap
 *   3. A crawl of the live site (Screaming Frog or equivalent)
 *   4. Top landing pages from the last 12 months of Analytics
 *
 * Any indexed URL not covered here will 404 on launch and lose its ranking.
 * See docs/SEO_MIGRATION.md for the procedure.
 */

export interface LegacyRedirect {
  source: string;
  destination: string;
  permanent: boolean;
}

const map: Array<[string, string]> = [
  // --- top-level pages -------------------------------------------------
  ["/index.html", "/"],
  ["/home", "/"],
  ["/about-us", "/about"],
  ["/aboutus", "/about"],
  ["/about-us.html", "/about"],
  ["/our-team", "/doctors"],
  ["/our-doctors", "/doctors"],
  ["/doctor", "/doctors"],
  ["/dr-anshu-gupta", "/doctors/dr-anshu-gupta"],
  ["/contact-us", "/contact"],
  ["/contactus", "/contact"],
  ["/contact-us.html", "/contact"],
  ["/appointment", "/book-appointment"],
  ["/book-an-appointment", "/book-appointment"],
  ["/make-an-appointment", "/book-appointment"],

  // --- services --------------------------------------------------------
  ["/our-services", "/services"],
  ["/treatments", "/services"],
  ["/services.html", "/services"],
  ["/dental-implants", "/services/dental-implants"],
  ["/implants", "/services/dental-implants"],
  ["/dental-implant", "/services/dental-implants"],
  ["/all-on-4", "/services/all-on-4"],
  ["/all-on-four", "/services/all-on-4"],
  ["/bone-graft", "/services/bone-grafting"],
  ["/sinus-lift", "/services/bone-grafting"],
  ["/cosmetic-dentistry", "/services/smile-design"],
  ["/smile-designing", "/services/smile-design"],
  ["/smile-makeover", "/services/smile-design"],
  ["/dental-veneers", "/services/veneers"],
  ["/laminates", "/services/veneers"],
  ["/teeth-whitening", "/services/teeth-whitening"],
  ["/bleaching", "/services/teeth-whitening"],
  ["/crowns", "/services/crowns-bridges"],
  ["/crown-bridge", "/services/crowns-bridges"],
  ["/full-mouth-rehabilitation", "/services/full-mouth-rehabilitation"],
  ["/full-mouth-reconstruction", "/services/full-mouth-rehabilitation"],
  ["/invisalign", "/services/invisalign"],
  ["/clear-aligners", "/services/invisalign"],
  ["/invisible-braces", "/services/invisalign"],
  ["/braces", "/services/braces"],
  ["/orthodontics", "/services/braces"],
  ["/root-canal", "/services/root-canal"],
  ["/root-canal-treatment", "/services/root-canal"],
  ["/rct", "/services/root-canal"],
  ["/general-dentistry", "/services/general-dentistry"],
  ["/scaling", "/services/general-dentistry"],
  ["/teeth-cleaning", "/services/general-dentistry"],
  ["/gum-treatment", "/services/gum-treatment"],
  ["/periodontics", "/services/gum-treatment"],
  ["/wisdom-teeth", "/services/wisdom-tooth-removal"],
  ["/wisdom-tooth-extraction", "/services/wisdom-tooth-removal"],
  ["/oral-surgery", "/services/wisdom-tooth-removal"],
  ["/extraction", "/services/extractions"],
  ["/kids-dentistry", "/services/pediatric-dentistry"],
  ["/pedodontics", "/services/pediatric-dentistry"],
  ["/child-dentistry", "/services/pediatric-dentistry"],

  // --- content ---------------------------------------------------------
  ["/gallery", "/smile-gallery"],
  ["/photo-gallery", "/smile-gallery"],
  ["/before-after", "/smile-gallery"],
  ["/patient-testimonials", "/testimonials"],
  ["/reviews", "/testimonials"],
  ["/videos", "/video-testimonials"],
  ["/video-gallery", "/video-testimonials"],
  ["/dental-tourism", "/dental-tourism"],
  ["/international-patients", "/international-patients"],
  ["/technology", "/technology"],
  ["/facilities", "/technology"],
  ["/blogs", "/blog"],
  ["/news", "/blog"],
  ["/faq", "/faqs"],
  ["/faqs.html", "/faqs"],
  ["/privacy", "/privacy-policy"],
  ["/sitemap.html", "/sitemap.xml"],
];

export const legacyRedirects: LegacyRedirect[] = map.map(([source, destination]) => ({
  source,
  destination,
  permanent: true,
}));

export default legacyRedirects;
