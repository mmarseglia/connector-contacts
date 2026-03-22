import { vi, describe, it, expect, beforeEach } from "vitest";

// Mock the native module before any imports that depend on it.
// Vitest hoists vi.mock() above all imports automatically.
vi.mock("node-mac-contacts", () => {
  const mod = {
    getAuthStatus: vi.fn(),
    requestAccess: vi.fn(),
    getAllContacts: vi.fn(),
    getContactsByName: vi.fn(),
    addNewContact: vi.fn(),
    updateContact: vi.fn(),
    deleteContact: vi.fn(),
  };
  return { default: mod, ...mod };
});

import contacts from "node-mac-contacts";
import type { ContactBasic, ContactFull } from "./types.js";
import {
  getAuthStatus,
  requestAccess,
  ensureAccess,
  getAllContacts,
  searchContacts,
  getContactDetails,
  createContact,
  updateContact,
  deleteContact,
} from "./contacts-native.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CONTACT_ALICE: ContactBasic = {
  identifier: "id-alice-001",
  firstName: "Alice",
  lastName: "Smith",
  nickname: "",
  birthday: "1990-05-15",
  phoneNumbers: ["+14155551234"],
  emailAddresses: ["alice@example.com"],
  postalAddresses: [],
};

const CONTACT_BOB: ContactBasic = {
  identifier: "id-bob-002",
  firstName: "Bob",
  lastName: "",
  nickname: "Bobby",
  birthday: "",
  phoneNumbers: [],
  emailAddresses: ["bob@example.com"],
  postalAddresses: [],
};

const CONTACT_ALICE_FULL: ContactFull = {
  ...CONTACT_ALICE,
  jobTitle: "Engineer",
  departmentName: "R&D",
  organizationName: "Acme Corp",
  middleName: "Marie",
  note: "VIP contact",
  urlAddresses: ["https://alice.dev"],
  socialProfiles: [{ label: "Twitter", value: "@alice" }],
  instantMessageAddresses: [],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// Most operations call ensureAccess() internally, which checks getAuthStatus.
// Default to "Authorized" so existing tests pass without extra mocking.
beforeEach(() => {
  vi.mocked(contacts.getAuthStatus).mockReturnValue("Authorized");
});

describe("ensureAccess", () => {
  it("resolves immediately when status is Authorized", async () => {
    vi.mocked(contacts.getAuthStatus).mockReturnValue("Authorized");

    await expect(ensureAccess()).resolves.toBeUndefined();
    expect(contacts.requestAccess).not.toHaveBeenCalled();
  });

  it("resolves immediately when status is Limited", async () => {
    vi.mocked(contacts.getAuthStatus).mockReturnValue("Limited");

    await expect(ensureAccess()).resolves.toBeUndefined();
    expect(contacts.requestAccess).not.toHaveBeenCalled();
  });

  it("calls requestAccess when status is Not Determined and resolves on Authorized", async () => {
    vi.mocked(contacts.getAuthStatus).mockReturnValue("Not Determined");
    vi.mocked(contacts.requestAccess).mockResolvedValue("Authorized");

    await expect(ensureAccess()).resolves.toBeUndefined();
    expect(contacts.requestAccess).toHaveBeenCalled();
  });

  it("throws when status is Not Determined and user denies access", async () => {
    vi.mocked(contacts.getAuthStatus).mockReturnValue("Not Determined");
    vi.mocked(contacts.requestAccess).mockResolvedValue("Denied");

    await expect(ensureAccess()).rejects.toThrow(
      /Contacts access was not granted/,
    );
  });

  it("throws when status is Denied", async () => {
    vi.mocked(contacts.getAuthStatus).mockReturnValue("Denied");

    await expect(ensureAccess()).rejects.toThrow(
      /Contacts access is currently "Denied"/,
    );
    expect(contacts.requestAccess).not.toHaveBeenCalled();
  });

  it("throws when status is Restricted", async () => {
    vi.mocked(contacts.getAuthStatus).mockReturnValue("Restricted");

    await expect(ensureAccess()).rejects.toThrow(
      /Contacts access is currently "Restricted"/,
    );
  });
});

describe("getAuthStatus", () => {
  it("returns the authorization status string from the native module", async () => {
    vi.mocked(contacts.getAuthStatus).mockReturnValue("Authorized");

    expect(await getAuthStatus()).toBe("Authorized");
  });

  it("propagates other status values like Denied", async () => {
    vi.mocked(contacts.getAuthStatus).mockReturnValue("Denied");

    expect(await getAuthStatus()).toBe("Denied");
  });
});

describe("requestAccess", () => {
  it("returns the resolved access result from the native module", async () => {
    vi.mocked(contacts.requestAccess).mockResolvedValue("Authorized");

    expect(await requestAccess()).toBe("Authorized");
  });
});

describe("getAllContacts", () => {
  it("returns all contacts from the native module with search extras", async () => {
    vi.mocked(contacts.getAllContacts).mockReturnValue([
      CONTACT_ALICE,
      CONTACT_BOB,
    ]);

    expect(await getAllContacts()).toEqual([CONTACT_ALICE, CONTACT_BOB]);
    expect(contacts.getAllContacts).toHaveBeenCalledWith(["jobTitle", "organizationName"]);
  });

  it("returns an empty array when no contacts exist", async () => {
    vi.mocked(contacts.getAllContacts).mockReturnValue([]);

    expect(await getAllContacts()).toEqual([]);
  });
});

describe("searchContacts", () => {
  it("passes the query to getContactsByName with search extras and returns results", async () => {
    vi.mocked(contacts.getContactsByName).mockReturnValue([CONTACT_ALICE]);

    const results = await searchContacts("Alice");

    expect(results).toEqual([CONTACT_ALICE]);
    expect(contacts.getContactsByName).toHaveBeenCalledWith("Alice", ["jobTitle", "organizationName"]);
  });

  it("falls back to manual search when getContactsByName returns empty", async () => {
    vi.mocked(contacts.getContactsByName).mockReturnValue([]);
    vi.mocked(contacts.getAllContacts).mockReturnValue([
      CONTACT_ALICE,
      CONTACT_BOB,
    ]);

    const results = await searchContacts("Alice Smith");

    expect(results).toEqual([CONTACT_ALICE]);
    expect(contacts.getAllContacts).toHaveBeenCalledWith(["jobTitle", "organizationName"]);
  });

  it("fallback matches on first name alone", async () => {
    vi.mocked(contacts.getContactsByName).mockReturnValue([]);
    vi.mocked(contacts.getAllContacts).mockReturnValue([
      CONTACT_ALICE,
      CONTACT_BOB,
    ]);

    const results = await searchContacts("Alice");

    expect(results).toEqual([CONTACT_ALICE]);
  });

  it("fallback matches on last name alone", async () => {
    vi.mocked(contacts.getContactsByName).mockReturnValue([]);
    vi.mocked(contacts.getAllContacts).mockReturnValue([
      CONTACT_ALICE,
      CONTACT_BOB,
    ]);

    const results = await searchContacts("Smith");

    expect(results).toEqual([CONTACT_ALICE]);
  });

  it("fallback matches on nickname", async () => {
    vi.mocked(contacts.getContactsByName).mockReturnValue([]);
    vi.mocked(contacts.getAllContacts).mockReturnValue([
      CONTACT_ALICE,
      CONTACT_BOB,
    ]);

    const results = await searchContacts("Bobby");

    expect(results).toEqual([CONTACT_BOB]);
  });

  it("fallback matches on email address", async () => {
    vi.mocked(contacts.getContactsByName).mockReturnValue([]);
    vi.mocked(contacts.getAllContacts).mockReturnValue([
      CONTACT_ALICE,
      CONTACT_BOB,
    ]);

    const results = await searchContacts("alice@example.com");

    expect(results).toEqual([CONTACT_ALICE]);
  });

  it("fallback is case-insensitive", async () => {
    vi.mocked(contacts.getContactsByName).mockReturnValue([]);
    vi.mocked(contacts.getAllContacts).mockReturnValue([
      CONTACT_ALICE,
      CONTACT_BOB,
    ]);

    const results = await searchContacts("alice smith");

    expect(results).toEqual([CONTACT_ALICE]);
  });

  it("does not trigger fallback when native API returns results", async () => {
    vi.mocked(contacts.getContactsByName).mockReturnValue([CONTACT_ALICE]);

    await searchContacts("Alice");

    expect(contacts.getAllContacts).not.toHaveBeenCalled();
  });

  it("returns empty array when neither native nor fallback finds matches", async () => {
    vi.mocked(contacts.getContactsByName).mockReturnValue([]);
    vi.mocked(contacts.getAllContacts).mockReturnValue([
      CONTACT_ALICE,
      CONTACT_BOB,
    ]);

    const results = await searchContacts("Zara");

    expect(results).toEqual([]);
  });
});

describe("getContactDetails", () => {
  it("returns full contact via targeted name search (happy path)", async () => {
    // First call: getAllContacts() with no args → basic list
    vi.mocked(contacts.getAllContacts).mockReturnValueOnce([CONTACT_ALICE]);
    // Targeted search by first name with extra properties
    vi.mocked(contacts.getContactsByName).mockReturnValueOnce([
      CONTACT_ALICE_FULL,
    ]);

    const result = await getContactDetails("id-alice-001");

    expect(result).toEqual(CONTACT_ALICE_FULL);
    expect(contacts.getContactsByName).toHaveBeenCalledWith(
      "Alice",
      expect.any(Array),
    );
  });

  it("falls back to full scan when targeted search misses", async () => {
    // First call: basic lookup finds Alice
    vi.mocked(contacts.getAllContacts).mockReturnValueOnce([CONTACT_ALICE]);
    // Targeted search returns empty (miss)
    vi.mocked(contacts.getContactsByName).mockReturnValueOnce([]);
    // Fallback: full scan with extras finds Alice
    vi.mocked(contacts.getAllContacts).mockReturnValueOnce([
      CONTACT_ALICE_FULL,
    ]);

    const result = await getContactDetails("id-alice-001");

    expect(result).toEqual(CONTACT_ALICE_FULL);
    // getAllContacts should have been called twice (basic + fallback with extras)
    expect(contacts.getAllContacts).toHaveBeenCalledTimes(2);
  });

  it("falls back to full scan when contact has no name", async () => {
    const noNameBasic: ContactBasic = {
      ...CONTACT_ALICE,
      identifier: "id-noname",
      firstName: "",
      lastName: "",
    };
    const noNameFull: ContactFull = {
      ...CONTACT_ALICE_FULL,
      identifier: "id-noname",
      firstName: "",
      lastName: "",
    };

    // Basic lookup finds the nameless contact
    vi.mocked(contacts.getAllContacts).mockReturnValueOnce([noNameBasic]);
    // Fallback full scan (searchName is empty, so getContactsByName is skipped)
    vi.mocked(contacts.getAllContacts).mockReturnValueOnce([noNameFull]);

    const result = await getContactDetails("id-noname");

    expect(result).toEqual(noNameFull);
    // getContactsByName should NOT be called because searchName is ""
    expect(contacts.getContactsByName).not.toHaveBeenCalled();
  });

  it("returns null when identifier is not found anywhere", async () => {
    vi.mocked(contacts.getAllContacts).mockReturnValueOnce([CONTACT_ALICE]);
    vi.mocked(contacts.getContactsByName).mockReturnValueOnce([
      CONTACT_ALICE_FULL,
    ]);
    // Fallback full scan also doesn't find the id
    vi.mocked(contacts.getAllContacts).mockReturnValueOnce([
      CONTACT_ALICE_FULL,
    ]);

    const result = await getContactDetails("nonexistent-id");

    expect(result).toBeNull();
  });
});

describe("createContact", () => {
  it("passes the input to addNewContact and returns the result", async () => {
    vi.mocked(contacts.addNewContact).mockReturnValue(true);

    const input = { firstName: "Alice", lastName: "Smith" };
    expect(await createContact(input)).toBe(true);
    expect(contacts.addNewContact).toHaveBeenCalledWith(input);
  });
});

describe("updateContact", () => {
  it("passes the input with identifier to updateContact", async () => {
    vi.mocked(contacts.updateContact).mockReturnValue(true);

    const input = { identifier: "id-1", firstName: "Alice" };
    expect(await updateContact(input)).toBe(true);
    expect(contacts.updateContact).toHaveBeenCalledWith(input);
  });

  it("returns false when the native module returns false", async () => {
    vi.mocked(contacts.updateContact).mockReturnValue(false);

    const input = { identifier: "id-1", firstName: "Alice" };
    expect(await updateContact(input)).toBe(false);
  });
});

describe("getContactDetails includes urlAddresses", () => {
  it("returns urlAddresses when present in the full contact", async () => {
    vi.mocked(contacts.getAllContacts).mockReturnValueOnce([CONTACT_ALICE]);
    vi.mocked(contacts.getContactsByName).mockReturnValueOnce([
      CONTACT_ALICE_FULL,
    ]);

    const result = await getContactDetails("id-alice-001");

    expect(result).not.toBeNull();
    expect(result!.urlAddresses).toEqual(["https://alice.dev"]);
  });

  it("does not request urlAddresses as an extra property", async () => {
    vi.mocked(contacts.getAllContacts).mockReturnValueOnce([CONTACT_ALICE]);
    vi.mocked(contacts.getContactsByName).mockReturnValueOnce([
      CONTACT_ALICE_FULL,
    ]);

    await getContactDetails("id-alice-001");

    const passedExtras = vi.mocked(contacts.getContactsByName).mock.calls[0][1] as string[];
    expect(passedExtras).not.toContain("urlAddresses");
  });
});

describe("deleteContact", () => {
  it("wraps identifier in an object and passes to deleteContact", async () => {
    vi.mocked(contacts.deleteContact).mockReturnValue(true);

    expect(await deleteContact("id-1")).toBe(true);
    expect(contacts.deleteContact).toHaveBeenCalledWith({ identifier: "id-1" });
  });
});

// ===========================================================================
// Bug 1 — get_contact_details: extraProperties must only contain values
// accepted by the native node-mac-contacts module.
//
// The native module's validateContactArg() rejects any extraProperties entry
// not in: jobTitle, departmentName, organizationName, middleName, note,
// contactImage, contactThumbnailImage, instantMessageAddresses, socialProfiles.
//
// "urlAddresses" is NOT a valid extra property — including it causes
// getAllContacts() and getContactsByName() to throw.
// ===========================================================================

describe("Bug 1: getContactDetails only passes valid extra properties", () => {
  /**
   * The set of extra properties the native module actually accepts.
   * If ALL_EXTRA_PROPERTIES in contacts-native.ts contains anything outside
   * this set, the native module will throw a validation error.
   */
  const VALID_EXTRA_PROPERTIES = [
    "jobTitle",
    "departmentName",
    "organizationName",
    "middleName",
    "note",
    "contactImage",
    "contactThumbnailImage",
    "instantMessageAddresses",
    "socialProfiles",
  ];

  it("only passes valid extra properties to getContactsByName (targeted search)", async () => {
    vi.mocked(contacts.getAllContacts).mockReturnValueOnce([CONTACT_ALICE]);
    vi.mocked(contacts.getContactsByName).mockReturnValueOnce([CONTACT_ALICE_FULL]);

    await getContactDetails("id-alice-001");

    const passedExtras = vi.mocked(contacts.getContactsByName).mock.calls[0][1] as string[];
    for (const prop of passedExtras) {
      expect(
        VALID_EXTRA_PROPERTIES,
        `"${prop}" is not a valid extraProperty accepted by node-mac-contacts`,
      ).toContain(prop);
    }
  });

  it("only passes valid extra properties to getAllContacts (fallback full scan)", async () => {
    // Force the fallback path: basic lookup finds Alice, but targeted search misses
    vi.mocked(contacts.getAllContacts).mockReturnValueOnce([CONTACT_ALICE]);
    vi.mocked(contacts.getContactsByName).mockReturnValueOnce([]);
    vi.mocked(contacts.getAllContacts).mockReturnValueOnce([CONTACT_ALICE_FULL]);

    await getContactDetails("id-alice-001");

    // The second getAllContacts call is the fallback with ALL_EXTRA_PROPERTIES
    const fallbackCall = vi.mocked(contacts.getAllContacts).mock.calls[1];
    const passedExtras = fallbackCall[0] as string[];
    for (const prop of passedExtras) {
      expect(
        VALID_EXTRA_PROPERTIES,
        `"${prop}" is not a valid extraProperty accepted by node-mac-contacts`,
      ).toContain(prop);
    }
  });

  it("does not include 'urlAddresses' in extra properties", async () => {
    vi.mocked(contacts.getAllContacts).mockReturnValueOnce([CONTACT_ALICE]);
    vi.mocked(contacts.getContactsByName).mockReturnValueOnce([CONTACT_ALICE_FULL]);

    await getContactDetails("id-alice-001");

    const passedExtras = vi.mocked(contacts.getContactsByName).mock.calls[0][1] as string[];
    expect(
      passedExtras,
      "urlAddresses is not a valid extraProperty — it causes a validation error in node-mac-contacts",
    ).not.toContain("urlAddresses");
  });

  it("reproduces the native module error when urlAddresses is included", async () => {
    // Simulate the actual native module behavior: it throws when given
    // an invalid extra property like "urlAddresses".
    vi.mocked(contacts.getAllContacts).mockReturnValueOnce([CONTACT_ALICE]);
    vi.mocked(contacts.getContactsByName).mockImplementationOnce(
      (_name: string, extraProperties?: string[]) => {
        if (extraProperties?.includes("urlAddresses")) {
          throw new Error(
            "properties in extraProperties must be one of jobTitle, departmentName, " +
            "organizationName, middleName, note, contactImage, contactThumbnailImage, " +
            "instantMessageAddresses, socialProfiles",
          );
        }
        return [CONTACT_ALICE_FULL];
      },
    );

    // Bug is fixed: urlAddresses is no longer in ALL_EXTRA_PROPERTIES,
    // so the native module no longer throws.
    await expect(getContactDetails("id-alice-001")).resolves.not.toThrow();
  });
});

// ===========================================================================
// Bug 2 — update_contact: the MCP handler calls getContactDetails() before
// performing the update.  Because getContactDetails() is broken (Bug 1),
// update_contact always fails before it even attempts to save.
//
// Additionally, even when getContactDetails was working (retest #2), the
// update still didn't persist — the native updateContact() was called but
// changes were not saved.
// ===========================================================================

describe("Bug 2: updateContact is blocked by getContactDetails failure", () => {
  it("updateContact itself works when called directly with valid input", async () => {
    vi.mocked(contacts.updateContact).mockReturnValue(true);

    const input = { identifier: "id-alice-001", nickname: "Ali" };
    const result = await updateContact(input);

    expect(result).toBe(true);
    expect(contacts.updateContact).toHaveBeenCalledWith(input);
  });

  it("updateContact passes all provided fields to native module", async () => {
    vi.mocked(contacts.updateContact).mockReturnValue(true);

    const input = {
      identifier: "id-alice-001",
      nickname: "Ali",
      emailAddresses: ["newalice@example.com"],
      jobTitle: "Senior Engineer",
    };
    const result = await updateContact(input);

    expect(result).toBe(true);
    expect(contacts.updateContact).toHaveBeenCalledWith(input);
  });
});

/**
 * Integration-style tests that exercise the MCP handler logic in index.ts.
 *
 * The update_contact handler (index.ts lines 161–218) calls
 * native.getContactDetails() to fetch the current contact before building
 * the update payload. This means Bug 1 cascades into Bug 2.
 *
 * These tests mock at the native module level and call the same functions
 * that the MCP handler uses, to verify the cascade.
 */
describe("Bug 2: update_contact handler cascade from getContactDetails", () => {
  /**
   * Simulates what the MCP update_contact handler does:
   * 1. Calls getContactDetails to fetch current contact
   * 2. Merges fields
   * 3. Calls updateContact
   *
   * This mirrors index.ts lines 161–218.
   */
  async function simulateUpdateHandler(
    identifier: string,
    fields: Record<string, unknown>,
  ): Promise<{ success: boolean; error?: string }> {
    // Step 1: fetch current contact (same as index.ts line 164)
    const current = await getContactDetails(identifier);
    if (!current) {
      return { success: false, error: "Contact not found" };
    }

    // Step 2: build payload (simplified version of index.ts lines 174–207)
    const updatePayload: Record<string, unknown> & { identifier: string } = { identifier };
    for (const key of [
      "firstName", "lastName", "nickname", "middleName",
      "jobTitle", "departmentName", "organizationName",
    ]) {
      const value = fields[key] ?? (current as unknown as Record<string, unknown>)[key];
      if (value) updatePayload[key] = value;
    }
    const birthday = (fields.birthday ?? current.birthday) as string | undefined;
    if (birthday) updatePayload.birthday = birthday;
    for (const key of ["phoneNumbers", "emailAddresses", "urlAddresses"]) {
      if (fields[key]) {
        updatePayload[key] = fields[key];
      } else if ((current as unknown as Record<string, unknown[]>)[key]?.length) {
        updatePayload[key] = (current as unknown as Record<string, unknown[]>)[key];
      }
    }

    // Step 3: call native update
    const success = await updateContact(updatePayload as Record<string, unknown> & { identifier: string });
    return { success, error: success ? undefined : "Failed to update contact" };
  }

  it("update fails because getContactDetails throws (extraProperties bug cascade)", async () => {
    // Simulate the native module rejecting "urlAddresses" in extra properties
    vi.mocked(contacts.getAllContacts).mockReturnValueOnce([CONTACT_ALICE]);
    vi.mocked(contacts.getContactsByName).mockImplementationOnce(
      (_name: string, extraProperties?: string[]) => {
        if (extraProperties?.includes("urlAddresses")) {
          throw new Error(
            "properties in extraProperties must be one of jobTitle, departmentName, " +
            "organizationName, middleName, note, contactImage, contactThumbnailImage, " +
            "instantMessageAddresses, socialProfiles",
          );
        }
        return [CONTACT_ALICE_FULL];
      },
    );
    vi.mocked(contacts.updateContact).mockReturnValue(true);

    // Bug is fixed: urlAddresses is no longer in ALL_EXTRA_PROPERTIES,
    // so getContactDetails succeeds and the update proceeds.
    const result = await simulateUpdateHandler("id-alice-001", { nickname: "Ali" });
    expect(result.success).toBe(true);
    expect(contacts.updateContact).toHaveBeenCalledTimes(1);
  });

  it("update succeeds when getContactDetails works (expected behavior after fix)", async () => {
    // Simulate a fixed version where getContactDetails returns normally
    vi.mocked(contacts.getAllContacts).mockReturnValueOnce([CONTACT_ALICE]);
    vi.mocked(contacts.getContactsByName).mockReturnValueOnce([CONTACT_ALICE_FULL]);
    vi.mocked(contacts.updateContact).mockReturnValue(true);

    const result = await simulateUpdateHandler("id-alice-001", { nickname: "Ali" });

    expect(result.success).toBe(true);
    expect(contacts.updateContact).toHaveBeenCalledTimes(1);

    // Verify the payload includes the new nickname AND preserves existing fields
    const payload = vi.mocked(contacts.updateContact).mock.calls[0][0] as Record<string, unknown>;
    expect(payload.identifier).toBe("id-alice-001");
    expect(payload.nickname).toBe("Ali");
    expect(payload.firstName).toBe("Alice");
    expect(payload.jobTitle).toBe("Engineer");
  });

  it("update preserves existing email addresses when only nickname is changed", async () => {
    vi.mocked(contacts.getAllContacts).mockReturnValueOnce([CONTACT_ALICE]);
    vi.mocked(contacts.getContactsByName).mockReturnValueOnce([CONTACT_ALICE_FULL]);
    vi.mocked(contacts.updateContact).mockReturnValue(true);

    await simulateUpdateHandler("id-alice-001", { nickname: "Ali" });

    const payload = vi.mocked(contacts.updateContact).mock.calls[0][0] as Record<string, unknown>;
    expect(payload.emailAddresses).toEqual(["alice@example.com"]);
  });

  it("update replaces email addresses when explicitly provided", async () => {
    vi.mocked(contacts.getAllContacts).mockReturnValueOnce([CONTACT_ALICE]);
    vi.mocked(contacts.getContactsByName).mockReturnValueOnce([CONTACT_ALICE_FULL]);
    vi.mocked(contacts.updateContact).mockReturnValue(true);

    await simulateUpdateHandler("id-alice-001", {
      emailAddresses: ["newalice@example.com"],
    });

    const payload = vi.mocked(contacts.updateContact).mock.calls[0][0] as Record<string, unknown>;
    expect(payload.emailAddresses).toEqual(["newalice@example.com"]);
  });

  it("update omits empty birthday to avoid native validation error", async () => {
    const aliceNoBirthday: ContactFull = { ...CONTACT_ALICE_FULL, birthday: "" };
    vi.mocked(contacts.getAllContacts).mockReturnValueOnce([{ ...CONTACT_ALICE, birthday: "" }]);
    vi.mocked(contacts.getContactsByName).mockReturnValueOnce([aliceNoBirthday]);
    vi.mocked(contacts.updateContact).mockReturnValue(true);

    await simulateUpdateHandler("id-alice-001", { nickname: "Ali" });

    const payload = vi.mocked(contacts.updateContact).mock.calls[0][0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("birthday");
  });
});
