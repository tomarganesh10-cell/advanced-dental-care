/**
 * Code 128-B barcode generation.
 *
 * Hand-rolled rather than pulled from a package, for one practical reason: the
 * application's Content-Security-Policy blocks external scripts, and the label
 * sheet has to render server-side into printable SVG anyway. The encoding is
 * about a hundred lines and is exercised by round-trip tests, which is a better
 * trade than a dependency whose bundle shape we would have to fight.
 *
 * Code 128-B covers ASCII 32–126, which includes everything a clinic stock code
 * uses. Subset C (numeric pair packing) is deliberately not implemented — it
 * would shorten purely numeric codes by a few millimetres and double the
 * surface area for bugs.
 *
 * A handheld scanner reads the printed symbol; nothing in the application
 * decodes images, so the only correctness that matters here is that the module
 * pattern matches the specification.
 */

/**
 * Bar/space widths for symbol values 0–106, as digit strings.
 *
 * Each entry alternates bar, space, bar, space, bar, space starting with a bar.
 * Every data pattern is 11 modules wide; the stop pattern (106) is 13 and has a
 * seventh element. `assertPatternTable` checks both, so a mistyped digit fails
 * at import rather than printing a label no scanner can read.
 */
const PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312",
  "132212", "221213", "221312", "231212", "112232", "122132", "122231", "113222",
  "123122", "123221", "223211", "221132", "221231", "213212", "223112", "312131",
  "311222", "321122", "321221", "312212", "322112", "322211", "212123", "212321",
  "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121",
  "313121", "211331", "231131", "213113", "213311", "213131", "311123", "311321",
  "331121", "312113", "312311", "332111", "314111", "221411", "431111", "111224",
  "111422", "121124", "121421", "141122", "141221", "112214", "112412", "122114",
  "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112",
  "421211", "212141", "214121", "412121", "111143", "111341", "131141", "114113",
  "114311", "411113", "411311", "113141", "114131", "311141", "411131", "211412",
  "211214", "211232", "2331112",
] as const;

/** Symbol value that selects subset B. */
const START_B = 104;
/** Symbol value that terminates every Code 128 symbol. */
const STOP = 106;
/** Subset B maps ASCII 32–126 onto symbol values 0–94. */
const ASCII_OFFSET = 32;
const MIN_CHAR = 32;
const MAX_CHAR = 126;

function assertPatternTable(): void {
  if (PATTERNS.length !== 107) {
    throw new Error(`Code 128 pattern table has ${PATTERNS.length} entries, expected 107`);
  }

  PATTERNS.forEach((pattern, value) => {
    const expectedModules = value === STOP ? 13 : 11;
    const expectedElements = value === STOP ? 7 : 6;

    if (pattern.length !== expectedElements) {
      throw new Error(`Code 128 pattern ${value} has ${pattern.length} elements`);
    }

    let modules = 0;
    for (const digit of pattern) {
      const width = Number(digit);
      if (!Number.isInteger(width) || width < 1 || width > 4) {
        throw new Error(`Code 128 pattern ${value} has an out-of-range width`);
      }
      modules += width;
    }

    if (modules !== expectedModules) {
      throw new Error(
        `Code 128 pattern ${value} is ${modules} modules wide, expected ${expectedModules}`,
      );
    }
  });

  if (new Set(PATTERNS).size !== PATTERNS.length) {
    throw new Error("Code 128 pattern table contains a duplicate");
  }
}

assertPatternTable();

export class BarcodeError extends Error {}

export interface Code128Encoding {
  /** Symbol values, including the start symbol, check symbol and stop symbol. */
  symbols: number[];
  /** The modulo-103 check symbol, exposed for testing. */
  checkSymbol: number;
  /** One character per module: "1" is a bar, "0" is a space. */
  modules: string;
}

/**
 * Encodes text as Code 128-B.
 *
 * Throws on anything outside ASCII 32–126 rather than substituting a character,
 * because a label that silently differs from the code stored against the batch
 * is worse than a label that failed to print.
 */
export function encodeCode128B(text: string): Code128Encoding {
  if (text.length === 0) {
    throw new BarcodeError("Cannot encode an empty barcode");
  }

  const values: number[] = [];

  for (const char of text) {
    const code = char.codePointAt(0) ?? -1;
    if (code < MIN_CHAR || code > MAX_CHAR) {
      throw new BarcodeError(
        `Character ${JSON.stringify(char)} cannot be encoded in Code 128-B (ASCII 32-126 only)`,
      );
    }
    values.push(code - ASCII_OFFSET);
  }

  // Weighted modulo-103 checksum. The start symbol carries weight 1, then each
  // data symbol is weighted by its 1-based position.
  let weightedSum = START_B;
  values.forEach((value, index) => {
    weightedSum += value * (index + 1);
  });
  const checkSymbol = weightedSum % 103;

  const symbols = [START_B, ...values, checkSymbol, STOP];

  let modules = "";
  for (const symbol of symbols) {
    const pattern = PATTERNS[symbol];
    if (pattern === undefined) {
      throw new BarcodeError(`No Code 128 pattern for symbol ${symbol}`);
    }
    // Widths alternate bar, space, bar, space… always starting with a bar.
    for (let i = 0; i < pattern.length; i += 1) {
      const width = Number(pattern[i]);
      modules += (i % 2 === 0 ? "1" : "0").repeat(width);
    }
  }

  return { symbols, checkSymbol, modules };
}

export interface BarcodeSvgOptions {
  /** Width of one module in user units. Below 0.26mm most scanners struggle. */
  moduleWidth?: number;
  /** Bar height in user units, excluding the caption. */
  height?: number;
  /** Quiet zone either side, in modules. The specification requires at least 10. */
  quietZoneModules?: number;
  /** Print the code underneath in human-readable form. */
  showText?: boolean;
  /** Accessible name for the symbol. */
  title?: string;
}

/**
 * Renders text as a Code 128-B symbol in SVG.
 *
 * The result is self-contained markup with no external references, so it can be
 * inlined into a print sheet or an email without a fetch.
 */
export function barcodeSvg(text: string, options: BarcodeSvgOptions = {}): string {
  const {
    moduleWidth = 2,
    height = 60,
    // The spec's minimum is 10 modules; giving it the full amount is free here
    // and is the difference between a reliable scan and an intermittent one.
    quietZoneModules = 10,
    showText = true,
    title = `Barcode ${text}`,
  } = options;

  const { modules } = encodeCode128B(text);

  const captionHeight = showText ? 16 : 0;
  const totalModules = modules.length + quietZoneModules * 2;
  const width = totalModules * moduleWidth;
  const totalHeight = height + captionHeight;

  // Coalesce consecutive bar modules into one rect. A scanner sees the same
  // symbol either way; the printer and the DOM see far fewer nodes.
  const bars: string[] = [];
  let runStart: number | null = null;

  for (let i = 0; i <= modules.length; i += 1) {
    const isBar = modules[i] === "1";
    if (isBar && runStart === null) {
      runStart = i;
    } else if (!isBar && runStart !== null) {
      const x = (quietZoneModules + runStart) * moduleWidth;
      const barWidth = (i - runStart) * moduleWidth;
      bars.push(`<rect x="${round(x)}" y="0" width="${round(barWidth)}" height="${height}"/>`);
      runStart = null;
    }
  }

  const caption = showText
    ? `<text x="${round(width / 2)}" y="${totalHeight - 4}" text-anchor="middle" ` +
      `font-family="ui-monospace, monospace" font-size="12" fill="currentColor">${escapeXml(text)}</text>`
    : "";

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${round(width)} ${round(totalHeight)}" ` +
    `width="${round(width)}" height="${round(totalHeight)}" role="img" aria-label="${escapeXml(title)}">` +
    // White ground rather than transparent: a barcode printed onto a coloured
    // background is a barcode that does not scan.
    `<rect x="0" y="0" width="${round(width)}" height="${round(totalHeight)}" fill="#ffffff"/>` +
    `<g fill="#000000">${bars.join("")}</g>` +
    caption +
    `</svg>`
  );
}

function round(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Reads a module string back into text.
 *
 * Exists for the round-trip test rather than for production use — nothing in
 * the application scans an image. Returns null if the symbol is malformed.
 */
export function decodeCode128B(modules: string): string | null {
  const widths: number[] = [];
  let runLength = 0;

  for (let i = 0; i < modules.length; i += 1) {
    runLength += 1;
    if (modules[i] !== modules[i + 1]) {
      widths.push(runLength);
      runLength = 0;
    }
  }

  const symbols: number[] = [];
  let cursor = 0;

  while (cursor < widths.length) {
    // The stop symbol is the only one with seven elements, and it ends the run.
    const remaining = widths.length - cursor;
    const elementCount = remaining === 7 ? 7 : 6;
    if (remaining < elementCount) return null;

    const pattern = widths.slice(cursor, cursor + elementCount).join("");
    const value = PATTERNS.indexOf(pattern as (typeof PATTERNS)[number]);
    if (value === -1) return null;

    symbols.push(value);
    cursor += elementCount;
  }

  if (symbols.length < 4) return null;
  if (symbols[0] !== START_B) return null;
  if (symbols[symbols.length - 1] !== STOP) return null;

  const checkSymbol = symbols[symbols.length - 2];
  const data = symbols.slice(1, -2);

  let weightedSum = START_B;
  data.forEach((value, index) => {
    weightedSum += value * (index + 1);
  });
  if (weightedSum % 103 !== checkSymbol) return null;

  return data.map((value) => String.fromCharCode(value + ASCII_OFFSET)).join("");
}
