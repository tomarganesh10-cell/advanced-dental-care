import { describe, expect, it } from "vitest";

import legacyRedirects from "@data/legacy-redirects";

/**
 * The legacy redirect table is consumed verbatim by next.config.ts. A bad row
 * there does not fail the build - it breaks a live URL, which is exactly what
 * the table exists to prevent.
 */
describe("legacy redirects", () => {
  it("never points a URL at itself", () => {
    const loops = legacyRedirects.filter((r) => r.source === r.destination);
    expect(loops).toEqual([]);
  });

  it("never chains one redirect into another", () => {
    const sources = new Set(legacyRedirects.map((r) => r.source));
    const chained = legacyRedirects
      .filter((r) => sources.has(r.destination))
      .map((r) => `${r.source} -> ${r.destination}`);
    expect(chained).toEqual([]);
  });

  it("maps each source exactly once", () => {
    const seen = new Set<string>();
    const duplicates = legacyRedirects
      .map((r) => r.source)
      .filter((source) => !seen.add(source));
    expect(duplicates).toEqual([]);
  });

  it("uses absolute paths and permanent status", () => {
    for (const redirect of legacyRedirects) {
      expect(redirect.source.startsWith("/")).toBe(true);
      expect(redirect.destination.startsWith("/")).toBe(true);
      expect(redirect.permanent).toBe(true);
    }
  });
});
