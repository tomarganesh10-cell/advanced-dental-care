/**
 * Creates the first administrator, and nothing else.
 *
 * This is the one seeding operation that is safe against a live clinic
 * database, so unlike `prisma/seed.ts` it does not refuse to run in production
 * — that is the entire point of it existing separately. It creates no demo
 * patients, no demo staff, no appointments and no sample content.
 *
 *   SEED_ADMIN_EMAIL='you@clinic.com' \
 *   SEED_ADMIN_PASSWORD='<a real password>' \
 *   npx tsx prisma/seed-admin.ts
 *
 * Running it again against an existing account updates that account's password
 * rather than creating a second one, which makes it usable as a password reset
 * of last resort when nobody can get in.
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "@node-rs/argon2";

import { PrismaClient } from "../src/generated/prisma/client.js";

const DATABASE_URL = process.env.DATABASE_URL;
const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.SEED_ADMIN_PASSWORD;
const fullName = process.env.SEED_ADMIN_NAME?.trim() || "Clinic Administrator";

if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

if (!email || !email.includes("@")) {
  console.error("SEED_ADMIN_EMAIL must be a real email address — it is the sign-in identity.");
  process.exit(1);
}

/**
 * Twelve characters is not a strong password on its own, but this account holds
 * every permission in the system including the audit log. Refusing the obvious
 * ones here is worth the two seconds it costs.
 */
const WEAK = new Set([
  "password",
  "admin",
  "changeme",
  "clinic123",
  "12345678",
  "ChangeMe!Dev123",
]);

if (!password || password.length < 12) {
  console.error("SEED_ADMIN_PASSWORD must be at least 12 characters.");
  process.exit(1);
}

if (WEAK.has(password) || WEAK.has(password.toLowerCase())) {
  console.error(
    "That password is one of the examples from the documentation. Choose a real one — this account can read every patient record.",
  );
  process.exit(1);
}

const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 } as const;

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL }) });

async function main(): Promise<void> {
  const passwordHash = await hash(password!, ARGON2_OPTIONS);

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, staff: { select: { id: true, fullName: true, role: true } } },
  });

  const user = await prisma.user.upsert({
    where: { email },
    create: { type: "STAFF", email, passwordHash, emailVerifiedAt: new Date() },
    // A password change must invalidate existing sessions, or a leaked session
    // survives the reset that was meant to end it.
    update: { passwordHash, sessionEpoch: { increment: 1 } },
    select: { id: true },
  });

  const staffCount = await prisma.staff.count();

  const staff = await prisma.staff.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      staffCode: `ADC-S-${String(staffCount + 1).padStart(4, "0")}`,
      fullName,
      role: "SUPER_ADMIN",
      email,
      joiningDate: new Date(),
    },
    // Deliberately does not change the role: if this account was demoted on
    // purpose, a password reset should not silently promote it back.
    update: {},
    select: { staffCode: true, fullName: true, role: true },
  });

  if (existing) {
    console.log(`\nUpdated the password for ${email}.`);
    console.log(`  ${staff.fullName} · ${staff.staffCode} · ${staff.role}`);
    console.log("  Every existing session for this account has been signed out.\n");
  } else {
    console.log(`\nCreated ${staff.fullName} (${staff.staffCode}) as SUPER_ADMIN.`);
    console.log(`  Sign in at /staff-login with ${email}\n`);
  }

  console.log("Next: create an individual account for each staff member from Admin → Staff.");
  console.log("The audit trail records who opened which patient record; shared logins void it.\n");
}

main()
  .catch((error) => {
    console.error("Could not create the administrator:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
