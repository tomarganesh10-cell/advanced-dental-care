import { prisma } from "@/lib/db";
import { env, features } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Live Google rating and review count.
 *
 * This replaces the previous site's hardcoded "4.9 / 1,514", which was stale
 * the day it was typed and had no way of ever being right again.
 *
 * Behaviour when anything goes wrong — no API key, quota exhausted, Google
 * down — is to return `null`, and every component that consumes this renders
 * nothing in that case. A missing star rating is a cosmetic gap. A wrong one is
 * a false claim on a medical website, and it is also the exact thing a
 * competitor would screenshot.
 *
 * The cache is in Postgres rather than only in Redis so the rating survives a
 * Redis restart and so it is visible/auditable to the clinic.
 */

export interface GoogleRating {
  ratingValue: number;
  reviewCount: number;
  fetchedAt: Date;
  /** True when served from cache past its TTL because a refresh failed. */
  isStale: boolean;
}

const CACHE_KEY = "google_places_rating";

interface PlacesResponse {
  rating?: number;
  userRatingCount?: number;
  error?: { message?: string };
}

async function fetchFromGoogle(): Promise<{ ratingValue: number; reviewCount: number } | null> {
  if (!env.GOOGLE_PLACES_API_KEY || !env.GOOGLE_PLACE_ID) return null;

  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(env.GOOGLE_PLACE_ID)}`;

  try {
    const response = await fetch(url, {
      headers: {
        "X-Goog-Api-Key": env.GOOGLE_PLACES_API_KEY,
        "X-Goog-FieldMask": "rating,userRatingCount",
      },
      signal: AbortSignal.timeout(8_000),
      // Next's fetch cache is bypassed; our own cache below is the one that
      // matters and it is shared across instances.
      cache: "no-store",
    });

    if (!response.ok) {
      logger.warn({ status: response.status }, "google places request failed");
      return null;
    }

    const json = (await response.json()) as PlacesResponse;

    if (typeof json.rating !== "number" || typeof json.userRatingCount !== "number") {
      return null;
    }

    return { ratingValue: json.rating, reviewCount: json.userRatingCount };
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "google places request errored");
    return null;
  }
}

export async function getGoogleRating(): Promise<GoogleRating | null> {
  if (!features.googleReviews) return null;

  const cached = await prisma.integrationCache
    .findUnique({ where: { key: CACHE_KEY } })
    .catch(() => null);

  const now = Date.now();

  if (cached && cached.expiresAt.getTime() > now) {
    const value = cached.value as { ratingValue?: number; reviewCount?: number };
    if (typeof value.ratingValue === "number" && typeof value.reviewCount === "number") {
      return {
        ratingValue: value.ratingValue,
        reviewCount: value.reviewCount,
        fetchedAt: cached.fetchedAt,
        isStale: false,
      };
    }
  }

  const fresh = await fetchFromGoogle();

  if (!fresh) {
    // Serve a stale cached value rather than nothing — a rating from six hours
    // ago is still true, and losing the whole section because Google timed out
    // would be a worse outcome than a slightly old count.
    if (cached) {
      const value = cached.value as { ratingValue?: number; reviewCount?: number };
      if (typeof value.ratingValue === "number" && typeof value.reviewCount === "number") {
        return {
          ratingValue: value.ratingValue,
          reviewCount: value.reviewCount,
          fetchedAt: cached.fetchedAt,
          isStale: true,
        };
      }
    }
    return null;
  }

  const expiresAt = new Date(now + env.GOOGLE_PLACES_CACHE_TTL * 1000);

  await prisma.integrationCache
    .upsert({
      where: { key: CACHE_KEY },
      create: { key: CACHE_KEY, value: fresh, fetchedAt: new Date(), expiresAt },
      update: { value: fresh, fetchedAt: new Date(), expiresAt },
    })
    .catch((err: unknown) =>
      logger.warn({ err: (err as Error).message }, "could not cache google rating"),
    );

  return { ...fresh, fetchedAt: new Date(), isStale: false };
}

/** Public URL for "read all reviews". Null when no place id is configured. */
export function googleReviewsUrl(): string | null {
  if (!env.GOOGLE_PLACE_ID) return null;
  return `https://search.google.com/local/reviews?placeid=${encodeURIComponent(env.GOOGLE_PLACE_ID)}`;
}

export function googleWriteReviewUrl(): string | null {
  if (!env.GOOGLE_PLACE_ID) return null;
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(env.GOOGLE_PLACE_ID)}`;
}
