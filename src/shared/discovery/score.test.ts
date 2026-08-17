import { describe, expect, it } from "vitest";
import { normalizeRecord } from "./normalize";
import {
  OPPORTUNITY_WEIGHTS,
  scoreNormalizedRecord,
  scoreOpportunity,
  websiteOpportunityPoints,
} from "./score";

describe("websiteOpportunityPoints", () => {
  it("scores missing and unreachable sites as the clearest opportunities", () => {
    expect(websiteOpportunityPoints("NO_WEBSITE")).toBe(
      OPPORTUNITY_WEIGHTS.website,
    );
    expect(websiteOpportunityPoints("UNREACHABLE")).toBe(
      OPPORTUNITY_WEIGHTS.website,
    );
  });

  it("never claims a reachable site as an opportunity", () => {
    expect(websiteOpportunityPoints("HAS_WEBSITE")).toBe(0);
  });

  it("keeps unverified states neutral", () => {
    expect(websiteOpportunityPoints("UNKNOWN")).toBeLessThan(30);
    expect(websiteOpportunityPoints("BLOCKED")).toBeLessThan(30);
    expect(websiteOpportunityPoints("CHECK_FAILED")).toBeLessThan(30);
  });
});

describe("scoreOpportunity", () => {
  it("never exceeds the 100-point total", () => {
    const assessment = scoreOpportunity({
      websiteStatus: "NO_WEBSITE",
      hasEmail: true,
      hasPhone: true,
      hasContactName: true,
      hasCity: true,
      hasCategory: true,
    });
    expect(assessment.score).toBe(100);
    expect(
      assessment.factors.website +
        assessment.factors.contact +
        assessment.factors.completeness,
    ).toBe(assessment.score);
  });

  it("scores a no-website business with full contact details high", () => {
    const assessment = scoreOpportunity({
      websiteStatus: "NO_WEBSITE",
      hasEmail: true,
      hasPhone: true,
      hasContactName: true,
      hasCity: true,
      hasCategory: true,
    });
    expect(assessment.score).toBeGreaterThanOrEqual(70); // HIGH tier
  });

  it("scores a reachable site with thin data low", () => {
    const assessment = scoreOpportunity({
      websiteStatus: "HAS_WEBSITE",
      hasEmail: false,
      hasPhone: false,
      hasContactName: false,
      hasCity: true,
      hasCategory: true,
    });
    expect(assessment.score).toBeLessThan(40); // LOW tier
  });

  it("keeps an unverified site neutral rather than high", () => {
    const assessment = scoreOpportunity({
      websiteStatus: "UNKNOWN",
      hasEmail: true,
      hasPhone: false,
      hasContactName: false,
      hasCity: true,
      hasCategory: true,
    });
    // website 20 + email 20 + city 10 + category 10 — never above 60
    expect(assessment.score).toBe(60);
  });

  it("rewards contact availability on the contact axis", () => {
    const withEmail = scoreOpportunity({
      websiteStatus: "UNKNOWN",
      hasEmail: true,
      hasPhone: false,
      hasContactName: false,
      hasCity: false,
      hasCategory: false,
    });
    expect(withEmail.factors.contact).toBe(20);
    const withBoth = scoreOpportunity({
      websiteStatus: "UNKNOWN",
      hasEmail: true,
      hasPhone: true,
      hasContactName: false,
      hasCity: false,
      hasCategory: false,
    });
    expect(withBoth.factors.contact).toBe(30);
  });
});

describe("scoreNormalizedRecord", () => {
  it("scores a normalized record consistently with its stored signals", () => {
    const normalized = normalizeRecord(
      {
        company: "Corner Bakery",
        email: "owner@cornerbakery.com",
        phone: "(305) 555-0100",
        city: "Miami",
        category: "Restaurants",
      },
      1,
    );
    const assessment = scoreNormalizedRecord(normalized);
    // A record without a URL is UNKNOWN at import (never claimed absent):
    // website 20 + email 20 + phone 10 + city 10 + category 10
    expect(assessment.score).toBe(70);
    expect(assessment.factors).toEqual({
      website: 20,
      contact: 30,
      completeness: 20,
    });
  });

  it("scores a reachable-site record from a real check lower", () => {
    const normalized = normalizeRecord(
      { company: "Modern Shop", website: "modernshop.com", city: "Miami" },
      1,
    );
    // UNKNOWN reachability at import time — never claimed as opportunity
    expect(scoreNormalizedRecord(normalized).factors.website).toBe(20);
  });
});
