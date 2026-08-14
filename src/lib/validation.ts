/**
 * Client-side form validation for Agency Studio entities.
 *
 * These schemas exist for usability (inline field errors, clear messages).
 * The Convex mutations re-validate every input server-side — client
 * validation is never trusted on its own.
 */
import { z } from "zod";
import {
  CLIENT_STATUSES,
  LEAD_STATUSES,
  PROJECT_STATUSES,
} from "@/shared/domain";

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

export type FormValues =
  | LeadFormValues
  | ClientFormValues
  | ProjectFormValues;

/** Pull the first issue message off a ZodError, or a generic fallback. */
export function firstFormError(error: z.ZodError): string {
  const issue = error.issues[0];
  if (issue && issue.message) {
    return issue.message;
  }
  return "Please check the form and try again.";
}
