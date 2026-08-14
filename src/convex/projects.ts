import { v } from "convex/values";
import {
  PROJECT_STATUS_LABELS,
  PROJECT_STATUSES,
  type ProjectStatus,
} from "../shared/domain";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { recordActivity } from "./lib/activity";
import { apiError, requireUser } from "./lib/errors";
import { log } from "./lib/log";
import { projectStatusValidator } from "./schema";

function normalizeText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export const list = query({
  args: { status: v.optional(projectStatusValidator) },
  handler: async (ctx, { status }) => {
    await requireUser(ctx);
    const projects = status
      ? await ctx.db
          .query("projects")
          .withIndex("by_status", (q) => q.eq("status", status))
          .order("desc")
          .collect()
      : await ctx.db.query("projects").order("desc").collect();
    const clientIds = [
      ...new Set(
        projects
          .map((project) => project.clientId)
          .filter((clientId): clientId is Id<"clients"> => clientId !== undefined),
      ),
    ];
    const clients = (
      await Promise.all(clientIds.map((clientId) => ctx.db.get(clientId)))
    ).filter((client): client is Doc<"clients"> => client !== null);
    const byId = new Map(clients.map((client) => [client._id, client]));
    return projects.map((project) => ({
      ...project,
      clientName: project.clientId
        ? byId.get(project.clientId)?.company
        : undefined,
    }));
  },
});

export const stats = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const projects = await ctx.db.query("projects").collect();
    const byStatus = Object.fromEntries(
      PROJECT_STATUSES.map((status) => [status, 0]),
    ) as Record<ProjectStatus, number>;
    for (const project of projects) {
      byStatus[project.status] += 1;
    }
    return { total: projects.length, byStatus };
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    clientId: v.optional(v.id("clients")),
    domain: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const name = args.name.trim();
    if (name.length === 0) {
      throw apiError("VALIDATION", "Project name is required.");
    }
    if (name.length > 140) {
      throw apiError("VALIDATION", "Project name must be under 140 characters.");
    }
    if (args.clientId) {
      const client = await ctx.db.get(args.clientId);
      if (!client) {
        throw apiError("VALIDATION", "Select an existing client.");
      }
    }
    const id = await ctx.db.insert("projects", {
      name,
      clientId: args.clientId,
      domain: normalizeText(args.domain),
      notes: normalizeText(args.notes),
      status: "PLANNING",
      updatedAt: Date.now(),
    });
    await recordActivity(ctx, {
      type: "PROJECT_CREATED",
      description: `Website project created — ${name}`,
      actorId: user._id,
      entityType: "project",
      entityId: id,
    });
    log("info", "project.created", { projectId: id, name });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("projects"),
    name: v.string(),
    clientId: v.optional(v.union(v.id("clients"), v.null())),
    domain: v.optional(v.string()),
    notes: v.optional(v.string()),
    status: v.optional(projectStatusValidator),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw apiError("NOT_FOUND", "This project no longer exists.");
    }
    const name = args.name.trim();
    if (name.length === 0) {
      throw apiError("VALIDATION", "Project name is required.");
    }
    let clientId: Id<"clients"> | undefined;
    if (args.clientId === null) {
      clientId = undefined; // explicitly detached
    } else if (args.clientId) {
      const client = await ctx.db.get(args.clientId);
      if (!client) {
        throw apiError("VALIDATION", "Select an existing client.");
      }
      clientId = args.clientId;
    } else {
      clientId = existing.clientId; // not touched
    }
    await ctx.db.patch(args.id, {
      name,
      clientId,
      domain: normalizeText(args.domain),
      notes: normalizeText(args.notes),
      updatedAt: Date.now(),
    });
    if (args.status && args.status !== existing.status) {
      await ctx.db.patch(args.id, { status: args.status });
      await recordActivity(ctx, {
        type: "PROJECT_UPDATED",
        description: `Project moved to ${PROJECT_STATUS_LABELS[args.status]} — ${name}`,
        actorId: user._id,
        entityType: "project",
        entityId: args.id,
      });
    }
    const updated = await ctx.db.get(args.id);
    if (!updated) {
      throw apiError("INTERNAL", "The project could not be reloaded.");
    }
    return updated;
  },
});

export const remove = mutation({
  args: { id: v.id("projects") },
  handler: async (ctx, { id }) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db.get(id);
    if (!existing) {
      throw apiError("NOT_FOUND", "This project no longer exists.");
    }
    await ctx.db.delete(id);
    await recordActivity(ctx, {
      type: "PROJECT_DELETED",
      description: `Project deleted — ${existing.name}`,
      actorId: user._id,
      entityType: "project",
      entityId: id,
    });
    log("info", "project.deleted", { projectId: id });
  },
});
