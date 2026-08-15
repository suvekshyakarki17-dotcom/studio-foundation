/**
 * Deterministic normalization for discovery records.
 *
 * Pure functions: no I/O, no randomness — the same input always yields the
 * same output, which keeps the pipeline idempotent and testable. Original
 * source information is preserved in the raw snapshot; these functions only
 * build the canonical view used for validation, deduplication, and
 * persistence.
 */
import type {
  DiscoveryNormalizedRecord,
  DiscoveryRawRecord,
  WebsiteReachabilityState,
} from "../discovery";

/** Trim and collapse internal whitespace (e.g. "  Joe's   Pizza  " → "Joe's Pizza"). */
export function normalizeName(value: string | undefined): string | undefined {
  const trimmed = value?.trim().replace(/\s+/g, " ");
  return trimmed ? trimmed : undefined;
}

export function normalizeCity(value: string | undefined): string | undefined {
  const normalized = normalizeName(value);
  return normalized ? normalized : undefined;
}

export function normalizeRegion(value: string | undefined): string | undefined {
  const normalized = normalizeName(value);
  return normalized ? normalized : undefined;
}

/** Trim + lowercase. Returns undefined for empty input. */
export function normalizeEmail(value: string | undefined): string | undefined {
  const trimmed = value?.trim().toLowerCase();
  return trimmed ? trimmed : undefined;
}

/**
 * Normalize a phone number to a canonical "+<digits>" form. Separators are
 * stripped and a leading "00" international prefix becomes "+". The result
 * is a normalized *structure*, not a verified number — country codes cannot
 * be derived reliably from local numbers, and no external validation is
 * claimed. Returns undefined when the structure is unusable.
 */
export function normalizePhone(value: string | undefined): string | undefined {
  if (!value) return undefined;
  let digits = value.trim().replace(/[\s\-().]/g, "");
  if (!digits) return undefined;
  if (digits.startsWith("00")) {
    digits = "+" + digits.slice(2);
  } else if (!digits.startsWith("+")) {
    digits = "+" + digits;
  }
  if (!/^\+[1-9]\d{6,14}$/.test(digits)) return undefined;
  return digits;
}

export interface CanonicalUrl {
  /** Display/persisted URL (https scheme, normalized host, path preserved). */
  url: string;
  /** Identity host: lowercased, no www, no path/query. Used for dedup. */
  domain: string;
}

/**
 * Canonicalize a website URL. Handles missing schemes, protocol and
 * case differences, trailing slashes, and query strings. Never merges
 * different domains: the canonical domain is derived, not guessed.
 * Returns null when the input is not a usable http(s) URL.
 */
export function canonicalizeUrl(value: string | undefined): CanonicalUrl | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // A leading "scheme:" that is not http(s) is rejected outright (mailto:,
  // ftp:, javascript:, …). A host-like prefix containing a dot (e.g.
  // "example.com:8080") is treated as a host with a port and https-prefixed.
  const schemeMatch = trimmed.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
  if (schemeMatch) {
    const scheme = schemeMatch[1]!.toLowerCase();
    if (scheme !== "http" && scheme !== "https" && !scheme.includes(".")) {
      return null;
    }
  }
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  if (!host || !host.includes(".") || !/^[a-z0-9.-]+$/.test(host)) {
    return null;
  }
  const domain = host.startsWith("www.") ? host.slice(4) : host;
  let pathname = parsed.pathname;
  if (pathname.length > 1 && pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }
  const url = `${parsed.protocol}//${host}${pathname === "/" ? "" : pathname}${parsed.search}`;
  return { url, domain };
}

/**
 * Derive the reachability state from presence alone. This makes no
 * reachability claim: a syntactically valid URL stays UNKNOWN until a real
 * check runs; a missing website is NO_WEBSITE; an unusable URL is
 * INVALID_URL.
 */
export function deriveWebsiteReachability(
  website: string | undefined,
): WebsiteReachabilityState {
  if (!website) return "NO_WEBSITE";
  return canonicalizeUrl(website) ? "UNKNOWN" : "INVALID_URL";
}

/**
 * Deterministic identity fingerprints for deduplication. Each key is
 * prefixed so different signal types can never collide.
 */
export function buildIdentityKeys(record: DiscoveryNormalizedRecord): string[] {
  const keys: string[] = [];
  if (record.email) keys.push(`email:${record.email}`);
  if (record.canonicalDomain) keys.push(`domain:${record.canonicalDomain}`);
  if (record.phone) keys.push(`phone:${record.phone}`);
  const nameKey = record.company.trim().toLowerCase();
  const cityKey = record.city?.trim().toLowerCase();
  if (nameKey && cityKey) keys.push(`name-city:${nameKey}|${cityKey}`);
  return keys;
}

/**
 * Normalize a raw provider/operator record into the canonical view.
 * `confidence` is the provider's confidence in the record's data
 * (0..1), passed in by the engine.
 */
export function normalizeRecord(
  raw: DiscoveryRawRecord,
  confidence: number,
): DiscoveryNormalizedRecord {
  const canonical = canonicalizeUrl(raw.website);
  const normalized: DiscoveryNormalizedRecord = {
    company: normalizeName(raw.company) ?? "",
    contactName: normalizeName(raw.contactName),
    email: normalizeEmail(raw.email),
    phone: normalizePhone(raw.phone),
    website: canonical?.url,
    canonicalDomain: canonical?.domain,
    city: normalizeCity(raw.city),
    region: normalizeRegion(raw.region),
    category: normalizeName(raw.category),
    address: normalizeName(raw.address),
    socials: (raw.socials ?? [])
      .map((social) => social?.trim())
      .filter((social): social is string => Boolean(social)),
    whatsapp: normalizePhone(raw.whatsapp),
    sourceReference: normalizeName(raw.sourceReference),
    notes: normalizeName(raw.notes),
    websiteStatus: deriveWebsiteReachability(raw.website),
    identityKeys: [],
    confidence,
  };
  normalized.identityKeys = buildIdentityKeys(normalized);
  return normalized;
}
