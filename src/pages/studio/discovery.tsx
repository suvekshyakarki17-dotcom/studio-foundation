import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Loader2,
  Play,
  Plus,
  Radar,
  RotateCcw,
  Square,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { toast } from "sonner";
import { PageHeader } from "@/components/studio/page-header";
import { QueryBoundary } from "@/components/studio/query-boundary";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/studio/states";
import { StatusBadge } from "@/components/studio/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { parseDiscoveryCsv } from "@/lib/csv";
import { getErrorMessage } from "@/lib/errors";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import {
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_STATUS_TONES,
  KNOWN_MARKETS,
  PIPELINE_STAGE_LABELS,
  SCORE_TIER_LABELS,
  SCORE_TIER_TONES,
  scoreTier,
  type StatusTone,
} from "@/shared/domain";
import {
  DISCOVERY_ERROR_LABELS,
  DISCOVERY_RESULT_STATUSES,
  DISCOVERY_RESULT_STATUS_LABELS,
  DISCOVERY_RESULT_STATUS_TONES,
  DISCOVERY_RUN_STATUS_LABELS,
  DISCOVERY_RUN_STATUS_TONES,
  DUPLICATE_SIGNAL_LABELS,
  WEBSITE_REACHABILITY_LABELS,
  WEBSITE_REACHABILITY_TONES,
  type DiscoveryProviderDefinition,
  type DiscoveryResultStatus,
  type DiscoveryRunStatus,
  type WebsiteReachabilityState,
} from "@/shared/discovery";

const ALL = "ALL";

type ResultsSort = "newest" | "oldest" | "name" | "location" | "confidence";

type CampaignRow = Doc<"campaigns"> & {
  businessCount: number;
  discoveryReady: boolean;
  missingDiscoveryFields: string[];
};

type RunRow = Doc<"discoveryRuns"> & { campaignName?: string };

type RunDetailRow = Doc<"discoveryRuns"> & {
  pendingWebsiteChecks: number;
  campaign: {
    id: string;
    name: string;
    status: string;
    marketCode?: string;
    region?: string;
  } | null;
};

type ResultRow = Doc<"discoveryResults"> & {
  business?: {
    id: string;
    name?: string;
    stage?: string;
    websiteStatus?: WebsiteReachabilityState;
    opportunity?: {
      score: number;
      factors: { website: number; contact: number; completeness: number };
    };
  };
  duplicateOfBusiness?: { id: string; name?: string };
};

function DiscoveryContent() {
  const [searchParams, setSearchParams] = useSearchParams();
  const runParam = searchParams.get("run");
  const campaignParam = searchParams.get("campaign");

  const providers = useQuery(api.discovery.providers);
  const campaigns = useQuery(api.campaigns.list, {});
  const runs = useQuery(api.discovery.runsList, { limit: 100 });

  // The run detail is only queried when the ?run= param matches a real run.
  const selectedRun = runs?.find((run) => run._id === runParam) ?? null;
  const runDetail = useQuery(
    api.discovery.runsGet,
    selectedRun ? { runId: selectedRun._id } : "skip",
  );
  const [resultsStatus, setResultsStatus] = useState<
    DiscoveryResultStatus | typeof ALL
  >(ALL);
  const [resultsSort, setResultsSort] = useState<ResultsSort>("newest");
  const results = useQuery(
    api.discovery.resultsList,
    selectedRun
      ? {
          runId: selectedRun._id,
          ...(resultsStatus === ALL ? {} : { status: resultsStatus }),
          sort: resultsSort,
        }
      : "skip",
  );

  const loading =
    providers === undefined || campaigns === undefined || runs === undefined;

  if (loading) {
    return <LoadingState label="Loading discovery…" className="py-24" />;
  }

  const preselectCampaign = campaignParam
    ? campaigns.find((campaign) => campaign._id === campaignParam)
    : undefined;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Discovery"
        description="The discovery engine turns a configured campaign into real, deduplicated pipeline records — with full provenance. Every number comes from actual execution."
      />

      <ProviderCards providers={providers} />

      <NewRunPanel
        campaigns={campaigns}
        providers={providers}
        preselectCampaignId={preselectCampaign?._id}
        onStarted={(runId) => setSearchParams({ run: runId })}
      />

      <section
        aria-label="Discovery runs"
        className="rounded-md border border-border bg-card"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="font-display text-lg tracking-tight text-foreground">
              Discovery runs
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Every run is an auditable execution — start, progress, results, and
              outcome.
            </p>
          </div>
          {runs.length > 0 && (
            <p className="text-sm text-muted-foreground">{runs.length} total</p>
          )}
        </div>

        {runs.length === 0 ? (
          <EmptyState
            icon={Radar}
            title="No discovery runs yet"
            description="Set up a campaign with a market, location, category, and target count, then start your first discovery run above."
            className="py-14"
          />
        ) : (
          <RunHistory
            runs={runs}
            selectedRunId={selectedRun?._id ?? null}
            onSelect={(runId) => setSearchParams({ run: runId })}
          />
        )}
      </section>

      {selectedRun &&
        (runDetail === undefined ? (
          <LoadingState label="Loading run detail…" className="py-16" />
        ) : (
          <RunDetail
            run={runDetail}
            results={results ?? null}
            resultsLoading={results === undefined}
            onClose={() => setSearchParams({})}
            resultsStatus={resultsStatus}
            onResultsStatusChange={setResultsStatus}
            resultsSort={resultsSort}
            onResultsSortChange={setResultsSort}
          />
        ))}
    </div>
  );
}

/* ------------------------------ Provider cards ---------------------------- */

function ProviderCards({
  providers,
}: {
  providers: readonly DiscoveryProviderDefinition[];
}) {
  return (
    <section aria-label="Discovery providers" className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg tracking-tight text-foreground">
          Providers
        </h2>
        <p className="text-xs text-muted-foreground">
          Exactly what is configured — nothing more.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {providers.map((provider) => (
          <div
            key={provider.slug}
            className="flex flex-col rounded-md border border-border bg-card"
          >
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div className="min-w-0">
                <p className="font-medium text-foreground">{provider.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {provider.kind === "IMPORT" ? "Record import" : "External API"}
                </p>
              </div>
              {provider.configured ? (
                <StatusBadge label="Configured" tone="success" />
              ) : (
                <StatusBadge label="Not configured" tone="neutral" />
              )}
            </div>
            <div className="flex-1 space-y-3 px-5 py-4">
              <p className="text-sm leading-6 text-muted-foreground">
                {provider.description}
              </p>
              <div>
                <p className="text-xs font-medium text-foreground">Capabilities</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {provider.capabilities.join(" · ")}
                </p>
              </div>
              {!provider.configured && provider.requirements.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-foreground">Required</p>
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-xs leading-5 text-muted-foreground">
                    {provider.requirements.map((requirement) => (
                      <li key={requirement}>{requirement}</li>
                    ))}
                  </ul>
                  {provider.envVars.length > 0 && (
                    <p className="mt-1.5 font-mono text-[11px] text-muted-foreground">
                      {provider.envVars.join(", ")}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------- New run panel ---------------------------- */

function NewRunPanel({
  campaigns,
  providers,
  preselectCampaignId,
  onStarted,
}: {
  campaigns: CampaignRow[];
  providers: readonly DiscoveryProviderDefinition[];
  preselectCampaignId?: string;
  onStarted: (runId: string) => void;
}) {
  const startDiscovery = useMutation(api.discovery.start);
  const [campaignId, setCampaignId] = useState(preselectCampaignId ?? "");
  const [providerSlug, setProviderSlug] = useState("csv-import");
  const [targetCount, setTargetCount] = useState(() => {
    // The panel only mounts once campaigns have loaded, so a deep-linked
    // campaign's target can be adopted as the initial value directly.
    const campaign = campaigns.find(
      (item) => item._id === preselectCampaignId,
    );
    return campaign?.targetCount ? String(campaign.targetCount) : "";
  });
  const [notes, setNotes] = useState("");
  const [starting, setStarting] = useState(false);

  // Adjust state during render when the deep-link target changes (the
  // documented pattern for syncing state to a prop — never in an effect).
  const [prevPreselectCampaignId, setPrevPreselectCampaignId] = useState(
    preselectCampaignId,
  );
  if (preselectCampaignId !== prevPreselectCampaignId) {
    setPrevPreselectCampaignId(preselectCampaignId);
    setCampaignId(preselectCampaignId ?? "");
    const campaign = campaigns.find(
      (item) => item._id === preselectCampaignId,
    );
    if (campaign?.targetCount) setTargetCount(String(campaign.targetCount));
  }

  const campaign = campaigns.find((item) => item._id === campaignId) ?? null;
  const provider =
    providers.find((item) => item.slug === providerSlug) ?? null;
  const readiness = campaign
    ? {
        ready: campaign.discoveryReady,
        missing: campaign.missingDiscoveryFields,
      }
    : null;

  const canStart =
    campaign !== null &&
    readiness?.ready === true &&
    provider?.configured === true &&
    !starting;

  const handleStart = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!campaign || !provider) return;
    setStarting(true);
    try {
      const parsed = Number(targetCount);
      const runId = await startDiscovery({
        campaignId: campaign._id,
        providerSlug: provider.slug,
        targetCount: Number.isInteger(parsed) && parsed > 0 ? parsed : undefined,
        notes: notes.trim() ? notes.trim() : undefined,
      });
      toast(`Discovery run created for ${campaign.name}`);
      onStarted(runId);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setStarting(false);
    }
  };

  return (
    <section
      aria-label="Start a discovery run"
      className="rounded-md border border-border bg-card"
    >
      <div className="border-b border-border px-5 py-4">
        <h2 className="font-display text-lg tracking-tight text-foreground">
          Start a discovery run
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Pick a fully configured campaign. The engine records every result with
          provenance.
        </p>
      </div>
      <form onSubmit={handleStart} className="space-y-4 px-5 py-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5 sm:col-span-2">
            <label htmlFor="run-campaign" className="text-sm font-medium text-foreground">
              Campaign
            </label>
            <Select value={campaignId} onValueChange={setCampaignId}>
              <SelectTrigger id="run-campaign" aria-label="Campaign">
                <SelectValue placeholder="Select a campaign" />
              </SelectTrigger>
              <SelectContent>
                {campaigns.map((item) => (
                  <SelectItem key={item._id} value={item._id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {campaign && !readiness?.ready && (
              <p className="text-xs text-muted-foreground">
                Not ready — missing: {readiness?.missing.join(", ")}.{" "}
                <Link
                  to="/dashboard/campaigns"
                  className="font-medium underline decoration-border underline-offset-2 hover:decoration-foreground"
                >
                  Edit the campaign
                </Link>
                .
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <label htmlFor="run-provider" className="text-sm font-medium text-foreground">
              Provider
            </label>
            <Select value={providerSlug} onValueChange={setProviderSlug}>
              <SelectTrigger id="run-provider" aria-label="Discovery provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {providers.map((item) => (
                  <SelectItem
                    key={item.slug}
                    value={item.slug}
                    disabled={!item.configured}
                  >
                    {item.name}
                    {!item.configured ? " — not configured" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {provider && !provider.configured && (
              <p className="text-xs text-muted-foreground">
                This provider is not configured — see the requirements above.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <label htmlFor="run-target" className="text-sm font-medium text-foreground">
              Target count
            </label>
            <Input
              id="run-target"
              type="number"
              min={1}
              step={1}
              value={targetCount}
              onChange={(event) => setTargetCount(event.target.value)}
              placeholder={
                campaign?.targetCount ? String(campaign.targetCount) : "100"
              }
            />
            <p className="text-xs text-muted-foreground">
              {campaign?.targetCount
                ? `Campaign default: ${campaign.targetCount}`
                : "How many businesses to aim for"}
            </p>
          </div>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="run-notes" className="text-sm font-medium text-foreground">
            Notes
          </label>
          <Input
            id="run-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Optional context recorded with this run"
          />
        </div>
        <div className="flex items-center justify-end gap-3">
          <Button type="submit" disabled={!canStart}>
            {starting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Play className="size-4" />
            )}
            Start discovery
          </Button>
        </div>
      </form>
    </section>
  );
}

/* -------------------------------- Run history ----------------------------- */

function RunHistory({
  runs,
  selectedRunId,
  onSelect,
}: {
  runs: RunRow[];
  selectedRunId: string | null;
  onSelect: (runId: string) => void;
}) {
  return (
    <>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Campaign</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Accepted</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Started</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.map((run) => (
              <TableRow
                key={run._id}
                className={selectedRunId === run._id ? "bg-muted/40" : undefined}
              >
                <TableCell>
                  <p className="font-medium text-foreground">
                    {run.campaignName ?? "Unknown campaign"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {run.providerName}
                  </p>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {run.providerSlug === "csv-import"
                    ? "CSV import"
                    : run.providerName}
                </TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
                  {run.requestedCount}
                </TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
                  {run.acceptedCount}
                </TableCell>
                <TableCell>
                  <StatusBadge
                    label={DISCOVERY_RUN_STATUS_LABELS[run.status]}
                    tone={DISCOVERY_RUN_STATUS_TONES[run.status]}
                  />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatRelativeTime(run.createdAt)}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onSelect(run._id)}
                    >
                      {selectedRunId === run._id ? "Viewing" : "Open"}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="divide-y divide-border md:hidden">
        {runs.map((run) => (
          <li key={run._id} className="space-y-2 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-foreground">
                  {run.campaignName ?? "Unknown campaign"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {run.providerName} · target {run.requestedCount} ·{" "}
                  {formatRelativeTime(run.createdAt)}
                </p>
              </div>
              <StatusBadge
                label={DISCOVERY_RUN_STATUS_LABELS[run.status]}
                tone={DISCOVERY_RUN_STATUS_TONES[run.status]}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onSelect(run._id)}
            >
              {selectedRunId === run._id ? "Viewing" : "Open run"}
            </Button>
          </li>
        ))}
      </ul>
    </>
  );
}

/* -------------------------------- Run detail ------------------------------ */

interface RunDetailProps {
  run: RunDetailRow;
  results: ResultRow[] | null;
  resultsLoading: boolean;
  onClose: () => void;
  resultsStatus: DiscoveryResultStatus | typeof ALL;
  onResultsStatusChange: (status: DiscoveryResultStatus | typeof ALL) => void;
  resultsSort: ResultsSort;
  onResultsSortChange: (sort: ResultsSort) => void;
}

function RunDetail({
  run,
  results,
  resultsLoading,
  onClose,
  resultsStatus,
  onResultsStatusChange,
  resultsSort,
  onResultsSortChange,
}: RunDetailProps) {
  const finishRun = useMutation(api.discovery.finish);
  const cancelRun = useMutation(api.discovery.cancel);
  const retryFailed = useMutation(api.discovery.retryFailedRecords);
  const checkWebsitesBatch = useAction(api.discovery.checkWebsitesBatch);
  const [busy, setBusy] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [checkingBatch, setCheckingBatch] = useState(false);

  const handleFinish = async () => {
    setBusy(true);
    try {
      await finishRun({ runId: run._id });
      toast("Discovery run finished.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    setBusy(true);
    try {
      await cancelRun({ runId: run._id });
      toast("Discovery run cancelled.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const handleRetry = async () => {
    setRetrying(true);
    try {
      const result = await retryFailed({ runId: run._id });
      toast(
        `Retried ${result.retried} failed record${result.retried === 1 ? "" : "s"} — ${result.accepted} accepted, ${result.duplicates} duplicates, ${result.rejected} rejected, ${result.stillFailed} still failed`,
      );
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setRetrying(false);
    }
  };

  const handleCheckBatch = async () => {
    setCheckingBatch(true);
    try {
      const result = await checkWebsitesBatch({ runId: run._id });
      const parts = Object.entries(result.results)
        .filter(([, count]) => count > 0)
        .map(
          ([status, count]) =>
            `${count} ${WEBSITE_REACHABILITY_LABELS[
              status as WebsiteReachabilityState
            ].toLowerCase()}`,
        );
      toast(
        `Checked ${result.checked} website${result.checked === 1 ? "" : "s"} — ${
          parts.length > 0 ? parts.join(", ") : "nothing to check"
        }`,
      );
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setCheckingBatch(false);
    }
  };

  const market = run.marketCode
    ? KNOWN_MARKETS.find((item) => item.code === run.marketCode)
    : undefined;
  const progressPct = run.requestedCount
    ? Math.min(100, Math.round((run.processedCount / run.requestedCount) * 100))
    : 0;
  const active = run.status === "RUNNING" || run.status === "QUEUED";
  const canImport = active && run.providerSlug === "csv-import";
  const canRetry = run.failedCount > 0;
  const canCheckBatch = run.pendingWebsiteChecks > 0;

  const [cityFilter, setCityFilter] = useState<string | typeof ALL>(ALL);
  const [categoryFilter, setCategoryFilter] = useState<string | typeof ALL>(ALL);

  const locations = useMemo(() => {
    const cities = new Set<string>();
    const categories = new Set<string>();
    for (const row of results ?? []) {
      if (row.normalized?.city) cities.add(row.normalized.city);
      if (row.normalized?.category) categories.add(row.normalized.category);
    }
    return {
      cities: [...cities].sort(),
      categories: [...categories].sort(),
    };
  }, [results]);

  const filteredResults = useMemo(() => {
    if (cityFilter === ALL && categoryFilter === ALL) return results ?? [];
    return (results ?? []).filter(
      (row) =>
        (cityFilter === ALL || row.normalized?.city === cityFilter) &&
        (categoryFilter === ALL || row.normalized?.category === categoryFilter),
    );
  }, [results, cityFilter, categoryFilter]);

  return (
    <section aria-label="Run detail" className="space-y-6">
      <div className="rounded-md border border-border bg-card">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-lg tracking-tight text-foreground">
                {run.campaign?.name ?? "Discovery run"}
              </h2>
              <StatusBadge
                label={DISCOVERY_RUN_STATUS_LABELS[run.status]}
                tone={DISCOVERY_RUN_STATUS_TONES[run.status]}
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {run.providerName}
              {market ? ` · ${market.flag} ${market.name}` : ""}
              {run.region ? ` · ${run.region}` : ""}
              {run.city ? ` · ${run.city}` : ""}
              {run.category ? ` · ${run.category}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canCheckBatch && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleCheckBatch()}
                disabled={checkingBatch}
                title="Run real reachability checks on every accepted business whose website was never verified"
              >
                {checkingBatch ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Radar className="size-3.5" />
                )}
                Check websites ({run.pendingWebsiteChecks})
              </Button>
            )}
            {canRetry && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleRetry()}
                disabled={retrying}
                title="Re-process the failed records through the pipeline"
              >
                {retrying ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="size-3.5" />
                )}
                Retry failed ({run.failedCount})
              </Button>
            )}
            {active && (
              <>
                {run.providerSlug === "csv-import" &&
                  run.status === "RUNNING" && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void handleFinish()}
                      disabled={busy}
                    >
                      <CheckCircle2 className="size-3.5" />
                      Finish run
                    </Button>
                  )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleCancel()}
                  disabled={busy}
                >
                  <Square className="size-3.5" />
                  Cancel run
                </Button>
              </>
            )}
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>

        {run.status === "FAILED" && run.errorCode && (
          <div className="flex items-start gap-2.5 border-b border-border bg-destructive/5 px-5 py-3">
            <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div className="text-sm">
              <p className="font-medium text-foreground">
                {DISCOVERY_ERROR_LABELS[
                  run.errorCode as keyof typeof DISCOVERY_ERROR_LABELS
                ] ?? run.errorCode}
              </p>
              {run.errorMessage && (
                <p className="mt-0.5 text-muted-foreground">{run.errorMessage}</p>
              )}
            </div>
          </div>
        )}

        <div className="space-y-5 px-5 py-5">
          <div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <p className="text-muted-foreground">
                Processed{" "}
                <span className="font-medium tabular-nums text-foreground">
                  {run.processedCount}
                </span>{" "}
                of{" "}
                <span className="font-medium tabular-nums text-foreground">
                  {run.requestedCount}
                </span>{" "}
                requested
              </p>
              <p className="font-medium tabular-nums text-foreground">
                {progressPct}%
              </p>
            </div>
            <div
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={progressPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Discovery progress"
            >
              <div
                className={cnProgress(run.status)}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <RunCount label="Discovered" value={run.discoveredCount} />
            <RunCount
              label="Accepted"
              value={run.acceptedCount}
              tone="success"
            />
            <RunCount
              label="Duplicates"
              value={run.duplicateCount}
              tone="warning"
            />
            <RunCount label="Rejected" value={run.rejectedCount} tone="neutral" />
            <RunCount
              label="Failed"
              value={run.failedCount}
              tone={run.failedCount > 0 ? "error" : "neutral"}
            />
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">Started</dt>
              <dd className="mt-0.5 font-medium text-foreground">
                {run.startedAt ? formatDateTime(run.startedAt) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Completed</dt>
              <dd className="mt-0.5 font-medium text-foreground">
                {run.completedAt ? formatDateTime(run.completedAt) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Campaign status</dt>
              <dd className="mt-0.5">
                {run.campaign ? (
                  <StatusBadge
                    label={
                      CAMPAIGN_STATUS_LABELS[
                        run.campaign.status as keyof typeof CAMPAIGN_STATUS_LABELS
                      ]
                    }
                    tone={
                      CAMPAIGN_STATUS_TONES[
                        run.campaign.status as keyof typeof CAMPAIGN_STATUS_TONES
                      ]
                    }
                  />
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Notes</dt>
              <dd className="mt-0.5 truncate font-medium text-foreground">
                {run.notes ?? "—"}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {canImport && <ImportPanel runId={run._id} />}

      <div className="rounded-md border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h3 className="font-display text-base tracking-tight text-foreground">
              Results
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Every row is a real pipeline outcome with its raw snapshot preserved.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={resultsStatus}
              onValueChange={(value) =>
                onResultsStatusChange(value as DiscoveryResultStatus | typeof ALL)
              }
            >
              <SelectTrigger size="sm" aria-label="Filter by outcome">
                <SelectValue placeholder="All outcomes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All outcomes</SelectItem>
                {DISCOVERY_RESULT_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {DISCOVERY_RESULT_STATUS_LABELS[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {locations.cities.length > 0 && (
              <Select
                value={cityFilter}
                onValueChange={(value) =>
                  setCityFilter(value as string | typeof ALL)
                }
              >
                <SelectTrigger size="sm" aria-label="Filter by city">
                  <SelectValue placeholder="All cities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All cities</SelectItem>
                  {locations.cities.map((city) => (
                    <SelectItem key={city} value={city}>
                      {city}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {locations.categories.length > 0 && (
              <Select
                value={categoryFilter}
                onValueChange={(value) =>
                  setCategoryFilter(value as string | typeof ALL)
                }
              >
                <SelectTrigger size="sm" aria-label="Filter by category">
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All categories</SelectItem>
                  {locations.categories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select
              value={resultsSort}
              onValueChange={(value) => onResultsSortChange(value as ResultsSort)}
            >
              <SelectTrigger size="sm" aria-label="Sort results">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="oldest">Oldest first</SelectItem>
                <SelectItem value="name">Business name</SelectItem>
                <SelectItem value="location">Location</SelectItem>
                <SelectItem value="confidence">Confidence</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {resultsLoading ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">
            Loading results…
          </p>
        ) : filteredResults.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">
            {run.status === "RUNNING" || run.status === "QUEUED"
              ? "No results yet — import records or wait for the provider."
              : "No results match the current filters."}
          </p>
        ) : (
          <ResultsTable rows={filteredResults} />
        )}
      </div>
    </section>
  );
}

function RunCount({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: StatusTone;
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-700 dark:text-emerald-300"
      : tone === "warning"
        ? "text-amber-700 dark:text-amber-300"
        : tone === "error"
          ? "text-red-700 dark:text-red-300"
          : "text-foreground";
  return (
    <div className="rounded-md border border-border bg-muted/30 px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass}`}>
        {value}
      </p>
    </div>
  );
}

function cnProgress(status: DiscoveryRunStatus) {
  if (status === "FAILED" || status === "PARTIAL") {
    return "block h-full rounded-full bg-red-600";
  }
  if (status === "CANCELLED") return "block h-full rounded-full bg-muted-foreground/50";
  if (status === "COMPLETED") return "block h-full rounded-full bg-emerald-600";
  return "block h-full rounded-full bg-sky-600 transition-all";
}

/* ------------------------------- Import panel ----------------------------- */

function ImportPanel({ runId }: { runId: Id<"discoveryRuns"> }) {
  const submitRecords = useMutation(api.discovery.submitRecords);
  const [text, setText] = useState("");
  const [importing, setImporting] = useState(false);

  const parsed = useMemo(() => parseDiscoveryCsv(text), [text]);

  const handleImport = async () => {
    if (parsed.error || parsed.records.length === 0) return;
    setImporting(true);
    try {
      const result = await submitRecords({
        runId,
        batchId: crypto.randomUUID(),
        records: parsed.records,
      });
      if (result.alreadyProcessed) {
        toast("That batch was already imported.");
      } else {
        toast(
          `Imported ${parsed.records.length} records — ${result.accepted} accepted, ${result.duplicates} duplicates, ${result.rejected} rejected${result.failed > 0 ? `, ${result.failed} failed` : ""}`,
        );
        setText("");
      }
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setImporting(false);
    }
  };

  return (
    <section
      aria-label="Import records"
      className="rounded-md border border-border bg-card"
    >
      <div className="border-b border-border px-5 py-4">
        <h3 className="font-display text-base tracking-tight text-foreground">
          Import records
        </h3>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
          Paste CSV or TSV records you already have (directory exports, research
          notes). Every record runs the real pipeline: normalize → validate →
          deduplicate → persist. A header row is optional:{" "}
          <span className="font-mono">
            company, contactName, email, phone, website, city, region, category,
            address, socials, whatsapp, sourceReference, notes
          </span>
          .
        </p>
      </div>
      <div className="space-y-3 px-5 py-4">
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={7}
          spellCheck={false}
          placeholder={
            "company,email,phone,website,city,category\n" +
            "Joe's Pizza,john@joespizza.com,(305) 555-0100,joespizza.com,Miami,Restaurants"
          }
          aria-label="Records to import (CSV)"
          className="font-mono text-xs"
        />
        {text.trim() !== "" && (
          <p className="text-xs">
            {parsed.error ? (
              <span className="flex items-center gap-1.5 text-destructive">
                <AlertTriangle className="size-3.5" />
                {parsed.error}
              </span>
            ) : parsed.records.length === 0 ? (
              <span className="text-muted-foreground">
                No complete records detected yet.
              </span>
            ) : (
              <span className="text-muted-foreground">
                {parsed.records.length} record
                {parsed.records.length === 1 ? "" : "s"} ready to import.
              </span>
            )}
          </p>
        )}
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={() => void handleImport()}
            disabled={
              importing || Boolean(parsed.error) || parsed.records.length === 0
            }
          >
            {importing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            Import{" "}
            {parsed.records.length > 0 ? `${parsed.records.length} records` : "records"}
          </Button>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------- Results table ---------------------------- */

function ResultsTable({ rows }: { rows: ResultRow[] }) {
  const checkWebsite = useAction(api.discovery.checkWebsite);
  const [checking, setChecking] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const handleCheck = async (row: ResultRow) => {
    if (!row.businessId) return;
    setChecking(row._id);
    try {
      const result = await checkWebsite({ businessId: row.businessId });
      toast(
        `Website check: ${WEBSITE_REACHABILITY_LABELS[result.websiteStatus]}${
          result.websiteHttpStatus ? ` (HTTP ${result.websiteHttpStatus})` : ""
        }`,
      );
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setChecking(null);
    }
  };

  return (
    <>
      <div className="hidden lg:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-8" />
              <TableHead>Business</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Website</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Conf.</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Outcome</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <ResultRow
                key={row._id}
                row={row}
                expanded={expanded === row._id}
                onToggle={() => setExpanded(expanded === row._id ? null : row._id)}
                checking={checking === row._id}
                onCheck={() => void handleCheck(row)}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="divide-y divide-border lg:hidden">
        {rows.map((row) => (
          <li key={row._id} className="space-y-2 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-foreground">
                  {row.normalized?.company ?? row.raw.company}
                </p>
            <p className="truncate text-xs text-muted-foreground">
              {[row.normalized?.city, row.normalized?.category]
                .filter(Boolean)
                .join(" · ") || "No location"}
              {row.business?.opportunity
                ? ` · Auto ${row.business.opportunity.score}`
                : ""}
            </p>
              </div>
              <StatusBadge
                label={DISCOVERY_RESULT_STATUS_LABELS[row.status]}
                tone={DISCOVERY_RESULT_STATUS_TONES[row.status]}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {row.normalized?.website ?? "No website"}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}

function ResultRow({
  row,
  expanded,
  onToggle,
  checking,
  onCheck,
}: {
  row: ResultRow;
  expanded: boolean;
  onToggle: () => void;
  checking: boolean;
  onCheck: () => void;
}) {
  const normalized = row.normalized;
  return (
    <>
      <TableRow className="cursor-pointer" onClick={onToggle}>
        <TableCell>
          <ChevronDown
            className={`size-4 text-muted-foreground transition-transform ${
              expanded ? "rotate-180" : ""
            }`}
          />
        </TableCell>
        <TableCell>
          <p className="font-medium text-foreground">
            {normalized?.company ?? row.raw.company}
          </p>
          {normalized?.contactName && (
            <p className="text-xs text-muted-foreground">{normalized.contactName}</p>
          )}
        </TableCell>
        <TableCell className="text-muted-foreground">
          {[normalized?.city, normalized?.region].filter(Boolean).join(" · ") || "—"}
        </TableCell>
        <TableCell className="text-muted-foreground">
          {normalized?.category ?? "—"}
        </TableCell>
        <TableCell>
          {normalized?.website ? (
            <div className="flex items-center gap-2">
              <a
                href={normalized.website}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => event.stopPropagation()}
                className="max-w-[180px] truncate text-sm font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
              >
                {normalized.website.replace(/^https?:\/\//, "")}
              </a>
              {row.business && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onCheck();
                  }}
                  disabled={checking}
                  className="rounded-sm p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                  aria-label={`Check website reachability for ${normalized.company}`}
                  title="Check website (real reachability check)"
                >
                  {checking ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="size-3.5" />
                  )}
                </button>
              )}
            </div>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
          {row.business && (
            <p className="mt-0.5">
              <ReachabilityBadge
                status={row.business.websiteStatus ?? "UNKNOWN"}
              />
            </p>
          )}
        </TableCell>
        <TableCell className="text-muted-foreground">
          {normalized?.phone ?? "—"}
        </TableCell>
        <TableCell className="text-muted-foreground">
          {normalized?.email ?? "—"}
        </TableCell>
        <TableCell>
          {row.business?.opportunity ? (
            <span
              title={`Automatic opportunity score — website ${row.business.opportunity.factors.website}/40, contact ${row.business.opportunity.factors.contact}/30, completeness ${row.business.opportunity.factors.completeness}/30`}
            >
              <StatusBadge
                label={`${row.business.opportunity.score} · ${
                  SCORE_TIER_LABELS[
                    scoreTier(row.business.opportunity.score) ?? "LOW"
                  ]
                }`}
                tone={
                  SCORE_TIER_TONES[
                    scoreTier(row.business.opportunity.score) ?? "LOW"
                  ]
                }
              />
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </TableCell>
        <TableCell className="tabular-nums text-muted-foreground">
          {normalized?.confidence !== undefined
            ? `${Math.round(normalized.confidence * 100)}%`
            : "—"}
        </TableCell>
        <TableCell>
          {row.business?.stage ? (
            <Link
              to="/dashboard/pipeline"
              className="inline-flex items-center gap-1 text-sm font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
            >
              {PIPELINE_STAGE_LABELS[
                row.business.stage as keyof typeof PIPELINE_STAGE_LABELS
              ]}
              <ExternalLink className="size-3" />
            </Link>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </TableCell>
        <TableCell>
          <StatusBadge
            label={DISCOVERY_RESULT_STATUS_LABELS[row.status]}
            tone={DISCOVERY_RESULT_STATUS_TONES[row.status]}
          />
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow className="hover:bg-transparent">
          <TableCell />
          <TableCell colSpan={10} className="bg-muted/20">
            <div className="grid grid-cols-1 gap-4 py-2 sm:grid-cols-2 lg:grid-cols-3">
              <DetailBlock
                title="Outcome"
                lines={[
                  row.status === "ACCEPTED" && row.business
                    ? `Accepted — added to the pipeline as ${row.business.name ?? "business"}`
                    : DISCOVERY_RESULT_STATUS_LABELS[row.status],
                  row.rejectionReason ?? undefined,
                  row.duplicateOfBusiness
                    ? `Duplicate of ${row.duplicateOfBusiness.name ?? "business"}${
                        row.duplicateSignal
                          ? ` (${DUPLICATE_SIGNAL_LABELS[
                              row.duplicateSignal as keyof typeof DUPLICATE_SIGNAL_LABELS
                            ] ?? row.duplicateSignal})`
                          : ""
                      }`
                    : undefined,
                ].filter(Boolean)}
              />
              <DetailBlock
                title="Source & provenance"
                lines={[
                  `Provider: ${row.providerSlug}`,
                  row.raw.sourceReference
                    ? `Reference: ${row.raw.sourceReference}`
                    : "Reference: none",
                  `Retrieved: ${formatDateTime(row.retrievedAt)}`,
                ]}
              />
              <DetailBlock
                title="Contact details"
                lines={[
                  row.raw.address ? `Address: ${row.raw.address}` : undefined,
                  row.raw.socials && row.raw.socials.length > 0
                    ? `Socials: ${row.raw.socials.join(", ")}`
                    : undefined,
                  row.raw.whatsapp ? `WhatsApp: ${row.raw.whatsapp}` : undefined,
                  row.raw.notes ? `Notes: ${row.raw.notes}` : undefined,
                ].filter(Boolean)}
              />
              <DetailBlock
                title="Opportunity score"
                lines={
                  row.business?.opportunity
                    ? [
                        `Score: ${row.business.opportunity.score} / 100 (${SCORE_TIER_LABELS[
                          scoreTier(row.business.opportunity.score) ?? "LOW"
                        ]} opportunity)`,
                        `Website: ${row.business.opportunity.factors.website} / 40`,
                        `Contact: ${row.business.opportunity.factors.contact} / 30`,
                        `Completeness: ${row.business.opportunity.factors.completeness} / 30`,
                      ]
                    : []
                }
              />
              {normalized && normalized.identityKeys.length > 0 && (
                <div className="sm:col-span-2 lg:col-span-3">
                  <p className="text-xs font-medium text-foreground">
                    Identity keys (deduplication fingerprints)
                  </p>
                  <p className="mt-1 font-mono text-[11px] leading-5 text-muted-foreground">
                    {normalized.identityKeys.join("  ·  ")}
                  </p>
                </div>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function DetailBlock({
  title,
  lines,
}: {
  title: string;
  lines: Array<string | undefined>;
}) {
  const present = lines.filter((line): line is string => Boolean(line));
  return (
    <div>
      <p className="text-xs font-medium text-foreground">{title}</p>
      {present.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">None</p>
      ) : (
        <ul className="mt-1 space-y-1 text-xs leading-5 text-muted-foreground">
          {present.map((line, index) => (
            <li key={`${line}-${index}`}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReachabilityBadge({ status }: { status: WebsiteReachabilityState }) {
  return (
    <StatusBadge
      label={WEBSITE_REACHABILITY_LABELS[status]}
      tone={WEBSITE_REACHABILITY_TONES[status]}
    />
  );
}

/* -------------------------------- Page shell ------------------------------ */

export default function DiscoveryPage() {
  return (
    <QueryBoundary
      fallback={(retry) => (
        <ErrorState
          title="Unable to load discovery"
          description="The database may be unreachable. Check System health, then retry."
          onRetry={retry}
          className="py-24"
        />
      )}
    >
      <DiscoveryContent />
    </QueryBoundary>
  );
}
