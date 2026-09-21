import sanitizeHtml from "sanitize-html";

const RICH_TEXT_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ["p", "br", "strong", "em", "u", "s", "ul", "ol", "li", "blockquote", "h2", "h3", "a", "code"],
  allowedAttributes: { a: ["href", "target", "rel"] },
  allowedSchemes: ["http", "https", "mailto"],
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" }),
  },
};

/** Sanitizes HTML from rich text editors before storage. */
export function sanitizeRichText(input: string | null | undefined): string | null {
  if (!input) return null;
  const clean = sanitizeHtml(input, RICH_TEXT_OPTIONS).trim();
  return clean.length === 0 || clean === "<p></p>" ? null : clean;
}

/** Strips every tag from plain text inputs; collapses whitespace. */
export function cleanText(input: string | null | undefined): string | null {
  if (input === null || input === undefined) return null;
  const stripped = sanitizeHtml(String(input), { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, " ")
    .trim();
  return stripped.length === 0 ? null : stripped;
}

export function requiredText(input: string): string {
  return cleanText(input) ?? "";
}

/** Country dialing codes for the markets the desk works in; used to resolve nationally formatted numbers. */
const DIALING_CODES: Record<string, string> = {
  IL: "972", DE: "49", NL: "31", PL: "48", GR: "30", CY: "357", UA: "380", RO: "40", BG: "359", HU: "36", CZ: "420", SK: "421",
  AT: "43", CH: "41", BE: "32", FR: "33", ES: "34", PT: "351", IT: "39", GB: "44", IE: "353", DK: "45", NO: "47", SE: "46", FI: "358",
  LT: "370", LV: "371", EE: "372", HR: "385", RS: "381", TR: "90", US: "1", CA: "1", AU: "61", IN: "91", PH: "63", GE: "995", MD: "373",
};

/**
 * Digits only in E.164-ish form for duplicate detection. A number written nationally (leading
 * trunk "0", no "+" / "00") is resolved with the candidate's country so "052-410-7781" and
 * "+972 52 410 7781" compare equal.
 */
export function normalizePhone(input: string | null | undefined, defaultCountry?: string | null): string | null {
  if (!input) return null;
  const digits = input.replace(/[^\d+]/g, "");
  if (!digits) return null;
  if (digits.startsWith("+")) return digits.slice(1).replace(/\D/g, "") || null;
  if (digits.startsWith("00")) return digits.slice(2).replace(/\D/g, "") || null;
  const national = digits.replace(/\D/g, "");
  if (!national) return null;
  const code = defaultCountry ? DIALING_CODES[defaultCountry.toUpperCase()] : undefined;
  if (code && national.startsWith("0") && !national.startsWith("00")) return code + national.replace(/^0+/, "");
  return national;
}

export function normalizeEmail(input: string | null | undefined): string | null {
  const clean = cleanText(input);
  return clean ? clean.toLowerCase() : null;
}
