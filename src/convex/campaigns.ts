/**
 * Campaigns — operational records of outreach/discovery efforts.
 *
 * Phase 2 campaigns are operator-driven state: a name, a target market and
 * region, optional keywords, and a status. Later phases will attach real
 * automation (discovery, outreach, etc.) behind the same rows. No campaign
 * ever claims automation it does not have.
 */
import { v } from "convex/values";
import {
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_STATUSES,
  type CampaignStatus,
} from "../shared/domain";
import {
  DEFAULT_WEBSITE_TARGET,
  discoveryReadiness,
  type WebsiteTarget,
} from "../shared/discovery";
import type { Doc } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { recordActivity } from "./lib/activity";
import { apiError, requireUser } from "./lib/errors";
import { log } from "./lib/log";
import {
  campaignStatusValidator,
  confidenceTierValidator,
  websiteTargetValidator,
} from "./schema";

function normalizeText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Validate an optional discovery target count (whole number >= 1). */
function normalizeTargetCount(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 1) {
    throw apiError(
      "VALIDATION",
      "Target count must be a whole number of at least 1.",
    );
  }
  return value;
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

/** Look up market display info (name + flag) for a list of campaigns. */
async function enrichMarkets(
  ctx: QueryCtx,
  campaigns: Doc<"campaigns">[],
): Promise<Map<string, { name: string; flag: string; country: string }>> {
  const codes = [
    ...new Set(
      campaigns
        .map((campaign) => campaign.marketCode)
        .filter((code): code is string => code !== undefined),
    ),
  ];
  const markets = (
    await Promise.all(
      codes.map((code) =>
        ctx.db
          .query("markets")
          .withIndex("by_code", (q) => q.eq("code", code))
          .first(),
      ),
    )
  ).filter((market) => market !== null);
  return new Map(
    markets.map((market) => [
      market.code,
      { name: market.name, flag: market.flag, country: market.country },
    ]),
  );
}

export const list = query({
  args: {
    status: v.optional(campaignStatusValidator),
    marketCode: v.optional(v.string()),
  },
  handler: async (ctx, { status, marketCode }) => {
    await requireUser(ctx);
    const campaigns = (
      await ctx.db.query("campaigns").collect()
    ).filter(
      (campaign) =>
        (!status || campaign.status === status) &&
        (!marketCode || campaign.marketCode === marketCode),
    );
    campaigns.sort((a, b) => b.updatedAt - a.updatedAt);

    const marketMap = await enrichMarkets(ctx, campaigns);
    const businesses = await ctx.db.query("businesses").collect();
    const counts = new Map<string, number>();
    for (const business of businesses) {
      if (business.campaignId) {
        counts.set(business.campaignId, (counts.get(business.campaignId) ?? 0) + 1);
      }
    }
    return campaigns.map((campaign) => {
      const readiness = discoveryReadiness(campaign);
      return {
        ...campaign,
        businessCount: counts.get(campaign._id) ?? 0,
        marketName: campaign.marketCode
          ? marketMap.get(campaign.marketCode)?.name
          : undefined,
        marketFlag: campaign.marketCode
          ? marketMap.get(campaign.marketCode)?.flag
          : undefined,
        marketCountry: campaign.marketCode
          ? marketMap.get(campaign.marketCode)?.country
          : undefined,
        discoveryReady: readiness.ready,
        missingDiscoveryFields: readiness.missing,
      };
    });
  },
});

export const stats = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const campaigns = await ctx.db.query("campaigns").collect();
    const byStatus = Object.fromEntries(
      CAMPAIGN_STATUSES.map((status) => [status, 0]),
    ) as Record<CampaignStatus, number>;
    for (const campaign of campaigns) {
      byStatus[campaign.status] += 1;
    }
    const businesses = await ctx.db.query("businesses").collect();
    const attached = businesses.filter(
      (business) => business.campaignId !== undefined,
    ).length;
    return {
      total: campaigns.length,
      byStatus,
      running: byStatus.RUNNING,
      attachedBusinesses: attached,
      marketsCovered: new Set(
        campaigns
          .map((campaign) => campaign.marketCode)
          .filter((code): code is string => code !== undefined),
      ).size,
      readyForDiscovery: campaigns.filter(
        (campaign) => discoveryReadiness(campaign).ready,
      ).length,
    };
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    marketCode: v.optional(v.string()),
    region: v.optional(v.string()),
    city: v.optional(v.string()),
    category: v.optional(v.string()),
    targetCount: v.optional(v.number()),
    targetKeywords: v.optional(v.string()),
    websiteTarget: v.optional(websiteTargetValidator),
    /** Phase 4 §2/§19: optional minimum opportunity tier for the target list. */
    minimumOpportunity: v.optional(confidenceTierValidator),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const name = args.name.trim();
    if (name.length === 0) {
      throw apiError("VALIDATION", "Campaign name is required.");
    }
    if (name.length > 140) {
      throw apiError("VALIDATION", "Campaign name must be under 140 characters.");
    }
    const marketCode = normalizeText(args.marketCode);
    const region = normalizeText(args.region);
    await validateMarket(ctx, marketCode, region);
    const websiteTarget: WebsiteTarget =
      args.websiteTarget ?? DEFAULT_WEBSITE_TARGET;
    const id = await ctx.db.insert("campaigns", {
      name,
      description: normalizeText(args.description),
      status: "DRAFT",
      marketCode,
      region,
      city: normalizeText(args.city),
      category: normalizeText(args.category),
      targetCount: normalizeTargetCount(args.targetCount),
      targetKeywords: normalizeText(args.targetKeywords),
      websiteTarget,
      minimumOpportunity: args.minimumOpportunity,
      updatedAt: Date.now(),
    });
    await recordActivity(ctx, {
      type: "CAMPAIGN_CREATED",
      description: `Campaign created — ${name}`,
      actorId: user._id,
      entityType: "campaign",
      entityId: id,
    });
    log("info", "campaign.created", { campaignId: id, name });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("campaigns"),
    name: v.string(),
    description: v.optional(v.string()),
    marketCode: v.optional(v.string()),
    region: v.optional(v.string()),
    city: v.optional(v.string()),
    category: v.optional(v.string()),
    targetCount: v.optional(v.number()),
    targetKeywords: v.optional(v.string()),
    websiteTarget: v.optional(websiteTargetValidator),
    minimumOpportunity: v.optional(confidenceTierValidator),
    status: v.optional(campaignStatusValidator),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw apiError("NOT_FOUND", "This campaign no longer exists.");
    }
    const name = args.name.trim();
    if (name.length === 0) {
      throw apiError("VALIDATION", "Campaign name is required.");
    }
    const marketCode = normalizeText(args.marketCode);
    const region = normalizeText(args.region);
    await validateMarket(ctx, marketCode, region);
    const websiteTarget: WebsiteTarget =
      args.websiteTarget ?? existing.websiteTarget ?? DEFAULT_WEBSITE_TARGET;
    await ctx.db.patch(args.id, {
      name,
      description: normalizeText(args.description),
      marketCode,
      region,
      city: normalizeText(args.city),
      category: normalizeText(args.category),
      targetCount: normalizeTargetCount(args.targetCount),
      targetKeywords: normalizeText(args.targetKeywords),
      websiteTarget,
      minimumOpportunity: args.minimumOpportunity,
      updatedAt: Date.now(),
    });
    if (args.status && args.status !== existing.status) {
      await ctx.db.patch(args.id, { status: args.status });
      await recordActivity(ctx, {
        type: "CAMPAIGN_STATUS_CHANGED",
        description: `${name} moved to ${CAMPAIGN_STATUS_LABELS[args.status]}`,
        actorId: user._id,
        entityType: "campaign",
        entityId: args.id,
      });
    } else {
      await recordActivity(ctx, {
        type: "CAMPAIGN_UPDATED",
        description: `Campaign updated — ${name}`,
        actorId: user._id,
        entityType: "campaign",
        entityId: args.id,
      });
    }
    const updated = await ctx.db.get(args.id);
    if (!updated) {
      throw apiError("INTERNAL", "The campaign could not be reloaded.");
    }
    return updated;
  },
});

export const remove = mutation({
  args: { id: v.id("campaigns") },
  handler: async (ctx, { id }) => {
    const user = await requireUser(ctx);
    const campaign = await ctx.db.get(id);
    if (!campaign) {
      throw apiError("NOT_FOUND", "This campaign no longer exists.");
    }
    // Detach any businesses attached to this campaign so no orphaned
    // references remain; the businesses themselves are preserved.
    const attached = await ctx.db
      .query("businesses")
      .withIndex("by_campaign", (q) => q.eq("campaignId", id))
      .collect();
    for (const business of attached) {
      await ctx.db.patch(business._id, { campaignId: undefined });
    }
    await ctx.db.delete(id);
    await recordActivity(ctx, {
      type: "CAMPAIGN_DELETED",
      description: `Campaign deleted — ${campaign.name}`,
      actorId: user._id,
      entityType: "campaign",
      entityId: id,
    });
    log("info", "campaign.deleted", {
      campaignId: id,
      detachedBusinesses: attached.length,
    });
  },
});
