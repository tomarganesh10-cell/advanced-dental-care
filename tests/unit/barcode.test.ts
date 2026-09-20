import { describe, expect, it } from "vitest";

import { BarcodeError, barcodeSvg, decodeCode128B, encodeCode128B } from "@/lib/barcode";

/**
 * A label that does not scan is worse than no label: the box still says what it
 * is, but the person holding the scanner believes the system is broken. The
 * checks below are against the specification, not against a snapshot of this
 * implementation's own output.
 */
describe("Code 128-B", () => {
  it("computes the check symbol the specification defines", () => {
    // Worked by hand from the spec: start-B is 104, "A" is symbol 33 at weight 1.
    // (104 + 33) mod 103 = 34.
    expect(encodeCode128B("A").checkSymbol).toBe(34);

    // (104 + 33*1 + 34*2) mod 103 = 205 mod 103 = 102.
    expect(encodeCode128B("AB").checkSymbol).toBe(102);

    // Space is symbol 0, so it contributes nothing whatever its position.
    expect(encodeCode128B(" ").checkSymbol).toBe(104 % 103);
  });

  it("frames every symbol with start-B and stop", () => {
    const { symbols } = encodeCode128B("ADC-B-7K2M9Q");
    expect(symbols[0]).toBe(104);
    expect(symbols[symbols.length - 1]).toBe(106);
  });

  it("produces a module count the specification predicts", () => {
    const text = "ADC-B-7K2M9Q";
    // 11 modules for start, each data character and the check symbol, plus 13
    // for the stop pattern.
    const expected = 11 * (1 + text.length + 1) + 13;
    expect(encodeCode128B(text).modules.length).toBe(expected);
  });

  it("starts with a bar and ends with a bar", () => {
    const { modules } = encodeCode128B("STOCK-1");
    expect(modules.startsWith("1")).toBe(true);
    expect(modules.endsWith("1")).toBe(true);
  });

  it("round-trips every code the label generator can produce", () => {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const samples = ["ADC-B-000001", "ADC-I-0042", "A", "ZZZZZZ"];

    for (let i = 0; i < alphabet.length; i += 1) {
      samples.push(`ADC-B-${alphabet.slice(i, i + 6).padEnd(6, "2")}`);
    }

    for (const sample of samples) {
      expect(decodeCode128B(encodeCode128B(sample).modules)).toBe(sample);
    }
  });

  it("round-trips the full printable ASCII range it claims to support", () => {
    let text = "";
    for (let code = 32; code <= 126; code += 1) {
      text += String.fromCharCode(code);
    }
    expect(decodeCode128B(encodeCode128B(text).modules)).toBe(text);
  });

  it("rejects characters it cannot represent rather than substituting", () => {
    expect(() => encodeCode128B("café")).toThrow(BarcodeError);
    expect(() => encodeCode128B("tab\there")).toThrow(BarcodeError);
    expect(() => encodeCode128B("")).toThrow(BarcodeError);
  });

  it("renders SVG with a white ground and a quiet zone", () => {
    const svg = barcodeSvg("ADC-B-7K2M9Q", { moduleWidth: 2, height: 50 });

    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).toContain("ADC-B-7K2M9Q");
    // Nothing fetched: the app's CSP blocks external references, so the symbol
    // has to be self-contained. The SVG namespace is a URI, not a request.
    expect(svg).not.toMatch(/(?:src|href)=/);
    expect(svg).not.toContain("<image");

    const { modules } = encodeCode128B("ADC-B-7K2M9Q");
    const expectedWidth = (modules.length + 20) * 2;
    expect(svg).toContain(`width="${expectedWidth}"`);
  });

  it("does not draw a bar inside the quiet zone", () => {
    const svg = barcodeSvg("ADC-B-7K2M9Q", { moduleWidth: 2, quietZoneModules: 10 });

    // Look only inside the bar group — the white ground is also a rect at x=0.
    const bars = /<g fill="#000000">(.*?)<\/g>/s.exec(svg)?.[1] ?? "";
    const firstBar = /<rect x="(\d+(?:\.\d+)?)"/.exec(bars);
    expect(firstBar).not.toBeNull();
    expect(Number(firstBar?.[1])).toBeGreaterThanOrEqual(20);

    // And the trailing quiet zone is actually there.
    const lastBar = [...bars.matchAll(/<rect x="(\d+(?:\.\d+)?)" y="0" width="(\d+(?:\.\d+)?)"/g)].at(-1);
    const endOfBars = Number(lastBar?.[1]) + Number(lastBar?.[2]);
    const totalWidth = (encodeCode128B("ADC-B-7K2M9Q").modules.length + 20) * 2;
    expect(totalWidth - endOfBars).toBeGreaterThanOrEqual(20);
  });

  it("refuses a symbol whose check digit has been tampered with", () => {
    const { modules } = encodeCode128B("ADC-B-7K2M9Q");
    // Flip a module in the middle of the data; the checksum must no longer agree.
    const index = Math.floor(modules.length / 2);
    const tampered =
      modules.slice(0, index) + (modules[index] === "1" ? "0" : "1") + modules.slice(index + 1);
    expect(decodeCode128B(tampered)).toBeNull();
  });
});
