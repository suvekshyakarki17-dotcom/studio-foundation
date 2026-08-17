/**
 * Client-side form validation for Agency Studio entities.
 *
 * These schemas exist for usability (inline field errors, clear messages).
 * The Convex mutations re-validate every input server-side — client
 * validation is never trusted on its own.
 */
import { z } from "zod";
import {
  BUSINESS_SOURCES,
  CAMPAIGN_STATUSES,
  CLIENT_STATUSES,
  LEAD_STATUSES,
  PIPELINE_STAGES,
  PROJECT_STATUSES,
  WEBSITE_STATES,
} from "@/shared/domain";
import { DEFAULT_WEBSITE_TARGET, WEBSITE_TARGETS } from "@/shared/discovery";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const requiredName = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .max(max, `${label} must be under ${max} characters.`);

/** Optional free-text field: trims, and empty/whitespace becomes undefined. */
function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max, `Keep this under ${max} characters.`)
    .optional()
    .transform((value) => (value === "" ? undefined : value));
}

/** Optional email field: trims, lowercases, empty becomes undefined. */
const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .optional()
  .transform((value) => (value === "" ? undefined : value))
  .superRefine((value, ctx) => {
    if (value !== undefined && !EMAIL_PATTERN.test(value)) {
      ctx.addIssue({ code: "custom", message: "Enter a valid email address." });
    }
  });

/** Optional select value: empty string becomes undefined. */
function optionalSelect() {
  return z
    .string()
    .trim()
    .optional()
    .transform((value) => (value === "" ? undefined : value));
}

/** Optional 0-100 score: empty becomes undefined, then coerced to a number. */
const optionalScore = z.preprocess(
  (value) => {
    if (value === "" || value === null || value === undefined) return undefined;
    return Number(value);
  },
  z
    .number()
    .int("Score must be a whole number.")
    .min(0, "Score must be between 0 and 100.")
    .max(100, "Score must be between 0 and 100.")
    .optional(),
);

export const leadFormSchema = z.object({
  company: requiredName("Company name", 120),
  name: optionalText(120),
  email: optionalEmail,
  website: optionalText(200),
  source: optionalText(80),
  notes: optionalText(1000),
});
export type LeadFormValues = z.infer<typeof leadFormSchema>;

export const leadEditSchema = leadFormSchema.extend({
  status: z.enum(LEAD_STATUSES),
});
export type LeadEditValues = z.infer<typeof leadEditSchema>;

export const clientFormSchema = z.object({
  company: requiredName("Company name", 120),
  name: optionalText(120),
  email: optionalEmail,
  phone: optionalText(40),
  website: optionalText(200),
  notes: optionalText(1000),
});
export type ClientFormValues = z.infer<typeof clientFormSchema>;

export const clientEditSchema = clientFormSchema.extend({
  status: z.enum(CLIENT_STATUSES),
});
export type ClientEditValues = z.infer<typeof clientEditSchema>;

export const projectFormSchema = z.object({
  name: requiredName("Project name", 140),
  clientId: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value === "" ? undefined : value)),
  domain: optionalText(200),
  notes: optionalText(1000),
});
export type ProjectFormValues = z.infer<typeof projectFormSchema>;

export const projectEditSchema = projectFormSchema.extend({
  status: z.enum(PROJECT_STATUSES),
});
export type ProjectEditValues = z.infer<typeof projectEditSchema>;

export const businessFormSchema = z.object({
  company: requiredName("Company name", 120),
  contactName: optionalText(120),
  email: optionalEmail,
  phone: optionalText(40),
  website: optionalText(200),
  websiteState: z.enum(WEBSITE_STATES),
  source: z.enum(BUSINESS_SOURCES),
  marketCode: optionalSelect(),
  region: optionalSelect(),
  campaignId: optionalSelect(),
  score: optionalScore,
  notes: optionalText(1000),
});
export type BusinessFormValues = z.infer<typeof businessFormSchema>;

export const businessEditSchema = businessFormSchema.extend({
  stage: z.enum(PIPELINE_STAGES),
});
export type BusinessEditValues = z.infer<typeof businessEditSchema>;

/** Optional whole-number target (1..100,000); empty becomes undefined. */
const optionalTargetCount = z.preprocess(
  (value) => {
    if (value === "" || value === null || value === undefined) return undefined;
    return Number(value);
  },
  z
    .number()
    .int("Target count must be a whole number.")
    .min(1, "Target count must be at least 1.")
    .max(100000, "Target count is too large.")
    .optional(),
);

export const campaignFormSchema = z.object({
  name: requiredName("Campaign name", 140),
  description: optionalText(1000),
  marketCode: optionalSelect(),
  region: optionalSelect(),
  city: optionalText(120),
  category: optionalText(120),
  targetCount: optionalTargetCount,
  targetKeywords: optionalText(300),
  websiteTarget: z.enum(WEBSITE_TARGETS).default(DEFAULT_WEBSITE_TARGET),
  minimumOpportunity: z
    .enum(["LOW", "MEDIUM", "HIGH", "VERY_HIGH"] as const)
    .optional(),
});
export type CampaignFormValues = z.infer<typeof campaignFormSchema>;

export const campaignEditSchema = campaignFormSchema.extend({
  status: z.enum(CAMPAIGN_STATUSES),
});
export type CampaignEditValues = z.infer<typeof campaignEditSchema>;

export type FormValues =
  | LeadFormValues
  | ClientFormValues
  | ProjectFormValues
  | BusinessFormValues
  | CampaignFormValues;

/** Pull the first issue message off a ZodError, or a generic fallback. */
export function firstFormError(error: z.ZodError): string {
  const issue = error.issues[0];
  if (issue && issue.message) {
    return issue.message;
  }
  return "Please check the form and try again.";
}
