import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";
import {
  ACTIVITY_TYPES,
  CLIENT_STATUSES,
  HEALTH_STATUSES,
  LEAD_STATUSES,
  PROJECT_STATUSES,
  PROVIDER_STATUSES,
  PROVIDER_TYPES,
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

    /** A business being tracked as a potential engagement. */
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
