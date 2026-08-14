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
export const APP_VERSION = "0.1.0";
export const WORKSPACE_NAME = "Agency Studio";

/* ---------------------------------- Leads ---------------------------------- */

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

export const LEAD_STATUS_TONES: Record<LeadStatus, StatusTone> = {
  NEW: "neutral",
  CONTACTED: "info",
  QUALIFIED: "warning",
  PROPOSAL: "info",
  WON: "success",
  LOST: "error",
};

/* -------------------------------- Projects -------------------------------- */

export const PROJECT_STATUSES = [
  "DRAFT",
  "IN_PROGRESS",
  "REVIEW",
  "LIVE",
  "PAUSED",
  "ARCHIVED",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  DRAFT: "Draft",
  IN_PROGRESS: "In progress",
  REVIEW: "In review",
  LIVE: "Live",
  PAUSED: "Paused",
  ARCHIVED: "Archived",
};

export const PROJECT_STATUS_TONES: Record<ProjectStatus, StatusTone> = {
  DRAFT: "neutral",
  IN_PROGRESS: "info",
  REVIEW: "warning",
  LIVE: "success",
  PAUSED: "neutral",
  ARCHIVED: "disabled",
};

/* --------------------------------- Clients --------------------------------- */

export const CLIENT_STATUSES = ["ACTIVE", "PAUSED", "ARCHIVED"] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  ACTIVE: "Active",
  PAUSED: "Paused",
  ARCHIVED: "Archived",
};

export const CLIENT_STATUS_TONES: Record<ClientStatus, StatusTone> = {
  ACTIVE: "success",
  PAUSED: "warning",
  ARCHIVED: "disabled",
};

/* -------------------------------- Activity --------------------------------- */

export const ACTIVITY_TYPES = [
  "LEAD_CREATED",
  "LEAD_UPDATED",
  "LEAD_DELETED",
  "CLIENT_CREATED",
  "CLIENT_UPDATED",
  "CLIENT_DELETED",
  "PROJECT_CREATED",
  "PROJECT_UPDATED",
  "PROJECT_DELETED",
  "SYSTEM_EVENT",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  LEAD_CREATED: "Lead created",
  LEAD_UPDATED: "Lead updated",
  LEAD_DELETED: "Lead deleted",
  CLIENT_CREATED: "Client created",
  CLIENT_UPDATED: "Client updated",
  CLIENT_DELETED: "Client deleted",
  PROJECT_CREATED: "Project created",
  PROJECT_UPDATED: "Project updated",
  PROJECT_DELETED: "Project deleted",
  SYSTEM_EVENT: "System event",
};

/* -------------------------------- Providers -------------------------------- */

/**
 * Provider categories the architecture reserves for later phases.
 *
 * Phase 1 never connects to any of these — the `providers` table simply
 * records the slots, each reported honestly as NOT_CONFIGURED until a future
 * phase wires a real integration.
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
