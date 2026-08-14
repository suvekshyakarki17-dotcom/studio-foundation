import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage } from "@/lib/errors";
import { firstFormError, projectFormSchema } from "@/lib/validation";
import {
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  type ProjectStatus,
} from "@/shared/domain";

/** Sentinel value for the "no client" option in the client Select. */
const NO_CLIENT = "__none__";

interface ProjectFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: Doc<"projects">;
}

export function ProjectFormDialog({
  open,
  onOpenChange,
  project,
}: ProjectFormDialogProps) {
  const isEdit = project !== undefined;
  const createProject = useMutation(api.projects.create);
  const updateProject = useMutation(api.projects.update);
  const clients = useQuery(api.clients.list);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const rawClientId = data.get("clientId");
    const parsed = projectFormSchema.safeParse({
      name: data.get("name"),
      clientId: rawClientId === NO_CLIENT || rawClientId === null ? "" : rawClientId,
      domain: data.get("domain"),
      notes: data.get("notes"),
    });
    if (!parsed.success) {
      setError(firstFormError(parsed.error));
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      if (isEdit && project) {
        const status = (data.get("status") as ProjectStatus | null) ?? project.status;
        // The select value is a client _id string; brand it as an Id at the
        // boundary. "No client" is sent as null to explicitly detach.
        const selectedClientId =
          rawClientId === NO_CLIENT || rawClientId === null
            ? null
            : typeof rawClientId === "string" && rawClientId.length > 0
              ? (rawClientId as Id<"clients">)
              : project.clientId;
        await updateProject({
          id: project._id,
          name: parsed.data.name,
          clientId: selectedClientId,
          domain: parsed.data.domain,
          notes: parsed.data.notes,
          status,
        });
        toast(`Project updated — ${parsed.data.name}`);
      } else {
        await createProject({
          ...parsed.data,
          // Same boundary branding as edit mode; value comes from client ids.
          clientId: parsed.data.clientId as Id<"clients"> | undefined,
        });
        toast(`Project created — ${parsed.data.name}`);
      }
      onOpenChange(false);
    } catch (submitError) {
      const message = getErrorMessage(submitError);
      setError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit project" : "New website project"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the project's details. Changes are written to the database."
              : "Track a website engagement in the studio's pipeline."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="project-name">Project name</Label>
            <Input
              id="project-name"
              name="name"
              placeholder="Acme redesign"
              defaultValue={project?.name}
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="project-client">Client</Label>
              <Select
                name="clientId"
                defaultValue={project?.clientId ?? NO_CLIENT}
              >
                <SelectTrigger id="project-client" className="w-full">
                  <SelectValue placeholder={clients === undefined ? "Loading…" : "No client"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CLIENT}>No client</SelectItem>
                  {(clients ?? []).map((client) => (
                    <SelectItem key={client._id} value={client._id}>
                      {client.company}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="project-domain">Domain</Label>
              <Input
                id="project-domain"
                name="domain"
                placeholder="example.com"
                defaultValue={project?.domain ?? ""}
              />
            </div>
          </div>
          {isEdit && (
            <div className="space-y-1.5">
              <Label htmlFor="project-status">Status</Label>
              <Select name="status" defaultValue={project?.status}>
                <SelectTrigger id="project-status" className="w-full">
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
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="project-notes">Notes</Label>
            <Textarea
              id="project-notes"
              name="notes"
              rows={3}
              placeholder="Scope, milestones, links, …"
              defaultValue={project?.notes ?? ""}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="size-4 animate-spin" />}
              {isEdit ? "Save changes" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
