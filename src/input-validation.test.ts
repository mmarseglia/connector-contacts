import { describe, it, expect } from "vitest";
import { z } from "zod";

import { createContactFields, updateContactFields } from "./schemas.js";

// ---------------------------------------------------------------------------
// Input validation — verifies that malformed phone numbers, email addresses,
// URLs, and birthdays are rejected by the create_contact / update_contact
// schemas before they reach the native macOS Contacts API.
// ---------------------------------------------------------------------------

const currentCreateSchema = z.object(createContactFields);
const currentUpdateSchema = z.object(updateContactFields);

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
