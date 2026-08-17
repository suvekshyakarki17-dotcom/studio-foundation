/**
 * Phase 4 — derive stored lead-quality metrics from a real business doc.
 *
 * These helpers only ever count real stored fields; nothing is invented.
 * `dataQualityFromBusiness` is used at every write point where the
 * opportunity score is stored, so the two metrics always reflect the same
 * snapshot of the record.
 */
import { confidenceTier, scoreDataQuality } from "../../shared/discovery/quality";
import type { Doc } from "../_generated/dataModel";

export interface StoredDataQuality {
  completeness: number;
  tier: "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";
  scoredAt: number;
}

/**
 * Weighted completeness of a business's real public data (Phase 4 §17).
 * Counts only fields that are present on the record; missing fields are
 * simply not counted and are surfaced as missing by the UI.
 */
export function dataQualityFromBusiness(
  business: Pick<
    Doc<"businesses">,
    | "company"
    | "category"
    | "address"
    | "city"
    | "region"
    | "marketCode"
    | "phone"
    | "email"
    | "googleMapsUrl"
    | "socials"
    | "notes"
  >,
): StoredDataQuality {
  const assessment = scoreDataQuality({
    hasName: Boolean(business.company),
    hasCategory: Boolean(business.category),
    hasAddress: Boolean(business.address),
    hasCity: Boolean(business.city),
    hasRegion: Boolean(business.region),
    hasCountry: Boolean(business.marketCode),
    hasPhone: Boolean(business.phone),
    hasEmail: Boolean(business.email),
    hasGoogleMaps: Boolean(business.googleMapsUrl),
    hasSocials: Boolean(business.socials && business.socials.length > 0),
    hasDescription: Boolean(business.notes),
  });
  return {
    completeness: assessment.completeness,
    tier: confidenceTier(assessment.completeness),
    scoredAt: Date.now(),
  };
}
