import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { useMutation } from "convex/react";
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
import { clientFormSchema, firstFormError } from "@/lib/validation";
import {
  CLIENT_STATUSES,
  CLIENT_STATUS_LABELS,
  type ClientStatus,
} from "@/shared/domain";

interface ClientFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client?: Doc<"clients">;
}

export function ClientFormDialog({
  open,
  onOpenChange,
  client,
}: ClientFormDialogProps) {
  const isEdit = client !== undefined;
  const createClient = useMutation(api.clients.create);
  const updateClient = useMutation(api.clients.update);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const parsed = clientFormSchema.safeParse({
      company: data.get("company"),
      name: data.get("name"),
      email: data.get("email"),
      phone: data.get("phone"),
      website: data.get("website"),
      notes: data.get("notes"),
    });
    if (!parsed.success) {
      setError(firstFormError(parsed.error));
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      if (isEdit && client) {
        const status = (data.get("status") as ClientStatus | null) ?? client.status;
        await updateClient({ id: client._id, ...parsed.data, status });
        toast(`Client updated — ${parsed.data.company}`);
      } else {
        await createClient(parsed.data);
        toast(`Client created — ${parsed.data.company}`);
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
          <DialogTitle>{isEdit ? "Edit client" : "New client"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the client's details. Changes are written to the database."
              : "Add a client of the studio."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="client-company">Company</Label>
            <Input
              id="client-company"
              name="company"
              placeholder="Northwind"
              defaultValue={client?.company}
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="client-name">Contact name</Label>
              <Input
                id="client-name"
                name="name"
                placeholder="Jane Doe"
                defaultValue={client?.name ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="client-email">Email</Label>
              <Input
                id="client-email"
                name="email"
                type="email"
                placeholder="jane@example.com"
                defaultValue={client?.email ?? ""}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="client-phone">Phone</Label>
              <Input
                id="client-phone"
                name="phone"
                placeholder="+1 555 0100"
                defaultValue={client?.phone ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="client-website">Website</Label>
              <Input
                id="client-website"
                name="website"
                placeholder="https://example.com"
                defaultValue={client?.website ?? ""}
              />
            </div>
          </div>
          {isEdit && (
            <div className="space-y-1.5">
              <Label htmlFor="client-status">Status</Label>
              <Select name="status" defaultValue={client?.status}>
                <SelectTrigger id="client-status" className="w-full">
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
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="client-notes">Notes</Label>
            <Textarea
              id="client-notes"
              name="notes"
              rows={3}
              placeholder="Engagement notes, preferences, …"
              defaultValue={client?.notes ?? ""}
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
              {isEdit ? "Save changes" : "Create client"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
