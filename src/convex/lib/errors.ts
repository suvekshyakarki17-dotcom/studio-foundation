/**
 * Error model for Convex functions.
 *
 * Every thrown error carries a safe, user-displayable message. Full
 * diagnostic detail is logged server-side (see lib/log.ts) and never sent
 * to the client.
 */
import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export type ApiErrorCode =
  | "VALIDATION"
  | "UNAUTHENTICATED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "DATABASE"
  | "INTERNAL";

export type ApiErrorPayload = {
  code: ApiErrorCode;
  message: string;
};

export function apiError(
  code: ApiErrorCode,
  message: string,
): ConvexError<ApiErrorPayload> {
  return new ConvexError({ code, message });
}

type AppCtx = QueryCtx | MutationCtx;

/**
 * Resolve the signed-in user for a query/mutation, or throw a safe
 * UNAUTHENTICATED error. Every Phase 1 write path calls this first.
 */
export async function requireUser(ctx: AppCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    throw apiError("UNAUTHENTICATED", "You must be signed in to do that.");
  }
  const user = await ctx.db.get(userId);
  if (user === null) {
    throw apiError("UNAUTHENTICATED", "Your account could not be found.");
  }
  return user;
}
