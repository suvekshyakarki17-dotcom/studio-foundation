/**
 * Client-side error helpers.
 *
 * Convex application errors arrive as ConvexError with our safe
 * `{ code, message }` payload (see src/convex/lib/errors.ts). Everything
 * else falls back to a generic, non-leaking message.
 */
import { ConvexError } from "convex/values";

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

export function getErrorMessage(error: unknown): string {
  if (error instanceof ConvexError) {
    const data = error.data as Partial<ApiErrorPayload> | undefined;
    if (data && typeof data.message === "string" && data.message.length > 0) {
      return data.message;
    }
  }
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return "Something went wrong. Please try again.";
}

export function getErrorCode(error: unknown): ApiErrorCode | null {
  if (error instanceof ConvexError) {
    const data = error.data as Partial<ApiErrorPayload> | undefined;
    if (data && typeof data.code === "string") {
      return data.code;
    }
  }
  return null;
}
