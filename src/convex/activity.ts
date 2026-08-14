import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { requireUser } from "./lib/errors";
import { activityTypeValidator } from "./schema";

export const list = query({
  args: {
    type: v.optional(activityTypeValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { type, limit }) => {
    await requireUser(ctx);
    const take = Math.min(Math.max(limit ?? 100, 1), 200);
    const rows = type
      ? await ctx.db
          .query("activity")
          .withIndex("by_type", (q) => q.eq("type", type))
          .order("desc")
          .take(take)
      : await ctx.db.query("activity").order("desc").take(take);
    const actorIds = [
      ...new Set(
        rows
          .map((row) => row.actorId)
          .filter((actorId): actorId is Id<"users"> => actorId !== undefined),
      ),
    ];
    const actors = (
      await Promise.all(actorIds.map((actorId) => ctx.db.get(actorId)))
    ).filter((actor): actor is Doc<"users"> => actor !== null);
    const byId = new Map(actors.map((actor) => [actor._id, actor]));
    return rows.map((row) => ({
      ...row,
      actorName: row.actorId ? byId.get(row.actorId)?.name : undefined,
      actorEmail: row.actorId ? byId.get(row.actorId)?.email : undefined,
    }));
  },
});
