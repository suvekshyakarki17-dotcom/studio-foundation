import { describe, expect, it } from "vitest";
import {
  SCRAPEGRAPHAI_AUTH_HEADER,
  SCRAPEGRAPHAI_MAX_RESULTS,
  SCRAPEGRAPHAI_SEARCH_ENDPOINT,
  buildLocalSearchPayload,
  buildWebsiteResolutionPayload,
  mapSearchResponseToRecords,
  mapWebsiteResolutionResponse,
} from "./scrapegraphai";

/* ------------------------------ Request build ---------------------------- */

describe("buildLocalSearchPayload", () => {
  it("builds a localized restaurant discovery query", () => {
    const payload = buildLocalSearchPayload({
      city: "Miami",
      region: "Florida",
      category: "Restaurants",
      limit: 5,
      country: "us",
    });
    expect(payload.query).toBe("Best Restaurants in Miami, Florida");
    expect(payload.numResults).toBe(5);
    expect(payload.country).toBe("us");
    expect(payload.prompt).toContain("Restaurants");
    expect(payload.prompt).toContain("Miami");
    expect(payload.schema).toHaveProperty("properties.businesses");
  });

  it("clamps the result cap to the API maximum (1..20)", () => {
    expect(buildLocalSearchPayload({ limit: 100 }).numResults).toBe(
      SCRAPEGRAPHAI_MAX_RESULTS,
    );
    expect(buildLocalSearchPayload({ limit: 0 }).numResults).toBe(1);
    expect(buildLocalSearchPayload({ limit: -3 }).numResults).toBe(1);
  });

  it("defaults the country to us and lowercases it", () => {
    expect(buildLocalSearchPayload({ limit: 3 }).country).toBe("us");
    expect(
      buildLocalSearchPayload({ limit: 3, country: "US" }).country,
    ).toBe("us");
  });
});

/* ------------------------------ Response map ----------------------------- */

describe("mapSearchResponseToRecords", () => {
  it("maps a businesses array from the json field", () => {
    const mapped = mapSearchResponseToRecords(
      {
        id: "req-1",
        results: [{ url: "https://example.com/list", title: "Miami Restaurants" }],
        json: {
          businesses: [
            {
              name: "Joe's Pizza",
              website: "joespizza.com",
              phone: "(305) 555-0100",
              email: "hello@joespizza.com",
              address: "100 Ocean Dr, Miami, FL",
            },
          ],
        },
      },
      { city: "Miami", region: "Florida", category: "Restaurants" },
    );
    expect(mapped.returned).toBe(1);
    expect(mapped.unmappable).toBe(0);
    expect(mapped.records[0]).toMatchObject({
      company: "Joe's Pizza",
      website: "joespizza.com",
      phone: "(305) 555-0100",
      email: "hello@joespizza.com",
      address: "100 Ocean Dr, Miami, FL",
      city: "Miami",
      region: "Florida",
      category: "Restaurants",
    });
  });

  it("fills missing location fields from the campaign fallback", () => {
    const mapped = mapSearchResponseToRecords(
      { json: { businesses: [{ name: "Corner Grill" }] } },
      { city: "Miami", region: "Florida", category: "Restaurants" },
    );
    expect(mapped.records[0].city).toBe("Miami");
    expect(mapped.records[0].region).toBe("Florida");
    expect(mapped.records[0].category).toBe("Restaurants");
  });

  it("tolerates a flat array and local_results shapes", () => {
    const flat = mapSearchResponseToRecords({ json: [{ name: "A" }] });
    expect(flat.records[0].company).toBe("A");

    const local = mapSearchResponseToRecords({
      json: { local_results: [{ name: "B", phone: "305-555-0100" }] },
    });
    expect(local.records[0].company).toBe("B");
  });

  it("counts items without a usable company name as unmappable", () => {
    const mapped = mapSearchResponseToRecords({
      json: {
        businesses: [
          { name: "Good Spot" },
          { website: "orphan.com" },
          null,
          "garbage",
        ],
      },
    });
    expect(mapped.returned).toBe(4);
    expect(mapped.unmappable).toBe(3);
    expect(mapped.records).toHaveLength(1);
  });

  it("coerces numeric fields and trims whitespace", () => {
    const mapped = mapSearchResponseToRecords({
      json: {
        businesses: [
          { name: "  Diner  ", phone: 3055550100, website: "diner.example.com" },
        ],
      },
    });
    expect(mapped.records[0].company).toBe("Diner");
    expect(mapped.records[0].phone).toBe("3055550100");
  });

  it("returns empty for a payload with no usable extraction", () => {
    expect(mapSearchResponseToRecords({}).records).toEqual([]);
    expect(mapSearchResponseToRecords({ json: { note: "no data" } }).records).toEqual(
      [],
    );
    expect(mapSearchResponseToRecords("{not json").records).toEqual([]);
  });
});

/* ------------------------ Website resolution ----------------------------- */

describe("buildWebsiteResolutionPayload", () => {
  it("builds a single batched lookup covering every business", () => {
    const payload = buildWebsiteResolutionPayload({
      businesses: [
        { name: "Joe's Pizza", city: "Miami", region: "Florida" },
        { name: "Corner Grill", city: "Miami" },
      ],
      country: "us",
    });
    expect(payload.numResults).toBe(1);
    expect(payload.country).toBe("us");
    expect(payload.query).toContain("Joe's Pizza, Miami, Florida");
    expect(payload.query).toContain("Corner Grill, Miami");
    expect(payload.prompt).toContain("official");
    expect(payload.prompt).toContain("Never invent");
    expect(payload.schema).toHaveProperty("properties.businesses");
  });
});

describe("mapWebsiteResolutionResponse", () => {
  it("maps a resolution array with found/hasWebsite flags", () => {
    const mapped = mapWebsiteResolutionResponse({
      json: {
        businesses: [
          {
            name: "Joe's Pizza",
            found: true,
            hasWebsite: false,
            phone: "(305) 555-0100",
            facebook: "facebook.com/joespizza",
            details: "Listed on Yelp; no official site found",
          },
          {
            name: "Corner Grill",
            found: true,
            hasWebsite: true,
            website: "cornergrill.com",
          },
        ],
      },
    });
    expect(mapped.returned).toBe(2);
    expect(mapped.unmappable).toBe(0);
    expect(mapped.items[0]).toMatchObject({
      name: "Joe's Pizza",
      found: true,
      hasWebsite: false,
      website: undefined,
      phone: "(305) 555-0100",
      facebook: "facebook.com/joespizza",
    });
    expect(mapped.items[1]).toMatchObject({
      name: "Corner Grill",
      hasWebsite: true,
      website: "cornergrill.com",
    });
  });

  it("never trusts a website when hasWebsite is false", () => {
    const mapped = mapWebsiteResolutionResponse({
      json: {
        businesses: [
          {
            name: "Diner",
            found: true,
            hasWebsite: false,
            website: "diner.example.com",
          },
        ],
      },
    });
    expect(mapped.items[0].website).toBeUndefined();
  });

  it("coerces string booleans and drops entries without a name", () => {
    const mapped = mapWebsiteResolutionResponse({
      json: {
        businesses: [
          { name: "A", found: "true", hasWebsite: "no" },
          { found: true, hasWebsite: false },
        ],
      },
    });
    expect(mapped.items).toHaveLength(1);
    expect(mapped.items[0]).toMatchObject({ found: true, hasWebsite: false });
    expect(mapped.unmappable).toBe(1);
  });
});

/* -------------------------------- Constants ------------------------------ */

describe("ScrapeGraphAI endpoint constants", () => {
  it("points at the V2 search API with the SGAI-APIKEY header", () => {
    expect(SCRAPEGRAPHAI_SEARCH_ENDPOINT).toBe(
      "https://v2-api.scrapegraphai.com/api/search",
    );
    expect(SCRAPEGRAPHAI_AUTH_HEADER).toBe("SGAI-APIKEY");
  });
});
