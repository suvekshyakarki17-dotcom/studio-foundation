/**
 * ScrapeGraphAI adapter — pure request/response mapping for the V2 API.
 *
 * This module is the ScrapeGraphAI boundary of the Phase 3 discovery
 * engine. It builds the real HTTP payload for the V2 `search` endpoint
 * (https://v2-api.scrapegraphai.com/api/search) and maps the response's
 * AI-extracted JSON back onto DiscoveryRawRecord so the results can flow
 * through the exact same normalize → validate → deduplicate → persist
 * pipeline as every other provider.
 *
 * PURE: no I/O, no secrets, no process.env — the backend action supplies
 * the key and performs the fetch. Unit-testable without a network.
 *
 * HONESTY: the extraction output is third-party, LLM-generated data. The
 * mapper keeps only fields it can name, drops items without a company
 * name (counted as `unmappable`), and never fabricates a value. Records
 * that pass through are still validated and deduplicated by the shared
 * pipeline before anything is persisted.
 */
import type { DiscoveryRawRecord } from "../discovery";

/** ScrapeGraphAI V2 REST base for the search endpoint. */
export const SCRAPEGRAPHAI_SEARCH_ENDPOINT =
  "https://v2-api.scrapegraphai.com/api/search";

/** The V2 API caps numResults at 20. */
export const SCRAPEGRAPHAI_MAX_RESULTS = 20;

/** Auth header name for the V2 API (docs use SGAI-APIKEY). */
export const SCRAPEGRAPHAI_AUTH_HEADER = "SGAI-APIKEY";

export interface ScrapegraphaiSearchInput {
  city?: string;
  region?: string;
  category?: string;
  /** Number of results requested (clamped to 1..20 — the API's cap). */
  limit: number;
  /** ISO 3166-1 alpha-2 country code for localized results (e.g. "us"). */
  country?: string;
}

export interface ScrapegraphaiSearchPayload {
  query: string;
  numResults: number;
  country: string;
  prompt: string;
  schema: Record<string, unknown>;
}

/**
 * Build the /search payload for a local-business discovery request.
 * `numResults` is rate-limit-aware by construction: it is the requested
 * cap from the campaign, never more than the API allows.
 */
export function buildLocalSearchPayload(
  input: ScrapegraphaiSearchInput,
): ScrapegraphaiSearchPayload {
  const limit = Math.min(
    Math.max(Math.floor(input.limit) || 1, 1),
    SCRAPEGRAPHAI_MAX_RESULTS,
  );
  const city = input.city?.trim() || "";
  const region = input.region?.trim();
  const category = input.category?.trim() || "businesses";
  const location = [city, region].filter(Boolean).join(", ");
  const query = `Best ${category} in ${location}`;
  return {
    query,
    numResults: limit,
    country: (input.country ?? "us").toLowerCase().slice(0, 2),
    prompt: `Extract a list of ${category} businesses located in ${location}. For each business, return its exact legal name, official website URL, phone number, email address, and full street address. Only include real, operating businesses in ${location}. If a field is not available, omit it — never invent a value.`,
    schema: {
      type: "object",
      properties: {
        businesses: {
          type: "array",
          description: `The ${category} businesses found in ${location}`,
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Business name" },
              website: { type: "string", description: "Official website URL" },
              phone: { type: "string", description: "Phone number" },
              email: { type: "string", description: "Email address" },
              address: { type: "string", description: "Full street address" },
            },
            required: ["name"],
          },
        },
      },
      required: ["businesses"],
    },
  };
}

/** Fallback fields the campaign config supplies when extraction omits them. */
export interface ScrapegraphaiRecordFallback {
  city?: string;
  region?: string;
  category?: string;
  /** Provenance: the real fetched page the results were extracted from. */
  sourceReference?: string;
}

export interface ScrapegraphaiMapping {
  records: DiscoveryRawRecord[];
  /** Business entries found in the API payload but dropped (no name). */
  unmappable: number;
  /** Total business entries found in the API payload before mapping. */
  returned: number;
}

/** Coerce an unknown extraction value to a trimmed string, or undefined. */
function asString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

/** Extract a candidate list of business objects from the API payload. */
function extractBusinessItems(data: unknown): unknown[] {
  let json: unknown = data;
  if (typeof json === "string") {
    try {
      json = JSON.parse(json);
    } catch {
      return [];
    }
  }
  if (!json || typeof json !== "object") return [];
  const root = json as Record<string, unknown>;
  // SDK-style wrappers sometimes nest the payload: { data: { json } }.
  const payload = (root.json ?? root.data ?? root) as Record<string, unknown>;

  if (Array.isArray(payload)) return payload;
  for (const key of ["businesses", "local_results", "results"]) {
    const list = payload[key];
    if (Array.isArray(list)) return list;
  }
  return [];
}

/**
 * Map the /search response onto DiscoveryRawRecord[]. Tolerant of the
 * extraction shapes the API has produced (businesses array, flat array,
 * local_results), defensive about types, and honest about what it drops.
 */
export function mapSearchResponseToRecords(
  data: unknown,
  fallback: ScrapegraphaiRecordFallback = {},
): ScrapegraphaiMapping {
  const items = extractBusinessItems(data);
  const records: DiscoveryRawRecord[] = [];
  let unmappable = 0;

  for (const item of items) {
    if (!item || typeof item !== "object") {
      unmappable += 1;
      continue;
    }
    const obj = item as Record<string, unknown>;
    const company =
      asString(obj.name) ?? asString(obj.company) ?? asString(obj.businessName);
    if (!company) {
      unmappable += 1;
      continue;
    }
    records.push({
      company,
      contactName:
        asString(obj.contactName) ?? asString(obj.contact_name) ?? asString(obj.owner),
      email: asString(obj.email),
      phone:
        asString(obj.phone) ??
        asString(obj.phoneNumber) ??
        asString(obj.phone_number) ??
        asString(obj.telephone),
      website:
        asString(obj.website) ??
        asString(obj.websiteUrl) ??
        asString(obj.website_url) ??
        asString(obj.url),
      city: asString(obj.city) ?? fallback.city,
      region: asString(obj.region) ?? asString(obj.state) ?? fallback.region,
      category: asString(obj.category) ?? fallback.category,
      address: asString(obj.address) ?? asString(obj.fullAddress) ?? asString(obj.full_address),
      sourceReference: asString(obj.sourceReference) ?? asString(obj.sourceUrl) ?? fallback.sourceReference,
      notes: asString(obj.description) ?? asString(obj.notes),
    });
  }

  return { records, unmappable, returned: items.length };
}
