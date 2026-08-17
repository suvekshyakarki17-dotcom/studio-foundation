import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
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
import { StatusBadge } from "@/components/studio/status-badge";
import { getErrorMessage } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import {
  businessEditSchema,
  businessFormSchema,
  firstFormError,
} from "@/lib/validation";
import {
  BUSINESS_SOURCES,
  BUSINESS_SOURCE_LABELS,
  KNOWN_MARKETS,
  PIPELINE_STAGES,
  PIPELINE_STAGE_LABELS,
  WEBSITE_STATES,
  WEBSITE_STATE_LABELS,
  type BusinessSource,
  type PipelineStage,
  type WebsiteState,
} from "@/shared/domain";
import {
  LEAD_QUALIFICATION_LABELS,
  LEAD_QUALIFICATION_TONES,
  WEBSITE_REACHABILITY_LABELS,
  WEBSITE_REACHABILITY_TONES,
  type LeadQualification,
  type WebsiteReachabilityState,
} from "@/shared/discovery";

interface BusinessFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  business?: Doc<"businesses">;
}

function ReachabilityBadge({ status }: { status: WebsiteReachabilityState }) {
  return (
    <StatusBadge
      label={WEBSITE_REACHABILITY_LABELS[status]}
      tone={WEBSITE_REACHABILITY_TONES[status]}
    />
  );
}

/**
 * The strict no-website gate badge. Only QUALIFIED rows are no-website
 * leads; the reason is always attached so the operator can see exactly
 * why a business was or was not qualified.
 */
function QualificationBadge({
  qualification,
  reason,
}: {
  qualification: LeadQualification | undefined;
  reason?: string;
}) {
  if (qualification === undefined) {
    return (
      <span title="Verification has not run for this business yet">
        <StatusBadge label="Pending verification" tone="neutral" />
      </span>
    );
  }
  const label =
    qualification === "QUALIFIED"
      ? "No website — verified"
      : qualification === "REJECTED_HAS_WEBSITE"
        ? "Has website — rejected"
        : LEAD_QUALIFICATION_LABELS[qualification];
  return (
    <span title={reason ?? LEAD_QUALIFICATION_LABELS[qualification]}>
      <StatusBadge
        label={label}
        tone={LEAD_QUALIFICATION_TONES[qualification]}
      />
    </span>
  );
}

export function BusinessFormDialog({
  open,
  onOpenChange,
  business,
}: BusinessFormDialogProps) {
  const isEdit = business !== undefined;
  const createBusiness = useMutation(api.businesses.create);
  const updateBusiness = useMutation(api.businesses.update);
  const campaigns = useQuery(api.campaigns.list, {});

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [websiteState, setWebsiteState] = useState<WebsiteState>("UNKNOWN");
  const [source, setSource] = useState<BusinessSource>("MANUAL");
  const [marketCode, setMarketCode] = useState("");
  const [region, setRegion] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [score, setScore] = useState("");
  const [stage, setStage] = useState<PipelineStage>("DISCOVERED");

  // Reset the form whenever the dialog opens (create or a different edit).
  useEffect(() => {
    if (!open) return;
    setWebsiteState(business?.websiteState ?? "UNKNOWN");
    setSource(business?.source ?? "MANUAL");
    setMarketCode(business?.marketCode ?? "");
    setRegion(business?.region ?? "");
    setCampaignId(business?.campaignId ?? "");
    setScore(business?.score != null ? String(business.score) : "");
    setStage(business?.stage ?? "DISCOVERED");
    setError(null);
  }, [open, business]);

  const selectedMarket = KNOWN_MARKETS.find((market) => market.code === marketCode);

  /** Map the "__none__" sentinel item back to an empty (unset) value. */
  const none = (value: string) => (value === "__none__" ? "" : value);

  const handleMarketChange = (value: string) => {
    setMarketCode(none(value));
    setRegion(""); // regions belong to a market; reset when it changes
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const fields = {
      company: data.get("company"),
      contactName: data.get("contactName"),
      email: data.get("email"),
      phone: data.get("phone"),
      website: data.get("website"),
      websiteState,
      source,
      marketCode,
      region,
      campaignId: campaignId === "" ? undefined : campaignId,
      score,
      notes: data.get("notes"),
    };
    const parsed = (isEdit ? businessEditSchema : businessFormSchema).safeParse({
      ...fields,
      ...(isEdit ? { stage } : {}),
    });
    if (!parsed.success) {
      setError(firstFormError(parsed.error));
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      // The form yields an arbitrary string; Convex validates it server-side.
      // An explicitly cleared select detaches the campaign; an untouched
      // select keeps the existing link.
      const selectedCampaignId =
        campaignId === ""
          ? null
          : (parsed.data.campaignId as Id<"campaigns"> | null);
      if (isEdit && business) {
        await updateBusiness({
          id: business._id,
          company: parsed.data.company,
          contactName: parsed.data.contactName,
          email: parsed.data.email,
          phone: parsed.data.phone,
          website: parsed.data.website,
          websiteState: parsed.data.websiteState,
          source: parsed.data.source,
          marketCode: parsed.data.marketCode,
          region: parsed.data.region,
          score: parsed.data.score,
          campaignId: selectedCampaignId,
          notes: parsed.data.notes,
        });
        toast(`Business updated — ${parsed.data.company}`);
      } else {
        await createBusiness({
          company: parsed.data.company,
          contactName: parsed.data.contactName,
          email: parsed.data.email,
          phone: parsed.data.phone,
          website: parsed.data.website,
          websiteState: parsed.data.websiteState,
          source: parsed.data.source,
          marketCode: parsed.data.marketCode,
          region: parsed.data.region,
          score: parsed.data.score,
          campaignId: selectedCampaignId ?? undefined,
          notes: parsed.data.notes,
        });
        toast(`Business added to pipeline — ${parsed.data.company}`);
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
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit business" : "New business"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update this business's details. Changes are written to the database."
              : "Add a business to the pipeline. You can qualify it and move it through stages later."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="business-company">Company</Label>
            <Input
              id="business-company"
              name="company"
              placeholder="Acme Studio"
              defaultValue={business?.company}
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="business-contact">Contact name</Label>
              <Input
                id="business-contact"
                name="contactName"
                placeholder="Jane Doe"
                defaultValue={business?.contactName ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="business-email">Email</Label>
              <Input
                id="business-email"
                name="email"
                type="email"
                placeholder="jane@example.com"
                defaultValue={business?.email ?? ""}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="business-phone">Phone</Label>
              <Input
                id="business-phone"
                name="phone"
                placeholder="+1 555 010 1234"
                defaultValue={business?.phone ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="business-website">Website</Label>
              <Input
                id="business-website"
                name="website"
                placeholder="https://example.com"
                defaultValue={business?.website ?? ""}
              />
            </div>
          </div>
          {isEdit && business && (
            <div className="space-y-2 rounded-md border border-border bg-muted/30 p-4">
              <p className="text-xs font-medium text-foreground">
                Verification — strict no-website gate
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <ReachabilityBadge status={business.websiteStatus} />
                <QualificationBadge
                  qualification={business.qualification}
                  reason={business.qualificationReason}
                />
              </div>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Last checked</dt>
                  <dd className="font-medium text-foreground">
                    {business.websiteCheckedAt
                      ? formatDateTime(business.websiteCheckedAt)
                      : "Never verified"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Discovered by</dt>
                  <dd className="font-medium text-foreground">
                    {business.discoveredBy ?? "Manually added"}
                  </dd>
                </div>
                {business.qualificationReason && (
                  <div className="sm:col-span-2">
                    <dt className="text-muted-foreground">Reason</dt>
                    <dd className="font-medium leading-5 text-foreground">
                      {business.qualificationReason}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Current website</Label>
              <Select
                value={websiteState}
                onValueChange={(value) => setWebsiteState(value as WebsiteState)}
              >
                <SelectTrigger aria-label="Current website state">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WEBSITE_STATES.map((state) => (
                    <SelectItem key={state} value={state}>
                      {WEBSITE_STATE_LABELS[state]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Source</Label>
              <Select
                value={source}
                onValueChange={(value) => setSource(value as BusinessSource)}
              >
                <SelectTrigger aria-label="How the business was found">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BUSINESS_SOURCES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {BUSINESS_SOURCE_LABELS[item]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
              <Label>Campaign</Label>
              <Select
                value={campaignId}
                onValueChange={(value) => setCampaignId(none(value))}
              >
                <SelectTrigger aria-label="Linked campaign">
                  <SelectValue placeholder="No campaign" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No campaign</SelectItem>
                  {campaigns?.map((campaign) => (
                    <SelectItem key={campaign._id} value={campaign._id}>
                      {campaign.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="business-score">Priority score</Label>
              <Input
                id="business-score"
                name="score"
                type="number"
                min={0}
                max={100}
                step={1}
                placeholder="0–100"
                value={score}
                onChange={(event) => setScore(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Your assessment, 0–100. 70+ marks a high-priority opportunity.
              </p>
            </div>
          </div>
          {isEdit && (
            <div className="space-y-1.5">
              <Label>Stage</Label>
              <Select
                value={stage}
                onValueChange={(value) => setStage(value as PipelineStage)}
              >
                <SelectTrigger aria-label="Pipeline stage">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PIPELINE_STAGES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {PIPELINE_STAGE_LABELS[item]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="business-notes">Notes</Label>
            <Textarea
              id="business-notes"
              name="notes"
              rows={3}
              placeholder="Anything worth remembering about this business."
              defaultValue={business?.notes ?? ""}
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
              {isEdit ? "Save changes" : "Add to pipeline"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
