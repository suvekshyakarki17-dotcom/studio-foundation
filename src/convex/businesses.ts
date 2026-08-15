/**
 * Businesses — the core pipeline entity of the Command Center.
 *
 * A business is tracked from discovery through qualification, outreach,
 * and (when it converts) into the studio's client base. Every mutation
 * validates input server-side, writes a real activity row, and never
 * fabricates state.
 */
import { v } from "convex/values";
import {
  ACTIVE_OPPORTUNITY_STAGES,
  ENGAGED_STAGES,
  HIGH_PRIORITY_SCORE,
  PIPELINE_STAGE_LABELS,
  PIPELINE_STAGES,
  SCORE_TIER_LABELS,
  WEBSITE_STATES,
  scoreTier,
  type PipelineStage,
  type WebsiteState,
} from "../shared/domain";
import { canTransition, transitionError } from "../shared/pipeline";
import type { Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { recordActivity } from "./lib/activity";
import { apiError, requireUser } from "./lib/errors";
import { log } from "./lib/log";
import {
  businessSourceValidator,
  pipelineStageValidator,
  websiteStateValidator,
} from "./schema";

function normalizeEmail(email: string | undefined): string | undefined {
  const trimmed = email?.trim();
  if (!trimmed) return undefined;
  return trimmed.toLowerCase();
}

function normalizeText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Normalize a score: trim, empty -> undefined, otherwise an integer. */
function normalizeScore(value: string | number | undefined | null) {
  if (value === undefined || value === null) return undefined;
  const raw = typeof value === "string" ? value.trim() : String(value);
  if (raw === "") return undefined;
  const score = Number(raw);
  if (!Number.isInteger(score) || score < 0 || score > 100) {
    throw apiError("VALIDATION", "Score must be a whole number between 0 and 100.");
  }
  return score;
}

/** Validate that a marketCode/region pair refers to a known market region. */
async function validateMarket(
  ctx: MutationCtx,
  marketCode: string | undefined,
  region: string | undefined,
): Promise<void> {
  if (!marketCode) {
    if (region) {
      throw apiError("VALIDATION", "Pick a market before setting a region.");
    }
    return;
  }
  const market = await ctx.db
    .query("markets")
    .withIndex("by_code", (q) => q.eq("code", marketCode))
    .first();
  if (!market) {
    throw apiError("VALIDATION", "Pick a market from the catalog.");
  }
  if (region && !market.regions.includes(region)) {
    throw apiError(
      "VALIDATION",
      `"${region}" is not a region of ${market.name}.`,
    );
  }
}

export interface BusinessListArgs {
  stage?: PipelineStage;
  marketCode?: string;
  search?: string;
}

export const list = query({
  args: {
    stage: v.optional(pipelineStageValidator),
    marketCode: v.optional(v.string()),
    search: v.optional(v.string()),
  },
  handler: async (ctx, { stage, marketCode, search }) => {
    await requireUser(ctx);
    let rows = await ctx.db.query("businesses").collect();
    if (stage) rows = rows.filter((business) => business.stage === stage);
    if (marketCode) {
      rows = rows.filter((business) => business.marketCode === marketCode);
    }
    const needle = search?.trim().toLowerCase();
    if (needle) {
      rows = rows.filter((business) =>
        [business.company, business.contactName, business.email, business.website]
          .filter(Boolean)
          .some((field) => field!.toLowerCase().includes(needle)),
      );
    }
    rows.sort((a, b) => b.updatedAt - a.updatedAt);

    // Enrich with campaign names so the UI can render linked campaigns.
    const campaignIds = [
      ...new Set(
        rows
          .map((row) => row.campaignId)
          .filter((id): id is Id<"campaigns"> => id !== undefined),
      ),
    ];
    const campaigns = (
      await Promise.all(campaignIds.map((id) => ctx.db.get(id)))
    ).filter((campaign) => campaign !== null);
    const byId = new Map(campaigns.map((campaign) => [campaign._id, campaign]));
    return rows.map((row) => ({
      ...row,
      campaignName: row.campaignId ? byId.get(row.campaignId)?.name : undefined,
    }));
  },
});

export const stats = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const businesses = await ctx.db.query("businesses").collect();
    const byStage = Object.fromEntries(
      PIPELINE_STAGES.map((stage) => [stage, 0]),
    ) as Record<PipelineStage, number>;
    const byWebsiteState = Object.fromEntries(
      WEBSITE_STATES.map((state) => [state, 0]),
    ) as Record<WebsiteState, number>;
    let scored = 0;
    let scoredSum = 0;
    for (const business of businesses) {
      byStage[business.stage] += 1;
      byWebsiteState[business.websiteState] += 1;
      if (business.score !== undefined && business.score !== null) {
        scored += 1;
        scoredSum += business.score;
      }
    }
    const engaged = ENGAGED_STAGES.reduce(
      (sum, stage) => sum + byStage[stage],
      0,
    );
    const activeOpportunities = ACTIVE_OPPORTUNITY_STAGES.reduce(
      (sum, stage) => sum + byStage[stage],
      0,
    );
    return {
      total: businesses.length,
      byStage,
      byWebsiteState,
      engaged,
      activeOpportunities,
      won: byStage.WON,
      lost: byStage.LOST,
      highPriority: businesses.filter(
        (business) =>
          business.score !== undefined &&
          business.score !== null &&
          business.score >= HIGH_PRIORITY_SCORE,
      ).length,
      scored,
      averageScore: scored > 0 ? Math.round(scoredSum / scored) : null,
    };
  },
});

export const create = mutation({
  args: {
    company: v.string(),
    contactName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    website: v.optional(v.string()),
    websiteState: v.optional(websiteStateValidator),
    source: v.optional(businessSourceValidator),
    marketCode: v.optional(v.string()),
    region: v.optional(v.string()),
    stage: v.optional(pipelineStageValidator),
    score: v.optional(v.union(v.number(), v.string(), v.null())),
    campaignId: v.optional(v.id("campaigns")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const company = args.company.trim();
    if (company.length === 0) {
      throw apiError("VALIDATION", "Company name is required.");
    }
    if (company.length > 120) {
      throw apiError("VALIDATION", "Company name must be under 120 characters.");
    }
    const email = normalizeEmail(args.email);
    if (email) {
      const existing = await ctx.db
        .query("businesses")
        .withIndex("by_email", (q) => q.eq("email", email))
        .first();
      if (existing) {
        throw apiError(
          "CONFLICT",
          "A business with this email is already in the pipeline.",
        );
      }
    }
    const marketCode = normalizeText(args.marketCode);
    const region = normalizeText(args.region);
    await validateMarket(ctx, marketCode, region);
    if (args.campaignId) {
      const campaign = await ctx.db.get(args.campaignId);
      if (!campaign) {
        throw apiError("VALIDATION", "Select an existing campaign.");
      }
    }
    const stage = args.stage ?? "DISCOVERED";
    const id = await ctx.db.insert("businesses", {
      company,
      contactName: normalizeText(args.contactName),
      email,
      phone: normalizeText(args.phone),
      website: normalizeText(args.website),
      websiteState: args.websiteState ?? "UNKNOWN",
      source: args.source ?? "MANUAL",
      marketCode,
      region,
      stage,
      score: normalizeScore(args.score),
      campaignId: args.campaignId,
      convertedClientId: undefined,
      notes: normalizeText(args.notes),
      updatedAt: Date.now(),
    });
    await recordActivity(ctx, {
      type: "BUSINESS_CREATED",
      description: `Business added to pipeline — ${company}`,
      actorId: user._id,
      entityType: "business",
      entityId: id,
    });
    log("info", "business.created", { businessId: id, company, stage });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("businesses"),
    company: v.string(),
    contactName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    website: v.optional(v.string()),
    websiteState: websiteStateValidator,
    source: businessSourceValidator,
    marketCode: v.optional(v.string()),
    region: v.optional(v.string()),
    score: v.optional(v.union(v.number(), v.string(), v.null())),
    campaignId: v.optional(v.union(v.id("campaigns"), v.null())),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw apiError("NOT_FOUND", "This business no longer exists.");
    }
    const company = args.company.trim();
    if (company.length === 0) {
      throw apiError("VALIDATION", "Company name is required.");
    }
    const email = normalizeEmail(args.email);
    if (email) {
      const duplicate = await ctx.db
        .query("businesses")
        .withIndex("by_email", (q) => q.eq("email", email))
        .first();
      if (duplicate && duplicate._id !== args.id) {
        throw apiError(
          "CONFLICT",
          "Another business in the pipeline already uses this email.",
        );
      }
    }
    const marketCode = normalizeText(args.marketCode);
    const region = normalizeText(args.region);
    await validateMarket(ctx, marketCode, region);
    let campaignId: Id<"campaigns"> | undefined;
    if (args.campaignId === null) {
      campaignId = undefined; // explicitly detached
    } else if (args.campaignId) {
      const campaign = await ctx.db.get(args.campaignId);
      if (!campaign) {
        throw apiError("VALIDATION", "Select an existing campaign.");
      }
      campaignId = args.campaignId;
    } else {
      campaignId = existing.campaignId; // not touched
    }
    await ctx.db.patch(args.id, {
      company,
      contactName: normalizeText(args.contactName),
      email,
      phone: normalizeText(args.phone),
      website: normalizeText(args.website),
      websiteState: args.websiteState,
      source: args.source,
      marketCode,
      region,
      score: normalizeScore(args.score),
      campaignId,
      notes: normalizeText(args.notes),
      updatedAt: Date.now(),
    });
    await recordActivity(ctx, {
      type: "BUSINESS_UPDATED",
      description: `Business updated — ${company}`,
      actorId: user._id,
      entityType: "business",
      entityId: args.id,
    });
    const updated = await ctx.db.get(args.id);
    if (!updated) {
      throw apiError("INTERNAL", "The business could not be reloaded.");
    }
    return updated;
  },
});

/** Change a business's pipeline stage, enforcing the shared transition rules. */
export const setStage = mutation({
  args: {
    id: v.id("businesses"),
    stage: pipelineStageValidator,
  },
  handler: async (ctx, { id, stage }) => {
    const user = await requireUser(ctx);
    const business = await ctx.db.get(id);
    if (!business) {
      throw apiError("NOT_FOUND", "This business no longer exists.");
    }
    if (business.stage === stage) return business;
    const blocked = transitionError(business.stage, stage);
    if (blocked || !canTransition(business.stage, stage)) {
      throw apiError("VALIDATION", blocked ?? "That stage move is not allowed.");
    }
    await ctx.db.patch(id, { stage, updatedAt: Date.now() });
    await recordActivity(ctx, {
      type: "BUSINESS_STAGE_CHANGED",
      description: `${business.company} moved to ${PIPELINE_STAGE_LABELS[stage]}${
        business.score !== undefined && business.score !== null
          ? ` (${SCORE_TIER_LABELS[scoreTier(business.score)!]} priority)`
          : ""
      }`,
      actorId: user._id,
      entityType: "business",
      entityId: id,
    });
    log("info", "business.stage_changed", {
      businessId: id,
      from: business.stage,
      to: stage,
    });
    const updated = await ctx.db.get(id);
    if (!updated) {
      throw apiError("INTERNAL", "The business could not be reloaded.");
    }
    return updated;
  },
});

/**
 * Convert a business into a studio client: creates the client, closes the
 * pipeline record as WON, and links the two. Real state change, real
 * activity rows on both sides.
 */
export const convertToClient = mutation({
  args: { id: v.id("businesses") },
  handler: async (ctx, { id }) => {
    const user = await requireUser(ctx);
    const business = await ctx.db.get(id);
    if (!business) {
      throw apiError("NOT_FOUND", "This business no longer exists.");
    }
    if (business.convertedClientId) {
      throw apiError(
        "CONFLICT",
        "This business is already linked to a client.",
      );
    }
    const clientId = await ctx.db.insert("clients", {
      company: business.company,
      name: business.contactName,
      email: business.email,
      phone: business.phone,
      website: business.website,
      notes: business.notes,
      status: "ACTIVE",
      updatedAt: Date.now(),
    });
    await ctx.db.patch(id, {
      stage: "WON",
      convertedClientId: clientId,
      updatedAt: Date.now(),
    });
    await recordActivity(ctx, {
      type: "BUSINESS_CONVERTED_TO_CLIENT",
      description: `${business.company} converted to client`,
      actorId: user._id,
      entityType: "business",
      entityId: id,
    });
    await recordActivity(ctx, {
      type: "CLIENT_CREATED",
      description: `Client created from pipeline — ${business.company}`,
      actorId: user._id,
      entityType: "client",
      entityId: clientId,
    });
    log("info", "business.converted", { businessId: id, clientId });
    return { clientId };
  },
});

export const remove = mutation({
  args: { id: v.id("businesses") },
  handler: async (ctx, { id }) => {
    const user = await requireUser(ctx);
    const business = await ctx.db.get(id);
    if (!business) {
      throw apiError("NOT_FOUND", "This business no longer exists.");
    }
    await ctx.db.delete(id);
    await recordActivity(ctx, {
      type: "BUSINESS_DELETED",
      description: `Business removed from pipeline — ${business.company}`,
      actorId: user._id,
      entityType: "business",
      entityId: id,
    });
    log("info", "business.deleted", { businessId: id });
  },
});
