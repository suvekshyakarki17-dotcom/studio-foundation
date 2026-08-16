import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowRight,
  Contact,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  UserPlus,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useOutletContext, useSearchParams } from "react-router";
import type { StudioOutletContext } from "@/components/studio/app-shell";
import { BusinessFormDialog } from "@/components/studio/business-form-dialog";
import { DeleteConfirm } from "@/components/studio/delete-confirm";
import { MetricCard } from "@/components/studio/metric-card";
import { PageHeader } from "@/components/studio/page-header";
import { QueryBoundary } from "@/components/studio/query-boundary";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/studio/states";
import { StatusBadge } from "@/components/studio/status-badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { getErrorMessage } from "@/lib/errors";
import { formatRelativeTime } from "@/lib/format";
import {
  KNOWN_MARKETS,
  PIPELINE_STAGES,
  PIPELINE_STAGE_LABELS,
  PIPELINE_STAGE_TONES,
  SCORE_TIER_LABELS,
  SCORE_TIER_TONES,
  WEBSITE_STATE_LABELS,
  WEBSITE_STATE_TONES,
  scoreTier,
  type PipelineStage,
  type ScoreTier,
} from "@/shared/domain";

const ALL = "ALL";

/** Light debounce so keystrokes don't fire a query per character. */
function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function PipelineContent() {
  const { openCreate } = useOutletContext<StudioOutletContext>();
  const [searchParams] = useSearchParams();
  const urlStage = searchParams.get("stage");
  const urlMarket = searchParams.get("market");
  const [stageFilter, setStageFilter] = useState<PipelineStage | typeof ALL>(
    () =>
      urlStage && PIPELINE_STAGES.includes(urlStage as PipelineStage)
        ? (urlStage as PipelineStage)
        : ALL,
  );
  const [marketFilter, setMarketFilter] = useState<string | typeof ALL>(
    () =>
      urlMarket && KNOWN_MARKETS.some((market) => market.code === urlMarket)
        ? urlMarket
        : ALL,
  );
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [opportunityFilter, setOpportunityFilter] = useState<
    ScoreTier | typeof ALL
  >(ALL);
  const [editing, setEditing] = useState<Doc<"businesses"> | null>(null);
  const [converting, setConverting] = useState<Doc<"businesses"> | null>(null);

  const businesses = useQuery(api.businesses.list, {
    ...(stageFilter === ALL ? {} : { stage: stageFilter }),
    ...(marketFilter === ALL ? {} : { marketCode: marketFilter }),
    ...(debouncedSearch.trim() ? { search: debouncedSearch } : {}),
  });
  const stats = useQuery(api.businesses.stats);
  const setStage = useMutation(api.businesses.setStage);
  const convertToClient = useMutation(api.businesses.convertToClient);
  const removeBusiness = useMutation(api.businesses.remove);
  const recomputeOpportunity = useMutation(api.businesses.recomputeOpportunity);
  const [rescoreBusy, setRescoreBusy] = useState(false);

  // Opportunity tier is a derived view, applied client-side over the rows
  // already fetched for the active stage/market/search filters.
  const filteredBusinesses = useMemo(() => {
    if (opportunityFilter === ALL) return businesses ?? [];
    return (businesses ?? []).filter(
      (business) =>
        scoreTier(business.opportunity?.score) === opportunityFilter,
    );
  }, [businesses, opportunityFilter]);

  const handleRescore = async () => {
    setRescoreBusy(true);
    try {
      const { changed } = await recomputeOpportunity({});
      toast(
        `Recomputed automatic opportunity scores for ${changed} business${
          changed === 1 ? "" : "es"
        }`,
      );
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setRescoreBusy(false);
    }
  };

  const handleStageChange = async (
    business: Doc<"businesses">,
    stage: PipelineStage,
  ) => {
    if (stage === business.stage) return;
    try {
      await setStage({ id: business._id, stage });
      toast(`${business.company} moved to ${PIPELINE_STAGE_LABELS[stage]}`);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleConvert = async (business: Doc<"businesses">) => {
    try {
      const { clientId } = await convertToClient({ id: business._id });
      toast(
        `${business.company} converted to client — project and client are linked`,
      );
      void clientId;
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setConverting(null);
    }
  };

  const handleDelete = async (business: Doc<"businesses">) => {
    await removeBusiness({ id: business._id });
    toast(`Business removed from pipeline — ${business.company}`);
  };

  if (businesses === undefined || stats === undefined) {
    return <LoadingState label="Loading pipeline…" className="py-24" />;
  }

  const filterActive =
    stageFilter !== ALL ||
    marketFilter !== ALL ||
    opportunityFilter !== ALL ||
    debouncedSearch.trim() !== "";

  return (
    <div className="space-y-8">
      <PageHeader
        title="Pipeline"
        description="Businesses moving through the studio — discovered, qualified, engaged, and closed. Every stage change is recorded."
      >
        <Button type="button" onClick={() => openCreate("business")}>
          <Plus className="size-4" />
          New business
        </Button>
      </PageHeader>

      <section
        aria-label="Pipeline metrics"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <MetricCard
          label="In pipeline"
          value={stats.total}
          sub={
            stats.total === 0
              ? "No businesses yet"
              : `${stats.byStage.WON} won · ${stats.byStage.LOST} lost`
          }
        />
        <MetricCard
          label="Engaged"
          value={stats.engaged}
          sub="Qualified through proposal"
        />
        <MetricCard
          label="Active opportunities"
          value={stats.activeOpportunities}
          sub="In conversation right now"
        />
        <MetricCard
          label="High opportunity"
          value={stats.highOpportunity}
          sub={
            stats.opportunityScored > 0
              ? `${stats.opportunityScored} auto-scored · avg ${stats.averageOpportunity ?? "—"}`
              : "No automatic scores yet"
          }
        />
      </section>

      {businesses.length === 0 && !filterActive ? (
        <EmptyState
          icon={Contact}
          title="The pipeline is empty"
          description="Add a business you're tracking — a lead from research, a referral, or a business that needs a better website — and move it through the stages."
          action={
            <Button type="button" onClick={() => openCreate("business")}>
              <Plus className="size-4" />
              Add your first business
            </Button>
          }
          className="py-20"
        />
      ) : (
        <section
          aria-label="Businesses list"
          className="rounded-md border border-border bg-card"
        >
          <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search company, contact, email, website…"
              aria-label="Search businesses"
              className="h-9 w-full max-w-xs"
            />
            <Select
              value={stageFilter}
              onValueChange={(value) =>
                setStageFilter(value as PipelineStage | typeof ALL)
              }
            >
              <SelectTrigger size="sm" className="w-auto" aria-label="Filter by stage">
                <SelectValue placeholder="All stages" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All stages</SelectItem>
                {PIPELINE_STAGES.map((stage) => (
                  <SelectItem key={stage} value={stage}>
                    {PIPELINE_STAGE_LABELS[stage]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={marketFilter}
              onValueChange={(value) =>
                setMarketFilter(value as string | typeof ALL)
              }
            >
              <SelectTrigger size="sm" className="w-auto" aria-label="Filter by market">
                <SelectValue placeholder="All markets" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All markets</SelectItem>
                {KNOWN_MARKETS.map((market) => (
                  <SelectItem key={market.code} value={market.code}>
                    {market.flag} {market.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={opportunityFilter}
              onValueChange={(value) =>
                setOpportunityFilter(value as ScoreTier | typeof ALL)
              }
            >
              <SelectTrigger
                size="sm"
                className="w-auto"
                aria-label="Filter by opportunity tier"
              >
                <SelectValue placeholder="All opportunity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All opportunity</SelectItem>
                <SelectItem value="HIGH">High opportunity</SelectItem>
                <SelectItem value="MEDIUM">Medium opportunity</SelectItem>
                <SelectItem value="LOW">Low opportunity</SelectItem>
              </SelectContent>
            </Select>
            {stats.opportunityScored < stats.total && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void handleRescore()}
                disabled={rescoreBusy}
                title="Compute automatic opportunity scores for every business from its real signals"
              >
                {rescoreBusy ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
                Re-score all
              </Button>
            )}
            <p className="ml-auto text-sm text-muted-foreground">
              {filteredBusinesses.length}{" "}
              {filteredBusinesses.length === 1 ? "business" : "businesses"}
            </p>
          </div>

          {filteredBusinesses.length === 0 ? (
            <p className="px-5 py-16 text-center text-sm text-muted-foreground">
              No businesses match the current search and filters.
            </p>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Company</TableHead>
                      <TableHead>Stage</TableHead>
                      <TableHead>Website</TableHead>
                      <TableHead>Market</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Updated</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredBusinesses.map((business) => (
                      <TableRow key={business._id}>
                        <TableCell>
                          <p className="font-medium text-foreground">
                            {business.company}
                          </p>
                          <p className="max-w-[240px] truncate text-xs text-muted-foreground">
                            {[business.contactName, business.email]
                              .filter(Boolean)
                              .join(" · ") || "No contact details"}
                          </p>
                        </TableCell>
                        <TableCell>
                          <StageSelect
                            value={business.stage}
                            onChange={(stage) => handleStageChange(business, stage)}
                          />
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            label={WEBSITE_STATE_LABELS[business.websiteState]}
                            tone={WEBSITE_STATE_TONES[business.websiteState]}
                          />
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {marketLabel(business.marketCode, business.region)}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col items-start gap-1">
                            {business.opportunity ? (
                              <OpportunityBadge
                                score={business.opportunity.score}
                                factors={business.opportunity.factors}
                              />
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                Not scored
                              </span>
                            )}
                            {business.score !== undefined &&
                              business.score !== null && (
                                <span
                                  className="text-xs text-muted-foreground"
                                  title="Operator-set priority"
                                >
                                  Priority {business.score}
                                </span>
                              )}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatRelativeTime(business.updatedAt)}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="text-muted-foreground hover:text-foreground"
                              onClick={() => setEditing(business)}
                              aria-label={`Edit ${business.company}`}
                              title="Edit"
                            >
                              <Pencil className="size-4" />
                            </Button>
                            {business.stage !== "WON" &&
                              business.stage !== "LOST" &&
                              !business.convertedClientId && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="text-muted-foreground hover:text-emerald-700 dark:hover:text-emerald-300"
                                  onClick={() => setConverting(business)}
                                  aria-label={`Convert ${business.company} to client`}
                                  title="Convert to client"
                                >
                                  <UserPlus className="size-4" />
                                </Button>
                              )}
                            <DeleteConfirm
                              title="Remove this business?"
                              description={`"${business.company}" will be removed from the pipeline. This cannot be undone.`}
                              onConfirm={() => handleDelete(business)}
                            >
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="text-muted-foreground hover:text-destructive"
                                aria-label={`Remove ${business.company}`}
                                title="Remove"
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </DeleteConfirm>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile cards */}
              <ul className="divide-y divide-border md:hidden">
                {filteredBusinesses.map((business) => (
                  <li key={business._id} className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-foreground">
                          {business.company}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[business.contactName, business.email]
                            .filter(Boolean)
                            .join(" · ") || "No contact details"}
                        </p>
                      </div>
                      <StatusBadge
                        label={PIPELINE_STAGE_LABELS[business.stage]}
                        tone={PIPELINE_STAGE_TONES[business.stage]}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        {WEBSITE_STATE_LABELS[business.websiteState]}
                      </span>
                      <span>{marketLabel(business.marketCode, business.region)}</span>
                      {business.opportunity && (
                        <span className="font-medium text-foreground">
                          Auto {business.opportunity.score}
                        </span>
                      )}
                      {business.score !== undefined && business.score !== null && (
                        <span>Priority {business.score}</span>
                      )}
                      <span>{formatRelativeTime(business.updatedAt)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Select
                        value={business.stage}
                        onValueChange={(value) =>
                          handleStageChange(business, value as PipelineStage)
                        }
                      >
                        <SelectTrigger
                          size="sm"
                          className="min-w-[130px]"
                          aria-label={`Stage: ${PIPELINE_STAGE_LABELS[business.stage]}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PIPELINE_STAGES.map((stage) => (
                            <SelectItem key={stage} value={stage}>
                              {PIPELINE_STAGE_LABELS[stage]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditing(business)}
                      >
                        <Pencil className="size-3.5" />
                        Edit
                      </Button>
                      {business.stage !== "WON" &&
                        business.stage !== "LOST" &&
                        !business.convertedClientId && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setConverting(business)}
                          >
                            <UserPlus className="size-3.5" />
                            Convert
                          </Button>
                        )}
                      <DeleteConfirm
                        title="Remove this business?"
                        description={`"${business.company}" will be removed from the pipeline. This cannot be undone.`}
                        onConfirm={() => handleDelete(business)}
                      >
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="size-3.5" />
                          Remove
                        </Button>
                      </DeleteConfirm>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      <BusinessFormDialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        business={editing ?? undefined}
      />

      <ConvertConfirmDialog
        business={converting}
        onOpenChange={(open) => {
          if (!open) setConverting(null);
        }}
        onConfirm={handleConvert}
      />
    </div>
  );
}

function OpportunityBadge({
  score,
  factors,
}: {
  score: number;
  factors: { website: number; contact: number; completeness: number };
}) {
  const tier = scoreTier(score) ?? "LOW";
  return (
    <span
      title={`Automatic opportunity score derived from real signals — website ${factors.website}/40, contact ${factors.contact}/30, completeness ${factors.completeness}/30`}
    >
      <StatusBadge
        label={`Auto ${score} · ${SCORE_TIER_LABELS[tier]}`}
        tone={SCORE_TIER_TONES[tier]}
      />
    </span>
  );
}

function marketLabel(marketCode: string | undefined, region: string | undefined) {
  if (!marketCode) return "—";
  const market = KNOWN_MARKETS.find((item) => item.code === marketCode);
  const base = market ? `${market.flag} ${market.name}` : marketCode;
  return region ? `${base} · ${region}` : base;
}

function StageSelect({
  value,
  onChange,
}: {
  value: PipelineStage;
  onChange: (stage: PipelineStage) => void;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => onChange(next as PipelineStage)}
    >
      <SelectTrigger
        size="sm"
        className="min-w-[120px]"
        aria-label={`Stage: ${PIPELINE_STAGE_LABELS[value]}`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PIPELINE_STAGES.map((stage) => (
          <SelectItem key={stage} value={stage}>
            {PIPELINE_STAGE_LABELS[stage]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ConvertConfirmDialog({
  business,
  onOpenChange,
  onConfirm,
}: {
  business: Doc<"businesses"> | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (business: Doc<"businesses">) => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const handleConfirm = async () => {
    if (!business) return;
    setPending(true);
    try {
      await onConfirm(business);
    } finally {
      setPending(false);
    }
  };
  return (
    <AlertDialog open={business !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Convert to client?</AlertDialogTitle>
          <AlertDialogDescription>
            {business
              ? `"${business.company}" will become an active client, and this pipeline record will close as Won. A real client record is created in the database.`
              : ""}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              void handleConfirm();
            }}
            disabled={pending}
          >
            {pending ? "Converting…" : (
              <>
                Convert to client
                <ArrowRight className="size-4" />
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default function PipelinePage() {
  return (
    <QueryBoundary
      fallback={(retry) => (
        <ErrorState
          title="Unable to load the pipeline"
          description="The database may be unreachable. Check System health, then retry."
          onRetry={retry}
          className="py-24"
        />
      )}
    >
      <PipelineContent />
    </QueryBoundary>
  );
}
