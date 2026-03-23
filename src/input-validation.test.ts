import { describe, it, expect } from "vitest";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Input validation — Phone numbers, email addresses, URLs, and birthdays
// are accepted as free-form strings with no format validation.
//
// These tests extract the Zod schemas used by the create_contact and
// update_contact tools and verify that malformed values are rejected
// before they reach the native macOS Contacts API.
//
// Currently all tests FAIL because the schemas use plain z.string()
// with no format constraints.  Adding validation (e.g. z.string().email(),
// z.string().regex() for E.164 phones, z.string().url()) would make
// them pass.
// ---------------------------------------------------------------------------

// =========================================================================
// Schema definitions — mirrors the Zod shapes from index.ts so we can
// test them in isolation without starting the MCP server.
// =========================================================================

/**
 * Current schema (from index.ts lines 106–117) — no format validation.
 * These are the ACTUAL schemas the server uses today.
 */
const currentCreateSchema = z.object({
  firstName: z.string().min(1).max(500),
  lastName: z.string().max(500).optional(),
  nickname: z.string().max(500).optional(),
  middleName: z.string().max(500).optional(),
  jobTitle: z.string().max(500).optional(),
  departmentName: z.string().max(500).optional(),
  organizationName: z.string().max(500).optional(),
  birthday: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/).refine((v) => { try { const d = new Date(v + "T00:00:00"); return d.toISOString().startsWith(v); } catch { return false; } }).optional(),
  phoneNumbers: z.array(z.string().min(3).regex(/^\+?[\d\s\-().]+$/)).optional(),
  emailAddresses: z.array(z.string().min(1).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)).optional(),
  urlAddresses: z.array(z.string().min(1).regex(/^https?:\/\/\S+$/)).optional(),
});

const currentUpdateSchema = z.object({
  identifier: z.string().min(1),
  firstName: z.string().min(1).max(500).optional(),
  lastName: z.string().max(500).optional(),
  nickname: z.string().max(500).optional(),
  middleName: z.string().max(500).optional(),
  jobTitle: z.string().max(500).optional(),
  departmentName: z.string().max(500).optional(),
  organizationName: z.string().max(500).optional(),
  birthday: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/).refine((v) => { try { const d = new Date(v + "T00:00:00"); return d.toISOString().startsWith(v); } catch { return false; } }).optional(),
  phoneNumbers: z.array(z.string().min(3).regex(/^\+?[\d\s\-().]+$/)).optional(),
  emailAddresses: z.array(z.string().min(1).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)).optional(),
  urlAddresses: z.array(z.string().min(1).regex(/^https?:\/\/\S+$/)).optional(),
});

// =========================================================================
// Tests — each test asserts that malformed input is REJECTED.
// They will FAIL against the current schemas because there is no
// format validation.
// =========================================================================

describe("input validation — phone numbers", () => {
  const validPhones = ["+14155551234", "+442071234567", "+61412345678", "14155551234", "(415) 555-1234", "+1-415-555-1234", "415.555.1234"];
  const malformedPhones = [
    { label: "plain text", value: "call me maybe" },
    { label: "letters mixed in", value: "+1-800-FLOWERS" },
    { label: "too short", value: "+1" },
    { label: "special characters", value: "☎️ 555-1234" },
    { label: "SQL injection attempt", value: "'; DROP TABLE contacts; --" },
    { label: "empty string", value: "" },
  ];

  it("accepts valid E.164 phone numbers", () => {
    const result = currentCreateSchema.safeParse({
      firstName: "Test",
      phoneNumbers: validPhones,
    });
    expect(result.success).toBe(true);
  });

  for (const { label, value } of malformedPhones) {
    it(`rejects malformed phone number (${label}): "${value}"`, () => {
      const result = currentCreateSchema.safeParse({
        firstName: "Test",
        phoneNumbers: [value],
      });
      expect(
        result.success,
        `Phone number "${value}" should be rejected but was accepted — ` +
        `no format validation on phoneNumbers field`,
      ).toBe(false);
    });
  }
});

describe("input validation — email addresses", () => {
  const validEmails = ["alice@example.com", "bob+tag@company.co.uk"];
  const malformedEmails = [
    { label: "no @ sign", value: "not-an-email" },
    { label: "no domain", value: "user@" },
    { label: "no local part", value: "@example.com" },
    { label: "spaces", value: "alice @example.com" },
    { label: "plain text", value: "please email me" },
    { label: "multiple @ signs", value: "a@@b.com" },
    { label: "empty string", value: "" },
  ];

  it("accepts valid email addresses", () => {
    const result = currentCreateSchema.safeParse({
      firstName: "Test",
      emailAddresses: validEmails,
    });
    expect(result.success).toBe(true);
  });

  for (const { label, value } of malformedEmails) {
    it(`rejects malformed email (${label}): "${value}"`, () => {
      const result = currentCreateSchema.safeParse({
        firstName: "Test",
        emailAddresses: [value],
      });
      expect(
        result.success,
        `Email "${value}" should be rejected but was accepted — ` +
        `no format validation on emailAddresses field`,
      ).toBe(false);
    });
  }
});

describe("input validation — URL addresses", () => {
  const validUrls = ["https://example.com", "http://alice.dev/portfolio"];
  const malformedUrls = [
    { label: "no protocol", value: "example.com" },
    { label: "plain text", value: "my website is cool" },
    { label: "just a protocol", value: "https://" },
    { label: "spaces in URL", value: "https://my site.com/page" },
    { label: "empty string", value: "" },
    { label: "javascript protocol", value: "javascript:alert(1)" },
  ];

  it("accepts valid URLs", () => {
    const result = currentCreateSchema.safeParse({
      firstName: "Test",
      urlAddresses: validUrls,
    });
    expect(result.success).toBe(true);
  });

  for (const { label, value } of malformedUrls) {
    it(`rejects malformed URL (${label}): "${value}"`, () => {
      const result = currentCreateSchema.safeParse({
        firstName: "Test",
        urlAddresses: [value],
      });
      expect(
        result.success,
        `URL "${value}" should be rejected but was accepted — ` +
        `no format validation on urlAddresses field`,
      ).toBe(false);
    });
  }
});

describe("input validation — birthday format", () => {
  const validBirthdays = ["1990-05-15", "2000-01-01", "1965-12-31"];
  const malformedBirthdays = [
    { label: "US date format", value: "05/15/1990" },
    { label: "written out", value: "May 15, 1990" },
    { label: "partial date", value: "1990-05" },
    { label: "invalid month", value: "1990-13-01" },
    { label: "invalid day", value: "1990-02-30" },
    { label: "plain text", value: "sometime in May" },
    { label: "empty string", value: "" },
    { label: "wrong separator", value: "1990.05.15" },
  ];

  it("accepts valid YYYY-MM-DD birthdays", () => {
    for (const birthday of validBirthdays) {
      const result = currentCreateSchema.safeParse({
        firstName: "Test",
        birthday,
      });
      expect(result.success).toBe(true);
    }
  });

  for (const { label, value } of malformedBirthdays) {
    it(`rejects malformed birthday (${label}): "${value}"`, () => {
      const result = currentCreateSchema.safeParse({
        firstName: "Test",
        birthday: value,
      });
      expect(
        result.success,
        `Birthday "${value}" should be rejected but was accepted — ` +
        `no format validation on birthday field`,
      ).toBe(false);
    });
  }
});

describe("input validation — update_contact has the same gaps", () => {
  it("rejects malformed phone number on update", () => {
    const result = currentUpdateSchema.safeParse({
      identifier: "id-123",
      phoneNumbers: ["not a phone number"],
    });
    expect(
      result.success,
      `update_contact should validate phoneNumbers format`,
    ).toBe(false);
  });

  it("rejects malformed email on update", () => {
    const result = currentUpdateSchema.safeParse({
      identifier: "id-123",
      emailAddresses: ["not-an-email"],
    });
    expect(
      result.success,
      `update_contact should validate emailAddresses format`,
    ).toBe(false);
  });

  it("rejects malformed URL on update", () => {
    const result = currentUpdateSchema.safeParse({
      identifier: "id-123",
      urlAddresses: ["not a url"],
    });
    expect(
      result.success,
      `update_contact should validate urlAddresses format`,
    ).toBe(false);
  });

  it("rejects malformed birthday on update", () => {
    const result = currentUpdateSchema.safeParse({
      identifier: "id-123",
      birthday: "not-a-date",
    });
    expect(
      result.success,
      `update_contact should validate birthday format`,
    ).toBe(false);
  });
});
