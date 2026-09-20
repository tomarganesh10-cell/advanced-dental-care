/**
 * Smoke check against a RUNNING instance, not a test-double.
 *
 * Run it after a deploy:
 *   BASE=https://chandigarhdentist.com node scripts/verify-admin-routes.mjs
 *
 * Requires seeded demo accounts, so it is a staging/development tool. It exists
 * because a permission boundary that holds in a unit test and not in the
 * deployed app is the failure that matters.
 */
// Signs in as the seeded admin, then fetches every admin route and reports
// the status. Catches runtime errors that a build cannot.
const BASE = process.env.BASE || "http://localhost:3000";

const ROUTES = [
  "/admin",
  "/admin/front-desk",
  "/admin/calendar",
  "/admin/appointments",
  "/admin/patients",
  "/admin/clinical",
  "/admin/documents",
  "/admin/leads",
  "/admin/international",
  "/admin/feedback",
  "/admin/invoices",
  "/admin/payments",
  "/admin/staff",
  "/admin/attendance",
  "/admin/schedules",
  "/admin/content-verification",
  "/admin/blog",
  "/admin/gallery",
  "/admin/testimonials",
  "/admin/reports",
  "/admin/notifications",
  "/admin/audit",
  "/admin/settings",
];

const login = await fetch(`${BASE}/api/auth/staff-login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email: process.env.SEED_ADMIN_EMAIL || "admin@example.com",
    password: process.env.SEED_ADMIN_PASSWORD || "ChangeMe!Dev123",
  }),
  redirect: "manual",
});

const loginBody = await login.json();
if (!loginBody.ok) {
  console.error("LOGIN FAILED:", JSON.stringify(loginBody));
  process.exit(1);
}

const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");

if (!cookie) {
  console.error("No session cookie returned");
  process.exit(1);
}

console.log("Signed in OK\n");

let failures = 0;
for (const route of ROUTES) {
  const res = await fetch(`${BASE}${route}`, { headers: { cookie }, redirect: "manual" });
  const mark = res.status === 200 ? "ok  " : "FAIL";
  if (res.status !== 200) failures += 1;
  console.log(`${mark} ${String(res.status).padEnd(4)} ${route}`);
}

console.log(`\n${ROUTES.length - failures}/${ROUTES.length} admin routes render.`);
process.exit(failures > 0 ? 1 : 0);
