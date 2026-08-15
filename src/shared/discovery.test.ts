import { describe, expect, it } from "vitest";
import {
  DISCOVERY_PROVIDERS,
  canRunTransition,
  discoveryReadiness,
  type DiscoveryRawRecord,
} from "./discovery";
import { findDuplicate, toBusinessIdentity } from "./discovery/dedupe";
import { enrichmentUpdates } from "./discovery/enrich";
import {
  buildIdentityKeys,
  canonicalizeUrl,
  deriveWebsiteReachability,
  normalizeEmail,
  normalizeName,
  normalizePhone,
  normalizeRecord,
} from "./discovery/normalize";
import { validateRawRecord } from "./discovery/validate";

/* --------------------------------- URLs ---------------------------------- */

describe("canonicalizeUrl", () => {
  it("adds https:// when the scheme is missing", () => {
    expect(canonicalizeUrl("example.com")?.url).toBe("https://example.com");
  });

  it("lowercases protocol and host", () => {
    expect(canonicalizeUrl("HTTP://Example.COM/Home")?.url).toBe(
      "http://example.com/Home",
    );
  });

  it("strips a trailing slash on the root path only", () => {
    expect(canonicalizeUrl("https://example.com/")?.url).toBe(
      "https://example.com",
    );
    expect(canonicalizeUrl("https://example.com/about/")?.url).toBe(
      "https://example.com/about",
    );
  });

  it("derives a www-free canonical domain for identity", () => {
    expect(canonicalizeUrl("https://www.example.com/path")?.domain).toBe(
      "example.com",
    );
    expect(canonicalizeUrl("https://example.com")?.domain).toBe("example.com");
  });

  it("does not merge different domains", () => {
    expect(canonicalizeUrl("https://example.com")?.domain).toBe("example.com");
    expect(canonicalizeUrl("https://example.co.uk")?.domain).toBe(
      "example.co.uk",
    );
    expect(canonicalizeUrl("https://notexample.com")?.domain).toBe(
      "notexample.com",
    );
  });

  it("rejects unusable URLs", () => {
    expect(canonicalizeUrl("not a url")).toBeNull();
    expect(canonicalizeUrl("mailto:hi@example.com")).toBeNull();
    expect(canonicalizeUrl("")).toBeNull();
  });
});

/* -------------------------------- Names ---------------------------------- */

describe("normalizeName", () => {
  it("trims and collapses internal whitespace", () => {
    expect(normalizeName("  Joe's   Pizza  ")).toBe("Joe's Pizza");
  });

  it("returns undefined for empty input", () => {
    expect(normalizeName("   ")).toBeUndefined();
    expect(normalizeName(undefined)).toBeUndefined();
  });
});

/* -------------------------------- Phones --------------------------------- */

describe("normalizePhone", () => {
  it("strips separators and normalizes to +digits", () => {
    // The country code cannot be derived from a local number, so the
    // normalized form preserves exactly the digits provided.
    expect(normalizePhone("(305) 555-0100")).toBe("+3055550100");
    expect(normalizePhone("305-555-0100")).toBe("+3055550100");
  });

  it("converts a 00 international prefix to +", () => {
    expect(normalizePhone("0044 20 7946 0958")).toBe("+442079460958");
  });

  it("keeps an existing +", () => {
    expect(normalizePhone("+44 20 7946 0958")).toBe("+442079460958");
  });

  it("rejects unusable structures", () => {
    expect(normalizePhone("abc")).toBeUndefined();
    expect(normalizePhone("12")).toBeUndefined();
  });
});

/* -------------------------------- Emails --------------------------------- */

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Hello@Example.COM ")).toBe("hello@example.com");
  });
});

/* ---------------------------- Normalized record --------------------------- */

describe("normalizeRecord", () => {
  it("produces canonical fields and website status", () => {
    const record: DiscoveryRawRecord = {
      company: "  Acme   Bakery ",
      website: "WWW.AcmeBakery.com",
      phone: "(305) 555-0100",
      email: "  OWNER@ACMEBAKERY.COM ",
      city: "Miami",
    };
    const normalized = normalizeRecord(record, 1);
    expect(normalized.company).toBe("Acme Bakery");
    expect(normalized.website).toBe("https://www.acmebakery.com");
    expect(normalized.canonicalDomain).toBe("acmebakery.com");
    expect(normalized.phone).toBe("+3055550100");
    expect(normalized.email).toBe("owner@acmebakery.com");
    expect(normalized.websiteStatus).toBe("UNKNOWN");
    expect(normalized.confidence).toBe(1);
  });

  it("marks a missing website as NO_WEBSITE", () => {
    expect(
      normalizeRecord({ company: "Corner Shop" }, 1).websiteStatus,
    ).toBe("NO_WEBSITE");
  });

  it("marks an unusable website as INVALID_URL", () => {
    expect(
      normalizeRecord({ company: "Corner Shop", website: "not a url" }, 1)
        .websiteStatus,
    ).toBe("INVALID_URL");
  });

  it("builds prefixed identity keys", () => {
    const normalized = normalizeRecord(
      {
        company: "Acme Bakery",
        website: "acmebakery.com",
        phone: "(305) 555-0100",
        email: "owner@acmebakery.com",
        city: "Miami",
      },
      1,
    );
    const keys = buildIdentityKeys(normalized);
    expect(keys).toContain("email:owner@acmebakery.com");
    expect(keys).toContain("domain:acmebakery.com");
    expect(keys).toContain("phone:+3055550100");
    expect(keys).toContain("name-city:acme bakery|miami");
  });
});

describe("deriveWebsiteReachability", () => {
  it("never claims reachability from presence alone", () => {
    expect(deriveWebsiteReachability(undefined)).toBe("NO_WEBSITE");
    expect(deriveWebsiteReachability("example.com")).toBe("UNKNOWN");
    expect(deriveWebsiteReachability("bad url")).toBe("INVALID_URL");
  });
});

/* ------------------------------- Validation ------------------------------ */

describe("validateRawRecord", () => {
  it("accepts a well-formed record", () => {
    const result = validateRawRecord({
      company: "Acme Bakery",
      email: "owner@acmebakery.com",
      phone: "(305) 555-0100",
      website: "acmebakery.com",
    });
    expect(result.valid).toBe(true);
  });

  it("rejects a missing company name", () => {
    const result = validateRawRecord({ company: "   " });
    expect(result.valid).toBe(false);
    expect(result.reasons.join(" ")).toContain("Company name");
  });

  it("rejects a bad email without claiming deliverability otherwise", () => {
    const result = validateRawRecord({
      company: "Acme",
      email: "not-an-email",
    });
    expect(result.valid).toBe(false);
    expect(result.reasons.join(" ")).toContain("Email");
  });

  it("rejects a malformed phone", () => {
    const result = validateRawRecord({ company: "Acme", phone: "call me" });
    expect(result.valid).toBe(false);
    expect(result.reasons.join(" ")).toContain("Phone");
  });

  it("rejects an invalid website URL", () => {
    const result = validateRawRecord({
      company: "Acme",
      website: "not a url",
    });
    expect(result.valid).toBe(false);
    expect(result.reasons.join(" ")).toContain("Website");
  });

  it("does not reject records that merely lack optional contacts", () => {
    const result = validateRawRecord({ company: "Acme" });
    expect(result.valid).toBe(true);
  });
});

/* ------------------------------- Deduplication --------------------------- */

function identity(id: string, company: string, city?: string) {
  return toBusinessIdentity({ id, company, city });
}

describe("findDuplicate", () => {
  it("matches on the same canonical domain", () => {
    const candidates = [
      toBusinessIdentity({
        id: "b1",
        company: "Acme Bakery",
        website: "https://www.acmebakery.com/",
      }),
    ];
    const record = normalizeRecord(
      { company: "Acme Bakery Inc", website: "acmebakery.com" },
      1,
    );
    expect(findDuplicate(record, candidates)).toEqual({
      matched: true,
      businessId: "b1",
      signal: "domain",
    });
  });

  it("matches on the same normalized phone", () => {
    const candidates = [
      toBusinessIdentity({
        id: "b1",
        company: "Acme Bakery",
        phone: "(305) 555-0100",
      }),
    ];
    const record = normalizeRecord(
      { company: "Acme Bakery", phone: "305-555-0100" },
      1,
    );
    const match = findDuplicate(record, candidates);
    expect(match.matched).toBe(true);
    expect(match.signal).toBe("phone");
  });

  it("matches on the same email", () => {
    const candidates = [
      toBusinessIdentity({
        id: "b1",
        company: "Acme Bakery",
        email: "owner@acmebakery.com",
      }),
    ];
    const record = normalizeRecord(
      { company: "Acme Bakery", email: "OWNER@acmebakery.com" },
      1,
    );
    const match = findDuplicate(record, candidates);
    expect(match.matched).toBe(true);
    expect(match.signal).toBe("email");
  });

  it("matches on exact normalized name + city (medium confidence)", () => {
    const candidates = [identity("b1", "Joe's Pizza", "Miami")];
    const record = normalizeRecord(
      { company: "Joe's Pizza", city: "Miami" },
      1,
    );
    const match = findDuplicate(record, candidates);
    expect(match.matched).toBe(true);
    expect(match.signal).toBe("name+city");
  });

  it("does NOT merge similar names in different cities", () => {
    const candidates = [identity("b1", "Joe's Pizza", "Miami")];
    const record = normalizeRecord(
      { company: "Joe's Pizza", city: "Orlando" },
      1,
    );
    expect(findDuplicate(record, candidates).matched).toBe(false);
  });

  it("does NOT merge merely-similar names", () => {
    const candidates = [identity("b1", "Acme Bakery", "Miami")];
    const record = normalizeRecord(
      { company: "Acme Bakery Co", city: "Miami" },
      1,
    );
    expect(findDuplicate(record, candidates).matched).toBe(false);
  });

  it("keeps records separate when nothing matches", () => {
    const record = normalizeRecord({ company: "Brand New Shop" }, 1);
    expect(findDuplicate(record, []).matched).toBe(false);
  });
});

/* -------------------------------- Enrichment ----------------------------- */

describe("enrichmentUpdates", () => {
  it("fills empty fields on high-confidence signals only", () => {
    const updates = enrichmentUpdates(
      { website: undefined, phone: "+13055550100" },
      normalizeRecord(
        { company: "Acme", website: "acmebakery.com", phone: "+19995550100" },
        1,
      ),
      "domain",
    );
    expect(updates.website).toBe("https://acmebakery.com");
    // Non-empty field is never overwritten.
    expect(updates.phone).toBeUndefined();
  });

  it("never enriches on the name+city signal", () => {
    const updates = enrichmentUpdates(
      { website: undefined },
      normalizeRecord({ company: "Acme", website: "acmebakery.com" }, 1),
      "name+city",
    );
    expect(updates).toEqual({});
  });
});

/* ------------------------------ Readiness -------------------------------- */

describe("discoveryReadiness", () => {
  it("is ready when all required fields are present", () => {
    const result = discoveryReadiness({
      marketCode: "US",
      region: "Florida",
      city: "Miami",
      category: "Restaurants",
      targetCount: 100,
    });
    expect(result.ready).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it("lists exactly the missing fields", () => {
    const result = discoveryReadiness({
      marketCode: "US",
      region: "Florida",
      targetCount: 0,
    });
    expect(result.ready).toBe(false);
    expect(result.missing).toEqual(["city", "category", "target count"]);
  });
});

/* ------------------------------ Transitions ------------------------------ */

describe("canRunTransition", () => {
  it("starts from queued and finishes from running", () => {
    expect(canRunTransition("QUEUED", "RUNNING")).toBe(true);
    expect(canRunTransition("RUNNING", "COMPLETED")).toBe(true);
    expect(canRunTransition("RUNNING", "PARTIAL")).toBe(true);
    expect(canRunTransition("RUNNING", "CANCELLED")).toBe(true);
  });

  it("never leaves a terminal state", () => {
    for (const terminal of ["COMPLETED", "PARTIAL", "FAILED", "CANCELLED"]) {
      expect(
        canRunTransition(terminal as never, "RUNNING"),
      ).toBe(false);
    }
  });
});

/* -------------------------------- Registry ------------------------------- */

describe("DISCOVERY_PROVIDERS", () => {
  it("has unique slugs", () => {
    const slugs = DISCOVERY_PROVIDERS.map((provider) => provider.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("ships exactly one configured provider — the operator import", () => {
    const configured = DISCOVERY_PROVIDERS.filter(
      (provider) => provider.configured,
    );
    expect(configured.map((provider) => provider.slug)).toEqual(["csv-import"]);
  });

  it("documents requirements for every unconfigured provider", () => {
    for (const provider of DISCOVERY_PROVIDERS) {
      if (provider.configured) continue;
      expect(provider.requirements.length).toBeGreaterThan(0);
      expect(provider.docs.length).toBeGreaterThan(0);
    }
  });
});
