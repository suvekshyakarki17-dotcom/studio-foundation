/**
 * Market catalog.
 *
 * The `markets` table holds configuration data seeded idempotently from
 * KNOWN_MARKETS (src/shared/domain.ts). It is real catalog data — the same
 * list used by the campaign and business forms — never fabricated business
 * records. Future phases may extend the catalog without schema changes.
 */
import { ENGAGED_STAGES, KNOWN_MARKETS } from "../shared/domain";
import { internalMutation, query } from "./_generated/server";
import { requireUser } from "./lib/errors";

/** Client-facing list of all markets (for filters, forms, and display). */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return ctx.db.query("markets").order("asc").collect();
  },
});

/**
 * Market coverage overview for the Markets page. Each market is enriched
 * with real counts derived from the campaigns and businesses tables —
 * zeros are zeros, nothing is fabricated.
 */
export const overview = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const markets = await ctx.db.query("markets").order("asc").collect();
    const campaigns = await ctx.db.query("campaigns").collect();
    const businesses = await ctx.db.query("businesses").collect();

    const campaignByMarket = new Map<string, number>();
    const runningByMarket = new Map<string, number>();
    for (const campaign of campaigns) {
      if (!campaign.marketCode) continue;
      campaignByMarket.set(
        campaign.marketCode,
        (campaignByMarket.get(campaign.marketCode) ?? 0) + 1,
      );
      if (campaign.status === "RUNNING") {
        runningByMarket.set(
          campaign.marketCode,
          (runningByMarket.get(campaign.marketCode) ?? 0) + 1,
        );
      }
    }

    const businessByMarket = new Map<string, number>();
    const engagedByMarket = new Map<string, number>();
    for (const business of businesses) {
      if (!business.marketCode) continue;
      businessByMarket.set(
        business.marketCode,
        (businessByMarket.get(business.marketCode) ?? 0) + 1,
      );
      if (ENGAGED_STAGES.includes(business.stage)) {
        engagedByMarket.set(
          business.marketCode,
          (engagedByMarket.get(business.marketCode) ?? 0) + 1,
        );
      }
    }

    return markets.map((market) => ({
      ...market,
      campaignCount: campaignByMarket.get(market.code) ?? 0,
      runningCampaigns: runningByMarket.get(market.code) ?? 0,
      businessCount: businessByMarket.get(market.code) ?? 0,
      engagedBusinesses: engagedByMarket.get(market.code) ?? 0,
    }));
  },
});

/**
 * Idempotently seed the catalog. Existing codes are left untouched so a
 * later phase can layer operator customizations on top without losing them.
 */
export const ensure = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const market of KNOWN_MARKETS) {
      const existing = await ctx.db
        .query("markets")
        .withIndex("by_code", (q) => q.eq("code", market.code))
        .first();
      if (!existing) {
        await ctx.db.insert("markets", {
          code: market.code,
          name: market.name,
          flag: market.flag,
          country: market.country,
          regions: [...market.regions],
        });
      }
    }
  },
});
