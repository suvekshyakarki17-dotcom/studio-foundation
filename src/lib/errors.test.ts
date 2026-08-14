import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { getErrorCode, getErrorMessage } from "./errors";

describe("getErrorMessage", () => {
  it("extracts the safe message from a Convex application error", () => {
    const error = new ConvexError({ code: "CONFLICT", message: "A lead with this email already exists." });
    expect(getErrorMessage(error)).toBe("A lead with this email already exists.");
  });

  it("falls back to the error message for plain errors", () => {
    expect(getErrorMessage(new Error("boom"))).toBe("boom");
  });

  it("never leaks internals for unknown values", () => {
    expect(getErrorMessage(undefined)).toBe("Something went wrong. Please try again.");
    expect(getErrorMessage(null)).toBe("Something went wrong. Please try again.");
    expect(getErrorMessage("some raw string")).toBe("Something went wrong. Please try again.");
  });
});

describe("getErrorCode", () => {
  it("extracts the code from a Convex application error", () => {
    const error = new ConvexError({ code: "NOT_FOUND", message: "gone" });
    expect(getErrorCode(error)).toBe("NOT_FOUND");
  });

  it("returns null for non-Convex errors", () => {
    expect(getErrorCode(new Error("boom"))).toBeNull();
  });
});
