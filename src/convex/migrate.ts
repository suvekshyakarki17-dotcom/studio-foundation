/**
 * Phase 1 → Phase 2 migration: `leads` → `businesses`.
 *
 * The Phase 1 `leads` table is retained in the schema only as the typed
 * source for this migration (see src/shared/domain.ts). Each lead becomes
 * a pipeline business with its stage mapped through LEAD_STATUS_TO_STAGE,
 * its source recorded as PHASE1_MIGRATION, and its free-text lead source
 * preserved in the notes.
 *
 * The migration is idempotent: it runs at most once per deployment
 * (guarded by a systemMeta flag) and, as a second safety net, never
 * creates a business whose email already exists in the pipeline.
 */
import { LEAD_STATUS_TO_STAGE } from "../shared/domain";
import { mutation } from "./_generated/server";
import { recordActivity } from "./lib/activity";
import { log } from "./lib/log";

const MIGRATION_KEY = "phase2_leads_migrated_at";

export const migratePhase1Leads = mutation({
  args: {},
  handler: async (ctx) => {
    const existingFlag = await ctx.db
      .query("systemMeta")
      .withIndex("by_key", (q) => q.eq("key", MIGRATION_KEY))
      .first();
    if (existingFlag) {
      return { status: "already-migrated" as const, imported: 0 };
    }

    const leads = await ctx.db.query("leads").collect();

    // Safety net: never duplicate a business that already exists by email.
    const existingEmails = new Set<string>();
    const businesses = await ctx.db.query("businesses").collect();
    for (const business of businesses) {
      if (business.email) existingEmails.add(business.email);
    }

    let imported = 0;
    let skipped = 0;
    for (const lead of leads) {
      if (lead.email && existingEmails.has(lead.email)) {
        skipped += 1;
        continue;
      }
      const notes = [
        lead.source ? `Found via: ${lead.source}` : null,
        lead.notes ?? null,
      ]
        .filter((part): part is string => part !== null)
        .join("\n");
      await ctx.db.insert("businesses", {
        company: lead.company,
        contactName: lead.name,
        email: lead.email,
        website: lead.website,
        websiteState: "UNKNOWN",
        source: "PHASE1_MIGRATION",
        stage: LEAD_STATUS_TO_STAGE[lead.status],
        score: undefined,
        campaignId: undefined,
        convertedClientId: undefined,
        notes: notes || undefined,
        updatedAt: Date.now(),
      });
      if (lead.email) existingEmails.add(lead.email);
      // Re-check before deleting so a concurrent run (e.g. two browser
      // tabs opening the studio at once) can't double-delete a row.
      const stillThere = await ctx.db.get(lead._id);
      if (stillThere) await ctx.db.delete(lead._id);
      imported += 1;
    }

    await ctx.db.insert("systemMeta", {
      key: MIGRATION_KEY,
      firstSeenAt: Date.now(),
    });

    if (imported > 0) {
      await recordActivity(ctx, {
        type: "SYSTEM_EVENT",
        description: `Phase 2 migration — ${imported} business${
          imported === 1 ? "" : "es"
        } imported into the pipeline${
          skipped > 0 ? `, ${skipped} skipped as duplicates` : ""
        }`,
      });
    }
    log("info", "migrate.leads_to_businesses", { imported, skipped });
    return { status: "done" as const, imported };
  },
});
