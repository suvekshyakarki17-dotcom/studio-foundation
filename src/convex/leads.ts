import { v } from "convex/values";
import {
  LEAD_STATUS_LABELS,
  LEAD_STATUSES,
  type LeadStatus,
} from "../shared/domain";
import { mutation, query } from "./_generated/server";
import { recordActivity } from "./lib/activity";
import { apiError, requireUser } from "./lib/errors";
import { log } from "./lib/log";
import { leadStatusValidator } from "./schema";

/** Normalize an optional email: trim, lowercase, empty -> undefined. */
function normalizeEmail(email: string | undefined): string | undefined {
  const trimmed = email?.trim();
  if (!trimmed) return undefined;
  return trimmed.toLowerCase();
}

/** Normalize an optional free-text field: trim, empty -> undefined. */
function normalizeText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export const list = query({
  args: { status: v.optional(leadStatusValidator) },
  handler: async (ctx, { status }) => {
    await requireUser(ctx);
    if (status) {
      return ctx.db
        .query("leads")
        .withIndex("by_status", (q) => q.eq("status", status))
        .order("desc")
        .collect();
    }
    return ctx.db.query("leads").order("desc").collect();
  },
});

export const stats = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const leads = await ctx.db.query("leads").collect();
    const byStatus = Object.fromEntries(
      LEAD_STATUSES.map((status) => [status, 0]),
    ) as Record<LeadStatus, number>;
    for (const lead of leads) {
      byStatus[lead.status] += 1;
    }
    return { total: leads.length, byStatus };
  },
});

export const create = mutation({
  args: {
    company: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    website: v.optional(v.string()),
    source: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const company = args.company.trim();
    if (company.length === 0) {
      throw apiError("VALIDATION", "Company name is required.");
    }
    if (company.length > 120) {
      throw apiError("VALIDATION", "Company name must be under 120 characters.");
    }
    const email = normalizeEmail(args.email);
    if (email) {
      const existing = await ctx.db
        .query("leads")
        .withIndex("by_email", (q) => q.eq("email", email))
        .first();
      if (existing) {
        throw apiError("CONFLICT", "A lead with this email already exists.");
      }
    }
    const id = await ctx.db.insert("leads", {
      company,
      name: normalizeText(args.name),
      email,
      website: normalizeText(args.website),
      source: normalizeText(args.source),
      notes: normalizeText(args.notes),
      status: "NEW",
      updatedAt: Date.now(),
    });
    await recordActivity(ctx, {
      type: "LEAD_CREATED",
      description: `Lead created — ${company}`,
      actorId: user._id,
      entityType: "lead",
      entityId: id,
    });
    log("info", "lead.created", { leadId: id, company });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("leads"),
    company: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    website: v.optional(v.string()),
    source: v.optional(v.string()),
    notes: v.optional(v.string()),
    status: v.optional(leadStatusValidator),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw apiError("NOT_FOUND", "This lead no longer exists.");
    }
    const company = args.company.trim();
    if (company.length === 0) {
      throw apiError("VALIDATION", "Company name is required.");
    }
    if (company.length > 120) {
      throw apiError("VALIDATION", "Company name must be under 120 characters.");
    }
    const email = normalizeEmail(args.email);
    if (email) {
      const duplicate = await ctx.db
        .query("leads")
        .withIndex("by_email", (q) => q.eq("email", email))
        .first();
      if (duplicate && duplicate._id !== args.id) {
        throw apiError("CONFLICT", "Another lead already uses this email.");
      }
    }
    await ctx.db.patch(args.id, {
      company,
      name: normalizeText(args.name),
      email,
      website: normalizeText(args.website),
      source: normalizeText(args.source),
      notes: normalizeText(args.notes),
      updatedAt: Date.now(),
    });
    if (args.status && args.status !== existing.status) {
      await ctx.db.patch(args.id, { status: args.status });
      await recordActivity(ctx, {
        type: "LEAD_UPDATED",
        description: `Lead moved to ${LEAD_STATUS_LABELS[args.status]} — ${company}`,
        actorId: user._id,
        entityType: "lead",
        entityId: args.id,
      });
    }
    const updated = await ctx.db.get(args.id);
    if (!updated) {
      throw apiError("INTERNAL", "The lead could not be reloaded.");
    }
    return updated;
  },
});

export const remove = mutation({
  args: { id: v.id("leads") },
  handler: async (ctx, { id }) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db.get(id);
    if (!existing) {
      throw apiError("NOT_FOUND", "This lead no longer exists.");
    }
    await ctx.db.delete(id);
    await recordActivity(ctx, {
      type: "LEAD_DELETED",
      description: `Lead deleted — ${existing.company}`,
      actorId: user._id,
      entityType: "lead",
      entityId: id,
    });
    log("info", "lead.deleted", { leadId: id });
  },
});
