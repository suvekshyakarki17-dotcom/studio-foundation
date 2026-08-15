/**
 * Conservative enrichment when a duplicate record carries genuinely new
 * information.
 *
 * Rules (explicit and strict):
 * - Only high-confidence signals (email, domain, phone) may enrich.
 * - Only *empty* fields on the existing business are filled — a non-empty
 *   field is never overwritten, so newer/lower-confidence data can never
 *   clobber what is already recorded.
 * - The medium-confidence "name+city" signal never enriches.
 * - No data is destroyed: the incoming record stays visible as a
 *   DUPLICATE result with its own raw snapshot.
 */
import type { DiscoveryNormalizedRecord, DuplicateSignal } from "../discovery";

export interface EnrichableBusiness {
  website?: string;
  phone?: string;
  email?: string;
  city?: string;
  category?: string;
}

export type EnrichmentUpdates = Partial<EnrichableBusiness>;

/**
 * Compute the patch to apply to an existing business given a duplicate
 * record. Returns an empty object when nothing should change.
 */
export function enrichmentUpdates(
  existing: EnrichableBusiness,
  record: DiscoveryNormalizedRecord,
  signal: DuplicateSignal,
): EnrichmentUpdates {
  if (signal === "name+city") return {};
  const updates: EnrichmentUpdates = {};
  if (!existing.website && record.website) updates.website = record.website;
  if (!existing.phone && record.phone) updates.phone = record.phone;
  if (!existing.email && record.email) updates.email = record.email;
  if (!existing.city && record.city) updates.city = record.city;
  if (!existing.category && record.category) updates.category = record.category;
  return updates;
}
