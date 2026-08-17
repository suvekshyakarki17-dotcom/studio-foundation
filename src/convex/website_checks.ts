/**
 * Phase 4 — batch website re-check with a freshness window (§25, §28).
 *
 * Lives in its own file (rather than discovery.ts) so the pipeline can
 * re-check stale business websites without being tied to a discovery run:
 *
 *   getStaleBusinesses (internal query)  → businesses whose verification
 *     is missing, UNKNOWN/INVALID_URL, or older than the staleness window
 *   checkStaleWebsites (action)          → real reachability checks,
 *     bounded batch, polite pacing, every outcome persisted with its
 *     confidence + provenance through internal.discovery.setWebsiteCheck
 *
 * Caching rule: verified data is reused until it goes stale (7 days by
 * default) — the same site is never hammered on every page view. An
 * explicit re-check (`force`) bypasses the window deliberately.
 */
import { v } from "convex/values";
import type { WebsiteReachabilityState } from "../shared/discovery";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { action, internalQuery } from "./_generated/server";
import { apiError } from "./lib/errors";
import { log } from "./lib/log";
import { performWebsiteCheck } from "./lib/website";

const MAX_WEBSITE_CHECK_BATCH = 50;
/** Polite pacing between checks so a batch never hammers a host. */
const WEBSITE_CHECK_PACING_MS = 250;
/** Phase 4 §28: a check older than this is stale and re-checkable. */
export const STALE_WEBSITE_CHECK_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Internal read: businesses whose website verification is stale. */
export const getStaleBusinesses = internalQuery({
  args: {
    stalenessMs: v.number(),
    force: v.boolean(),
    limit: v.number(),
  },
  handler: async (ctx, { stalenessMs, force, limit }) => {
    const now = Date.now();
    const all = await ctx.db.query("businesses").collect();
    return all
      .filter((business) => {
        if (!business.website) return false;
        if (force) return true; // explicit re-check
        if (
          business.websiteStatus === "UNKNOWN" ||
          business.websiteStatus === "INVALID_URL"
        ) {
          return true;
        }
        if (!business.websiteCheckedAt) return true;
        return now - business.websiteCheckedAt > stalenessMs;
      })
      .slice(0, limit);
  },
});

/**
 * Batch re-check of stale websites. Real reachability checks run
 * sequentially with polite pacing; bounded batch; every outcome is
 * persisted with its derived confidence and provenance. Returns the real
 * per-status counts so the UI can report exactly what happened.
 */
export const checkStaleWebsites = action({
  args: {
    limit: v.optional(v.number()),
    /** Explicit re-check: ignore the freshness window. */
    force: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    { limit, force },
  ): Promise<{
    checked: number;
    stale: number;
    results: Record<WebsiteReachabilityState, number>;
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw apiError("UNAUTHENTICATED", "You must be signed in to do that.");
    }
    const take = Math.min(Math.max(limit ?? 50, 1), MAX_WEBSITE_CHECK_BATCH);
    const businesses: Doc<"businesses">[] = await ctx.runQuery(
      internal.website_checks.getStaleBusinesses,
      { stalenessMs: STALE_WEBSITE_CHECK_MS, force: force ?? false, limit: take },
    );

    const results: Record<WebsiteReachabilityState, number> = {
      UNKNOWN: 0,
      HAS_WEBSITE: 0,
      NO_WEBSITE: 0,
      UNREACHABLE: 0,
      INVALID_URL: 0,
      BLOCKED: 0,
      CHECK_FAILED: 0,
    };

    for (const business of businesses) {
      const outcome = await performWebsiteCheck(business.website);
      results[outcome.websiteStatus] += 1;
      await ctx.runMutation(internal.discovery.setWebsiteCheck, {
        businessId: business._id,
        websiteStatus: outcome.websiteStatus,
        websiteHttpStatus: outcome.websiteHttpStatus,
        websiteCheckedAt: Date.now(),
        websiteCheckedUrl: business.website,
        websiteFinalUrl: outcome.websiteFinalUrl,
      });
      if (businesses.length > 1) {
        await sleep(WEBSITE_CHECK_PACING_MS);
      }
    }
    log("info", "website_checks.stale_checked", {
      stale: businesses.length,
      results,
      force: force ?? false,
    });
    return { checked: businesses.length, stale: businesses.length, results };
  },
});
