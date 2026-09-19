import { describe, expect, it } from "vitest";
import { formatPhone, isIndianMobile, normalisePhone, whatsappNumber } from "@/lib/phone";

describe("phone normalisation", () => {
  /**
   * The point of normalising: the same patient typing their number four
   * different ways must resolve to one record, or the clinic ends up with four
   * charts for one person and an OTP limiter that never triggers.
   */
  it("normalises every common way an Indian mobile is written", () => {
    const variants = [
      "9855123236",
      "98551 23236",
      "98551-23236",
      "+91 98551 23236",
      "+919855123236",
      "919855123236",
      "09855123236",
      "(98551) 23236",
      "98551.23236",
    ];

    for (const variant of variants) {
      expect(normalisePhone(variant), variant).toBe("+919855123236");
    }
  });

  it("rejects numbers that are not valid Indian mobiles", () => {
    expect(normalisePhone("12345")).toBeNull();
    expect(normalisePhone("")).toBeNull();
    expect(normalisePhone("   ")).toBeNull();
    // Indian mobiles start 6–9; a landline-style leading digit is not one.
    expect(normalisePhone("1234567890")).toBeNull();
    expect(normalisePhone("5855123236")).toBeNull();
  });

  it("keeps international numbers for dental-tourism enquiries", () => {
    expect(normalisePhone("+44 7700 900123")).toBe("+447700900123");
    expect(normalisePhone("+1 415 555 0100")).toBe("+14155550100");
    expect(normalisePhone("+971 50 123 4567")).toBe("+971501234567");
  });

  it("rejects an implausibly long number", () => {
    expect(normalisePhone("+1234567890123456789")).toBeNull();
  });

  it("identifies Indian mobiles", () => {
    expect(isIndianMobile("+919855123236")).toBe(true);
    expect(isIndianMobile("+447700900123")).toBe(false);
    expect(isIndianMobile("+915855123236")).toBe(false);
  });

  it("formats for display", () => {
    expect(formatPhone("+919855123236")).toBe("+91 98551 23236");
    // Anything non-Indian is left alone rather than mangled into Indian grouping.
    expect(formatPhone("+447700900123")).toBe("+447700900123");
  });

  it("strips to digits for wa.me links", () => {
    expect(whatsappNumber("+919855123236")).toBe("919855123236");
  });
});
