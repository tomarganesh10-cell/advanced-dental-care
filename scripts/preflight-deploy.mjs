/**
 * Pre-build check for a managed Node host.
 *
 * Runs before `prisma migrate deploy` so a missing variable produces a sentence
 * someone can act on, instead of a Prisma stack trace reading
 * "Cannot resolve environment variable: DATABASE_URL" — which is accurate and
 * tells a non-developer nothing about what to do next.
 *
 * It only reads configuration. It never prints a secret's value, because build
 * logs are retained by the host and are often shareable.
 */

const REQUIRED = [
  {
    name: "DATABASE_URL",
    why: "the PostgreSQL connection string the app and migrations both use",
    check: (v) =>
      v.startsWith("postgres://") || v.startsWith("postgresql://")
        ? null
        : "should start with postgresql://",
  },
  {
    name: "AUTH_SECRET",
    why: "signs session cookies; the app refuses to start without it",
    check: (v) => (v.length >= 32 ? null : "looks too short — needs 32+ characters"),
  },
  {
    name: "NEXT_PUBLIC_SITE_URL",
    why: "builds canonical URLs, the sitemap and every link in an email",
    check: (v) => {
      if (!v.startsWith("https://")) return "must start with https:// (not http://)";
      if (v.endsWith("/")) return "must not end with a trailing slash";
      return null;
    },
  },
];

const OPTIONAL = [
  { name: "CRON_SECRET", why: "without it /api/cron/drain refuses every request, so no reminder or confirmation is ever sent" },
  { name: "REDIS_URL", why: "absent is fine on a single instance; the rate limiter falls back in-process" },
  { name: "STORAGE_BUCKET", why: "absent means patient document upload is unavailable; there is no local-disk fallback" },
];

const missing = [];
const malformed = [];

for (const item of REQUIRED) {
  const value = process.env[item.name];
  if (!value || value.trim() === "") {
    missing.push(item);
    continue;
  }
  const problem = item.check(value.trim());
  if (problem) malformed.push({ ...item, problem });
}

console.log("\nDeployment preflight\n");

for (const item of REQUIRED) {
  const value = process.env[item.name];
  const status = !value || value.trim() === "" ? "MISSING" : "set";
  console.log(`  ${status.padEnd(8)} ${item.name}`);
}
for (const item of OPTIONAL) {
  const value = process.env[item.name];
  console.log(`  ${(value ? "set" : "unset").padEnd(8)} ${item.name}   (optional)`);
  if (!value) console.log(`           ↳ ${item.why}`);
}

if (malformed.length > 0) {
  console.error("\nSome values look wrong:\n");
  for (const item of malformed) {
    console.error(`  ${item.name}: ${item.problem}`);
  }
}

if (missing.length > 0) {
  console.error("\nThese are not set, so the build cannot continue:\n");
  for (const item of missing) {
    console.error(`  ${item.name}\n    ${item.why}`);
  }

  console.error(`
Add them in your host's Environment Variables screen, then deploy again.

If they ARE set in the panel and this still says MISSING, the host does not
expose environment variables during the build step. That is common, and the fix
is to create the database tables once from your own machine instead:

    npx prisma migrate deploy

...with DATABASE_URL set in that shell. Then change the build command from
'npm run hostinger-build' to 'npm run build:standalone', which skips migrations.
`);
  process.exit(1);
}

if (malformed.length > 0) process.exit(1);

console.log("\nPreflight passed.\n");
