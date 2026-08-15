/**
 * Deterministic validation for raw discovery records.
 *
 * Distinguishes VALID FORMAT from VERIFIED/CONFIRMED: syntax-level checks
 * only. An email that passes here is not claimed to be deliverable; a phone
 * that passes here is not claimed to reach anyone. Reachability checks are
 * a separate, real operation (see the website check action).
 */
import type { DiscoveryRawRecord } from "../discovery";
import {
  canonicalizeUrl,
  normalizeEmail,
  normalizeName,
  normalizePhone,
} from "./normalize";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ValidationResult {
  valid: boolean;
  /** Human-readable reasons, one per failing rule. */
  reasons: string[];
}

/**
 * Validate a raw record before it may be persisted. Rules:
 * - company name is required after normalization
 * - email, when present, must be syntactically valid
 * - phone, when present, must have a usable structure
 * - website, when present, must canonicalize to a real http(s) URL
 */
export function validateRawRecord(raw: DiscoveryRawRecord): ValidationResult {
  const reasons: string[] = [];

  const company = normalizeName(raw.company);
  if (!company) {
    reasons.push("Company name is required.");
  }
  if (raw.email !== undefined && raw.email.trim() !== "") {
    const email = normalizeEmail(raw.email);
    if (!email || !EMAIL_PATTERN.test(email)) {
      reasons.push("Email format is invalid.");
    }
  }
  if (raw.phone !== undefined && raw.phone.trim() !== "") {
    if (!normalizePhone(raw.phone)) {
      reasons.push("Phone number looks invalid.");
    }
  }
  if (raw.website !== undefined && raw.website.trim() !== "") {
    if (!canonicalizeUrl(raw.website)) {
      reasons.push("Website URL is invalid.");
    }
  }
  if (raw.whatsapp !== undefined && raw.whatsapp.trim() !== "") {
    if (!normalizePhone(raw.whatsapp)) {
      reasons.push("WhatsApp number looks invalid.");
    }
  }

  return { valid: reasons.length === 0, reasons };
}
