import { execSync } from "node:child_process";
import { beforeAll, beforeEach } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Integration test harness.
 *
 * Runs against a REAL PostgreSQL database, because the behaviour these tests
 * exist to verify — SERIALIZABLE preventing a double booking, a transactional
 * outbox rolling back with its transaction, cascade deletes — lives in the
 * database, not in application code. A mocked Prisma client would pass all of
 * them while the production system double-booked.
 *
 * The connection is forced to TEST_DATABASE_URL and the whole run aborts if
 * that is missing or looks like the development database. Truncating the wrong
 * schema is a very short mistake with a very long afternoon attached.
 */

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

if (!TEST_DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL is not set. Integration tests truncate every table, so they refuse to run without an explicitly separate database.",
  );
}

/**
 * Guard: the database NAME itself must look disposable.
 *
 * Checking the name rather than comparing against DATABASE_URL is deliberate.
 * This file has to overwrite DATABASE_URL (below) so the application's own
 * Prisma client connects to the test database, which would defeat a comparison
 * against it. The name is the thing that actually distinguishes "safe to
 * truncate" from "the clinic's data".
 */
const databaseName = (() => {
  try {
    return new URL(TEST_DATABASE_URL).pathname.replace(/^\//, "");
  } catch {
    return "";
  }
})();

if (!/test/i.test(databaseName)) {
  throw new Error(
    `TEST_DATABASE_URL points at a database called "${databaseName}", which does not contain "test". ` +
      "These tests TRUNCATE every table. Point them at a disposable database such as adcc_test.",
  );
}

/**
 * Redirect the application's own Prisma client at the test database.
 *
 * Must happen before anything imports `@/lib/db`, which reads DATABASE_URL at
 * module load. Vitest runs setup files before the test module, so this is the
 * one place it can be done.
 */
process.env.DATABASE_URL = TEST_DATABASE_URL;

/**
 * Force the in-process rate limiter.
 *
 * Tests that exercise limits need to reset them between cases, which they can
 * do for the memory limiter and cannot for a shared Redis. It also keeps the
 * suite hermetic — integration tests should need a database, not a database
 * AND a cache server.
 */
delete process.env.REDIS_URL;

export const testDb = new PrismaClient({
  adapter: new PrismaPg({ connectionString: TEST_DATABASE_URL }),
});

/** Tables truncated between tests, children first where order matters. */
const TABLES = [
  "audit_logs",
  "analytics_events",
  "stock_count_lines",
  "stock_movements",
  "stock_counts",
  "inventory_batches",
  "inventory_items",
  "inventory_categories",
  "suppliers",
  "notification_messages",
  "appointment_status_events",
  "lead_activities",
  "invoice_items",
  "refunds",
  "payments",
  "invoices",
  "prescription_items",
  "prescriptions",
  "treatment_plan_items",
  "treatment_plans",
  "clinical_notes",
  "patient_documents",
  "patient_consents",
  "medical_histories",
  "feedback",
  "review_requests",
  "appointments",
  "leads",
  "international_patient_enquiries",
  "gallery_media",
  "gallery_cases",
  "testimonials",
  "attendance",
  "leave_requests",
  "doctor_time_off",
  "doctor_schedules",
  "clinic_holidays",
  "otp_challenges",
  "sessions",
  "permission_grants",
  "content_claims",
  "doctors",
  "staff",
  "patients",
  "users",
  "settings",
  "integration_cache",
  "invoice_counters",
  "notification_templates",
  "blog_posts",
  "blog_categories",
  "content_blocks",
  "seo_metadata",
  "data_subject_requests",
];

beforeAll(() => {
  // Apply migrations to the test database once per run.
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "pipe",
  });
});

beforeEach(async () => {
  // One statement rather than 40 round-trips, and CASCADE handles any FK order
  // the list above gets wrong.
  await testDb.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.map((table) => `"${table}"`).join(", ")} RESTART IDENTITY CASCADE`,
  );
});
