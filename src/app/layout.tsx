import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import Script from "next/script";
import { JsonLd } from "@/components/seo/json-ld";
import { env } from "@/lib/env";
import { SITE_NAME, SITE_URL, clinicSchema } from "@/lib/seo";
import { getGoogleRating } from "@/server/integrations/google-places";
import { identity } from "@data/clinic-master-data";
import "./globals.css";

/**
 * Fonts are self-hosted by next/font — no render-blocking request to Google and
 * no third-party font request from the visitor's browser, which also keeps the
 * privacy policy simple.
 */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["SOFT", "WONK"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — Dental Implants & Cosmetic Dentistry in Chandigarh`,
    template: `%s | ${SITE_NAME}`,
  },
  description: identity.description,
  applicationName: SITE_NAME,
  authors: [{ name: SITE_NAME }],
  formatDetection: { telephone: true, address: true, email: true },
  ...(env.GOOGLE_SITE_VERIFICATION
    ? { verification: { google: env.GOOGLE_SITE_VERIFICATION } }
    : {}),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Not locked to 1 — pinch-zoom is an accessibility requirement, and blocking
  // it is a WCAG failure people rarely notice until an audit.
  maximumScale: 5,
  themeColor: "#1f3149",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Fetched once per render pass and cached; the clinic schema only carries a
  // rating when one is genuinely available.
  const rating = await getGoogleRating();

  return (
    <html lang="en-IN" className={`${inter.variable} ${fraunces.variable}`}>
      <body>
        <a
          href="#main"
          className="sr-only-focusable absolute top-2 left-2 z-50 rounded-lg bg-[--color-action] px-4 py-2 text-sm font-semibold text-white"
        >
          Skip to main content
        </a>

        {children}

        <JsonLd data={clinicSchema(rating)} />

        {env.NEXT_PUBLIC_GA_ID ? (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${env.NEXT_PUBLIC_GA_ID}`}
              strategy="afterInteractive"
            />
            <Script id="ga-init" strategy="afterInteractive">
              {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${env.NEXT_PUBLIC_GA_ID}',{anonymize_ip:true});`}
            </Script>
          </>
        ) : null}
      </body>
    </html>
  );
}
