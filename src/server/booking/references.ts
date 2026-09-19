import { prisma } from "@/lib/db";
import { generateReference } from "@/server/auth/tokens";

/**
 * Human-readable identifiers.
 *
 * Patients quote these on the phone, so they avoid characters that sound alike
 * (O/0, I/1) and are short enough to read out. They are NOT used as primary
 * keys — the UUID is — so a collision is a retryable annoyance, not a data
 * integrity problem.
 */

const MAX_ATTEMPTS = 8;

export async function generateAppointmentReference(): Promise<string> {
  for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
    const reference = generateReference("ADC-A", 6);
    const existing = await prisma.appointment.findUnique({
      where: { reference },
      select: { id: true },
    });
    if (!existing) return reference;
  }
  throw new Error("Could not allocate an appointment reference");
}

export async function generateLeadReference(): Promise<string> {
  for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
    const reference = generateReference("ADC-L", 6);
    const existing = await prisma.lead.findUnique({ where: { reference }, select: { id: true } });
    if (!existing) return reference;
  }
  throw new Error("Could not allocate a lead reference");
}

export async function generateEnquiryReference(): Promise<string> {
  for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
    const reference = generateReference("ADC-I", 6);
    const existing = await prisma.internationalPatientEnquiry.findUnique({
      where: { reference },
      select: { id: true },
    });
    if (!existing) return reference;
  }
  throw new Error("Could not allocate an enquiry reference");
}

export async function generatePaymentReference(): Promise<string> {
  for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
    const reference = generateReference("ADC-PY", 8);
    const existing = await prisma.payment.findUnique({ where: { reference }, select: { id: true } });
    if (!existing) return reference;
  }
  throw new Error("Could not allocate a payment reference");
}

export async function generatePrescriptionReference(): Promise<string> {
  for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
    const reference = generateReference("ADC-RX", 6);
    const existing = await prisma.prescription.findUnique({
      where: { reference },
      select: { id: true },
    });
    if (!existing) return reference;
  }
  throw new Error("Could not allocate a prescription reference");
}

/**
 * Sequential patient number, allocated atomically.
 *
 * Uses a single INSERT … ON CONFLICT DO UPDATE rather than SELECT FOR UPDATE
 * then write. The earlier version had a real race on the very first patient:
 * `SELECT … FOR UPDATE` takes no lock when the row does not exist yet, so two
 * concurrent registrations both saw "no counter", both tried to create it, and
 * one failed with a primary-key violation. One statement removes the window
 * entirely — Postgres serialises conflicting upserts on the same key itself.
 *
 * The counter lives in `settings` rather than a Postgres sequence so the clinic
 * can set its starting value to continue from their existing paper records.
 */
export async function allocatePatientNumber(): Promise<string> {
  const key = "patient_number_counter";
  const description =
    "Last allocated patient number. Set this to continue from existing paper records.";

  const rows = await prisma.$queryRaw<Array<{ next: number }>>`
    INSERT INTO settings ("key", "value", "isPublic", "description", "createdAt", "updatedAt")
    VALUES (${key}, to_jsonb(1), false, ${description}, now(), now())
    ON CONFLICT ("key") DO UPDATE
      SET "value" = to_jsonb(((settings."value")::text)::bigint + 1),
          "updatedAt" = now()
    RETURNING (("value")::text)::int AS next
  `;

  const next = rows[0]?.next;

  if (typeof next !== "number" || !Number.isFinite(next)) {
    throw new Error("Could not allocate a patient number");
  }

  return `ADC-P-${String(next).padStart(6, "0")}`;
}
