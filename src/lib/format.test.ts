import { describe, expect, it } from "vitest";
import { formatDate, formatRelativeTime, initials } from "./format";

const NOW = 1_700_000_000_000; // fixed reference point

describe("formatRelativeTime", () => {
  it("returns 'just now' under 45 seconds", () => {
    expect(formatRelativeTime(NOW - 10_000, NOW)).toBe("just now");
  });

  it("returns minutes", () => {
    expect(formatRelativeTime(NOW - 5 * 60_000, NOW)).toBe("5m ago");
  });

  it("returns hours", () => {
    expect(formatRelativeTime(NOW - 3 * 3_600_000, NOW)).toBe("3h ago");
  });

  it("returns days under a week", () => {
    expect(formatRelativeTime(NOW - 4 * 86_400_000, NOW)).toBe("4d ago");
  });

  it("falls back to a date after a week", () => {
    const value = formatRelativeTime(NOW - 30 * 86_400_000, NOW);
    expect(value).toMatch(/\w{3} \d{1,2}, \d{4}/);
  });

  it("never returns a negative time for future timestamps", () => {
    expect(formatRelativeTime(NOW + 60_000, NOW)).toBe("just now");
  });
});

describe("formatDate", () => {
  it("formats a date in a short editorial style", () => {
    // 2023-11-14T22:13:20Z
    expect(formatDate(1_700_000_000_000)).toBe("Nov 14, 2023");
  });
});

describe("initials", () => {
  it("derives initials from a name", () => {
    expect(initials("Ada Lovelace")).toBe("AL");
  });

  it("handles single names", () => {
    expect(initials("Grace")).toBe("G");
  });

  it("falls back for empty names", () => {
    expect(initials("")).toBe("AS");
    expect(initials(undefined)).toBe("AS");
  });
});
