import { z } from "zod";

// ---------------------------------------------------------------------------
// Zod field schemas shared by the create_contact and update_contact tools.
// Kept in their own module (rather than inline in index.ts) so the two tools
// and the input-validation tests all use one definition.
// ---------------------------------------------------------------------------

const name = z.string().max(500);

const firstName = z.string().min(1).max(500);

const birthday = z
  .string()
  .regex(
    /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/,
    "Birthday must be a valid date in YYYY-MM-DD format, e.g. 1990-05-15",
  )
  .refine(
    (v) => {
      try {
        return new Date(v + "T00:00:00").toISOString().startsWith(v);
      } catch {
        return false;
      }
    },
    { message: "Birthday date does not exist on the calendar (e.g. February 30 is not valid)" },
  );

const phoneNumber = z
  .string()
  .min(3, "Phone number is too short")
  .regex(
    /^\+?[\d\s\-().]+$/,
    "Phone number must contain only digits, spaces, hyphens, dots, or parentheses (with optional + prefix), e.g. +14155551234 or (415) 555-1234",
  );

const emailAddress = z
  .string()
  .min(1, "Email address cannot be empty")
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Email address must be in user@domain format, e.g. alice@example.com");

const urlAddress = z
  .string()
  .min(1, "URL cannot be empty")
  .regex(/^https?:\/\/\S+$/, "URL must start with http:// or https://, e.g. https://example.com");

/** Optional contact fields accepted by both create_contact and update_contact. */
const contactFields = {
  lastName: name.optional().describe("Last name"),
  nickname: name.optional().describe("Nickname"),
  middleName: name.optional().describe("Middle name"),
  jobTitle: name.optional().describe("Job title"),
  departmentName: name.optional().describe("Department name"),
  organizationName: name.optional().describe("Organization / company name"),
  birthday: birthday.optional().describe("Birthday in YYYY-MM-DD format"),
  phoneNumbers: z
    .array(phoneNumber)
    .optional()
    .describe("Phone numbers (e.g. +14155551234 or (415) 555-1234). On update, replaces all existing phone numbers."),
  emailAddresses: z
    .array(emailAddress)
    .optional()
    .describe("Email addresses. On update, replaces all existing email addresses."),
  urlAddresses: z
    .array(urlAddress)
    .optional()
    .describe("URLs (website, social profile, etc.). On update, replaces all existing URLs."),
};

export const createContactFields = {
  firstName: firstName.describe("First name (required)"),
  ...contactFields,
};

export const updateContactFields = {
  identifier: z.string().min(1).describe("Contact identifier to update"),
  firstName: firstName.optional().describe("New first name"),
  ...contactFields,
};
