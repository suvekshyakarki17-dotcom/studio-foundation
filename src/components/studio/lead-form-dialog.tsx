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
import { firstFormError, leadFormSchema } from "@/lib/validation";
import {
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  type LeadStatus,
} from "@/shared/domain";

interface LeadFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead?: Doc<"leads">;
}

export function LeadFormDialog({ open, onOpenChange, lead }: LeadFormDialogProps) {
  const isEdit = lead !== undefined;
  const createLead = useMutation(api.leads.create);
  const updateLead = useMutation(api.leads.update);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const parsed = leadFormSchema.safeParse({
      company: data.get("company"),
      name: data.get("name"),
      email: data.get("email"),
      website: data.get("website"),
      source: data.get("source"),
      notes: data.get("notes"),
    });
    if (!parsed.success) {
      setError(firstFormError(parsed.error));
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      if (isEdit && lead) {
        const status = (data.get("status") as LeadStatus | null) ?? lead.status;
        await updateLead({ id: lead._id, ...parsed.data, status });
        toast(`Lead updated — ${parsed.data.company}`);
      } else {
        await createLead(parsed.data);
        toast(`Lead created — ${parsed.data.company}`);
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
          <DialogTitle>{isEdit ? "Edit lead" : "New lead"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the lead's details. Changes are written to the database."
              : "Record a business you're tracking as a potential engagement."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="lead-company">Company</Label>
            <Input
              id="lead-company"
              name="company"
              placeholder="Acme Studio"
              defaultValue={lead?.company}
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="lead-name">Contact name</Label>
              <Input
                id="lead-name"
                name="name"
                placeholder="Jane Doe"
                defaultValue={lead?.name ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lead-email">Email</Label>
              <Input
                id="lead-email"
                name="email"
                type="email"
                placeholder="jane@example.com"
                defaultValue={lead?.email ?? ""}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="lead-website">Website</Label>
              <Input
                id="lead-website"
                name="website"
                placeholder="https://example.com"
                defaultValue={lead?.website ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lead-source">Source</Label>
              <Input
                id="lead-source"
                name="source"
                placeholder="Directory, referral, …"
                defaultValue={lead?.source ?? ""}
              />
            </div>
          </div>
          {isEdit && (
            <div className="space-y-1.5">
              <Label htmlFor="lead-status">Status</Label>
              <Select name="status" defaultValue={lead?.status}>
                <SelectTrigger id="lead-status" className="w-full">
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
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="lead-notes">Notes</Label>
            <Textarea
              id="lead-notes"
              name="notes"
              rows={3}
              placeholder="Anything worth remembering about this business."
              defaultValue={lead?.notes ?? ""}
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
              {isEdit ? "Save changes" : "Create lead"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
