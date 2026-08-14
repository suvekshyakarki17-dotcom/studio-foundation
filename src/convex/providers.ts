import { KNOWN_PROVIDERS } from "../shared/domain";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { requireUser } from "./lib/errors";

/** Client-facing list of provider slots (all honestly NOT_CONFIGURED in Phase 1). */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return ctx.db.query("providers").collect();
  },
});

/** Internal read used by the health check action. */
export const listAll = internalQuery({
  args: {},
  handler: async (ctx) => {
    return ctx.db.query("providers").collect();
  },
});

/**
 * Idempotently create the reserved provider slots. Never marks anything
 * as connected — rows are inserted as NOT_CONFIGURED only.
 */
export const ensure = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const provider of KNOWN_PROVIDERS) {
      const existing = await ctx.db
        .query("providers")
        .withIndex("by_type", (q) => q.eq("type", provider.type))
        .first();
      if (!existing) {
        await ctx.db.insert("providers", {
          type: provider.type,
          name: provider.name,
          status: "NOT_CONFIGURED",
          capabilities: [...provider.capabilities],
        });
      }
    }
  },
});
