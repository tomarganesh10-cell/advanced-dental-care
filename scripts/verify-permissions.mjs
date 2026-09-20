/**
 * Smoke check against a RUNNING instance, not a test-double.
 *
 * Run it after a deploy:
 *   BASE=https://chandigarhdentist.com node scripts/verify-permissions.mjs
 *
 * Requires seeded demo accounts, so it is a staging/development tool. It exists
 * because a permission boundary that holds in a unit test and not in the
 * deployed app is the failure that matters.
 */
/**
 * Verifies permission boundaries in the RUNNING app.
 *
 * Asserts on the CONTENT served, not the status code. Next resolves a server
 * component redirect internally and returns 200 with the destination rendered,
 * so status alone cannot distinguish "allowed" from "refused" — and asserting
 * on it gives a false failure, which is what a first version of this script
 * did.
 */
const BASE = process.env.BASE || "http://localhost:3000";

async function signIn(email, password) {
  const res = await fetch(`${BASE}/api/auth/staff-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    redirect: "manual",
  });
  const body = await res.json();
  if (!body.ok) throw new Error(`login failed for ${email}: ${JSON.stringify(body)}`);
  return (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
}

/**
 * How a refusal looks on the wire.
 *
 * `redirect()` in a Server Component does not produce a 3xx here. Next returns
 * a 200 document carrying a client-side redirect directive to /admin/no-access,
 * and the browser navigates. What matters for security is that the protected
 * page never rendered, so the check is: the redirect directive is present AND
 * none of the page's own content is in the payload.
 */
const REFUSAL_MARKER = "/admin/no-access";

/** A marker that appears ONLY when the protected page itself rendered. */
const PAGE_MARKERS = {
  "/admin/clinical": "Clinical activity",
  "/admin/documents": "Patient documents",
  "/admin/audit": "Audit log",
  "/admin/content-verification": "Content verification",
  "/admin/patients": "Patient records",
  "/admin/payments": "Only server-verified payments",
  "/admin/invoices": "Outstanding",
  "/admin/leads": "Every website, phone and walk-in",
  "/admin/front-desk": "Front desk",
  "/admin/appointments": "appointment",
  "/admin/blog": "Health content",
  "/admin/gallery": "Smile gallery",
};

async function fetchPage(route, cookie) {
  const res = await fetch(`${BASE}${route}`, { headers: { cookie }, redirect: "manual" });
  const text = await res.text();
  return {
    refused: text.includes(REFUSAL_MARKER),
    rendered: PAGE_MARKERS[route] ? text.includes(PAGE_MARKERS[route]) : res.status === 200,
  };
}

const password = process.env.SEED_ADMIN_PASSWORD || "ChangeMe!Dev123";

const cases = [
  {
    who: "reception@example.com",
    role: "RECEPTIONIST",
    allowed: ["/admin/front-desk", "/admin/appointments", "/admin/patients", "/admin/leads"],
    refused: ["/admin/clinical", "/admin/documents", "/admin/audit", "/admin/content-verification"],
  },
  {
    who: "marketing@example.com",
    role: "MARKETING",
    allowed: ["/admin/leads", "/admin/blog", "/admin/gallery"],
    refused: ["/admin/patients", "/admin/clinical", "/admin/audit", "/admin/payments"],
  },
  {
    who: "accounts@example.com",
    role: "ACCOUNTANT",
    allowed: ["/admin/invoices", "/admin/payments", "/admin/patients"],
    refused: ["/admin/clinical", "/admin/audit", "/admin/content-verification"],
  },
  {
    who: "doctor@example.com",
    role: "DOCTOR",
    allowed: ["/admin/clinical", "/admin/patients", "/admin/documents"],
    refused: ["/admin/audit", "/admin/content-verification"],
  },
];

let failures = 0;

for (const testCase of cases) {
  const cookie = await signIn(testCase.who, password);
  console.log(`\n${testCase.role}`);

  for (const route of testCase.allowed) {
    const { refused, rendered } = await fetchPage(route, cookie);
    const ok = rendered && !refused;
    if (!ok) failures += 1;
    console.log(`  ${ok ? "ok  " : "FAIL"} may see      ${route}`);
  }

  for (const route of testCase.refused) {
    const { refused, rendered } = await fetchPage(route, cookie);
    // Refused correctly: the no-access page rendered and the protected page
    // content did not.
    const ok = refused && !rendered;
    if (!ok) failures += 1;
    console.log(
      `  ${ok ? "ok  " : "FAIL"} must not see  ${route}${!ok ? ` (refused=${refused} rendered=${rendered})` : ""}`,
    );
  }
}

console.log(
  failures === 0
    ? "\nEvery permission boundary held in the running application."
    : `\n${failures} boundary failure(s).`,
);
process.exit(failures > 0 ? 1 : 0);
