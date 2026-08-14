import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Globe, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useOutletContext } from "react-router";
import type { StudioOutletContext } from "@/components/studio/app-shell";
import { DeleteConfirm } from "@/components/studio/delete-confirm";
import { PageHeader } from "@/components/studio/page-header";
import { ProjectFormDialog } from "@/components/studio/project-form-dialog";
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
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_TONES,
  type ProjectStatus,
} from "@/shared/domain";

const ALL = "ALL";

function WebsitesContent() {
  const { openCreate } = useOutletContext<StudioOutletContext>();
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | typeof ALL>(
    ALL,
  );
  const [editing, setEditing] = useState<Doc<"projects"> | null>(null);
  const projects = useQuery(api.projects.list, {
    ...(statusFilter === ALL ? {} : { status: statusFilter }),
  });
  const updateProject = useMutation(api.projects.update);
  const removeProject = useMutation(api.projects.remove);

  const handleStatusChange = async (
    project: Doc<"projects">,
    status: ProjectStatus,
  ) => {
    if (status === project.status) return;
    try {
      await updateProject({
        id: project._id,
        name: project.name,
        clientId: project.clientId,
        domain: project.domain,
        notes: project.notes,
        status,
      });
      toast(`Project moved to ${PROJECT_STATUS_LABELS[status]}`);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleDelete = async (project: Doc<"projects">) => {
    await removeProject({ id: project._id });
    toast(`Project deleted — ${project.name}`);
  };

  if (projects === undefined) {
    return <LoadingState label="Loading projects…" className="py-24" />;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Websites"
        description="Website engagements in the studio's pipeline. Every row is a real project in the database."
      >
        <Button type="button" onClick={() => openCreate("project")}>
          <Plus className="size-4" />
          New project
        </Button>
      </PageHeader>

      {projects.length === 0 ? (
        <EmptyState
          icon={Globe}
          title="No website projects yet"
          description="Create a project to track a website engagement from draft to live."
          action={
            <Button type="button" onClick={() => openCreate("project")}>
              <Plus className="size-4" />
              Create your first project
            </Button>
          }
          className="py-20"
        />
      ) : (
        <section
          aria-label="Projects list"
          className="rounded-md border border-border bg-card"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
            <p className="text-sm text-muted-foreground">
              {projects.length} {projects.length === 1 ? "project" : "projects"}
            </p>
            <Select
              value={statusFilter}
              onValueChange={(value) =>
                setStatusFilter(value as ProjectStatus | typeof ALL)
              }
            >
              <SelectTrigger size="sm" aria-label="Filter by status">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All statuses</SelectItem>
                {PROJECT_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {PROJECT_STATUS_LABELS[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Project</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Domain</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map((project) => (
                  <TableRow key={project._id}>
                    <TableCell>
                      <p className="font-medium text-foreground">
                        {project.name}
                      </p>
                      {project.notes && (
                        <p className="max-w-[280px] truncate text-xs text-muted-foreground">
                          {project.notes}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {project.clientName ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {project.domain ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(project._creationTime)}
                    </TableCell>
                    <TableCell>
                      <ProjectStatusSelect
                        value={project.status}
                        onChange={(status) => handleStatusChange(project, status)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => setEditing(project)}
                          aria-label={`Edit ${project.name}`}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <DeleteConfirm
                          title="Delete this project?"
                          description={`"${project.name}" will be permanently removed. This cannot be undone.`}
                          onConfirm={() => handleDelete(project)}
                        >
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-destructive"
                            aria-label={`Delete ${project.name}`}
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
            {projects.map((project) => (
              <li key={project._id} className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{project.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {project.clientName ?? "No client"}
                      {project.domain ? ` · ${project.domain}` : ""}
                    </p>
                  </div>
                  <StatusBadge
                    label={PROJECT_STATUS_LABELS[project.status]}
                    tone={PROJECT_STATUS_TONES[project.status]}
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    {formatDate(project._creationTime)}
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditing(project)}
                    >
                      <Pencil className="size-3.5" />
                      Edit
                    </Button>
                    <DeleteConfirm
                      title="Delete this project?"
                      description={`"${project.name}" will be permanently removed. This cannot be undone.`}
                      onConfirm={() => handleDelete(project)}
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

      <ProjectFormDialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        project={editing ?? undefined}
      />
    </div>
  );
}

function ProjectStatusSelect({
  value,
  onChange,
}: {
  value: ProjectStatus;
  onChange: (status: ProjectStatus) => void;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => onChange(next as ProjectStatus)}
    >
      <SelectTrigger
        size="sm"
        className="min-w-[120px]"
        aria-label={`Status: ${PROJECT_STATUS_LABELS[value]}`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PROJECT_STATUSES.map((status) => (
          <SelectItem key={status} value={status}>
            {PROJECT_STATUS_LABELS[status]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function WebsitesPage() {
  return (
    <QueryBoundary
      fallback={(retry) => (
        <ErrorState
          title="Unable to load projects"
          description="The database may be unreachable. Check System health, then retry."
          onRetry={retry}
          className="py-24"
        />
      )}
    >
      <WebsitesContent />
    </QueryBoundary>
  );
}
