import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { ArrowRight, Map as MapIcon, Plus } from "lucide-react";
import { Link, useOutletContext } from "react-router";
import type { StudioOutletContext } from "@/components/studio/app-shell";
import { MetricCard } from "@/components/studio/metric-card";
import { PageHeader } from "@/components/studio/page-header";
import { QueryBoundary } from "@/components/studio/query-boundary";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/studio/states";
import { StatusBadge } from "@/components/studio/status-badge";
import { Button } from "@/components/ui/button";

function MarketsContent() {
  const { openCreate } = useOutletContext<StudioOutletContext>();
  const markets = useQuery(api.markets.overview);

  if (markets === undefined) {
    return <LoadingState label="Loading markets…" className="py-24" />;
  }

  const totalRegions = markets.reduce(
    (sum, market) => sum + market.regions.length,
    0,
  );
  const totalCampaigns = markets.reduce(
    (sum, market) => sum + market.campaignCount,
    0,
  );
  const totalBusinesses = markets.reduce(
    (sum, market) => sum + market.businessCount,
    0,
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="Markets"
        description="The studio's market catalog — where campaigns target and businesses are tracked. Every count below comes from the database."
      >
        <Button type="button" onClick={() => openCreate("campaign")}>
          <Plus className="size-4" />
          New campaign
        </Button>
      </PageHeader>

      <section
        aria-label="Market coverage"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <MetricCard
          label="Markets"
          value={markets.length}
          sub={
            markets.length === 0
              ? "Catalog seeds on first boot"
              : "Countries in the catalog"
          }
        />
        <MetricCard
          label="Regions"
          value={totalRegions}
          sub="Targetable regions across markets"
        />
        <MetricCard
          label="Campaigns targeting"
          value={totalCampaigns}
          sub={
            totalCampaigns === 0
              ? "No campaigns yet"
              : `${markets.reduce(
                  (sum, market) => sum + market.runningCampaigns,
                  0,
                )} running right now`
          }
        />
        <MetricCard
          label="Businesses tracked"
          value={totalBusinesses}
          sub={
            totalBusinesses === 0
              ? "No businesses tagged yet"
              : `${markets.reduce(
                  (sum, market) => sum + market.engagedBusinesses,
                  0,
                )} engaged`
          }
        />
      </section>

      {markets.length === 0 ? (
        <EmptyState
          icon={MapIcon}
          title="No markets in the catalog"
          description="The market catalog seeds itself on first boot. If this stays empty, check System health — the database may not be reachable."
          className="py-20"
        />
      ) : (
        <section
          aria-label="Markets list"
          className="grid grid-cols-1 gap-4 lg:grid-cols-2"
        >
          {markets.map((market) => (
            <article
              key={market.code}
              className="flex flex-col rounded-md border border-border bg-card"
            >
              <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="flex size-10 shrink-0 items-center justify-center rounded-sm border border-border bg-background text-xl"
                    aria-hidden="true"
                  >
                    {market.flag}
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate font-display text-lg tracking-tight text-foreground">
                      {market.name}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {market.country} · {market.code}
                    </p>
                  </div>
                </div>
                {market.runningCampaigns > 0 && (
                  <StatusBadge
                    label={`${market.runningCampaigns} running`}
                    tone="success"
                  />
                )}
              </div>

              <dl className="grid grid-cols-3 divide-x divide-border border-b border-border">
                <MarketStat
                  label="Campaigns"
                  value={market.campaignCount}
                />
                <MarketStat label="Businesses" value={market.businessCount} />
                <MarketStat
                  label="Engaged"
                  value={market.engagedBusinesses}
                />
              </dl>

              <div className="flex-1 px-5 py-4">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  Regions
                </p>
                {market.regions.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    No regions listed yet.
                  </p>
                ) : (
                  <ul className="mt-2.5 flex flex-wrap gap-1.5">
                    {market.regions.slice(0, 5).map((region) => (
                      <li
                        key={region}
                        className="rounded-sm border border-border px-2 py-0.5 text-xs text-muted-foreground"
                      >
                        {region}
                      </li>
                    ))}
                    {market.regions.length > 5 && (
                      <li className="rounded-sm border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground/70">
                        +{market.regions.length - 5} more
                      </li>
                    )}
                  </ul>
                )}
              </div>

              <div className="flex items-center gap-1 border-t border-border px-3 py-2.5">
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Link
                    to={`/dashboard/pipeline?market=${market.code}`}
                    aria-label={`View ${market.name} businesses in the pipeline`}
                  >
                    View pipeline
                    <ArrowRight className="size-3.5" />
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Link
                    to={`/dashboard/campaigns?market=${market.code}`}
                    aria-label={`View campaigns targeting ${market.name}`}
                  >
                    View campaigns
                    <ArrowRight className="size-3.5" />
                  </Link>
                </Button>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}

function MarketStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-4 py-3">
      <dt className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 font-display text-xl tabular-nums tracking-tight text-foreground">
        {value}
      </dd>
    </div>
  );
}

export default function MarketsPage() {
  return (
    <QueryBoundary
      fallback={(retry) => (
        <ErrorState
          title="Unable to load markets"
          description="The database may be unreachable. Check System health, then retry."
          onRetry={retry}
          className="py-24"
        />
      )}
    >
      <MarketsContent />
    </QueryBoundary>
  );
}
