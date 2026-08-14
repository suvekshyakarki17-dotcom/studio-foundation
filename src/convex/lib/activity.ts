/**
 * Activity recording helper.
 *
 * Activity rows are written only by real operations (create/update/delete
 * mutations and genuine system events) — never fabricated.
 */
import type { ActivityType } from "../../shared/domain";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export async function recordActivity(
  ctx: MutationCtx,
  input: {
    type: ActivityType;
    description: string;
    actorId?: Id<"users">;
    entityType?: string;
    entityId?: string;
  },
): Promise<void> {
  await ctx.db.insert("activity", {
    type: input.type,
    description: input.description,
    actorId: input.actorId,
    entityType: input.entityType,
    entityId: input.entityId,
  });
}
