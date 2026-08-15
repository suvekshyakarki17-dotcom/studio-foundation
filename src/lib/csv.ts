/**
 * Lightweight CSV/TSV parsing for the discovery import panel.
 *
 * Handles quoted fields, escaped quotes, and both comma and tab
 * delimiters. Produces DiscoveryRawRecord values ready for
 * `discovery.submitRecords`; the server re-validates everything.
 */
import type { DiscoveryRawRecord } from "@/shared/discovery";

export const MAX_IMPORT_ROWS = 200;

export type CsvDelimiter = "," | "\t";

export function detectDelimiter(firstLine: string): CsvDelimiter {
  const hasTab = firstLine.includes("\t");
  const hasComma = firstLine.includes(",");
  if (hasTab && !hasComma) return "\t";
  return ",";
}

/** Split CSV/TSV text into rows of raw string cells (quotes respected). */
export function parseCsvLines(text: string): {
  rows: string[][];
  error?: string;
} {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = detectDelimiter(firstLine);

  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  if (inQuotes) {
    return { rows: [], error: "Unclosed quote in the data — check the pasted text." };
  }
  return { rows };
}

const HEADER_MAP: Record<string, keyof DiscoveryRawRecord> = {
  company: "company",
  business: "company",
  businessname: "company",
  name: "company",
  contactname: "contactName",
  contact: "contactName",
  person: "contactName",
  email: "email",
  phone: "phone",
  telephone: "phone",
  tel: "phone",
  website: "website",
  url: "website",
  site: "website",
  city: "city",
  town: "city",
  region: "region",
  state: "region",
  province: "region",
  category: "category",
  type: "category",
  industry: "category",
  address: "address",
  street: "address",
  socials: "socials",
  social: "socials",
  instagram: "socials",
  facebook: "socials",
  linkedin: "socials",
  tiktok: "socials",
  whatsapp: "whatsapp",
  wa: "whatsapp",
  sourcereference: "sourceReference",
  source: "sourceReference",
  ref: "sourceReference",
  notes: "notes",
  note: "notes",
};

const POSITIONAL_FIELDS: ReadonlyArray<keyof DiscoveryRawRecord> = [
  "company",
  "contactName",
  "email",
  "phone",
  "website",
  "city",
  "category",
];

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function cleanSocials(value: string | undefined): string[] | undefined {
  const parts = value
    ?.split(/[;|]/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts && parts.length > 0 ? parts : undefined;
}

/** Parse pasted CSV/TSV into discovery raw records (header-aware). */
export function parseDiscoveryCsv(text: string): {
  records: DiscoveryRawRecord[];
  error?: string;
} {
  const { rows, error } = parseCsvLines(text);
  if (error) return { records: [], error };
  const nonEmpty = rows.filter((row) => row.some((cell) => cell.trim() !== ""));
  if (nonEmpty.length === 0) {
    return { records: [], error: "Paste at least one business record." };
  }
  if (nonEmpty.length > MAX_IMPORT_ROWS) {
    return {
      records: [],
      error: `Paste at most ${MAX_IMPORT_ROWS} records at a time.`,
    };
  }

  const first = nonEmpty[0]!;
  const looksLikeHeader = /company|business|name|email|phone/i.test(
    first.join(" "),
  );
  const header = looksLikeHeader
    ? first.map(normalizeHeader)
    : undefined;
  const body = looksLikeHeader ? nonEmpty.slice(1) : nonEmpty;

  const records: DiscoveryRawRecord[] = [];
  for (const row of body) {
    const record: DiscoveryRawRecord = { company: "" };
    if (header) {
      for (let i = 0; i < Math.min(row.length, header.length); i++) {
        const field = HEADER_MAP[header[i]!];
        if (!field) continue;
        applyField(record, field, row[i]);
      }
    } else {
      for (let i = 0; i < Math.min(row.length, POSITIONAL_FIELDS.length); i++) {
        applyField(record, POSITIONAL_FIELDS[i]!, row[i]);
      }
    }
    if (record.company) records.push(record);
  }

  return { records };
}

function applyField(
  record: DiscoveryRawRecord,
  field: keyof DiscoveryRawRecord,
  value: string | undefined,
): void {
  if (field === "socials") {
    const socials = cleanSocials(value);
    if (socials) record.socials = socials;
    return;
  }
  const cleaned = clean(value);
  if (cleaned) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (record as any)[field] = cleaned;
  }
}
