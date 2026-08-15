import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";
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

export const businessSourceValidator = v.union(
  ...BUSINESS_SOURCES.map((source) => v.literal(source)),
);
export type BusinessSourceValidator = Infer<typeof businessSourceValidator>;

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
      source: businessSourceValidator,
      marketCode: v.optional(v.string()),
      region: v.optional(v.string()),
      stage: pipelineStageValidator,
      score: v.optional(v.number()),
      campaignId: v.optional(v.id("campaigns")),
      convertedClientId: v.optional(v.id("clients")),
      notes: v.optional(v.string()),
      updatedAt: v.number(),
    })
      .index("by_stage", ["stage", "updatedAt"])
      .index("by_market", ["marketCode"])
      .index("by_score", ["score"])
      .index("by_email", ["email"])
      .index("by_campaign", ["campaignId"])
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
