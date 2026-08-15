/**
 * Market catalog.
 *
 * The `markets` table holds configuration data seeded idempotently from
 * KNOWN_MARKETS (src/shared/domain.ts). It is real catalog data — the same
 * list used by the campaign and business forms — never fabricated business
 * records. Future phases may extend the catalog without schema changes.
 */
import { KNOWN_MARKETS } from "../shared/domain";
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
