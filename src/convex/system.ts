/**
 * System foundation: real health checks, system metadata, and boot tracking.
 *
 * The health check never claims anything it did not verify: the database
 * status comes from an actual query against the deployment, and provider
 * slots are reported exactly as recorded (NOT_CONFIGURED in Phase 1).
 */
import { APP_NAME, APP_VERSION } from "../shared/domain";
import type { HealthCheckReport } from "../shared/domain";
import { api, internal } from "./_generated/api";
import { action, mutation, query } from "./_generated/server";
import { log } from "./lib/log";

const SYSTEM_KEY = "studio";

/**
 * Authentication methods configured in src/convex/auth.ts (read-only
 * template file). These are genuinely configured — the sign-in flow verifies
 * them — but Phase 1 makes no other auth claims.
 */
const AUTH_METHODS: Array<{ id: string; status: "CONFIGURED" }> = [
  { id: "email-otp", status: "CONFIGURED" },
  { id: "anonymous", status: "CONFIGURED" },
];

export const meta = query({
  args: {},
  handler: async (ctx) => {
    return ctx.db
      .query("systemMeta")
      .withIndex("by_key", (q) => q.eq("key", SYSTEM_KEY))
      .first();
  },
});

/** Idempotent: records the first time the studio was booted. */
export const recordBoot = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("systemMeta")
      .withIndex("by_key", (q) => q.eq("key", SYSTEM_KEY))
      .first();
    if (!existing) {
      await ctx.db.insert("systemMeta", {
        key: SYSTEM_KEY,
        firstSeenAt: Date.now(),
      });
    }
  },
});

/** A real database read; the health check depends on this succeeding. */
export const dbPing = query({
  args: {},
  handler: async (ctx) => {
    await ctx.db.query("users").first();
    return { ok: true as const, at: Date.now() };
  },
});

/**
 * Safe, public summary for the landing page: whether the database answered
 * a real query and how many provider slots are configured. No user data,
 * no secrets — only honest status.
 */
export const publicStatus = query({
  args: {},
  handler: async (ctx) => {
    let dbOk = false;
    try {
      await ctx.db.query("users").first();
      dbOk = true;
    } catch {
      dbOk = false;
    }
    let providersConfigured = 0;
    try {
      providersConfigured = (
        await ctx.db.query("providers").collect()
      ).filter((provider) => provider.status !== "NOT_CONFIGURED").length;
    } catch {
      providersConfigured = 0;
    }
    return { dbOk, providersConfigured, version: APP_VERSION };
  },
});

/**
 * Full health check. Returns an honest HealthCheckReport: the database is
 * HEALTHY only if the ping query actually succeeded, and providers are
 * reported exactly as stored.
 */
export const healthCheck = action({
  args: {},
  handler: async (ctx): Promise<HealthCheckReport> => {
    const checkedAt = Date.now();

    try {
      await ctx.runMutation(internal.providers.ensure);
    } catch (error) {
      log("warn", "health.provider_slots", {
        message: error instanceof Error ? error.message : String(error),
      });
    }

    const dbStartedAt = Date.now();
    let database: HealthCheckReport["database"];
    try {
      await ctx.runQuery(api.system.dbPing);
      database = {
        status: "HEALTHY",
        latencyMs: Date.now() - dbStartedAt,
        checkedAt: Date.now(),
      };
    } catch (error) {
      database = {
        status: "ERROR",
        checkedAt: Date.now(),
        error: "The database could not be reached.",
      };
      log("error", "health.database", {
        message: error instanceof Error ? error.message : String(error),
      });
    }

    let providers: HealthCheckReport["providers"] = [];
    try {
      const rows = await ctx.runQuery(internal.providers.listAll);
      providers = rows.map((row) => ({
        type: row.type,
        name: row.name,
        status: row.status,
        capabilities: row.capabilities,
        lastCheckedAt: row.lastCheckedAt,
      }));
    } catch (error) {
      log("warn", "health.providers_read", {
        message: error instanceof Error ? error.message : String(error),
      });
    }

    let firstSeenAt: number | null = null;
    try {
      const systemMeta = await ctx.runQuery(api.system.meta);
      firstSeenAt = systemMeta?.firstSeenAt ?? null;
    } catch (error) {
      log("warn", "health.system_meta", {
        message: error instanceof Error ? error.message : String(error),
      });
    }

    const report: HealthCheckReport = {
      status: database.status === "HEALTHY" ? "HEALTHY" : "ERROR",
      checkedAt,
      application: {
        name: APP_NAME,
        version: APP_VERSION,
        status: "HEALTHY",
      },
      database,
      auth: { methods: AUTH_METHODS },
      providers,
      system: { firstSeenAt },
    };

    log("info", "health.check", {
      status: report.status,
      database: report.database.status,
      providersConfigured: report.providers.filter(
        (provider) => provider.status !== "NOT_CONFIGURED",
      ).length,
    });
    return report;
  },
});
