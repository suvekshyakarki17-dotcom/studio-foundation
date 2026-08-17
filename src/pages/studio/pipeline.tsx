import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  ArrowRight,
  Contact,
  Eye,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  UserPlus,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import {
  CONFIDENCE_TIER_LABELS,
  EMAIL_STATUS_LABELS,
  WEBSITE_VERIFICATION_METHOD_LABELS,
  confidenceTier,
} from "@/shared/discovery/quality";
import {
  KNOWN_MARKETS,
  PIPELINE_STAGES,
  PIPELINE_STAGE_LABELS,
  PIPELINE_STAGE_TONES,
  SCORE_TIER_LABELS,
  SCORE_TIER_TONES,
  WEBSITE_STATE_LABELS,
  scoreTier,
  type PipelineStage,
  type ScoreTier,
} from "@/shared/domain";
import {
  LEAD_QUALIFICATION_LABELS,
  LEAD_QUALIFICATION_TONES,
  WEBSITE_REACHABILITY_LABELS,
  WEBSITE_REACHABILITY_TONES,
  type LeadQualification,
  type WebsiteReachabilityState,
} from "@/shared/discovery";

const ALL = "ALL";

/** PENDING = accepted but the strict verification has not run yet. */
type QualificationFilter = LeadQualification | "PENDING" | typeof ALL;

/** Phase 4 §23: contact availability filter. */
type ContactFilter = "phone" | "email" | "social" | "none" | typeof ALL;

/** Phase 4 §24: deterministic server-side sort keys. */
type PipelineSort =
  | "updated"
  | "name"
  | "opportunity"
  | "confidence"
  | "quality"
  | "discovered";

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
  const [qualificationFilter, setQualificationFilter] =
    useState<QualificationFilter>(ALL);
  // Phase 4 §23/§24: website status + contact availability filters, and
  // deterministic server-side sorting.
  const [websiteStatusFilter, setWebsiteStatusFilter] = useState<
    WebsiteReachabilityState | typeof ALL
  >(ALL);
  const [contactFilter, setContactFilter] = useState<ContactFilter>(ALL);
  const [categoryFilter, setCategoryFilter] = useState<string | typeof ALL>(ALL);
  const [sort, setSort] = useState<PipelineSort>("updated");
  const [editing, setEditing] = useState<Doc<"businesses"> | null>(null);
  const [converting, setConverting] = useState<Doc<"businesses"> | null>(null);
  const [detail, setDetail] = useState<Doc<"businesses"> | null>(null);

  const businesses = useQuery(api.businesses.list, {
    ...(stageFilter === ALL ? {} : { stage: stageFilter }),
    ...(marketFilter === ALL ? {} : { marketCode: marketFilter }),
    ...(debouncedSearch.trim() ? { search: debouncedSearch } : {}),
    ...(qualificationFilter === ALL
      ? {}
      : { qualification: qualificationFilter }),
    ...(websiteStatusFilter === ALL
      ? {}
      : { websiteStatus: websiteStatusFilter }),
    ...(contactFilter === ALL ? {} : { contactAvailability: contactFilter }),
    ...(categoryFilter === ALL ? {} : { category: categoryFilter }),
    ...(sort === "updated" ? {} : { sort }),
  });
  const stats = useQuery(api.businesses.stats);
  const setStage = useMutation(api.businesses.setStage);
  const convertToClient = useMutation(api.businesses.convertToClient);
  const removeBusiness = useMutation(api.businesses.remove);
  const recomputeOpportunity = useMutation(api.businesses.recomputeOpportunity);
  const checkStale = useAction(api.website_checks.checkStaleWebsites);
  const [rescoreBusy, setRescoreBusy] = useState(false);
  const [checkingStale, setCheckingStale] = useState(false);

  // Phase 4 §23: category options come from the loaded records' real data.
  const categories = useMemo(() => {
    const seen = new Set<string>();
    for (const business of businesses ?? []) {
      if (business.category) seen.add(business.category);
    }
    return [...seen].sort();
  }, [businesses]);

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

  // Phase 4 §25/§28: real batch re-check of stale website verifications
  // (freshness window honored unless forced).
  const handleCheckStale = async () => {
    setCheckingStale(true);
    try {
      const result = await checkStale({ limit: 50 });
      const parts = Object.entries(result.results)
        .filter(([, count]) => count > 0)
        .map(
          ([status, count]) =>
            `${count} ${WEBSITE_REACHABILITY_LABELS[
              status as WebsiteReachabilityState
            ].toLowerCase()}`,
        );
      toast(
        result.checked === 0
          ? "No stale website verifications to re-check."
          : `Re-checked ${result.checked} stale business${
              result.checked === 1 ? "" : "es"
            }${parts.length > 0 ? ` — ${parts.join(", ")}` : ""}`,
      );
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setCheckingStale(false);
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
    qualificationFilter !== ALL ||
    websiteStatusFilter !== ALL ||
    contactFilter !== ALL ||
    categoryFilter !== ALL ||
    debouncedSearch.trim() !== "";

  return (
    <div className="space-y-8">
      <PageHeader
        title="Pipeline"
        description="Businesses moving through the studio — discovered, qualified, engaged, and closed. Every stage change is recorded. Only confirmed no-website businesses qualify for the no-website lead list."
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
            <Select
              value={qualificationFilter}
              onValueChange={(value) =>
                setQualificationFilter(value as QualificationFilter)
              }
            >
              <SelectTrigger
                size="sm"
                className="w-auto"
                aria-label="Filter by no-website qualification"
              >
                <SelectValue placeholder="All qualifications" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All qualifications</SelectItem>
                <SelectItem value="QUALIFIED">Qualified — no website</SelectItem>
                <SelectItem value="REJECTED_HAS_WEBSITE">
                  Rejected — has website
                </SelectItem>
                <SelectItem value="NOT_QUALIFIED">Not qualified</SelectItem>
                <SelectItem value="PENDING">Pending verification</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={websiteStatusFilter}
              onValueChange={(value) =>
                setWebsiteStatusFilter(value as WebsiteReachabilityState | typeof ALL)
              }
            >
              <SelectTrigger
                size="sm"
                className="w-auto"
                aria-label="Filter by website status"
              >
                <SelectValue placeholder="All website statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All website statuses</SelectItem>
                <SelectItem value="NO_WEBSITE">No website</SelectItem>
                <SelectItem value="HAS_WEBSITE">Has website</SelectItem>
                <SelectItem value="UNKNOWN">Unknown</SelectItem>
                <SelectItem value="UNREACHABLE">Unreachable</SelectItem>
                <SelectItem value="BLOCKED">Blocked</SelectItem>
                <SelectItem value="INVALID_URL">Invalid URL</SelectItem>
                <SelectItem value="CHECK_FAILED">Check failed</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={contactFilter}
              onValueChange={(value) => setContactFilter(value as ContactFilter)}
            >
              <SelectTrigger
                size="sm"
                className="w-auto"
                aria-label="Filter by contact availability"
              >
                <SelectValue placeholder="Any contact" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Any contact</SelectItem>
                <SelectItem value="phone">Has phone</SelectItem>
                <SelectItem value="email">Has email</SelectItem>
                <SelectItem value="social">Has social / Maps profile</SelectItem>
                <SelectItem value="none">No contact details</SelectItem>
              </SelectContent>
            </Select>
            {categories.length > 0 && (
              <Select
                value={categoryFilter}
                onValueChange={(value) =>
                  setCategoryFilter(value as string | typeof ALL)
                }
              >
                <SelectTrigger
                  size="sm"
                  className="w-auto"
                  aria-label="Filter by category"
                >
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All categories</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select
              value={sort}
              onValueChange={(value) => setSort(value as PipelineSort)}
            >
              <SelectTrigger size="sm" className="w-auto" aria-label="Sort leads">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="updated">Recently updated</SelectItem>
                <SelectItem value="name">Business name</SelectItem>
                <SelectItem value="opportunity">Opportunity score</SelectItem>
                <SelectItem value="confidence">Website confidence</SelectItem>
                <SelectItem value="quality">Data quality</SelectItem>
                <SelectItem value="discovered">Discovery date</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void handleCheckStale()}
              disabled={checkingStale}
              title="Real batch re-check of stale website verifications (freshness window honored)"
            >
              {checkingStale ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              Re-verify stale websites
            </Button>
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
                      <TableHead>Qualified</TableHead>
                      <TableHead>Data</TableHead>
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
                          <button
                            type="button"
                            onClick={() => setDetail(business)}
                            className="text-left font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
                            title="Open lead detail"
                          >
                            {business.company}
                          </button>
                          <p className="max-w-[240px] truncate text-xs text-muted-foreground">
                            {[business.contactName, business.email, business.address]
                              .filter(Boolean)
                              .join(" · ") || "No contact details"}
                          </p>
                          {business.socials && business.socials.length > 0 && (
                            <p className="max-w-[240px] truncate text-xs text-muted-foreground/80">
                              {business.socials.join(" · ")}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          <StageSelect
                            value={business.stage}
                            onChange={(stage) => handleStageChange(business, stage)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col items-start gap-1">
                            <ReachabilityBadge status={business.websiteStatus} />
                            {business.websiteConfidence !== undefined && (
                              <span
                                className="text-xs text-muted-foreground"
                                title="Website verification confidence (derived from real verification signals)"
                              >
                                Confidence {business.websiteConfidence} ·{" "}
                                {CONFIDENCE_TIER_LABELS[
                                  confidenceTier(business.websiteConfidence)
                                ]}
                              </span>
                            )}
                            {business.website ? (
                              <a
                                href={business.website}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="max-w-[160px] truncate text-xs text-muted-foreground underline decoration-border underline-offset-2 hover:text-foreground"
                              >
                                {business.website.replace(/^https?:\/\//, "")}
                              </a>
                            ) : (
                              <span className="text-xs text-muted-foreground/70">
                                {WEBSITE_STATE_LABELS[business.websiteState]}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <QualificationBadge
                            qualification={business.qualification}
                            reason={business.qualificationReason}
                          />
                        </TableCell>
                        <TableCell>
                          {business.dataQuality ? (
                            <span
                              className="text-xs text-muted-foreground"
                              title={`Lead data quality — weighted completeness of the real public fields present (scored ${formatDateTime(
                                business.dataQuality.scoredAt,
                              )})`}
                            >
                              <span className="font-medium tabular-nums text-foreground">
                                {business.dataQuality.completeness}%
                              </span>{" "}
                              · {CONFIDENCE_TIER_LABELS[business.dataQuality.tier]}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
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
                              onClick={() => setDetail(business)}
                              aria-label={`View ${business.company} details`}
                              title="Lead detail"
                            >
                              <Eye className="size-4" />
                            </Button>
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
                      <ReachabilityBadge status={business.websiteStatus} />
                      <QualificationBadge
                        qualification={business.qualification}
                        reason={business.qualificationReason}
                      />
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

      <LeadDetailDialog
        business={detail}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
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

function ReachabilityBadge({ status }: { status: WebsiteReachabilityState }) {
  return (
    <StatusBadge
      label={WEBSITE_REACHABILITY_LABELS[status]}
      tone={WEBSITE_REACHABILITY_TONES[status]}
    />
  );
}

/**
 * The strict no-website gate badge. Only QUALIFIED rows are no-website
 * leads; the reason is always attached so the operator can see exactly
 * why a business was or was not qualified.
 */
function QualificationBadge({
  qualification,
  reason,
}: {
  qualification: LeadQualification | undefined;
  reason?: string;
}) {
  if (qualification === undefined) {
    return (
      <span title="Verification has not run for this business yet">
        <StatusBadge label="Pending verification" tone="neutral" />
      </span>
    );
  }
  const label =
    qualification === "QUALIFIED"
      ? "No website — verified"
      : qualification === "REJECTED_HAS_WEBSITE"
        ? "Has website — rejected"
        : LEAD_QUALIFICATION_LABELS[qualification];
  return (
    <span title={reason ?? LEAD_QUALIFICATION_LABELS[qualification]}>
      <StatusBadge
        label={label}
        tone={LEAD_QUALIFICATION_TONES[qualification]}
      />
    </span>
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

/**
 * Phase 4 §22 — full lead detail. Every value shown comes from the real
 * record; anything absent renders honestly as unavailable. Social URLs are
 * grouped by platform from their host, never assumed official.
 */
function LeadDetailDialog({
  business,
  onOpenChange,
}: {
  business: Doc<"businesses"> | null;
  onOpenChange: (open: boolean) => void;
}) {
  const socialsByPlatform = useMemo(() => {
    const groups: Record<string, string[]> = {};
    for (const url of business?.socials ?? []) {
      try {
        const host = new URL(url).hostname.replace(/^www\./, "");
        const platform =
          host === "instagram.com"
            ? "Instagram"
            : host === "facebook.com" || host.endsWith(".facebook.com")
              ? "Facebook"
              : host === "tiktok.com"
                ? "TikTok"
                : host === "linkedin.com" || host.endsWith(".linkedin.com")
                  ? "LinkedIn"
                  : host;
        (groups[platform] ??= []).push(url);
      } catch {
        (groups["Other"] ??= []).push(url);
      }
    }
    return groups;
  }, [business]);

  return (
    <Dialog open={business !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{business?.company ?? "Lead detail"}</DialogTitle>
          <DialogDescription>
            Everything below comes from the actual database record. Missing
            values are shown as unavailable — nothing is fabricated.
          </DialogDescription>
        </DialogHeader>
        {business && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <QualificationBadge
                qualification={business.qualification}
                reason={business.qualificationReason}
              />
              <ReachabilityBadge status={business.websiteStatus} />
            </div>

            <section aria-label="Business details">
              <DetailHeading>Business</DetailHeading>
              <DetailRow label="Name" value={business.company} />
              <DetailRow label="Category" value={business.category} />
              <DetailRow label="Address" value={business.address} />
              <DetailRow
                label="Location"
                value={
                  [business.city, business.region, marketLabel(business.marketCode, undefined)]
                    .filter(Boolean)
                    .join(", ") || undefined
                }
              />
              <DetailRow label="Contact name" value={business.contactName} />
              <DetailRow label="Phone" value={business.phone} />
              <DetailRow label="Email" value={business.email} />
              {business.email && (
                <DetailRow
                  label="Email status"
                  value={
                    business.emailStatus
                      ? EMAIL_STATUS_LABELS[business.emailStatus]
                      : "Found (unverified)"
                  }
                />
              )}
            </section>

            <section aria-label="Online presence">
              <DetailHeading>Online presence</DetailHeading>
              <DetailRow
                label="Official website"
                value={
                  business.website ? (
                    <a
                      href={business.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
                    >
                      {business.website}
                    </a>
                  ) : (
                    "None recorded"
                  )
                }
              />
              <DetailRow
                label="Google Maps / profile"
                value={
                  business.googleMapsUrl ? (
                    <a
                      href={business.googleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
                    >
                      {business.googleMapsUrl}
                    </a>
                  ) : undefined
                }
              />
              {Object.keys(socialsByPlatform).length === 0 ? (
                <DetailRow label="Social profiles" value={undefined} />
              ) : (
                Object.entries(socialsByPlatform).map(([platform, urls]) => (
                  <DetailRow key={platform} label={platform}>
                    <ul className="space-y-1">
                      {urls.map((url) => (
                        <li key={url}>
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
                          >
                            {url}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </DetailRow>
                ))
              )}
              <DetailRow label="WhatsApp" value={business.whatsapp} />
            </section>

            <section aria-label="Website verification">
              <DetailHeading>Verification</DetailHeading>
              <DetailRow
                label="Website status"
                value={
                  <ReachabilityBadge status={business.websiteStatus} />
                }
              />
              <DetailRow
                label="Confidence"
                value={
                  business.websiteConfidence !== undefined ? (
                    <span className="font-medium text-foreground">
                      {business.websiteConfidence}% ·{" "}
                      {CONFIDENCE_TIER_LABELS[
                        confidenceTier(business.websiteConfidence)
                      ]}
                    </span>
                  ) : undefined
                }
              />
              <DetailRow
                label="Method"
                value={
                  business.websiteVerificationMethod
                    ? WEBSITE_VERIFICATION_METHOD_LABELS[
                        business.websiteVerificationMethod
                      ]
                    : undefined
                }
              />
              <DetailRow
                label="Checked at"
                value={
                  business.websiteCheckedAt
                    ? formatDateTime(business.websiteCheckedAt)
                    : undefined
                }
              />
              <DetailRow
                label="HTTP status"
                value={
                  business.websiteHttpStatus !== undefined
                    ? String(business.websiteHttpStatus)
                    : undefined
                }
              />
              <DetailRow
                label="Checked URL"
                value={
                  business.websiteCheckedUrl &&
                  business.websiteCheckedUrl !== business.website
                    ? business.websiteCheckedUrl
                    : undefined
                }
              />
              <DetailRow
                label="Final URL after redirects"
                value={
                  business.websiteFinalUrl &&
                  business.websiteFinalUrl !== business.website
                    ? business.websiteFinalUrl
                    : undefined
                }
              />
              <DetailRow
                label="Verification source"
                value={business.websiteVerificationSource}
              />
            </section>

            <section aria-label="Qualification">
              <DetailHeading>Qualification</DetailHeading>
              <DetailRow
                label="Qualified because"
                value={
                  business.qualificationReason ??
                  (business.qualification
                    ? LEAD_QUALIFICATION_LABELS[business.qualification]
                    : "Verification has not run yet")
                }
              />
              <DetailRow
                label="Qualified at"
                value={
                  business.qualifiedAt
                    ? formatDateTime(business.qualifiedAt)
                    : undefined
                }
              />
            </section>

            <section aria-label="Opportunity score">
              <DetailHeading>Opportunity</DetailHeading>
              {business.opportunity ? (
                <>
                  <DetailRow
                    label="Score"
                    value={
                      <OpportunityBadge
                        score={business.opportunity.score}
                        factors={business.opportunity.factors}
                      />
                    }
                  />
                  <DetailRow
                    label="Website signal"
                    value={`${business.opportunity.factors.website} / 40`}
                  />
                  <DetailRow
                    label="Contact signal"
                    value={`${business.opportunity.factors.contact} / 30`}
                  />
                  <DetailRow
                    label="Completeness signal"
                    value={`${business.opportunity.factors.completeness} / 30`}
                  />
                </>
              ) : (
                <DetailRow label="Score" value={undefined} />
              )}
            </section>

            <section aria-label="Lead data quality">
              <DetailHeading>Data quality</DetailHeading>
              {business.dataQuality ? (
                <>
                  <DetailRow
                    label="Completeness"
                    value={
                      <span className="font-medium text-foreground">
                        {business.dataQuality.completeness}% ·{" "}
                        {CONFIDENCE_TIER_LABELS[business.dataQuality.tier]}
                      </span>
                    }
                  />
                  <DetailRow
                    label="Scored at"
                    value={formatDateTime(business.dataQuality.scoredAt)}
                  />
                </>
              ) : (
                <DetailRow label="Completeness" value={undefined} />
              )}
            </section>

            <section aria-label="Provenance">
              <DetailHeading>Provenance</DetailHeading>
              <DetailRow
                label="Source"
                value={business.sourceReference ?? business.discoveredBy}
              />
              <DetailRow
                label="Discovery run"
                value={
                  business.discoveryRunId ? String(business.discoveryRunId) : undefined
                }
              />
              <DetailRow
                label="Discovered at"
                value={
                  business.discoveredAt
                    ? formatDateTime(business.discoveredAt)
                    : undefined
                }
              />
              <DetailRow
                label="Enriched at"
                value={
                  business.enrichedAt ? formatDateTime(business.enrichedAt) : undefined
                }
              />
              <DetailRow
                label="Enrichment source"
                value={business.enrichmentSource}
              />
              <DetailRow
                label="Last updated"
                value={formatDateTime(business.updatedAt)}
              />
              <DetailRow
                label="Notes"
                value={business.notes}
              />
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DetailHeading({ children }: { children: string }) {
  return (
    <p className="border-b border-border pb-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
      {children}
    </p>
  );
}

function DetailRow({
  label,
  value,
  children,
}: {
  label: string;
  value?: ReactNode;
  children?: ReactNode;
}) {
  const content = children ?? value;
  return (
    <div className="grid grid-cols-[150px_1fr] items-baseline gap-3 py-1.5 text-sm sm:grid-cols-[170px_1fr]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-foreground">
        {content === undefined || content === null || content === "" ? (
          <span className="italic text-muted-foreground/70">Unavailable</span>
        ) : (
          content
        )}
      </dd>
    </div>
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
