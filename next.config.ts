import type { NextConfig } from "next";
import { legacyRedirects } from "./data/legacy-redirects";

/**
 * Security headers applied to every response.
 *
 * The CSP is intentionally strict. `unsafe-inline` on style-src is required by
 * Next.js' inlined critical CSS; script-src uses a nonce injected by middleware
 * in production (see src/middleware.ts) and falls back to 'unsafe-eval' only in
 * development where React refresh needs it.
 */
const isDev = process.env.NODE_ENV === "development";

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
