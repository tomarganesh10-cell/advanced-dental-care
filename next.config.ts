import type { NextConfig } from "next";
import { legacyRedirects } from "./data/legacy-redirects";

/**
 * Security headers applied to every response.
 *
 * The Content-Security-Policy is set per-request in src/middleware.ts, where a
 * nonce can be generated; a static header here could not carry one. Everything
 * that does not need a nonce is set here so it applies to static assets too.
 */
const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self), payment=(self)",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  /**
   * Emits .next/standalone/server.js alongside the normal build.
   *
   * Managed Node hosts (Hostinger's Node.js app among them) ask for an "entry
   * file" and run it directly rather than invoking `next start`. Without this
   * there is no such file to name. It is additive — `next start` and the Docker
   * image are unaffected — and it also trims the deployed node_modules to what
   * the server actually imports.
   */
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  productionBrowserSourceMaps: false,
  serverExternalPackages: ["@node-rs/argon2", "pino", "ioredis", "pg"],
  typescript: { ignoreBuildErrors: false },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "**.amazonaws.com" },
      { protocol: "https", hostname: "**.r2.cloudflarestorage.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // Never let a patient document or portal page be cached by a proxy.
        source: "/(patient-dashboard|admin|api)/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, private" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
    ];
  },
  async redirects() {
    // Legacy URL map from the previous site. See docs/SEO_MIGRATION.md.
    return legacyRedirects;
  },
};

export default nextConfig;
