/**
 * Conservative identity-based deduplication.
 *
 * The same business can legitimately appear from multiple providers, runs,
 * or submissions. Rather than fuzzy "looks similar" matching, we match on
 * deterministic identity signals, strongest first:
 *
 *   1. email        (high confidence)
 *   2. canonical domain (high confidence — different domains are never merged)
 *   3. normalized phone (high confidence)
 *   4. exact normalized name + city (medium confidence)
 *
 * When no signal matches, the record is treated as new — records are never
 * destroyed and never merged on weak evidence.
 */
import type { DiscoveryNormalizedRecord, DuplicateSignal } from "../discovery";

/** Identity fields of an existing business, pre-computed for matching. */
export interface BusinessIdentity {
  id: string;
  nameKey: string;
  cityKey?: string;
  canonicalDomain?: string;
  normalizedPhone?: string;
  normalizedEmail?: string;
}

export interface DuplicateMatch {
  matched: boolean;
  businessId?: string;
  signal?: DuplicateSignal;
}

/** Build the identity fingerprint of an existing business record. */
export function toBusinessIdentity(input: {
  id: string;
  company: string;
  city?: string;
  website?: string;
  phone?: string;
  email?: string;
}): BusinessIdentity {
  return {
    id: input.id,
    nameKey: input.company.trim().toLowerCase(),
    cityKey: input.city?.trim().toLowerCase(),
    canonicalDomain: input.website ? extractDomain(input.website) : undefined,
    normalizedPhone: input.phone ? extractPhone(input.phone) : undefined,
    normalizedEmail: input.email?.trim().toLowerCase(),
  };
}

/**
 * Find a likely duplicate for a normalized record among existing
 * businesses. Returns the strongest single match; when none is strong
 * enough, the record stays separate.
 */
export function findDuplicate(
  record: DiscoveryNormalizedRecord,
  candidates: readonly BusinessIdentity[],
): DuplicateMatch {
  const nameKey = record.company.trim().toLowerCase();
  const cityKey = record.city?.trim().toLowerCase();

  const byEmail =
    record.email &&
    candidates.find((candidate) => candidate.normalizedEmail === record.email);
  if (byEmail) return match(byEmail, "email");

  const byDomain =
    record.canonicalDomain &&
    candidates.find(
      (candidate) => candidate.canonicalDomain === record.canonicalDomain,
    );
  if (byDomain) return match(byDomain, "domain");

  const byPhone =
    record.phone &&
    candidates.find(
      (candidate) => candidate.normalizedPhone === record.phone,
    );
  if (byPhone) return match(byPhone, "phone");

  if (nameKey && cityKey) {
    const byNameCity = candidates.find(
      (candidate) =>
        candidate.nameKey === nameKey && candidate.cityKey === cityKey,
    );
    if (byNameCity) return match(byNameCity, "name+city");
  }

  return { matched: false };
}

function match(
  candidate: BusinessIdentity,
  signal: DuplicateSignal,
): DuplicateMatch {
  return { matched: true, businessId: candidate.id, signal };
}

/**
 * Extract the canonical domain of a website for identity purposes, without
 * throwing on malformed input. Reuses the URL canonicalizer so identity
 * keys always agree with what was persisted.
 */
function extractDomain(website: string | undefined): string | undefined {
  if (!website) return undefined;
  // Local implementation to keep this module dependency-free: normalize the
  // host the same way canonicalizeUrl does.
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(website)
    ? website
    : `https://${website}`;
  let host: string;
  try {
    host = new URL(withScheme).hostname.toLowerCase();
  } catch {
    return undefined;
  }
  if (!host || !host.includes(".") || !/^[a-z0-9.-]+$/.test(host)) {
    return undefined;
  }
  return host.startsWith("www.") ? host.slice(4) : host;
}

/** Normalized phone for identity purposes (mirrors normalizePhone). */
function extractPhone(phone: string | undefined): string | undefined {
  if (!phone) return undefined;
  let digits = phone.trim().replace(/[\s\-().]/g, "");
  if (!digits) return undefined;
  if (digits.startsWith("00")) {
    digits = "+" + digits.slice(2);
  } else if (!digits.startsWith("+")) {
    digits = "+" + digits;
  }
  return /^\+[1-9]\d{6,14}$/.test(digits) ? digits : undefined;
}
