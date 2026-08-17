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
 * (src/shared/discovery.ts). `csv-import` ingests records the operator
 * already has (directory exports, research notes); `scrapegraphai` is a
 * live API provider executed by the node-runtime actions in
 * src/convex/scrapegraphai.ts, which validate SGAI_API_KEY from the server
 * environment and feed real results back through this same pipeline via
 * the internal ingestRecords mutation.
 *
 * All counters (discovered/accepted/duplicate/rejected/failed) are derived
 * from actual record processing. Nothing is ever fabricated.
 */
import { v } from "convex/values";
import { CAMPAIGN_STATUS_LABELS, HIGH_PRIORITY_SCORE } from "../shared/domain";
import {
  DEFAULT_WEBSITE_TARGET,
  DISCOVERY_ERROR_LABELS,
  DISCOVERY_PROVIDERS,
  DISCOVERY_RUN_STATUS_LABELS,
  TERMINAL_RUN_STATUSES,
  WEBSITE_REACHABILITY_LABELS,
  canRunTransition,
  discoveryReadiness,
  qualifyLead,
  type DiscoveryNormalizedRecord,
  type DiscoveryRunStatus,
  type DiscoveryRawRecord,
  type DuplicateSignal,
  type WebsiteReachabilityState,
  type WebsiteTarget,
} from "../shared/discovery";
import type { BusinessIdentity } from "../shared/discovery/dedupe";
import { findDuplicate, toBusinessIdentity } from "../shared/discovery/dedupe";
import { enrichmentUpdates, type EnrichmentUpdates } from "../shared/discovery/enrich";
import {
  canonicalizeUrl,
  isDirectoryDomain,
  normalizeEmail,
  normalizeName,
  normalizePhone,
  normalizeRecord,
} from "../shared/discovery/normalize";
import {
  scoreNormalizedRecord,
  scoreOpportunity,
} from "../shared/discovery/score";
import { validateRawRecord } from "../shared/discovery/validate";
import { internal } from "./_generated/api";
import { performWebsiteCheck } from "./lib/website";
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
  leadQualificationValidator,
  websiteReachabilityValidator,
  websiteTargetValidator,
} from "./schema";

const MAX_BATCH_RECORDS = 200;
const RESULTS_LIMIT = 500;
const MAX_WEBSITE_CHECK_BATCH = 50;
/** Polite pacing between website checks so a batch never hammers a host. */
const WEBSITE_CHECK_PACING_MS = 250;

/** Provider confidence in operator-provided records. */
const CSV_IMPORT_CONFIDENCE = 1;

function normalizeText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Build the stored opportunity assessment from a normalized record. */
function opportunityFromRecord(
  normalized: DiscoveryNormalizedRecord,
  scoredAt: number,
) {
  const assessment = scoreNormalizedRecord(normalized);
  return { score: assessment.score, factors: assessment.factors, scoredAt };
}

/**
 * Compute the stored opportunity assessment from an existing business's
 * real fields. Used when a signal changes (e.g. a website check completes).
 */
function opportunityFromBusiness(
  business: Doc<"businesses">,
  scoredAt: number,
) {
  const assessment = scoreOpportunity({
    websiteStatus: business.websiteStatus,
    hasEmail: Boolean(business.email),
    hasPhone: Boolean(business.phone),
    hasContactName: Boolean(business.contactName),
    hasCity: Boolean(business.city),
    hasCategory: Boolean(business.category),
  });
  return { score: assessment.score, factors: assessment.factors, scoredAt };
}

/**
 * The website target a business was discovered under: the run's snapshot
 * first, then the campaign's, then the strict default. Runs started before
 * the target existed (or businesses created outside discovery) fall back
 * honestly to NO_WEBSITE_ONLY.
 */
async function websiteTargetForBusiness(
  ctx: MutationCtx,
  business: Doc<"businesses">,
): Promise<WebsiteTarget> {
  if (business.discoveryRunId) {
    const run = await ctx.db.get(business.discoveryRunId);
    if (run?.websiteTarget) return run.websiteTarget;
  }
  if (business.campaignId) {
    const campaign = await ctx.db.get(business.campaignId);
    if (campaign?.websiteTarget) return campaign.websiteTarget;
  }
  return DEFAULT_WEBSITE_TARGET;
}

/** Mirror a business's qualification onto its discovery result rows. */
async function patchResultQualification(
  ctx: MutationCtx,
  business: Pick<
    Doc<"businesses">,
    "_id" | "discoveryRunId" | "qualification" | "qualificationReason"
  >,
): Promise<void> {
  if (!business.discoveryRunId) return;
  const rows = await ctx.db
    .query("discoveryResults")
    .withIndex("by_business", (q) => q.eq("businessId", business._id))
    .collect();
  for (const row of rows) {
    await ctx.db.patch(row._id, {
      qualification: business.qualification,
      qualificationReason: business.qualificationReason,
    });
  }
}

/* --------------------------------- Queries -------------------------------- */

/**
 * Provider configuration status is reported by the
 * `scrapegraphai.providerStatus` ACTION (src/convex/scrapegraphai.ts):
 * only server-side code can read SGAI_API_KEY, and it lives in a "use
 * node" file. Queries cannot read the environment, so there is no
 * discovery.providers query — the registry is always presented with the
 * live configured flag.
 */

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

/** Single run with its campaign summary and website-check backlog. */
export const runsGet = query({
  args: { runId: v.id("discoveryRuns") },
  handler: async (ctx, { runId }) => {
    await requireUser(ctx);
    const run = await ctx.db.get(runId);
    if (!run) throw apiError("NOT_FOUND", "This discovery run no longer exists.");
    const campaign = await ctx.db.get(run.campaignId);

    // How many accepted businesses from this run still have an unverified
    // website (status UNKNOWN) — the honest "needs a check" backlog.
    const results = await ctx.db
      .query("discoveryResults")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .collect();
    const businessIds = [
      ...new Set(
        results
          .filter(
            (row) => row.status === "ACCEPTED" && row.businessId !== undefined,
          )
          .map((row) => row.businessId as Id<"businesses">),
      ),
    ];
    const businesses = (
      await Promise.all(businessIds.map((id) => ctx.db.get(id)))
    ).filter((business): business is Doc<"businesses"> => business !== null);
    const pendingWebsiteChecks = businesses.filter(
      (business) => business.websiteStatus === "UNKNOWN",
    ).length;

    return {
      ...run,
      pendingWebsiteChecks,
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
    /** PENDING = accepted rows whose verification has not run yet. */
    qualification: v.optional(
      v.union(leadQualificationValidator, v.literal("PENDING")),
    ),
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
  handler: async (ctx, { runId, status, qualification, sort }) => {
    await requireUser(ctx);
    const rows = await ctx.db
      .query("discoveryResults")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .order("desc")
      .take(RESULTS_LIMIT);
    let filtered = status ? rows.filter((row) => row.status === status) : rows;
    if (qualification === "PENDING") {
      filtered = filtered.filter((row) => row.qualification === undefined);
    } else if (qualification) {
      filtered = filtered.filter((row) => row.qualification === qualification);
    }

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
            opportunity: byId.get(row.businessId)?.opportunity,
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

    // Automatic opportunity scoring coverage (Phase 3 lead intelligence).
    const scoredBusinesses = businesses.filter(
      (business) => business.opportunity !== undefined,
    );
    const opportunityScored = scoredBusinesses.length;
    const highOpportunity = scoredBusinesses.filter(
      (business) => business.opportunity!.score >= HIGH_PRIORITY_SCORE,
    ).length;
    const opportunitySum = scoredBusinesses.reduce(
      (sum, business) => sum + business.opportunity!.score,
      0,
    );

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
      opportunityScored,
      highOpportunity,
      averageOpportunity:
        opportunityScored > 0 ? Math.round(opportunitySum / opportunityScored) : null,
      latestRun,
    };
  },
});

/* -------------------------------- Pipeline -------------------------------- */

/** Per-record outcome of the deterministic pipeline, with what to persist. */
type RecordOutcome =
  | {
      status: "ACCEPTED";
      businessId: Id<"businesses">;
      normalized: DiscoveryNormalizedRecord;
    }
  | {
      status: "DUPLICATE";
      duplicateOf: Id<"businesses">;
      duplicateSignal: DuplicateSignal;
      normalized: DiscoveryNormalizedRecord;
    }
  | {
      status: "REJECTED";
      rejectionReason: string;
      normalized: DiscoveryNormalizedRecord;
    }
  | { status: "FAILED"; rejectionReason: string };

/**
 * Process one raw record through the pipeline: normalize → validate →
 * deduplicate → (persist | link), returning the outcome. Pure state changes
 * happen here; the caller decides how to record the outcome (insert a fresh
 * result row for a batch, patch an existing FAILED row for a retry).
 *
 * `candidates` is mutated in place when a record is accepted so later
 * records in the same batch/retry see it.
 */
async function processRecord(
  ctx: MutationCtx,
  run: Doc<"discoveryRuns">,
  raw: DiscoveryRawRecord,
  candidates: BusinessIdentity[],
  now: number,
): Promise<RecordOutcome> {
  try {
    const normalized = normalizeRecord(raw, CSV_IMPORT_CONFIDENCE);
    const validation = validateRawRecord(raw);

    if (!validation.valid) {
      return {
        status: "REJECTED",
        rejectionReason: validation.reasons.join(" "),
        normalized,
      };
    }

    const match = findDuplicate(normalized, candidates);
    if (match.matched && match.businessId && match.signal) {
      const existingBusiness = await ctx.db.get(
        match.businessId as Id<"businesses">,
      );
      if (existingBusiness) {
        // Controlled enrichment: fill only empty fields on high-confidence
        // signals; never overwrite; never destroy data.
        const updates: EnrichmentUpdates = enrichmentUpdates(
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
        return {
          status: "DUPLICATE",
          duplicateOf: existingBusiness._id,
          duplicateSignal: match.signal,
          normalized,
        };
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
      opportunity: opportunityFromRecord(normalized, now),
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
    return { status: "ACCEPTED", businessId, normalized };
  } catch (error) {
    // A record that could not be processed at all: honest FAILED outcome.
    log("warn", "discovery.record_failed", {
      runId: run._id,
      message: error instanceof Error ? error.message : String(error),
    });
    return {
      status: "FAILED",
      rejectionReason: "The record could not be processed.",
    };
  }
}

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
    const outcome = await processRecord(ctx, run, raw, candidates, now);
    switch (outcome.status) {
      case "ACCEPTED":
        await ctx.db.insert("discoveryResults", {
          runId: run._id,
          providerSlug: run.providerSlug,
          status: "ACCEPTED",
          raw,
          normalized: outcome.normalized,
          businessId: outcome.businessId,
          confidence: outcome.normalized.confidence,
          retrievedAt: now,
          createdAt: now,
        });
        accepted += 1;
        break;
      case "DUPLICATE":
        await ctx.db.insert("discoveryResults", {
          runId: run._id,
          providerSlug: run.providerSlug,
          status: "DUPLICATE",
          raw,
          normalized: outcome.normalized,
          duplicateOf: outcome.duplicateOf,
          duplicateSignal: outcome.duplicateSignal,
          confidence: outcome.normalized.confidence,
          retrievedAt: now,
          createdAt: now,
        });
        duplicates += 1;
        break;
      case "REJECTED":
        await ctx.db.insert("discoveryResults", {
          runId: run._id,
          providerSlug: run.providerSlug,
          status: "REJECTED",
          raw,
          normalized: outcome.normalized,
          rejectionReason: outcome.rejectionReason,
          confidence: outcome.normalized.confidence,
          retrievedAt: now,
          createdAt: now,
        });
        rejected += 1;
        break;
      case "FAILED":
        await ctx.db.insert("discoveryResults", {
          runId: run._id,
          providerSlug: run.providerSlug,
          status: "FAILED",
          raw,
          rejectionReason: outcome.rejectionReason,
          retrievedAt: now,
          createdAt: now,
        });
        failed += 1;
        break;
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
 * must carry the full discovery configuration. Import providers must be
 * statically configured; API providers start QUEUED and validate their
 * live configuration (the env var) at execution time in the actions
 * (src/convex/scrapegraphai.ts), because only those can read the server
 * environment. An unconfigured import provider still produces an
 * auditable FAILED run, never a fake success.
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
    // Import providers are configured statically. API providers start
    // QUEUED; execution (which can read the env) fails them honestly if
    // their key is missing — see src/convex/scrapegraphai.ts.
    const configured = provider.kind === "IMPORT" ? provider.configured : true;
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
      qualifiedCount: 0,
      websiteTarget: campaign.websiteTarget ?? DEFAULT_WEBSITE_TARGET,
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

/** Shape returned by the record-ingestion path (public + internal). */
type IngestRecordsResult = {
  runId: string;
  alreadyProcessed: boolean;
  status: string;
  processed: number;
  accepted: number;
  duplicates: number;
  rejected: number;
  failed: number;
};

/**
 * Submit a batch of raw records to a csv-import run. The batch is processed
 * atomically; a client-supplied batchId makes re-submissions idempotent.
 * Operators may only import into csv-import runs; API providers receive
 * their records through the internal ingest path (see ingestRecords).
 */
export const submitRecords = mutation({
  args: {
    runId: v.id("discoveryRuns"),
    batchId: v.string(),
    records: v.array(discoveryRawRecordValidator),
  },
  handler: async (
    ctx,
    { runId, batchId, records },
  ): Promise<IngestRecordsResult> => {
    const user = await requireUser(ctx);
    const run = await ctx.db.get(runId);
    if (!run) {
      throw apiError("NOT_FOUND", "This discovery run no longer exists.");
    }
    if (run.providerSlug !== "csv-import") {
      throw apiError(
        "VALIDATION",
        "This provider does not accept record imports.",
      );
    }
    return ctx.runMutation(internal.discovery.ingestRecords, {
      runId,
      batchId,
      records,
      actorId: user._id,
    });
  },
});

/**
 * Internal ingestion path shared by the operator import and the API
 * providers: process a batch of raw records through the deterministic
 * pipeline, update the run counters from real outcomes, and finalize the
 * run honestly. No auth check here — callers enforce it (the public
 * submitRecords and the execution actions). `batchId` keeps re-submission
 * idempotent.
 */
export const ingestRecords = internalMutation({
  args: {
    runId: v.id("discoveryRuns"),
    batchId: v.string(),
    records: v.array(discoveryRawRecordValidator),
    actorId: v.optional(v.id("users")),
  },
  handler: async (
    ctx,
    { runId, batchId, records, actorId },
  ): Promise<IngestRecordsResult> => {
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

    const outcomes = await processRecords(
      ctx,
      { ...run, status: nextStatus },
      records,
    );

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
      actorId,
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
        actorId,
        entityType: "discoveryRun",
        entityId: runId,
      });
      await syncCampaignStatus(ctx, run.campaignId, actorId);
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

/**
 * Finish a running run early (target reached, or the provider has nothing
 * more to return). Delegates to the internal finalizeRun so API execution
 * actions can close runs the same way.
 */
export const finish = mutation({
  args: { runId: v.id("discoveryRuns") },
  handler: async (ctx, { runId }): Promise<{ status: DiscoveryRunStatus }> => {
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
    return ctx.runMutation(internal.discovery.finalizeRun, {
      runId,
      actorId: user._id,
    });
  },
});

/* ------------------- Internal execution helpers (API path) ---------------- */

/**
 * Internal write: transition a run's status (used by the execution actions
 * to mark RUNNING before work starts).
 */
export const setRunStatus = internalMutation({
  args: {
    runId: v.id("discoveryRuns"),
    status: discoveryRunStatusValidator,
    startedAt: v.optional(v.number()),
  },
  handler: async (ctx, { runId, status, startedAt }) => {
    const run = await ctx.db.get(runId);
    if (!run) {
      throw apiError("NOT_FOUND", "This discovery run no longer exists.");
    }
    await ctx.db.patch(runId, {
      status,
      ...(startedAt !== undefined ? { startedAt } : {}),
      updatedAt: Date.now(),
    });
  },
});

/**
 * Internal write: mark a run FAILED with a real, auditable error (used by
 * the execution actions when the provider request fails).
 */
export const failRun = internalMutation({
  args: {
    runId: v.id("discoveryRuns"),
    errorCode: v.string(),
    errorMessage: v.string(),
  },
  handler: async (ctx, { runId, errorCode, errorMessage }) => {
    const run = await ctx.db.get(runId);
    if (!run) {
      throw apiError("NOT_FOUND", "This discovery run no longer exists.");
    }
    if (TERMINAL_RUN_STATUSES.includes(run.status)) return;
    const now = Date.now();
    await ctx.db.patch(runId, {
      status: "FAILED",
      errorCode,
      errorMessage,
      completedAt: now,
      updatedAt: now,
    });
    await recordActivity(ctx, {
      type: "DISCOVERY_FAILED",
      description: `Discovery failed — ${
        DISCOVERY_ERROR_LABELS[errorCode as keyof typeof DISCOVERY_ERROR_LABELS] ??
        errorCode
      }: ${errorMessage}`,
      entityType: "discoveryRun",
      entityId: runId,
    });
    await syncCampaignStatus(ctx, run.campaignId);
    log("error", "discovery.failed", { runId, errorCode, errorMessage });
  },
});

/**
 * Internal write: close a started run as COMPLETED (or PARTIAL when any
 * record failed), with the same real activity rows as the public finish.
 */
export const finalizeRun = internalMutation({
  args: { runId: v.id("discoveryRuns"), actorId: v.optional(v.id("users")) },
  handler: async (
    ctx,
    { runId, actorId },
  ): Promise<{ status: DiscoveryRunStatus }> => {
    const run = await ctx.db.get(runId);
    if (!run) {
      throw apiError("NOT_FOUND", "This discovery run no longer exists.");
    }
    if (TERMINAL_RUN_STATUSES.includes(run.status)) {
      return { status: run.status };
    }
    if (run.status === "QUEUED") {
      return { status: run.status };
    }
    const finalStatus: DiscoveryRunStatus =
      run.failedCount > 0 ? "PARTIAL" : "COMPLETED";
    const now = Date.now();

    // The qualified count is derived from real gate outcomes on the run's
    // accepted businesses — never an estimate.
    const acceptedRows = await ctx.db
      .query("discoveryResults")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .collect();
    const businessIds = [
      ...new Set(
        acceptedRows
          .filter(
            (row) => row.status === "ACCEPTED" && row.businessId !== undefined,
          )
          .map((row) => row.businessId as Id<"businesses">),
      ),
    ];
    const businesses = (
      await Promise.all(businessIds.map((id) => ctx.db.get(id)))
    ).filter((business): business is Doc<"businesses"> => business !== null);
    const qualifiedCount = businesses.filter(
      (business) => business.qualification === "QUALIFIED",
    ).length;

    await ctx.db.patch(runId, {
      status: finalStatus,
      qualifiedCount,
      completedAt: now,
      updatedAt: now,
    });
    await recordActivity(ctx, {
      type:
        finalStatus === "PARTIAL" ? "DISCOVERY_PARTIAL" : "DISCOVERY_COMPLETED",
      description:
        finalStatus === "PARTIAL"
          ? `Discovery partially completed — ${run.failedCount} failed record${
              run.failedCount === 1 ? "" : "s"
            }`
          : `Discovery completed — ${run.acceptedCount} accepted, ${qualifiedCount} qualified${
              qualifiedCount === 1 ? " lead" : " leads"
            }, ${run.duplicateCount} duplicate${
              run.duplicateCount === 1 ? "" : "s"
            }, ${run.rejectedCount} rejected`,
      actorId,
      entityType: "discoveryRun",
      entityId: runId,
    });
    await syncCampaignStatus(ctx, run.campaignId, actorId);
    log("info", "discovery.finalized", {
      runId,
      status: finalStatus,
      qualifiedCount,
    });
    return { status: finalStatus };
  },
});

/** Internal read: a run with its campaign (used by execution actions). */
export const getRun = internalQuery({
  args: { runId: v.id("discoveryRuns") },
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get(runId);
    if (!run) return null;
    const campaign = await ctx.db.get(run.campaignId);
    return { run, campaign };
  },
});

/**
 * Internal write: create the smoke-test campaign and run headlessly so the
 * smokeTest action can exercise the exact same pipeline without a session.
 * Only used by the ScrapeGraphAI smoke test.
 */
export const createSmokeRun = internalMutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    marketCode: v.string(),
    region: v.string(),
    city: v.string(),
    category: v.string(),
    targetCount: v.number(),
    providerSlug: v.string(),
    providerName: v.string(),
    websiteTarget: v.optional(websiteTargetValidator),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const websiteTarget: WebsiteTarget =
      args.websiteTarget ?? DEFAULT_WEBSITE_TARGET;
    const campaignId = await ctx.db.insert("campaigns", {
      name: args.name,
      description: args.description,
      status: "READY",
      marketCode: args.marketCode,
      region: args.region,
      city: args.city,
      category: args.category,
      targetCount: args.targetCount,
      websiteTarget,
      updatedAt: now,
    });
    const runId = await ctx.db.insert("discoveryRuns", {
      campaignId,
      status: "QUEUED",
      providerSlug: args.providerSlug,
      providerName: args.providerName,
      marketCode: args.marketCode,
      region: args.region,
      city: args.city,
      category: args.category,
      requestedCount: args.targetCount,
      discoveredCount: 0,
      acceptedCount: 0,
      duplicateCount: 0,
      rejectedCount: 0,
      failedCount: 0,
      processedCount: 0,
      qualifiedCount: 0,
      websiteTarget,
      errorCode: undefined,
      errorMessage: undefined,
      cancelledReason: undefined,
      startedAt: undefined,
      completedAt: undefined,
      cancelledAt: undefined,
      processedBatches: [],
      notes: `Smoke test — ${args.city} · ${args.category}`,
      createdAt: now,
      updatedAt: now,
    });
    await recordActivity(ctx, {
      type: "DISCOVERY_STARTED",
      description: `Discovery started — ${args.name} · ${args.providerName} (target ${args.targetCount})`,
      entityType: "discoveryRun",
      entityId: runId,
    });
    return { campaignId, runId };
  },
});

/**
 * Internal write: delete a smoke-test run and everything it created — its
 * result rows, the businesses it accepted, its campaign, and the activity
 * rows referencing those entities. Used to keep smoke tests small and
 * removable; never exposed to clients.
 */
export const cleanupSmokeRun = internalMutation({
  args: { runId: v.id("discoveryRuns") },
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get(runId);
    if (!run) {
      return {
        deleted: { run: 0, results: 0, businesses: 0, campaign: 0, activity: 0 },
      };
    }
    const campaignId = run.campaignId;
    const results = await ctx.db
      .query("discoveryResults")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .collect();
    const businessIds = [
      ...new Set(
        results
          .map((row) => row.businessId)
          .filter((id): id is Id<"businesses"> => id !== undefined),
      ),
    ];
    const related = new Set<string>([runId, campaignId, ...businessIds]);
    const activity = (await ctx.db.query("activity").collect()).filter(
      (row) => row.entityId !== undefined && related.has(row.entityId),
    );
    // Idempotent deletion: a retried action can leave two runs sharing a
    // campaign, and cleanup may be re-run — guard every delete.
    for (const row of results) {
      if (await ctx.db.get(row._id)) await ctx.db.delete(row._id);
    }
    for (const id of businessIds) {
      if (await ctx.db.get(id)) await ctx.db.delete(id);
    }
    if (await ctx.db.get(runId)) await ctx.db.delete(runId);
    if (campaignId && (await ctx.db.get(campaignId))) {
      await ctx.db.delete(campaignId);
    }
    for (const row of activity) {
      if (await ctx.db.get(row._id)) await ctx.db.delete(row._id);
    }
    log("info", "discovery.smoke_cleaned", {
      runId,
      results: results.length,
      businesses: businessIds.length,
      activity: activity.length,
    });
    return {
      deleted: {
        run: 1,
        results: results.length,
        businesses: businessIds.length,
        campaign: campaignId ? 1 : 0,
        activity: activity.length,
      },
    };
  },
});

/**
 * Internal read: full smoke-test snapshot (run, campaign, results with
 * business joins, and the activity rows written for these entities).
 */
export const getSmokeSnapshot = internalQuery({
  args: { runId: v.id("discoveryRuns") },
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get(runId);
    if (!run) return null;
    const campaign = await ctx.db.get(run.campaignId);
    const results = await ctx.db
      .query("discoveryResults")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .collect();
    const businessIds = [
      ...new Set(
        results
          .map((row) => row.businessId)
          .filter((id): id is Id<"businesses"> => id !== undefined),
      ),
    ];
    const businesses = (
      await Promise.all(businessIds.map((id) => ctx.db.get(id)))
    ).filter((business): business is Doc<"businesses"> => business !== null);
    const byId = new Map(businesses.map((business) => [business._id, business]));
    const relatedIds = new Set<string>([runId, run.campaignId]);
    for (const id of businessIds) relatedIds.add(id);
    const activity = (await ctx.db.query("activity").collect())
      .filter(
        (row) =>
          row.entityId !== undefined && relatedIds.has(row.entityId),
      )
      .sort((a, b) => b._creationTime - a._creationTime)
      .map((row) => ({
        type: row.type,
        description: row.description,
        entityType: row.entityType,
        entityId: row.entityId,
      }));
    return {
      run,
      campaign,
      results: results.map((row) => ({
        ...row,
        business: row.businessId ? byId.get(row.businessId) : undefined,
      })),
      activity,
    };
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

/**
 * Retry the FAILED records of a run. Each failed row keeps its raw
 * snapshot (provenance), so it can be re-processed through the same
 * deterministic pipeline. Outcomes update the existing row in place with a
 * `retriedAt` stamp; counters are recomputed from real outcomes.
 */
export const retryFailedRecords = mutation({
  args: { runId: v.id("discoveryRuns") },
  handler: async (ctx, { runId }) => {
    const user = await requireUser(ctx);
    const run = await ctx.db.get(runId);
    if (!run) {
      throw apiError("NOT_FOUND", "This discovery run no longer exists.");
    }
    if (run.failedCount === 0) {
      throw apiError("CONFLICT", "There are no failed records to retry.");
    }
    const results = await ctx.db
      .query("discoveryResults")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .collect();
    const failedRows = results.filter((row) => row.status === "FAILED");
    if (failedRows.length === 0) {
      throw apiError("CONFLICT", "There are no failed records to retry.");
    }

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
    const now = Date.now();

    let accepted = 0;
    let duplicates = 0;
    let rejected = 0;
    let stillFailed = 0;

    for (const row of failedRows) {
      const outcome = await processRecord(ctx, run, row.raw, candidates, now);
      const patch: Partial<Doc<"discoveryResults">> = {
        status: outcome.status,
        retriedAt: now,
      };
      switch (outcome.status) {
        case "ACCEPTED":
          patch.businessId = outcome.businessId;
          patch.normalized = outcome.normalized;
          patch.confidence = outcome.normalized.confidence;
          patch.rejectionReason = undefined;
          patch.duplicateOf = undefined;
          patch.duplicateSignal = undefined;
          accepted += 1;
          break;
        case "DUPLICATE":
          patch.normalized = outcome.normalized;
          patch.duplicateOf = outcome.duplicateOf;
          patch.duplicateSignal = outcome.duplicateSignal;
          patch.confidence = outcome.normalized.confidence;
          patch.rejectionReason = undefined;
          duplicates += 1;
          break;
        case "REJECTED":
          patch.normalized = outcome.normalized;
          patch.rejectionReason = outcome.rejectionReason;
          patch.businessId = undefined;
          patch.duplicateOf = undefined;
          patch.duplicateSignal = undefined;
          rejected += 1;
          break;
        case "FAILED":
          patch.rejectionReason = outcome.rejectionReason;
          stillFailed += 1;
          break;
      }
      await ctx.db.patch(row._id, patch);
    }

    const recovered = failedRows.length - stillFailed;
    await ctx.db.patch(runId, {
      acceptedCount: run.acceptedCount + accepted,
      duplicateCount: run.duplicateCount + duplicates,
      rejectedCount: run.rejectedCount + rejected,
      failedCount: Math.max(0, run.failedCount - recovered),
      updatedAt: now,
    });
    await recordActivity(ctx, {
      type: "DISCOVERY_RETRIED",
      description: `Retried ${failedRows.length} failed record${
        failedRows.length === 1 ? "" : "s"
      } — ${accepted} accepted, ${duplicates} duplicate${duplicates === 1 ? "" : "s"}, ${
        rejected
      } rejected, ${stillFailed} still failed`,
      actorId: user._id,
      entityType: "discoveryRun",
      entityId: runId,
    });
    log("info", "discovery.retried", {
      runId,
      retried: failedRows.length,
      accepted,
      duplicates,
      rejected,
      stillFailed,
    });
    return {
      retried: failedRows.length,
      accepted,
      duplicates,
      rejected,
      stillFailed,
      failedCount: Math.max(0, run.failedCount - recovered),
    };
  },
});

/* ---------------------------- Website reachability ------------------------ */

/* performWebsiteCheck lives in ./lib/website.ts so the node-runtime */
/* ScrapeGraphAI actions can reuse it (see src/convex/scrapegraphai.ts). */

/** Internal read used by the website check action. */
export const getBusiness = internalQuery({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, { businessId }) => ctx.db.get(businessId),
});

/**
 * Internal write used by the website check actions: persists the outcome
 * and recomputes the business's automatic opportunity score, because the
 * reachability signal is a scoring input. The score always reflects the
 * latest verified state.
 */
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
    if (business) {
      // Strict qualification gate: only positive evidence qualifies.
      const target = await websiteTargetForBusiness(ctx, business);
      const gate = qualifyLead(args.websiteStatus, target);
      await ctx.db.patch(args.businessId, {
        opportunity: opportunityFromBusiness(business, args.websiteCheckedAt),
        qualification: gate.qualification,
        qualificationReason: gate.reason,
        qualifiedAt:
          gate.qualification === "QUALIFIED" ? args.websiteCheckedAt : undefined,
      });
      await patchResultQualification(ctx, {
        _id: business._id,
        discoveryRunId: business.discoveryRunId,
        qualification: gate.qualification,
        qualificationReason: gate.reason,
      });
    }
    await recordActivity(ctx, {
      type: "DISCOVERY_WEBSITE_CHECKED",
      description: `Website status for ${business?.company ?? "business"}: ${
        WEBSITE_REACHABILITY_LABELS[args.websiteStatus]
      }${args.websiteHttpStatus ? ` (HTTP ${args.websiteHttpStatus})` : ""}${
        business?.qualification === "QUALIFIED"
          ? " — qualified no-website lead"
          : business?.qualification === "REJECTED_HAS_WEBSITE"
            ? " — rejected (has website)"
            : ""
      }`,
      entityType: "business",
      entityId: args.businessId,
    });
  },
});

/** Append real public profile URLs that are not already recorded. */
function mergeSocialUrls(
  existing: string[] | undefined,
  found: string[] | undefined,
): string[] | undefined {
  if (!found || found.length === 0) return existing;
  const seen = new Set(existing ?? []);
  for (const url of found) {
    if (url && !seen.has(url)) seen.add(url);
  }
  return [...seen];
}

/**
 * Internal write: persist a website found by the official-website
 * resolution step. The site is stored, then the execution action runs a
 * real reachability check on it (which drives the qualification gate).
 */
export const applyResolvedWebsite = internalMutation({
  args: {
    businessId: v.id("businesses"),
    website: v.string(),
    sourceReference: v.optional(v.string()),
  },
  handler: async (ctx, { businessId, website, sourceReference }) => {
    const business = await ctx.db.get(businessId);
    if (!business) {
      throw apiError("NOT_FOUND", "This business no longer exists.");
    }
    const canonical = canonicalizeUrl(website);
    if (!canonical) {
      // An unusable candidate is not evidence of anything — stay UNKNOWN.
      const target = await websiteTargetForBusiness(ctx, business);
      const gate = qualifyLead("UNKNOWN", target);
      const now = Date.now();
      await ctx.db.patch(businessId, {
        qualification: gate.qualification,
        qualificationReason:
          "The verification search reported a website but its URL was unusable — status left unknown.",
        updatedAt: now,
      });
      await patchResultQualification(ctx, {
        _id: business._id,
        discoveryRunId: business.discoveryRunId,
        qualification: gate.qualification,
        qualificationReason: gate.reason,
      });
      return;
    }
    await ctx.db.patch(businessId, {
      website: canonical.url,
      sourceReference: sourceReference ?? business.sourceReference,
      updatedAt: Date.now(),
    });
    log("info", "discovery.website_resolved", {
      businessId,
      website: canonical.url,
    });
  },
});

/**
 * Internal write: positively confirm a business has no official website
 * after a real verification search. This is the ONLY path that may set
 * NO_WEBSITE on a discovered business. Enrichment fills only empty fields
 * with values the verification search actually found — never fabricated.
 */
export const applyConfirmedNoWebsite = internalMutation({
  args: {
    businessId: v.id("businesses"),
    sourceReference: v.optional(v.string()),
    details: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    address: v.optional(v.string()),
    googleMapsUrl: v.optional(v.string()),
    socials: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const business = await ctx.db.get(args.businessId);
    if (!business) {
      throw apiError("NOT_FOUND", "This business no longer exists.");
    }
    const now = Date.now();
    const target = await websiteTargetForBusiness(ctx, business);
    const gate = qualifyLead("NO_WEBSITE", target);
    const reason =
      gate.reason + (args.details ? ` ${args.details.trim()}` : "");
    // A previously recorded directory/aggregator URL is not an official
    // website — clear it so the record honestly shows no website.
    const existingCanonical = business.website
      ? canonicalizeUrl(business.website)
      : null;
    const website =
      existingCanonical && isDirectoryDomain(existingCanonical.domain)
        ? undefined
        : business.website;
    await ctx.db.patch(args.businessId, {
      websiteStatus: "NO_WEBSITE",
      websiteState: "NONE",
      website,
      websiteCheckedAt: now,
      qualification: gate.qualification,
      qualificationReason: reason,
      qualifiedAt: gate.qualification === "QUALIFIED" ? now : undefined,
      // Enrichment: fill only empty fields with real found values.
      phone: args.phone && !business.phone ? normalizePhone(args.phone) : business.phone,
      email: args.email && !business.email ? normalizeEmail(args.email) : business.email,
      address:
        args.address && !business.address
          ? normalizeName(args.address)
          : business.address,
      googleMapsUrl:
        args.googleMapsUrl && !business.googleMapsUrl
          ? normalizeName(args.googleMapsUrl)
          : business.googleMapsUrl,
      socials: mergeSocialUrls(business.socials, args.socials),
      sourceReference: args.sourceReference ?? business.sourceReference,
      updatedAt: now,
    });
    const updated = await ctx.db.get(args.businessId);
    if (updated) {
      await ctx.db.patch(args.businessId, {
        opportunity: opportunityFromBusiness(updated, now),
      });
      await patchResultQualification(ctx, updated);
    }
    await recordActivity(ctx, {
      type: "DISCOVERY_WEBSITE_CHECKED",
      description: `Website status for ${business.company}: No website — confirmed by a real verification search${gate.qualification === "QUALIFIED" ? " · qualified no-website lead" : ""}`,
      entityType: "business",
      entityId: args.businessId,
    });
    log("info", "discovery.no_website_confirmed", {
      businessId: args.businessId,
      qualification: gate.qualification,
    });
  },
});

/**
 * Internal write: verification could not confirm anything (business not
 * found, search failed, or no usable URL). The business stays UNKNOWN and
 * is explicitly marked NOT_QUALIFIED — absence was never verified.
 */
export const applyWebsiteUnverified = internalMutation({
  args: {
    businessId: v.id("businesses"),
    reason: v.string(),
  },
  handler: async (ctx, { businessId, reason }) => {
    const business = await ctx.db.get(businessId);
    if (!business) {
      throw apiError("NOT_FOUND", "This business no longer exists.");
    }
    const target = await websiteTargetForBusiness(ctx, business);
    const gate = qualifyLead("UNKNOWN", target);
    const fullReason = `${gate.reason} ${reason.trim()}`.trim();
    const now = Date.now();
    await ctx.db.patch(businessId, {
      qualification: gate.qualification,
      qualificationReason: fullReason,
      qualifiedAt:
        gate.qualification === "QUALIFIED" ? now : undefined,
      updatedAt: now,
    });
    await patchResultQualification(ctx, {
      _id: business._id,
      discoveryRunId: business.discoveryRunId,
      qualification: gate.qualification,
      qualificationReason: fullReason,
    });
  },
});

/**
 * Perform a real reachability check on a business website. The result is
 * an honest status derived from an actual fetch — never a claim.
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
    const outcome = await performWebsiteCheck(business.website);
    await ctx.runMutation(internal.discovery.setWebsiteCheck, {
      businessId,
      websiteStatus: outcome.websiteStatus,
      websiteHttpStatus: outcome.websiteHttpStatus,
      websiteCheckedAt: checkedAt,
    });
    log("info", "discovery.website_check", {
      businessId,
      websiteStatus: outcome.websiteStatus,
      websiteHttpStatus: outcome.websiteHttpStatus,
    });
    return {
      websiteStatus: outcome.websiteStatus,
      websiteHttpStatus: outcome.websiteHttpStatus,
      website: business.website ?? null,
      checkedAt,
    };
  },
});

/** Internal read: accepted businesses of a run that still need a check. */
export const getRunBusinessesPendingWebsiteCheck = internalQuery({
  args: { runId: v.id("discoveryRuns"), limit: v.number() },
  handler: async (ctx, { runId, limit }) => {
    const results = await ctx.db
      .query("discoveryResults")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .collect();
    const businessIds = [
      ...new Set(
        results
          .filter(
            (row) => row.status === "ACCEPTED" && row.businessId !== undefined,
          )
          .map((row) => row.businessId as Id<"businesses">),
      ),
    ];
    const businesses = (
      await Promise.all(businessIds.map((id) => ctx.db.get(id)))
    ).filter(
      (business): business is Doc<"businesses"> =>
        business !== null &&
        (business.websiteStatus === "UNKNOWN" ||
          business.websiteStatus === "INVALID_URL"),
    );
    return businesses.slice(0, limit);
  },
});

/** Internal write: one summary activity row for a completed batch check. */
export const logWebsitesChecked = internalMutation({
  args: {
    runId: v.id("discoveryRuns"),
    checked: v.number(),
    counts: v.object({
      UNKNOWN: v.number(),
      HAS_WEBSITE: v.number(),
      NO_WEBSITE: v.number(),
      UNREACHABLE: v.number(),
      INVALID_URL: v.number(),
      BLOCKED: v.number(),
      CHECK_FAILED: v.number(),
    }),
  },
  handler: async (ctx, { runId, checked, counts }) => {
    const summary = Object.entries(counts)
      .filter(([, count]) => count > 0)
      .map(
        ([status, count]) =>
          `${count} ${WEBSITE_REACHABILITY_LABELS[status as WebsiteReachabilityState]}`,
      )
      .join(", ");
    await recordActivity(ctx, {
      type: "DISCOVERY_WEBSITES_CHECKED",
      description: `Website check batch — ${checked} business${
        checked === 1 ? "" : "es"
      } (${summary || "no reachable results"})`,
      entityType: "discoveryRun",
      entityId: runId,
    });
  },
});

/**
 * Batch website reachability checks for a run's accepted businesses whose
 * sites were never verified (websiteStatus UNKNOWN). Checks run
 * sequentially with polite pacing — real rate-limit awareness — and every
 * outcome is persisted with the same honest statuses as a single check.
 * Results feed straight back into the automatic opportunity score.
 */
export const checkWebsitesBatch = action({
  args: {
    runId: v.id("discoveryRuns"),
    limit: v.optional(v.number()),
  },
  handler: async (
    ctx,
    { runId, limit },
  ): Promise<{
    checked: number;
    results: Record<WebsiteReachabilityState, number>;
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw apiError("UNAUTHENTICATED", "You must be signed in to do that.");
    }
    const take = Math.min(Math.max(limit ?? 50, 1), MAX_WEBSITE_CHECK_BATCH);
    const businesses: Doc<"businesses">[] = await ctx.runQuery(
      internal.discovery.getRunBusinessesPendingWebsiteCheck,
      { runId, limit: take },
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
      });
      if (businesses.length > 1) {
        await sleep(WEBSITE_CHECK_PACING_MS);
      }
    }

    if (businesses.length > 0) {
      await ctx.runMutation(internal.discovery.logWebsitesChecked, {
        runId,
        checked: businesses.length,
        counts: results,
      });
    }
    log("info", "discovery.websites_checked", {
      runId,
      checked: businesses.length,
      results,
    });
    return { checked: businesses.length, results };
  },
});
