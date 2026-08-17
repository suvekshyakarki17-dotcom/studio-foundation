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
import {
  DEFAULT_WEBSITE_TARGET,
  WEBSITE_TARGET_LABELS,
  WEBSITE_TARGETS,
  type WebsiteTarget,
} from "@/shared/discovery";

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
  const [websiteTarget, setWebsiteTarget] = useState<WebsiteTarget>(
    DEFAULT_WEBSITE_TARGET,
  );
  const [minimumOpportunity, setMinimumOpportunity] = useState<string>("");

  // Reset the form whenever the dialog opens (create or a different edit).
  useEffect(() => {
    if (!open) return;
    setMarketCode(campaign?.marketCode ?? "");
    setRegion(campaign?.region ?? "");
    setStatus(campaign?.status ?? "DRAFT");
    setWebsiteTarget(campaign?.websiteTarget ?? DEFAULT_WEBSITE_TARGET);
    setMinimumOpportunity(campaign?.minimumOpportunity ?? "");
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
      city: data.get("city"),
      category: data.get("category"),
      targetCount: data.get("targetCount"),
      targetKeywords: data.get("targetKeywords"),
      websiteTarget,
      minimumOpportunity:
        minimumOpportunity === "" ? undefined : minimumOpportunity,
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
          city: parsed.data.city,
          category: parsed.data.category,
          targetCount: parsed.data.targetCount,
          targetKeywords: parsed.data.targetKeywords,
          websiteTarget: parsed.data.websiteTarget,
          minimumOpportunity: parsed.data.minimumOpportunity,
          status,
        });
        toast(`Campaign updated — ${parsed.data.name}`);
      } else {
        await createCampaign({
          name: parsed.data.name,
          description: parsed.data.description,
          marketCode: parsed.data.marketCode,
          region: parsed.data.region,
          city: parsed.data.city,
          category: parsed.data.category,
          targetCount: parsed.data.targetCount,
          targetKeywords: parsed.data.targetKeywords,
          websiteTarget: parsed.data.websiteTarget,
          minimumOpportunity: parsed.data.minimumOpportunity,
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
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="campaign-city">Location (city)</Label>
              <Input
                id="campaign-city"
                name="city"
                placeholder="Miami"
                defaultValue={campaign?.city ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="campaign-category">Business category</Label>
              <Input
                id="campaign-category"
                name="category"
                placeholder="Restaurants"
                defaultValue={campaign?.category ?? ""}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="campaign-target-count">Target count</Label>
            <Input
              id="campaign-target-count"
              name="targetCount"
              type="number"
              min={1}
              step={1}
              placeholder="100"
              defaultValue={campaign?.targetCount ?? ""}
            />
            <p className="text-xs text-muted-foreground">
              How many businesses the discovery engine should aim for. Together
              with market, region, location, and category, this makes the
              campaign ready to start discovery.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Website target</Label>
            <Select
              value={websiteTarget}
              onValueChange={(value) => setWebsiteTarget(value as WebsiteTarget)}
            >
              <SelectTrigger aria-label="Website target">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEBSITE_TARGETS.map((target) => (
                  <SelectItem key={target} value={target}>
                    {WEBSITE_TARGET_LABELS[target]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs leading-5 text-muted-foreground">
              No website only: only businesses positively confirmed to have no
              official website qualify (the strict default). Any website state:
              every discovered business qualifies regardless of its site.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Minimum opportunity</Label>
            <Select
              value={minimumOpportunity}
              onValueChange={(value) =>
                setMinimumOpportunity(value === "__none__" ? "" : value)
              }
            >
              <SelectTrigger aria-label="Minimum opportunity tier">
                <SelectValue placeholder="Any opportunity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Any opportunity</SelectItem>
                <SelectItem value="VERY_HIGH">Very high</SelectItem>
                <SelectItem value="HIGH">High</SelectItem>
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="LOW">Low</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs leading-5 text-muted-foreground">
              Optional floor for the opportunity tier you want to work — a
              filter on the qualified list, never a claim about the business.
            </p>
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
