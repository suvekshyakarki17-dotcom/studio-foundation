import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import {
  ArrowRight,
  Building2,
  Contact,
  Globe,
  Megaphone,
  Plus,
} from "lucide-react";
import { Link, useNavigate, useOutletContext } from "react-router";
import { ActivityFeed } from "@/components/studio/activity-feed";
import type { StudioOutletContext } from "@/components/studio/app-shell";
import { MetricCard } from "@/components/studio/metric-card";
import { PageHeader } from "@/components/studio/page-header";
import { QueryBoundary } from "@/components/studio/query-boundary";
import { ErrorState, LoadingState } from "@/components/studio/states";
import { StatusBadge } from "@/components/studio/status-badge";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_STATUS_TONES,
  PIPELINE_STAGES,
  PIPELINE_STAGE_LABELS,
} from "@/shared/domain";

function OverviewContent() {
  const { openCreate } = useOutletContext<StudioOutletContext>();
  const navigate = useNavigate();
  const businessesStats = useQuery(api.businesses.stats);
  const campaignsStats = useQuery(api.campaigns.stats);
  const campaigns = useQuery(api.campaigns.list, {});
  const projectsStats = useQuery(api.projects.stats);
  const clientsStats = useQuery(api.clients.stats);

  const loading =
    businessesStats === undefined ||
    campaignsStats === undefined ||
    campaigns === undefined ||
    projectsStats === undefined ||
    clientsStats === undefined;

  if (loading) {
    return <LoadingState label="Loading command center…" className="py-24" />;
  }

  const activeProjects =
    projectsStats.total -
    projectsStats.byStatus.COMPLETED -
    projectsStats.byStatus.DELIVERED;
  const runningCampaigns = campaigns.filter(
    (campaign) => campaign.status === "RUNNING",
  );

  return (
    <div className="space-y-10">
      <PageHeader
        title="Command center"
        description="The real state of your studio — pipeline, campaigns, clients, and projects, straight from the database."
      >
        <Button type="button" onClick={() => openCreate("business")}>
          <Plus className="size-4" />
          New business
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => openCreate("campaign")}
        >
          <Plus className="size-4" />
          New campaign
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => openCreate("client")}
        >
          <Plus className="size-4" />
          New client
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => openCreate("project")}
        >
          <Plus className="size-4" />
          New project
        </Button>
      </PageHeader>

      <section
        aria-label="Metrics"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <MetricCard
          label="Pipeline"
          value={businessesStats.total}
          sub={
            businessesStats.total === 0
              ? "No businesses yet"
              : `${businessesStats.engaged} engaged · ${businessesStats.won} won`
          }
        />
        <MetricCard
          label="Opportunities"
          value={businessesStats.activeOpportunities}
          sub="In active conversation"
        />
        <MetricCard
          label="Campaigns running"
          value={campaignsStats.running}
          sub={
            campaignsStats.total === 0
              ? "No campaigns yet"
              : `${campaignsStats.total} total · ${campaignsStats.marketsCovered} markets`
          }
        />
        <MetricCard
          label="Active projects"
          value={activeProjects}
          sub={
            clientsStats.total === 0
              ? "No clients yet"
              : `${clientsStats.byStatus.ACTIVE} active clients`
          }
        />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section
            aria-label="Pipeline summary"
            className="rounded-md border border-border bg-card"
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="font-display text-lg tracking-tight text-foreground">
                Pipeline
              </h2>
              <Link
                to="/dashboard/pipeline"
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Open pipeline
                <ArrowRight className="size-3" />
              </Link>
            </div>
            <div className="space-y-2.5 px-5 py-4">
              <PipelineSummaryBars
                byStage={businessesStats.byStage}
                onStageClick={(stage) =>
                  navigate(`/dashboard/pipeline?stage=${stage}`)
                }
              />
            </div>
          </section>

          <section
            aria-label="Recent activity"
            className="rounded-md border border-border bg-card"
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="font-display text-lg tracking-tight text-foreground">
                Recent activity
              </h2>
              <Link
                to="/dashboard/activity"
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                View all
                <ArrowRight className="size-3" />
              </Link>
            </div>
            <div className="px-5 py-2">
              <ActivityFeed limit={8} />
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section
            aria-label="Running campaigns"
            className="rounded-md border border-border bg-card"
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="font-display text-lg tracking-tight text-foreground">
                Running campaigns
              </h2>
              <Link
                to="/dashboard/campaigns"
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                All
                <ArrowRight className="size-3" />
              </Link>
            </div>
            {runningCampaigns.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">
                No campaigns running. Start one from{" "}
                <Link
                  to="/dashboard/campaigns"
                  className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
                >
                  Campaigns
                </Link>
                .
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {runningCampaigns.slice(0, 4).map((campaign) => (
                  <li key={campaign._id} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm font-medium text-foreground">
                        {campaign.name}
                      </p>
                      <StatusBadge
                        label={CAMPAIGN_STATUS_LABELS[campaign.status]}
                        tone={CAMPAIGN_STATUS_TONES[campaign.status]}
                      />
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {campaign.marketCode
                        ? `${campaign.marketFlag ?? ""} ${campaign.marketName ?? campaign.marketCode}${
                            campaign.region ? ` · ${campaign.region}` : ""
                          }`
                        : "No market set"}
                      {campaign.businessCount > 0 &&
                        ` · ${campaign.businessCount} business${
                          campaign.businessCount === 1 ? "" : "es"
                        }`}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section
            aria-label="Quick actions"
            className="rounded-md border border-border bg-card"
          >
            <div className="border-b border-border px-5 py-4">
              <h2 className="font-display text-lg tracking-tight text-foreground">
                Quick actions
              </h2>
            </div>
            <div className="space-y-1 p-3">
              <QuickAction
                icon={Contact}
                label="New business"
                hint="Add to the pipeline"
                onClick={() => openCreate("business")}
              />
              <QuickAction
                icon={Megaphone}
                label="New campaign"
                hint="Target a market and region"
                onClick={() => openCreate("campaign")}
              />
              <QuickAction
                icon={Building2}
                label="New client"
                hint="Add a studio client"
                onClick={() => openCreate("client")}
              />
              <QuickAction
                icon={Globe}
                label="New website project"
                hint="Start a website engagement"
                onClick={() => openCreate("project")}
              />
            </div>
          </section>

          <section
            aria-label="System"
            className="rounded-md border border-border bg-card"
          >
            <div className="border-b border-border px-5 py-4">
              <h2 className="font-display text-lg tracking-tight text-foreground">
                System
              </h2>
            </div>
            <div className="space-y-3 px-5 py-4 text-sm">
              <SystemSummaryRow />
              <Link
                to="/dashboard/system"
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Open system health
                <ArrowRight className="size-3" />
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function PipelineSummaryBars({
  byStage,
  onStageClick,
}: {
  byStage: Record<string, number>;
  onStageClick: (stage: string) => void;
}) {
  const counts = PIPELINE_STAGES.map((stage) => byStage[stage] ?? 0);
  const max = Math.max(1, ...counts);
  return (
    <ul>
      {PIPELINE_STAGES.map((stage, index) => {
        const count = counts[index] ?? 0;
        return (
          <li key={stage}>
            <button
              type="button"
              onClick={() => onStageClick(stage)}
              className="group flex w-full items-center gap-3 rounded-sm py-1 text-left focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
              aria-label={`View ${PIPELINE_STAGE_LABELS[stage]} businesses`}
            >
              <span className="w-28 shrink-0 text-xs text-muted-foreground group-hover:text-foreground">
                {PIPELINE_STAGE_LABELS[stage]}
              </span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <span
                  className={cn(
                    "block h-full rounded-full bg-muted-foreground/50 transition-all group-hover:bg-muted-foreground/70",
                    count === 0 && "w-0",
                  )}
                  style={{ width: `${Math.round((count / max) * 100)}%` }}
                />
              </span>
              <span className="w-8 shrink-0 text-right text-xs tabular-nums text-foreground">
                {count}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function SystemSummaryRow() {
  const meta = useQuery(api.system.meta);
  const db = useQuery(api.system.dbPing);
  const dbOk = db !== undefined && db.ok === true;
  return (
    <dl className="space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <dt className="text-muted-foreground">Database</dt>
        <dd className="flex items-center gap-1.5 font-medium text-foreground">
          <span
            className={`size-1.5 rounded-full ${
              dbOk ? "bg-emerald-600" : "bg-amber-500"
            }`}
            aria-hidden="true"
          />
          {db === undefined ? "Checking…" : dbOk ? "Connected" : "Unreachable"}
        </dd>
      </div>
      <div className="flex items-center justify-between gap-3">
        <dt className="text-muted-foreground">Authentication</dt>
        <dd className="font-medium text-foreground">Email OTP + guest</dd>
      </div>
      <div className="flex items-center justify-between gap-3">
        <dt className="text-muted-foreground">First boot</dt>
        <dd className="font-medium text-foreground">
          {meta?.firstSeenAt
            ? formatRelativeTime(meta.firstSeenAt)
            : "Recording…"}
        </dd>
      </div>
    </dl>
  );
}

function QuickAction({
  icon: Icon,
  label,
  hint,
  onClick,
}: {
  icon: typeof Contact;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-sm px-3 py-2.5 text-left transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-sm border border-border bg-background">
        <Icon className="size-4 text-muted-foreground" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        <span className="block truncate text-xs text-muted-foreground">{hint}</span>
      </span>
      <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
    </button>
  );
}

export default function OverviewPage() {
  return (
    <QueryBoundary
      fallback={(retry) => (
        <ErrorState
          title="Unable to load dashboard data"
          description="The database may be unreachable. Check System health, then retry."
          onRetry={retry}
          className="py-24"
        />
      )}
    >
      <OverviewContent />
    </QueryBoundary>
  );
}
