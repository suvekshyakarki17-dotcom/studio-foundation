/**
 * Opportunity scoring — the core lead-intelligence qualification signal.
 *
 * A deterministic, transparent 0–100 score derived from real signals only:
 *
 *   - Website opportunity (0–40): derived from the *reachability* state.
 *     A business with no website, or one that cannot be reached, is the
 *     clearest fit for a web agency. HAS_WEBSITE scores zero on this axis —
 *     it is never claimed as an opportunity.
 *   - Contact availability (0–30): an email (20) and phone (10) mean the
 *     record is actionable for outreach. These are *presence* signals, not
 *     deliverability claims.
 *   - Data completeness (0–30): contact name (10), city (10), and category
 *     (10) make a record qualifyable and targetable.
 *
 * The score is a qualification heuristic, not a verified business fact:
 * every point is traceable to a stored signal, and the factors are returned
 * alongside the total so the UI can show exactly why a business scored the
 * way it did. No signal ever comes from fabrication — UNKNOWN reachability
 * scores neutral, never high.
 *
 * Tiers reuse the shared thresholds (HIGH ≥ 70, MEDIUM ≥ 40) from
 * src/shared/domain.ts so the pipeline, discovery, and metrics all agree.
 */
import type {
  DiscoveryNormalizedRecord,
  WebsiteReachabilityState,
} from "../discovery";

export const OPPORTUNITY_WEIGHTS = {
  website: 40,
  contact: 30,
  completeness: 30,
} as const;

export const OPPORTUNITY_TOTAL = 100;

/** Sub-scores per axis, stored with the total so the UI can show the breakdown. */
export interface OpportunityFactors {
  website: number; //      0-40
  contact: number; //      0-30
  completeness: number; // 0-30
}

export interface OpportunityAssessment {
  /** 0-100. The sum of the three factors — never more, never less. */
  score: number;
  factors: OpportunityFactors;
}

/**
 * Website-axis points for a reachability state. Only states with a real
 * signal score high: an unreachable site and a missing site are the target
 * profile; an unverified site stays neutral; a reachable site scores zero.
 */
export function websiteOpportunityPoints(
  status: WebsiteReachabilityState,
): number {
  switch (status) {
    case "NO_WEBSITE":
      return 40; // clear need — no site to point customers to
    case "UNREACHABLE":
      return 40; // has a URL but cannot be reached — likely dead/broken
    case "INVALID_URL":
      return 30; // recorded URL is unusable — the real site is unknown
    case "UNKNOWN":
      return 20; // never verified — neutral, not claimed
    case "BLOCKED":
      return 15; // check was blocked — could not verify, low signal
    case "CHECK_FAILED":
      return 15; // check errored — could not verify, low signal
    case "HAS_WEBSITE":
      return 0; // reachable site — not a weak-website opportunity
  }
}

/** Compute the assessment from the raw signal inputs. */
export function scoreOpportunity(input: {
  websiteStatus: WebsiteReachabilityState;
  hasEmail: boolean;
  hasPhone: boolean;
  hasContactName: boolean;
  hasCity: boolean;
  hasCategory: boolean;
}): OpportunityAssessment {
  const website = websiteOpportunityPoints(input.websiteStatus);
  const contact = (input.hasEmail ? 20 : 0) + (input.hasPhone ? 10 : 0);
  const completeness =
    (input.hasContactName ? 10 : 0) +
    (input.hasCity ? 10 : 0) +
    (input.hasCategory ? 10 : 0);
  return {
    score: website + contact + completeness,
    factors: { website, contact, completeness },
  };
}

/**
 * Score a normalized discovery record directly. All inputs come from the
 * canonical view, so the score always agrees with what was persisted.
 */
export function scoreNormalizedRecord(
  record: Pick<
    DiscoveryNormalizedRecord,
    "websiteStatus" | "email" | "phone" | "contactName" | "city" | "category"
  >,
): OpportunityAssessment {
  return scoreOpportunity({
    websiteStatus: record.websiteStatus,
    hasEmail: Boolean(record.email),
    hasPhone: Boolean(record.phone),
    hasContactName: Boolean(record.contactName),
    hasCity: Boolean(record.city),
    hasCategory: Boolean(record.category),
  });
}
