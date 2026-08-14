import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { ArrowRight, Building2, Contact, Globe, Plus } from "lucide-react";
import { Link, useOutletContext } from "react-router";
import { ActivityFeed } from "@/components/studio/activity-feed";
import type { StudioOutletContext } from "@/components/studio/app-shell";
import { MetricCard } from "@/components/studio/metric-card";
import { PageHeader } from "@/components/studio/page-header";
import { QueryBoundary } from "@/components/studio/query-boundary";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/format";
import { ErrorState, LoadingState } from "@/components/studio/states";

function OverviewContent() {
  const { openCreate } = useOutletContext<StudioOutletContext>();
  const leadsStats = useQuery(api.leads.stats);
  const projectsStats = useQuery(api.projects.stats);
  const clientsStats = useQuery(api.clients.stats);
  const providers = useQuery(api.providers.list);

  const loading =
    leadsStats === undefined ||
    projectsStats === undefined ||
    clientsStats === undefined ||
    providers === undefined;

  if (loading) {
    return <LoadingState label="Loading overview…" className="py-24" />;
  }

  const activeProjects =
    projectsStats.total - projectsStats.byStatus.PAUSED - projectsStats.byStatus.ARCHIVED;
  const configuredProviders = providers.filter(
    (provider) => provider.status !== "NOT_CONFIGURED",
  ).length;

  return (
    <div className="space-y-10">
      <PageHeader
        title="Overview"
        description="The current state of your studio, from real data."
      >
        <Button
          type="button"
          variant="outline"
          onClick={() => openCreate("lead")}
        >
          <Plus className="size-4" />
          New lead
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => openCreate("client")}
        >
          <Plus className="size-4" />
          New client
        </Button>
        <Button type="button" onClick={() => openCreate("project")}>
          <Plus className="size-4" />
          New project
        </Button>
      </PageHeader>

      <section aria-label="Metrics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Leads"
          value={leadsStats.total}
          sub={
            leadsStats.total === 0
              ? "No leads yet"
              : `${leadsStats.byStatus.PROPOSAL} in proposal · ${leadsStats.byStatus.WON} won`
          }
        />
        <MetricCard
          label="Active projects"
          value={activeProjects}
          sub={
            activeProjects === 0
              ? "No active projects"
              : `${projectsStats.byStatus.LIVE} live`
          }
        />
        <MetricCard
          label="Clients"
          value={clientsStats.byStatus.ACTIVE}
          sub={
            clientsStats.total === 0
              ? "No clients yet"
              : `${clientsStats.byStatus.ARCHIVED} archived`
          }
        />
        <MetricCard
          label="Integrations"
          value={configuredProviders}
          sub={
            configuredProviders === 0
              ? "None connected — Phase 1"
              : "Configured"
          }
        />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section
          aria-label="Recent activity"
          className="rounded-md border border-border bg-card lg:col-span-2"
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

        <div className="space-y-6">
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
                label="New lead"
                hint="Track a potential engagement"
                onClick={() => openCreate("lead")}
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
        </div>
      </div>
    </div>
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
