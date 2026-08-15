/**
 * Discovery & Lead Intelligence engine (Phase 3).
 *
 * Real execution only. The engine walks a deterministic pipeline for every
 * record it receives:
 *
 *   raw record → normalize → validate → deduplicate → (persist | link)
 *                                     → result row + run counters + activity
 *
 * Providers plug in through the DISCOVERY_PROVIDERS registry
 * (src/shared/discovery.ts). In this deployment exactly one provider is
 * configured: `csv-import`, which ingests records the operator already has
 * (directory exports, research notes). Every other provider is reported
 * honestly as NOT_CONFIGURED, with the exact requirements documented — a
 * run started against one fails immediately with a real, auditable
 * PROVIDER_NOT_CONFIGURED error instead of pretending to work.
 *
 * All counters (discovered/accepted/duplicate/rejected/failed) are derived
 * from actual record processing. Nothing is ever fabricated.
 */
import { v } from "convex/values";
import { CAMPAIGN_STATUS_LABELS } from "../shared/domain";
import {
  DISCOVERY_PROVIDERS,
  DISCOVERY_RUN_STATUS_LABELS,
  TERMINAL_RUN_STATUSES,
  WEBSITE_REACHABILITY_LABELS,
  canRunTransition,
  discoveryReadiness,
  type DiscoveryRunStatus,
  type DiscoveryRawRecord,
  type WebsiteReachabilityState,
} from "../shared/discovery";
import { enrichmentUpdates } from "../shared/discovery/enrich";
import { findDuplicate, toBusinessIdentity } from "../shared/discovery/dedupe";
import { canonicalizeUrl, normalizeRecord } from "../shared/discovery/normalize";
import { validateRawRecord } from "../shared/discovery/validate";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { recordActivity } from "./lib/activity";
import { apiError, requireUser } from "./lib/errors";
import { log } from "./lib/log";
import {
  discoveryRawRecordValidator,
  discoveryResultStatusValidator,
  discoveryRunStatusValidator,
  websiteReachabilityValidator,
} from "./schema";

const MAX_BATCH_RECORDS = 200;
const RESULTS_LIMIT = 500;

/** Provider confidence in operator-provided records. */
const CSV_IMPORT_CONFIDENCE = 1;

function normalizeText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/* --------------------------------- Queries -------------------------------- */

/** The provider registry with honest configuration status. */
export const providers = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return DISCOVERY_PROVIDERS;
  },
});

/** Discovery runs, newest first, optionally scoped to a campaign/status. */
export const runsList = query({
  args: {
    campaignId: v.optional(v.id("campaigns")),
    status: v.optional(discoveryRunStatusValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { campaignId, status, limit }) => {
    await requireUser(ctx);
    const take = Math.min(Math.max(limit ?? 50, 1), 200);
    let rows = campaignId
      ? await ctx.db
          .query("discoveryRuns")
          .withIndex("by_campaign", (q) => q.eq("campaignId", campaignId))
          .order("desc")
          .collect()
      : await ctx.db.query("discoveryRuns").order("desc").take(500);
    if (status) rows = rows.filter((row) => row.status === status);
    rows.sort((a, b) => b.createdAt - a.createdAt);
    const scoped = rows.slice(0, take);

    const campaignIds = [
      ...new Set(scoped.map((row) => row.campaignId)),
    ];
    const campaigns = (
      await Promise.all(campaignIds.map((id) => ctx.db.get(id)))
    ).filter((campaign) => campaign !== null);
    const byId = new Map(campaigns.map((campaign) => [campaign._id, campaign]));
    return scoped.map((row) => ({
      ...row,
      campaignName: byId.get(row.campaignId)?.name,
    }));
  },
});

/** Single run with its campaign summary. */
export const runsGet = query({
  args: { runId: v.id("discoveryRuns") },
  handler: async (ctx, { runId }) => {
    await requireUser(ctx);
    const run = await ctx.db.get(runId);
    if (!run) throw apiError("NOT_FOUND", "This discovery run no longer exists.");
    const campaign = await ctx.db.get(run.campaignId);
    return {
      ...run,
      campaign: campaign
        ? {
            id: campaign._id,
            name: campaign.name,
            status: campaign.status,
            marketCode: campaign.marketCode,
            region: campaign.region,
          }
        : null,
    };
  },
});

/**
 * Results of a run: filtered by outcome and sorted server-side, bounded to
 * keep the browser lean. Business names/stages are joined for display.
 */
export const resultsList = query({
  args: {
    runId: v.id("discoveryRuns"),
    status: v.optional(discoveryResultStatusValidator),
    sort: v.optional(
      v.union(
        v.literal("newest"),
        v.literal("oldest"),
        v.literal("name"),
        v.literal("location"),
        v.literal("confidence"),
      ),
    ),
  },
  handler: async (ctx, { runId, status, sort }) => {
    await requireUser(ctx);
    const rows = await ctx.db
      .query("discoveryResults")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .order("desc")
      .take(RESULTS_LIMIT);
    const filtered = status
      ? rows.filter((row) => row.status === status)
      : rows;

    const mode = sort ?? "newest";
    const sorted = [...filtered].sort((a, b) => {
      switch (mode) {
        case "oldest":
          return a.createdAt - b.createdAt;
        case "name":
          return (a.normalized?.company ?? "").localeCompare(
            b.normalized?.company ?? "",
          );
        case "location": {
          const left = `${a.normalized?.city ?? ""} ${a.normalized?.region ?? ""}`;
          const right = `${b.normalized?.city ?? ""} ${b.normalized?.region ?? ""}`;
          return left.localeCompare(right);
        }
        case "confidence":
          return (b.confidence ?? -1) - (a.confidence ?? -1);
        default:
          return b.createdAt - a.createdAt;
      }
    });

    const businessIds = [
      ...new Set(
        sorted.flatMap((row) =>
          [row.businessId, row.duplicateOf].filter(
            (id): id is Id<"businesses"> => id !== undefined,
          ),
        ),
      ),
    ];
    const businesses = (
      await Promise.all(businessIds.map((id) => ctx.db.get(id)))
    ).filter((business) => business !== null);
    const byId = new Map(businesses.map((business) => [business._id, business]));

    return sorted.map((row) => ({
      ...row,
      business: row.businessId
        ? {
            id: row.businessId,
            name: byId.get(row.businessId)?.company,
            stage: byId.get(row.businessId)?.stage,
            websiteStatus: byId.get(row.businessId)?.websiteStatus,
          }
        : undefined,
      duplicateOfBusiness: row.duplicateOf
        ? {
            id: row.duplicateOf,
            name: byId.get(row.duplicateOf)?.company,
          }
        : undefined,
    }));
  },
});

/**
 * Command-center discovery metrics, all derived from real data: active
 * runs, runs started today, failures in the last 7 days, businesses
 * discovered today, and the most recent run.
 */
export const stats = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const now = Date.now();
    const startOfToday = now - (now % 86_400_000); // UTC day boundary
    const sevenDaysAgo = now - 7 * 86_400_000;

    const runs = await ctx.db.query("discoveryRuns").collect();
    const activeStatuses = ["QUEUED", "RUNNING", "PAUSED", "CANCELLING"];
    const activeRuns = runs.filter((run) =>
      activeStatuses.includes(run.status),
    ).length;
    const runsToday = runs.filter((run) => run.createdAt >= startOfToday).length;
    const failedRuns7d = runs.filter(
      (run) => run.status === "FAILED" && run.createdAt >= sevenDaysAgo,
    ).length;

    const businesses = await ctx.db.query("businesses").collect();
    const discovered = businesses.filter(
      (business) => business.discoveredAt !== undefined,
    );
    const discoveredToday = discovered.filter(
      (business) => (business.discoveredAt ?? 0) >= startOfToday,
    ).length;

    const latest = await ctx.db
      .query("discoveryRuns")
      .order("desc")
      .first();
    let latestRun: {
      runId: string;
      campaignName: string | undefined;
      status: DiscoveryRunStatus;
      createdAt: number;
    } | null = null;
    if (latest) {
      const campaign = await ctx.db.get(latest.campaignId);
      latestRun = {
        runId: latest._id,
        campaignName: campaign?.name,
        status: latest.status,
        createdAt: latest.createdAt,
      };
    }

    return {
      activeRuns,
      runsToday,
      failedRuns7d,
      totalDiscovered: discovered.length,
      discoveredToday,
      latestRun,
    };
  },
});

/* -------------------------------- Pipeline -------------------------------- */

/**
 * Process one batch of raw records through the deterministic pipeline.
 * Counters are derived purely from outcomes; result rows retain both the
 * raw snapshot (provenance) and the normalized view.
 */
async function processRecords(
  ctx: MutationCtx,
  run: Doc<"discoveryRuns">,
  records: DiscoveryRawRecord[],
): Promise<{
  accepted: number;
  duplicates: number;
  rejected: number;
  failed: number;
}> {
  // Pre-compute identity fingerprints of every existing business once, so
  // each record matches against the same conservative baseline.
  const existing = await ctx.db.query("businesses").collect();
  const candidates = existing.map((business) =>
    toBusinessIdentity({
      id: business._id,
      company: business.company,
      city: business.city,
      website: business.website,
      phone: business.phone,
      email: business.email,
    }),
  );

  let accepted = 0;
  let duplicates = 0;
  let rejected = 0;
  let failed = 0;
  const now = Date.now();

  for (const raw of records) {
    try {
      const normalized = normalizeRecord(raw, CSV_IMPORT_CONFIDENCE);
      const validation = validateRawRecord(raw);

      if (!validation.valid) {
        await ctx.db.insert("discoveryResults", {
          runId: run._id,
          providerSlug: run.providerSlug,
          status: "REJECTED",
          raw,
          normalized,
          rejectionReason: validation.reasons.join(" "),
          confidence: normalized.confidence,
          retrievedAt: now,
          createdAt: now,
        });
        rejected += 1;
        continue;
      }

      const match = findDuplicate(normalized, candidates);
      if (match.matched && match.businessId && match.signal) {
        const existingBusiness = await ctx.db.get(
          match.businessId as Id<"businesses">,
        );
        if (existingBusiness) {
          // Controlled enrichment: fill only empty fields on high-confidence
          // signals; never overwrite; never destroy data.
          const updates = enrichmentUpdates(
            {
              website: existingBusiness.website,
              phone: existingBusiness.phone,
              email: existingBusiness.email,
              city: existingBusiness.city,
              category: existingBusiness.category,
            },
            normalized,
            match.signal,
          );
          if (Object.keys(updates).length > 0) {
            await ctx.db.patch(existingBusiness._id, {
              ...updates,
              updatedAt: now,
            });
          }
          await ctx.db.insert("discoveryResults", {
            runId: run._id,
            providerSlug: run.providerSlug,
            status: "DUPLICATE",
            raw,
            normalized,
            duplicateOf: existingBusiness._id,
            duplicateSignal: match.signal,
            confidence: normalized.confidence,
            retrievedAt: now,
            createdAt: now,
          });
          duplicates += 1;
          continue;
        }
      }

      const businessId = await ctx.db.insert("businesses", {
        company: normalized.company,
        contactName: normalized.contactName,
        email: normalized.email,
        phone: normalized.phone,
        website: normalized.website,
        websiteState: "UNKNOWN",
        websiteStatus: normalized.websiteStatus,
        websiteCheckedAt: undefined,
        websiteHttpStatus: undefined,
        city: normalized.city ?? run.city,
        category: normalized.category ?? run.category,
        address: normalized.address,
        socials: normalized.socials,
        whatsapp: normalized.whatsapp,
        source: "DISCOVERY",
        marketCode: run.marketCode,
        region: normalized.region ?? run.region,
        stage: "DISCOVERED",
        score: undefined,
        campaignId: run.campaignId,
        convertedClientId: undefined,
        confidence: normalized.confidence,
        discoveredBy: run.providerSlug,
        discoveryRunId: run._id,
        discoveredAt: now,
        sourceReference: normalized.sourceReference,
        notes: normalized.notes,
        updatedAt: now,
      });
      candidates.push(
        toBusinessIdentity({
          id: businessId,
          company: normalized.company,
          city: normalized.city,
          website: normalized.website,
          phone: normalized.phone,
          email: normalized.email,
        }),
      );
      await ctx.db.insert("discoveryResults", {
        runId: run._id,
        providerSlug: run.providerSlug,
        status: "ACCEPTED",
        raw,
        normalized,
        businessId,
        confidence: normalized.confidence,
        retrievedAt: now,
        createdAt: now,
      });
      accepted += 1;
    } catch (error) {
      // A record that could not be processed at all: honest FAILED outcome.
      failed += 1;
      log("warn", "discovery.record_failed", {
        runId: run._id,
        message: error instanceof Error ? error.message : String(error),
      });
      await ctx.db.insert("discoveryResults", {
        runId: run._id,
        providerSlug: run.providerSlug,
        status: "FAILED",
        raw,
        rejectionReason: "The record could not be processed.",
        retrievedAt: now,
        createdAt: now,
      });
    }
  }

  return { accepted, duplicates, rejected, failed };
}

/** Keep the campaign's status in sync with its active discovery runs. */
async function syncCampaignStatus(
  ctx: MutationCtx,
  campaignId: Id<"campaigns">,
  actorId?: Id<"users">,
): Promise<void> {
  const campaign = await ctx.db.get(campaignId);
  if (!campaign) return;
  const runs = await ctx.db
    .query("discoveryRuns")
    .withIndex("by_campaign", (q) => q.eq("campaignId", campaignId))
    .collect();
  const active = runs.filter((run) =>
    ["QUEUED", "RUNNING", "PAUSED", "CANCELLING"].includes(run.status),
  );
  if (active.length > 0) {
    if (campaign.status === "DRAFT" || campaign.status === "READY") {
      await ctx.db.patch(campaignId, {
        status: "RUNNING",
        updatedAt: Date.now(),
      });
      await recordActivity(ctx, {
        type: "CAMPAIGN_STATUS_CHANGED",
        description: `${campaign.name} moved to ${CAMPAIGN_STATUS_LABELS.RUNNING}`,
        actorId,
        entityType: "campaign",
        entityId: campaignId,
      });
    }
  } else if (campaign.status === "RUNNING") {
    await ctx.db.patch(campaignId, {
      status: "READY",
      updatedAt: Date.now(),
    });
    await recordActivity(ctx, {
      type: "CAMPAIGN_STATUS_CHANGED",
      description: `${campaign.name} moved to ${CAMPAIGN_STATUS_LABELS.READY}`,
      actorId,
      entityType: "campaign",
      entityId: campaignId,
    });
  }
}

/* -------------------------------- Mutations ------------------------------- */

/**
 * Start a discovery run for a campaign. Validation is real: the campaign
 * must carry the full discovery configuration and the provider must be
 * configured. An unconfigured provider produces an auditable FAILED run,
 * never a fake success.
 */
export const start = mutation({
  args: {
    campaignId: v.id("campaigns"),
    providerSlug: v.string(),
    targetCount: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const campaign = await ctx.db.get(args.campaignId);
    if (!campaign) {
      throw apiError("NOT_FOUND", "This campaign no longer exists.");
    }
    const provider = DISCOVERY_PROVIDERS.find(
      (item) => item.slug === args.providerSlug,
    );
    if (!provider) {
      throw apiError("VALIDATION", "That discovery provider is not registered.");
    }
    const readiness = discoveryReadiness(campaign);
    if (!readiness.ready) {
      throw apiError(
        "VALIDATION",
        `Campaign is not ready for discovery — missing: ${readiness.missing.join(", ")}.`,
      );
    }
    const targetCount = args.targetCount ?? campaign.targetCount ?? 0;
    if (!Number.isInteger(targetCount) || targetCount < 1) {
      throw apiError("VALIDATION", "Set a target count of at least 1.");
    }

    const now = Date.now();
    const configured = provider.configured;
    const runId = await ctx.db.insert("discoveryRuns", {
      campaignId: campaign._id,
      status: configured ? "QUEUED" : "FAILED",
      providerSlug: provider.slug,
      providerName: provider.name,
      marketCode: campaign.marketCode,
      region: campaign.region,
      city: campaign.city,
      category: campaign.category,
      requestedCount: targetCount,
      discoveredCount: 0,
      acceptedCount: 0,
      duplicateCount: 0,
      rejectedCount: 0,
      failedCount: 0,
      processedCount: 0,
      errorCode: configured ? undefined : "PROVIDER_NOT_CONFIGURED",
      errorMessage: configured
        ? undefined
        : `${provider.name} is not configured. Required: ${provider.requirements.join(", ")}.`,
      startedAt: configured ? now : undefined,
      completedAt: configured ? undefined : now,
      cancelledAt: undefined,
      processedBatches: [],
      notes: normalizeText(args.notes),
      createdAt: now,
      updatedAt: now,
    });

    if (configured) {
      await syncCampaignStatus(ctx, campaign._id, user._id);
      await recordActivity(ctx, {
        type: "DISCOVERY_STARTED",
        description: `Discovery started — ${campaign.name} · ${provider.name} (target ${targetCount})`,
        actorId: user._id,
        entityType: "discoveryRun",
        entityId: runId,
      });
      log("info", "discovery.started", {
        runId,
        campaignId: campaign._id,
        provider: provider.slug,
        targetCount,
      });
    } else {
      await recordActivity(ctx, {
        type: "DISCOVERY_FAILED",
        description: `Discovery failed — ${campaign.name} · ${DISCOVERY_RUN_STATUS_LABELS.FAILED}: ${provider.name} is not configured`,
        actorId: user._id,
        entityType: "discoveryRun",
        entityId: runId,
      });
      log("warn", "discovery.blocked", {
        runId,
        campaignId: campaign._id,
        provider: provider.slug,
        reason: "PROVIDER_NOT_CONFIGURED",
      });
    }
    return runId;
  },
});

/**
 * Submit a batch of raw records to a csv-import run. The batch is processed
 * atomically; a client-supplied batchId makes re-submissions idempotent.
 */
export const submitRecords = mutation({
  args: {
    runId: v.id("discoveryRuns"),
    batchId: v.string(),
    records: v.array(discoveryRawRecordValidator),
  },
  handler: async (ctx, { runId, batchId, records }) => {
    const user = await requireUser(ctx);
    const run = await ctx.db.get(runId);
    if (!run) {
      throw apiError("NOT_FOUND", "This discovery run no longer exists.");
    }
    if (run.processedBatches.includes(batchId)) {
      return {
        runId,
        alreadyProcessed: true as const,
        status: run.status,
        processed: run.processedCount,
        accepted: run.acceptedCount,
        duplicates: run.duplicateCount,
        rejected: run.rejectedCount,
        failed: run.failedCount,
      };
    }
    if (TERMINAL_RUN_STATUSES.includes(run.status)) {
      throw apiError(
        "CONFLICT",
        `This run is already ${DISCOVERY_RUN_STATUS_LABELS[run.status].toLowerCase()}.`,
      );
    }
    if (run.providerSlug !== "csv-import") {
      throw apiError(
        "VALIDATION",
        "This provider does not accept record imports.",
      );
    }
    if (records.length === 0) {
      throw apiError("VALIDATION", "No records to import.");
    }
    if (records.length > MAX_BATCH_RECORDS) {
      throw apiError(
        "VALIDATION",
        `Import at most ${MAX_BATCH_RECORDS} records per batch.`,
      );
    }

    const now = Date.now();
    const nextStatus: DiscoveryRunStatus =
      run.status === "QUEUED" ? "RUNNING" : run.status;
    if (nextStatus !== run.status) {
      await ctx.db.patch(runId, {
        status: nextStatus,
        startedAt: run.startedAt ?? now,
        updatedAt: now,
      });
    }

    const outcomes = await processRecords(ctx, { ...run, status: nextStatus }, records);

    const discoveredCount = run.discoveredCount + records.length;
    const processedCount = run.processedCount + records.length;
    const acceptedCount = run.acceptedCount + outcomes.accepted;
    const duplicateCount = run.duplicateCount + outcomes.duplicates;
    const rejectedCount = run.rejectedCount + outcomes.rejected;
    const failedCount = run.failedCount + outcomes.failed;

    let finalStatus: DiscoveryRunStatus = nextStatus;
    if (failedCount > 0) {
      finalStatus = "PARTIAL";
    } else if (processedCount >= run.requestedCount) {
      finalStatus = "COMPLETED";
    }
    if (!canRunTransition(nextStatus, finalStatus)) {
      finalStatus = nextStatus; // stay RUNNING; never an invalid state
    }

    const terminal = TERMINAL_RUN_STATUSES.includes(finalStatus);
    await ctx.db.patch(runId, {
      status: finalStatus,
      discoveredCount,
      processedCount,
      acceptedCount,
      duplicateCount,
      rejectedCount,
      failedCount,
      processedBatches: [...run.processedBatches, batchId],
      updatedAt: now,
      ...(terminal ? { completedAt: run.completedAt ?? now } : {}),
    });

    await recordActivity(ctx, {
      type: "DISCOVERY_RECORDS_IMPORTED",
      description: `Imported ${records.length} record${
        records.length === 1 ? "" : "s"
      } — ${acceptedCount - run.acceptedCount} accepted, ${
        outcomes.duplicates
      } duplicate${outcomes.duplicates === 1 ? "" : "s"}, ${
        outcomes.rejected
      } rejected, ${outcomes.failed} failed`,
      actorId: user._id,
      entityType: "discoveryRun",
      entityId: runId,
    });

    if (terminal) {
      await recordActivity(ctx, {
        type:
          finalStatus === "PARTIAL" ? "DISCOVERY_PARTIAL" : "DISCOVERY_COMPLETED",
        description:
          finalStatus === "PARTIAL"
            ? `Discovery partially completed — ${failedCount} failed record${
                failedCount === 1 ? "" : "s"
              }`
            : `Discovery completed — ${acceptedCount} accepted, ${duplicateCount} duplicate${
                duplicateCount === 1 ? "" : "s"
              }, ${rejectedCount} rejected`,
        actorId: user._id,
        entityType: "discoveryRun",
        entityId: runId,
      });
      await syncCampaignStatus(ctx, run.campaignId, user._id);
    }

    log("info", "discovery.records_imported", {
      runId,
      batchId,
      records: records.length,
      outcomes,
      status: finalStatus,
    });

    const updated = await ctx.db.get(runId);
    return {
      runId,
      alreadyProcessed: false as const,
      status: updated?.status ?? finalStatus,
      processed: updated?.processedCount ?? processedCount,
      accepted: updated?.acceptedCount ?? acceptedCount,
      duplicates: updated?.duplicateCount ?? duplicateCount,
      rejected: updated?.rejectedCount ?? rejectedCount,
      failed: updated?.failedCount ?? failedCount,
    };
  },
});

/** Finish a running run early (target reached, or operator satisfied). */
export const finish = mutation({
  args: { runId: v.id("discoveryRuns") },
  handler: async (ctx, { runId }) => {
    const user = await requireUser(ctx);
    const run = await ctx.db.get(runId);
    if (!run) {
      throw apiError("NOT_FOUND", "This discovery run no longer exists.");
    }
    if (run.status === "QUEUED") {
      throw apiError(
        "CONFLICT",
        "This run has not started — cancel it instead of finishing it.",
      );
    }
    if (TERMINAL_RUN_STATUSES.includes(run.status)) {
      throw apiError(
        "CONFLICT",
        `This run is already ${DISCOVERY_RUN_STATUS_LABELS[run.status].toLowerCase()}.`,
      );
    }
    const finalStatus: DiscoveryRunStatus =
      run.failedCount > 0 ? "PARTIAL" : "COMPLETED";
    const now = Date.now();
    await ctx.db.patch(runId, {
      status: finalStatus,
      completedAt: now,
      updatedAt: now,
    });
    await recordActivity(ctx, {
      type: finalStatus === "PARTIAL" ? "DISCOVERY_PARTIAL" : "DISCOVERY_COMPLETED",
      description:
        finalStatus === "PARTIAL"
          ? `Discovery partially completed — ${run.failedCount} failed record${
              run.failedCount === 1 ? "" : "s"
            }`
          : `Discovery completed — ${run.acceptedCount} accepted, ${run.duplicateCount} duplicate${
              run.duplicateCount === 1 ? "" : "s"
            }, ${run.rejectedCount} rejected`,
      actorId: user._id,
      entityType: "discoveryRun",
      entityId: runId,
    });
    await syncCampaignStatus(ctx, run.campaignId, user._id);
    log("info", "discovery.finished", { runId, status: finalStatus });
    return { status: finalStatus };
  },
});

/**
 * Cancel a queued/running run. Cancellation is real: for the batch import
 * provider the run stops accepting further batches immediately (each batch
 * is atomic, so an in-flight batch completes before cancellation applies).
 */
export const cancel = mutation({
  args: {
    runId: v.id("discoveryRuns"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, { runId, reason }) => {
    const user = await requireUser(ctx);
    const run = await ctx.db.get(runId);
    if (!run) {
      throw apiError("NOT_FOUND", "This discovery run no longer exists.");
    }
    if (TERMINAL_RUN_STATUSES.includes(run.status)) {
      throw apiError(
        "CONFLICT",
        `This run is already ${DISCOVERY_RUN_STATUS_LABELS[run.status].toLowerCase()} and cannot be cancelled.`,
      );
    }
    const now = Date.now();
    await ctx.db.patch(runId, {
      status: "CANCELLED",
      cancelledAt: now,
      cancelledReason: normalizeText(reason),
      updatedAt: now,
    });
    await recordActivity(ctx, {
      type: "DISCOVERY_CANCELLED",
      description: `Discovery cancelled — ${DISCOVERY_RUN_STATUS_LABELS.CANCELLED}${
        reason ? ` (${reason})` : ""
      }`,
      actorId: user._id,
      entityType: "discoveryRun",
      entityId: runId,
    });
    await syncCampaignStatus(ctx, run.campaignId, user._id);
    log("info", "discovery.cancelled", { runId, reason });
    return { status: "CANCELLED" as const };
  },
});

/* ---------------------------- Website reachability ------------------------ */

/** Internal read used by the website check action. */
export const getBusiness = internalQuery({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, { businessId }) => ctx.db.get(businessId),
});

/** Internal write used by the website check action. */
export const setWebsiteCheck = internalMutation({
  args: {
    businessId: v.id("businesses"),
    websiteStatus: websiteReachabilityValidator,
    websiteHttpStatus: v.optional(v.number()),
    websiteCheckedAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.businessId, {
      websiteStatus: args.websiteStatus,
      websiteHttpStatus: args.websiteHttpStatus,
      websiteCheckedAt: args.websiteCheckedAt,
      updatedAt: args.websiteCheckedAt,
    });
    const business = await ctx.db.get(args.businessId);
    await recordActivity(ctx, {
      type: "DISCOVERY_WEBSITE_CHECKED",
      description: `Website status for ${business?.company ?? "business"}: ${
        WEBSITE_REACHABILITY_LABELS[args.websiteStatus]
      }${args.websiteHttpStatus ? ` (HTTP ${args.websiteHttpStatus})` : ""}`,
      entityType: "business",
      entityId: args.businessId,
    });
  },
});

/**
 * Perform a real reachability check on a business website: fetch the URL
 * with a bounded timeout and record the honest outcome. The result is a
 * status, not a quality claim.
 */
export const checkWebsite = action({
  args: { businessId: v.id("businesses") },
  handler: async (
    ctx,
    { businessId },
  ): Promise<{
    websiteStatus: WebsiteReachabilityState;
    websiteHttpStatus: number | undefined;
    website: string | null;
    checkedAt: number;
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw apiError("UNAUTHENTICATED", "You must be signed in to do that.");
    }
    const business: Doc<"businesses"> | null = await ctx.runQuery(
      internal.discovery.getBusiness,
      { businessId },
    );
    if (!business) {
      throw apiError("NOT_FOUND", "This business no longer exists.");
    }

    const checkedAt = Date.now();
    let websiteStatus: WebsiteReachabilityState;
    let websiteHttpStatus: number | undefined;

    if (!business.website) {
      websiteStatus = "NO_WEBSITE";
    } else {
      const canonical = canonicalizeUrl(business.website);
      if (!canonical) {
        websiteStatus = "INVALID_URL";
      } else {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10_000);
        try {
          const response = await fetch(canonical.url, {
            redirect: "follow",
            signal: controller.signal,
            headers: { "user-agent": "AgencyStudio-HealthCheck/0.3" },
          });
          websiteHttpStatus = response.status;
          if (response.ok) {
            websiteStatus = "HAS_WEBSITE";
          } else if (response.status === 403 || response.status === 429) {
            websiteStatus = "BLOCKED";
          } else {
            websiteStatus = "UNREACHABLE";
          }
          await response.body?.cancel().catch(() => {});
        } catch (error) {
          if (controller.signal.aborted) {
            websiteStatus = "UNREACHABLE"; // timed out — could not be reached
          } else if (error instanceof TypeError) {
            websiteStatus = "UNREACHABLE"; // DNS/network failure
          } else {
            websiteStatus = "CHECK_FAILED";
          }
        } finally {
          clearTimeout(timer);
        }
      }
    }

    await ctx.runMutation(internal.discovery.setWebsiteCheck, {
      businessId,
      websiteStatus,
      websiteHttpStatus,
      websiteCheckedAt: checkedAt,
    });
    log("info", "discovery.website_check", {
      businessId,
      websiteStatus,
      websiteHttpStatus,
    });
    return {
      websiteStatus,
      websiteHttpStatus,
      website: business.website ?? null,
      checkedAt,
    };
  },
});
