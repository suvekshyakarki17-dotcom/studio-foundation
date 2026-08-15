import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
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
import {
  campaignEditSchema,
  campaignFormSchema,
  firstFormError,
} from "@/lib/validation";
import {
  CAMPAIGN_STATUSES,
  CAMPAIGN_STATUS_LABELS,
  KNOWN_MARKETS,
  type CampaignStatus,
} from "@/shared/domain";

interface CampaignFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign?: Doc<"campaigns">;
}

export function CampaignFormDialog({
  open,
  onOpenChange,
  campaign,
}: CampaignFormDialogProps) {
  const isEdit = campaign !== undefined;
  const createCampaign = useMutation(api.campaigns.create);
  const updateCampaign = useMutation(api.campaigns.update);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [marketCode, setMarketCode] = useState("");
  const [region, setRegion] = useState("");
  const [status, setStatus] = useState<CampaignStatus>("DRAFT");

  // Reset the form whenever the dialog opens (create or a different edit).
  useEffect(() => {
    if (!open) return;
    setMarketCode(campaign?.marketCode ?? "");
    setRegion(campaign?.region ?? "");
    setStatus(campaign?.status ?? "DRAFT");
    setError(null);
  }, [open, campaign]);

  const selectedMarket = KNOWN_MARKETS.find((market) => market.code === marketCode);

  /** Map the \"__none__\" sentinel item back to an empty (unset) value. */
  const none = (value: string) => (value === "__none__" ? "" : value);

  const handleMarketChange = (value: string) => {
    setMarketCode(none(value));
    setRegion(""); // regions belong to a market; reset when it changes
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const fields = {
      name: data.get("name"),
      description: data.get("description"),
      marketCode,
      region,
      targetKeywords: data.get("targetKeywords"),
    };
    const parsed = (isEdit ? campaignEditSchema : campaignFormSchema).safeParse({
      ...fields,
      ...(isEdit ? { status } : {}),
    });
    if (!parsed.success) {
      setError(firstFormError(parsed.error));
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      if (isEdit && campaign) {
        await updateCampaign({
          id: campaign._id,
          name: parsed.data.name,
          description: parsed.data.description,
          marketCode: parsed.data.marketCode,
          region: parsed.data.region,
          targetKeywords: parsed.data.targetKeywords,
          status,
        });
        toast(`Campaign updated — ${parsed.data.name}`);
      } else {
        await createCampaign({
          name: parsed.data.name,
          description: parsed.data.description,
          marketCode: parsed.data.marketCode,
          region: parsed.data.region,
          targetKeywords: parsed.data.targetKeywords,
        });
        toast(`Campaign created — ${parsed.data.name}`);
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
          <DialogTitle>{isEdit ? "Edit campaign" : "New campaign"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the campaign's details. Changes are written to the database."
              : "Define a market and region to target. The campaign is a real record you drive — no automation runs it yet."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="campaign-name">Name</Label>
            <Input
              id="campaign-name"
              name="name"
              placeholder="Spring local-business outreach"
              defaultValue={campaign?.name}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="campaign-description">Description</Label>
            <Textarea
              id="campaign-description"
              name="description"
              rows={3}
              placeholder="What this campaign is trying to accomplish."
              defaultValue={campaign?.description ?? ""}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Market</Label>
              <Select value={marketCode} onValueChange={handleMarketChange}>
                <SelectTrigger aria-label="Market">
                  <SelectValue placeholder="No market" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No market</SelectItem>
                  {KNOWN_MARKETS.map((market) => (
                    <SelectItem key={market.code} value={market.code}>
                      {market.flag} {market.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Region</Label>
              <Select
                value={region}
                onValueChange={(value) => setRegion(none(value))}
                disabled={!selectedMarket}
              >
                <SelectTrigger aria-label="Region" disabled={!selectedMarket}>
                  <SelectValue
                    placeholder={selectedMarket ? "Select a region" : "Pick a market first"}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No region</SelectItem>
                  {selectedMarket?.regions.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="campaign-keywords">Target keywords</Label>
            <Input
              id="campaign-keywords"
              name="targetKeywords"
              placeholder="plumber, HVAC, landscaping, …"
              defaultValue={campaign?.targetKeywords ?? ""}
            />
            <p className="text-xs text-muted-foreground">
              Comma-separated terms describing the businesses this campaign targets.
            </p>
          </div>
          {isEdit && (
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={status}
                onValueChange={(value) => setStatus(value as CampaignStatus)}
              >
                <SelectTrigger aria-label="Campaign status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CAMPAIGN_STATUSES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {CAMPAIGN_STATUS_LABELS[item]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
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
              {isEdit ? "Save changes" : "Create campaign"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
