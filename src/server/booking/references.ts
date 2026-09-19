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
 * Sequential patient number, allocated under a row lock so two concurrent
 * registrations cannot take the same number.
 *
 * Uses the settings table as the counter rather than a sequence, so the clinic
 * can set the starting number to continue from their existing paper records.
 */
export async function allocatePatientNumber(): Promise<string> {
  const key = "patient_number_counter";

  const next = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ value: unknown }>>`
      SELECT value FROM settings WHERE key = ${key} FOR UPDATE
    `;

    const current =
      rows.length > 0 && typeof rows[0]?.value === "number" ? (rows[0].value as number) : 0;
    const incremented = current + 1;

    if (rows.length === 0) {
      await tx.setting.create({
        data: {
          key,
          value: incremented,
          description: "Last allocated patient number. Set this to continue existing records.",
        },
      });
    } else {
      await tx.setting.update({ where: { key }, data: { value: incremented } });
    }

    return incremented;
  });

  return `ADC-P-${String(next).padStart(6, "0")}`;
}
