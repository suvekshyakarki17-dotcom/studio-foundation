import { v } from "convex/values";
import {
  CLIENT_STATUS_LABELS,
  CLIENT_STATUSES,
  type ClientStatus,
} from "../shared/domain";
import { mutation, query } from "./_generated/server";
import { recordActivity } from "./lib/activity";
import { apiError, requireUser } from "./lib/errors";
import { log } from "./lib/log";
import { clientStatusValidator } from "./schema";

function normalizeEmail(email: string | undefined): string | undefined {
  const trimmed = email?.trim();
  if (!trimmed) return undefined;
  return trimmed.toLowerCase();
}

function normalizeText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const clients = await ctx.db.query("clients").order("desc").collect();
    const projects = await ctx.db.query("projects").collect();
    const counts = new Map<string, number>();
    for (const project of projects) {
      if (project.clientId) {
        counts.set(
          project.clientId,
          (counts.get(project.clientId) ?? 0) + 1,
        );
      }
    }
    return clients.map((client) => ({
      ...client,
      projectsCount: counts.get(client._id) ?? 0,
    }));
  },
});

export const stats = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const clients = await ctx.db.query("clients").collect();
    const byStatus = Object.fromEntries(
      CLIENT_STATUSES.map((status) => [status, 0]),
    ) as Record<ClientStatus, number>;
    for (const client of clients) {
      byStatus[client.status] += 1;
    }
    return { total: clients.length, byStatus };
  },
});

export const create = mutation({
  args: {
    company: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    website: v.optional(v.string()),
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
        .query("clients")
        .withIndex("by_email", (q) => q.eq("email", email))
        .first();
      if (existing) {
        throw apiError("CONFLICT", "A client with this email already exists.");
      }
    }
    const id = await ctx.db.insert("clients", {
      company,
      name: normalizeText(args.name),
      email,
      phone: normalizeText(args.phone),
      website: normalizeText(args.website),
      notes: normalizeText(args.notes),
      status: "ACTIVE",
      updatedAt: Date.now(),
    });
    await recordActivity(ctx, {
      type: "CLIENT_CREATED",
      description: `Client created — ${company}`,
      actorId: user._id,
      entityType: "client",
      entityId: id,
    });
    log("info", "client.created", { clientId: id, company });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("clients"),
    company: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    website: v.optional(v.string()),
    notes: v.optional(v.string()),
    status: v.optional(clientStatusValidator),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw apiError("NOT_FOUND", "This client no longer exists.");
    }
    const company = args.company.trim();
    if (company.length === 0) {
      throw apiError("VALIDATION", "Company name is required.");
    }
    const email = normalizeEmail(args.email);
    if (email) {
      const duplicate = await ctx.db
        .query("clients")
        .withIndex("by_email", (q) => q.eq("email", email))
        .first();
      if (duplicate && duplicate._id !== args.id) {
        throw apiError("CONFLICT", "Another client already uses this email.");
      }
    }
    await ctx.db.patch(args.id, {
      company,
      name: normalizeText(args.name),
      email,
      phone: normalizeText(args.phone),
      website: normalizeText(args.website),
      notes: normalizeText(args.notes),
      updatedAt: Date.now(),
    });
    if (args.status && args.status !== existing.status) {
      await ctx.db.patch(args.id, { status: args.status });
      await recordActivity(ctx, {
        type: "CLIENT_UPDATED",
        description: `Client moved to ${CLIENT_STATUS_LABELS[args.status]} — ${company}`,
        actorId: user._id,
        entityType: "client",
        entityId: args.id,
      });
    }
    const updated = await ctx.db.get(args.id);
    if (!updated) {
      throw apiError("INTERNAL", "The client could not be reloaded.");
    }
    return updated;
  },
});

export const remove = mutation({
  args: { id: v.id("clients") },
  handler: async (ctx, { id }) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db.get(id);
    if (!existing) {
      throw apiError("NOT_FOUND", "This client no longer exists.");
    }
    // Detach any projects pointing at this client so no orphaned references
    // remain; the projects themselves are preserved.
    const attached = await ctx.db
      .query("projects")
      .withIndex("by_client", (q) => q.eq("clientId", id))
      .collect();
    for (const project of attached) {
      await ctx.db.patch(project._id, { clientId: undefined });
    }
    await ctx.db.delete(id);
    await recordActivity(ctx, {
      type: "CLIENT_DELETED",
      description: `Client deleted — ${existing.company}`,
      actorId: user._id,
      entityType: "client",
      entityId: id,
    });
    log("info", "client.deleted", { clientId: id, detachedProjects: attached.length });
  },
});
