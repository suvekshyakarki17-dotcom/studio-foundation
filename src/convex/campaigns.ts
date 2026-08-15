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
import type { Doc } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { recordActivity } from "./lib/activity";
import { apiError, requireUser } from "./lib/errors";
import { log } from "./lib/log";
import { campaignStatusValidator } from "./schema";

function normalizeText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
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
  args: { status: v.optional(campaignStatusValidator) },
  handler: async (ctx, { status }) => {
    await requireUser(ctx);
    const campaigns = (
      await ctx.db.query("campaigns").collect()
    ).filter((campaign) => !status || campaign.status === status);
    campaigns.sort((a, b) => b.updatedAt - a.updatedAt);

    const marketMap = await enrichMarkets(ctx, campaigns);
    const businesses = await ctx.db.query("businesses").collect();
    const counts = new Map<string, number>();
    for (const business of businesses) {
      if (business.campaignId) {
        counts.set(business.campaignId, (counts.get(business.campaignId) ?? 0) + 1);
      }
    }
    return campaigns.map((campaign) => ({
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
    }));
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
    };
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    marketCode: v.optional(v.string()),
    region: v.optional(v.string()),
    targetKeywords: v.optional(v.string()),
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
    const id = await ctx.db.insert("campaigns", {
      name,
      description: normalizeText(args.description),
      status: "DRAFT",
      marketCode,
      region,
      targetKeywords: normalizeText(args.targetKeywords),
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
    targetKeywords: v.optional(v.string()),
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
    await ctx.db.patch(args.id, {
      name,
      description: normalizeText(args.description),
      marketCode,
      region,
      targetKeywords: normalizeText(args.targetKeywords),
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
