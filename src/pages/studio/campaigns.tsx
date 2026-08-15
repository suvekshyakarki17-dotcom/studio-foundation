import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Megaphone, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useOutletContext } from "react-router";
import type { StudioOutletContext } from "@/components/studio/app-shell";
import { CampaignFormDialog } from "@/components/studio/campaign-form-dialog";
import { DeleteConfirm } from "@/components/studio/delete-confirm";
import { MetricCard } from "@/components/studio/metric-card";
import { PageHeader } from "@/components/studio/page-header";
import { QueryBoundary } from "@/components/studio/query-boundary";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/studio/states";
import { Button } from "@/components/ui/button";
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
  CAMPAIGN_STATUSES,
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_STATUS_TONES,
  type CampaignStatus,
} from "@/shared/domain";
import { StatusBadge } from "@/components/studio/status-badge";

const ALL = "ALL";

function CampaignsContent() {
  const { openCreate } = useOutletContext<StudioOutletContext>();
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | typeof ALL>(
    ALL,
  );
  const [editing, setEditing] = useState<Doc<"campaigns"> | null>(null);
  const campaigns = useQuery(api.campaigns.list, {
    ...(statusFilter === ALL ? {} : { status: statusFilter }),
  });
  const stats = useQuery(api.campaigns.stats);
  const updateCampaign = useMutation(api.campaigns.update);
  const removeCampaign = useMutation(api.campaigns.remove);

  const handleStatusChange = async (
    campaign: Doc<"campaigns">,
    status: CampaignStatus,
  ) => {
    if (status === campaign.status) return;
    try {
      await updateCampaign({
        id: campaign._id,
        name: campaign.name,
        description: campaign.description,
        marketCode: campaign.marketCode,
        region: campaign.region,
        targetKeywords: campaign.targetKeywords,
        status,
      });
      toast(`Campaign moved to ${CAMPAIGN_STATUS_LABELS[status]}`);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleDelete = async (campaign: Doc<"campaigns">) => {
    await removeCampaign({ id: campaign._id });
    toast(`Campaign deleted — ${campaign.name}`);
  };

  if (campaigns === undefined || stats === undefined) {
    return <LoadingState label="Loading campaigns…" className="py-24" />;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Campaigns"
        description="Outreach and discovery efforts, each targeting a market and region. Campaigns are operator-driven records — automation arrives in a later phase."
      >
        <Button type="button" onClick={() => openCreate("campaign")}>
          <Plus className="size-4" />
          New campaign
        </Button>
      </PageHeader>

      <section
        aria-label="Campaign metrics"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <MetricCard
          label="Campaigns"
          value={stats.total}
          sub={
            stats.total === 0
              ? "No campaigns yet"
              : `${stats.byStatus.COMPLETED} completed · ${stats.byStatus.CANCELLED} cancelled`
          }
        />
        <MetricCard
          label="Running"
          value={stats.running}
          sub={`${stats.byStatus.READY} ready to start`}
        />
        <MetricCard
          label="Markets covered"
          value={stats.marketsCovered}
          sub="Distinct markets targeted"
        />
        <MetricCard
          label="Businesses attached"
          value={stats.attachedBusinesses}
          sub="Linked to a campaign"
        />
      </section>

      {campaigns.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No campaigns yet"
          description="Create a campaign to organize discovery and outreach around a market and region. Businesses you add can be attached to it."
          action={
            <Button type="button" onClick={() => openCreate("campaign")}>
              <Plus className="size-4" />
              Create your first campaign
            </Button>
          }
          className="py-20"
        />
      ) : (
        <section
          aria-label="Campaigns list"
          className="rounded-md border border-border bg-card"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
            <p className="text-sm text-muted-foreground">
              {campaigns.length} {campaigns.length === 1 ? "campaign" : "campaigns"}
            </p>
            <Select
              value={statusFilter}
              onValueChange={(value) =>
                setStatusFilter(value as CampaignStatus | typeof ALL)
              }
            >
              <SelectTrigger size="sm" aria-label="Filter by status">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All statuses</SelectItem>
                {CAMPAIGN_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {CAMPAIGN_STATUS_LABELS[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Desktop table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Campaign</TableHead>
                  <TableHead>Target market</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Businesses</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((campaign) => (
                  <TableRow key={campaign._id}>
                    <TableCell>
                      <p className="font-medium text-foreground">
                        {campaign.name}
                      </p>
                      {campaign.targetKeywords && (
                        <p className="max-w-[260px] truncate text-xs text-muted-foreground">
                          {campaign.targetKeywords}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {campaign.marketCode
                        ? `${campaign.marketFlag ?? ""} ${campaign.marketName ?? campaign.marketCode}${
                            campaign.region ? ` · ${campaign.region}` : ""
                          }`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <CampaignStatusSelect
                        value={campaign.status}
                        onChange={(status) => handleStatusChange(campaign, status)}
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {campaign.businessCount}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatRelativeTime(campaign.updatedAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => setEditing(campaign)}
                          aria-label={`Edit ${campaign.name}`}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <DeleteConfirm
                          title="Delete this campaign?"
                          description={`"${campaign.name}" will be removed. Businesses attached to it stay, but they will no longer be linked to a campaign.`}
                          onConfirm={() => handleDelete(campaign)}
                        >
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-destructive"
                            aria-label={`Delete ${campaign.name}`}
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
            {campaigns.map((campaign) => (
              <li key={campaign._id} className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">
                      {campaign.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {campaign.marketCode
                        ? `${campaign.marketFlag ?? ""} ${campaign.marketName ?? campaign.marketCode}${
                            campaign.region ? ` · ${campaign.region}` : ""
                          }`
                        : "No market"}
                    </p>
                  </div>
                  <StatusBadge
                    label={CAMPAIGN_STATUS_LABELS[campaign.status]}
                    tone={CAMPAIGN_STATUS_TONES[campaign.status]}
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    {campaign.businessCount}{" "}
                    {campaign.businessCount === 1 ? "business" : "businesses"} ·{" "}
                    {formatRelativeTime(campaign.updatedAt)}
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditing(campaign)}
                    >
                      <Pencil className="size-3.5" />
                      Edit
                    </Button>
                    <DeleteConfirm
                      title="Delete this campaign?"
                      description={`"${campaign.name}" will be removed. Businesses attached to it stay, but they will no longer be linked to a campaign.`}
                      onConfirm={() => handleDelete(campaign)}
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                        Delete
                      </Button>
                    </DeleteConfirm>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <CampaignFormDialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        campaign={editing ?? undefined}
      />
    </div>
  );
}

function CampaignStatusSelect({
  value,
  onChange,
}: {
  value: CampaignStatus;
  onChange: (status: CampaignStatus) => void;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => onChange(next as CampaignStatus)}
    >
      <SelectTrigger
        size="sm"
        className="min-w-[120px]"
        aria-label={`Status: ${CAMPAIGN_STATUS_LABELS[value]}`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {CAMPAIGN_STATUSES.map((status) => (
          <SelectItem key={status} value={status}>
            {CAMPAIGN_STATUS_LABELS[status]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function CampaignsPage() {
  return (
    <QueryBoundary
      fallback={(retry) => (
        <ErrorState
          title="Unable to load campaigns"
          description="The database may be unreachable. Check System health, then retry."
          onRetry={retry}
          className="py-24"
        />
      )}
    >
      <CampaignsContent />
    </QueryBoundary>
  );
}
