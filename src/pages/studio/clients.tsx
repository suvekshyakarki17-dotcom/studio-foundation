import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Building2, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useOutletContext } from "react-router";
import type { StudioOutletContext } from "@/components/studio/app-shell";
import { ClientFormDialog } from "@/components/studio/client-form-dialog";
import { DeleteConfirm } from "@/components/studio/delete-confirm";
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
  CLIENT_STATUSES,
  CLIENT_STATUS_LABELS,
  CLIENT_STATUS_TONES,
  type ClientStatus,
} from "@/shared/domain";

function ClientsContent() {
  const { openCreate } = useOutletContext<StudioOutletContext>();
  const [editing, setEditing] = useState<Doc<"clients"> | null>(null);
  const clients = useQuery(api.clients.list);
  const updateClient = useMutation(api.clients.update);
  const removeClient = useMutation(api.clients.remove);

  const handleStatusChange = async (
    client: Doc<"clients">,
    status: ClientStatus,
  ) => {
    if (status === client.status) return;
    try {
      await updateClient({
        id: client._id,
        company: client.company,
        name: client.name,
        email: client.email,
        phone: client.phone,
        website: client.website,
        notes: client.notes,
        status,
      });
      toast(`Client moved to ${CLIENT_STATUS_LABELS[status]}`);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleDelete = async (client: Doc<"clients">) => {
    await removeClient({ id: client._id });
    toast(`Client deleted — ${client.company}`);
  };

  if (clients === undefined) {
    return <LoadingState label="Loading clients…" className="py-24" />;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Clients"
        description="The studio's clients and their engagements. Deleting a client keeps its projects, unlinked."
      >
        <Button type="button" onClick={() => openCreate("client")}>
          <Plus className="size-4" />
          New client
        </Button>
      </PageHeader>

      {clients.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No clients yet"
          description="Add a client to link projects to a company and keep engagement history in one place."
          action={
            <Button type="button" onClick={() => openCreate("client")}>
              <Plus className="size-4" />
              Create your first client
            </Button>
          }
          className="py-20"
        />
      ) : (
        <section
          aria-label="Clients list"
          className="rounded-md border border-border bg-card"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
            <p className="text-sm text-muted-foreground">
              {clients.length} {clients.length === 1 ? "client" : "clients"}
            </p>
          </div>

          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Company</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Projects</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Since</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.map((client) => (
                  <TableRow key={client._id}>
                    <TableCell>
                      <p className="font-medium text-foreground">
                        {client.company}
                      </p>
                      {client.website && (
                        <p className="max-w-[240px] truncate text-xs text-muted-foreground">
                          {client.website}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {[client.name, client.email].filter(Boolean).join(" · ") ||
                        "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {client.projectsCount}
                    </TableCell>
                    <TableCell>
                      <ClientStatusSelect
                        value={client.status}
                        onChange={(status) => handleStatusChange(client, status)}
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(client._creationTime)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => setEditing(client)}
                          aria-label={`Edit ${client.company}`}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <DeleteConfirm
                          title="Delete this client?"
                          description={`"${client.company}" will be removed. Its projects stay, but they will no longer be linked to a client.`}
                          onConfirm={() => handleDelete(client)}
                        >
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-destructive"
                            aria-label={`Delete ${client.company}`}
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

          <ul className="divide-y divide-border md:hidden">
            {clients.map((client) => (
              <li key={client._id} className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">
                      {client.company}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[client.name, client.email].filter(Boolean).join(" · ") ||
                        "No contact details"}
                    </p>
                  </div>
                  <StatusBadge
                    label={CLIENT_STATUS_LABELS[client.status]}
                    tone={CLIENT_STATUS_TONES[client.status]}
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    {client.projectsCount}{" "}
                    {client.projectsCount === 1 ? "project" : "projects"} ·{" "}
                    {formatDate(client._creationTime)}
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditing(client)}
                    >
                      <Pencil className="size-3.5" />
                      Edit
                    </Button>
                    <DeleteConfirm
                      title="Delete this client?"
                      description={`"${client.company}" will be removed. Its projects stay, but they will no longer be linked to a client.`}
                      onConfirm={() => handleDelete(client)}
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

      <ClientFormDialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        client={editing ?? undefined}
      />
    </div>
  );
}

function ClientStatusSelect({
  value,
  onChange,
}: {
  value: ClientStatus;
  onChange: (status: ClientStatus) => void;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => onChange(next as ClientStatus)}
    >
      <SelectTrigger
        size="sm"
        className="min-w-[110px]"
        aria-label={`Status: ${CLIENT_STATUS_LABELS[value]}`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {CLIENT_STATUSES.map((status) => (
          <SelectItem key={status} value={status}>
            {CLIENT_STATUS_LABELS[status]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function ClientsPage() {
  return (
    <QueryBoundary
      fallback={(retry) => (
        <ErrorState
          title="Unable to load clients"
          description="The database may be unreachable. Check System health, then retry."
          onRetry={retry}
          className="py-24"
        />
      )}
    >
      <ClientsContent />
    </QueryBoundary>
  );
}
