import { logger } from "./logger";

/**
 * Database reads that must not fail a production build.
 *
 * Several public pages are statically prerendered, and the build renders them
 * by actually running their queries. That makes `next build` depend on the
 * database — so a first deploy against an empty schema, or a build that happens
 * while the database is briefly unreachable, kills the whole build with
 * "The table public.testimonials does not exist".
 *
 * Which is the wrong failure. Those pages all already handle having nothing to
 * show; a clinic with no testimonials yet renders a page without a testimonials
 * section, and that is correct. There is no reason the build should stop.
 *
 * So during the build only, a failed read falls back to the empty value and
 * logs it. At runtime the error is rethrown unchanged — a live page failing to
 * reach the database is a real problem and must not be swallowed.
 *
 * Next sets NEXT_PHASE itself; nothing here needs configuring.
 */
export function isBuildPhase(): boolean {
  return process.env.NEXT_PHASE === "phase-production-build";
}

export async function prerenderSafe<T>(
  read: () => Promise<T>,
  fallback: T,
  label: string,
): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (!isBuildPhase()) throw error;

    logger.warn(
      { label, err: (error as Error).message },
      "database read failed during build; prerendering this page without it",
    );
    return fallback;
  }
}
