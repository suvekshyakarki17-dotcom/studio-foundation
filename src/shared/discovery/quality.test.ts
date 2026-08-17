import { describe, expect, it } from "vitest";
import {
  assessEmail,
  confidenceTier,
  scoreDataQuality,
  scoreWebsiteConfidence,
} from "./quality";

/* ------------------------ Confidence tier bands -------------------------- */

describe("confidenceTier", () => {
  it("maps the documented bands (Phase 4 §8)", () => {
    expect(confidenceTier(0)).toBe("LOW");
    expect(confidenceTier(39)).toBe("LOW");
    expect(confidenceTier(40)).toBe("MEDIUM");
    expect(confidenceTier(69)).toBe("MEDIUM");
    expect(confidenceTier(70)).toBe("HIGH");
    expect(confidenceTier(89)).toBe("HIGH");
    expect(confidenceTier(90)).toBe("VERY_HIGH");
    expect(confidenceTier(100)).toBe("VERY_HIGH");
  });
});

/* --------------------- Website verification confidence ------------------- */

describe("scoreWebsiteConfidence", () => {
  it("returns null when verification never ran — no confidence can be claimed", () => {
    expect(
      scoreWebsiteConfidence({
        method: "REACHABILITY",
        status: "UNKNOWN",
      }),
    ).toBeNull();
  });

  it("scores a direct 200 as very high confidence", () => {
    expect(
      scoreWebsiteConfidence({
        method: "REACHABILITY",
        status: "HAS_WEBSITE",
        httpStatus: 200,
      }),
    ).toBe(95);
  });

  it("scores an unusual 2xx/3xx as high confidence", () => {
    expect(
      scoreWebsiteConfidence({
        method: "REACHABILITY",
        status: "HAS_WEBSITE",
        httpStatus: 301,
      }),
    ).toBe(88);
  });

  it("distinguishes unreachable-with-response from unreachable-without", () => {
    expect(
      scoreWebsiteConfidence({
        method: "REACHABILITY",
        status: "UNREACHABLE",
        httpStatus: 500,
      }),
    ).toBe(78);
    expect(
      scoreWebsiteConfidence({
        method: "REACHABILITY",
        status: "UNREACHABLE",
      }),
    ).toBe(60);
  });

  it("scores blocked, invalid URL, and failed checks honestly", () => {
    expect(
      scoreWebsiteConfidence({ method: "REACHABILITY", status: "BLOCKED" }),
    ).toBe(72);
    expect(
      scoreWebsiteConfidence({ method: "REACHABILITY", status: "INVALID_URL" }),
    ).toBe(88);
    expect(
      scoreWebsiteConfidence({ method: "REACHABILITY", status: "CHECK_FAILED" }),
    ).toBe(25);
  });

  it("confirms no-website only when the business itself was found", () => {
    expect(
      scoreWebsiteConfidence({
        method: "RESOLUTION_SEARCH",
        status: "NO_WEBSITE",
        businessFound: true,
      }),
    ).toBe(90);
    // Absence NOT confirmed — the business was never found, so confidence
    // in the no-website outcome is deliberately low, never converted to a
    // qualified no-website claim.
    expect(
      scoreWebsiteConfidence({
        method: "RESOLUTION_SEARCH",
        status: "NO_WEBSITE",
        businessFound: false,
      }),
    ).toBe(40);
  });

  it("scores a resolved official website as high confidence", () => {
    expect(
      scoreWebsiteConfidence({
        method: "RESOLUTION_SEARCH",
        status: "HAS_WEBSITE",
      }),
    ).toBe(90);
  });
});

/* --------------------------- Lead data quality --------------------------- */

describe("scoreDataQuality", () => {
  const complete = {
    hasName: true,
    hasCategory: true,
    hasAddress: true,
    hasCity: true,
    hasRegion: true,
    hasCountry: true,
    hasPhone: true,
    hasEmail: true,
    hasGoogleMaps: true,
    hasSocials: true,
    hasDescription: true,
  };

  it("scores a fully populated lead at 100 with nothing missing", () => {
    const result = scoreDataQuality(complete);
    expect(result.completeness).toBe(100);
    expect(result.missing).toEqual([]);
  });

  it("scores an empty record at 0 and reports every missing field", () => {
    const result = scoreDataQuality({
      hasName: false,
      hasCategory: false,
      hasAddress: false,
      hasCity: false,
      hasRegion: false,
      hasCountry: false,
      hasPhone: false,
      hasEmail: false,
      hasGoogleMaps: false,
      hasSocials: false,
      hasDescription: false,
    });
    expect(result.completeness).toBe(0);
    expect(result.missing).toHaveLength(11);
    expect(result.missing).toContain("Phone");
    expect(result.missing).toContain("Email");
  });

  it("is weighted — identity and contact fields matter most", () => {
    const result = scoreDataQuality({
      ...complete,
      hasName: false,
      hasPhone: false,
      hasEmail: false,
      hasAddress: false,
    });
    expect(result.completeness).toBe(100 - 10 - 10 - 10 - 15);
    expect(result.missing).toEqual([
      "Business name",
      "Street address",
      "Phone",
      "Email",
    ]);
  });

  it("never fabricates presence — absent fields always lower the score", () => {
    const result = scoreDataQuality({
      ...complete,
      hasSocials: false,
      hasGoogleMaps: false,
      hasDescription: false,
    });
    expect(result.completeness).toBe(100 - 5 - 5 - 5);
    expect(result.missing).toContain("Social profiles");
  });
});

/* ------------------------------ Email status ----------------------------- */

describe("assessEmail", () => {
  it("validates a structurally sound address (syntax + dotted domain + TLD)", () => {
    expect(assessEmail("Owner@Example.COM")).toEqual({
      status: "VALIDATED",
      normalized: "owner@example.com",
    });
  });

  it("marks a weak domain structure as FOUND, not validated", () => {
    const result = assessEmail("owner@example.123");
    expect(result.status).toBe("FOUND");
    expect(result.normalized).toBe("owner@example.123");
  });

  it("never persists a syntactically broken address", () => {
    const result = assessEmail("not-an-email");
    expect(result.status).toBe("UNVERIFIED");
    expect(result.invalid).toBe(true);
  });

  it("treats absence honestly as UNVERIFIED", () => {
    expect(assessEmail(undefined)).toEqual({ status: "UNVERIFIED" });
    expect(assessEmail("   ")).toEqual({ status: "UNVERIFIED" });
  });
});
