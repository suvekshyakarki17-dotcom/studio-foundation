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

/* ---------------------- Official-website resolution ----------------------- */

/** A business whose official website needs to be resolved by a real search. */
export interface WebsiteResolutionTarget {
  name: string;
  city?: string;
  region?: string;
  category?: string;
}

/**
 * One business's resolution result from the verification search. `found`
 * means the business was located in public sources at all; `hasWebsite`
 * means a credible official website owned by the business was found.
 * Directory pages and social profiles are never official websites.
 */
export interface WebsiteResolutionItem {
  name: string;
  found: boolean;
  hasWebsite: boolean;
  website?: string;
  phone?: string;
  email?: string;
  address?: string;
  googleMapsUrl?: string;
  instagram?: string;
  facebook?: string;
  tiktok?: string;
  linkedin?: string;
  details?: string;
}

export interface WebsiteResolutionMapping {
  items: WebsiteResolutionItem[];
  /** Entries found in the payload but dropped (no usable name). */
  unmappable: number;
  /** Total business entries found in the payload before mapping. */
  returned: number;
}

/**
 * Build the /search payload for a batched official-website resolution.
 * One request covers every pending business (numResults 1 — the answer is
 * in the LLM extraction, not the result pages), which keeps cost and rate
 * limits proportional to runs rather than businesses.
 */
export function buildWebsiteResolutionPayload(input: {
  businesses: WebsiteResolutionTarget[];
  country?: string;
}): ScrapegraphaiSearchPayload {
  const targets = input.businesses.map(
    (business) =>
      `${business.name}${business.city ? `, ${business.city}` : ""}${
        business.region ? `, ${business.region}` : ""
      }`,
  );
  return {
    query: `Official website lookup for: ${targets.join(" | ")}`,
    numResults: 1,
    country: (input.country ?? "us").toLowerCase().slice(0, 2),
    prompt: `For EACH business in the list, search the web and determine two things: (1) whether the business was actually found in public sources, and (2) whether it has an OFFICIAL WEBSITE owned by the business. An official website is a site the business itself operates (typically its own domain). Directory pages (Yelp, TripAdvisor, Yellow Pages, OpenTable, Google Maps), social profiles (Facebook, Instagram, TikTok, LinkedIn), and aggregator pages are NEVER official websites. Only set hasWebsite=true when you find a credible official website owned by the business. If the business exists publicly but has no official website, return found=true and hasWebsite=false. If the business cannot be found in public sources at all, return found=false and hasWebsite=false. Never invent contact details or profiles — only return values you actually found. Return exactly one entry per business from the list, using the exact name provided.`,
    schema: {
      type: "object",
      properties: {
        businesses: {
          type: "array",
          description: "One entry per input business, using the exact input name",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Exact business name from the list" },
              found: {
                type: "boolean",
                description: "Whether the business was found in public sources",
              },
              hasWebsite: {
                type: "boolean",
                description: "Whether an official website owned by the business exists",
              },
              website: {
                type: "string",
                description: "Official website URL, only when hasWebsite is true",
              },
              phone: { type: "string", description: "Publicly listed phone number, if found" },
              email: { type: "string", description: "Publicly listed email address, if found" },
              address: { type: "string", description: "Publicly listed street address, if found" },
              googleMapsUrl: {
                type: "string",
                description: "Google Maps / business profile URL, if found",
              },
              instagram: { type: "string", description: "Instagram profile URL, if found" },
              facebook: { type: "string", description: "Facebook page URL, if found" },
              tiktok: { type: "string", description: "TikTok profile URL, if found" },
              linkedin: { type: "string", description: "LinkedIn page URL, if found" },
              details: {
                type: "string",
                description: "Short evidence note (e.g. which sources were checked)",
              },
            },
            required: ["name", "found", "hasWebsite"],
          },
        },
      },
      required: ["businesses"],
    },
  };
}

/** Coerce an unknown boolean-ish extraction value. */
function asBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    if (["true", "yes", "1", "y"].includes(trimmed)) return true;
    if (["false", "no", "0", "n", ""].includes(trimmed)) return false;
  }
  if (typeof value === "number") return value !== 0;
  return false;
}

/**
 * Map the /search response onto per-business resolution items. Keeps only
 * entries with a usable name, coerces the boolean flags defensively, and
 * only trusts a website when hasWebsite is true (a site on a page that was
 * not judged official is dropped rather than guessed).
 */
export function mapWebsiteResolutionResponse(
  data: unknown,
): WebsiteResolutionMapping {
  const items = extractBusinessItems(data);
  const resolutions: WebsiteResolutionItem[] = [];
  let unmappable = 0;

  for (const item of items) {
    if (!item || typeof item !== "object") {
      unmappable += 1;
      continue;
    }
    const obj = item as Record<string, unknown>;
    const name = asString(obj.name) ?? asString(obj.businessName);
    if (!name) {
      unmappable += 1;
      continue;
    }
    const found = asBoolean(obj.found);
    const hasWebsite = asBoolean(obj.hasWebsite);
    const website = hasWebsite ? asString(obj.website) : undefined;
    resolutions.push({
      name,
      found,
      hasWebsite,
      website,
      phone: asString(obj.phone),
      email: asString(obj.email),
      address: asString(obj.address),
      googleMapsUrl: asString(obj.googleMapsUrl) ?? asString(obj.google_maps_url),
      instagram: asString(obj.instagram),
      facebook: asString(obj.facebook),
      tiktok: asString(obj.tiktok),
      linkedin: asString(obj.linkedin),
      details: asString(obj.details) ?? asString(obj.notes),
    });
  }

  return { items: resolutions, unmappable, returned: items.length };
}

/* --------------------------- Record mapping ------------------------------ */

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
