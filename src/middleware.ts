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

function buildCsp(nonce: string, isDev: boolean): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      // Analytics and the payment SDK, both of which must be explicitly allowed
      // rather than covered by a blanket 'unsafe-inline'.
      "https://www.googletagmanager.com",
      "https://www.google-analytics.com",
      "https://checkout.razorpay.com",
      // React Refresh needs eval in development only.
      ...(isDev ? ["'unsafe-eval'"] : []),
    ],
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
    "frame-src": ["'self'", "https://www.google.com", "https://maps.google.com", "https://api.razorpay.com"],
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

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("x-request-id", requestId);
  requestHeaders.set("x-pathname", pathname);

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

  response.headers.set("Content-Security-Policy", buildCsp(nonce, isDev));
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
      source: "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|webp|avif|svg|ico|woff|woff2)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
