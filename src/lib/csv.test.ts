import { describe, expect, it } from "vitest";
import { parseCsvLines, parseDiscoveryCsv } from "./csv";

describe("parseCsvLines", () => {
  it("parses simple comma rows", () => {
    expect(parseCsvLines("a,b\nc,d").rows).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("handles quoted fields containing commas", () => {
    expect(parseCsvLines('a,"b, c",d').rows).toEqual([["a", "b, c", "d"]]);
  });

  it("handles escaped quotes", () => {
    expect(parseCsvLines('"say ""hi"""').rows).toEqual([['say "hi"']]);
  });

  it("detects tab delimiters", () => {
    expect(parseCsvLines("a\tb\tc").rows).toEqual([["a", "b", "c"]]);
  });

  it("reports an unclosed quote", () => {
    const result = parseCsvLines('a,"unclosed');
    expect(result.error).toBeTruthy();
    expect(result.rows).toEqual([]);
  });
});

describe("parseDiscoveryCsv", () => {
  it("maps header columns to record fields", () => {
    const { records, error } = parseDiscoveryCsv(
      "company,email,phone,website,city,category\n" +
        "Joe's Pizza,john@joespizza.com,(305) 555-0100,joespizza.com,Miami,Restaurants",
    );
    expect(error).toBeUndefined();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      company: "Joe's Pizza",
      email: "john@joespizza.com",
      phone: "(305) 555-0100",
      website: "joespizza.com",
      city: "Miami",
      category: "Restaurants",
    });
  });

  it("supports positional rows without a header", () => {
    const { records } = parseDiscoveryCsv(
      "Acme Bakery,,owner@acme.com,,acmebakery.com,Miami,Bakery",
    );
    expect(records[0]).toMatchObject({
      company: "Acme Bakery",
      email: "owner@acme.com",
      website: "acmebakery.com",
      city: "Miami",
      category: "Bakery",
    });
  });

  it("splits socials on separators", () => {
    const { records } = parseDiscoveryCsv(
      "company,socials\nCafe X,instagram.com/cafex;facebook.com/cafex",
    );
    expect(records[0]?.socials).toEqual([
      "instagram.com/cafex",
      "facebook.com/cafex",
    ]);
  });

  it("drops rows without a company name", () => {
    const { records } = parseDiscoveryCsv("company,email\n,orphan@x.com\nReal Co,real@x.com");
    expect(records).toHaveLength(1);
    expect(records[0]?.company).toBe("Real Co");
  });

  it("errors on empty input", () => {
    expect(parseDiscoveryCsv("  \n ").error).toBeTruthy();
  });
});
