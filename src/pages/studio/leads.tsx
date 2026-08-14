import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Contact, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useOutletContext } from "react-router";
import { DeleteConfirm } from "@/components/studio/delete-confirm";
import type { StudioOutletContext } from "@/components/studio/app-shell";
import { LeadFormDialog } from "@/components/studio/lead-form-dialog";
import { PageHeader } from "@/components/studio/page-header";
import { QueryBoundary } from "@/components/studio/query-boundary";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/studio/states";
import { StatusBadge } from "@/components/studio/status-badge";
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
import { formatDate } from "@/lib/format";
import {
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  LEAD_STATUS_TONES,
  type LeadStatus,
} from "@/shared/domain";

const ALL = "ALL";

function LeadsContent() {
  const { openCreate } = useOutletContext<StudioOutletContext>();
  const [statusFilter, setStatusFilter] = useState<LeadStatus | typeof ALL>(ALL);
  const [editing, setEditing] = useState<Doc<"leads"> | null>(null);
  const leads = useQuery(api.leads.list, {
    ...(statusFilter === ALL ? {} : { status: statusFilter }),
  });
  const updateLead = useMutation(api.leads.update);
  const removeLead = useMutation(api.leads.remove);

  const handleStatusChange = async (lead: Doc<"leads">, status: LeadStatus) => {
    if (status === lead.status) return;
    try {
      await updateLead({
        id: lead._id,
        company: lead.company,
        name: lead.name,
        email: lead.email,
        website: lead.website,
        source: lead.source,
        notes: lead.notes,
        status,
      });
      toast(`Lead moved to ${LEAD_STATUS_LABELS[status]}`);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleDelete = async (lead: Doc<"leads">) => {
    await removeLead({ id: lead._id });
    toast(`Lead deleted — ${lead.company}`);
  };

  if (leads === undefined) {
    return <LoadingState label="Loading leads…" className="py-24" />;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Leads"
        description="Businesses you're tracking as potential engagements. Metrics and lists come straight from the database."
      >
        <Button type="button" onClick={() => openCreate("lead")}>
          <Plus className="size-4" />
          New lead
        </Button>
      </PageHeader>

      {leads.length === 0 ? (
        <EmptyState
          icon={Contact}
          title="No leads yet"
          description="Create your first lead to start tracking a potential engagement. It will appear here and in the activity log."
          action={
            <Button type="button" onClick={() => openCreate("lead")}>
              <Plus className="size-4" />
              Create your first lead
            </Button>
          }
          className="py-20"
        />
      ) : (
        <section
          aria-label="Leads list"
          className="rounded-md border border-border bg-card"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
            <p className="text-sm text-muted-foreground">
              {leads.length} {leads.length === 1 ? "lead" : "leads"}
            </p>
            <Select
              value={statusFilter}
              onValueChange={(value) =>
                setStatusFilter(value as LeadStatus | typeof ALL)
              }
            >
              <SelectTrigger size="sm" aria-label="Filter by status">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All statuses</SelectItem>
                {LEAD_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {LEAD_STATUS_LABELS[status]}
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
                  <TableHead>Company</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map((lead) => (
                  <TableRow key={lead._id}>
                    <TableCell>
                      <p className="font-medium text-foreground">{lead.company}</p>
                      <p className="text-xs text-muted-foreground">
                        {[lead.name, lead.email].filter(Boolean).join(" · ") ||
                          "No contact details"}
                      </p>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {lead.source || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(lead._creationTime)}
                    </TableCell>
                    <TableCell>
                      <LeadStatusSelect
                        value={lead.status}
                        onChange={(status) => handleStatusChange(lead, status)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => setEditing(lead)}
                          aria-label={`Edit ${lead.company}`}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <DeleteConfirm
                          title="Delete this lead?"
                          description={`"${lead.company}" will be permanently removed. This cannot be undone.`}
                          onConfirm={() => handleDelete(lead)}
                        >
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-destructive"
                            aria-label={`Delete ${lead.company}`}
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
            {leads.map((lead) => (
              <li key={lead._id} className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{lead.company}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[lead.name, lead.email].filter(Boolean).join(" · ") ||
                        "No contact details"}
                    </p>
                  </div>
                  <StatusBadge
                    label={LEAD_STATUS_LABELS[lead.status]}
                    tone={LEAD_STATUS_TONES[lead.status]}
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    {lead.source ? `${lead.source} · ` : ""}
                    {formatDate(lead._creationTime)}
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditing(lead)}
                    >
                      <Pencil className="size-3.5" />
                      Edit
                    </Button>
                    <DeleteConfirm
                      title="Delete this lead?"
                      description={`"${lead.company}" will be permanently removed. This cannot be undone.`}
                      onConfirm={() => handleDelete(lead)}
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

      <LeadFormDialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        lead={editing ?? undefined}
      />
    </div>
  );
}

function LeadStatusSelect({
  value,
  onChange,
}: {
  value: LeadStatus;
  onChange: (status: LeadStatus) => void;
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as LeadStatus)}>
      <SelectTrigger size="sm" className="min-w-[120px]" aria-label={`Status: ${LEAD_STATUS_LABELS[value]}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {LEAD_STATUSES.map((status) => (
          <SelectItem key={status} value={status}>
            {LEAD_STATUS_LABELS[status]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function LeadsPage() {
  return (
    <QueryBoundary
      fallback={(retry) => (
        <ErrorState
          title="Unable to load leads"
          description="The database may be unreachable. Check System health, then retry."
          onRetry={retry}
          className="py-24"
        />
      )}
    >
      <LeadsContent />
    </QueryBoundary>
  );
}
