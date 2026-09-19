import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { allocatePatientNumber } from "@/server/booking/references";

/**
 * Patient number allocation.
 *
 * The first-ever allocation used to race: SELECT … FOR UPDATE takes no lock on
 * a row that does not exist, so two simultaneous registrations on a fresh
 * install both tried to create the counter and one failed outright. These tests
 * cover both that case and steady-state concurrency.
 */
describe("patient number allocation", () => {
  it("starts at 000001 on a fresh database", async () => {
    expect(await allocatePatientNumber()).toBe("ADC-P-000001");
    expect(await allocatePatientNumber()).toBe("ADC-P-000002");
  });

  it("allocates unique numbers when the counter does not exist yet", async () => {
    // The exact case that used to fail with a primary-key violation.
    const results = await Promise.all(
      Array.from({ length: 12 }, () => allocatePatientNumber()),
    );

    expect(new Set(results).size).toBe(results.length);
  });

  it("allocates unique numbers under concurrency once the counter exists", async () => {
    await allocatePatientNumber();

    const results = await Promise.all(
      Array.from({ length: 25 }, () => allocatePatientNumber()),
    );

    expect(new Set(results).size).toBe(results.length);

    const numbers = results
      .map((reference) => Number.parseInt(reference.replace("ADC-P-", ""), 10))
      .sort((a, b) => a - b);

    // Gapless: 2..26 after the initial allocation.
    expect(numbers[0]).toBe(2);
    expect(numbers.at(-1)).toBe(26);
  });

  it("continues from a starting value the clinic sets", async () => {
    await prisma.setting.create({
      data: {
        key: "patient_number_counter",
        value: 4820,
        description: "Continuing from paper records",
      },
    });

    expect(await allocatePatientNumber()).toBe("ADC-P-004821");
  });
});
