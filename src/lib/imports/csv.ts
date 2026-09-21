import Papa from "papaparse";

/** Target dictionary fields for candidate imports, with header aliases used for auto-mapping. Shared by the wizard and the server. */
export const CANDIDATE_IMPORT_FIELDS: { key: string; label: string; required?: boolean; aliases: string[]; hint?: string }[] = [
  { key: "firstName", label: "First name", required: true, aliases: ["first name", "firstname", "first", "given name", "שם פרטי"] },
  { key: "lastName", label: "Last name", required: true, aliases: ["last name", "lastname", "surname", "family name", "שם משפחה"] },
  { key: "email", label: "Email", aliases: ["email", "e-mail", "mail", "אימייל"], hint: "Used for duplicate detection" },
  { key: "phone", label: "Phone", aliases: ["phone", "mobile", "telephone", "whatsapp", "טלפון"], hint: "Used for duplicate detection" },
  { key: "city", label: "City", aliases: ["city", "town", "עיר"] },
  { key: "country", label: "Country (ISO-2)", aliases: ["country", "מדינה"], hint: "Two-letter code, e.g. IL, NL" },
  { key: "citizenships", label: "Citizenships (comma list)", aliases: ["citizenship", "citizenships", "nationality"] },
  { key: "headline", label: "Headline", aliases: ["headline", "title", "role", "position"] },
  { key: "summary", label: "Summary", aliases: ["summary", "about", "notes", "description"] },
  { key: "militaryRole", label: "Military role", aliases: ["military role", "military", "unit role", "תפקיד צבאי"] },
  { key: "militaryUnit", label: "Military unit", aliases: ["military unit", "unit", "יחידה"] },
  { key: "yearsExperience", label: "Years experience", aliases: ["years experience", "experience", "years", "exp"] },
  { key: "skills", label: "Skills (semicolon list)", aliases: ["skills", "skill", "competencies", "כישורים"], hint: "Matched to the taxonomy by name or synonym" },
  { key: "languages", label: "Languages (e.g. he:native;en:fluent)", aliases: ["languages", "language", "שפות"] },
  { key: "availableFrom", label: "Available from (YYYY-MM-DD)", aliases: ["available from", "availability", "available", "start date"] },
  { key: "expectedAmount", label: "Expected pay amount", aliases: ["expected pay", "expected salary", "salary", "rate", "pay"] },
  { key: "expectedCurrency", label: "Pay currency", aliases: ["currency"] },
  { key: "expectedPeriod", label: "Pay period", aliases: ["pay period", "period"], hint: "hourly, daily, weekly, monthly or annual" },
  { key: "willingToRelocate", label: "Willing to relocate (yes/no)", aliases: ["relocate", "willing to relocate", "relocation"] },
  { key: "externalRef", label: "External reference", aliases: ["external ref", "ref", "id", "external id", "source id"] },
  { key: "referrerName", label: "Referrer name", aliases: ["referrer", "referred by", "recommended by"] },
];

export function autoMap(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const used = new Set<string>();
  for (const header of headers) {
    const h = header.trim().toLowerCase();
    const field = CANDIDATE_IMPORT_FIELDS.find((f) => !used.has(f.key) && (f.key.toLowerCase() === h || f.aliases.includes(h)));
    if (field) {
      mapping[header] = field.key;
      used.add(field.key);
    }
  }
  return mapping;
}

export type ParsedCsv = { headers: string[]; rows: Record<string, string>[]; parseErrors: string[] };

export function parseCsv(text: string, maxRows = 5000): ParsedCsv {
  const result = Papa.parse<Record<string, string>>(text.replace(/^\uFEFF/, ""), { header: true, skipEmptyLines: "greedy", transformHeader: (h) => h.trim() });
  const rows = result.data.slice(0, maxRows).map((r) => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(r)) out[k] = typeof v === "string" ? v.trim() : String(v ?? "");
    return out;
  });
  return { headers: result.meta.fields ?? [], rows, parseErrors: result.errors.slice(0, 10).map((e) => `Row ${e.row ?? "?"}: ${e.message}`) };
}

export const IMPORT_TEMPLATE_CSV = [
  "First name,Last name,Email,Phone,City,Country,Citizenships,Headline,Skills,Languages,Available from,Expected pay,Currency,Pay period,Willing to relocate,Referrer",
  "Dana,Levi,dana.levi@example.com,+972501234567,Haifa,IL,IL,Certified welder,welding;blueprint reading,he:native;en:professional,2026-11-01,4200,EUR,monthly,yes,Agency contact",
].join("\n");
