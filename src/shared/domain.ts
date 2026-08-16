/**
 * Shared domain model for Agency Studio.
 *
 * Imported by both the Convex backend (schema + functions) and the React
 * client so that statuses, labels, and tone maps are defined exactly once.
 *
 * This module intentionally has no dependencies: it must stay importable
 * from server-side Convex bundles and client-side Vite bundles alike.
 */

export const APP_NAME = "Agency Studio";
export const APP_VERSION = "0.3.0";
export const WORKSPACE_NAME = "Agency Studio";
export const PHASE_LABEL = "Phase 03 · Discovery & Lead Intelligence";

/* -------------------------------- Pipeline -------------------------------- */

/**
 * Business pipeline stages, in operational order. WON and LOST are terminal.
 *
 * Phase 2 records every stage through `setStage` (which enforces the
 * transitions in `src/shared/pipeline.ts`) and writes a real activity row.
 * Nothing ever advances a record automatically.
 */
export const PIPELINE_STAGES = [
  "DISCOVERED",
  "QUALIFIED",
  "DEMO_READY",
  "OUTREACH_READY",
  "CONTACTED",
  "REPLIED",
  "INTERESTED",
  "PROPOSAL",
  "WON",
  "LOST",
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const PIPELINE_STAGE_LABELS: Record<PipelineStage, string> = {
  DISCOVERED: "Discovered",
  QUALIFIED: "Qualified",
  DEMO_READY: "Demo ready",
  OUTREACH_READY: "Outreach ready",
  CONTACTED: "Contacted",
  REPLIED: "Replied",
  INTERESTED: "Interested",
  PROPOSAL: "Proposal",
  WON: "Won",
  LOST: "Lost",
};

export const PIPELINE_STAGE_TONES: Record<PipelineStage, StatusTone> = {
  DISCOVERED: "neutral",
  QUALIFIED: "info",
  DEMO_READY: "info",
  OUTREACH_READY: "warning",
  CONTACTED: "info",
  REPLIED: "info",
  INTERESTED: "warning",
  PROPOSAL: "info",
  WON: "success",
  LOST: "error",
};

/** Stages that represent an engaged, qualified opportunity (not yet won/lost). */
export const ENGAGED_STAGES: readonly PipelineStage[] = [
  "QUALIFIED",
  "DEMO_READY",
  "OUTREACH_READY",
  "CONTACTED",
  "REPLIED",
  "INTERESTED",
  "PROPOSAL",
];

/** Stages representing an active conversation/opportunity in play. */
export const ACTIVE_OPPORTUNITY_STAGES: readonly PipelineStage[] = [
  "CONTACTED",
  "REPLIED",
  "INTERESTED",
  "PROPOSAL",
];

/* -------------------------------- Campaigns ------------------------------- */

export const CAMPAIGN_STATUSES = [
  "DRAFT",
  "READY",
  "RUNNING",
  "PAUSED",
  "COMPLETED",
  "CANCELLED",
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  DRAFT: "Draft",
  READY: "Ready",
  RUNNING: "Running",
  PAUSED: "Paused",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const CAMPAIGN_STATUS_TONES: Record<CampaignStatus, StatusTone> = {
  DRAFT: "neutral",
  READY: "info",
  RUNNING: "success",
  PAUSED: "warning",
  COMPLETED: "success",
  CANCELLED: "error",
};

/* --------------------------------- Markets --------------------------------- */

export interface MarketRegion {
  name: string;
}

export interface KnownMarket {
  code: string; // ISO-ish short code: US, CA, GB, NP
  name: string;
  flag: string;
  country: string;
  regions: string[];
}

/**
 * The initial market catalog. Configuration data (not fabricated business
 * data): it seeds the `markets` table so campaigns can select markets and
 * regions. Future phases may extend the catalog without schema changes.
 */
export const KNOWN_MARKETS: readonly KnownMarket[] = [
  {
    code: "US",
    name: "United States",
    flag: "🇺🇸",
    country: "United States",
    regions: [
      "Alabama",
      "Alaska",
      "Arizona",
      "Arkansas",
      "California",
      "Colorado",
      "Connecticut",
      "Delaware",
      "Florida",
      "Georgia",
      "Hawaii",
      "Idaho",
      "Illinois",
      "Indiana",
      "Iowa",
      "Kansas",
      "Kentucky",
      "Louisiana",
      "Maine",
      "Maryland",
      "Massachusetts",
      "Michigan",
      "Minnesota",
      "Mississippi",
      "Missouri",
      "Montana",
      "Nebraska",
      "Nevada",
      "New Hampshire",
      "New Jersey",
      "New Mexico",
      "New York",
      "North Carolina",
      "North Dakota",
      "Ohio",
      "Oklahoma",
      "Oregon",
      "Pennsylvania",
      "Rhode Island",
      "South Carolina",
      "South Dakota",
      "Tennessee",
      "Texas",
      "Utah",
      "Vermont",
      "Virginia",
      "Washington",
      "West Virginia",
      "Wisconsin",
      "Wyoming",
    ],
  },
  {
    code: "CA",
    name: "Canada",
    flag: "🇨🇦",
    country: "Canada",
    regions: [
      "Alberta",
      "British Columbia",
      "Manitoba",
      "New Brunswick",
      "Newfoundland and Labrador",
      "Northwest Territories",
      "Nova Scotia",
      "Nunavut",
      "Ontario",
      "Prince Edward Island",
      "Quebec",
      "Saskatchewan",
      "Yukon",
    ],
  },
  {
    code: "GB",
    name: "United Kingdom",
    flag: "🇬🇧",
    country: "United Kingdom",
    regions: [
      "Scotland",
      "Wales",
      "Northern Ireland",
      "North East England",
      "North West England",
      "Yorkshire and the Humber",
      "East Midlands",
      "West Midlands",
      "East of England",
      "London",
      "South East England",
      "South West England",
    ],
  },
  {
    code: "NP",
    name: "Nepal",
    flag: "🇳🇵",
    country: "Nepal",
    regions: [
      "Koshi",
      "Madhesh",
      "Bagmati",
      "Gandaki",
      "Lumbini",
      "Karnali",
      "Sudurpashchim",
    ],
  },
];

export const MARKET_COUNTRIES: readonly string[] = KNOWN_MARKETS.map(
  (market) => market.country,
);

/* ------------------------------ Website states ----------------------------- */

/**
 * Operator-assessed state of a business's current website. Phase 2 never
 * claims automated analysis: the value is set by the operator (default
 * UNKNOWN) or, later, by a real website-analysis system.
 */
export const WEBSITE_STATES = [
  "UNKNOWN",
  "NONE",
  "BASIC",
  "MODERN",
  "EXCELLENT",
] as const;
export type WebsiteState = (typeof WEBSITE_STATES)[number];

export const WEBSITE_STATE_LABELS: Record<WebsiteState, string> = {
  UNKNOWN: "Unknown",
  NONE: "No website",
  BASIC: "Basic",
  MODERN: "Modern",
  EXCELLENT: "Excellent",
};

export const WEBSITE_STATE_TONES: Record<WebsiteState, StatusTone> = {
  UNKNOWN: "neutral",
  NONE: "disabled",
  BASIC: "neutral",
  MODERN: "info",
  EXCELLENT: "success",
};

/* ---------------------------- Opportunity scoring --------------------------- */

export type ScoreTier = "LOW" | "MEDIUM" | "HIGH";

export const SCORE_TIER_LABELS: Record<ScoreTier, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};

export const SCORE_TIER_TONES: Record<ScoreTier, StatusTone> = {
  LOW: "neutral",
  MEDIUM: "warning",
  HIGH: "success",
};

/** Scores are 0-100. HIGH starts at 70 (used for the high-priority list). */
export const HIGH_PRIORITY_SCORE = 70;
export const MEDIUM_PRIORITY_SCORE = 40;

export function scoreTier(score: number | null | undefined): ScoreTier | null {
  if (score === null || score === undefined) return null;
  if (score >= HIGH_PRIORITY_SCORE) return "HIGH";
  if (score >= MEDIUM_PRIORITY_SCORE) return "MEDIUM";
  return "LOW";
}

export function isHighPriority(score: number | null | undefined): boolean {
  return scoreTier(score) === "HIGH";
}

/* -------------------------------- Businesses ------------------------------- */

export const BUSINESS_SOURCES = [
  "MANUAL",
  "REFERRAL",
  "DIRECTORY",
  "WEBSITE_RESEARCH",
  "SOCIAL",
  "PHASE1_MIGRATION",
  "DISCOVERY",
  "OTHER",
] as const;
export type BusinessSource = (typeof BUSINESS_SOURCES)[number];

export const BUSINESS_SOURCE_LABELS: Record<BusinessSource, string> = {
  MANUAL: "Manual entry",
  REFERRAL: "Referral",
  DIRECTORY: "Directory",
  WEBSITE_RESEARCH: "Website research",
  SOCIAL: "Social profile",
  PHASE1_MIGRATION: "Phase 1 migration",
  DISCOVERY: "Discovery import",
  OTHER: "Other",
};

/* --------------------------------- Clients --------------------------------- */

export const CLIENT_STATUSES = [
  "PROSPECT",
  "ACTIVE",
  "PAUSED",
  "COMPLETED",
  "ARCHIVED",
] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  PROSPECT: "Prospect",
  ACTIVE: "Active",
  PAUSED: "Paused",
  COMPLETED: "Completed",
  ARCHIVED: "Archived",
};

export const CLIENT_STATUS_TONES: Record<ClientStatus, StatusTone> = {
  PROSPECT: "info",
  ACTIVE: "success",
  PAUSED: "warning",
  COMPLETED: "success",
  ARCHIVED: "disabled",
};

/* --------------------------------- Projects -------------------------------- */

export const PROJECT_STATUSES = [
  "PLANNING",
  "IN_PROGRESS",
  "REVIEW",
  "APPROVED",
  "DELIVERED",
  "MAINTENANCE",
  "COMPLETED",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  PLANNING: "Planning",
  IN_PROGRESS: "In progress",
  REVIEW: "In review",
  APPROVED: "Approved",
  DELIVERED: "Delivered",
  MAINTENANCE: "Maintenance",
  COMPLETED: "Completed",
};

export const PROJECT_STATUS_TONES: Record<ProjectStatus, StatusTone> = {
  PLANNING: "neutral",
  IN_PROGRESS: "info",
  REVIEW: "warning",
  APPROVED: "info",
  DELIVERED: "success",
  MAINTENANCE: "neutral",
  COMPLETED: "success",
};

/* -------------------------------- Activity --------------------------------- */

export const ACTIVITY_TYPES = [
  // Campaigns
  "CAMPAIGN_CREATED",
  "CAMPAIGN_UPDATED",
  "CAMPAIGN_STATUS_CHANGED",
  "CAMPAIGN_DELETED",
  // Businesses
  "BUSINESS_CREATED",
  "BUSINESS_UPDATED",
  "BUSINESS_DELETED",
  "BUSINESS_STAGE_CHANGED",
  "BUSINESS_CONVERTED_TO_CLIENT",
  // Clients
  "CLIENT_CREATED",
  "CLIENT_UPDATED",
  "CLIENT_DELETED",
  // Projects
  "PROJECT_CREATED",
  "PROJECT_UPDATED",
  "PROJECT_DELETED",
  // Legacy Phase 1 lead rows (kept so old activity renders; no new writes)
  "LEAD_CREATED",
  "LEAD_UPDATED",
  "LEAD_DELETED",
  // Discovery (Phase 3)
  "DISCOVERY_STARTED",
  "DISCOVERY_RECORDS_IMPORTED",
  "DISCOVERY_COMPLETED",
  "DISCOVERY_PARTIAL",
  "DISCOVERY_FAILED",
  "DISCOVERY_CANCELLED",
  "DISCOVERY_WEBSITE_CHECKED",
  "DISCOVERY_WEBSITES_CHECKED",
  "DISCOVERY_RETRIED",
  "OPPORTUNITY_SCORED",
  // System
  "SYSTEM_EVENT",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  CAMPAIGN_CREATED: "Campaign created",
  CAMPAIGN_UPDATED: "Campaign updated",
  CAMPAIGN_STATUS_CHANGED: "Campaign status changed",
  CAMPAIGN_DELETED: "Campaign deleted",
  BUSINESS_CREATED: "Business created",
  BUSINESS_UPDATED: "Business updated",
  BUSINESS_DELETED: "Business deleted",
  BUSINESS_STAGE_CHANGED: "Stage changed",
  BUSINESS_CONVERTED_TO_CLIENT: "Converted to client",
  CLIENT_CREATED: "Client created",
  CLIENT_UPDATED: "Client updated",
  CLIENT_DELETED: "Client deleted",
  PROJECT_CREATED: "Project created",
  PROJECT_UPDATED: "Project updated",
  PROJECT_DELETED: "Project deleted",
  LEAD_CREATED: "Lead created",
  LEAD_UPDATED: "Lead updated",
  LEAD_DELETED: "Lead deleted",
  DISCOVERY_STARTED: "Discovery started",
  DISCOVERY_RECORDS_IMPORTED: "Records imported",
  DISCOVERY_COMPLETED: "Discovery completed",
  DISCOVERY_PARTIAL: "Discovery partially completed",
  DISCOVERY_FAILED: "Discovery failed",
  DISCOVERY_CANCELLED: "Discovery cancelled",
  DISCOVERY_WEBSITE_CHECKED: "Website status checked",
  DISCOVERY_WEBSITES_CHECKED: "Websites checked",
  DISCOVERY_RETRIED: "Failed records retried",
  OPPORTUNITY_SCORED: "Opportunity scored",
  SYSTEM_EVENT: "System event",
};

/* ------------------------------ Legacy Phase 1 ------------------------------
 * The `leads` table is retained in the schema only as the typed source for
 * the Phase 2 migration (`src/convex/migrate.ts`). After migration it is
 * empty and unused. New records use `businesses`. */

export const LEAD_STATUSES = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "PROPOSAL",
  "WON",
  "LOST",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  QUALIFIED: "Qualified",
  PROPOSAL: "Proposal",
  WON: "Won",
  LOST: "Lost",
};

/** Phase 1 lead status → Phase 2 pipeline stage (used by the migration). */
export const LEAD_STATUS_TO_STAGE: Record<LeadStatus, PipelineStage> = {
  NEW: "DISCOVERED",
  CONTACTED: "CONTACTED",
  QUALIFIED: "QUALIFIED",
  PROPOSAL: "PROPOSAL",
  WON: "WON",
  LOST: "LOST",
};

/* -------------------------------- Providers -------------------------------- */

/**
 * Provider categories the architecture reserves for later phases.
 *
 * Phase 2 still connects to none of them — the `providers` table simply
 * records the slots, each reported honestly as NOT_CONFIGURED until a
 * future phase wires a real integration.
 */
export const PROVIDER_TYPES = [
  "AI",
  "SCRAPING",
  "AUTOMATION",
  "EMAIL",
  "PAYMENTS",
  "DEPLOYMENT",
  "ANALYTICS",
] as const;
export type ProviderType = (typeof PROVIDER_TYPES)[number];

export const PROVIDER_STATUSES = [
  "NOT_CONFIGURED",
  "HEALTHY",
  "ERROR",
  "DISABLED",
] as const;
export type ProviderStatus = (typeof PROVIDER_STATUSES)[number];

export const PROVIDER_STATUS_LABELS: Record<ProviderStatus, string> = {
  NOT_CONFIGURED: "Not configured",
  HEALTHY: "Healthy",
  ERROR: "Error",
  DISABLED: "Disabled",
};

export const PROVIDER_STATUS_TONES: Record<ProviderStatus, StatusTone> = {
  NOT_CONFIGURED: "neutral",
  HEALTHY: "success",
  ERROR: "error",
  DISABLED: "disabled",
};

export const KNOWN_PROVIDERS: ReadonlyArray<{
  type: ProviderType;
  name: string;
  capabilities: ReadonlyArray<string>;
}> = [
  {
    type: "AI",
    name: "AI providers",
    capabilities: ["LLM completions", "Embeddings"],
  },
  {
    type: "SCRAPING",
    name: "Business discovery",
    capabilities: ["Public directory research"],
  },
  {
    type: "AUTOMATION",
    name: "Automation",
    capabilities: ["Workflows", "Webhooks"],
  },
  {
    type: "EMAIL",
    name: "Email",
    capabilities: ["Transactional mail", "Outreach"],
  },
  {
    type: "PAYMENTS",
    name: "Payments",
    capabilities: ["Invoicing", "Payouts"],
  },
  {
    type: "DEPLOYMENT",
    name: "Deployment",
    capabilities: ["Preview hosting", "Production hosting"],
  },
  {
    type: "ANALYTICS",
    name: "Analytics",
    capabilities: ["Usage metrics", "Reports"],
  },
];

/* ------------------------------ System health ------------------------------ */

export const HEALTH_STATUSES = [
  "HEALTHY",
  "DEGRADED",
  "ERROR",
  "NOT_CONFIGURED",
] as const;
export type HealthStatus = (typeof HEALTH_STATUSES)[number];

export const HEALTH_STATUS_LABELS: Record<HealthStatus, string> = {
  HEALTHY: "Healthy",
  DEGRADED: "Degraded",
  ERROR: "Error",
  NOT_CONFIGURED: "Not configured",
};

export const HEALTH_STATUS_TONES: Record<HealthStatus, StatusTone> = {
  HEALTHY: "success",
  DEGRADED: "warning",
  ERROR: "error",
  NOT_CONFIGURED: "neutral",
};

/**
 * Shape returned by `system.healthCheck` (see src/convex/system.ts).
 * Shared so the client renders exactly what the backend reports.
 */
export interface HealthCheckReport {
  status: HealthStatus;
  checkedAt: number;
  application: { name: string; version: string; status: "HEALTHY" };
  database: {
    status: "HEALTHY" | "ERROR";
    latencyMs?: number;
    checkedAt: number;
    error?: string;
  };
  auth: {
    methods: Array<{ id: string; status: "CONFIGURED" }>;
  };
  providers: Array<{
    type: ProviderType;
    name: string;
    status: ProviderStatus;
    capabilities: Array<string>;
    lastCheckedAt?: number;
  }>;
  system: { firstSeenAt: number | null };
}

/* ---------------------------------- Tones ---------------------------------- */

export type StatusTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "error"
  | "disabled";

/** Tailwind classes for each tone. Keep the strings literal so Tailwind scans them. */
export const TONE_CLASSES: Record<StatusTone, { dot: string; text: string }> = {
  neutral: { dot: "bg-muted-foreground/60", text: "text-muted-foreground" },
  info: { dot: "bg-sky-700", text: "text-sky-800 dark:text-sky-300" },
  success: { dot: "bg-emerald-700", text: "text-emerald-800 dark:text-emerald-300" },
  warning: { dot: "bg-amber-600", text: "text-amber-800 dark:text-amber-300" },
  error: { dot: "bg-red-700", text: "text-red-800 dark:text-red-300" },
  disabled: { dot: "bg-muted-foreground/30", text: "text-muted-foreground/70" },
};
