import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge middleware: CSP, request id, and a cheap auth pre-check.
 *
 * What this is NOT: authorisation. Middleware sees a URL, not the row being
 * read, and a cookie's presence is not proof it is valid. Every protected page
 * and API route calls a guard from src/server/auth/guards.ts that resolves the
 * session against the database. The check here only avoids rendering a shell
 * for an obviously signed-out visitor.
 *
 * The CSP is built per-request because script-src carries a nonce, which a
 * static header in next.config.ts cannot do.
 */

const STAFF_COOKIE = "adcc_staff_session";
const PATIENT_COOKIE = "adcc_patient_session";

/**
 * Routes whose pages are all server-rendered per request.
 *
 * This list is load-bearing, not decorative — see the note on `scriptSrc`.
 * Every route under these prefixes is `ƒ` in the build output. If a page here
 * ever becomes statically prerendered, its scripts will be blocked and the page
 * will render but never hydrate.
 */
const DYNAMIC_PREFIXES = ["/admin", "/patient-dashboard"];

/**
 * Chooses the script policy for this request.
 *
 * The strong policy — a per-request nonce plus 'strict-dynamic' — can only work
 * on a page rendered per request, because the nonce has to be minted while the
 * request exists. A statically prerendered page is built long before anyone
 * asks for it, so Next emits its script tags with no nonce at all; serving the
 * nonce policy alongside them blocks every script on the page. The page
 * server-renders correctly and then sits there, unhydrated, forever. This is a
 * known Next.js limitation, not a configuration mistake:
 * https://nextjs.org/docs/app/guides/content-security-policy
 *
 * So the policy is chosen per route. Admin and the patient portal — everything
 * that touches a patient record — are dynamic, and keep the strong policy.
 * The public marketing pages are prerendered for speed and search ranking, and
 * fall back to allowing inline scripts.
 *
 * That fallback is a real reduction in defence-in-depth for those pages, and
 * worth being clear about: it means an injected inline <script> would execute.
 * What keeps it tolerable is that the public pages render clinic content the
 * clinic itself authored, `object-src`, `base-uri`, `form-action` and
 * `frame-ancestors` stay locked down, and the pages that render patient data
 * are not covered by it.
 */
function scriptSrc(nonce: string, isDev: boolean, useNonce: boolean): string[] {
  const sources = [
    "'self'",
    // Analytics and the payment SDK, explicitly allowed rather than covered by
    // a blanket wildcard.
    "https://www.googletagmanager.com",
    "https://www.google-analytics.com",
    "https://checkout.razorpay.com",
    // React Refresh needs eval in development only.
    ...(isDev ? ["'unsafe-eval'"] : []),
  ];

  if (useNonce) {
    // 'strict-dynamic' makes the allowlist above redundant for scripts loaded
    // by trusted scripts, which is the point: only what the nonce vouches for
    // runs. A browser that honours the nonce ignores 'unsafe-inline' entirely,
    // so the two must not be combined.
    return ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...sources.slice(1)];
  }

  return [...sources, "'unsafe-inline'"];
}

function buildCsp(nonce: string, isDev: boolean, useNonce: boolean): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": scriptSrc(nonce, isDev, useNonce),
    // Next inlines critical CSS, which requires unsafe-inline for styles. This
    // is the one relaxation, and it is style-src, not script-src — the
    // difference matters: inline styles cannot execute.
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "font-src": ["'self'", "data:"],
    "connect-src": [
      "'self'",
      "https://www.google-analytics.com",
      "https://region1.google-analytics.com",
      "https://lumberjack.razorpay.com",
      ...(isDev ? ["ws:", "wss:"] : []),
    ],
    // Maps embed and the Razorpay checkout iframe.
    "frame-src": [
      "'self'",
      "https://www.google.com",
      "https://maps.google.com",
      "https://api.razorpay.com",
    ],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    "upgrade-insecure-requests": [],
  };

  return Object.entries(directives)
    .map(([key, values]) => (values.length > 0 ? `${key} ${values.join(" ")}` : key))
    .join("; ");
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const isDev = process.env.NODE_ENV === "development";

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const requestId = crypto.randomUUID();

  // Only routes that are rendered per request can carry a nonce.
  const useNonce = DYNAMIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  const csp = buildCsp(nonce, isDev, useNonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("x-request-id", requestId);
  requestHeaders.set("x-pathname", pathname);
  /**
   * Next reads the nonce from the CSP on the REQUEST, not from `x-nonce`, and
   * stamps it onto every script tag it emits. Setting the policy only on the
   * response produces a page whose scripts carry no nonce and are therefore all
   * refused — a site that server-renders correctly and then never hydrates.
   * Development hides this, so it only shows up in a production build.
   */
  requestHeaders.set("Content-Security-Policy", csp);

  // --- signed-out redirects (convenience only, never the security boundary) --
  if (pathname.startsWith("/admin") && !request.cookies.has(STAFF_COOKIE)) {
    const url = request.nextUrl.clone();
    url.pathname = "/staff-login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith("/patient-dashboard") && !request.cookies.has(PATIENT_COOKIE)) {
    const url = request.nextUrl.clone();
    url.pathname = "/patient-login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Request-Id", requestId);

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image optimisation, which do not need
     * a CSP header of their own and would only add latency.
     */
    {
      source:
        "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|webp|avif|svg|ico|woff|woff2)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
