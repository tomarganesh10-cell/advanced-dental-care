import type { Metadata } from "next";
import { env } from "./env";
import { contact, identity, openingHours } from "@data/clinic-master-data";
import { publicValue } from "@data/verification";

/**
 * SEO metadata and schema.org helpers.
 *
 * Two rules run through this file:
 *  - every page declares a canonical URL, because a clinic site accumulates
 *    duplicate paths (trailing slashes, UTM-tagged shares) faster than anything
 *    else and duplicates split ranking signals;
 *  - structured data only ever contains facts that are VERIFIED in the master
 *    data. Google's structured data policies treat marked-up claims as
 *    assertions, and an aggregateRating in JSON-LD that does not match a real,
 *    visible rating is a manual-action risk.
 */

export const SITE_NAME = identity.displayName;
export const SITE_URL = env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");

export interface PageMetaInput {
  title: string;
  description: string;
  path: string;
  ogImage?: string;
  noIndex?: boolean;
  keywords?: string[];
  type?: "website" | "article";
  publishedTime?: string;
  modifiedTime?: string;
}

export function buildMetadata(input: PageMetaInput): Metadata {
  const url = `${SITE_URL}${input.path === "/" ? "" : input.path}`;
  const ogImage = input.ogImage ?? `${SITE_URL}/og-default.png`;

  return {
    title: input.title,
    description: input.description,
    keywords: input.keywords,
    alternates: { canonical: url },
    robots: input.noIndex
      ? { index: false, follow: false, nocache: true }
      : { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
    openGraph: {
      title: input.title,
      description: input.description,
      url,
      siteName: SITE_NAME,
      locale: "en_IN",
      type: input.type ?? "website",
      images: [{ url: ogImage, width: 1200, height: 630, alt: input.title }],
      ...(input.publishedTime ? { publishedTime: input.publishedTime } : {}),
      ...(input.modifiedTime ? { modifiedTime: input.modifiedTime } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: input.title,
      description: input.description,
      images: [ogImage],
    },
  };
}

// --- structured data --------------------------------------------------------

const DAY_SCHEMA = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export interface RatingData {
  ratingValue: number;
  reviewCount: number;
}

/**
 * Dentist schema for the clinic.
 *
 * `aggregateRating` is included ONLY when a live rating was actually fetched
 * and is being displayed on the page. Marking up a rating the visitor cannot
 * see is against Google's guidelines.
 */
export function clinicSchema(rating?: RatingData | null): Record<string, unknown> {
  const geo = publicValue(contact.geo);
  const hours = openingHours.value;

  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Dentist",
    "@id": `${SITE_URL}/#clinic`,
    name: identity.legalName,
    description: identity.description,
    url: SITE_URL,
    telephone: contact.phone.e164,
    email: contact.email.primary,
    address: {
      "@type": "PostalAddress",
      streetAddress: `${contact.address.line1}, ${contact.address.line2}`,
      addressLocality: contact.address.city,
      addressRegion: contact.address.state,
      postalCode: contact.address.postalCode,
      addressCountry: contact.address.countryCode,
    },
    openingHoursSpecification: hours
      .filter((h) => h.opens && h.closes)
      .map((h) => ({
        "@type": "OpeningHoursSpecification",
        dayOfWeek: `https://schema.org/${DAY_SCHEMA[h.dayOfWeek]}`,
        opens: h.opens,
        closes: h.closes,
      })),
    medicalSpecialty: "Dentistry",
    availableService: [
      "Dental Implants",
      "Cosmetic Dentistry",
      "Orthodontics",
      "Endodontics",
      "Oral Surgery",
      "Paediatric Dentistry",
    ].map((name) => ({ "@type": "MedicalProcedure", name })),
  };

  if (geo) {
    schema.geo = { "@type": "GeoCoordinates", latitude: geo.latitude, longitude: geo.longitude };
  }

  if (rating && rating.reviewCount > 0) {
    schema.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: rating.ratingValue,
      reviewCount: rating.reviewCount,
      bestRating: 5,
      worstRating: 1,
    };
  }

  return schema;
}

export interface BreadcrumbItem {
  name: string;
  path: string;
}

export function breadcrumbSchema(items: BreadcrumbItem[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${SITE_URL}${item.path === "/" ? "" : item.path}`,
    })),
  };
}

export function faqSchema(
  faqs: Array<{ question: string; answer: string }>,
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };
}

export function serviceSchema(input: {
  name: string;
  description: string;
  path: string;
}): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "MedicalProcedure",
    name: input.name,
    description: input.description,
    url: `${SITE_URL}${input.path}`,
    provider: { "@id": `${SITE_URL}/#clinic` },
  };
}

/**
 * Physician schema for a dentist profile.
 *
 * Qualifications and memberships come through `publicValue`, so an unverified
 * credential is absent from the markup rather than asserted to Google.
 */
export function physicianSchema(input: {
  name: string;
  slug: string;
  qualifications?: string[];
  specialties: string[];
  description: string;
  imageUrl?: string | null;
}): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Physician",
    "@id": `${SITE_URL}/doctors/${input.slug}#physician`,
    name: input.name,
    url: `${SITE_URL}/doctors/${input.slug}`,
    medicalSpecialty: input.specialties.length > 0 ? input.specialties : "Dentistry",
    description: input.description,
    worksFor: { "@id": `${SITE_URL}/#clinic` },
    address: {
      "@type": "PostalAddress",
      streetAddress: `${contact.address.line1}, ${contact.address.line2}`,
      addressLocality: contact.address.city,
      postalCode: contact.address.postalCode,
      addressCountry: contact.address.countryCode,
    },
  };

  if (input.qualifications?.length) {
    schema.hasCredential = input.qualifications.map((credential) => ({
      "@type": "EducationalOccupationalCredential",
      credentialCategory: "degree",
      name: credential,
    }));
  }

  if (input.imageUrl) schema.image = input.imageUrl;

  return schema;
}

export function articleSchema(input: {
  title: string;
  description: string;
  slug: string;
  publishedAt: Date;
  updatedAt?: Date | null;
  authorName: string;
  reviewerName?: string | null;
  reviewedAt?: Date | null;
  imageUrl?: string | null;
}): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "MedicalWebPage",
    headline: input.title,
    description: input.description,
    url: `${SITE_URL}/blog/${input.slug}`,
    datePublished: input.publishedAt.toISOString(),
    dateModified: (input.updatedAt ?? input.publishedAt).toISOString(),
    author: { "@type": "Person", name: input.authorName },
    publisher: { "@id": `${SITE_URL}/#clinic` },
  };

  // Naming the clinician who checked the content is a YMYL trust signal and
  // the honest thing to publish on health content.
  if (input.reviewerName) {
    schema.reviewedBy = { "@type": "Person", name: input.reviewerName };
    if (input.reviewedAt) schema.lastReviewed = input.reviewedAt.toISOString();
  }

  if (input.imageUrl) schema.image = input.imageUrl;

  return schema;
}
