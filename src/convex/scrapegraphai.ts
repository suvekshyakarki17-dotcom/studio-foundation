/**
 * ScrapeGraphAI provider actions (Phase 3 discovery engine).
 *
 * This file runs in the Node.js runtime ("use node") because it reads the
 * SGAI_API_KEY from the server environment and performs real HTTP calls to
 * the ScrapeGraphAI V2 search API. It is the live execution path for the
 * `scrapegraphai` entry in DISCOVERY_PROVIDERS:
 *
 *   start (mutation, QUEUED run)
 *     → executeRun (this file: real API request)
 *     → map results onto DiscoveryRawRecord
 *     → ingestRecords (internal: normalize → validate → deduplicate →
 *       persist, shared with the operator import path)
 *     → finalizeRun (honest COMPLETED / PARTIAL / FAILED)
 *
 * smokeTest runs the exact same path end-to-end from the CLI with
 * --identity, creating a real campaign + run, and returns a full,
 * non-fabricated report. The key is never logged and never sent to the
 * client — only its presence/absence is reported.
 */
"use node";

import { v } from "convex/values";
import { scoreTier } from "../shared/domain";
import {
  DISCOVERY_ERROR_LABELS,
  DISCOVERY_PROVIDERS,
  type DiscoveryErrorCode,
  type DiscoveryProviderDefinition,
  type WebsiteReachabilityState,
} from "../shared/discovery";
import {
  SCRAPEGRAPHAI_AUTH_HEADER,
  SCRAPEGRAPHAI_MAX_RESULTS,
  SCRAPEGRAPHAI_SEARCH_ENDPOINT,
  buildLocalSearchPayload,
  buildWebsiteResolutionPayload,
  mapSearchResponseToRecords,
  mapWebsiteResolutionResponse,
  type ScrapegraphaiSearchPayload,
} from "../shared/discovery/scrapegraphai";
import {
  canonicalizeUrl,
  isDirectoryDomain,
} from "../shared/discovery/normalize";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  type ActionCtx,
} from "./_generated/server";
import { apiError } from "./lib/errors";
import { log } from "./lib/log";
import { performWebsiteCheck } from "./lib/website";

// The /search endpoint fetches each result page and runs an LLM extraction
// pass, so a full request can take minutes on slower plans. The action
// timeout (10 min) bounds the wait; this is the per-request cap.
const API_TIMEOUT_MS = 300_000;
const WEBSITE_CHECK_PACING_MS = 250;
const MAX_WEBSITE_CHECK_BATCH = 50;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Clamp a requested result count to the API's legal range (1..20). */
function clampLimit(limit: number): number {
  return Math.min(Math.max(Math.floor(limit) || 1, 1), SCRAPEGRAPHAI_MAX_RESULTS);
}

/** Is the provider's key present in the server environment? */
function isConfigured(): boolean {
  return Boolean(process.env.SGAI_API_KEY);
}

/* ------------------------------ API call -------------------------------- */

interface ApiCallResult {
  ok: boolean;
  httpStatus?: number;
  requestId?: string;
  json?: unknown;
  errorCode?: DiscoveryErrorCode;
  errorMessage?: string;
  elapsedMs?: number;
  pagesRequested?: number;
  pagesScraped?: number;
}

/**
 * Perform the real ScrapeGraphAI /search request for a given payload.
 * Errors are mapped onto the shared DISCOVERY_ERROR_CODES so the run
 * detail page can render an honest, understood failure.
 */
async function postSearch(
  payload: ScrapegraphaiSearchPayload,
): Promise<ApiCallResult> {
  if (!process.env.SGAI_API_KEY) {
    return {
      ok: false,
      errorCode: "PROVIDER_NOT_CONFIGURED",
      errorMessage:
        "ScrapeGraphAI is not configured — set SGAI_API_KEY as a project secret (see the Keys tab).",
    };
  }
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const response = await fetch(SCRAPEGRAPHAI_SEARCH_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [SCRAPEGRAPHAI_AUTH_HEADER]: process.env.SGAI_API_KEY,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await response.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    const detail =
      json !== null &&
      typeof json === "object" &&
      "detail" in (json as Record<string, unknown>)
        ? String((json as Record<string, unknown>).detail)
        : text.slice(0, 300) || `HTTP ${response.status}`;

    if (!response.ok) {
      const errorCode: DiscoveryErrorCode =
        response.status === 401 || response.status === 403
          ? "AUTHENTICATION"
          : response.status === 429
            ? "RATE_LIMITED"
            : response.status >= 500
              ? "PROVIDER_UNAVAILABLE"
              : "INVALID_REQUEST";
      return {
        ok: false,
        httpStatus: response.status,
        errorCode,
        errorMessage: `ScrapeGraphAI request failed (HTTP ${response.status}): ${detail}`,
        elapsedMs: Date.now() - startedAt,
      };
    }

    const meta =
      json !== null && typeof json === "object"
        ? ((json as Record<string, unknown>).metadata as
            | { pages?: { requested?: number; scraped?: number } }
            | undefined)
        : undefined;
    return {
      ok: true,
      httpStatus: response.status,
      requestId:
        json !== null &&
        typeof json === "object" &&
        "id" in (json as Record<string, unknown>)
          ? String((json as Record<string, unknown>).id)
          : undefined,
      json,
      elapsedMs: Date.now() - startedAt,
      pagesRequested: meta?.pages?.requested,
      pagesScraped: meta?.pages?.scraped,
    };
  } catch (error) {
    if (controller.signal.aborted) {
      return {
        ok: false,
        errorCode: "NETWORK",
        errorMessage: `ScrapeGraphAI request timed out after ${API_TIMEOUT_MS / 1000}s.`,
        elapsedMs: Date.now() - startedAt,
      };
    }
    return {
      ok: false,
      errorCode: "NETWORK",
      errorMessage: `Network failure contacting ScrapeGraphAI: ${
        error instanceof Error ? error.message : String(error)
      }`,
      elapsedMs: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Perform the real ScrapeGraphAI /search request for a local-business
 * discovery. Errors are mapped onto the shared DISCOVERY_ERROR_CODES so
 * the run detail page can render an honest, understood failure.
 */
async function callScrapegraphai(input: {
  city?: string;
  region?: string;
  category?: string;
  limit: number;
  country?: string;
}): Promise<ApiCallResult> {
  return postSearch(buildLocalSearchPayload(input));
}

/** First fetched page URL from the API response, for provenance. */
function sourceReferenceFrom(json: unknown): string | undefined {
  if (json === null || typeof json !== "object") return undefined;
  const results = (json as Record<string, unknown>).results;
  if (Array.isArray(results) && results.length > 0 && results[0]) {
    const url = (results[0] as Record<string, unknown>).url;
    return typeof url === "string" && url.trim() ? url.trim() : undefined;
  }
  return undefined;
}

/* --------------------------- Provider status ----------------------------- */

/**
 * The provider registry with the live `configured` flag. Only server-side
 * code can read SGAI_API_KEY, so this is an action (in a "use node" file)
 * rather than a query — the client calls it like any other function.
 */
export const providerStatus = action({
  args: {},
  handler: async (ctx): Promise<DiscoveryProviderDefinition[]> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw apiError("UNAUTHENTICATED", "You must be signed in to do that.");
    }
    return DISCOVERY_PROVIDERS.map((provider) =>
      provider.slug === "scrapegraphai"
        ? { ...provider, configured: isConfigured() }
        : provider,
    );
  },
});

/* ------------------------------ Run execution ---------------------------- */

/**
 * Execute a QUEUED ScrapeGraphAI run: mark it RUNNING, call the real API
 * with the campaign's market/location/category, map the extraction onto
 * raw records, feed them through the shared pipeline, and close the run
 * honestly (COMPLETED / PARTIAL / FAILED).
 */
export const executeRun = action({
  args: { runId: v.id("discoveryRuns") },
  handler: async (
    ctx,
    { runId },
  ): Promise<{
    runId: string;
    status: string;
    requested: number;
    returned: number;
    unmappable: number;
    accepted: number;
    duplicates: number;
    rejected: number;
    failed: number;
    qualified: number;
    requestId?: string;
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw apiError("UNAUTHENTICATED", "You must be signed in to do that.");
    }
    const snapshot = await ctx.runQuery(internal.discovery.getRun, { runId });
    if (!snapshot) {
      throw apiError("NOT_FOUND", "This discovery run no longer exists.");
    }
    const { run } = snapshot;
    if (run.status !== "QUEUED") {
      throw apiError(
        "CONFLICT",
        `This run is already ${run.status.toLowerCase()} — start a new run to execute again.`,
      );
    }
    if (run.providerSlug !== "scrapegraphai") {
      await ctx.runMutation(internal.discovery.failRun, {
        runId,
        errorCode: "PROVIDER_NOT_CONFIGURED",
        errorMessage: "Only the ScrapeGraphAI provider is wired for execution.",
      });
      throw apiError("CONFLICT", "This provider is not wired for execution.");
    }

    await ctx.runMutation(internal.discovery.setRunStatus, {
      runId,
      status: "RUNNING",
      startedAt: Date.now(),
    });

    const apiCall = await callScrapegraphai({
      city: run.city,
      region: run.region,
      category: run.category,
      limit: run.requestedCount,
      country: run.marketCode?.toLowerCase(),
    });

    if (!apiCall.ok) {
      await ctx.runMutation(internal.discovery.failRun, {
        runId,
        errorCode: apiCall.errorCode ?? "INTERNAL",
        errorMessage: apiCall.errorMessage ?? "The provider request failed.",
      });
      log("error", "scrapegraphai.execute_failed", {
        runId,
        errorCode: apiCall.errorCode,
        httpStatus: apiCall.httpStatus,
      });
      throw apiError("INTERNAL", apiCall.errorMessage ?? "Provider request failed.");
    }

    const mapped = mapSearchResponseToRecords(apiCall.json, {
      city: run.city,
      region: run.region,
      category: run.category,
      sourceReference: sourceReferenceFrom(apiCall.json),
    });
    // The API's extraction can return more businesses than the requested
    // page count; ingest at most the run's requested count.
    const records = mapped.records.slice(0, run.requestedCount);
    if (records.length === 0) {
      await ctx.runMutation(internal.discovery.failRun, {
        runId,
        errorCode: "MALFORMED_RESULT",
        errorMessage:
          "ScrapeGraphAI returned no mappable business records for this request.",
      });
      throw apiError(
        "INTERNAL",
        "ScrapeGraphAI returned no mappable business records.",
      );
    }

    const result = await ctx.runMutation(internal.discovery.ingestRecords, {
      runId,
      batchId: `api:scrapegraphai:${run._id}`,
      records,
    });

    // Real verification phase: reachability checks for records with a
    // URL, official-website resolution for records without one, then the
    // strict no-website qualification gate.
    const verification = await verifyRunWebsites(ctx, runId);

    // The provider returned everything it had; if the run did not reach
    // the requested count, close it honestly (COMPLETED or PARTIAL).
    if (result.status === "RUNNING") {
      await ctx.runMutation(internal.discovery.finalizeRun, { runId });
    }

    const finalized = await ctx.runQuery(internal.discovery.getRun, { runId });
    log("info", "scrapegraphai.execute_completed", {
      runId,
      requested: run.requestedCount,
      returned: mapped.returned,
      accepted: result.accepted,
      qualified: finalized?.run.qualifiedCount ?? 0,
      verified: verification.checked,
      confirmedNoWebsite: verification.resolution.confirmedNoWebsite,
      status: result.status,
      requestId: apiCall.requestId,
    });

    return {
      runId,
      status: result.status,
      requested: run.requestedCount,
      returned: mapped.returned,
      unmappable: mapped.unmappable,
      accepted: result.accepted,
      duplicates: result.duplicates,
      rejected: result.rejected,
      failed: result.failed,
      qualified: finalized?.run.qualifiedCount ?? 0,
      requestId: apiCall.requestId,
    };
  },
});

/* --------------------------- Website verification ------------------------- */

export interface WebsiteVerificationResult {
  checked: number;
  reachability: Record<WebsiteReachabilityState, number>;
  resolution: {
    checked: number;
    foundWebsite: number;
    confirmedNoWebsite: number;
    notFound: number;
    failed: number;
    skipped: number;
  };
}

/**
 * The real verification phase of the strict no-website pipeline, run
 * against a discovery run's accepted businesses:
 *
 *   1. Records WITH a usable URL → real reachability check → gate outcome
 *      (HAS_WEBSITE rejects; UNREACHABLE/BLOCKED/… never qualify).
 *   2. Records WITHOUT a usable URL → one batched ScrapeGraphAI
 *      official-website resolution search. A credible official site found
 *      → reachability check on it. The business found publicly but with
 *      no official site → NO_WEBSITE confirmed → QUALIFIED. Everything
 *      else (not found, search failed, no usable URL) → stays UNKNOWN →
 *      NOT_QUALIFIED.
 *
 * No mock data, no assumptions: UNKNOWN only ever means unverified.
 */
async function verifyRunWebsites(
  ctx: ActionCtx,
  runId: Id<"discoveryRuns">,
  limit?: number,
): Promise<WebsiteVerificationResult> {
  const take = Math.min(
    Math.max(Math.floor(limit ?? MAX_WEBSITE_CHECK_BATCH) || 1, 1),
    MAX_WEBSITE_CHECK_BATCH,
  );
  const businesses: Doc<"businesses">[] = await ctx.runQuery(
    internal.discovery.getRunBusinessesPendingWebsiteCheck,
    { runId, limit: take },
  );
  const reachability: Record<WebsiteReachabilityState, number> = {
    UNKNOWN: 0,
    HAS_WEBSITE: 0,
    NO_WEBSITE: 0,
    UNREACHABLE: 0,
    INVALID_URL: 0,
    BLOCKED: 0,
    CHECK_FAILED: 0,
  };
  const resolution = {
    checked: 0,
    foundWebsite: 0,
    confirmedNoWebsite: 0,
    notFound: 0,
    failed: 0,
    skipped: 0,
  };

  // Records with a usable URL that is plausibly the business's own site:
  // plain reachability checks. A known directory/aggregator URL is NOT a
  // confirmed official website, so those records go through the official-
  // website resolution search below instead.
  const withUrl = businesses.filter((business) => {
    const canonical = business.website ? canonicalizeUrl(business.website) : null;
    return canonical !== null && !isDirectoryDomain(canonical.domain);
  });
  for (const business of withUrl) {
    const outcome = await performWebsiteCheck(business.website);
    reachability[outcome.websiteStatus] += 1;
    await ctx.runMutation(internal.discovery.setWebsiteCheck, {
      businessId: business._id,
      websiteStatus: outcome.websiteStatus,
      websiteHttpStatus: outcome.websiteHttpStatus,
      websiteCheckedAt: Date.now(),
    });
    if (withUrl.length > 1) await sleep(WEBSITE_CHECK_PACING_MS);
  }

  // Records without a usable URL (or whose URL is a known directory):
  // official-website resolution search.
  const withoutUrl = businesses.filter((business) => {
    const canonical = business.website ? canonicalizeUrl(business.website) : null;
    return canonical === null || isDirectoryDomain(canonical.domain);
  });
  if (withoutUrl.length > 0) {
    if (!isConfigured()) {
      resolution.skipped = withoutUrl.length;
      log("warn", "scrapegraphai.resolution_skipped", {
        runId,
        businesses: withoutUrl.length,
        reason: "SGAI_API_KEY not configured",
      });
    } else {
      resolution.checked = withoutUrl.length;
      const run = await ctx.runQuery(internal.discovery.getRun, { runId });
      const apiCall = await postSearch(
        buildWebsiteResolutionPayload({
          businesses: withoutUrl.map((business) => ({
            name: business.company,
            city: business.city,
            region: business.region,
            category: business.category,
          })),
          country: run?.run.marketCode?.toLowerCase(),
        }),
      );
      if (!apiCall.ok || apiCall.json === null) {
        resolution.failed = withoutUrl.length;
        const message =
          apiCall.errorMessage ?? "The website resolution request failed.";
        for (const business of withoutUrl) {
          await ctx.runMutation(internal.discovery.applyWebsiteUnverified, {
            businessId: business._id,
            reason: message,
          });
        }
      } else {
        const mapped = mapWebsiteResolutionResponse(apiCall.json);
        const byName = new Map(
          mapped.items.map((item) => [item.name.trim().toLowerCase(), item]),
        );
        const sourceReference = sourceReferenceFrom(apiCall.json);
        for (const business of withoutUrl) {
          const item = byName.get(business.company.trim().toLowerCase());
          if (!item) {
            resolution.notFound += 1;
            await ctx.runMutation(internal.discovery.applyWebsiteUnverified, {
              businessId: business._id,
              reason:
                "The verification search did not return this business — status left unknown.",
            });
            continue;
          }
          if (item.hasWebsite && item.website) {
            resolution.foundWebsite += 1;
            await ctx.runMutation(internal.discovery.applyResolvedWebsite, {
              businessId: business._id,
              website: item.website,
              sourceReference,
            });
            const outcome = await performWebsiteCheck(item.website);
            reachability[outcome.websiteStatus] += 1;
            // Phase 4 provenance: the verified URL came from the official-
            // website resolution search, then was reachability-checked.
            await ctx.runMutation(internal.discovery.setWebsiteCheck, {
              businessId: business._id,
              websiteStatus: outcome.websiteStatus,
              websiteHttpStatus: outcome.websiteHttpStatus,
              websiteCheckedAt: Date.now(),
              websiteCheckedUrl: canonicalizeUrl(item.website)?.url,
              websiteFinalUrl: outcome.websiteFinalUrl,
              websiteVerificationMethod: "RESOLUTION_SEARCH",
              websiteVerificationSource: sourceReference,
            });
            await sleep(WEBSITE_CHECK_PACING_MS);
            continue;
          }
          if (item.found && !item.hasWebsite) {
            // Positive evidence of absence: the business exists publicly
            // but no official website surfaced.
            resolution.confirmedNoWebsite += 1;
            const socials = [
              item.instagram,
              item.facebook,
              item.tiktok,
              item.linkedin,
            ].filter((url): url is string => Boolean(url));
            await ctx.runMutation(internal.discovery.applyConfirmedNoWebsite, {
              businessId: business._id,
              sourceReference,
              details: item.details,
              phone: item.phone,
              email: item.email,
              address: item.address,
              googleMapsUrl: item.googleMapsUrl,
              socials,
            });
            continue;
          }
          resolution.failed += 1;
          await ctx.runMutation(internal.discovery.applyWebsiteUnverified, {
            businessId: business._id,
            reason: item.found
              ? "The verification search reported a website but no usable URL — status left unknown."
              : "The business was not found in public sources — absence not verified.",
          });
        }
      }
    }
  }

  if (businesses.length > 0) {
    await ctx.runMutation(internal.discovery.logWebsitesChecked, {
      runId,
      checked: businesses.length,
      counts: reachability,
    });
  }
  log("info", "scrapegraphai.websites_verified", {
    runId,
    checked: businesses.length,
    resolution,
    reachability,
  });
  return { checked: businesses.length, reachability, resolution };
}

/**
 * Public action: run the verification phase for a run's accepted
 * businesses — real reachability checks plus (when SGAI_API_KEY is set)
 * official-website resolution for businesses without a usable URL.
 */
export const verifyWebsites = action({
  args: {
    runId: v.id("discoveryRuns"),
    limit: v.optional(v.number()),
  },
  handler: async (
    ctx,
    { runId, limit },
  ): Promise<WebsiteVerificationResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw apiError("UNAUTHENTICATED", "You must be signed in to do that.");
    }
    const run = await ctx.runQuery(internal.discovery.getRun, { runId });
    if (!run) {
      throw apiError("NOT_FOUND", "This discovery run no longer exists.");
    }
    return verifyRunWebsites(ctx, runId, limit);
  },
});

/* ------------------------------ Smoke test ------------------------------- */

/** Shape returned by the smoke test's cleanup mode. */
interface SmokeTestCleanupResult {
  status: "CLEANED";
  executedAt: number;
  deleted: {
    run: number;
    results: number;
    businesses: number;
    campaign: number;
    activity: number;
  };
}

/** Shape returned by a completed (or failed) smoke test run. */
interface SmokeTestReport {
  status: "COMPLETED" | "PARTIAL" | "FAILED";
  executedAt: number;
  parameters: {
    marketCode: string;
    region: string;
    city: string;
    category: string;
    limit: number;
  };
  connection: {
    provider: string;
    endpoint: string;
    authHeader: string;
    keyConfigured: boolean;
  };
  apiRequest: ApiCallResult | null;
  pipeline: {
    requested: number;
    returned: number;
    unmappable: number;
    accepted: number;
    duplicates: number;
    rejected: number;
    failed: number;
  };
  websiteChecks: {
    checked: number;
    results: Record<WebsiteReachabilityState, number>;
  };
  websiteResolutions: {
    checked: number;
    foundWebsite: number;
    confirmedNoWebsite: number;
    notFound: number;
    failed: number;
    skipped: number;
  };
  qualifications: {
    qualified: number;
    rejectedHasWebsite: number;
    notQualified: number;
    pending: number;
  };
  database: {
    campaignId?: string;
    runId?: string;
    runStatus?: string;
    businessesCreated: number;
    resultRows: number;
    activityRows: number;
  };
  opportunityScores: Array<{
    businessId: string;
    company: string;
    score: number;
    tier: string;
    factors: { website: number; contact: number; completeness: number };
  }>;
  activitySample: Array<{ type: string; description: string }>;
  errors: string[];
}

/**
 * Real end-to-end smoke test of the ScrapeGraphAI provider: creates a real
 * campaign + run, calls the real API, feeds the real results through the
 * shared pipeline (normalize → validate → deduplicate → persist), runs the
 * real website checks, recomputes opportunity scores, and returns a full
 * non-fabricated report. Intended to be run headlessly via
 * `npx convex run scrapegraphai:smokeTest '<args>' --identity '{"subject":...}'`
 * (or from a signed-in client).
 */
export const smokeTest = action({
  args: {
    marketCode: v.optional(v.string()),
    region: v.optional(v.string()),
    city: v.optional(v.string()),
    category: v.optional(v.string()),
    limit: v.optional(v.number()),
    /** Pass a run id to delete a previous smoke run instead of running. */
    cleanupRunId: v.optional(v.id("discoveryRuns")),
  },
  handler: async (
    ctx,
    args,
  ): Promise<SmokeTestReport | SmokeTestCleanupResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw apiError("UNAUTHENTICATED", "You must be signed in to do that.");
    }

    // Cleanup mode: remove a previous smoke run and everything it created.
    if (args.cleanupRunId) {
      const cleanup = await ctx.runMutation(
        internal.discovery.cleanupSmokeRun,
        { runId: args.cleanupRunId },
      );
      return { status: "CLEANED", executedAt: Date.now(), deleted: cleanup.deleted };
    }

    if (!args.marketCode || !args.region || !args.city || !args.category) {
      throw apiError(
        "VALIDATION",
        "marketCode, region, city, and category are required.",
      );
    }
    const marketCode = args.marketCode;
    const region = args.region;
    const city = args.city;
    const category = args.category;
    const executedAt = Date.now();
    const limit = clampLimit(args.limit ?? 5);
    const report: SmokeTestReport = {
      status: "FAILED",
      executedAt,
      parameters: { marketCode, region, city, category, limit },
      connection: {
        provider: "scrapegraphai",
        endpoint: SCRAPEGRAPHAI_SEARCH_ENDPOINT,
        authHeader: SCRAPEGRAPHAI_AUTH_HEADER,
        keyConfigured: isConfigured(),
      },
      apiRequest: null,
      pipeline: {
        requested: limit,
        returned: 0,
        unmappable: 0,
        accepted: 0,
        duplicates: 0,
        rejected: 0,
        failed: 0,
      },
      websiteChecks: {
        checked: 0,
        results: {
          UNKNOWN: 0,
          HAS_WEBSITE: 0,
          NO_WEBSITE: 0,
          UNREACHABLE: 0,
          INVALID_URL: 0,
          BLOCKED: 0,
          CHECK_FAILED: 0,
        },
      },
      websiteResolutions: {
        checked: 0,
        foundWebsite: 0,
        confirmedNoWebsite: 0,
        notFound: 0,
        failed: 0,
        skipped: 0,
      },
      qualifications: {
        qualified: 0,
        rejectedHasWebsite: 0,
        notQualified: 0,
        pending: 0,
      },
      database: {
        businessesCreated: 0,
        resultRows: 0,
        activityRows: 0,
      },
      opportunityScores: [],
      activitySample: [],
      errors: [],
    };

    // 1. Create a real campaign + run (headless internal path).
    const { campaignId, runId } = await ctx.runMutation(
      internal.discovery.createSmokeRun,
      {
        name: `Smoke Test — ${city} ${category}`,
        description:
          "Automated ScrapeGraphAI smoke test — real API request, real pipeline. Safe to delete.",
        marketCode,
        region,
        city,
        category,
        targetCount: limit,
        providerSlug: "scrapegraphai",
        providerName:
          DISCOVERY_PROVIDERS.find((p) => p.slug === "scrapegraphai")?.name ??
          "ScrapeGraphAI",
      },
    );
    report.database.campaignId = campaignId;
    report.database.runId = runId;

    await ctx.runMutation(internal.discovery.setRunStatus, {
      runId,
      status: "RUNNING",
      startedAt: executedAt,
    });

    // 2. Real API request.
    const apiCall = await callScrapegraphai({
      city,
      region,
      category,
      limit,
      country: marketCode.toLowerCase(),
    });
    report.apiRequest = apiCall;
    report.pipeline.returned = 0;

    if (!apiCall.ok) {
      const errorCode = apiCall.errorCode ?? "INTERNAL";
      const errorMessage =
        apiCall.errorMessage ?? "The ScrapeGraphAI request failed.";
      await ctx.runMutation(internal.discovery.failRun, {
        runId,
        errorCode,
        errorMessage,
      });
      report.errors.push(
        `${DISCOVERY_ERROR_LABELS[errorCode] ?? errorCode}: ${errorMessage}`,
      );
      log("error", "scrapegraphai.smoke_failed", {
        runId,
        errorCode,
        httpStatus: apiCall.httpStatus,
      });
      return report;
    }

    // 3. Map extraction → raw records → shared pipeline. The extraction
    // can out-return the requested cap, so ingest at most `limit` records
    // (the reported `returned` stays the honest API count).
    const mapped = mapSearchResponseToRecords(apiCall.json, {
      city,
      region,
      category,
      sourceReference: sourceReferenceFrom(apiCall.json),
    });
    report.pipeline.returned = mapped.returned;
    report.pipeline.unmappable = mapped.unmappable;

    const records = mapped.records.slice(0, limit);
    if (records.length === 0) {
      await ctx.runMutation(internal.discovery.failRun, {
        runId,
        errorCode: "MALFORMED_RESULT",
        errorMessage:
          "ScrapeGraphAI returned no mappable business records for this request.",
      });
      report.errors.push("ScrapeGraphAI returned no mappable business records.");
      return report;
    }

    const ingest = await ctx.runMutation(internal.discovery.ingestRecords, {
      runId,
      batchId: `smoke:${runId}`,
      records,
    });
    report.pipeline.accepted = ingest.accepted;
    report.pipeline.duplicates = ingest.duplicates;
    report.pipeline.rejected = ingest.rejected;
    report.pipeline.failed = ingest.failed;

    // 4. Real website verification: reachability checks for records with
    //    a URL, official-website resolution for records without one, then
    //    the strict no-website qualification gate.
    const verification = await verifyRunWebsites(ctx, runId);
    report.websiteChecks.checked = verification.checked;
    report.websiteChecks.results = verification.reachability;
    report.websiteResolutions = verification.resolution;

    // 5. Close the run honestly if the provider returned fewer than asked.
    if (ingest.status === "RUNNING") {
      await ctx.runMutation(internal.discovery.finalizeRun, { runId });
    }

    // 6. Snapshot for the report (real DB state).
    const snapshot = await ctx.runQuery(internal.discovery.getSmokeSnapshot, {
      runId,
    });
    if (snapshot) {
      report.database.runStatus = snapshot.run.status;
      report.database.businessesCreated = snapshot.run.acceptedCount;
      report.database.resultRows = snapshot.results.length;
      report.database.activityRows = snapshot.activity.length;
      report.activitySample = snapshot.activity.slice(0, 25).map((row) => ({
        type: row.type,
        description: row.description,
      }));
      const qualifications = {
        qualified: 0,
        rejectedHasWebsite: 0,
        notQualified: 0,
        pending: 0,
      };
      for (const row of snapshot.results) {
        if (row.status !== "ACCEPTED") continue;
        if (row.qualification === "QUALIFIED") qualifications.qualified += 1;
        else if (row.qualification === "REJECTED_HAS_WEBSITE") {
          qualifications.rejectedHasWebsite += 1;
        } else if (row.qualification === "NOT_QUALIFIED") {
          qualifications.notQualified += 1;
        } else {
          qualifications.pending += 1;
        }
      }
      report.qualifications = qualifications;
      report.opportunityScores = snapshot.results
        .filter((row) => row.status === "ACCEPTED" && row.business)
        .map((row) => {
          const business = row.business!;
          return {
            businessId: business._id,
            company: business.company,
            score: business.opportunity?.score ?? 0,
            tier: scoreTier(business.opportunity?.score) ?? "LOW",
            factors: business.opportunity?.factors ?? {
              website: 0,
              contact: 0,
              completeness: 0,
            },
          };
        });
    }

    report.status =
      report.pipeline.failed > 0 ? "PARTIAL" : "COMPLETED";
    log("info", "scrapegraphai.smoke_completed", {
      runId,
      status: report.status,
      returned: mapped.returned,
      accepted: ingest.accepted,
      websitesChecked: report.websiteChecks.checked,
    });
    return report;
  },
});
