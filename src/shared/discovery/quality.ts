/**
 * Phase 4 — lead quality signals (pure, deterministic, documented).
 *
 * Three distinct metrics, deliberately kept apart so the UI never merges
 * unrelated concepts into one mysterious number:
 *
 *   1. Website verification confidence — how sure we are of a website
 *      verification outcome (derived from real verification signals).
 *   2. Lead data quality — how complete a lead's real public data is
 *      (a completeness %, never a quality claim about the business).
 *   3. Email status — how far an email was actually validated.
 *
 * HONESTY RULES (Phase 4 §8, §14, §17):
 *   - Confidence is only ever derived from verification signals that
 *     actually ran. No verification → no confidence (null), never a guess.
 *   - A 404/network failure is NOT evidence of "no website"; the
 *     confidence describes confidence in the *outcome* that was observed.
 *   - Completeness counts stored real fields only — missing data lowers
 *     the score, it is never fabricated to look complete.
 *   - "VALIDATED" email means syntax + domain-structure validation only.
 *     Delivery verification is not performed, so nothing here claims it.
 *
 * This module has no runtime dependencies (type-only imports) so both the
 * Convex backend and the browser bundle can import it.
 */
import type { WebsiteReachabilityState } from "../discovery";

/* --------------------- Website verification method ------------------------ */

export const WEBSITE_VERIFICATION_METHODS = [
  "REACHABILITY",
  "RESOLUTION_SEARCH",
] as const;
export type WebsiteVerificationMethod =
  (typeof WEBSITE_VERIFICATION_METHODS)[number];

export const WEBSITE_VERIFICATION_METHOD_LABELS: Record<
  WebsiteVerificationMethod,
  string
> = {
  REACHABILITY: "Direct reachability check",
  RESOLUTION_SEARCH: "Official-website resolution search",
};

/* --------------------- Confidence tiers (shared bands) -------------------- */

export const CONFIDENCE_TIERS = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "VERY_HIGH",
] as const;
export type ConfidenceTier = (typeof CONFIDENCE_TIERS)[number];

export const CONFIDENCE_TIER_LABELS: Record<ConfidenceTier, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  VERY_HIGH: "Very high",
};

/** Confidence bands (Phase 4 §8): 0–39 LOW, 40–69 MEDIUM, 70–89 HIGH, 90–100 VERY HIGH. */
export function confidenceTier(confidence: number): ConfidenceTier {
  if (confidence >= 90) return "VERY_HIGH";
  if (confidence >= 70) return "HIGH";
  if (confidence >= 40) return "MEDIUM";
  return "LOW";
}

/* ------------------------ Website confidence ------------------------------ */

export interface WebsiteConfidenceInput {
  method: WebsiteVerificationMethod;
  status: WebsiteReachabilityState;
  /** HTTP status observed during a reachability check, when available. */
  httpStatus?: number;
  /** RESOLUTION_SEARCH: whether the business itself was found in public sources. */
  businessFound?: boolean;
}

/**
 * Score how confident the verification outcome is, 0–100.
 *
 * The score describes confidence in the *outcome that was actually
 * observed* — it never converts a failed/unknown outcome into a
 * no-website claim. Rationale per outcome:
 *
 * REACHABILITY — a URL was fetched for real:
 *   HAS_WEBSITE 200            → 95  (site served successfully)
 *   HAS_WEBSITE other 2xx/3xx  → 88  (site responded, unusual code)
 *   UNREACHABLE with HTTP code → 78  (we saw the server's real response)
 *   UNREACHABLE DNS/network    → 60  (no server response observed)
 *   UNREACHABLE timeout        → 50  (slow/unresponsive — least certain)
 *   BLOCKED (403/429)          → 72  (we know we were blocked)
 *   INVALID_URL                → 88  (the recorded URL is deterministically unusable)
 *   CHECK_FAILED               → 25  (the check itself errored)
 *
 * RESOLUTION_SEARCH — a real search looked for an official website:
 *   NO_WEBSITE, business found → 90  (business exists publicly, no official site)
 *   NO_WEBSITE, not found      → 40  (absence NOT confirmed — low confidence)
 *   HAS_WEBSITE (resolved)     → 90  (a credible official site was found)
 *   unreachable/blocked/etc.   → same rules as REACHABILITY above
 *
 * Returns null when no verification evidence exists (e.g. status UNKNOWN —
 * the business was never verified, so no confidence can be claimed).
 */
export function scoreWebsiteConfidence(
  input: WebsiteConfidenceInput,
): number | null {
  if (input.status === "UNKNOWN") return null;
  if (input.method === "RESOLUTION_SEARCH" && input.status === "NO_WEBSITE") {
    return input.businessFound ? 90 : 40;
  }
  // A credible official site found by the resolution search — the search
  // itself is the evidence, so it carries the same confidence as the
  // documented no-website case.
  if (input.method === "RESOLUTION_SEARCH" && input.status === "HAS_WEBSITE") {
    return 90;
  }
  switch (input.status) {
    case "HAS_WEBSITE":
      return input.httpStatus === 200 ? 95 : 88;
    case "UNREACHABLE":
      if (input.httpStatus !== undefined) return 78;
      return 60;
    case "BLOCKED":
      return 72;
    case "INVALID_URL":
      return 88;
    case "CHECK_FAILED":
      return 25;
    default:
      return null;
  }
}

/* --------------------------- Lead data quality ---------------------------- */

export const DATA_QUALITY_WEIGHTS = {
  name: 10,
  category: 10,
  address: 15,
  city: 10,
  region: 10,
  country: 10,
  phone: 10,
  email: 10,
  googleMaps: 5,
  socials: 5,
  description: 5,
} as const;

export const DATA_QUALITY_TOTAL = 100;

export const DATA_QUALITY_FIELD_LABELS: Record<keyof typeof DATA_QUALITY_WEIGHTS, string> = {
  name: "Business name",
  category: "Category",
  address: "Street address",
  city: "City",
  region: "State / region",
  country: "Country / market",
  phone: "Phone",
  email: "Email",
  googleMaps: "Google Maps profile",
  socials: "Social profiles",
  description: "Description",
};

export interface DataQualityInput {
  hasName: boolean;
  hasCategory: boolean;
  hasAddress: boolean;
  hasCity: boolean;
  hasRegion: boolean;
  hasCountry: boolean;
  hasPhone: boolean;
  hasEmail: boolean;
  hasGoogleMaps: boolean;
  hasSocials: boolean;
  hasDescription: boolean;
}

export interface DataQualityAssessment {
  /** 0–100. Weighted sum of the real fields present — nothing is invented. */
  completeness: number;
  /** Human-readable fields that are missing (drives the UI's "unavailable" view). */
  missing: string[];
}

/**
 * Weighted completeness of a lead's real public data. Missing values are
 * reported explicitly so the UI can show them as unavailable rather than
 * hide them. Tiers reuse the shared confidence bands so every percentage
 * in the UI has the same meaning.
 */
export function scoreDataQuality(input: DataQualityInput): DataQualityAssessment {
  const present: Array<[keyof typeof DATA_QUALITY_WEIGHTS, boolean]> = [
    ["name", input.hasName],
    ["category", input.hasCategory],
    ["address", input.hasAddress],
    ["city", input.hasCity],
    ["region", input.hasRegion],
    ["country", input.hasCountry],
    ["phone", input.hasPhone],
    ["email", input.hasEmail],
    ["googleMaps", input.hasGoogleMaps],
    ["socials", input.hasSocials],
    ["description", input.hasDescription],
  ];
  let sum = 0;
  const missing: string[] = [];
  for (const [field, presentFlag] of present) {
    if (presentFlag) {
      sum += DATA_QUALITY_WEIGHTS[field];
    } else {
      missing.push(DATA_QUALITY_FIELD_LABELS[field]);
    }
  }
  return { completeness: sum, missing };
}

/* ----------------------------- Email status ------------------------------- */

export const EMAIL_STATUSES = ["VALIDATED", "FOUND", "UNVERIFIED"] as const;
export type EmailStatus = (typeof EMAIL_STATUSES)[number];

export const EMAIL_STATUS_LABELS: Record<EmailStatus, string> = {
  VALIDATED: "Validated",
  FOUND: "Found (unverified)",
  UNVERIFIED: "None / unknown",
};

/** Stronger than the form regex: local part + dotted domain with a TLD. */
const EMAIL_SYNTAX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+$/;
/** Domain has at least one dot (a real host structure, e.g. example.com). */
const EMAIL_HAS_DOTTED_DOMAIN = /^[^@]+@[^@]+\.[a-zA-Z]{2,}$/;

export interface EmailAssessment {
  status: EmailStatus;
  /** Normalized (trimmed, lowercased) address when usable. */
  normalized?: string;
  /** True when an address was found but failed syntax validation. */
  invalid?: boolean;
}

/**
 * Assess an email address honestly:
 *
 *   VALIDATED   — syntax AND domain structure (dotted domain with a TLD)
 *                 are valid. This is structure-level validation only; no
 *                 delivery verification is performed or claimed.
 *   FOUND       — an address was found and passes loose syntax but its
 *                 domain structure is weak (no dot/TLD), so it cannot be
 *                 considered validated.
 *   UNVERIFIED  — no usable address (absent, or failed syntax and dropped).
 *
 * An address that fails syntax is returned as invalid and is never
 * persisted as a lead email.
 */
export function assessEmail(value: string | undefined): EmailAssessment {
  const trimmed = value?.trim();
  if (!trimmed) return { status: "UNVERIFIED" };
  if (!EMAIL_SYNTAX.test(trimmed)) {
    return { status: "UNVERIFIED", invalid: true };
  }
  const normalized = trimmed.toLowerCase();
  if (!EMAIL_HAS_DOTTED_DOMAIN.test(normalized)) {
    return { status: "FOUND", normalized };
  }
  return { status: "VALIDATED", normalized };
}
