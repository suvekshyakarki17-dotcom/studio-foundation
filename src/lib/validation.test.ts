import { describe, expect, it } from "vitest";
import {
  clientEditSchema,
  clientFormSchema,
  firstFormError,
  leadEditSchema,
  leadFormSchema,
  projectFormSchema,
} from "./validation";

describe("leadFormSchema", () => {
  it("accepts a minimal valid lead", () => {
    const result = leadFormSchema.parse({ company: "  Acme Studio  " });
    expect(result.company).toBe("Acme Studio");
    expect(result.email).toBeUndefined();
    expect(result.name).toBeUndefined();
  });

  it("rejects a missing company name", () => {
    const result = leadFormSchema.safeParse({ company: "   " });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(firstFormError(result.error)).toMatch(/Company name is required/i);
    }
  });

  it("rejects an invalid email and normalizes a valid one", () => {
    const bad = leadFormSchema.safeParse({
      company: "Acme",
      email: "not-an-email",
    });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      expect(firstFormError(bad.error)).toMatch(/valid email/i);
    }

    const good = leadFormSchema.parse({
      company: "Acme",
      email: "  Jane@Example.COM  ",
    });
    expect(good.email).toBe("jane@example.com");
  });

  it("turns empty optional fields into undefined", () => {
    const result = leadFormSchema.parse({
      company: "Acme",
      name: "",
      website: "   ",
      source: "",
      notes: "",
    });
    expect(result.name).toBeUndefined();
    expect(result.website).toBeUndefined();
    expect(result.source).toBeUndefined();
    expect(result.notes).toBeUndefined();
  });

  it("rejects over-long notes", () => {
    const result = leadFormSchema.safeParse({
      company: "Acme",
      notes: "x".repeat(1001),
    });
    expect(result.success).toBe(false);
  });
});

describe("leadEditSchema", () => {
  it("requires a valid status", () => {
    const ok = leadEditSchema.safeParse({ company: "Acme", status: "QUALIFIED" });
    expect(ok.success).toBe(true);
    const bad = leadEditSchema.safeParse({ company: "Acme", status: "NOPE" });
    expect(bad.success).toBe(false);
  });
});

describe("clientFormSchema", () => {
  it("accepts a valid client", () => {
    const result = clientFormSchema.parse({
      company: "Northwind",
      email: "hello@northwind.test",
      phone: "+1 555 0100",
    });
    expect(result.company).toBe("Northwind");
    expect(result.phone).toBe("+1 555 0100");
  });

  it("rejects an invalid email", () => {
    const result = clientFormSchema.safeParse({
      company: "Northwind",
      email: "nope",
    });
    expect(result.success).toBe(false);
  });
});

describe("clientEditSchema", () => {
  it("requires a valid status", () => {
    expect(clientEditSchema.safeParse({ company: "Northwind", status: "PAUSED" }).success).toBe(true);
    expect(clientEditSchema.safeParse({ company: "Northwind", status: "?" }).success).toBe(false);
  });
});

describe("projectFormSchema", () => {
  it("accepts a minimal project", () => {
    const result = projectFormSchema.parse({ name: "  Rebrand  " });
    expect(result.name).toBe("Rebrand");
    expect(result.clientId).toBeUndefined();
  });

  it("turns an empty client select into undefined", () => {
    const result = projectFormSchema.parse({ name: "Rebrand", clientId: "" });
    expect(result.clientId).toBeUndefined();
  });

  it("rejects a missing name", () => {
    const result = projectFormSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });
});
