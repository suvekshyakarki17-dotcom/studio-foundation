/**
 * Discovery & Lead Intelligence — shared domain model for Phase 3.
 *
 * Imported by both the Convex backend (schema + functions) and the React
 * client so that providers, run states, result states, and labels are
 * defined exactly once. Like src/shared/domain.ts, this module has no
 * runtime dependencies (it only imports a type, which is erased) so it
 * stays importable from server-side Convex bundles and client bundles.
 *
 * HONESTY RULE: nothing in this module claims a provider is connected or
 * that discovery happened. Provider rows carry an explicit `configured`
 * flag, and runs only ever report the states the engine actually walked.
 */
import type { StatusTone } from "./domain";

/* ------------------------------ Run states ------------------------------- */

/**
 * Lifecycle of a discovery run.
 *
 * Only states with real behavior are produced by the engine:
 * - QUEUED      — created, awaiting execution (for import providers: awaiting data)
 * - RUNNING     — actively processing records
 * - COMPLETED   — finished with no failed records
 * - PARTIAL     - finished, but at least one record failed processing
 * - FAILED      - the run itself failed (e.g. provider not configured)
 * - CANCELLED   - cancelled by the operator
 *
 * PAUSED and CANCELLING are reserved for future asynchronous providers
 * (background jobs with pause/resume) and are never set by Phase 3.
 */
export const DISCOVERY_RUN_STATUSES = [
  "QUEUED",
  "RUNNING",
  "PAUSED",
  "CANCELLING",
  "COMPLETED",
  "PARTIAL",
  "FAILED",
  "CANCELLED",
] as const;
export type DiscoveryRunStatus = (typeof DISCOVERY_RUN_STATUSES)[number];

export const DISCOVERY_RUN_STATUS_LABELS: Record<DiscoveryRunStatus, string> = {
  QUEUED: "Queued",
  RUNNING: "Running",
  PAUSED: "Paused",
  CANCELLING: "Cancelling",
  COMPLETED: "Completed",
  PARTIAL: "Partially completed",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

export const DISCOVERY_RUN_STATUS_TONES: Record<DiscoveryRunStatus, StatusTone> = {
  QUEUED: "neutral",
  RUNNING: "info",
  PAUSED: "neutral",
  CANCELLING: "warning",
  COMPLETED: "success",
  PARTIAL: "warning",
  FAILED: "error",
  CANCELLED: "disabled",
};

/** Runs in these states are finished and will not change again. */
export const TERMINAL_RUN_STATUSES: readonly DiscoveryRunStatus[] = [
  "COMPLETED",
  "PARTIAL",
  "FAILED",
  "CANCELLED",
];

/**
 * Whether a run may move from `from` to `to`. Enforced by the engine so a
 * finished run can never silently flip back to active.
 */
export function canRunTransition(
  from: DiscoveryRunStatus,
  to: DiscoveryRunStatus,
): boolean {
  if (TERMINAL_RUN_STATUSES.includes(from)) return false;
  if (from === "QUEUED") {
    return to === "RUNNING" || to === "CANCELLED" || to === "FAILED";
  }
  if (from === "RUNNING") {
    return (
      to === "COMPLETED" ||
      to === "PARTIAL" ||
      to === "FAILED" ||
      to === "CANCELLED"
    );
  }
  if (from === "PAUSED") return to === "RUNNING" || to === "CANCELLED";
  if (from === "CANCELLING") return to === "CANCELLED";
  return false;
}

/* ----------------------------- Result states ----------------------------- */

/** Per-record outcome of the deterministic pipeline. */
export const DISCOVERY_RESULT_STATUSES = [
  "ACCEPTED",
  "DUPLICATE",
  "REJECTED",
  "FAILED",
] as const;
export type DiscoveryResultStatus = (typeof DISCOVERY_RESULT_STATUSES)[number];

export const DISCOVERY_RESULT_STATUS_LABELS: Record<DiscoveryResultStatus, string> = {
  ACCEPTED: "Accepted",
  DUPLICATE: "Duplicate",
  REJECTED: "Rejected",
  FAILED: "Failed",
};

export const DISCOVERY_RESULT_STATUS_TONES: Record<DiscoveryResultStatus, StatusTone> = {
  ACCEPTED: "success",
  DUPLICATE: "warning",
  REJECTED: "neutral",
  FAILED: "error",
};

/* ------------------------------ Error codes ------------------------------ */

/**
 * Error taxonomy for discovery runs. The engine maps provider/runtime
 * failures onto these codes so the UI can translate them into honest,
 * understandable messages.
 */
export const DISCOVERY_ERROR_CODES = [
  "PROVIDER_NOT_CONFIGURED",
  "AUTHENTICATION",
  "RATE_LIMITED",
  "INVALID_REQUEST",
  "PROVIDER_UNAVAILABLE",
  "NETWORK",
  "MALFORMED_RESULT",
  "VALIDATION_FAILURE",
  "CANCELLED",
  "INTERNAL",
] as const;
export type DiscoveryErrorCode = (typeof DISCOVERY_ERROR_CODES)[number];

export const DISCOVERY_ERROR_LABELS: Record<DiscoveryErrorCode, string> = {
  PROVIDER_NOT_CONFIGURED: "Provider not configured",
  AUTHENTICATION: "Authentication failed",
  RATE_LIMITED: "Rate limited by the provider",
  INVALID_REQUEST: "Invalid request",
  PROVIDER_UNAVAILABLE: "Provider unavailable",
  NETWORK: "Network failure",
  MALFORMED_RESULT: "Malformed result",
  VALIDATION_FAILURE: "Validation failure",
  CANCELLED: "Cancelled",
  INTERNAL: "Internal error",
};

/* ------------------------- Website reachability --------------------------- */

/**
 * Existence/reachability axis for a business website (Phase 3 basic
 * foundation). Distinct from `websiteState` (operator-assessed quality).
 * Values are set deterministically: derived from the record at import, or
 * from a real reachability check. Strong quality claims belong to a later
 * phase.
 */
export const WEBSITE_REACHABILITY_STATES = [
  "UNKNOWN",
  "HAS_WEBSITE",
  "NO_WEBSITE",
  "UNREACHABLE",
  "INVALID_URL",
  "BLOCKED",
  "CHECK_FAILED",
] as const;
export type WebsiteReachabilityState =
  (typeof WEBSITE_REACHABILITY_STATES)[number];

export const WEBSITE_REACHABILITY_LABELS: Record<
  WebsiteReachabilityState,
  string
> = {
  UNKNOWN: "Unknown",
  HAS_WEBSITE: "Has website",
  NO_WEBSITE: "No website",
  UNREACHABLE: "Unreachable",
  INVALID_URL: "Invalid URL",
  BLOCKED: "Blocked",
  CHECK_FAILED: "Check failed",
};

export const WEBSITE_REACHABILITY_TONES: Record<
  WebsiteReachabilityState,
  StatusTone
> = {
  UNKNOWN: "neutral",
  HAS_WEBSITE: "success",
  NO_WEBSITE: "warning",
  UNREACHABLE: "warning",
  INVALID_URL: "neutral",
  BLOCKED: "error",
  CHECK_FAILED: "error",
};

/* ------------------------ Lead qualification gate -------------------------- */

/**
 * The strict qualification outcome for an accepted business under the
 * campaign's website target.
 *
 * - QUALIFIED            — confirmed NO_WEBSITE (or the campaign targets ANY
 *                          website state) → enters the qualified lead list
 * - REJECTED_HAS_WEBSITE — a reachable official website was confirmed →
 *                          excluded from no-website leads
 * - NOT_QUALIFIED        — UNKNOWN / UNREACHABLE / BLOCKED / INVALID_URL /
 *                          CHECK_FAILED — absence was never positively
 *                          verified → excluded from no-website leads
 */
export const LEAD_QUALIFICATIONS = [
  "QUALIFIED",
  "REJECTED_HAS_WEBSITE",
  "NOT_QUALIFIED",
] as const;
export type LeadQualification = (typeof LEAD_QUALIFICATIONS)[number];

export const LEAD_QUALIFICATION_LABELS: Record<LeadQualification, string> = {
  QUALIFIED: "Qualified — no website",
  REJECTED_HAS_WEBSITE: "Rejected — has website",
  NOT_QUALIFIED: "Not qualified",
};

export const LEAD_QUALIFICATION_TONES: Record<LeadQualification, StatusTone> = {
  QUALIFIED: "success",
  REJECTED_HAS_WEBSITE: "error",
  NOT_QUALIFIED: "neutral",
};

/* ------------------------------ Website target ---------------------------- */

/**
 * What a campaign's discovery engine should qualify. The default for the
 * agency is NO_WEBSITE_ONLY: only businesses positively confirmed to have
 * no official website enter the qualified lead list. ANY qualifies every
 * accepted business regardless of website state (used for lead lists the
 * operator explicitly wants in full).
 */
export const WEBSITE_TARGETS = ["NO_WEBSITE_ONLY", "ANY"] as const;
export type WebsiteTarget = (typeof WEBSITE_TARGETS)[number];

export const WEBSITE_TARGET_LABELS: Record<WebsiteTarget, string> = {
  NO_WEBSITE_ONLY: "No website only",
  ANY: "Any website state",
};

export const DEFAULT_WEBSITE_TARGET: WebsiteTarget = "NO_WEBSITE_ONLY";

/**
 * The strict no-website qualification gate. Only positive evidence qualifies:
 *
 *   CONFIRMED_NO_WEBSITE → QUALIFIED
 *   CONFIRMED_WEBSITE    → REJECTED_HAS_WEBSITE
 *   UNKNOWN / UNREACHABLE / BLOCKED / INVALID_URL / CHECK_FAILED
 *                        → NOT_QUALIFIED
 *
 * Never turns UNKNOWN into NO_WEBSITE and never treats an unreachable URL
 * as proof of absence.
 */
export function qualifyLead(
  websiteStatus: WebsiteReachabilityState,
  websiteTarget: WebsiteTarget,
): { qualification: LeadQualification; reason: string } {
  if (websiteTarget !== DEFAULT_WEBSITE_TARGET) {
    return {
      qualification: "QUALIFIED",
      reason:
        "Campaign targets every discovered business regardless of website state.",
    };
  }
  switch (websiteStatus) {
    case "NO_WEBSITE":
      return {
        qualification: "QUALIFIED",
        reason:
          "Verified: no official business website could be found after a real verification search.",
      };
    case "HAS_WEBSITE":
      return {
        qualification: "REJECTED_HAS_WEBSITE",
        reason: "Verified: a reachable official business website exists.",
      };
    case "UNREACHABLE":
      return {
        qualification: "NOT_QUALIFIED",
        reason:
          "A website URL exists but could not be reached — that is not proof the business has no website.",
      };
    case "BLOCKED":
      return {
        qualification: "NOT_QUALIFIED",
        reason:
          "The website check was blocked (HTTP 403/429) — the site may still exist.",
      };
    case "INVALID_URL":
      return {
        qualification: "NOT_QUALIFIED",
        reason: "The recorded website URL is unusable — the real site is unverified.",
      };
    case "CHECK_FAILED":
      return {
        qualification: "NOT_QUALIFIED",
        reason: "The website check failed — absence was not verified.",
      };
    case "UNKNOWN":
      return {
        qualification: "NOT_QUALIFIED",
        reason:
          "Unverified — no positive evidence that the business has no website.",
      };
  }
}

/* -------------------------- Website resolution ---------------------------- */

/**
 * Outcome of the official-website resolution step (a real verification
 * search for businesses the provider returned without a usable URL).
 * Only CONFIRMED_NO_WEBSITE may ever set the NO_WEBSITE reachability
 * state; everything else stays UNKNOWN and unqualified.
 */
export type WebsiteResolutionOutcome =
  | {
      resolution: "FOUND_WEBSITE";
      website: string;
      sourceReference?: string;
      details?: string;
    }
  | {
      resolution: "CONFIRMED_NO_WEBSITE";
      sourceReference?: string;
      details?: string;
      /** Real, publicly found values — never fabricated. */
      enrichment?: {
        phone?: string;
        email?: string;
        address?: string;
        googleMapsUrl?: string;
        instagram?: string;
        facebook?: string;
        tiktok?: string;
        linkedin?: string;
      };
    }
  | { resolution: "NOT_FOUND"; details?: string }
  | { resolution: "FAILED"; details?: string };

/* ------------------------------ Providers -------------------------------- */

export type DiscoveryProviderKind = "IMPORT" | "API";

/**
 * A discovery provider plug point. The engine routes runs through this
 * registry; a provider is only ever presented as usable when `configured`
 * is true. Anything else is shown honestly as not configured, with the
 * exact requirements documented.
 */
export interface DiscoveryProviderDefinition {
  slug: string;
  name: string;
  kind: DiscoveryProviderKind;
  /** Whether this provider can execute in the current deployment. */
  configured: boolean;
  description: string;
  capabilities: readonly string[];
  /** What the operator must provide before this provider can run. */
  requirements: readonly string[];
  /** Environment variables the backend would read (actions only). */
  envVars: readonly string[];
  /** Where the integration point is for a future phase. */
  docs: string;
}

export const DISCOVERY_PROVIDERS: readonly DiscoveryProviderDefinition[] = [
  {
    slug: "csv-import",
    name: "CSV / manual import",
    kind: "IMPORT",
    configured: true,
    description:
      "Import business records you already legitimately have — a directory export, research notes, or a list you compiled. Every record runs the real pipeline: normalize → validate → deduplicate → persist, with full provenance.",
    capabilities: [
      "Operator-provided records",
      "Normalization",
      "Validation",
      "Deduplication",
      "Provenance",
    ],
    requirements: [],
    envVars: [],
    docs: "Records are pasted in the Discovery page. No external credentials are needed because the data is operator-provided.",
  },
  {
    slug: "google-places",
    name: "Google Places API",
    kind: "API",
    configured: false,
    description:
      "Live business search from the official Google Places API. Not configured in this deployment — the engine boundary exists, and the provider can be wired once a key is available.",
    capabilities: ["Place search", "Place details", "Official API"],
    requirements: [
      "Google Cloud project with the Places API enabled",
      "GOOGLE_PLACES_API_KEY set as a project secret",
    ],
    envVars: ["GOOGLE_PLACES_API_KEY"],
    docs: "Integration point: implement the provider adapter in src/convex/discovery.ts against DISCOVERY_PROVIDERS (slug \"google-places\"), read the key from process.env in an action, and route raw results through the same normalize/validate/dedupe/persist pipeline.",
  },
  {
    slug: "scrapegraphai",
    name: "ScrapeGraphAI",
    kind: "API",
    /** Static baseline only — the live flag is overlaid server-side from */
    /** SGAI_API_KEY presence by the providerStatus action (src/convex/ */
    /** scrapegraphai.ts) so this module stays environment-free. */
    configured: false,
    description:
      "Live local-business discovery from the ScrapeGraphAI V2 search API: a real web search scoped to the campaign's market/location/category plus AI extraction of business records. Results run the exact same normalize → validate → deduplicate → persist pipeline as every other provider, with provenance.",
    capabilities: ["Web search", "Structured extraction", "Real results"],
    requirements: ["SGAI_API_KEY set as a project secret"],
    envVars: ["SGAI_API_KEY"],
    docs: "Backed by src/convex/scrapegraphai.ts (actions) + src/shared/discovery/scrapegraphai.ts (pure adapter). The key is read server-side via process.env.SGAI_API_KEY — never from client code.",
  },
];

/* ------------------------------ Record shapes ---------------------------- */

/**
 * A raw record as received from a provider (or pasted by the operator).
 * Untrusted: the pipeline normalizes and validates before anything is
 * persisted. Original values are preserved in the raw snapshot for
 * provenance.
 */
export interface DiscoveryRawRecord {
  company: string;
  contactName?: string;
  email?: string;
  phone?: string;
  website?: string;
  city?: string;
  region?: string;
  category?: string;
  address?: string;
  socials?: string[];
  whatsapp?: string;
  sourceReference?: string;
  notes?: string;
}

/**
 * A record after deterministic normalization. `identityKeys` are the
 * deduplication fingerprints; `websiteStatus` is derived (never claimed);
 * `confidence` is the provider's confidence in the record's data.
 */
export interface DiscoveryNormalizedRecord {
  company: string;
  contactName?: string;
  email?: string;
  phone?: string;
  website?: string;
  canonicalDomain?: string;
  city?: string;
  region?: string;
  category?: string;
  address?: string;
  socials?: string[];
  whatsapp?: string;
  sourceReference?: string;
  notes?: string;
  websiteStatus: WebsiteReachabilityState;
  identityKeys: string[];
  confidence: number;
}

/* --------------------------- Campaign readiness -------------------------- */

/**
 * A campaign is discovery-ready when it carries the configuration the
 * engine needs: market, region, location (city), category, and a target
 * count. The UI shows exactly which fields are missing rather than letting
 * the operator launch an impossible job.
 */
export const DISCOVERY_REQUIRED_FIELDS = [
  "market",
  "region",
  "city",
  "category",
  "target count",
] as const;

export interface CampaignDiscoveryConfig {
  marketCode?: string;
  region?: string;
  city?: string;
  category?: string;
  targetCount?: number;
}

export function discoveryReadiness(campaign: CampaignDiscoveryConfig): {
  ready: boolean;
  missing: string[];
} {
  const missing: string[] = [];
  if (!campaign.marketCode) missing.push("market");
  if (!campaign.region) missing.push("region");
  if (!campaign.city) missing.push("city");
  if (!campaign.category) missing.push("category");
  if (!campaign.targetCount || campaign.targetCount < 1) {
    missing.push("target count");
  }
  return { ready: missing.length === 0, missing };
}

/* ----------------------------- Duplicate hints --------------------------- */

export type DuplicateSignal = "domain" | "phone" | "email" | "name+city";

export const DUPLICATE_SIGNAL_LABELS: Record<DuplicateSignal, string> = {
  domain: "Same domain",
  phone: "Same phone",
  email: "Same email",
  "name+city": "Same name + city",
};
