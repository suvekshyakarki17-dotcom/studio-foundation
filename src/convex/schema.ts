import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";
import {
  DISCOVERY_RESULT_STATUSES,
  DISCOVERY_RUN_STATUSES,
  WEBSITE_REACHABILITY_STATES,
} from "../shared/discovery";
import {
  ACTIVITY_TYPES,
  BUSINESS_SOURCES,
  CAMPAIGN_STATUSES,
  CLIENT_STATUSES,
  HEALTH_STATUSES,
  LEAD_STATUSES,
  PIPELINE_STAGES,
  PROJECT_STATUSES,
  PROVIDER_STATUSES,
  PROVIDER_TYPES,
  WEBSITE_STATES,
} from "../shared/domain";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

// --- Domain status validators (values come from ../shared/domain) ---

export const leadStatusValidator = v.union(
  ...LEAD_STATUSES.map((status) => v.literal(status)),
);
export type LeadStatusValidator = Infer<typeof leadStatusValidator>;

export const projectStatusValidator = v.union(
  ...PROJECT_STATUSES.map((status) => v.literal(status)),
);
export type ProjectStatusValidator = Infer<typeof projectStatusValidator>;

export const clientStatusValidator = v.union(
  ...CLIENT_STATUSES.map((status) => v.literal(status)),
);
export type ClientStatusValidator = Infer<typeof clientStatusValidator>;

export const activityTypeValidator = v.union(
  ...ACTIVITY_TYPES.map((type) => v.literal(type)),
);
export type ActivityTypeValidator = Infer<typeof activityTypeValidator>;

export const providerTypeValidator = v.union(
  ...PROVIDER_TYPES.map((type) => v.literal(type)),
);
export type ProviderTypeValidator = Infer<typeof providerTypeValidator>;

export const providerStatusValidator = v.union(
  ...PROVIDER_STATUSES.map((status) => v.literal(status)),
);
export type ProviderStatusValidator = Infer<typeof providerStatusValidator>;

export const healthStatusValidator = v.union(
  ...HEALTH_STATUSES.map((status) => v.literal(status)),
);
export type HealthStatusValidator = Infer<typeof healthStatusValidator>;

export const pipelineStageValidator = v.union(
  ...PIPELINE_STAGES.map((stage) => v.literal(stage)),
);
export type PipelineStageValidator = Infer<typeof pipelineStageValidator>;

export const campaignStatusValidator = v.union(
  ...CAMPAIGN_STATUSES.map((status) => v.literal(status)),
);
export type CampaignStatusValidator = Infer<typeof campaignStatusValidator>;

export const websiteStateValidator = v.union(
  ...WEBSITE_STATES.map((state) => v.literal(state)),
);
export type WebsiteStateValidator = Infer<typeof websiteStateValidator>;

export const websiteReachabilityValidator = v.union(
  ...WEBSITE_REACHABILITY_STATES.map((state) => v.literal(state)),
);
export type WebsiteReachabilityValidator = Infer<
  typeof websiteReachabilityValidator
>;

export const discoveryRunStatusValidator = v.union(
  ...DISCOVERY_RUN_STATUSES.map((status) => v.literal(status)),
);
export type DiscoveryRunStatusValidator = Infer<
  typeof discoveryRunStatusValidator
>;

export const discoveryResultStatusValidator = v.union(
  ...DISCOVERY_RESULT_STATUSES.map((status) => v.literal(status)),
);
export type DiscoveryResultStatusValidator = Infer<
  typeof discoveryResultStatusValidator
>;

/** Raw provider/operator record snapshot — untrusted, preserved for provenance. */
export const discoveryRawRecordValidator = v.object({
  company: v.string(),
  contactName: v.optional(v.string()),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  website: v.optional(v.string()),
  city: v.optional(v.string()),
  region: v.optional(v.string()),
  category: v.optional(v.string()),
  address: v.optional(v.string()),
  socials: v.optional(v.array(v.string())),
  whatsapp: v.optional(v.string()),
  sourceReference: v.optional(v.string()),
  notes: v.optional(v.string()),
});
export type DiscoveryRawRecordValidator = Infer<typeof discoveryRawRecordValidator>;

/** Canonical view produced by the deterministic normalization pipeline. */
export const discoveryNormalizedRecordValidator = v.object({
  company: v.string(),
  contactName: v.optional(v.string()),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  website: v.optional(v.string()),
  canonicalDomain: v.optional(v.string()),
  city: v.optional(v.string()),
  region: v.optional(v.string()),
  category: v.optional(v.string()),
  address: v.optional(v.string()),
  socials: v.optional(v.array(v.string())),
  whatsapp: v.optional(v.string()),
  sourceReference: v.optional(v.string()),
  notes: v.optional(v.string()),
  websiteStatus: websiteReachabilityValidator,
  identityKeys: v.array(v.string()),
  confidence: v.number(),
});
export type DiscoveryNormalizedRecordValidator = Infer<
  typeof discoveryNormalizedRecordValidator
>;

export const businessSourceValidator = v.union(
  ...BUSINESS_SOURCES.map((source) => v.literal(source)),
);
export type BusinessSourceValidator = Infer<typeof businessSourceValidator>;

/**
 * Automatic opportunity assessment (Phase 3 lead intelligence). Derived
 * deterministically from real signals by src/shared/discovery/score.ts —
 * never fabricated. `factors` are the three axis sub-scores (website /
 * contact / completeness) so the UI can show exactly why a business scored
 * the way it did.
 */
export const opportunityScoreValidator = v.object({
  score: v.number(),
  factors: v.object({
    website: v.number(),
    contact: v.number(),
    completeness: v.number(),
  }),
  scoredAt: v.number(),
});
export type OpportunityScoreValidator = Infer<typeof opportunityScoreValidator>;

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove
    }).index("email", ["email"]), // index for the email. do not remove or modify

    // --- Phase 1 domain tables ---

    /** Phase 2 command-center tables */

    /**
     * The market catalog. Configuration data seeded idempotently from
     * KNOWN_MARKETS (see src/convex/markets.ts) — not fabricated business
     * data. Campaigns and businesses reference markets by ISO-ish code.
     */
    markets: defineTable({
      code: v.string(),
      name: v.string(),
      flag: v.string(),
      country: v.string(),
      regions: v.array(v.string()),
    }).index("by_code", ["code"]),

    /**
     * An outreach/discovery campaign targeting a market and region.
     * Phase 2 records campaigns as operational state; no automation runs
     * them yet — the operator drives them from the Command Center.
     */
    campaigns: defineTable({
      name: v.string(),
      description: v.optional(v.string()),
      status: campaignStatusValidator,
      marketCode: v.optional(v.string()),
      region: v.optional(v.string()),
      city: v.optional(v.string()),
      category: v.optional(v.string()),
      targetCount: v.optional(v.number()),
      targetKeywords: v.optional(v.string()),
      updatedAt: v.number(),
    })
      .index("by_status", ["status"])
      .index("by_market", ["marketCode"])
      .index("by_updated", ["updatedAt"]),

    /**
     * A business being tracked through the pipeline. Every stage change
     * goes through `businesses.setStage`, which validates transitions via
     * src/shared/pipeline.ts and writes a real activity row.
     */
    businesses: defineTable({
      company: v.string(),
      contactName: v.optional(v.string()),
      email: v.optional(v.string()),
      phone: v.optional(v.string()),
      website: v.optional(v.string()),
      websiteState: websiteStateValidator,
      /** Existence/reachability axis (Phase 3). Distinct from websiteState. */
      websiteStatus: websiteReachabilityValidator,
      websiteCheckedAt: v.optional(v.number()),
      websiteHttpStatus: v.optional(v.number()),
      city: v.optional(v.string()),
      category: v.optional(v.string()),
      address: v.optional(v.string()),
      /** Public profile references legitimately provided by a source. */
      socials: v.optional(v.array(v.string())),
      /** Public business WhatsApp reference (stored, never messaged in Phase 3). */
      whatsapp: v.optional(v.string()),
      source: businessSourceValidator,
      marketCode: v.optional(v.string()),
      region: v.optional(v.string()),
      stage: pipelineStageValidator,
      score: v.optional(v.number()),
      campaignId: v.optional(v.id("campaigns")),
      convertedClientId: v.optional(v.id("clients")),
      /** Provider confidence in this record's data (0..1) — not an opportunity score. */
      confidence: v.optional(v.number()),
      /** Automatic opportunity assessment (Phase 3) — derived, transparent, honest. */
      opportunity: v.optional(opportunityScoreValidator),
      /** Discovery provenance: where this record came from. */
      discoveredBy: v.optional(v.string()),
      discoveryRunId: v.optional(v.id("discoveryRuns")),
      discoveredAt: v.optional(v.number()),
      sourceReference: v.optional(v.string()),
      notes: v.optional(v.string()),
      updatedAt: v.number(),
    })
      .index("by_stage", ["stage", "updatedAt"])
      .index("by_market", ["marketCode"])
      .index("by_score", ["score"])
      .index("by_email", ["email"])
      .index("by_campaign", ["campaignId"])
      .index("by_discovered", ["discoveredAt"])
      .index("by_updated", ["updatedAt"]),

    /** Legacy Phase 1 lead rows. Kept only as the typed migration source; */
    /** see src/convex/migrate.ts. No new writes after Phase 2 migration. */
    leads: defineTable({
      company: v.string(),
      name: v.optional(v.string()), // contact name
      email: v.optional(v.string()), // normalized (lowercased) on write
      website: v.optional(v.string()),
      source: v.optional(v.string()), // how the lead was found
      status: leadStatusValidator,
      notes: v.optional(v.string()),
      updatedAt: v.number(),
    })
      .index("by_status", ["status"])
      .index("by_email", ["email"])
      .index("by_updated", ["updatedAt"]),

    /** An active (or archived) client of the studio. */
    clients: defineTable({
      company: v.string(),
      name: v.optional(v.string()), // primary contact name
      email: v.optional(v.string()),
      phone: v.optional(v.string()),
      website: v.optional(v.string()),
      status: clientStatusValidator,
      notes: v.optional(v.string()),
      updatedAt: v.number(),
    })
      .index("by_status", ["status"])
      .index("by_email", ["email"])
      .index("by_updated", ["updatedAt"]),

    /** A website engagement. Optionally linked to a client. */
    projects: defineTable({
      name: v.string(),
      clientId: v.optional(v.id("clients")),
      domain: v.optional(v.string()),
      status: projectStatusValidator,
      notes: v.optional(v.string()),
      updatedAt: v.number(),
    })
      .index("by_status", ["status"])
      .index("by_client", ["clientId"])
      .index("by_updated", ["updatedAt"]),

    /**
     * A discovery run: an auditable execution of the discovery engine for
     * one campaign. Counters are derived from real record processing.
     */
    discoveryRuns: defineTable({
      campaignId: v.id("campaigns"),
      status: discoveryRunStatusValidator,
      providerSlug: v.string(),
      providerName: v.string(),
      /** Configuration snapshot at start (derived from the campaign). */
      marketCode: v.optional(v.string()),
      region: v.optional(v.string()),
      city: v.optional(v.string()),
      category: v.optional(v.string()),
      requestedCount: v.number(),
      discoveredCount: v.number(),
      acceptedCount: v.number(),
      duplicateCount: v.number(),
      rejectedCount: v.number(),
      failedCount: v.number(),
      processedCount: v.number(),
      errorCode: v.optional(v.string()),
      errorMessage: v.optional(v.string()),
      cancelledReason: v.optional(v.string()),
      startedAt: v.optional(v.number()),
      completedAt: v.optional(v.number()),
      cancelledAt: v.optional(v.number()),
      /** Client-generated batch ids already processed (idempotency). */
      processedBatches: v.array(v.string()),
      notes: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_campaign", ["campaignId", "createdAt"])
      .index("by_status", ["status", "createdAt"])
      .index("by_updated", ["updatedAt"]),

    /**
     * One raw provider result per run: raw snapshot + normalized view +
     * pipeline outcome (accepted/duplicate/rejected/failed). Raw data is
     * retained for provenance and debugging, not accumulated without
     * purpose beyond the run.
     */
    discoveryResults: defineTable({
      runId: v.id("discoveryRuns"),
      providerSlug: v.string(),
      status: discoveryResultStatusValidator,
      raw: discoveryRawRecordValidator,
      normalized: v.optional(discoveryNormalizedRecordValidator),
      businessId: v.optional(v.id("businesses")),
      duplicateOf: v.optional(v.id("businesses")),
      duplicateSignal: v.optional(v.string()),
      rejectionReason: v.optional(v.string()),
      confidence: v.optional(v.number()),
      /** Set when a FAILED result is re-processed by a retry (provenance). */
      retriedAt: v.optional(v.number()),
      retrievedAt: v.number(),
      createdAt: v.number(),
    })
      .index("by_run", ["runId", "createdAt"])
      .index("by_business", ["businessId"])
      .index("by_status", ["status"]),

    /** Append-only log of real events; written only by actual operations. */
    activity: defineTable({
      type: activityTypeValidator,
      description: v.string(),
      actorId: v.optional(v.id("users")),
      entityType: v.optional(v.string()),
      entityId: v.optional(v.string()),
    }).index("by_type", ["type"]),

    /**
     * Provider slots reserved for later phases. Never "connected" in
     * Phase 1; every row is honestly NOT_CONFIGURED until a future phase
     * wires a real integration.
     */
    providers: defineTable({
      type: providerTypeValidator,
      name: v.string(),
      status: providerStatusValidator,
      capabilities: v.array(v.string()),
      lastCheckedAt: v.optional(v.number()),
    }).index("by_type", ["type"]),

    /** Single-document system metadata (key: "studio"). */
    systemMeta: defineTable({
      key: v.string(),
      firstSeenAt: v.number(),
    }).index("by_key", ["key"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
